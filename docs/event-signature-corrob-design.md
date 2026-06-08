# Event-signature and corroboration matching: audit and design

Read-only audit of why the live brief reaches 366 events / 2 corroborated / 0 claims, and
a design for a safe matching upgrade that bridges semantically-different titles
(press-to-press, and formal-primary-source-to-press) without fabricating equivalence.

No code is changed by this brief. All numbers come from reading the committed artifact
(`public/brief.json`, generatedAt 2026-06-08T07:13Z), the rolling window
(`data/news-window.json`, 375 items), and the verification/analysis modules. Figures
labelled "candidate rule" come from replaying the matching logic offline over that window;
they are illustrative of operating points, not approved thresholds.

## 1. The news-to-claim funnel (how it works today)

```
connectors -> NewsItem[] -> dedupe + registry filter -> mergeNewsWindow (72h)
  -> corroborateEvents(sameEvent)            // groups items into Events; >=2 independent
                                             // registered sources => 'corroborated'
  -> classifyEvent                           // keyword shock type, else 'unclassified'
  -> generateCausalLinks                     // CORROBORATED events only; per-country effects
  -> scoreCountryImpact                      // tone/channels/confidence + evidence refs
  -> claimsFromLinks                         // one Claim per effect (verified iff corroborated)
  -> runPublishGate                          // approved methodology, canonical text, grounding
```

Three gates matter for claim yield, in order:

1. **Corroboration** (`corroborateEvents` -> event `status`). `generateCausalLinks` skips
   every event whose status is not `corroborated` (`generateCausalLinks.ts` line 43), and
   the publish gate independently rejects any verified claim that cites a `single_source`
   event (`single_source_verified_claim`). So a claim is impossible without a corroborated
   event. This is the first and currently binding gate.
2. **Classification** (`classifyEvent`). A corroborated event that classifies as
   `unclassified` produces no causal link.
3. **Publish gate** (`runPublishGate`). The claim's shock must map to an APPROVED causal
   methodology, the country must resolve to a carried profile, the channels must be
   licensed by that methodology, and for non-global shocks a cited corroborated event must
   name the country.

## 2. Why the live artifact is 366 / 2 / 0

### 2.1 Corroboration is the binding constraint (2 of 366)

`sameEvent` (`eventSignature.ts`) merges two reports only if ALL pass: country-compatible,
within a 3-day window, `sharedSignificantTokens >= 3`, and `jaccard >= 0.34`, where tokens
are taken from `title + " " + summary`. The Jaccard floor is precision-first by design (a
false merge manufactures fake corroboration). In practice it is also the reason almost
nothing corroborates: of cross-source, country-compatible, in-window event pairs,
**1,516 share 3 or more significant tokens yet are rejected purely because jaccard < 0.34**
(447 share >= 4 tokens, 127 share >= 5). Many of those are genuine same-events.

### 2.2 The two events that DO corroborate are not macro shocks

| corroborated event                                              | country | sources                         | classifies as |
| --------------------------------------------------------------- | ------- | ------------------------------- | ------------- |
| "EXIM Frozen Foods Association opposes ... Smart Port Note ..." | GH      | myjoyonline_gh, bft_gh          | unclassified  |
| "Nature has been sending us signals. Our Farmers read them ..." | NG      | businessday_ng, nairametrics_ng | unclassified  |

Both are incidental syndication (two outlets running near-identical copy), not policy / FX /
oil events. They classify as `unclassified`, so even with corroboration they yield no
claim. The matcher, as tuned, happens to catch wire-copy duplicates rather than macro
events reported in independent words.

### 2.3 The downstream gates are NOT the blocker

This is the key finding for prioritisation. After corroboration, the rest of the funnel is
ready:

- **All nine real causal methodologies are `approved`** (within `CAUSAL_METHODOLOGIES`, the
  `causalRule` factory defaults to `status: 'approved'`; only the `unclassified` causal rule
  is draft. The separate `DEBT_EXPOSURE_BANDING_V1` banding methodology remains draft in its
  own right - see 2.4). So `oil_shock`, `dollar_rates_shock`, `inflation_shock`,
  `policy_rate_decision`, `fx_move`, `debt_fiscal_event`, `trade_integration_event`,
  `deal_investment_event`, `political_stability_event` are all claim-eligible at the
  methodology gate.
- **The five country profiles (NG/KE/ET/GH/ZA) are carried and verified**, and
  `scoreCountryImpact` pushes an effect unconditionally for most shocks (e.g.
  `policy_rate_decision`, `inflation_shock`, `deal_investment_event`).
- **Channels emitted by `scoreCountryImpact` are subsets of each methodology's licensed
  channels**, so the gate's channel check passes.

Concrete proof that matching is the lever: the Ghana T-bill auction pair
("T-bills auction: Government exceeds target ... interest rates surge" / "T-Bill Auction
Oversubscribed as 91-Day Bill Clears at 5.01%", both GH, independent sources) is currently
two separate single-source events. If matched, it classifies as `policy_rate_decision`,
scores a GH effect, cites the approved causal rule, resolves to the GH profile, and the
event names GH -> a publishable claim. It is lost only to `jaccard 0.16`. The same is true
of the Ghana London investment roadshow pair, which would classify as
`deal_investment_event`.

### 2.4 Secondary factors (real, but not the binding constraint)

- **GDELT contributed 0 items to this window** - corroboration currently rests entirely on
  18 RSS feeds. More independent feeds (or GDELT actually returning taggable items) widen
  the pool, but only if the matcher can pair them.
- **Independence collapses GDELT to one source.** All GDELT articles share `src.gdelt`, so
  a GDELT-only cluster is `single_source` no matter how many outlets it aggregates.
  Corroboration needs >= 2 distinct REGISTERED source ids.
- **`primarySourceIds` is unwired** (the sample event shows `primarySourceCount: 0`); the
  data model supports primary-source weighting but the pipeline does not pass it.
- **Only `fx.*` figures exist** (no `commodity.brent` / `fred.*`, keys absent). This does
  NOT block causal claims (a causal claim is backed by its event; `hasBacking` is satisfied
  by `eventIds`), but it means oil/dollar claims carry no figure evidence.
- **`dollar_rates_shock` is the one shock still gated downstream**: `scoreCountryImpact`
  needs `profile.dollarDebtExposure`, whose banding methodology
  (`DEBT_EXPOSURE_BANDING_V1`) is `draft`, so no label is emitted and no effect is scored.
  Approving that banding is a separate lane.

## 3. Why titles fail to match (failure modes)

| #   | failure mode                       | evidence from the live window                                                                                                                                                                                   |
| --- | ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1  | summary boilerplate dilution       | Identical titles "Yango Group hosts Innovation Day 2026 in Abidjan" (bft_gh, myjoyonline_gh) fail because RSS summary tails ("The post ... appeared first on ...", "read more ...") differ, dropping jaccard.   |
| F2  | Jaccard length-asymmetry penalty   | Ghana London roadshow: 16 shared tokens, jaccard 0.28. Mining-license scrutiny: 13 shared, jaccard 0.26. Genuine pairs whose union is large relative to the intersection.                                       |
| F3  | generic-vocabulary false overlap   | "CBN's new FX manual ..." vs "CBN to fine banks N100m ..." share cbn/central/exchange/foreign/market/nigeria via their SUMMARIES (overlap 0.39) but are DIFFERENT events. Naive threshold-lowering merges them. |
| F4  | morphological token splits         | Mining pair: "Renewals" vs "renewal", "licenses" vs "Lease" never token-match, so the title-level signal is lost without stemming.                                                                              |
| F5  | formal-primary vs colloquial-press | A CBN MPC communique titled "Communique No.162 of the 305th Meeting ..." shares ~0 tokens with "Nigeria holds rate at 27.5%". No token metric can bridge these.                                                 |

### The decisive lever: compare titles, not title+summary

Replaying the matcher over the window with TITLE-only tokens collapses the candidate set
from 4,149 cross-source pairs (title+summary, shared >= 2) to **15** (title-only,
shared >= 3), and cleanly separates true from false:

- The false CBN manual/fine pair drops to `shared 1, jaccard 0.07, overlap 0.12` - the
  generic vocabulary that fooled title+summary lived in the summaries.
- Genuine pairs sit at overlap 0.5 to 1.0.

A precision-first candidate rule `[sharedTitle >= 4 AND overlapCoefficient >= 0.5 AND
sharedAnchors >= 2]` produced **3 new corroborations, all genuine**:

| pair                                                     | shared | jac  | ovl  | anchors           | becomes                                           |
| -------------------------------------------------------- | ------ | ---- | ---- | ----------------- | ------------------------------------------------- |
| Yango Innovation Day (identical titles)                  | 7      | 1.00 | 1.00 | 2026/abidjan/..   | corroborated (unclassified)                       |
| OPEC+ July output raise (nairametrics_ng x capitalfm_ke) | 4      | 0.29 | 0.57 | opec/july         | corroborated (unclassified\*)                     |
| Ghana London investment roadshow (GH x GH)               | 6      | 0.33 | 0.55 | governor/minister | corroborated -> **CLAIM** (deal_investment_event) |

(\* OPEC+ "raise output" is correctly NOT an oil-price move under the current oil semantics,
so it stays unclassified; it still becomes corroborated evidence.) Relaxing the anchor
guard to `>= 1` also recovers the MTN billing pair (overlap 0.67); light stemming would
recover the mining and T-bill pairs. The false CBN pair stays apart under every variant.

So a precision-first upgrade newly corroborates ~3-4 events in this one window and produces
about one new publishable claim, with the false pair correctly rejected - and the yield
grows with feed diversity and as the 72h window accumulates.

## 4. Design: a safe, layered matching upgrade

### 4.0 Principles

1. Precision over recall: a false merge fabricates corroboration (fake trust). When in
   doubt, stay apart. (Unchanged doctrine.)
2. No fabricated equivalence: a merge only unions real source-backed items; it never
   invents a source or a relationship.
3. Hard guards always: every acceptance path sits behind the same universal hard guards
   (4.1); the shock-type semantic guard is then applied per path.
4. Deterministic and inspectable: keyword/token/percentage rules only, no model.
5. Shadow-validate before activating: log would-be merges with zero behaviour change,
   human-review a sample, ship behind tests with labelled fixtures.

### 4.1 Guards: universal hard guards, plus one semantic guard

Universal hard guards - every acceptance path (A, B, and C) must pass ALL of these:

| guard                   | rule                                                                                                                                              | notes                                                   |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| independent source      | corroboration status is counted over distinct `organisationOf(sourceId)`; same-source merges may cluster evidence but cannot create corroboration | unchanged; gate re-checks `independentSourceCount >= 2` |
| country compatibility   | not `disjointCountries` (shared country, or at least one side untagged)                                                                           | unchanged                                               |
| temporal window         | `abs(publishedAt_a - publishedAt_b) <= windowMs` (3 days)                                                                                         | unchanged                                               |
| provenance preservation | merged event carries the union of real `newsItemIds` + `sourceIds`; counts recomputed from them                                                   | unchanged (already true)                                |
| publish-gate supremacy  | the publish gate independently re-checks `independentSourceCount >= 2` and registry membership                                                    | unchanged                                               |

Semantic guard - applied PER PATH, not universal:

- **shock-type compatibility** - both reports classify to the SAME non-`unclassified` shock.
  **Mandatory for Path C** (it is the semantic bridge there). **Optional / calibrated for
  Path B** (an extra precision booster, switched on only if shadow review shows false
  merges). **Not applied to Path A** (a symmetric token match needs no semantic gate).

Relaxed-path eligibility - Path B and Path C additionally require cross-org eligibility
before accepting a relaxed bridge: the two reports must be from distinct
`organisationOf(sourceId)`, so a relaxed match can only ADD an independent source, never
manufacture corroboration from same-source items. Path A is unchanged - it still clusters
same-source items exactly as today, and a cluster reaches `corroborated` status only when it
holds `independentSourceCount >= 2`.

The provenance-preservation and publish-gate-supremacy guards are why an over-merge cannot
manufacture a source: the worst case of a bad merge is two genuinely-distinct events
labelled one corroborated event (a content error, caught by precision guards + shadow
review), never a fabricated source.

### 4.2 Signature normalization (the foundational fix, lowest risk)

- **Title-primary tokenization.** Treat the title as the event signature. This is the
  single biggest precision+recall win (4,149 -> 15 candidates; false CBN pair eliminated).
- **Boilerplate stripping.** Before any summary tokens are used, strip known RSS tails:
  `the post ... appeared first on ...`, `read more`, `appeared first on ...`, trailing
  source-name suffixes. (Fixes F1.)
- **Light stemming.** Collapse simple plural/possessive variants (`renewals`->`renewal`,
  `licenses`->`license`, trailing `'s`). Conservative, deterministic; recovers F4.
- **Anchor extraction.** Mark tokens that are acronyms (`CBN`, `MTN`, `BoG`, `MPC`),
  non-sentence-initial capitalized proper nouns, or multi-digit numbers/percentages. Anchors
  are the entities/quantities that make two reports about the SAME specific occurrence.

### 4.3 Acceptance paths (all behind the universal hard guards in 4.1)

- **Path A (symmetric, unchanged).** `sharedSig >= 3 AND jaccard >= 0.34` on the normalized
  signature. No semantic guard. Preserves current behaviour for symmetric pairs - no
  regression.
- **Path B (asymmetric bridge, NEW; cross-org only).** For length-mismatched pairs (press
  headline vs longer headline, or short vs long): accept if
  `sharedTitle >= 4 AND overlapCoefficient >= 0.5 AND sharedAnchors >= K`. The overlap
  coefficient (`intersection / min(|A|,|B|)`) is length-robust, fixing F2; the anchor floor
  protects precision against F3. `K` is the key calibration knob: `K = 2` is strict (the 3
  matches above); `K = 1` additionally catches MTN-style pairs that share one strong anchor.
  Recommend starting at `K = 2` and relaxing only after shadow review. The shock-type
  compatibility guard is OPTIONAL on this path - a calibrated precision booster, enabled only
  if shadow review shows false merges.
- **Path C (formal-primary bridge, NEW; Phase 2; for the CBN connector).** Token methods
  cannot bridge F5, so this path does not rely on token similarity. Accept a primary-source
  report and a press report as the same event iff: same shock-type (the semantic guard,
  MANDATORY on this path), same country, within window, AND they share >= 1 anchor (a named
  entity or a number, e.g. the central-bank name, a rate value, a meeting number) - all
  behind the universal hard guards. This uses the existing deterministic classifier as the
  semantic bridge and keeps a hard entity/number anchor so co-classified but unrelated items
  (two different `policy_rate_decision` stories) do not merge on shock type alone. Most
  conservative path; ship last, with the CBN connector and its own fixtures.

### 4.4 What stays single_source on purpose

Precision is preserved for: topically-related-but-distinct events (CBN manual vs CBN fine -
different actions, low title overlap, fails Path B); cross-country stories (country guard);
out-of-window reports (temporal guard); and co-classified but entity-disjoint items (Path C
anchor guard). These SHOULD remain apart, and the design keeps them apart.

## 5. The hard-guard checklist (explicit, per scope)

- **Independent source IDs:** the gate and corroboration status require
  `independentSourceCount >= 2`; same-source merges may cluster evidence but cannot create
  corroboration, and relaxed bridges (Path B/C) must add a distinct organisation.
- **Country compatibility:** `disjointCountries` guard on every path. (Universal.)
- **Temporal window:** 3-day window guard on every path. (Universal.)
- **Shock-type compatibility:** a SEMANTIC guard, not universal - MANDATORY for Path C (the
  formal-primary bridge), OPTIONAL / calibrated for Path B, not used on Path A. Ensures only
  same-kind events bridge.
- **Provenance-preserving evidence:** a merge unions real `newsItemIds`/`sourceIds` only;
  no synthesized source; the published artifact still carries every originating item id.
  (Universal.)
- **No claim without publish-gate support:** this design changes only which items cluster.
  The full gate stays in force - a claim still needs a corroborated event, an approved
  causal methodology, canonical re-derivable text, a carried profile, licensed channels, and
  (non-global shocks) an event that names the country. No path can produce a gate-bypassing
  claim. (Universal.)

## 6. Risks and validation methodology

- **Primary risk: false merges.** Mitigations: title-primary + anchor guards (shown to
  reject the known false pair), cross-org requirement, the shock-type semantic guard on the
  relaxed/primary paths, precision-first thresholds.
- **Shadow mode before activation.** Implement the new paths to LOG would-be merges
  (event pairs, scores, the resulting status change) without changing the emitted events.
  Run across several daily cycles, human-review a sample, measure the new-corroboration
  count and estimated false-merge rate, then activate.
- **Labelled fixtures in tests.** Encode the worked pairs above (true: Yango, OPEC+, Ghana
  roadshow, MTN; false: CBN manual/fine) as fixtures so any threshold change is regression-
  guarded.
- **Staged rollout.** (1) signature normalization (title-primary + boilerplate + stemming);
  (2) Path B overlap bridge + anchors; (3) Path C primary bridge with the CBN connector.
  Each is independently revertible (a matcher-only change; revert restores prior clustering).
- **Calibration is data-dependent.** All numeric thresholds (`0.5`, `K`, stemming rules)
  must be tuned against a labelled sample of the live window in the implementation lane, not
  fixed by this brief.

## 7. Recommended sequencing (each a separate, approved lane)

1. **`feat/signature-normalization`** - title-primary tokenization, RSS boilerplate
   stripping, light stemming, anchor extraction; Path A only. Biggest precision+recall win
   at the lowest risk; eliminates the F1/F3/F4 failure modes and shrinks the candidate set
   ~280x. Recommended first.
2. **`feat/overlap-bridge-matching`** - Path B (overlap coefficient + anchor guard,
   cross-org), behind shadow-mode logging and fixtures.
3. **`feat/primary-source-bridge`** - Path C (shock-type + anchor bridge), paired with the
   CBN connector lane.
4. Out-of-band but related: approve `DEBT_EXPOSURE_BANDING_V1` to unlock
   `dollar_rates_shock` claims; consider wiring `primarySourceIds`. Separate methodology /
   pipeline lanes, not matching.

## 8. Non-goals (this lane)

- No code changes; this is a design brief only.
- No CBN connector implementation (Path C is specified for a later lane).
- No classifier, publish-gate, scoring, or methodology changes.
- No artifact edits or regeneration.
- No thresholds committed to code - numbers here are illustrative operating points pending
  calibration in an implementation lane.
