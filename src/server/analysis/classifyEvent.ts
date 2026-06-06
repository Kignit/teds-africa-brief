import type { Event } from '../../domain/event'
import type { Direction, ShockType } from '../../domain/analysis'

// Genuine oil-price MOVEMENT or supply-shock language. On top of a petroleum-sector noun
// (the rule's `pattern`), oil_shock requires either:
//   - a movement verb whose SUBJECT is an oil/crude price or a benchmark: the price word is
//     directly followed by the verb ("oil jumps", "crude slumps", "Brent spikes", "WTI falls",
//     "oil prices rise"), or the reverse "<verb> in oil/crude prices"; or
//   - a standalone supply-shock term (OPEC output cuts, supply disruption/shock/fears, glut,
//     shortage, embargo, sanctions, price cap).
// NO verb is accepted bare, so a story whose verb subject is profits/earnings/shares/output/
// capacity ("oil company profits surge", "petroleum refinery earnings jump", "oil shares
// rally", "crude processing capacity rises") is NOT read as an oil-price move.
const OIL_MOVE_VERB =
  'surges?|surged|jumps?|jumped|spikes?|spiked|slumps?|slumped|plunges?|plunged|soars?|soared|tumbles?|tumbled|sinks?|sank|rallies|rally|rallied|rout|rises?|rose|falls?|fell|drops?|dropped|climbs?|climbed|gains?|gained|slips?|slipped|slides?|slid'
const OIL_SUPPLY_SHOCK =
  'glut|shortage|embargo|sanctions?|price\\s+cap|(?:output|production)\\s+cuts?|supply\\s+(?:cut|cuts|disruption|disruptions|shock|shocks|crunch|fears?|squeeze|risks?|glut)'
const OIL_PRICE_MOVE = new RegExp(
  [
    // a price subject (oil/crude/petroleum [prices] or a Brent/WTI benchmark) DIRECTLY + verb
    `\\b(?:brent|wti|(?:oil|crude|petroleum)(?:\\s+prices?)?)\\s+(?:${OIL_MOVE_VERB})\\b`,
    // the reverse: "<verb> in oil/crude prices"
    `\\b(?:${OIL_MOVE_VERB})\\s+in\\s+(?:oil|crude|petroleum)\\s+prices?\\b`,
    // a standalone supply-shock term (oil context is enforced by the rule's `pattern`)
    `\\b(?:${OIL_SUPPLY_SHOCK})\\b`,
  ].join('|'),
  'i',
)

// Deterministic, priority-ordered keyword classification. First match wins. A rule may add a
// `requires` pattern that must ALSO match: an extra NECESSARY condition, never a relaxation.
const RULES: { type: ShockType; pattern: RegExp; requires?: RegExp }[] = [
  {
    type: 'oil_shock',
    // A petroleum-sector noun is necessary but NOT sufficient: it must appear together with
    // genuine oil-price / supply-shock movement language, so capacity / refinery stories that
    // merely mention crude or petroleum are not classified as an oil-price move.
    pattern: /\b(oil|brent|wti|crude|opec|petroleum)\b/i,
    requires: OIL_PRICE_MOVE,
  },
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
    if (rule.pattern.test(text) && (!rule.requires || rule.requires.test(text))) return rule.type
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
