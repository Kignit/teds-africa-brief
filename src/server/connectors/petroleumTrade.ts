// Shared types + resolver for the raw, sourced petroleumTrade field (HS chapter 27).
// Both Comtrade (primary) and OEC (fallback) capture per-flow values and resolve them to
// a SINGLE common reference year here, so the engine never sees a cross-year position and
// a missing/failed flow is never silently treated as zero. NO derived label is produced.

// One flow's capture. `ok: false` means the QUERY FAILED (network / non-OK / malformed); a
// failure is NOT zero, so the caller omits petroleumTrade. `byYear` maps a year to its
// summed HS-27 value; a successful query that returns no HS-27 rows yields an empty map
// (a genuine zero that has no reference year of its own).
export interface PetroleumFlow {
  ok: boolean
  byYear: Map<number, number>
}

export interface PetroleumPosition {
  exportValueUsd: number
  importValueUsd: number
  refYear: number
}

// The fully-sourced raw field a connector attaches to a profile (with its evidence).
export interface PetroleumTradeEvidence extends PetroleumPosition {
  sourceId: string
  reporterCode: string
  classification: string
  productCodes: string[]
  asOf: string
}

// Resolve a SAME-YEAR signed position from the two flows. Returns null (omit) when either
// flow's query failed, when both flows yielded no HS-27 data, or when the two flows share
// no common year (cross-year data is rejected, never paired via max()). A flow whose query
// succeeded but returned no HS-27 rows contributes a genuine zero at the other flow's year.
export function resolvePetroleumPosition(
  ex: PetroleumFlow,
  im: PetroleumFlow,
): PetroleumPosition | null {
  if (!ex.ok || !im.ok) return null // a missing / failed flow is not zero
  const exYears = [...ex.byYear.keys()]
  const imYears = [...im.byYear.keys()]
  if (exYears.length === 0 && imYears.length === 0) return null // both empty: no reference year

  let refYear: number
  if (exYears.length > 0 && imYears.length > 0) {
    const common = exYears.filter((y) => im.byYear.has(y))
    if (common.length === 0) return null // cross-year mismatch: reject
    refYear = Math.max(...common)
  } else {
    // Exactly one side has data; the other is a genuine zero (query succeeded, no rows).
    refYear = Math.max(...exYears, ...imYears)
  }
  return {
    exportValueUsd: ex.byYear.get(refYear) ?? 0,
    importValueUsd: im.byYear.get(refYear) ?? 0,
    refYear,
  }
}

export function petroleumTradeEvidence(
  sourceId: string,
  reporterCode: string,
  position: PetroleumPosition,
  productCodes: string[],
): PetroleumTradeEvidence {
  return {
    sourceId,
    reporterCode,
    exportValueUsd: position.exportValueUsd,
    importValueUsd: position.importValueUsd,
    classification: 'HS',
    productCodes,
    refYear: position.refYear,
    asOf: `${position.refYear}-12-31T00:00:00.000Z`,
  }
}
