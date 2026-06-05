import type { ConnectorContext } from './types'

// UN Comtrade — specific traded products by value. Keyed: disabled until
// COMTRADE_API_KEY is set, and it never fabricates trade structure. Used to
// enrich a country profile's keyExports / importDependence with real products.
const SOURCE_ID = 'src.comtrade'

export type ComtradeFlow = 'X' | 'M' // export / import

// Per-FLOW diagnostics so a partial enrichment (e.g. exports populated but imports
// rate-limited) is visible per country and per flow. PURE DIAGNOSTICS: emitting these
// never changes what is fetched, the products returned, or the fail-closed omission.
export type ComtradeFlowOutcome = 'skipped_no_key' | 'non_ok' | 'empty' | 'malformed' | 'populated'
export interface ComtradeFlowDiagnostic {
  flow: ComtradeFlow
  outcome: ComtradeFlowOutcome
  /** HTTP status — present when outcome is non_ok. */
  status?: number
  /** Extra context: malformed reason, or product count when populated. */
  detail?: string
}
export type ComtradeFlowDiagSink = (d: ComtradeFlowDiagnostic) => void

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
// excluding aggregate totals. Returns null when disabled, unreachable, malformed, or
// empty — the caller then omits the field rather than inventing one (fail-closed). The
// optional onDiag sink reports, PER FLOW, why a flow did or did not yield products:
// skipped_no_key / non_ok(status) / empty / malformed / populated. Diagnostics never
// change what is fetched or what is returned.
export async function fetchComtradeTopProducts(
  ctx: ConnectorContext,
  reporterCode: string,
  flow: ComtradeFlow,
  topN = 3,
  onDiag?: ComtradeFlowDiagSink,
): Promise<ComtradeProducts | null> {
  const key = ctx.config.comtradeApiKey
  if (!key) {
    onDiag?.({ flow, outcome: 'skipped_no_key' })
    return null
  }

  // HS 2-digit (AG2) chapters vs the World partner give a country's headline
  // export/import structure. Exact period handling follows Comtrade's API.
  const url =
    `https://comtradeapi.un.org/data/v1/get/C/A/HS?reporterCode=${reporterCode}` +
    `&flowCode=${flow}&partnerCode=0&cmdCode=AG2&includeDesc=true`
  const res = await ctx.fetch(url, { headers: { 'Ocp-Apim-Subscription-Key': key } })
  if (!res.ok) {
    onDiag?.({ flow, outcome: 'non_ok', status: res.status })
    return null
  }

  // Parse + shape-check. Non-JSON, or a payload without a `data` array, is MALFORMED
  // (distinct from an empty result); both still fail closed to null — nothing fabricated.
  let parsed: unknown
  try {
    parsed = await res.json()
  } catch {
    onDiag?.({ flow, outcome: 'malformed', detail: 'invalid JSON' })
    return null
  }
  const data = (parsed as ComtradeResponse | null)?.data
  if (!Array.isArray(data)) {
    onDiag?.({ flow, outcome: 'malformed', detail: 'no data array' })
    return null
  }

  const rows = data.filter(isProductRow)
  if (rows.length === 0) {
    onDiag?.({ flow, outcome: 'empty' })
    return null
  }

  const latestYear = rows.reduce((max, r) => Math.max(max, rowYear(r)), 0)
  const ofYear = latestYear > 0 ? rows.filter((r) => rowYear(r) === latestYear) : rows
  const top = [...ofYear]
    .sort((a, b) => (b.primaryValue ?? 0) - (a.primaryValue ?? 0))
    .slice(0, topN)
    .filter((r) => (r.cmdDesc ?? '').trim().length > 0)
  const products = top.map((r) => (r.cmdDesc ?? '').trim().toLowerCase())
  const productCodes = top.map((r) => (r.cmdCode ?? '').trim()).filter((c) => c.length > 0)
  if (products.length === 0 || productCodes.length === 0 || latestYear === 0) {
    onDiag?.({ flow, outcome: 'empty' })
    return null
  }

  onDiag?.({ flow, outcome: 'populated', detail: `${products.length} product(s)` })
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
