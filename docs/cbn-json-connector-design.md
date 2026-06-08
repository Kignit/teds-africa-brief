# CBN JSON connector design brief

Design-only brief for ingesting the Central Bank of Nigeria (CBN) JSON API as a
registered news source (`src.cbn`). It covers endpoint selection, field mapping, ID
strategy, URL absolutization, date parsing, country tagging, fail-loud semantics, the
wiring change, a test plan, and an explicit implement / defer recommendation.

No code is changed by this brief. All API facts below come from live read-only probes
run on 2026-06-08; re-probe before implementing, since the payloads are live.

## Recommendation (summary)

**DEFER implementation for now.** The connector is fully designed and implementation-ready
below, but the probe data shows CBN does not address the dominant bottleneck
(corroboration sparsity) at the current publication cadence:

- In the live 72h rolling window, CBN contributes at most ~1 item (GetAllNews), and 0 from
  PressReleases / MPC. Their latest documents (2026-04-21 and 2026-05-20) are already
  outside the window.
- CBN content is title-only PDF metadata with formal document titles
  ("Communique No.162 of the 305th Meeting ..."), which will not corroborate news-outlet
  headlines ("Nigeria holds rate at ...") without separate event-signature work.

So building it now adds near-dormant surface area that moves neither corroborated-event
nor claim counts in the near term. The higher-leverage work is event-signature matching
(formal-title to news-headline) and window cadence, not source availability.

A **narrow conditional GO** (GetAllNews only) is documented in the Recommendation section
and is cheap to execute if the primary-source-on-policy-days value is wanted regardless.

## Probe evidence (2026-06-08, read-only)

All three endpoints under `https://www.cbn.gov.ng/api/` returned `HTTP 200`,
`application/json; charset=utf-8`, as a flat top-level JSON array with an identical item
schema.

| endpoint                   | items | unique ids | dup ids | date range               |
| -------------------------- | ----- | ---------- | ------- | ------------------------ |
| `/api/GetAllNews`          | 1799  | 1799       | 0       | 2006-08-25 .. 2026-06-05 |
| `/api/GetAllPressReleases` | 303   | 303        | 0       | 2002-02-18 .. 2026-04-21 |
| `/api/GetAllMpc`           | 205   | 205        | 0       | 2004-01-14 .. 2026-05-20 |

Cross-endpoint id overlap (no endpoint is a strict subset of another):

- News and PressReleases share 206 ids; News and MPC share 144; PressReleases and MPC share 6.

In-window relevance vs today (2026-06-08):

| endpoint            | within 3 days | within 30 days |
| ------------------- | ------------- | -------------- |
| GetAllNews          | 1             | 9              |
| GetAllPressReleases | 0             | 0              |
| GetAllMpc           | 0             | 2              |

Item schema (every endpoint):

```
{
  "id": "8114",                       // stable per-document numeric id (string)
  "clickCount": "103",                // volatile view counter
  "refNo": "PSP/DIR/PUB/CIR/001/004", // official reference number
  "title": "Nigeria Payments System Vision 2028",
  "description": "",                  // short descriptor, frequently empty
  "author": "",                       // usually empty
  "keywords": "Payments, Vision, 2028",
  "link": "/Out/2026/CCD/Nigeria Payments System Vision 2028.pdf", // root-relative PDF, has spaces
  "documentDate": "05/06/2026",       // DD/MM/YYYY (day granularity, no time)
  "filesize": "45889394"
}
```

Three properties drive the design:

1. `link` is a root-relative path to a PDF, containing spaces and mixed case. It needs
   base-prefixing and percent-encoding.
2. `documentDate` is `DD/MM/YYYY`. `Date.parse` misreads this as `MM/DD` in V8, so the RSS
   connector's `toIso` (which uses `Date.parse`) is unsafe here and must not be reused.
3. `id` is globally unique per endpoint and stable, so it is the correct dedup key.

## Endpoint selection

If implemented, wire **GetAllNews only** for v1:

- It carries the freshest and broadest content (1 item within 3 days, 9 within 30 days),
  versus 0 for PressReleases and 2 (30-day) for MPC.
- PressReleases and MPC are stale relative to the 72h window and are largely already
  represented in News for recent items.

Defer GetAllMpc and GetAllPressReleases. Add GetAllMpc later only if monetary-policy
communiques specifically need primary-source representation; if so, dedup by document `id`
across endpoints (see ID strategy) because the endpoints overlap.

## Field mapping (CBN item to NewsItem)

| NewsItem field | CBN source                         | transform                                                            |
| -------------- | ---------------------------------- | -------------------------------------------------------------------- |
| `id`           | `id`                               | `` `src.cbn:${id}` `` (dedup key)                                    |
| `sourceId`     | constant                           | `'src.cbn'`                                                          |
| `title`        | `title`                            | `decodeEntities(...).trim()` (defensive; CBN titles are plain text)  |
| `summary`      | `description`, fallback `keywords` | `decodeEntities(...).trim().slice(0, 400)`; empty string allowed     |
| `url`          | `link`                             | absolutize against `https://www.cbn.gov.ng` (see URL absolutization) |
| `publishedAt`  | `documentDate`                     | parse `DD/MM/YYYY` to ISO at UTC midnight; fallback `ctx.now()`      |
| `language`     | constant                           | `'en'`                                                               |
| `countryCodes` | constant (plus optional inference) | `['NG']`, optionally unioned with `inferCountryCodes(title)`         |

Dropped fields: `clickCount` (volatile), `refNo`, `author` (usually empty), `filesize`.
`keywords` is used only as a summary fallback.

Note: ingestion is **title/metadata only**. The connector does not fetch or parse PDF
bodies, so classification and event-signature matching operate on the title alone.

## ID strategy

`` `src.cbn:${id}` ``. The CBN document `id` is unique per endpoint and stable across
fetches, so:

- A document re-fetched on a later run produces the same NewsItem id, which the rolling
  window dedups idempotently (no churn).
- If more than one endpoint is ever wired, the same document appearing in two endpoints
  (e.g. an MPC communique also in News) collapses to one NewsItem rather than
  double-counting.

Do not hash `link` or `title` for the id (both can change); the document `id` is canonical.
All CBN endpoints map to the single source id `src.cbn`, so CBN counts as exactly one
corroborating source regardless of how many endpoints are read.

## URL absolutization

`link` is root-relative with spaces, e.g.
`/Out/2026/CCD/MPC Communique No. 162 May 20 2026_Final.pdf`.

Build the absolute URL with the WHATWG URL parser, which percent-encodes spaces and other
unsafe path characters automatically:

```ts
const ABS = (link: string) => new URL(link, 'https://www.cbn.gov.ng').toString()
// -> https://www.cbn.gov.ng/Out/2026/CCD/MPC%20Communique%20No.%20162%20May%2020%202026_Final.pdf
```

Guard: if `link` is empty or missing, skip the item (do not emit a NewsItem with an empty
or synthetic url). `NewsItem.url` is the provenance link, so an item with no document is
not source-backed and must be dropped, not faked.

## Date parsing (DD/MM/YYYY)

Reusing `toIso` from `rss.ts` would misparse CBN dates. Use an explicit parser:

```ts
function cbnDateToIso(raw: string, fallback: string): string {
  const m = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (!m) return fallback
  const [, dd, mm, yyyy] = m
  const iso = `${yyyy}-${mm}-${dd}T00:00:00.000Z`
  return Number.isNaN(Date.parse(iso)) ? fallback : iso
}
```

Day granularity (midnight UTC) is acceptable: the 72h window is time-based, and CBN docs
are dated by day. The fallback is `ctx.now()`, consistent with the other connectors.

## Country tagging

Hard-tag `['NG']`. CBN is definitionally a Nigerian source, and many documents
(e.g. "Communique No.162 ...") contain no launch-market keyword, so `inferCountryCodes`
alone would leave them untagged and unable to corroborate NG events. Optionally union with
`inferCountryCodes(title)` to pick up cross-border mentions, but the NG tag must always be
present.

## Fail-loud semantics

Mirror `gdelt.ts` / `rss.ts`:

- `if (!res.ok) throw new Error('CBN request failed (src.cbn): HTTP ' + res.status)`.
- `await res.json()` propagates as a connector failure if the body is not JSON (e.g. an
  HTML error page), exactly like the GDELT `res.json()` path. Recorded in diagnostics,
  never a silent empty.
- A 200 returning an empty array is a legitimate empty: return `[]`.
- No retry budget in v1. CBN is a government endpoint, not a shared-IP-throttled
  aggregator, and the probe returned clean 200s. If transient 5xx is observed after merge,
  add a small backoff mirroring GDELT as a follow-up; do not pre-build it.
- If multiple endpoints are ever wired, a failure of any required endpoint throws (a
  partial CBN outage stays visible); they remain one connector under the single `src.cbn`
  id.

## Wiring

1. New file `src/server/connectors/cbn.ts` exporting `fetchCbn(ctx): Promise<NewsItem[]>`
   (single GetAllNews fetch for v1), structured like `fetchGdelt`.
2. `src/server/ingestion/liveConnectors.ts`: add
   `export function cbnConnector(): NewsConnector { return { id: 'src.cbn', run: (ctx) => fetchCbn(ctx) } }`,
   mirroring `gdeltConnector`.
3. `scripts/generateBrief.ts`: add `cbnConnector()` to the `newsConnectors` array alongside
   `gdeltConnector(NEWS_QUERY)`, before `...rssConnectorsFromSources(SOURCES)`.
4. `src/data/sources.ts`: change `src.cbn` `accessMethod` from `'rss'` to `'api'` and
   replace the "No verified public RSS feed found" comment with a note pointing at the JSON
   connector. **Do not add a `feedUrl`** to `src.cbn`: `rssConnectorsFromSources` filters on
   `feedUrl`, so leaving it absent keeps CBN wired exactly once (via `cbnConnector`), never
   double-wired as a phantom RSS feed.

## Test plan (for the implementation lane)

In `src/tests/connectors.test.ts` (or a dedicated `cbn.test.ts`):

- Field mapping: a sample CBN array maps to NewsItems with id `src.cbn:8114`, absolutized
  url, NG tag, and the description-then-keywords summary fallback.
- URL absolutization: a relative link with spaces becomes
  `https://www.cbn.gov.ng/Out/...%20...pdf`.
- Date parsing: `05/06/2026` becomes `2026-06-05T00:00:00.000Z` (proves DD/MM, not MM/DD).
- Empty-link guard: an item with empty `link` is skipped.
- Fail-loud: a non-OK response throws `CBN request failed (src.cbn): HTTP 503`; a 200 with
  an empty array returns `[]`.
- (If multi-endpoint later) dedup: the same `id` from two endpoints collapses to one item.

## Recommendation (detail)

**Primary: DEFER.** Grounds:

1. It does not move the dominant bottleneck. Corroboration sparsity is the binding
   constraint, and CBN adds ~0-1 items per 72h window at current cadence, so corroborated
   events and claims would not change in the near term.
2. Title-only formal PDF titles will not corroborate news-outlet headlines without
   event-signature work, so CBN would add single-source primary events, not claims.
3. The trust posture favors not shipping near-dormant connector + registry + test surface
   area for sporadic yield.

**Alternative: narrow conditional GO (GetAllNews only).** Defensible if the value of an
authoritative NG primary source on policy-event days is wanted regardless of near-term
claim yield. It is small (one fetch, fail-loud, the field mapping above) and clean (the API
is well-behaved). Accept explicitly that it will not move claim-yield until the triggers
below are met.

**Triggers that flip DEFER to GO:**

- Event-signature matching is extended so a CBN document title can corroborate news-outlet
  coverage of the same event (the actual unlock for CBN's primary documents).
- The rolling window is widened or a policy event (MPC meeting, major circular) makes a
  fresh CBN document timely and worth capturing as primary backing.
- A specific brief requirement calls for CBN primary documents to appear as evidence even
  while uncorroborated.

## Out of scope / non-goals

- PDF body extraction (only title/metadata is ingested).
- GetAllMpc and GetAllPressReleases endpoints in v1.
- Any retry/backoff budget for CBN in v1.
- Event-signature or corroboration changes (separate, higher-leverage lane).
- Any change to the publish gate, classifier, scoring, methodology, or artifact.

## Open questions / risks

- Will a recent MPC communique title ever corroborate news coverage of the same decision
  under the current signature matcher? Likely not without signature work; this is the main
  thing that gates CBN's claim-yield value.
- Day-granular `documentDate` interacts with the time-based 72h window at the edges (a
  document dated "today" is treated as 00:00 UTC). Acceptable, but noted.
- CBN payload size (GetAllNews ~950KB per fetch) is downloaded every run; fine at current
  scale, but a future `maxrecords`-style trim or date filter could reduce it if needed.
