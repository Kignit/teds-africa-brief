# oilStance methodology - design brief (v0.3)

Status: design only. Not approved, not implemented, no runtime labels emitted.
Implementation and methodology approval are later, separately approved tasks.

Revision note (v0.3): corrected the connector reality (Comtrade exposes no HS-27 totals;
OEC computes petroleum but it is never carried into profiles); tightened evidence to
same-source and same `refYear`; removed reliance on OEC's `max(ex.year, im.year)` as a
valid input; "missing is not zero"; added a minimum-denominator / neutral-fallback guard.

## 0. Guardrails and hard rules

Design only: no runtime labels, no approval, no implementation; no classifier /
trade-scope / corroboration / scoring / publish-gate changes. Non-negotiable:

- Never infer stance from top-product presence (`keyExports` membership). Signed values only.
- `oilStance` ships `draft`: no label is emitted until a human explicitly approves it.
- Missing or uncontracted `petroleumTrade` => omit `oilStance` (fail-closed).

## 1. Objective and honest readiness

Derive `oilStance` in `{exporter, importer, neutral}` so the already-wired `oil_shock`
path lights up: `scoreCountryImpact('oil_shock')` already does `if (!profile.oilStance) break`
then branches exporter / importer / neutral, so no scoring change is needed - supplying
`oilStance` is the unlock. But the input is not wired yet (see section 3): the consumption
point is ready; capturing signed petroleum trade is future connector work.

## 2. Anti-pattern explicitly rejected

"Petroleum (HS-27) appears in `keyExports` / top products, therefore exporter" is wrong:
presence is not net position (refiners / re-exporters; petroleum can sit in top exports
while the country is a net importer); top-product lists are truncated `topN`; the import
side is ignored. Use signed net petroleum trade from values.

## 3. Current code state - what does NOT exist yet

- Comtrade: `fetchComtradeTopProducts` returns only the top `AG2` product descriptions
  (for `keyExports` / `importDependence`). It does not expose petroleum totals. A future
  implementation needs a dedicated Comtrade HS-27 totals function returning the chapter-27
  export value and import value (e.g. a `cmdCode=27` query reading `primaryValue` for flow
  `X` and `M`).
- OEC: `fetchOecTrade` already computes raw `OecPetroleum { exportValue, importValue,
productCodes, refYear, asOf }` (HS chapter 27), but `countryProfile.ts` discards it:
  `buildProfile` consumes `oec.exports` / `oec.imports` for trade labels and never carries
  `oec.petroleum` onto the profile. A future implementation must attach it as a raw sourced
  field only after the contract rules below exist.
- OEC year caveat: `fetchOecTrade` derives `petYear = max(ex.year, im.year)` and may pair an
  export value from one year with an import value from another. That must not be used as-is
  for methodology input (see section 4).

## 4. Raw sourced input - new field `petroleumTrade`

A raw, sourced field (published numbers, like `externalDebtPctGni`), separate from the
derived label:

```
petroleumTrade: { exportValueUsd: number, importValueUsd: number, refYear: number }
```

- HS scope: HS chapter 27 (exact product set is an open decision, section 8).
- Same-source, same-year: `exportValueUsd` and `importValueUsd` must come from the same
  source and the same `refYear`. Capture picks the latest year for which both flows have
  data from one source; if no common year exists, the field is omitted (no cross-year
  pairing, no `max(ex, im)`).
- Missing is not zero: a missing or failed flow response must not be coerced to `0` -> omit
  the field. `0` is acceptable only when the flow query succeeded and the source genuinely
  reports no HS-27 rows for that reporter/year.
- Source precedence: `src.comtrade` first; `src.oec` fallback only when contracted and only
  if it can satisfy the same-source/same-year rule.
- Evidence (`evidence.petroleumTrade`): `sourceIds`, `asOf`, `classification: 'HS'`,
  `productCodes` (the HS-27 set summed), `refYear`.

## 5. Field-source contract for raw `petroleumTrade`

- `allowedSourceIds: ['src.comtrade', 'src.oec']` (same lane as `keyExports` /
  `importDependence`).
- Required metadata: HS-27 `productCodes`, `refYear`, `classification: 'HS'`, `asOf`.
- Presence rule (fail-closed): present only when both values are sourced from one source for
  one `refYear` with that metadata; otherwise omitted.

## 6. Derived label - `oilStance` (draft banding methodology)

- `method.oilStance.banding.v1`, owner analysis-team, `status: 'draft'` (modeled on
  `DEBT_EXPOSURE_BANDING_V1`). `inputs: ['petroleumTrade']`.
- Metric (preferred): `normalizedNet = (exportValueUsd - importValueUsd) / (exportValueUsd
  - importValueUsd)`, in `[-1, +1]`.
- Normalization guard: before banding, require the denominator `(exports + imports)` to
  clear a minimum petroleum-trade threshold; below it, fall back to `neutral` (or omit)
  rather than letting a tiny one-sided flow read as a confident exporter / importer. The
  threshold is an open decision (section 8).
- Bands: `exporter` if `normalizedNet >= +X`; `importer` if `<= -X`; otherwise `neutral`.
  `X` is an open decision (section 8).
- Evidence (`evidence.oilStance`): `sourceIds` = `petroleumTrade`'s sources, `asOf`,
  `methodologyId: method.oilStance.banding.v1`.
- Applied by `deriveCountryProfiles` only when approved - same mechanism as the debt
  banding.

## 7. How it plugs in (no behavior change until approved)

`scoreCountryImpact('oil_shock')` already consumes `oilStance`; the publish gate already
validates derived-label methodology approval and field contracts. Fail-closed end-to-end:
no / uncontracted / mismatched-year `petroleumTrade`, or a draft methodology => no
`oilStance` => no oil claim (current behavior). This design only defines the path that
lights up after approval.

## 8. Open decisions (input needed before any implementation or approval)

1. Normalization metric: keep `net / (exports + imports)` (preferred), or
   share-of-total-trade. Avoid GDP (not sourced).
2. Minimum petroleum-trade denominator / neutral fallback: the floor on `(exports +
imports)` below which we return `neutral` (or omit), so negligible flows are not labeled
   exporter / importer.
3. Threshold bands: the `X` for exporter / importer and the neutral width.
4. Recency rule: minimum `refYear` (e.g. within 3 years); stale => omit.
5. Comtrade vs OEC precedence: Comtrade primary; OEC only when Comtrade absent and
   contracted; both flows from the same source (no mixing).
6. HS-27 scope: whole chapter 27 (incl. coal 2701) vs crude + refined + gas (`2709` /
   `2710` / `2711`); define the exact set.

## 9. Implementation outline (FUTURE - only on explicit approval)

1. Add a dedicated Comtrade HS-27 export / import totals function (new; current code lacks
   it).
2. Make OEC's petroleum capture enforce same-year export + import (not `max`).
3. Attach `petroleumTrade` in `buildProfile` with evidence, only after its field-source
   contract exists.
4. Add the `petroleumTrade` contract to verification.
5. Register `method.oilStance.banding.v1` (`draft`).
6. `deriveCountryProfiles` applies it when approved.
7. Tests.

Each step is separate and separately approved. This document is documentation only;
implementation remains a later, separately approved task.
