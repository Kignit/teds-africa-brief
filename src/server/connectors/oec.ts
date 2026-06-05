import type { ConnectorContext } from './types'
import {
  resolvePetroleumPosition,
  petroleumTradeEvidence,
  type PetroleumFlow,
  type PetroleumTradeEvidence,
} from './petroleumTrade'

// UN/CEPII BACI trade via OEC (oec.world) — KEYLESS, secondary / official-derived
// (BACI is CEPII's cleaned version of UN Comtrade). A keyless source for a country
// profile's keyExports / importDependence when the keyed Comtrade connector is
// unavailable. It never fabricates trade structure: on a non-OK response it THROWS
// (fail loud), and a parseable-but-empty response yields null fields (the caller omits
// them). NO derived oil-stance label is produced here — that needs an approved
// methodology + field-source contract. The raw petroleum (HS chapter 27) totals are
// emitted ONLY as raw inputs for a FUTURE oil-stance methodology to consume.

const SOURCE_ID = 'src.oec'
const CUBE = 'trade_i_baci_a_22' // BACI annual, HS-2022 revision
const PETROLEUM_CHAPTER = '27' // HS chapter 27: mineral fuels/oils (2709 crude, 2710 refined, 2711 gas…)

export type OecFlow = 'X' | 'M' // export / import

// Mirrors ComtradeProducts so a country profile treats either trade source uniformly.
export interface OecProducts {
  sourceId: string
  products: string[]
  reporterCode: string
  flowCode: OecFlow
  classification: string
  productCodes: string[]
  refYear: number
  asOf: string
}

// Raw HS-chapter-27 (petroleum) trade totals for the latest year — emitted for a
// FUTURE oil-stance methodology. NOT a derived label; this PR produces no oilStance.
export interface OecPetroleum {
  sourceId: string
  reporterCode: string
  exportValue: number
  importValue: number
  productCodes: string[]
  refYear: number
  asOf: string
}

export interface OecTrade {
  exports: OecProducts | null
  imports: OecProducts | null
  petroleum: OecPetroleum | null
}

interface OecRow {
  'HS4 ID'?: string | number
  HS4?: string
  Year?: number
  'Trade Value'?: number
}

// 'HS4 ID' is `{section}{HS4}` (e.g. 52709 = section 5 + HS4 2709). Recover the 4-digit
// HS code (last 4 chars) and its 2-digit chapter.
function hs4Of(id: string | number | undefined): string {
  const s = String(id ?? '')
  return s.length >= 4 ? s.slice(-4) : ''
}
function chapterOf(id: string | number | undefined): string {
  return hs4Of(id).slice(0, 2)
}
function asOfYear(year: number): string {
  return `${year}-12-31T00:00:00.000Z`
}

function buildUrl(reporterCode: string, flow: OecFlow): string {
  const dim = flow === 'X' ? 'Exporter+Country' : 'Importer+Country'
  return (
    `https://oec.world/api/olap-proxy/data.jsonrecords?cube=${CUBE}` +
    `&drilldowns=HS4,Year&measures=Trade+Value&${dim}=${reporterCode}`
  )
}

// One flow's valid HS4 rows from the LATEST year present in the response (never a
// hardcoded year). Throws on a non-OK response; returns { rows: [], year: 0 } when the
// response carries no usable rows.
async function fetchLatestYearRows(
  ctx: ConnectorContext,
  reporterCode: string,
  flow: OecFlow,
): Promise<{ rows: OecRow[]; year: number }> {
  const res = await ctx.fetch(buildUrl(reporterCode, flow))
  if (!res.ok) {
    throw new Error(`OEC request failed (${reporterCode} ${flow}): HTTP ${res.status}`)
  }
  const data = ((await res.json()) as { data?: OecRow[] }).data ?? []
  const valid = data.filter(
    (r) =>
      typeof r['Trade Value'] === 'number' &&
      typeof r.Year === 'number' &&
      hs4Of(r['HS4 ID']).length === 4,
  )
  if (valid.length === 0) return { rows: [], year: 0 }
  const year = valid.reduce((mx, r) => Math.max(mx, r.Year ?? 0), 0)
  return { rows: valid.filter((r) => r.Year === year), year }
}

function topProducts(
  rows: OecRow[],
  reporterCode: string,
  flow: OecFlow,
  year: number,
  topN: number,
): OecProducts | null {
  if (rows.length === 0 || year === 0) return null
  const top = [...rows]
    .sort((a, b) => (b['Trade Value'] ?? 0) - (a['Trade Value'] ?? 0))
    .slice(0, topN)
  const products = top.map((r) => (r.HS4 ?? '').trim().toLowerCase()).filter((p) => p.length > 0)
  const productCodes = top.map((r) => hs4Of(r['HS4 ID'])).filter((c) => c.length === 4)
  if (products.length === 0 || productCodes.length === 0) return null
  return {
    sourceId: SOURCE_ID,
    products,
    reporterCode,
    flowCode: flow,
    classification: 'HS',
    productCodes,
    refYear: year,
    asOf: asOfYear(year),
  }
}

function petroleumTotal(rows: OecRow[]): { value: number; codes: string[] } {
  let value = 0
  const codes = new Set<string>()
  for (const r of rows) {
    if (chapterOf(r['HS4 ID']) === PETROLEUM_CHAPTER) {
      value += r['Trade Value'] ?? 0
      codes.add(hs4Of(r['HS4 ID']))
    }
  }
  return { value, codes: [...codes] }
}

// KEYLESS trade structure for one country: top export/import products (+ provenance
// metadata) and the raw HS-27 petroleum totals. Throws on a non-OK response; an empty
// flow yields a null field (the caller omits it). Emits NO derived oil-stance label.
export async function fetchOecTrade(
  ctx: ConnectorContext,
  reporterCode: string,
  topN = 3,
): Promise<OecTrade> {
  const [ex, im] = await Promise.all([
    fetchLatestYearRows(ctx, reporterCode, 'X'),
    fetchLatestYearRows(ctx, reporterCode, 'M'),
  ])
  const exports = topProducts(ex.rows, reporterCode, 'X', ex.year, topN)
  const imports = topProducts(im.rows, reporterCode, 'M', im.year, topN)

  const exPet = petroleumTotal(ex.rows)
  const imPet = petroleumTotal(im.rows)
  const petYear = Math.max(ex.year, im.year)
  const petroleum: OecPetroleum | null =
    petYear > 0 && (exPet.codes.length > 0 || imPet.codes.length > 0)
      ? {
          sourceId: SOURCE_ID,
          reporterCode,
          exportValue: exPet.value,
          importValue: imPet.value,
          productCodes: [...new Set([...exPet.codes, ...imPet.codes])],
          refYear: petYear,
          asOf: asOfYear(petYear),
        }
      : null

  return { exports, imports, petroleum }
}

// Chapter-27 (petroleum) value + HS4 codes per YEAR for one flow, across the FULL response
// (not only the latest year, so a common export/import year can be found). Throws on a
// non-OK response (fail loud; the caller catches and omits).
interface OecPetroleumFlow extends PetroleumFlow {
  codesByYear: Map<number, Set<string>>
}
async function oecPetroleumFlow(
  ctx: ConnectorContext,
  reporterCode: string,
  flow: OecFlow,
): Promise<OecPetroleumFlow> {
  const res = await ctx.fetch(buildUrl(reporterCode, flow))
  if (!res.ok) {
    throw new Error(`OEC request failed (${reporterCode} ${flow}): HTTP ${res.status}`)
  }
  const data = ((await res.json()) as { data?: OecRow[] }).data ?? []
  const byYear = new Map<number, number>()
  const codesByYear = new Map<number, Set<string>>()
  for (const r of data) {
    if (chapterOf(r['HS4 ID']) !== PETROLEUM_CHAPTER) continue
    if (typeof r['Trade Value'] !== 'number' || typeof r.Year !== 'number') continue
    byYear.set(r.Year, (byYear.get(r.Year) ?? 0) + r['Trade Value'])
    const codes = codesByYear.get(r.Year) ?? new Set<string>()
    codes.add(hs4Of(r['HS4 ID']))
    codesByYear.set(r.Year, codes)
  }
  return { ok: true, byYear, codesByYear }
}

// Keyless OEC fallback for the raw petroleumTrade field: the signed HS-27 position for a
// single COMMON export/import year (never max(ex.year, im.year)). Returns null when there
// is no common year or no data; throws on a non-OK response (the caller catches and omits).
export async function fetchOecPetroleum(
  ctx: ConnectorContext,
  reporterCode: string,
): Promise<PetroleumTradeEvidence | null> {
  const [ex, im] = await Promise.all([
    oecPetroleumFlow(ctx, reporterCode, 'X'),
    oecPetroleumFlow(ctx, reporterCode, 'M'),
  ])
  const position = resolvePetroleumPosition(ex, im)
  if (!position) return null
  const codes = new Set<string>([
    ...(ex.codesByYear.get(position.refYear) ?? []),
    ...(im.codesByYear.get(position.refYear) ?? []),
  ])
  const productCodes = codes.size > 0 ? [...codes] : [PETROLEUM_CHAPTER]
  return petroleumTradeEvidence(SOURCE_ID, reporterCode, position, productCodes)
}
