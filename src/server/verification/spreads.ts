import type { RawFigure } from '../../domain/figure'

// Per the source map: live Eurobond spreads for these countries have no free
// source. A spread claimed for them, from a source that cannot supply it, is
// treated as invented and rejected — we omit rather than fabricate.
export const NO_FREE_SPREAD_COUNTRIES = new Set(['KE', 'GH', 'EG'])

// Sources permitted to supply Eurobond spreads (e.g. a paid feed). Empty today.
const ALLOWED_SPREAD_SOURCES = new Set<string>([])

type SpreadLike = Pick<RawFigure, 'metric' | 'countryCode' | 'sourceIds'>

function spreadCountry(fig: SpreadLike): string | undefined {
  if (!fig.metric.startsWith('spread.eurobond.')) return undefined
  return fig.countryCode ?? fig.metric.split('.').pop()
}

export function isInventedSpread(fig: SpreadLike): boolean {
  const cc = spreadCountry(fig)
  if (!cc) return false
  if (!NO_FREE_SPREAD_COUNTRIES.has(cc)) return false
  return !fig.sourceIds.some((s) => ALLOWED_SPREAD_SOURCES.has(s))
}
