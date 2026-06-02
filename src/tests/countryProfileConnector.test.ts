import { describe, it, expect } from 'vitest'
import { fetchCountryProfiles, LAUNCH_MARKETS } from '../server/connectors/countryProfile'
import { fetchComtradeTopProducts } from '../server/connectors/comtrade'
import { verifiedCountryProfiles } from '../server/verification/countryProfiles'
import { knownSourceIds } from '../server/verification/sources'
import { SOURCES } from '../data/sources'
import type { AppConfig } from '../server/config'
import type { ConnectorContext, FetchLike } from '../server/connectors/types'

const now = () => '2026-05-29T06:00:00.000Z'
const known = knownSourceIds(SOURCES)

const WB = {
  extDebt: 'DT.DOD.DECT.GN.ZS',
}

function jsonResponse(body: unknown, ok = true): Response {
  return { ok, json: async () => body, text: async () => '' } as unknown as Response
}

function wbResponse(name: string, year: string, value: number): Response {
  return jsonResponse([{ page: 1 }, [{ date: year, value, country: { id: 'XX', value: name } }]])
}

interface FetchCfg {
  extDebt?: number | null
  name?: string
  year?: string
  wbOk?: boolean
  comtradeX?: unknown[] | null
  comtradeM?: unknown[] | null
}

// A fake World Bank + Comtrade fetch. The connector derives everything from these
// responses — no country facts are hardcoded in the connector itself.
function buildFetch(cfg: FetchCfg): FetchLike {
  const name = cfg.name ?? 'Testland'
  const year = cfg.year ?? '2023'
  return (async (url: string) => {
    if (url.includes('api.worldbank.org')) {
      if (cfg.wbOk === false) return jsonResponse([], false)
      let value: number | null | undefined
      if (url.includes(WB.extDebt)) value = cfg.extDebt
      if (value === undefined || value === null) return jsonResponse([{ page: 1 }, []])
      return wbResponse(name, year, value)
    }
    if (url.includes('comtradeapi.un.org')) {
      const rows = url.includes('flowCode=X') ? cfg.comtradeX : cfg.comtradeM
      if (!rows) return jsonResponse({}, false)
      return jsonResponse({ data: rows })
    }
    return jsonResponse({}, false)
  }) as unknown as FetchLike
}

function ctx(fetch: FetchLike, config: AppConfig = {}): ConnectorContext {
  return { fetch, config, now }
}

describe('World Bank country-profile connector', () => {
  it('stores raw external debt with source, timestamp, indicator and WB name', async () => {
    const profiles = await fetchCountryProfiles(
      ctx(
        buildFetch({
          extDebt: 60,
          name: 'Nigeria',
          year: '2023',
        }),
      ),
      [{ code: 'NG', comtradeCode: '566' }],
    )
    expect(profiles).toHaveLength(1)
    const p = profiles[0]
    expect(p.code).toBe('NG')
    expect(p.name).toBe('Nigeria') // sourced from the WB payload, not hardcoded

    // The raw, published value is stored — NOT a derived label.
    expect(p.externalDebtPctGni).toBe(60)
    const raw = p.evidence.externalDebtPctGni
    expect(raw?.sourceIds).toEqual(['src.worldbank'])
    expect(raw?.asOf).toContain('2023')
    expect(raw?.indicator).toBe('DT.DOD.DECT.GN.ZS')

    // No classification happens in the connector: no banded/derived labels appear.
    expect(p.dollarDebtExposure).toBeUndefined()
    expect(p.oilStance).toBeUndefined()
    expect(p.currencyRegime).toBeUndefined()
    expect(p.politicalSensitivities).toBeUndefined()
    expect(p.keyExports).toBeUndefined()
    expect(p.importDependence).toBeUndefined()

    // The raw-only profile passes verification against the real source registry.
    const { profiles: ok, rejected } = verifiedCountryProfiles(profiles, known)
    expect(ok).toHaveLength(1)
    expect(rejected).toHaveLength(0)
  })

  it('stores the raw value as published, without banding it', async () => {
    const [a] = await fetchCountryProfiles(ctx(buildFetch({ extDebt: 30 })), [{ code: 'KE' }])
    expect(a.externalDebtPctGni).toBe(30)
    expect(a.dollarDebtExposure).toBeUndefined() // no label without methodology

    const [b] = await fetchCountryProfiles(ctx(buildFetch({ extDebt: 10 })), [{ code: 'ZA' }])
    expect(b.externalDebtPctGni).toBe(10)
    expect(b.dollarDebtExposure).toBeUndefined()
  })

  it('enriches exports/imports from Comtrade when a key is configured', async () => {
    const fetch = buildFetch({
      extDebt: 60,
      name: 'Nigeria',
      comtradeX: [
        { cmdCode: '27', cmdDesc: 'Mineral fuels, oils', primaryValue: 1000, refYear: 2022 },
        { cmdCode: '99', cmdDesc: 'Commodities not specified', primaryValue: 50, refYear: 2022 },
        { cmdCode: 'TOTAL', cmdDesc: 'All Commodities', primaryValue: 99999, refYear: 2022 },
      ],
      comtradeM: [{ cmdCode: '84', cmdDesc: 'Machinery', primaryValue: 500, refYear: 2022 }],
    })
    const [p] = await fetchCountryProfiles(ctx(fetch, { comtradeApiKey: 'k' }), [
      { code: 'NG', comtradeCode: '566' },
    ])
    // aggregate / vague buckets excluded; ranked by value
    expect(p.keyExports).toEqual(['mineral fuels, oils'])
    const exportEvidence = p.evidence.keyExports
    expect(exportEvidence?.sourceIds).toEqual(['src.comtrade'])
    expect(exportEvidence?.asOf).toContain('2022')
    // product-level metadata: reporter / flow / scheme / product codes / year
    expect(exportEvidence?.reporterCode).toBe('566')
    expect(exportEvidence?.flowCode).toBe('X')
    expect(exportEvidence?.classification).toBe('HS')
    expect(exportEvidence?.productCodes).toEqual(['27'])
    expect(exportEvidence?.refYear).toBe(2022)

    expect(p.importDependence).toEqual(['machinery'])
    expect(p.evidence.importDependence?.sourceIds).toEqual(['src.comtrade'])
    expect(p.evidence.importDependence?.flowCode).toBe('M')
    expect(p.evidence.importDependence?.productCodes).toEqual(['84'])

    // src.comtrade is registered and product metadata is present, so it verifies.
    expect(verifiedCountryProfiles([p], known).rejected).toHaveLength(0)
  })

  it('omits a country when required World Bank fields cannot be sourced', async () => {
    // No external-debt datapoint -> backbone incomplete -> country dropped.
    const noDebt = await fetchCountryProfiles(ctx(buildFetch({ extDebt: null })), [{ code: 'NG' }])
    expect(noDebt).toHaveLength(0)

    // World Bank unreachable -> nothing fabricated.
    const down = await fetchCountryProfiles(ctx(buildFetch({ wbOk: false })), [{ code: 'NG' }])
    expect(down).toHaveLength(0)
  })

  it('produces verifiable profiles for every launch market', async () => {
    const profiles = await fetchCountryProfiles(
      ctx(buildFetch({ extDebt: 40, name: 'Market' })),
      LAUNCH_MARKETS,
    )
    expect(profiles.map((p) => p.code).sort()).toEqual(['ET', 'GH', 'KE', 'NG', 'ZA'])
    expect(verifiedCountryProfiles(profiles, known).rejected).toHaveLength(0)
  })
})

describe('Comtrade connector', () => {
  it('is disabled without a key and fails closed on errors', async () => {
    const disabled = await fetchComtradeTopProducts(ctx(buildFetch({}), {}), '566', 'X')
    expect(disabled).toBeNull()

    const errored = await fetchComtradeTopProducts(
      ctx(buildFetch({ comtradeX: null }), { comtradeApiKey: 'k' }),
      '566',
      'X',
    )
    expect(errored).toBeNull()
  })
})
