import type { ConnectorContext } from './types'
import type { RawFigure } from '../../domain/figure'

// World Bank Open Data — REST API v2, no key required.
// https://api.worldbank.org/v2
const SOURCE_ID = 'src.worldbank'

interface WbRow {
  date: string
  value: number | null
}

export interface WorldBankQuery {
  countryCode: string
  indicator: string
  label: string
  unit: string
}

export async function fetchWorldBankIndicator(
  ctx: ConnectorContext,
  q: WorldBankQuery,
): Promise<RawFigure[]> {
  const url = `https://api.worldbank.org/v2/country/${q.countryCode}/indicator/${q.indicator}?format=json&per_page=5`
  const res = await ctx.fetch(url)
  if (!res.ok) return []
  const body = (await res.json()) as unknown
  if (!Array.isArray(body) || body.length < 2) return []
  const rows = body[1] as WbRow[] | null
  if (!rows) return []
  const latest = rows.find((r) => r.value !== null)
  if (!latest || latest.value === null) return []
  return [
    {
      metric: `wb.${q.indicator}.${q.countryCode}`,
      label: q.label,
      value: latest.value,
      unit: q.unit,
      asOf: `${latest.date}-12-31T00:00:00.000Z`,
      countryCode: q.countryCode,
      sourceIds: [SOURCE_ID],
    },
  ]
}
