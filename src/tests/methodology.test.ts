import { describe, it, expect } from 'vitest'
import { applyBands } from '../domain/methodology'
import {
  DEBT_EXPOSURE_BANDING_V1,
  METHODOLOGIES,
  deriveCountryProfiles,
} from '../server/analysis/methodologies'
import {
  countryProfileEvidenceReasons,
  verifiedCountryProfiles,
} from '../server/verification/countryProfiles'
import { knownSourceIds } from '../server/verification/sources'
import { composeAnalysisDraft } from '../server/analysis/composeAnalysisDraft'
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
