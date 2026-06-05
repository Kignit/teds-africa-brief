import { describe, it, expect, vi } from 'vitest'
import { fetchComtradePetroleum, createComtradeRateLimit } from '../server/connectors/comtrade'
import { fetchOecPetroleum } from '../server/connectors/oec'
import {
  fetchCountryProfiles,
  type ProfileTradeDiagnostic,
} from '../server/connectors/countryProfile'
import {
  countryProfileFieldReasons,
  verifiedCountryProfiles,
} from '../server/verification/countryProfiles'
import { composeAnalysisDraft } from '../server/analysis/composeAnalysisDraft'
import type { ConnectorContext, FetchLike } from '../server/connectors/types'
import type { CountryProfile, CountryProfileEvidence } from '../domain/country'
import type { Event } from '../domain/event'

const now = () => '2026-06-05T00:00:00.000Z'
const AS_OF = '2023-12-31T00:00:00.000Z'
const RATE = { sleep: async () => {}, maxAttempts: 2, backoffBaseMs: 1 }
const KNOWN = new Set(['src.comtrade', 'src.oec', 'src.worldbank'])
const instantRate = () => createComtradeRateLimit({ minGapMs: 0, sleep: async () => {} })

// --- Comtrade cmdCode=27 responses (petroleum totals) -----------------------------------
interface CtRow {
  cmdCode: string
  primaryValue?: number
  refYear: number
  cmdDesc?: string
}
const ctOk = (rows: CtRow[]) =>
  ({
    ok: true,
    status: 200,
    json: async () => ({ data: rows }),
    text: async () => '',
  }) as unknown as Response
const ctFail = {
  ok: false,
  status: 500,
  json: async () => ({}),
  text: async () => '',
} as unknown as Response

function comtradeCtx(byFlow: { X: Response; M: Response }): ConnectorContext {
  const fetch = vi.fn(async (url: string) => (url.includes('flowCode=X') ? byFlow.X : byFlow.M))
  return { fetch: fetch as unknown as FetchLike, config: { comtradeApiKey: 'k' }, now }
}

describe('Comtrade petroleum capture (fetchComtradePetroleum, HS-27 totals)', () => {
  it('populates from a common year with both flows (src.comtrade, HS, chapter 27)', async () => {
    const { evidence, reason } = await fetchComtradePetroleum(
      comtradeCtx({
        X: ctOk([{ cmdCode: '27', primaryValue: 50e9, refYear: 2023 }]),
        M: ctOk([{ cmdCode: '27', primaryValue: 20e9, refYear: 2023 }]),
      }),
      '566',
      { rate: RATE },
    )
    expect(reason).toBe('populated')
    expect(evidence).toMatchObject({
      sourceId: 'src.comtrade',
      exportValueUsd: 50e9,
      importValueUsd: 20e9,
      refYear: 2023,
      classification: 'HS',
      productCodes: ['27'],
    })
  })

  it('omits when one flow fails; a failed flow is never coerced to zero', async () => {
    const { evidence, reason } = await fetchComtradePetroleum(
      comtradeCtx({ X: ctOk([{ cmdCode: '27', primaryValue: 50e9, refYear: 2023 }]), M: ctFail }),
      '566',
      { rate: RATE },
    )
    // NOT { exportValueUsd: 50e9, importValueUsd: 0 }; the missing flow omits the field.
    expect(evidence).toBeNull()
    expect(reason).toBe('flow_failed')
  })

  it('accepts a genuine zero only when the flow query succeeded (no HS-27 rows)', async () => {
    const { evidence, reason } = await fetchComtradePetroleum(
      comtradeCtx({
        X: ctOk([{ cmdCode: '27', primaryValue: 50e9, refYear: 2023 }]),
        M: ctOk([]), // query succeeded, no chapter-27 rows -> a valid zero import
      }),
      '566',
      { rate: RATE },
    )
    expect(reason).toBe('populated')
    expect(evidence).toMatchObject({ exportValueUsd: 50e9, importValueUsd: 0, refYear: 2023 })
  })

  it('omits when the flows share no common year (cross-year is rejected, not max-paired)', async () => {
    const { evidence, reason } = await fetchComtradePetroleum(
      comtradeCtx({
        X: ctOk([{ cmdCode: '27', primaryValue: 50e9, refYear: 2023 }]),
        M: ctOk([{ cmdCode: '27', primaryValue: 20e9, refYear: 2022 }]),
      }),
      '566',
      { rate: RATE },
    )
    expect(evidence).toBeNull()
    expect(reason).toBe('cross_year')
  })

  it('skips cleanly without a Comtrade key', async () => {
    const { evidence, reason } = await fetchComtradePetroleum(
      { fetch: vi.fn() as unknown as FetchLike, config: {}, now },
      '566',
      { rate: RATE },
    )
    expect(evidence).toBeNull()
    expect(reason).toBe('skipped_no_key')
  })
})

// --- OEC responses (HS4-ID rows) --------------------------------------------------------
type OecRowT = [string, number, number] // [HS4 ID, Trade Value, Year]
const oecOk = (rows: OecRowT[]) =>
  ({
    ok: true,
    status: 200,
    json: async () => ({
      data: rows.map(([id, tv, Year]) => ({
        'HS4 ID': id,
        'Trade Value': tv,
        Year,
        HS4: 'petroleum',
      })),
    }),
    text: async () => '',
  }) as unknown as Response
function oecCtx(byFlow: { X: Response; M: Response }): ConnectorContext {
  const fetch = vi.fn(async (url: string) =>
    url.includes('Exporter+Country') ? byFlow.X : byFlow.M,
  )
  return { fetch: fetch as unknown as FetchLike, config: {}, now }
}

describe('OEC petroleum fallback (fetchOecPetroleum, same-year only)', () => {
  it('populates from a common year (same-year export/import values)', async () => {
    const ev = await fetchOecPetroleum(
      oecCtx({ X: oecOk([['52709', 60e9, 2023]]), M: oecOk([['52710', 18e9, 2023]]) }),
      'afnga',
    )
    expect(ev).toMatchObject({
      sourceId: 'src.oec',
      exportValueUsd: 60e9,
      importValueUsd: 18e9,
      refYear: 2023,
    })
    expect(ev!.productCodes.every((c) => c.startsWith('27'))).toBe(true)
  })

  it('omits cross-year OEC data (no common export/import year)', async () => {
    const ev = await fetchOecPetroleum(
      oecCtx({ X: oecOk([['52709', 60e9, 2023]]), M: oecOk([['52710', 18e9, 2022]]) }),
      'afnga',
    )
    expect(ev).toBeNull()
  })
})

// --- field-source contract --------------------------------------------------------------
function petroleumProfile(
  value: Partial<{ exportValueUsd: number; importValueUsd: number; refYear: number }> | null = {},
  evidenceOver: Partial<CountryProfileEvidence> = {},
): CountryProfile {
  const petroleumTrade =
    value === null
      ? undefined
      : ({
          exportValueUsd: 50e9,
          importValueUsd: 20e9,
          refYear: 2023,
          ...value,
        } as CountryProfile['petroleumTrade'])
  return {
    code: 'NG',
    name: 'Nigeria',
    externalDebtPctGni: 40,
    petroleumTrade,
    evidence: {
      externalDebtPctGni: {
        sourceIds: ['src.worldbank'],
        asOf: AS_OF,
        indicator: 'DT.DOD.DECT.GN.ZS',
      },
      petroleumTrade: {
        sourceIds: ['src.comtrade'],
        asOf: AS_OF,
        reporterCode: '566',
        classification: 'HS',
        productCodes: ['27'],
        refYear: 2023,
        ...evidenceOver,
      },
    },
  }
}
const ptReasons = (p: CountryProfile) => countryProfileFieldReasons(p, 'petroleumTrade', KNOWN)

describe('petroleumTrade field-source contract', () => {
  it('accepts a fully-sourced petroleumTrade (and the whole profile verifies)', () => {
    const p = petroleumProfile()
    expect(ptReasons(p)).toEqual([])
    expect(verifiedCountryProfiles([p], KNOWN).rejected).toHaveLength(0)
  })

  it('rejects a source not on the contract', () => {
    const reasons = ptReasons(petroleumProfile({}, { sourceIds: ['src.madeup'] }))
    expect(reasons.some((r) => r.includes('not allowed'))).toBe(true)
  })

  it('rejects missing product codes', () => {
    expect(ptReasons(petroleumProfile({}, { productCodes: [] }))).toContain(
      'petroleumTrade missing product codes',
    )
  })

  it('rejects product codes outside HS chapter 27', () => {
    const reasons = ptReasons(petroleumProfile({}, { productCodes: ['84'] }))
    expect(reasons.some((r) => r.includes('not numeric HS chapter 27'))).toBe(true)
  })

  it('rejects a non-HS classification', () => {
    const reasons = ptReasons(petroleumProfile({}, { classification: 'SITC' }))
    expect(reasons.some((r) => r.includes('requires HS classification'))).toBe(true)
  })

  it('rejects a missing reference year', () => {
    expect(ptReasons(petroleumProfile({}, { refYear: undefined }))).toContain(
      'petroleumTrade missing reference year',
    )
  })

  it('rejects when one of the two values is missing', () => {
    const reasons = ptReasons(petroleumProfile({ importValueUsd: undefined }))
    expect(reasons.some((r) => r.includes('requires both export and import values'))).toBe(true)
  })

  it('rejects multi-source evidence (must use exactly one source)', () => {
    const reasons = ptReasons(petroleumProfile({}, { sourceIds: ['src.comtrade', 'src.oec'] }))
    expect(reasons.some((r) => r.includes('exactly one source'))).toBe(true)
  })

  it('rejects missing reporter code', () => {
    const reasons = ptReasons(petroleumProfile({}, { reporterCode: undefined }))
    expect(reasons.some((r) => r.includes('missing reporter code'))).toBe(true)
  })

  it('rejects a malformed product code (e.g. 27abc)', () => {
    const reasons = ptReasons(petroleumProfile({}, { productCodes: ['27abc'] }))
    expect(reasons.some((r) => r.includes('not numeric HS chapter 27'))).toBe(true)
  })

  it('accepts OEC-style HS4 chapter-27 codes (e.g. 2709, 2710)', () => {
    expect(ptReasons(petroleumProfile({}, { productCodes: ['2709', '2710'] }))).toEqual([])
  })
})

// --- engine: petroleumTrade does NOT unlock oil claims (oilStance still absent) ---------
describe('petroleumTrade does not unlock oil claims', () => {
  it('a profile with petroleumTrade but no oilStance yields no oil_shock claim', () => {
    const profile = petroleumProfile() // contract-valid raw fields; no oilStance
    const oil: Event = {
      id: 'oil',
      title: 'Oil jumps as supply fears mount',
      summary: '',
      occurredAt: AS_OF,
      countryCodes: ['NG'],
      topic: '',
      status: 'corroborated',
      corroboration: {
        newsItemIds: ['a', 'b'],
        sourceIds: ['src.a', 'src.b'],
        independentSourceCount: 2,
        primarySourceCount: 0,
      },
    }
    const draft = composeAnalysisDraft({ figures: [], events: [oil], profiles: [profile] })
    expect(draft.causalLinks.find((l) => l.shockType === 'oil_shock')).toBeUndefined()
    expect(draft.claims).toHaveLength(0)
    expect(profile.oilStance).toBeUndefined()
  })
})

// --- connector integration: attach + diagnostics ----------------------------------------
describe('country-profile connector attaches petroleumTrade + a diagnostic', () => {
  function wbResponse(value: number): Response {
    return {
      ok: true,
      status: 200,
      json: async () => [
        { page: 1 },
        [{ date: '2023', value, country: { id: 'NGA', value: 'Nigeria' } }],
      ],
      text: async () => '',
    } as unknown as Response
  }
  it('populates petroleumTrade from Comtrade and logs a populated petroleum diagnostic', async () => {
    const fetch = vi.fn(async (url: string) => {
      if (url.includes('worldbank.org')) return wbResponse(40)
      if (url.includes('comtradeapi.un.org')) {
        if (url.includes('cmdCode=27')) {
          return ctOk([
            {
              cmdCode: '27',
              primaryValue: url.includes('flowCode=X') ? 70e9 : 25e9,
              refYear: 2023,
            },
          ])
        }
        // AG2 top products (keyExports / importDependence)
        return ctOk([
          { cmdCode: '27', cmdDesc: 'Mineral fuels and oils', primaryValue: 70e9, refYear: 2023 },
        ])
      }
      return ctFail
    })
    const ctx: ConnectorContext = {
      fetch: fetch as unknown as FetchLike,
      config: { comtradeApiKey: 'k' },
      now,
    }
    const diags: ProfileTradeDiagnostic[] = []
    const [p] = await fetchCountryProfiles(
      ctx,
      [{ code: 'NG', comtradeCode: '566', oecCode: 'afnga' }],
      (d) => diags.push(d),
      instantRate(),
    )
    expect(p.petroleumTrade).toEqual({ exportValueUsd: 70e9, importValueUsd: 25e9, refYear: 2023 })
    expect(p.evidence.petroleumTrade?.sourceIds).toEqual(['src.comtrade'])
    expect(p.oilStance).toBeUndefined()
    const petro = diags.find((d) => d.stage === 'petroleum')
    expect(petro?.outcome).toBe('populated')
    expect(petro?.detail).toContain('src.comtrade')
    // The whole profile (raw debt + petroleumTrade) verifies under the strict contracts.
    expect(verifiedCountryProfiles([p], KNOWN).rejected).toHaveLength(0)
  })
})
