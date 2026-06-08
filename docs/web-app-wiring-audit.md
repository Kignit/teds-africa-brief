# Web app wiring audit

Read-only audit of how the current web UI is wired to real artifact data, and what a
mobile-first web / PWA build needs. Baseline is the CURRENT repo UI (`src/main.tsx`,
`src/app/*`, `src/components/*`); no separate design/prototype was provided, so screens are
described only from code - if a design is supplied later, reconcile against this as a
follow-up input. No implementation, no native iOS, no fake data, no backend/schema change,
no artifact edits. All file facts are from reading the repo at this branch's base.

## 1. Stack and entry flow

- React 19 + Vite 8 (TS), Vitest + Testing Library (jsdom). No router, no state library, no
  PWA plugin. Build: `tsc -b && vite build`; deployed as a static site (Vercel, `vercel.json`).
- `index.html` -> `src/main.tsx` -> `createRoot(#root)`.
- `main.tsx` renders `<App />` (empty state) IMMEDIATELY, then `await loadBrief()`; only if a
  gate-passed brief returns does it re-render `<App brief={brief} />`. The browser never runs
  connectors or the pipeline - it re-validates an already-produced artifact.
- `src/app/briefSource.ts#loadBrief`: fetch `/brief.json` -> envelope must be an object with a
  valid `generatedAt` that is <= 36h old -> `isBriefShape` strict structural check -> re-run
  `runPublishGate(brief, { knownSourceIds })`. Any failure (404, parse error, stale, malformed,
  `brief: null`, gate fail) returns `null` -> empty state.

## 2. UI surface inventory (current)

All surfaces live in one screen (`App.tsx`); each binds directly to `BriefDraft` fields.

| surface          | data source                                               | status                                            |
| ---------------- | --------------------------------------------------------- | ------------------------------------------------- |
| Status banner    | `brief.status` (`published`/`draft`) or null              | wired                                             |
| Header           | static title/kicker/subtitle                              | static copy (not data)                            |
| Verified figures | `brief.figures` via `FigureCard` (+ `ProvenanceLine`)     | wired, with provenance                            |
| Events           | `brief.events` filtered to `status === 'corroborated'`    | wired                                             |
| Watchlist        | `brief.events` filtered to non-corroborated               | wired, labelled "not intelligence"                |
| Claims           | `brief.claims` filtered to `verified`, + claim provenance | wired, with provenance                            |
| Empty state      | shown when `brief` is null                                | wired                                             |
| `brief.profiles` | -                                                         | **carried but NOT rendered**                      |
| `brief.sections` | -                                                         | **carried but NOT rendered** (claims render flat) |
| `generatedAt`    | used for staleness in `loadBrief`, then dropped           | **not surfaced to the UI**                        |

## 3. Mock / static / fallback data: NONE

There is no mock, sample, fixture, or fallback product data in the runtime. The app renders
strictly from the `BriefDraft` returned by `loadBrief`; with no brief it shows the empty
state, never placeholder figures/events/claims (the header copy explicitly says so, and the
existing smoke test asserts no `NGN|Brent|Eurobond|Oil jumps` text appears without a brief).
The only "static" strings are the title, kicker, subtitle, and state copy - presentation
chrome, not data. **So "remove mock/fake data" is already satisfied; there is nothing to
strip.** The wiring task is surfacing carried data and hardening states, not de-mocking.

## 4. Data adapter shape (proposed)

Today `App.tsx` does resolution inline (filters events/claims, builds claim provenance via
`claimProvenance`, resolves ids to names via `sourceName`). A mobile-first build should
centralize this in a PURE view-model adapter - a re-projection of carried data only, with no
fetching and no invention (same discipline as the current inline logic). Two pieces:

1. `loadBrief` should also surface `generatedAt` (it already parses it for the freshness
   check, then discards it). Return `{ brief, generatedAt } | null` so the UI can show
   "Updated <relative time>". This uses EXISTING data - not a backend change.
2. A `toBriefView(brief, generatedAt)` adapter returning, roughly:

```
BriefView {
  updatedAt: string            // from generatedAt
  date: string; edition; status
  figures: VerifiedFigure[]
  events: Event[]              // status === 'corroborated'
  watchlist: Event[]           // non-corroborated (raw evidence, labelled)
  claims: {                    // verified only
    id, text, countryCode?, shockType?,
    provenance: { eventTitles: string[]; sourceNames: string[]; methodologyNames: string[] }
  }[]
  profiles: {                  // NEW surface (see section 7)
    code, name,
    labels: { field, value, provenance: { sourceNames: string[]; asOf: string; methodologyName?: string } }[]
  }[]
  sections?: { kicker, title, body, claimIds }[]  // only if the design uses section grouping
}
```

The adapter must keep the existing provenance rules (section 6) and never fabricate fields.

## 5. Routes, loading, error, empty, stale states

The app is a daily digest; a single primary brief view fits mobile, with progressive
disclosure (expandable provenance, a country sheet) preferred over hard routes initially. If
the later design needs multiple screens (claim detail, country detail, methodology explainer),
use hash/path routing with the brief as the index route; reconcile then.

State machine to define explicitly (current behaviour in parentheses):

| state   | trigger                                 | current behaviour                             | recommended                                                                        |
| ------- | --------------------------------------- | --------------------------------------------- | ---------------------------------------------------------------------------------- |
| loading | `loadBrief` in flight                   | shows the EMPTY state (can read as "no data") | distinct loading affordance so the empty copy is not a flash                       |
| loaded  | gate-passed brief                       | renders surfaces                              | unchanged                                                                          |
| empty   | no artifact / `brief: null`             | empty-state card                              | unchanged (correct)                                                                |
| stale   | `generatedAt` > 36h                     | collapses to empty                            | keep (never show stale as current); optional subtle "no current brief" copy        |
| error   | fetch/parse error, gate fail, malformed | collapses to empty (all errors swallowed)     | keep fail-closed; optionally a retry affordance that NEVER renders unverified data |

Key trust property to preserve: every non-loaded outcome collapses to "show nothing", never
to partial or stale-as-current data. Any added retry/error UI must not weaken that.

## 6. Provenance rendering requirements

Already present and provenance-faithful; codify as requirements:

- Figures: `ProvenanceLine` shows "N source(s) · as of <date>", and "Cross-checked across N
  sources" ONLY when `crossChecked` (>= 2 sources). Never claim cross-checked otherwise.
- Claims: resolve `eventIds` -> event titles, `eventIds`/`profileSourceIds` -> source NAMES
  (via `sourceName`), `methodologyIds` -> methodology names (fall back to id). Omit any empty
  category. Built only from data the brief carries; nothing invented or labelled
  "cross-checked" without a real corroboration/source count.
- Events: show `status` + `independentSourceCount` (singular/plural correct).
- Methodologies: render the carried name; a claim must cite an approved methodology (the gate
  already enforces this - the UI just displays it).
- Text safety: rendered titles/summaries/claim text must contain NO literal decodable HTML
  entities (`&amp;`, `&#8217;`, `&#x2019;`). The artifact is decoded at ingestion; the UI must
  assert this (section 9) so a decoder regression is caught at the view layer too.

## 7. Carried-but-unrendered data (UI surfaces to add - NO backend change)

These already exist in `public/brief.json` and need only rendering:

- **Country profiles (`brief.profiles`)** - the 5 markets carry `oilStance`,
  `dollarDebtExposure`, `externalDebtPctGni`, `petroleumTrade`, `keyExports`, etc., each with
  per-field `evidence` (sourceIds, asOf, methodologyId for derived labels). None is rendered
  today. A mobile-first brief should surface a country/profile view (e.g. oilStance label per
  market with its methodology + source provenance). Derived labels MUST show their methodology
  (mirror the gate's rule); raw fields show their source.
- **Sections (`brief.sections`)** - the artifact carries an analysis section (kicker/title/
  body + `claimIds`); the UI renders a flat claims list. If the design groups/titles claims by
  section, wire it; otherwise document that flat rendering is intentional.
- **`generatedAt`** - surface as "Updated <time>" (see section 4).
- **Event `occurredAt` / `countryCodes` / `topic`** and **claim `countryCode` / `shockType` /
  `tone` / `channels`** - carried structured fields that can drive dates, country chips, and
  grouping/iconography. Optional, all present.

## 8. Missing artifact field for a sourced UI need (candidate backend change)

One plausible UI need is NOT met by current artifact data:

- **Outbound source-article URLs.** Events carry `corroboration.sourceIds` + `newsItemIds`,
  and the UI resolves source NAMES, but the public artifact carries no article URLs - the
  `NewsItem` records (which hold `.url`) live in `data/news-window.json`, which is deliberately
  never served or client-imported. So a "tap a source to read the original article" affordance
  is impossible with today's artifact. Surfacing it would require carrying real, source-backed
  article URLs into `brief.json` (e.g. on each event's corroboration). This is the ONLY
  identified change that touches the artifact/schema, so per scope it is flagged as a
  candidate, not a decision. Trust caveat: any URL shown must be the genuine ingested
  source URL (no fabricated/derived links), and adding it grows the served artifact.

Everything else a brief UI plausibly needs (figures, events, corroborated/verified gating,
provenance names, methodologies, profiles, freshness) is already in the artifact.

## 9. Acceptance tests (for a wired mobile web app)

Extend the existing `app.smoke.test.tsx` suite (which already covers: empty state with no
brief; only-verified claims; corroborated-vs-watchlist segregation; claim event/source/
methodology provenance). Add:

- Loader (`briefSource`) units with injected `now`/`fetch`: 404 -> null; non-object envelope
  -> null; missing/invalid `generatedAt` -> null; **stale (> 36h) -> null**; malformed brief
  (fails `isBriefShape`) -> null; **gate-fail brief -> null**; happy path -> brief (+ exposes
  `generatedAt` once plumbed).
- Provenance faithfulness: no "Cross-checked" rendered for a 1-source figure/claim; present
  for >= 2.
- No-mock-leakage: with no brief, container renders none of the artifact's metric/event text.
- Entity safety: rendered text matches none of `/&amp;|&#\d+;|&#x[0-9a-f]+;/i`.
- Loading state distinct from empty (once added).
- Profiles surface: renders each market's oilStance with methodology + source provenance
  (once added); a derived label with no methodology is never shown.
- Mobile/a11y: every section keeps an `aria-label` (regions already labelled); viewport meta
  present; tap targets and safe-area insets audited.
- PWA (if added, section 10): manifest reachable + valid; offline shell serves; a cached
  brief still honors the 36h freshness rule (never renders stale-as-current offline).

## 10. PWA and mobile-first requirements (currently absent)

The target is mobile-first web / PWA; today the app is mobile-FRIENDLY but not a PWA:

- `index.html` has a viewport meta but no `theme-color`, no `description`, no
  `apple-mobile-web-app-*`, no manifest link. `public/` holds only `brief.json` - no
  `manifest.webmanifest`, no icons (192/512/maskable/apple-touch), no service worker. No
  `vite-plugin-pwa`.
- To be installable/offline-capable: add a web manifest + icon set, a service worker (app-shell
  precache + a brief.json strategy), and the meta tags. Offline strategy MUST respect the 36h
  freshness rule - a cached brief is still subject to the staleness gate, so offline must show
  the empty state rather than stale-as-current beyond policy.
- Layout: inline styles, one centered column (max-width 760), one fluid grid; no media queries,
  no safe-area insets, tap targets unaudited. "Mobile-friendly, not yet mobile-optimized."

## 11. Non-goals (this lane)

- No implementation - design/audit only.
- No native iOS.
- No fake/demo data (and none exists to begin with).
- No backend/schema change unless a sourced UI need proves it (only candidate: source URLs,
  section 8 - flagged, not done).
- No artifact edits or regeneration.

## 12. Recommended sequencing (future lanes, each separately approved)

1. `feat/web-loader-surface-generatedAt` - plumb `generatedAt` through `loadBrief` + show
   "Updated <time>"; add the loading-vs-empty distinction. Smallest, pure-UI, highest clarity
   win.
2. `feat/web-profiles-surface` - render `brief.profiles` (oilStance + provenance) as a
   country view; uses existing artifact data.
3. `feat/web-pwa-shell` - manifest + icons + service worker with a freshness-respecting
   offline strategy.
4. `feat/web-mobile-polish` - media queries, safe-area, tap targets, typography.
5. (Only if approved) `feat/artifact-source-urls` - carry real source-article URLs into the
   artifact to enable source links (section 8); a sourced-UI backend change.
6. Reconcile against a supplied design/prototype if/when one is provided.
