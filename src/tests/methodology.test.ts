import { describe, it, expect } from 'vitest'
import { applyBands } from '../domain/methodology'
import {
  DEBT_EXPOSURE_BANDING_V1,
  OILSTANCE_BANDING_V1,
  METHODOLOGIES,
  deriveCountryProfiles,
} from '../server/analysis/methodologies'
import {
  countryProfileEvidenceReasons,
  verifiedCountryProfiles,
} from '../server/verification/countryProfiles'
import { knownSourceIds } from '../server/verification/sources'
import { composeAnalysisDraft } from '../server/analysis/composeAnalysisDraft'
import { composeBriefFromAnalysis } from '../server/analysis/buildBrief'
import { runPublishGate } from '../server/publishing/publishGate'
import { SOURCES } from '../data/sources'
import { derivedWithoutMethodologyProfile } from './fixtures/countryProfiles'
import type { CountryProfile } from '../domain/country'
import type { Methodology } from '../domain/methodology'
import type { Event } from '../domain/event'

const AS_OF = '2026-05-29T06:00:00.000Z'
const known = knownSourceIds(SOURCES)

// The real banding methodology, but approved — used to exercise the derive path.
const APPROVED_DEBT: Methodology = { ...DEBT_EXPOSURE_BANDING_V1, status: 'approved' }

// A raw-only profile: a sourced external-debt figure and nothing derived.
function rawProfile(over: Partial<CountryProfile> = {}): CountryProfile {
  return {
    code: 'XR',
    name: 'Raw Test Market',
    externalDebtPctGni: 60,
    evidence: {
      externalDebtPctGni: {
        sourceIds: ['src.worldbank'],
        asOf: AS_OF,
        indicator: 'DT.DOD.DECT.GN.ZS',
      },
    },
    ...over,
  }
}

function fedEvent(): Event {
  return {
    id: 'fed',
    title: 'Fed signals a cut and the dollar softens',
    summary: '',
    occurredAt: AS_OF,
    countryCodes: [],
    topic: '',
    status: 'corroborated',
    corroboration: {
      newsItemIds: ['n1', 'n2'],
      sourceIds: ['src.a', 'src.b'],
      independentSourceCount: 2,
      primarySourceCount: 0,
    },
  }
}

describe('methodology-gated derivation', () => {
  it('applies explicit bands (the thresholds live in methodology, not code)', () => {
    expect(applyBands(60, DEBT_EXPOSURE_BANDING_V1.bands)).toBe('high')
    expect(applyBands(30, DEBT_EXPOSURE_BANDING_V1.bands)).toBe('medium')
    expect(applyBands(10, DEBT_EXPOSURE_BANDING_V1.bands)).toBe('low')
  })

  it('bands from the shipped (approved) methodology, but not from a draft or none', () => {
    // The shipped registry now approves the banding, so the raw figure is banded.
    const [shipped] = deriveCountryProfiles([rawProfile()], METHODOLOGIES)
    expect(shipped.dollarDebtExposure).toBe('high') // externalDebtPctGni 60 -> high
    expect(shipped.externalDebtPctGni).toBe(60) // raw value remains

    // A draft (unapproved) copy, or no methodology at all, derives nothing.
    const draftDebt: Methodology = { ...DEBT_EXPOSURE_BANDING_V1, status: 'draft' }
    expect(deriveCountryProfiles([rawProfile()], [draftDebt])[0].dollarDebtExposure).toBeUndefined()
    expect(deriveCountryProfiles([rawProfile()], [])[0].dollarDebtExposure).toBeUndefined()
  })

  it('derives a label with source + methodology provenance once approved', () => {
    const [p] = deriveCountryProfiles([rawProfile({ externalDebtPctGni: 60 })], [APPROVED_DEBT])
    expect(p.dollarDebtExposure).toBe('high')
    expect(p.evidence.dollarDebtExposure?.sourceIds).toEqual(['src.worldbank'])
    expect(p.evidence.dollarDebtExposure?.methodologyId).toBe(APPROVED_DEBT.id)
    expect(p.methodologies?.some((m) => m.id === APPROVED_DEBT.id)).toBe(true)
    // and the derived profile passes verification
    expect(verifiedCountryProfiles([p], known).rejected).toHaveLength(0)
  })

  it('fails verification when a derived label has no methodology reference', () => {
    const reasons = countryProfileEvidenceReasons(derivedWithoutMethodologyProfile())
    expect(reasons.some((r) => r.includes('dollarDebtExposure') && /methodology/i.test(r))).toBe(
      true,
    )
    expect(verifiedCountryProfiles([derivedWithoutMethodologyProfile()]).rejected).toHaveLength(1)
  })

  it('fails verification when the referenced methodology is not approved', () => {
    // A draft (unapproved) copy, distinct from the approved shipped registry entry.
    const draftDebt: Methodology = {
      ...DEBT_EXPOSURE_BANDING_V1,
      id: 'method.dollarDebtExposure.banding.draft',
      status: 'draft',
    }
    const base = rawProfile()
    const draftBacked: CountryProfile = {
      ...base,
      dollarDebtExposure: 'high',
      evidence: {
        ...base.evidence,
        dollarDebtExposure: {
          sourceIds: ['src.worldbank'],
          asOf: AS_OF,
          methodologyId: draftDebt.id,
        },
      },
      methodologies: [draftDebt],
    }
    expect(countryProfileEvidenceReasons(draftBacked).some((r) => /not approved/i.test(r))).toBe(
      true,
    )
  })

  it('makes no debt-exposure claim from a raw value alone (no derived label)', () => {
    const profile = rawProfile()
    // a raw-only profile (external debt figure but no derived exposure label) is itself valid
    expect(verifiedCountryProfiles([profile], known).rejected).toHaveLength(0)

    const draft = composeAnalysisDraft({
      figures: [],
      events: [fedEvent()],
      profiles: [profile],
      now: () => AS_OF,
    })
    // no dollar/rates exposure effect is produced at all
    expect(draft.causalLinks.find((l) => l.shockType === 'dollar_rates_shock')).toBeUndefined()
    // and nothing cites the exposure label or any methodology
    const effects = draft.causalLinks.flatMap((l) => l.effects)
    expect(
      effects.some((e) => e.evidence.profileFields.some((f) => f.endsWith('.dollarDebtExposure'))),
    ).toBe(false)
    expect(effects.some((e) => e.evidence.methodologyIds.length > 0)).toBe(false)
  })

  it('makes a methodology-backed debt-exposure claim once a label exists', () => {
    const [derived] = deriveCountryProfiles(
      [rawProfile({ externalDebtPctGni: 60 })],
      [APPROVED_DEBT],
    )
    const draft = composeAnalysisDraft({
      figures: [],
      events: [fedEvent()],
      profiles: [derived],
      now: () => AS_OF,
    })
    const link = draft.causalLinks.find((l) => l.shockType === 'dollar_rates_shock')
    expect(link).toBeDefined()
    const effect = link!.effects.find((e) => e.countryCode === 'XR')
    expect(effect?.evidence.profileFields).toContain('XR.dollarDebtExposure')
    expect(effect?.evidence.methodologyIds).toContain(APPROVED_DEBT.id)
  })
})

type PetroleumValue = Partial<{ exportValueUsd: number; importValueUsd: number; refYear: number }>

// A profile carrying contract-valid raw petroleumTrade (Comtrade). Only the export/import
// values vary across cases; the code stays 'NG' on purpose, so the tests prove the label is
// driven by the raw numbers and never by country identity.
function petroleumProfile(value: PetroleumValue = {}): CountryProfile {
  return {
    code: 'NG',
    name: 'Nigeria',
    externalDebtPctGni: 40,
    petroleumTrade: { exportValueUsd: 50e9, importValueUsd: 20e9, refYear: 2022, ...value },
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
        refYear: 2022,
      },
    },
  }
}

function oilEvent(): Event {
  return {
    id: 'oil',
    title: 'Oil jumps as Middle East tension threatens supply',
    summary: '',
    occurredAt: AS_OF,
    countryCodes: ['NG'],
    topic: '',
    status: 'corroborated',
    corroboration: {
      newsItemIds: ['n1', 'n2'],
      sourceIds: ['src.a', 'src.b'],
      independentSourceCount: 2,
      primarySourceCount: 0,
    },
  }
}

// A refinery capacity / throughput story: names crude/petroleum but is not an oil-price move.
function dangoteEvent(): Event {
  return {
    id: 'dangote',
    title: 'Dangote refinery raises processing capacity to 700,000 barrels per day',
    summary:
      'Dangote Petroleum Refinery has increased its crude processing capacity to 700,000 barrels per day following a performance test by process licensors.',
    occurredAt: AS_OF,
    countryCodes: ['NG'],
    topic: '',
    status: 'corroborated',
    corroboration: {
      newsItemIds: ['n1', 'n2'],
      sourceIds: ['src.a', 'src.b'],
      independentSourceCount: 2,
      primarySourceCount: 0,
    },
  }
}

// The oil-stance methodology is APPROVED as of this PR, so these tests exercise the real
// shipped METHODOLOGIES / METHODOLOGY_REGISTRY directly - no injected or synthetic approval.
describe('oilStance methodology-gated derivation (approved)', () => {
  const stance = (v: PetroleumValue) =>
    deriveCountryProfiles([petroleumProfile(v)], METHODOLOGIES)[0].oilStance

  it('bands the normalized net petroleum position into exporter / neutral / importer', () => {
    expect(stance({ exportValueUsd: 50e9, importValueUsd: 20e9 })).toBe('exporter') // +0.43
    expect(stance({ exportValueUsd: 10e9, importValueUsd: 50e9 })).toBe('importer') // -0.67
    expect(stance({ exportValueUsd: 30e9, importValueUsd: 30e9 })).toBe('neutral') // 0.0
    expect(stance({ exportValueUsd: 60e9, importValueUsd: 40e9 })).toBe('exporter') // exactly +0.2
  })

  it('treats sub-threshold total petroleum trade as neutral (no tiny-flow over-reading)', () => {
    // A large RATIO but a tiny absolute total (below minInputUsd) must not read as exporter.
    expect(stance({ exportValueUsd: 0.6e9, importValueUsd: 0.1e9 })).toBe('neutral')
  })

  it('assigns each launch market the label its raw petroleum position implies', () => {
    // Real HS-27 magnitudes from the current artifact (origin/main 1272605). Each label is
    // COMPUTED from the numbers by the approved methodology; identity never enters it (every
    // case runs on a profile still coded 'NG'). GH is the borderline case and stays neutral
    // under the approved thresholds - it must not be silently tuned into importer.
    const labelOf = (exportValueUsd: number, importValueUsd: number) =>
      stance({ exportValueUsd, importValueUsd })
    const byMarket = {
      NG: labelOf(185.602e9, 62.298e9),
      ET: labelOf(0.001e9, 2.651e9),
      KE: labelOf(1.065e9, 4.757e9),
      ZA: labelOf(38.039e9, 73.987e9),
      GH: labelOf(16.196e9, 21.049e9),
    }
    expect(byMarket).toEqual({
      NG: 'exporter',
      ET: 'importer',
      KE: 'importer',
      ZA: 'importer',
      GH: 'neutral',
    })
  })

  it('derives oilStance from the shipped methodology with source + methodology provenance', () => {
    const [p] = deriveCountryProfiles([petroleumProfile()], METHODOLOGIES)
    expect(p.oilStance).toBe('exporter')
    expect(p.evidence.oilStance?.sourceIds).toEqual(['src.comtrade']) // carried from petroleumTrade
    expect(p.evidence.oilStance?.methodologyId).toBe(OILSTANCE_BANDING_V1.id)
    expect(p.methodologies?.some((m) => m.id === OILSTANCE_BANDING_V1.id)).toBe(true)
    expect(verifiedCountryProfiles([p], known).rejected).toHaveLength(0)
  })

  it('still derives no oilStance when no methodology is supplied', () => {
    const [p] = deriveCountryProfiles([petroleumProfile()], [])
    expect(p.oilStance).toBeUndefined()
    expect(p.petroleumTrade).toBeDefined() // raw input remains
  })

  it('unlocks a gate-valid oil-shock claim with full methodology + provenance evidence', () => {
    const [p] = deriveCountryProfiles([petroleumProfile()], METHODOLOGIES)
    const analysis = composeAnalysisDraft({
      figures: [],
      events: [oilEvent()],
      profiles: [p],
      now: () => AS_OF,
    })
    const link = analysis.causalLinks.find((l) => l.shockType === 'oil_shock')
    expect(link).toBeDefined()
    const effect = link!.effects.find((e) => e.countryCode === 'NG')
    expect(effect?.evidence.profileFields).toContain('NG.oilStance')
    expect(effect?.evidence.methodologyIds).toContain(OILSTANCE_BANDING_V1.id)

    const claim = analysis.claims.find((c) => c.shockType === 'oil_shock' && c.countryCode === 'NG')
    expect(claim).toBeDefined()
    expect(claim!.methodologyIds).toContain(OILSTANCE_BANDING_V1.id) // banding methodology cited
    expect(claim!.methodologyIds).toContain('method.causal.oil_shock.v1') // causal rule cited
    expect(claim!.profileFields).toContain('NG.oilStance')
    expect(claim!.profileSourceIds).toContain('src.comtrade')

    // The shipped methodology is approved in the real METHODOLOGY_REGISTRY, so the brief
    // passes the publish gate with NO injected registry override.
    const brief = composeBriefFromAnalysis({
      id: 'b',
      date: '2026-05-29',
      edition: 'daily',
      dataMode: 'live',
      analysis,
      figures: [],
      events: [oilEvent()],
      profiles: [p],
    })
    expect(runPublishGate(brief).passed).toBe(true)
  })

  it('does not produce an oil-price claim for a refinery capacity story, even with oilStance', () => {
    // Semantic guard: the profile HAS oilStance (exporter), but a refinery-capacity event is
    // not an oil-price move, so it must yield no oil_shock link or claim.
    const [p] = deriveCountryProfiles([petroleumProfile()], METHODOLOGIES)
    expect(p.oilStance).toBe('exporter')
    const analysis = composeAnalysisDraft({
      figures: [],
      events: [dangoteEvent()],
      profiles: [p],
      now: () => AS_OF,
    })
    expect(analysis.causalLinks.find((l) => l.shockType === 'oil_shock')).toBeUndefined()
    expect(analysis.claims.some((c) => c.shockType === 'oil_shock')).toBe(false)
  })
})
