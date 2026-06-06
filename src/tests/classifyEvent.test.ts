import { describe, it, expect } from 'vitest'
import { classifyEvent } from '../server/analysis/classifyEvent'
import type { Event } from '../domain/event'

function ev(title: string, summary = ''): Event {
  return {
    id: 'e',
    title,
    summary,
    occurredAt: '2026-06-03T06:00:00.000Z',
    countryCodes: [],
    topic: '',
    status: 'corroborated',
    corroboration: {
      newsItemIds: [],
      sourceIds: [],
      independentSourceCount: 0,
      primarySourceCount: 0,
    },
  }
}

// Targeted economic keywords added in PR-3, each from a real covered-market event
// the prior classifier missed. Deterministic; these label a single event's shock
// type and never merge stories.
describe('classifyEvent — PR-3 targeted economic keywords', () => {
  it('classifies a joint venture as a deal/investment event', () => {
    expect(classifyEvent(ev('Wilmar, TGI Group form $12bn joint venture in West Africa'))).toBe(
      'deal_investment_event',
    )
  })

  it('classifies reference-rate / interest-rate moves as a policy-rate decision', () => {
    expect(
      classifyEvent(ev('Ghana Reference Rate drops to 10.02% as interest rates set to reduce')),
    ).toBe('policy_rate_decision')
    expect(classifyEvent(ev('Bank lifts interest rate to tame prices'))).toBe(
      'policy_rate_decision',
    )
  })

  it('classifies rising fuel/pump prices as an inflation event', () => {
    expect(classifyEvent(ev('Motorists hit again as fuel prices rise'))).toBe('inflation_shock')
  })

  it('leaves genuinely non-economic stories unclassified (no over-matching)', () => {
    expect(classifyEvent(ev('Black Stars name squad for World Cup friendly'))).toBe('unclassified')
    expect(classifyEvent(ev('Popular actor dies after a short illness'))).toBe('unclassified')
  })

  it('preserves existing classifications', () => {
    expect(classifyEvent(ev('Oil jumps as supply fears mount'))).toBe('oil_shock')
    expect(classifyEvent(ev('IMF approves new loan tranche amid debt talks'))).toBe(
      'debt_fiscal_event',
    )
  })
})

describe('classifyEvent: policy_rate_decision precision (no bare central-bank false positives)', () => {
  it('does not classify a bare central-bank mention as a rate decision', () => {
    // The Access Bank appointment story only names "Bank of Ghana" for regulatory
    // approval; there is no rate / monetary-policy language.
    expect(
      classifyEvent(
        ev(
          'Access Bank strengthens leadership team with two executive appointments',
          'The appointments are subject to regulatory approval by the Bank of Ghana.',
        ),
      ),
    ).toBe('unclassified')
    expect(classifyEvent(ev('Bank of Ghana grants Access Bank regulatory approval'))).toBe(
      'unclassified',
    )
    expect(classifyEvent(ev('Reserve Bank governor opens a new regional headquarters'))).toBe(
      'unclassified',
    )
  })

  it('still classifies genuine rate / monetary-policy events', () => {
    for (const title of [
      'Bank of Ghana cuts policy rate',
      'MPC holds policy rate',
      'CBK raises benchmark rate',
      'central bank hikes interest rates',
      'Reserve Bank adjusts the repo rate',
      'Ghana Reference Rate falls to 10%',
    ]) {
      expect(classifyEvent(ev(title)), title).toBe('policy_rate_decision')
    }
  })
})

describe('classifyEvent: oil_shock requires real oil-price / supply-shock language', () => {
  it('does not classify a refinery capacity / throughput story as an oil-price shock', () => {
    // The Dangote story names crude/petroleum but is a processing-capacity expansion, not a
    // price move (proven in artifact 33e7558, where it produced 5 oil-price claims).
    expect(
      classifyEvent(
        ev(
          'Dangote refinery raises processing capacity to 700,000 barrels per day',
          'Dangote Petroleum Refinery has increased its crude processing capacity to 700,000 barrels per day following a performance test by process licensors, surpassing its nameplate capacity and advancing plans for future expansion.',
        ),
      ),
    ).toBe('unclassified')
    // A bare petroleum-sector noun with no price move is also not an oil-price shock.
    expect(classifyEvent(ev('New crude oil pipeline opens in the Niger Delta'))).toBe(
      'unclassified',
    )
  })

  it('still classifies genuine oil price / supply shocks', () => {
    for (const title of [
      'Oil jumps as supply fears mount',
      'Oil prices surge to a three-year high',
      'Crude slumps on weak demand',
      'Brent spikes after OPEC output cuts',
      'Oil plunges as a supply glut deepens',
    ]) {
      expect(classifyEvent(ev(title)), title).toBe('oil_shock')
    }
  })

  it('requires a movement/shock term, not bare oil-price language', () => {
    // Bare "price" / "prices" with no movement or shock term is not an oil-price shock.
    expect(classifyEvent(ev('Oil prices steady ahead of OPEC meeting'))).toBe('unclassified')
    expect(classifyEvent(ev('Oil price outlook unchanged'))).toBe('unclassified')
    // A real movement term still classifies.
    expect(classifyEvent(ev('Oil prices surge on supply fears'))).toBe('oil_shock')
  })

  it('binds generic verbs (rise/fall/drop) to an oil/crude price or benchmark, not to volume', () => {
    // Generic verbs on a non-price subject (profits, capacity, production) do NOT classify.
    expect(classifyEvent(ev('Oil company profits rise after refinery upgrade'))).toBe(
      'unclassified',
    )
    expect(classifyEvent(ev('Crude processing capacity rises at Dangote refinery'))).toBe(
      'unclassified',
    )
    expect(classifyEvent(ev('Oil production rises after maintenance'))).toBe('unclassified')
    // Bound to an oil / crude PRICE or a price benchmark, the same verbs do classify.
    expect(classifyEvent(ev('Oil prices rise on supply fears'))).toBe('oil_shock')
    expect(classifyEvent(ev('Brent falls after OPEC output decision'))).toBe('oil_shock')
  })

  it('binds strong market verbs too: company/share stories are not oil-price moves', () => {
    // The verb subject is profits / earnings / shares, not an oil price, so even strong verbs
    // (surge / jump / rally) must NOT classify as an oil-price move.
    expect(classifyEvent(ev('Oil company profits surge after refinery upgrade'))).toBe(
      'unclassified',
    )
    expect(classifyEvent(ev('Petroleum refinery earnings jump after expansion'))).toBe(
      'unclassified',
    )
    expect(classifyEvent(ev('Oil shares rally after dividend announcement'))).toBe('unclassified')
    // The price/benchmark subject is what makes the same verbs a price move.
    expect(classifyEvent(ev('Oil jumps as supply fears mount'))).toBe('oil_shock')
    expect(classifyEvent(ev('Crude slumps on weak demand'))).toBe('oil_shock')
    expect(classifyEvent(ev('Brent spikes after OPEC output cuts'))).toBe('oil_shock')
  })
})
