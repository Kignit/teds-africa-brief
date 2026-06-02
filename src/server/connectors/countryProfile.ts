import type { ConnectorContext } from './types'
import type { CountryProfile, CountryProfileEvidenceMap } from '../../domain/country'
import { fetchComtradeTopProducts } from './comtrade'

// Builds country profiles from real, machine-readable sources — no hardcoded
// country facts and no analytical classification. World Bank (free, no key)
// supplies the RAW external-debt backbone as a published number; UN Comtrade
// (keyed) optionally enriches with specific export/import products. Turning the
// raw debt figure into a high/medium/low LABEL is a methodology decision and is
// deliberately NOT done here — see src/server/analysis/methodologies.ts.
const WB_SOURCE_ID = 'src.worldbank'

// World Bank indicator codes (REST v2, no key):
const EXT_DEBT_GNI = 'DT.DOD.DECT.GN.ZS' // external debt stocks, % of GNI

// Coverage/identity config only (which countries + their standard codes). It
// carries no analytical facts; names and all analytical values are sourced at
// runtime. Codes match events/figures (ISO-3166 alpha-2) and World Bank.
export interface CountryProfileSpec {
  code: string
  /** UN M49 numeric code, for optional Comtrade enrichment. */
  comtradeCode?: string
}

export const LAUNCH_MARKETS: CountryProfileSpec[] = [
  { code: 'ET', comtradeCode: '231' },
  { code: 'KE', comtradeCode: '404' },
  { code: 'NG', comtradeCode: '566' },
  { code: 'GH', comtradeCode: '288' },
  { code: 'ZA', comtradeCode: '710' },
]

interface WbPoint {
  value: number
  asOf: string
  countryName: string
}

interface WbIndicatorRow {
  date: string
  value: number | null
  country?: { id?: string; value?: string }
}

// Latest non-null datapoint for a World Bank indicator, with the country name
// taken from the same payload (so even the name is sourced, not hardcoded).
async function fetchWbPoint(
  ctx: ConnectorContext,
  countryCode: string,
  indicator: string,
): Promise<WbPoint | null> {
  const url = `https://api.worldbank.org/v2/country/${countryCode}/indicator/${indicator}?format=json&per_page=10`
  const res = await ctx.fetch(url)
  if (!res.ok) return null
  const body = (await res.json()) as unknown
  if (!Array.isArray(body) || body.length < 2) return null
  const rows = body[1] as WbIndicatorRow[] | null
  if (!rows) return null
  const latest = rows.find((r) => r.value !== null)
  if (!latest || latest.value === null) return null
  return {
    value: latest.value,
    asOf: `${latest.date}-12-31T00:00:00.000Z`,
    countryName: latest.country?.value ?? '',
  }
}

// One country's profile from real sources. Returns null when the required
// external-debt backbone cannot be sourced — we omit the country rather than
// guess. The raw debt value is stored as-published; classification into an
// exposure label is left to an approved methodology, applied downstream.
async function buildProfile(
  ctx: ConnectorContext,
  spec: CountryProfileSpec,
): Promise<CountryProfile | null> {
  const debt = await fetchWbPoint(ctx, spec.code, EXT_DEBT_GNI)

  if (!debt) return null

  const name = debt.countryName || spec.code

  const evidence: CountryProfileEvidenceMap = {
    externalDebtPctGni: { sourceIds: [WB_SOURCE_ID], asOf: debt.asOf, indicator: EXT_DEBT_GNI },
  }

  const profile: CountryProfile = {
    code: spec.code,
    name,
    externalDebtPctGni: debt.value,
    evidence,
  }

  // Optional: specific products from Comtrade (keyed; omitted when disabled).
  if (spec.comtradeCode) {
    const [exports, imports] = await Promise.all([
      fetchComtradeTopProducts(ctx, spec.comtradeCode, 'X'),
      fetchComtradeTopProducts(ctx, spec.comtradeCode, 'M'),
    ])
    if (exports) {
      profile.keyExports = exports.products
      evidence.keyExports = {
        sourceIds: [exports.sourceId],
        asOf: exports.asOf,
        reporterCode: exports.reporterCode,
        flowCode: exports.flowCode,
        classification: exports.classification,
        productCodes: exports.productCodes,
        refYear: exports.refYear,
      }
    }
    if (imports) {
      profile.importDependence = imports.products
      evidence.importDependence = {
        sourceIds: [imports.sourceId],
        asOf: imports.asOf,
        reporterCode: imports.reporterCode,
        flowCode: imports.flowCode,
        classification: imports.classification,
        productCodes: imports.productCodes,
        refYear: imports.refYear,
      }
    }
  }

  return profile
}

// The country-profile connector body. Builds every covered country in parallel
// and drops the ones whose backbone could not be sourced (fail closed).
export async function fetchCountryProfiles(
  ctx: ConnectorContext,
  specs: CountryProfileSpec[] = LAUNCH_MARKETS,
): Promise<CountryProfile[]> {
  const built = await Promise.all(specs.map((spec) => buildProfile(ctx, spec)))
  return built.filter((p): p is CountryProfile => p !== null)
}
