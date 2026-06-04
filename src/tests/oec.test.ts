import { describe, it, expect, vi } from 'vitest'
import { fetchOecTrade } from '../server/connectors/oec'
import { fetchCountryProfiles } from '../server/connectors/countryProfile'
import { countryProfileFieldReasons } from '../server/verification/countryProfiles'
import { knownSourceIds } from '../server/verification/sources'
import { SOURCES } from '../data/sources'
import type { ConnectorContext, FetchLike } from '../server/connectors/types'
import type { CountryProfile } from '../domain/country'

const now = () => '2026-06-04T06:00:00.000Z'
const known = knownSourceIds(SOURCES)

// [HS4 ID (`${section}${hs4}`), HS4 name, Year, Trade Value]
type Row = [string, string, number, number]
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

function oecCtx(exportRows: Row[], importRows: Row[]): ConnectorContext {
  const fetch = vi.fn(async (url: string) => {
    if (url.includes('Exporter+Country')) return oecResponse(exportRows)
    if (url.includes('Importer+Country')) return oecResponse(importRows)
    return NOT_OK
  })
  return { fetch: fetch as unknown as FetchLike, config: {}, now }
}

// Nigeria-shaped data: crude (2709) + gas (2711) are HS-chapter 27; fertilizers (3102)
// are not. Includes an older-year row that must be ignored (latest year only).
const EXPORTS: Row[] = [
  ['52709', 'Crude Petroleum', 2024, 52e9],
  ['52711', 'Petroleum Gas', 2024, 9e9],
  ['63102', 'Nitrogenous Fertilizers', 2024, 2e9],
  ['52709', 'Crude Petroleum', 2022, 40e9],
]
const IMPORTS: Row[] = [
  ['52710', 'Refined Petroleum', 2024, 21e9],
  ['21001', 'Wheat', 2024, 3e9],
  ['168517', 'Telephones', 2024, 1e9],
]

describe('fetchOecTrade (keyless BACI/HS trade via OEC)', () => {
  it('maps top exports/imports with HS provenance, latest year only', async () => {
    const t = await fetchOecTrade(oecCtx(EXPORTS, IMPORTS), 'afnga')
    expect(t.exports!.products).toEqual([
      'crude petroleum',
      'petroleum gas',
      'nitrogenous fertilizers',
    ])
    expect(t.exports!.productCodes).toEqual(['2709', '2711', '3102']) // HS4 from `${section}${hs4}`
    expect(t.exports!.sourceId).toBe('src.oec')
    expect(t.exports!.classification).toBe('HS')
    expect(t.exports!.flowCode).toBe('X')
    expect(t.exports!.refYear).toBe(2024) // latest year, not the 2022 row
    expect(t.exports!.asOf).toBe('2024-12-31T00:00:00.000Z')
    expect(t.imports!.products[0]).toBe('refined petroleum')
    expect(t.imports!.flowCode).toBe('M')
  })

  it('maps exports and imports for all five launch-market codes', async () => {
    for (const code of ['afnga', 'afgha', 'afken', 'afzaf', 'afeth']) {
      const t = await fetchOecTrade(oecCtx(EXPORTS, IMPORTS), code)
      expect(t.exports!.reporterCode).toBe(code)
      expect(t.exports!.products.length).toBeGreaterThan(0)
      expect(t.imports!.products.length).toBeGreaterThan(0)
    }
  })

  it('top-N selection (default 3)', async () => {
    const t = await fetchOecTrade(oecCtx(EXPORTS, IMPORTS), 'afnga')
    expect(t.exports!.products).toHaveLength(3)
  })

  it('parses HS4-ID prefix and detects HS chapter 27 (petroleum) — raw values only', async () => {
    const t = await fetchOecTrade(oecCtx(EXPORTS, IMPORTS), 'afnga')
    // HS27 only: exports 2709+2711 = 61e9; imports 2710 = 21e9; fertilizers/wheat excluded
    expect(t.petroleum!.exportValue).toBe(61e9)
    expect(t.petroleum!.importValue).toBe(21e9)
    expect(t.petroleum!.productCodes.sort()).toEqual(['2709', '2710', '2711'])
    expect(t.petroleum!.refYear).toBe(2024)
  })

  it('emits NO oilStance / derived label', async () => {
    const t = await fetchOecTrade(oecCtx(EXPORTS, IMPORTS), 'afnga')
    expect('oilStance' in t).toBe(false)
    expect('oilStance' in (t.petroleum ?? {})).toBe(false)
  })

  it('fails closed: throws on a non-OK response', async () => {
    const ctx: ConnectorContext = {
      fetch: vi.fn(async () => NOT_OK) as unknown as FetchLike,
      config: {},
      now,
    }
    await expect(fetchOecTrade(ctx, 'afnga')).rejects.toThrow(/OEC request failed/)
  })

  it('empty response omits all fields', async () => {
    const t = await fetchOecTrade(oecCtx([], []), 'afnga')
    expect(t.exports).toBeNull()
    expect(t.imports).toBeNull()
    expect(t.petroleum).toBeNull()
  })
})

describe('OEC field-source contract (extends, does not weaken, Comtrade)', () => {
  function profileWithKeyExports(sourceId: string): CountryProfile {
    return {
      code: 'NG',
      name: 'Nigeria',
      externalDebtPctGni: 60,
      keyExports: ['crude petroleum'],
      evidence: {
        externalDebtPctGni: {
          sourceIds: ['src.worldbank'],
          asOf: '2024-12-31T00:00:00.000Z',
          indicator: 'DT.DOD.DECT.GN.ZS',
        },
        keyExports: {
          sourceIds: [sourceId],
          asOf: '2024-12-31T00:00:00.000Z',
          reporterCode: 'afnga',
          flowCode: 'X',
          classification: 'HS',
          productCodes: ['2709'],
          refYear: 2024,
        },
      },
    }
  }

  it('accepts keyExports sourced from src.oec', () => {
    expect(
      countryProfileFieldReasons(profileWithKeyExports('src.oec'), 'keyExports', known),
    ).toEqual([])
  })

  it('still accepts keyExports from src.comtrade (Comtrade not weakened)', () => {
    expect(
      countryProfileFieldReasons(profileWithKeyExports('src.comtrade'), 'keyExports', known),
    ).toEqual([])
  })

  it('rejects keyExports from a non-trade source', () => {
    const reasons = countryProfileFieldReasons(
      profileWithKeyExports('src.gdelt'),
      'keyExports',
      known,
    )
    expect(reasons.length).toBeGreaterThan(0)
    expect(reasons.join(' ')).toMatch(/not allowed by its contract/)
  })
})

describe('country profile uses OEC keylessly (no Comtrade key) and emits no derived label', () => {
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

  it('populates keyExports/importDependence from src.oec and no oilStance/dollarDebtExposure', async () => {
    const fetch = vi.fn(async (url: string) => {
      if (url.includes('worldbank.org')) return wbResponse(60)
      if (url.includes('oec.world') && url.includes('Exporter+Country')) return oecResponse(EXPORTS)
      if (url.includes('oec.world') && url.includes('Importer+Country')) return oecResponse(IMPORTS)
      return NOT_OK
    })
    // No comtradeApiKey -> Comtrade is skipped -> OEC keyless fallback supplies trade.
    const ctx: ConnectorContext = { fetch: fetch as unknown as FetchLike, config: {}, now }
    const profiles = await fetchCountryProfiles(ctx, [
      { code: 'NG', comtradeCode: '566', oecCode: 'afnga' },
    ])
    expect(profiles).toHaveLength(1)
    const p = profiles[0]
    expect(p.keyExports).toEqual(['crude petroleum', 'petroleum gas', 'nitrogenous fertilizers'])
    expect(p.evidence.keyExports!.sourceIds).toEqual(['src.oec'])
    expect(p.importDependence![0]).toBe('refined petroleum')
    expect(p.oilStance).toBeUndefined() // no derived label produced
    expect(p.dollarDebtExposure).toBeUndefined()
  })
})
