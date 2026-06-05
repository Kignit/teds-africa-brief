import { describe, it, expect } from 'vitest'
import { composeAnalysisDraft } from '../server/analysis/composeAnalysisDraft'
import { composeBriefFromAnalysis } from '../server/analysis/buildBrief'
import { runPublishGate } from '../server/publishing/publishGate'
import { GLOBAL_SHOCKS } from '../server/analysis/generateCausalLinks'
import { validateFigure } from '../server/verification/validateFigure'
import {
  TEST_COUNTRY_PROFILES,
  TEST_DEBT_METHODOLOGY,
  unsourcedProfile,
} from './fixtures/countryProfiles'
import type { Event } from '../domain/event'
import type { CountryProfile } from '../domain/country'

const ASOF = '2026-05-29T06:00:00.000Z'

function ev(over: Partial<Event> & { title: string }): Event {
  return {
    id: 'e1',
    summary: '',
    occurredAt: ASOF,
    countryCodes: [],
    topic: '',
    status: 'corroborated',
    corroboration: {
      newsItemIds: ['n1', 'n2'],
      sourceIds: ['src.a', 'src.b'],
      independentSourceCount: 2,
      primarySourceCount: 0,
    },
    ...over,
  }
}

// A dollar/rates shock is the contract-valid country-impact path: it keys off the
// methodology-derived dollarDebtExposure label the fixtures carry.
const fed = ev({ id: 'fed', title: 'Fed signals a cut and the dollar softens' })
const imf = ev({ id: 'imf', title: 'IMF presses test market on new taxes', countryCodes: ['XB'] })
const oil = ev({ id: 'oil', title: 'Oil jumps as Middle East tension threatens supply' })

function brief(events: Event[], profiles = TEST_COUNTRY_PROFILES) {
  const analysis = composeAnalysisDraft({ figures: [], events, profiles })
  return composeBriefFromAnalysis({
    id: 'b',
    date: '2026-05-29',
    edition: 'daily',
    dataMode: 'live',
    analysis,
    figures: [],
    events,
    profiles,
  })
}

describe('analysis engine V0', () => {
  it('refuses unverified figures', () => {
    const bad = validateFigure({
      metric: 'fx.KES_USD',
      label: 'KES / USD',
      value: 128.9,
      unit: 'KES/USD',
      asOf: 'not-a-date', // invalid timestamp -> rejected
      sourceIds: ['src.open_er_api'],
    })
    expect(bad.status).toBe('rejected')
    expect(() =>
      composeAnalysisDraft({ figures: [bad], events: [], profiles: TEST_COUNTRY_PROFILES }),
    ).toThrow()
  })

  it('refuses country profiles that lack field-level evidence', () => {
    expect(() =>
      composeAnalysisDraft({ figures: [], events: [fed], profiles: [unsourcedProfile()] }),
    ).toThrow(/country profile/i)
  })

  it('refuses profiles that fail the strict source contracts (production default)', () => {
    // oil stance now has a derived-field contract, and this profile violates it (wrong source,
    // a debt methodology, no petroleumTrade), so the strict production default still refuses it.
    const withOilStance: CountryProfile = {
      ...TEST_COUNTRY_PROFILES[0],
      oilStance: 'exporter',
      evidence: {
        ...TEST_COUNTRY_PROFILES[0].evidence,
        oilStance: { sourceIds: ['src.worldbank'], asOf: ASOF, methodologyId: 'method.test.debt' },
      },
    }
    expect(() =>
      composeAnalysisDraft({ figures: [], events: [fed], profiles: [withOilStance] }),
    ).toThrow(/country profile/i)
  })

  it('does not use unconfirmed events as evidence', () => {
    const unconfirmed = ev({ id: 'u', title: 'Fed signals a cut', status: 'unconfirmed' })
    const draft = composeAnalysisDraft({
      figures: [],
      events: [unconfirmed],
      profiles: TEST_COUNTRY_PROFILES,
    })
    expect(draft.causalLinks).toHaveLength(0)
    expect(draft.claims).toHaveLength(0)
  })

  it('produces no causal links for a single-source event', () => {
    // Single-source news is stored as evidence but never becomes publishable analysis.
    const singleSource = ev({
      id: 's',
      title: 'Fed signals a cut and the dollar softens',
      status: 'single_source',
      corroboration: {
        newsItemIds: ['n1'],
        sourceIds: ['src.a'],
        independentSourceCount: 1,
        primarySourceCount: 0,
      },
    })
    const draft = composeAnalysisDraft({
      figures: [],
      events: [singleSource],
      profiles: TEST_COUNTRY_PROFILES,
    })
    expect(draft.causalLinks).toHaveLength(0)
    expect(draft.claims).toHaveLength(0)
  })

  it('gives every causal effect at least one evidence reference', () => {
    const draft = composeAnalysisDraft({
      figures: [],
      events: [fed, imf],
      profiles: TEST_COUNTRY_PROFILES,
    })
    const effects = draft.causalLinks.flatMap((l) => l.effects)
    expect(effects.length).toBeGreaterThan(0)
    for (const e of effects) {
      const refs =
        e.evidence.eventIds.length +
        e.evidence.figureIds.length +
        e.evidence.profileFields.length +
        e.evidence.profileSourceIds.length
      expect(refs).toBeGreaterThan(0)
    }
  })

  it('carries profile and methodology evidence from effect into the claim', () => {
    const draft = composeAnalysisDraft({
      figures: [],
      events: [fed],
      profiles: TEST_COUNTRY_PROFILES,
    })
    const claim = draft.claims.find((c) => c.profileFields.includes('XB.dollarDebtExposure'))
    expect(claim).toBeDefined()
    expect(claim!.profileSourceIds).toContain('src.worldbank')
    expect(claim!.methodologyIds).toContain('method.test.debt')
    // the claim is shock-bound and cites the causal rule that licensed the mechanism
    expect(claim!.shockType).toBe('dollar_rates_shock')
    expect(claim!.methodologyIds).toContain('method.causal.dollar_rates_shock.v1')
  })

  it('cannot ingest an invented Eurobond spread', () => {
    const spread = validateFigure({
      metric: 'spread.eurobond.KE',
      label: 'Kenya spread',
      value: 600,
      unit: 'bps',
      asOf: ASOF,
      countryCode: 'KE',
      sourceIds: ['src.made_up'],
    })
    expect(spread.status).toBe('rejected')
    expect(() =>
      composeAnalysisDraft({ figures: [spread], events: [], profiles: TEST_COUNTRY_PROFILES }),
    ).toThrow()
  })

  it('analysis claims pass the publish gate only when backed', () => {
    // The synthetic banding methodology is supplied as an injected registry entry.
    const gateOpts = { methodologyRegistry: [TEST_DEBT_METHODOLOGY] }
    const backed = brief([fed])
    expect(runPublishGate(backed, gateOpts).passed).toBe(true)

    const tampered = {
      ...backed,
      claims: [
        ...backed.claims,
        {
          id: 'bad',
          kind: 'causal' as const,
          text: 'unbacked',
          figureIds: ['missing'],
          eventIds: [],
          profileFields: [],
          profileSourceIds: [],
          methodologyIds: [],
          verified: true,
        },
      ],
    }
    const res = runPublishGate(tampered, gateOpts)
    expect(res.passed).toBe(false)
    expect(res.violations.map((v) => v.rule)).toContain('unbacked_provenance_claim')
  })

  it('publish gate rejects events marked corroborated without source evidence', () => {
    const malformed = ev({
      id: 'malformed',
      title: 'Fed signals a cut and the dollar softens',
      corroboration: {
        newsItemIds: [],
        sourceIds: [],
        independentSourceCount: 2,
        primarySourceCount: 0,
      },
    })
    const res = runPublishGate(brief([malformed]))
    expect(res.passed).toBe(false)
    expect(res.violations.map((v) => v.rule)).toEqual(
      expect.arrayContaining(['event_missing_source', 'event_missing_news_item']),
    )
  })

  it('oil-shock effects are skipped without a sourced oil stance', () => {
    // The contract-valid fixtures carry no oil stance, so oil shocks produce nothing.
    const draft = composeAnalysisDraft({
      figures: [],
      events: [oil],
      profiles: TEST_COUNTRY_PROFILES,
    })
    expect(draft.causalLinks.find((l) => l.shockType === 'oil_shock')).toBeUndefined()
  })

  it('keeps oil_shock and dollar_rates_shock global, but not trade_integration_event', () => {
    expect(GLOBAL_SHOCKS.has('oil_shock')).toBe(true)
    expect(GLOBAL_SHOCKS.has('dollar_rates_shock')).toBe(true)
    expect(GLOBAL_SHOCKS.has('trade_integration_event')).toBe(false)
    // Behavioural: a dollar/rates shock with NO named country still fans to every profile.
    const draft = composeAnalysisDraft({
      figures: [],
      events: [fed],
      profiles: TEST_COUNTRY_PROFILES,
    })
    const link = draft.causalLinks.find((l) => l.shockType === 'dollar_rates_shock')
    expect(link!.effects.map((e) => e.countryCode).sort()).toEqual(['XA', 'XB', 'XC'])
  })

  it('scopes a country-specific trade_integration_event to the named country only', () => {
    // ICUMS-style: a single-country customs/platform story (names XA only). It must NOT
    // fan out to XB/XC the way it did while trade_integration_event was a global shock.
    const icums = ev({
      id: 'icums',
      title: 'XA customs clearance platform dispute over trade flows',
      countryCodes: ['XA'],
    })
    const draft = composeAnalysisDraft({
      figures: [],
      events: [icums],
      profiles: TEST_COUNTRY_PROFILES,
    })
    const link = draft.causalLinks.find((l) => l.shockType === 'trade_integration_event')
    expect(link).toBeDefined()
    expect(link!.effects.map((e) => e.countryCode).sort()).toEqual(['XA'])
    expect(
      draft.claims
        .filter((c) => c.shockType === 'trade_integration_event')
        .map((c) => c.countryCode),
    ).toEqual(['XA'])
  })

  it('publish gate rejects a trade_integration_event claim for a country the cited event does not name', () => {
    const icums = ev({
      id: 'icums',
      title: 'XA customs clearance platform dispute over trade flows',
      countryCodes: ['XA'],
    })
    const gateOpts = { methodologyRegistry: [TEST_DEBT_METHODOLOGY] }
    const backed = brief([icums])
    const xaTrade = backed.claims.find((c) => c.shockType === 'trade_integration_event')
    expect(xaTrade?.countryCode).toBe('XA')
    // The country-correct claim passes.
    expect(runPublishGate(backed, gateOpts).passed).toBe(true)
    // Re-point the SAME claim to XB, which the cited event does not name -> must be rejected.
    const tampered = {
      ...backed,
      claims: [
        ...backed.claims,
        {
          ...xaTrade!,
          id: 'bad_trade_xb',
          countryCode: 'XB',
          profileFields: xaTrade!.profileFields.map((f) => f.replace('XA', 'XB')),
          text: xaTrade!.text.replace(/^XA/, 'XB'),
        },
      ],
    }
    const res = runPublishGate(tampered, gateOpts)
    expect(res.passed).toBe(false)
    expect(res.violations.map((v) => v.rule)).toContain('claim_event_country_mismatch')
    expect(res.violations.find((v) => v.rule === 'claim_event_country_mismatch')!.ref).toBe(
      'bad_trade_xb',
    )
  })

  it('produces no claim for a central-bank mention that is not a rate decision', () => {
    // "Bank of Ghana" appears only for regulatory approval, so classifyEvent must not
    // treat it as a policy-rate decision and the engine produces nothing.
    const appointment = ev({
      id: 'access',
      title: 'Access Bank strengthens leadership team with two executive appointments',
      summary: 'The appointments are subject to regulatory approval by the Bank of Ghana.',
      countryCodes: ['XA'],
    })
    const draft = composeAnalysisDraft({
      figures: [],
      events: [appointment],
      profiles: TEST_COUNTRY_PROFILES,
    })
    expect(draft.causalLinks).toHaveLength(0)
    expect(draft.claims).toHaveLength(0)
  })

  it('still produces a policy_rate_decision effect for a genuine rate event in a named country', () => {
    const rateCut = ev({
      id: 'rate',
      title: 'Bank of Ghana cuts the policy rate',
      countryCodes: ['XA'],
    })
    const draft = composeAnalysisDraft({
      figures: [],
      events: [rateCut],
      profiles: TEST_COUNTRY_PROFILES,
    })
    const link = draft.causalLinks.find((l) => l.shockType === 'policy_rate_decision')
    expect(link).toBeDefined()
    expect(link!.effects.map((e) => e.countryCode)).toEqual(['XA'])
    expect(
      draft.claims.some((c) => c.shockType === 'policy_rate_decision' && c.countryCode === 'XA'),
    ).toBe(true)
  })
})
