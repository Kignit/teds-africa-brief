import type { ConnectorContext } from './types'
import type { CountryProfile, CountryProfileEvidenceMap } from '../../domain/country'
import { fetchComtradeTopProducts } from './comtrade'
import { fetchOecTrade } from './oec'

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
  /** UN M49 numeric code, for optional Comtrade (keyed) enrichment. */
  comtradeCode?: string
  /** OEC country id (continent prefix + ISO3), e.g. 'afnga' — for keyless OEC trade. */
  oecCode?: string
}

export const LAUNCH_MARKETS: CountryProfileSpec[] = [
  { code: 'ET', comtradeCode: '231', oecCode: 'afeth' },
  { code: 'KE', comtradeCode: '404', oecCode: 'afken' },
  { code: 'NG', comtradeCode: '566', oecCode: 'afnga' },
  { code: 'GH', comtradeCode: '288', oecCode: 'afgha' },
  { code: 'ZA', comtradeCode: '710', oecCode: 'afzaf' },
]

// Auditable record of WHY a profile's trade fields (keyExports / importDependence) are
// present or absent — surfaced in the generator logs so an omission is never silent.
// PURE DIAGNOSTICS: emitting these never changes the enrichment outcome, the fields, the
// fail-closed omission, or the publish gate.
export interface ProfileTradeDiagnostic {
  code: string
  stage: 'comtrade' | 'oec'
  outcome: 'skipped_no_key' | 'failed' | 'attempted' | 'non_ok' | 'empty' | 'populated'
  detail?: string
}
export type ProfileDiagSink = (d: ProfileTradeDiagnostic) => void

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
  onDiag?: ProfileDiagSink,
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

  // PRIMARY: specific products from Comtrade (keyed; contributes nothing without a key).
  if (spec.comtradeCode) {
    const hasComtradeKey = Boolean(ctx.config.comtradeApiKey)
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
    onDiag?.({
      code: spec.code,
      stage: 'comtrade',
      outcome: !hasComtradeKey ? 'skipped_no_key' : exports || imports ? 'populated' : 'failed',
    })
  }

  // KEYLESS FALLBACK: OEC (BACI/HS, secondary / official-derived) fills any trade field
  // Comtrade did not populate (e.g. no key). Resilient — an OEC failure simply omits the
  // field (fail closed, never fabricated). Both sources are contracted for these fields;
  // NO derived oil-stance label is produced here.
  if (
    spec.oecCode &&
    (profile.keyExports === undefined || profile.importDependence === undefined)
  ) {
    onDiag?.({ code: spec.code, stage: 'oec', outcome: 'attempted' })
    try {
      const oec = await fetchOecTrade(ctx, spec.oecCode)
      const filled: string[] = []
      if (profile.keyExports === undefined && oec.exports) {
        profile.keyExports = oec.exports.products
        evidence.keyExports = {
          sourceIds: [oec.exports.sourceId],
          asOf: oec.exports.asOf,
          reporterCode: oec.exports.reporterCode,
          flowCode: oec.exports.flowCode,
          classification: oec.exports.classification,
          productCodes: oec.exports.productCodes,
          refYear: oec.exports.refYear,
        }
        filled.push('keyExports')
      }
      if (profile.importDependence === undefined && oec.imports) {
        profile.importDependence = oec.imports.products
        evidence.importDependence = {
          sourceIds: [oec.imports.sourceId],
          asOf: oec.imports.asOf,
          reporterCode: oec.imports.reporterCode,
          flowCode: oec.imports.flowCode,
          classification: oec.imports.classification,
          productCodes: oec.imports.productCodes,
          refYear: oec.imports.refYear,
        }
        filled.push('importDependence')
      }
      onDiag?.(
        filled.length
          ? { code: spec.code, stage: 'oec', outcome: 'populated', detail: filled.join('+') }
          : { code: spec.code, stage: 'oec', outcome: 'empty' },
      )
    } catch (e) {
      onDiag?.({
        code: spec.code,
        stage: 'oec',
        outcome: 'non_ok',
        detail: e instanceof Error ? e.message : String(e),
      })
      // OEC unreachable/failed → omit the trade fields (fail closed, no fabrication).
    }
  }

  return profile
}

// The country-profile connector body. Builds every covered country in parallel
// and drops the ones whose backbone could not be sourced (fail closed).
export async function fetchCountryProfiles(
  ctx: ConnectorContext,
  specs: CountryProfileSpec[] = LAUNCH_MARKETS,
  onDiag?: ProfileDiagSink,
): Promise<CountryProfile[]> {
  const built = await Promise.all(specs.map((spec) => buildProfile(ctx, spec, onDiag)))
  return built.filter((p): p is CountryProfile => p !== null)
}
