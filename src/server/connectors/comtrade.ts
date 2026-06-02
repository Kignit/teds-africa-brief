import type { ConnectorContext } from './types'

// UN Comtrade — specific traded products by value. Keyed: disabled until
// COMTRADE_API_KEY is set, and it never fabricates trade structure. Used to
// enrich a country profile's keyExports / importDependence with real products.
const SOURCE_ID = 'src.comtrade'

export type ComtradeFlow = 'X' | 'M' // export / import

interface ComtradeRow {
  cmdCode?: string
  cmdDesc?: string
  primaryValue?: number
  refYear?: number
  period?: string | number
}

interface ComtradeResponse {
  data?: ComtradeRow[]
}

export interface ComtradeProducts {
  sourceId: string
  products: string[]
  /** Product-level provenance metadata (proves the specific trade records used). */
  reporterCode: string
  flowCode: ComtradeFlow
  /** Commodity classification scheme. */
  classification: string
  /** Commodity codes of the selected products, e.g. ['27', '84']. */
  productCodes: string[]
  refYear: number
  /** ISO-8601 'as of' derived from the data's reference year. */
  asOf: string
}

function isProductRow(r: ComtradeRow): boolean {
  return (
    typeof r.primaryValue === 'number' &&
    typeof r.cmdDesc === 'string' &&
    r.cmdDesc.length > 0 &&
    r.cmdCode !== 'TOTAL' &&
    !/all commodities|commodities not specified|not elsewhere classified/i.test(r.cmdDesc)
  )
}

function rowYear(r: ComtradeRow): number {
  return Number(r.refYear ?? r.period ?? 0)
}

// Top `topN` product descriptions by trade value for the latest available year,
// excluding aggregate totals. Returns null when disabled, unreachable, or empty —
// the caller then omits the field rather than inventing one.
export async function fetchComtradeTopProducts(
  ctx: ConnectorContext,
  reporterCode: string,
  flow: ComtradeFlow,
  topN = 3,
): Promise<ComtradeProducts | null> {
  const key = ctx.config.comtradeApiKey
  if (!key) return null

  // HS 2-digit (AG2) chapters vs the World partner give a country's headline
  // export/import structure. Exact period handling follows Comtrade's API.
  const url =
    `https://comtradeapi.un.org/data/v1/get/C/A/HS?reporterCode=${reporterCode}` +
    `&flowCode=${flow}&partnerCode=0&cmdCode=AG2&includeDesc=true`
  const res = await ctx.fetch(url, { headers: { 'Ocp-Apim-Subscription-Key': key } })
  if (!res.ok) return null

  const body = (await res.json()) as ComtradeResponse
  const rows = (body.data ?? []).filter(isProductRow)
  if (rows.length === 0) return null

  const latestYear = rows.reduce((max, r) => Math.max(max, rowYear(r)), 0)
  const ofYear = latestYear > 0 ? rows.filter((r) => rowYear(r) === latestYear) : rows
  const top = [...ofYear]
    .sort((a, b) => (b.primaryValue ?? 0) - (a.primaryValue ?? 0))
    .slice(0, topN)
    .filter((r) => (r.cmdDesc ?? '').trim().length > 0)
  const products = top.map((r) => (r.cmdDesc ?? '').trim().toLowerCase())
  const productCodes = top.map((r) => (r.cmdCode ?? '').trim()).filter((c) => c.length > 0)
  if (products.length === 0 || productCodes.length === 0 || latestYear === 0) return null

  return {
    sourceId: SOURCE_ID,
    products,
    reporterCode,
    flowCode: flow,
    classification: 'HS',
    productCodes,
    refYear: latestYear,
    asOf: `${latestYear}-12-31T00:00:00.000Z`,
  }
}
