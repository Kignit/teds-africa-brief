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
    pattern:
      /\b(policy rate|repo rate|\bmpc\b|reserve bank|central bank|interest-rate decision|sarb|cbk|cbn|bank of ghana)\b/i,
  },
  { type: 'inflation_shock', pattern: /\b(inflation|\bcpi\b|consumer prices|cost of living)\b/i },
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
    pattern: /\b(deal|acquisition|investment|\bfdi\b|financing|stake|merger)\b/i,
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
