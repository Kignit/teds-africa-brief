// A figure source contract says exactly which registered source may supply a given
// metric family. As with country-profile field-source contracts, a registered source
// is necessary but NOT sufficient — it must be the source declared for that metric,
// so a registered-but-wrong source (e.g. FX from the oil feed) is rejected. A metric
// family with NO contract cannot be accepted at all.
//
// This is enforced the same way source-registry resolution is: in the live pipeline
// (which drops violators and records the omission) and re-checked by the publish gate
// as the final authority — NOT inside validateFigure, which handles intrinsic
// validity (source presence, timestamp, range, invented spreads).

export interface FigureSourceContract {
  /** Human-readable metric family, e.g. 'fx.*'. */
  family: string
  test: (metric: string) => boolean
  /** The only source ids permitted for this metric family. */
  allowedSourceIds: string[]
}

export const FIGURE_SOURCE_CONTRACTS: FigureSourceContract[] = [
  { family: 'fx.*', test: (m) => m.startsWith('fx.'), allowedSourceIds: ['src.open_er_api'] },
  {
    family: 'commodity.brent',
    test: (m) => m === 'commodity.brent',
    allowedSourceIds: ['src.eia'],
  },
  { family: 'fred.*', test: (m) => m.startsWith('fred.'), allowedSourceIds: ['src.fred'] },
  { family: 'wb.*', test: (m) => m.startsWith('wb.'), allowedSourceIds: ['src.worldbank'] },
]

export function figureContract(metric: string): FigureSourceContract | undefined {
  return FIGURE_SOURCE_CONTRACTS.find((c) => c.test(metric))
}

interface FigureLike {
  metric: string
  sourceIds: string[]
}

// Reasons a figure violates its source contract (empty when valid). A metric with no
// contract is rejected outright; a contracted metric must carry at least one allowed
// source and no source outside its contract.
export function figureContractReasons(fig: FigureLike): string[] {
  const contract = figureContract(fig.metric)
  if (!contract) return [`${fig.metric} has no accepted figure source contract`]

  const reasons: string[] = []
  const allowed = contract.allowedSourceIds
  for (const id of fig.sourceIds) {
    if (!allowed.includes(id)) {
      reasons.push(
        `${fig.metric} source ${id} is not allowed by its contract (allowed: ${allowed.join(', ')})`,
      )
    }
  }
  if (!fig.sourceIds.some((id) => allowed.includes(id))) {
    reasons.push(`${fig.metric} requires a source in [${allowed.join(', ')}]`)
  }
  return reasons
}
