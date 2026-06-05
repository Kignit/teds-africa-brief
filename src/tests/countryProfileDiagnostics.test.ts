import { describe, it, expect, vi } from 'vitest'
import {
  fetchCountryProfiles,
  type ProfileTradeDiagnostic,
} from '../server/connectors/countryProfile'
import type { ConnectorContext, FetchLike } from '../server/connectors/types'

const now = () => '2026-06-04T06:00:00.000Z'
const NG = { code: 'NG', comtradeCode: '566', oecCode: 'afnga' }

function wbResponse(value: number): Response {
  return {
    ok: true,
    status: 200,
    json: async () => [
      { page: 1 },
      [{ date: '2024', value, country: { id: 'NGA', value: 'Nigeria' } }],
    ],
    text: async () => '',
  } as unknown as Response
}
type Row = [string, string, number, number] // [HS4 ID, HS4 name, Year, Trade Value]
function oecResponse(rows: Row[]): Response {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      data: rows.map(([id, hs4, Year, tv]) => ({
        'HS4 ID': id,
        HS4: hs4,
        Year,
        'Trade Value': tv,
      })),
    }),
    text: async () => '',
  } as unknown as Response
}
const NOT_OK = {
  ok: false,
  status: 503,
  json: async () => ({}),
  text: async () => '',
} as unknown as Response
const NG_EXPORTS: Row[] = [
  ['52709', 'Crude Petroleum', 2024, 52e9],
  ['52711', 'Petroleum Gas', 2024, 9e9],
]
const NG_IMPORTS: Row[] = [['52710', 'Refined Petroleum', 2024, 21e9]]

// Build NG's profile with a routed fetch (WB backbone always OK; OEC routed per test),
// no Comtrade key, collecting the trade-enrichment diagnostics.
async function runNG(oecFetch: (url: string) => Response) {
  const diags: ProfileTradeDiagnostic[] = []
  const fetch = vi.fn(async (url: string) =>
    url.includes('worldbank.org') ? wbResponse(60) : oecFetch(url),
  )
  const ctx: ConnectorContext = { fetch: fetch as unknown as FetchLike, config: {}, now }
  const profiles = await fetchCountryProfiles(ctx, [NG], (d) => diags.push(d))
  return { profile: profiles[0], diags: diags.filter((d) => d.code === 'NG') }
}
const has = (d: ProfileTradeDiagnostic[], stage: string, outcome: string) =>
  d.some((x) => x.stage === stage && x.outcome === outcome)

const oecOk = (url: string) =>
  url.includes('Exporter+Country')
    ? oecResponse(NG_EXPORTS)
    : url.includes('Importer+Country')
      ? oecResponse(NG_IMPORTS)
      : NOT_OK

describe('country-profile trade-enrichment diagnostics', () => {
  it('OEC success: Comtrade skipped (no key) -> OEC attempted -> populated', async () => {
    const { profile, diags } = await runNG(oecOk)
    expect(profile.keyExports).toEqual(['crude petroleum', 'petroleum gas'])
    expect(profile.evidence.keyExports!.sourceIds).toEqual(['src.oec'])
    expect(has(diags, 'comtrade', 'skipped_no_key')).toBe(true)
    expect(has(diags, 'oec', 'attempted')).toBe(true)
    expect(has(diags, 'oec', 'populated')).toBe(true)
  })

  it('OEC non-OK: attempted -> non_ok; trade fields omitted (not fabricated)', async () => {
    const { profile, diags } = await runNG(() => NOT_OK)
    expect(profile.externalDebtPctGni).toBe(60) // WB backbone still present
    expect(profile.keyExports).toBeUndefined()
    expect(profile.importDependence).toBeUndefined()
    expect(has(diags, 'oec', 'attempted')).toBe(true)
    expect(has(diags, 'oec', 'non_ok')).toBe(true)
  })

  it('OEC empty: attempted -> empty; trade fields omitted', async () => {
    const { profile, diags } = await runNG(() => oecResponse([]))
    expect(profile.keyExports).toBeUndefined()
    expect(has(diags, 'oec', 'attempted')).toBe(true)
    expect(has(diags, 'oec', 'empty')).toBe(true)
  })

  it('Comtrade no-key fallback to OEC: trade is sourced from src.oec', async () => {
    const { profile, diags } = await runNG(oecOk)
    expect(has(diags, 'comtrade', 'skipped_no_key')).toBe(true)
    expect(profile.evidence.keyExports!.sourceIds).toEqual(['src.oec'])
    expect(profile.evidence.importDependence!.sourceIds).toEqual(['src.oec'])
  })

  it('omission remains non-fabricated: WB profile built, no trade fields, no derived label', async () => {
    const { profile } = await runNG(() => NOT_OK)
    expect(profile.externalDebtPctGni).toBe(60)
    expect(profile.keyExports).toBeUndefined()
    expect(profile.oilStance).toBeUndefined()
    expect(profile.dollarDebtExposure).toBeUndefined()
  })
})
