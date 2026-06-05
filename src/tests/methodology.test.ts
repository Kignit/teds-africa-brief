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

  it('emits no high/medium/low exposure label without an approved methodology', () => {
    // The shipped methodologies are all draft.
    const [shipped] = deriveCountryProfiles([rawProfile()], METHODOLOGIES)
    expect(shipped.dollarDebtExposure).toBeUndefined()
    expect(shipped.externalDebtPctGni).toBe(60) // raw value remains

    // Explicit draft, and none at all.
    expect(
      deriveCountryProfiles([rawProfile()], [DEBT_EXPOSURE_BANDING_V1])[0].dollarDebtExposure,
    ).toBeUndefined()
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
    const base = rawProfile()
    const draftBacked: CountryProfile = {
      ...base,
      dollarDebtExposure: 'high',
      evidence: {
        ...base.evidence,
        dollarDebtExposure: {
          sourceIds: ['src.worldbank'],
          asOf: AS_OF,
          methodologyId: DEBT_EXPOSURE_BANDING_V1.id,
        },
      },
      methodologies: [DEBT_EXPOSURE_BANDING_V1], // draft
    }
    expect(countryProfileEvidenceReasons(draftBacked).some((r) => /not approved/i.test(r))).toBe(
      true,
    )
  })

  it('makes no debt-exposure claim from a raw value alone (no approved methodology)', () => {
    const profile = rawProfile()
    // a raw-only profile is itself valid
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

// The real oil-stance banding methodology, but approved, to exercise the derive path.
const APPROVED_OIL: Methodology = { ...OILSTANCE_BANDING_V1, status: 'approved' }

type PetroleumValue = Partial<{ exportValueUsd: number; importValueUsd: number; refYear: number }>

// A profile carrying contract-valid raw petroleumTrade (Comtrade) and nothing derived. The
// export/import values are overridable to drive the banding (net exporter by default).
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

describe('oilStance methodology-gated derivation', () => {
  const stance = (v: PetroleumValue) =>
    deriveCountryProfiles([petroleumProfile(v)], [APPROVED_OIL])[0].oilStance

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

  it('emits no oilStance without an approved methodology (the shipped rule is draft)', () => {
    const [shipped] = deriveCountryProfiles([petroleumProfile()], METHODOLOGIES)
    expect(shipped.oilStance).toBeUndefined()
    expect(shipped.petroleumTrade).toBeDefined() // raw input remains

    expect(
      deriveCountryProfiles([petroleumProfile()], [OILSTANCE_BANDING_V1])[0].oilStance,
    ).toBeUndefined()
    expect(deriveCountryProfiles([petroleumProfile()], [])[0].oilStance).toBeUndefined()
  })

  it('derives oilStance with source + methodology provenance once approved', () => {
    const [p] = deriveCountryProfiles([petroleumProfile()], [APPROVED_OIL])
    expect(p.oilStance).toBe('exporter')
    expect(p.evidence.oilStance?.sourceIds).toEqual(['src.comtrade']) // carried from petroleumTrade
    expect(p.evidence.oilStance?.methodologyId).toBe(APPROVED_OIL.id)
    expect(p.methodologies?.some((m) => m.id === APPROVED_OIL.id)).toBe(true)
    expect(verifiedCountryProfiles([p], known).rejected).toHaveLength(0)
  })

  it('makes no oil-shock claim while the methodology is draft (oil_shock stays blocked)', () => {
    const [p] = deriveCountryProfiles([petroleumProfile()], METHODOLOGIES) // draft -> no oilStance
    const draft = composeAnalysisDraft({
      figures: [],
      events: [oilEvent()],
      profiles: [p],
      now: () => AS_OF,
    })
    expect(draft.causalLinks.find((l) => l.shockType === 'oil_shock')).toBeUndefined()
    expect(draft.claims).toHaveLength(0)
  })

  it('makes a methodology-backed, gate-valid oil-shock claim once oilStance exists', () => {
    const [p] = deriveCountryProfiles([petroleumProfile()], [APPROVED_OIL])
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
    expect(effect?.evidence.methodologyIds).toContain(APPROVED_OIL.id)

    // The full path is gate-valid: injecting the approved methodology into the gate registry
    // (overriding the shipped draft) lets the composed brief pass the publish gate.
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
    expect(runPublishGate(brief, { methodologyRegistry: [APPROVED_OIL] }).passed).toBe(true)
  })
})
