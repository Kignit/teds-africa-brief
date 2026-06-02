import type { ConnectorContext } from './types'
import type { RawFigure } from '../../domain/figure'

// open.er-api.com — free, no key. Covers all five launch-market currencies.
const SOURCE_ID = 'src.open_er_api'

const CCY_COUNTRY: Record<string, string> = {
  NGN: 'NG',
  KES: 'KE',
  ETB: 'ET',
  GHS: 'GH',
  ZAR: 'ZA',
}

interface ErApiResponse {
  result?: string
  time_last_update_unix?: number
  rates?: Record<string, number>
}

export async function fetchAfricanFx(ctx: ConnectorContext): Promise<RawFigure[]> {
  const res = await ctx.fetch('https://open.er-api.com/v6/latest/USD')
  if (!res.ok) return []
  const body = (await res.json()) as ErApiResponse
  if (body.result !== 'success' || !body.rates) return []
  const asOf = body.time_last_update_unix
    ? new Date(body.time_last_update_unix * 1000).toISOString()
    : ctx.now()
  const out: RawFigure[] = []
  for (const [ccy, cc] of Object.entries(CCY_COUNTRY)) {
    const value = body.rates[ccy]
    if (typeof value !== 'number') continue
    out.push({
      metric: `fx.${ccy}_USD`,
      label: `${ccy}/USD`,
      value,
      unit: `${ccy}/USD`,
      asOf,
      countryCode: cc,
      sourceIds: [SOURCE_ID],
    })
  }
  return out
}
