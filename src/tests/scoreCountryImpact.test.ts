import { describe, it, expect } from 'vitest'
import { scoreCountryImpact } from '../server/analysis/scoreCountryImpact'
import type { CountryProfile, CountryProfileEvidenceMap } from '../domain/country'
import type { Event } from '../domain/event'

const AS_OF = '2026-05-29T06:00:00.000Z'

function event(): Event {
  return {
    id: 'e',
    title: 't',
    summary: '',
    occurredAt: AS_OF,
    countryCodes: [],
    topic: '',
    status: 'corroborated',
    corroboration: {
      newsItemIds: ['n1', 'n2'],
      sourceIds: ['s1', 's2'],
      independentSourceCount: 2,
      primarySourceCount: 0,
    },
  }
}

// Synthetic profile for direct engine-logic tests. scoreCountryImpact performs no
// verification, so these may carry fields (oil stance, currency regime, political
// sensitivities) that have no live source contract — they are exercised here
// rather than through the strict composeAnalysisDraft entry point.
function profile(over: Partial<CountryProfile>): CountryProfile {
  const evidence: CountryProfileEvidenceMap = {
    externalDebtPctGni: {
      sourceIds: ['src.worldbank'],
      asOf: AS_OF,
      indicator: 'DT.DOD.DECT.GN.ZS',
    },
  }
  if (over.oilStance) {
    evidence.oilStance = { sourceIds: ['src.worldbank'], asOf: AS_OF, methodologyId: 'm.oil' }
  }
  if (over.dollarDebtExposure) {
    evidence.dollarDebtExposure = {
      sourceIds: ['src.worldbank'],
      asOf: AS_OF,
      methodologyId: 'm.debt',
    }
  }
  if (over.currencyRegime) {
    evidence.currencyRegime = { sourceIds: ['src.worldbank'], asOf: AS_OF }
  }
  if ((over.politicalSensitivities?.length ?? 0) > 0) {
    evidence.politicalSensitivities = { sourceIds: ['src.worldbank'], asOf: AS_OF }
  }
  return { code: 'XX', name: 'XX', externalDebtPctGni: 60, ...over, evidence }
}

describe('scoreCountryImpact (engine logic)', () => {
  it('oil shock: exporter gains, importer is squeezed', () => {
    const e = event()
    const exporter = scoreCountryImpact({
      shock: 'oil_shock',
      direction: 'up',
      event: e,
      profile: profile({ oilStance: 'exporter' }),
      figureIds: [],
      baseConfidence: 'high',
    })
    const importer = scoreCountryImpact({
      shock: 'oil_shock',
      direction: 'up',
      event: e,
      profile: profile({ oilStance: 'importer' }),
      figureIds: [],
      baseConfidence: 'high',
    })
    expect(exporter[0].tone).toBe('pos')
    expect(importer[0].tone).toBe('neg')
    expect(exporter[0].evidence.profileFields).toContain('XX.oilStance')
    expect(exporter[0].evidence.profileSourceIds).toContain('src.worldbank')
  })

  it('dollar/rates: high + floating is more confident than medium + managed', () => {
    const e = event()
    const floating = scoreCountryImpact({
      shock: 'dollar_rates_shock',
      direction: 'down',
      event: e,
      profile: profile({ dollarDebtExposure: 'high', currencyRegime: 'float' }),
      figureIds: [],
      baseConfidence: 'high',
    })
    const managed = scoreCountryImpact({
      shock: 'dollar_rates_shock',
      direction: 'down',
      event: e,
      profile: profile({ dollarDebtExposure: 'medium', currencyRegime: 'managed' }),
      figureIds: [],
      baseConfidence: 'high',
    })
    expect(floating[0].tone).toBe('pos') // a softer dollar is relief for debtors
    expect(floating[0].confidence).toBe('high')
    expect(managed[0].confidence).not.toBe('high')
    expect(floating[0].evidence.profileFields).toEqual(
      expect.arrayContaining(['XX.dollarDebtExposure', 'XX.currencyRegime']),
    )
    expect(floating[0].evidence.methodologyIds).toContain('m.debt')
  })

  it('debt/fiscal: political sensitivities add a negative risk effect', () => {
    const effects = scoreCountryImpact({
      shock: 'debt_fiscal_event',
      direction: 'unclear',
      event: event(),
      profile: profile({
        dollarDebtExposure: 'high',
        politicalSensitivities: ['taxes', 'cost of living'],
      }),
      figureIds: [],
      baseConfidence: 'high',
    })
    expect(effects.some((x) => x.tone === 'pos' && x.channels.includes('debt_service'))).toBe(true)
    const risk = effects.find((x) => x.channels.includes('political_risk'))
    expect(risk?.tone).toBe('neg')
    expect(risk?.evidence.profileFields).toContain('XX.politicalSensitivities')
  })
})
