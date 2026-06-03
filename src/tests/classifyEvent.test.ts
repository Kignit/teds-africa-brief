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
