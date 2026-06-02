// Plausible value bands per metric family, used for sanity validation. A figure
// outside its band is rejected rather than shown.
interface Range {
  min: number
  max: number
}

const PREFIX_RANGES: { test: (metric: string) => boolean; range: Range }[] = [
  { test: (m) => m.startsWith('fx.'), range: { min: 0, max: 100000 } },
  { test: (m) => m.startsWith('rate.'), range: { min: -5, max: 100 } },
  { test: (m) => m.startsWith('commodity.'), range: { min: 0, max: 100000 } },
  { test: (m) => m.startsWith('spread.'), range: { min: 0, max: 5000 } },
  { test: (m) => m.startsWith('fred.'), range: { min: -10, max: 1_000_000 } },
  { test: (m) => m.startsWith('wb.'), range: { min: -1000, max: 1e15 } },
]

export function getRange(metric: string): Range | undefined {
  return PREFIX_RANGES.find((r) => r.test(metric))?.range
}
