import { describe, it, expect, vi } from 'vitest'
import {
  fetchCountryProfiles,
  type ProfileTradeDiagnostic,
} from '../server/connectors/countryProfile'
import {
  fetchComtradeTopProducts,
  createComtradeLimiter,
  createComtradeRateLimit,
  type ComtradeFlowDiagnostic,
} from '../server/connectors/comtrade'
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

// Instant Comtrade rate limit for tests: no inter-request gap, no real backoff sleeps.
const instantRate = () => createComtradeRateLimit({ minGapMs: 0, sleep: async () => {} })

// Build NG's profile with a routed fetch (WB backbone always OK; OEC routed per test),
// no Comtrade key, collecting the trade-enrichment diagnostics.
async function runNG(oecFetch: (url: string) => Response) {
  const diags: ProfileTradeDiagnostic[] = []
  const fetch = vi.fn(async (url: string) =>
    url.includes('worldbank.org') ? wbResponse(60) : oecFetch(url),
  )
  const ctx: ConnectorContext = { fetch: fetch as unknown as FetchLike, config: {}, now }
  const profiles = await fetchCountryProfiles(ctx, [NG], (d) => diags.push(d), instantRate())
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

// Comtrade (keyed PRIMARY) response shape — see src/server/connectors/comtrade.ts. It is
// the reliable CI trade source: oec.world is Cloudflare-blocked from GitHub runner IPs
// (uniform HTTP 403), so the keyed Comtrade path is how trade fields reach a CI artifact.
interface CRow {
  cmdCode: string
  cmdDesc: string
  primaryValue: number
  refYear: number
}
function comtradeResponse(rows: CRow[]): Response {
  return {
    ok: true,
    status: 200,
    json: async () => ({ data: rows }),
    text: async () => '',
  } as unknown as Response
}
const CT_EXPORTS: CRow[] = [
  { cmdCode: '27', cmdDesc: 'Mineral fuels and oils', primaryValue: 52e9, refYear: 2023 },
  { cmdCode: '12', cmdDesc: 'Oil seeds', primaryValue: 4e9, refYear: 2023 },
]
const CT_IMPORTS: CRow[] = [
  { cmdCode: '84', cmdDesc: 'Machinery', primaryValue: 18e9, refYear: 2023 },
]
const comtradeOk = (url: string) =>
  url.includes('flowCode=X') ? comtradeResponse(CT_EXPORTS) : comtradeResponse(CT_IMPORTS)
// A 200 body with no `data` array — MALFORMED (distinct from an empty {data:[]}).
const COMTRADE_MALFORMED = {
  ok: true,
  status: 200,
  json: async () => ({ message: 'service notice, no data' }),
  text: async () => '',
} as unknown as Response
// Find one diagnostic by stage (+ optional flow) to assert a per-flow outcome / detail.
const findD = (d: ProfileTradeDiagnostic[], stage: string, flow?: 'X' | 'M') =>
  d.find((x) => x.stage === stage && x.flow === flow)
// A 429 (rate-limited) response; optional Retry-After header (seconds, as a string).
const comtrade429 = (retryAfter: string | null = null) =>
  ({
    ok: false,
    status: 429,
    headers: { get: (k: string) => (k.toLowerCase() === 'retry-after' ? retryAfter : null) },
    json: async () => ({}),
    text: async () => '',
  }) as unknown as Response

// Like runNG but with an explicit config (e.g. a Comtrade key) and a full URL router, so
// the Comtrade-primary path and the Comtrade/OEC fallbacks can be exercised. The World
// Bank backbone is always OK; everything else is routed by the test.
async function runNGRouted(config: ConnectorContext['config'], route: (url: string) => Response) {
  const diags: ProfileTradeDiagnostic[] = []
  const fetch = vi.fn(async (url: string) =>
    url.includes('worldbank.org') ? wbResponse(60) : route(url),
  )
  const ctx: ConnectorContext = { fetch: fetch as unknown as FetchLike, config, now }
  const profiles = await fetchCountryProfiles(ctx, [NG], (d) => diags.push(d), instantRate())
  return { profile: profiles[0], diags: diags.filter((d) => d.code === 'NG'), fetch }
}

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

  it('Comtrade populated (key present): comtrade=populated, OEC not attempted, src.comtrade', async () => {
    const { profile, diags, fetch } = await runNGRouted({ comtradeApiKey: 'k' }, (url) =>
      url.includes('comtradeapi.un.org') ? comtradeOk(url) : NOT_OK,
    )
    expect(profile.keyExports).toEqual(['mineral fuels and oils', 'oil seeds'])
    expect(profile.evidence.keyExports!.sourceIds).toEqual(['src.comtrade'])
    expect(profile.evidence.importDependence!.sourceIds).toEqual(['src.comtrade'])
    expect(findD(diags, 'comtrade', 'X')?.outcome).toBe('populated')
    expect(findD(diags, 'comtrade', 'M')?.outcome).toBe('populated')
    // Comtrade filled both fields, so OEC (Cloudflare-blocked from CI) is never consulted.
    expect(diags.some((d) => d.stage === 'oec')).toBe(false)
    expect(fetch.mock.calls.some((c) => String(c[0]).includes('olap-proxy'))).toBe(false)
  })

  it('Comtrade partial: export-only populated, import non_ok(status) -> keyExports only', async () => {
    // Mirrors the live Kenya result: X returns products, M is rejected (e.g. rate-limited).
    const { profile, diags } = await runNGRouted({ comtradeApiKey: 'k' }, (url) =>
      !url.includes('comtradeapi.un.org')
        ? NOT_OK // OEC (fallback for the missing import) is 403 in CI
        : url.includes('flowCode=X')
          ? comtradeResponse(CT_EXPORTS)
          : NOT_OK,
    )
    expect(profile.keyExports).toEqual(['mineral fuels and oils', 'oil seeds'])
    expect(profile.evidence.keyExports!.sourceIds).toEqual(['src.comtrade'])
    expect(profile.importDependence).toBeUndefined() // import flow failed, OEC 403 -> omitted
    expect(findD(diags, 'comtrade', 'X')?.outcome).toBe('populated')
    const m = findD(diags, 'comtrade', 'M')
    expect(m?.outcome).toBe('non_ok')
    expect(m?.detail).toBe('HTTP 503')
  })

  it('Comtrade non_ok both flows + OEC fail: per-flow non_ok(status); fields omitted fail-closed', async () => {
    const { profile, diags } = await runNGRouted({ comtradeApiKey: 'k' }, () => NOT_OK)
    expect(profile.externalDebtPctGni).toBe(60) // WB backbone intact, nothing fabricated
    expect(profile.keyExports).toBeUndefined()
    expect(profile.importDependence).toBeUndefined()
    expect(findD(diags, 'comtrade', 'X')?.outcome).toBe('non_ok')
    expect(findD(diags, 'comtrade', 'X')?.detail).toBe('HTTP 503')
    expect(findD(diags, 'comtrade', 'M')?.outcome).toBe('non_ok')
    expect(has(diags, 'oec', 'non_ok')).toBe(true)
  })

  it('Comtrade empty (key present): per-flow empty; trade fields omitted', async () => {
    const { profile, diags } = await runNGRouted({ comtradeApiKey: 'k' }, (url) =>
      url.includes('comtradeapi.un.org') ? comtradeResponse([]) : NOT_OK,
    )
    expect(profile.keyExports).toBeUndefined()
    expect(profile.importDependence).toBeUndefined()
    expect(findD(diags, 'comtrade', 'X')?.outcome).toBe('empty')
    expect(findD(diags, 'comtrade', 'M')?.outcome).toBe('empty')
  })

  it('Comtrade malformed (key present): per-flow malformed; fails closed without throwing', async () => {
    const { profile, diags } = await runNGRouted({ comtradeApiKey: 'k' }, (url) =>
      url.includes('comtradeapi.un.org') ? COMTRADE_MALFORMED : NOT_OK,
    )
    expect(profile.externalDebtPctGni).toBe(60) // resolved — malformed did not throw
    expect(profile.keyExports).toBeUndefined()
    expect(profile.importDependence).toBeUndefined()
    expect(findD(diags, 'comtrade', 'X')?.outcome).toBe('malformed')
    expect(findD(diags, 'comtrade', 'M')?.outcome).toBe('malformed')
  })
})

describe('Comtrade rate-limit handling', () => {
  const keyedCtx = (fetch: ReturnType<typeof vi.fn>): ConnectorContext => ({
    fetch: fetch as unknown as FetchLike,
    config: { comtradeApiKey: 'k' },
    now,
  })

  it('429 then success: retries and populates with src.comtrade provenance + metadata', async () => {
    let n = 0
    const fetch = vi.fn(async () => {
      n += 1
      return n < 3 ? comtrade429('0') : comtradeResponse(CT_EXPORTS)
    })
    const diags: ComtradeFlowDiagnostic[] = []
    const result = await fetchComtradeTopProducts(keyedCtx(fetch), '566', 'X', 3, {
      onDiag: (d) => diags.push(d),
      rate: { sleep: async () => {}, maxAttempts: 4, backoffBaseMs: 1 },
    })
    expect(fetch).toHaveBeenCalledTimes(3)
    expect(result?.products).toEqual(['mineral fuels and oils', 'oil seeds'])
    expect(result?.sourceId).toBe('src.comtrade')
    expect(result?.productCodes).toEqual(['27', '12'])
    expect(result?.flowCode).toBe('X')
    expect(result?.classification).toBe('HS')
    expect(diags.at(-1)).toMatchObject({ flow: 'X', outcome: 'populated', attempts: 3 })
  })

  it('persistent 429: omits the field and reports status + attempts', async () => {
    const fetch = vi.fn(async () => comtrade429('0'))
    const diags: ComtradeFlowDiagnostic[] = []
    const result = await fetchComtradeTopProducts(keyedCtx(fetch), '566', 'M', 3, {
      onDiag: (d) => diags.push(d),
      rate: { sleep: async () => {}, maxAttempts: 3, backoffBaseMs: 1 },
    })
    expect(result).toBeNull()
    expect(fetch).toHaveBeenCalledTimes(3)
    expect(diags).toEqual([{ flow: 'M', outcome: 'non_ok', status: 429, attempts: 3 }])
  })

  it('honours Retry-After before retrying', async () => {
    const waits: number[] = []
    let n = 0
    const fetch = vi.fn(async () => {
      n += 1
      return n < 2 ? comtrade429('7') : comtradeResponse(CT_IMPORTS)
    })
    await fetchComtradeTopProducts(keyedCtx(fetch), '566', 'M', 3, {
      rate: {
        sleep: async (ms) => {
          waits.push(ms)
        },
        maxAttempts: 4,
        backoffBaseMs: 1,
      },
    })
    expect(waits[0]).toBe(7000) // Retry-After: 7 honoured, not the 1ms backoff base
  })

  it('no-key path skips Comtrade cleanly (no fetch, skipped_no_key)', async () => {
    const fetch = vi.fn(async () => comtradeResponse(CT_EXPORTS))
    const diags: ComtradeFlowDiagnostic[] = []
    const result = await fetchComtradeTopProducts(
      { fetch: fetch as unknown as FetchLike, config: {}, now },
      '566',
      'X',
      3,
      { onDiag: (d) => diags.push(d) },
    )
    expect(result).toBeNull()
    expect(fetch).not.toHaveBeenCalled()
    expect(diags).toEqual([{ flow: 'X', outcome: 'skipped_no_key' }])
  })

  it('createComtradeLimiter runs scheduled tasks one at a time (concurrency 1)', async () => {
    const limiter = createComtradeLimiter(0, async () => {})
    let active = 0
    let maxActive = 0
    const task = () =>
      limiter.schedule(async () => {
        active += 1
        maxActive = Math.max(maxActive, active)
        await Promise.resolve()
        active -= 1
      })
    await Promise.all([task(), task(), task(), task()])
    expect(maxActive).toBe(1)
  })
})

describe('Comtrade product ranking (dedupe by HS code)', () => {
  const ctxFor = (fetch: ReturnType<typeof vi.fn>): ConnectorContext => ({
    fetch: fetch as unknown as FetchLike,
    config: { comtradeApiKey: 'k' },
    now,
  })

  it('collapses duplicate HS codes into one category, summing value for the ranking', async () => {
    // 27 appears twice (30e9 + 30e9 = 60e9). Per row it would lose to 71 (50e9) and could
    // even appear twice in the list; aggregated, it is one entry and outranks 71.
    const rows: CRow[] = [
      { cmdCode: '27', cmdDesc: 'Mineral fuels and oils', primaryValue: 30e9, refYear: 2023 },
      { cmdCode: '27', cmdDesc: 'Mineral fuels and oils', primaryValue: 30e9, refYear: 2023 },
      { cmdCode: '71', cmdDesc: 'Pearls and precious stones', primaryValue: 50e9, refYear: 2023 },
    ]
    const result = await fetchComtradeTopProducts(
      ctxFor(vi.fn(async () => comtradeResponse(rows))),
      '566',
      'X',
      3,
      {},
    )
    expect(result?.productCodes).toEqual(['27', '71'])
    expect(result?.products).toEqual(['mineral fuels and oils', 'pearls and precious stones'])
  })

  it('topN returns unique product codes when duplicates exceed topN', async () => {
    const rows: CRow[] = [
      { cmdCode: '27', cmdDesc: 'Fuels', primaryValue: 10e9, refYear: 2023 },
      { cmdCode: '27', cmdDesc: 'Fuels', primaryValue: 9e9, refYear: 2023 },
      { cmdCode: '84', cmdDesc: 'Machinery', primaryValue: 8e9, refYear: 2023 },
      { cmdCode: '84', cmdDesc: 'Machinery', primaryValue: 7e9, refYear: 2023 },
      { cmdCode: '87', cmdDesc: 'Vehicles', primaryValue: 6e9, refYear: 2023 },
      { cmdCode: '10', cmdDesc: 'Cereals', primaryValue: 1e9, refYear: 2023 },
    ]
    const result = await fetchComtradeTopProducts(
      ctxFor(vi.fn(async () => comtradeResponse(rows))),
      '566',
      'M',
      3,
      {},
    )
    expect(result?.productCodes).toHaveLength(3)
    expect(new Set(result?.productCodes).size).toBe(3) // all unique
    expect(result?.productCodes).toEqual(['27', '84', '87']) // top 3 by summed value
  })

  it('fails closed (null, empty) when no row carries a usable HS code', async () => {
    // Rows pass isProductRow (valid desc + value) but carry no cmdCode -> nothing to rank.
    const rows = [
      { cmdDesc: 'Mystery good', primaryValue: 5e9, refYear: 2023 },
      { cmdDesc: 'Another good', primaryValue: 4e9, refYear: 2023 },
    ] as unknown as CRow[]
    const diags: ComtradeFlowDiagnostic[] = []
    const result = await fetchComtradeTopProducts(
      ctxFor(vi.fn(async () => comtradeResponse(rows))),
      '566',
      'X',
      3,
      { onDiag: (d) => diags.push(d) },
    )
    expect(result).toBeNull()
    expect(diags.at(-1)?.outcome).toBe('empty')
  })
})
