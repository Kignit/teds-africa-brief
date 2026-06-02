import type { ConnectorContext } from './types'
import type { RawFigure } from '../../domain/figure'

// Connectors that require an API key (EIA for oil, FRED for US macro) stay
// disabled until a key is configured. They never fabricate a value.
export type FetchResult =
  | { disabled: false; figures: RawFigure[] }
  | { disabled: true; reason: string }

interface EiaResponse {
  response?: { data?: { period: string; value: number }[] }
}

// US EIA Open Data — Brent crude daily spot. Requires a free EIA_API_KEY.
export async function fetchBrentEia(ctx: ConnectorContext): Promise<FetchResult> {
  const key = ctx.config.eiaApiKey
  if (!key) return { disabled: true, reason: 'EIA_API_KEY not configured' }
  const url =
    `https://api.eia.gov/v2/petroleum/pri/spt/data/?api_key=${key}` +
    `&frequency=daily&data[0]=value&facets[product][]=EPCBRENT` +
    `&sort[0][column]=period&sort[0][direction]=desc&length=1`
  const res = await ctx.fetch(url)
  if (!res.ok) return { disabled: false, figures: [] }
  const body = (await res.json()) as EiaResponse
  const row = body.response?.data?.[0]
  if (!row) return { disabled: false, figures: [] }
  return {
    disabled: false,
    figures: [
      {
        metric: 'commodity.brent',
        label: 'Brent crude',
        value: row.value,
        unit: 'USD/bbl',
        asOf: new Date(`${row.period}T00:00:00.000Z`).toISOString(),
        sourceIds: ['src.eia'],
      },
    ],
  }
}

interface FredResponse {
  observations?: { date: string; value: string }[]
}

// FRED (St. Louis Fed) — US rates / Treasuries / CPI. Requires a free FRED_API_KEY.
export async function fetchFredSeries(
  ctx: ConnectorContext,
  seriesId: string,
  label: string,
  unit: string,
): Promise<FetchResult> {
  const key = ctx.config.fredApiKey
  if (!key) return { disabled: true, reason: 'FRED_API_KEY not configured' }
  const url =
    `https://api.stlouisfed.org/fred/series/observations?series_id=${seriesId}` +
    `&api_key=${key}&file_type=json&sort_order=desc&limit=1`
  const res = await ctx.fetch(url)
  if (!res.ok) return { disabled: false, figures: [] }
  const body = (await res.json()) as FredResponse
  const row = body.observations?.[0]
  if (!row || row.value === '.') return { disabled: false, figures: [] }
  const value = Number(row.value)
  if (!Number.isFinite(value)) return { disabled: false, figures: [] }
  return {
    disabled: false,
    figures: [
      {
        metric: `fred.${seriesId}`,
        label,
        value,
        unit,
        asOf: new Date(`${row.date}T00:00:00.000Z`).toISOString(),
        sourceIds: ['src.fred'],
      },
    ],
  }
}
