import type { Event } from '../../domain/event'
import type { Direction, ShockType } from '../../domain/analysis'

// Deterministic, priority-ordered keyword classification. First match wins.
const RULES: { type: ShockType; pattern: RegExp }[] = [
  { type: 'oil_shock', pattern: /\b(oil|brent|crude|opec|petroleum)\b/i },
  {
    type: 'dollar_rates_shock',
    pattern: /\b(fed|federal reserve|dollar|dxy|treasur(y|ies)|us rates|fomc|powell)\b/i,
  },
  {
    type: 'policy_rate_decision',
    // Match actual rate / monetary-policy LANGUAGE, never a bare central-bank name: a
    // story that merely names "Bank of Ghana" / "central bank" (a lender receiving
    // regulatory approval, a governor opening a building) is NOT a rate decision.
    // interest[- ]rates? also covers "interest-rate decision"; reference rate is a
    // monetary benchmark (the Ghana Reference Rate); policy/repo/benchmark rate are the
    // standard policy instruments; MPC is the deciding body.
    pattern:
      /\b(monetary policy|policy rate|repo rate|reference rate|benchmark rate|interest[- ]rates?|\bmpc\b)\b/i,
  },
  {
    type: 'inflation_shock',
    pattern: /\b(inflation|\bcpi\b|consumer prices|cost of living|fuel prices?|pump prices?)\b/i,
  },
  {
    type: 'debt_fiscal_event',
    pattern:
      /\b(imf|eurobond|debt|default|restructur|fiscal|budget|\btax(es)?\b|austerity|deficit)\b/i,
  },
  {
    type: 'fx_move',
    pattern:
      /\b(naira|cedi|shilling|birr|rand|currenc|exchange rate|deprecia|devalu|appreciat|\bpeg\b)\b/i,
  },
  {
    type: 'trade_integration_event',
    pattern: /\b(afcfta|trade|export|tariff|customs|corridor|integration)\b/i,
  },
  {
    type: 'deal_investment_event',
    pattern: /\b(deal|acquisition|investment|\bfdi\b|financing|stake|merger|joint venture)\b/i,
  },
  {
    type: 'political_stability_event',
    pattern: /\b(protest|election|coup|unrest|strike|political|cabinet|reshuffle)\b/i,
  },
]

export function classifyEvent(event: Event): ShockType {
  const text = `${event.title} ${event.summary} ${event.topic}`
  for (const rule of RULES) {
    if (rule.pattern.test(text)) return rule.type
  }
  return 'unclassified'
}

const UP =
  /\b(rise|rises|rose|jump|jumps|surge|surges|soar|spike|spikes|climb|gains?|higher|stronger|strengthen|hikes?|increase|widen)\b/i
const DOWN =
  /\b(fall|falls|fell|slip|slips|drop|drops|lower|soft|softer|cuts?|ease|eases|easing|weaken|deprecia|devalu|decline|cheaper|dovish|holds?|unchanged|narrow)\b/i

// Direction of the shock where the headline makes it clear, else 'unclear'.
export function inferDirection(event: Event): Direction {
  const text = `${event.title} ${event.summary}`
  const up = UP.test(text)
  const down = DOWN.test(text)
  if (up && !down) return 'up'
  if (down && !up) return 'down'
  return 'unclear'
}
