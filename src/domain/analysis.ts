import type { Claim } from './claim'

export type Tone = 'pos' | 'neg' | 'neutral'

// A CausalLink is the signature output: one trigger, divergent per-country effects.
export interface CausalEffect {
  countryCode: string
  tone: Tone
  note: string
}

export interface CausalLink {
  trigger: string
  mechanism: string
  effects: CausalEffect[]
}

// The raw output of the (future) AI analysis step, before QA and the gate.
// `model` is empty until a real model is wired in — no AI runs in this pass.
export interface AnalysisDraft {
  id: string
  generatedAt: string
  model: string
  leadClaimIds: string[]
  causalLinks: CausalLink[]
  claims: Claim[]
}
