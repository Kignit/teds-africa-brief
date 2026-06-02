import type { Claim } from './claim'

export type Tone = 'pos' | 'neg' | 'neutral'
export type Confidence = 'high' | 'medium' | 'low'

// The kind of shock an event represents.
export type ShockType =
  | 'oil_shock'
  | 'dollar_rates_shock'
  | 'inflation_shock'
  | 'policy_rate_decision'
  | 'fx_move'
  | 'debt_fiscal_event'
  | 'trade_integration_event'
  | 'deal_investment_event'
  | 'political_stability_event'
  | 'unclassified'

// The channel through which a shock reaches a country.
export type TransmissionChannel =
  | 'fx'
  | 'inflation'
  | 'debt_service'
  | 'fiscal_revenue'
  | 'trade_balance'
  | 'consumers'
  | 'growth'
  | 'political_risk'

// Direction of a shock, where it can be inferred from the event.
export type Direction = 'up' | 'down' | 'unclear'

// What a causal effect is grounded in. At least one of these must be present —
// the engine never asserts an effect without traceable evidence.
export interface EvidenceRef {
  eventIds: string[]
  figureIds: string[]
  // e.g. ['XA.oilStance', 'XB.dollarDebtExposure'] — country-profile fields used.
  profileFields: string[]
  // Source ids behind the country-profile fields used in this effect.
  profileSourceIds: string[]
  // Methodology ids behind any DERIVED country-profile fields used in this effect.
  methodologyIds: string[]
}

// One country's impact under a shock. Tone is the net direction for the listed
// channels; a country can appear more than once when channels diverge in tone
// (e.g. debt positive but consumers negative).
export interface CausalEffect {
  countryCode: string
  tone: Tone
  channels: TransmissionChannel[]
  why: string
  confidence: Confidence
  evidence: EvidenceRef
}

// The signature output: one trigger, divergent per-country effects.
export interface CausalLink {
  id: string
  trigger: string
  shockType: ShockType
  direction: Direction
  mechanism: string
  /** id of the originating Event. */
  eventId: string
  effects: CausalEffect[]
}

// Output of the V0 analysis step, before QA and the publish gate.
// `method` is 'deterministic' in V0. `model` is '' until an LLM adapter is wired;
// any LLM may only rephrase already-grounded text — never create facts.
export interface AnalysisDraft {
  id: string
  generatedAt: string
  method: 'deterministic' | 'llm-drafted'
  model: string
  causalLinks: CausalLink[]
  claims: Claim[]
  leadClaimIds: string[]
}
