import { describe, it, expect } from 'vitest'
import { diagnoseClaimYield } from '../server/analysis/claimYieldDiagnostics'
import type { Event } from '../domain/event'
import type { CausalEffect, CausalLink, ShockType } from '../domain/analysis'
import type { CountryProfile } from '../domain/country'

// A corroborated event with sane defaults; `over` customises id/title/countryCodes/status.
function corroborated(over: Partial<Event> & { id: string; title: string }): Event {
  return {
    summary: '',
    occurredAt: '2026-06-05T00:00:00.000Z',
    countryCodes: [],
    topic: '',
    status: 'corroborated',
    corroboration: {
      newsItemIds: [],
      sourceIds: ['src.a', 'src.b'],
      independentSourceCount: 2,
      primarySourceCount: 0,
    },
    ...over,
  }
}

const profile = (code: string, over: Partial<CountryProfile> = {}): CountryProfile => ({
  code,
  name: code,
  externalDebtPctGni: 40,
  evidence: {},
  ...over,
})

const effect = (cc: string): CausalEffect => ({
  countryCode: cc,
  tone: 'pos',
  channels: ['debt_service'],
  why: '',
  confidence: 'medium',
  evidence: {
    eventIds: [],
    figureIds: [],
    profileFields: [],
    profileSourceIds: [],
    methodologyIds: [],
  },
})

const link = (eventId: string, shockType: ShockType, effects: CausalEffect[]): CausalLink => ({
  id: 'link_1',
  trigger: '',
  shockType,
  direction: 'unclear',
  mechanism: '',
  eventId,
  effects,
})

describe('claim-yield diagnostics', () => {
  it('unclassified corroborated event is logged as blocked by classification', () => {
    const event = corroborated({
      id: 'evt_appoint',
      title: 'UMB appoints new Division Head to accelerate retail growth',
      countryCodes: ['GH'],
    })
    const [d] = diagnoseClaimYield([event], [], [profile('GH')])
    expect(d.shock).toBe('unclassified')
    expect(d.effectCount).toBe(0)
    expect(d.blocker).toBe('unclassified')
    expect(d.sourceIds).toEqual(['src.a', 'src.b'])
    expect(d.countryCodes).toEqual(['GH'])
  })

  it('classified oil_shock with no effects is logged as blocked by missing oilStance', () => {
    const event = corroborated({
      id: 'evt_oil',
      title: 'Dangote refinery raises crude oil processing capacity',
      countryCodes: ['NG'],
    })
    // No link for this event; oil_shock is global, so all profiles are targets — none of
    // which carry an oilStance label (no approved methodology produces one).
    const [d] = diagnoseClaimYield([event], [], [profile('NG'), profile('GH')])
    expect(d.shock).toBe('oil_shock')
    expect(d.effectCount).toBe(0)
    expect(d.blocker).toBe('missing oilStance')
  })

  it('valid debt_fiscal_event with effects is logged as claim-producing (no blocker)', () => {
    const event = corroborated({
      id: 'evt_budget',
      title: '85% of agriculture ministry 2026 budget released',
      countryCodes: ['GH'],
    })
    const links = [link('evt_budget', 'debt_fiscal_event', [effect('GH')])]
    const [d] = diagnoseClaimYield([event], links, [profile('GH')])
    expect(d.shock).toBe('debt_fiscal_event')
    expect(d.effectCount).toBe(1)
    expect(d.blocker).toBeNull()
  })

  it('only corroborated events are diagnosed (single-source ignored)', () => {
    const single = corroborated({
      id: 'evt_single',
      title: 'budget released',
      status: 'single_source',
    })
    expect(diagnoseClaimYield([single], [], [profile('GH')])).toHaveLength(0)
  })

  it('classified non-global shock with no covered country is blocked accordingly', () => {
    const event = corroborated({
      id: 'evt_fx',
      title: 'Naira slips on the parallel market',
      countryCodes: [],
    })
    const [d] = diagnoseClaimYield([event], [], [profile('NG')])
    expect(d.shock).toBe('fx_move')
    expect(d.blocker).toBe('no covered country in countryCodes')
  })
})
