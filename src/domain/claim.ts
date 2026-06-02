// A Claim is an assertion in a brief. It is verified only when every figure it
// cites is a verified figure, every event it cites is corroborated (or explicitly
// labelled single-source/unconfirmed), and — for causal claims — every country
// profile field it relies on carries valid source and methodology evidence.
// The publish gate re-checks all of this; the claim must therefore carry its
// profile/methodology evidence, not just figure/event ids.
import type { ShockType } from './analysis'

export type ClaimKind = 'figure' | 'event' | 'causal'

export interface Claim {
  id: string
  kind: ClaimKind
  text: string
  figureIds: string[]
  eventIds: string[]
  /** Country-profile fields the claim relies on, as `${code}.${field}`. */
  profileFields: string[]
  /** Source ids behind those profile fields. */
  profileSourceIds: string[]
  /** Methodology ids behind any derived profile fields the claim relies on. */
  methodologyIds: string[]
  /**
   * For causal claims: the shock that generated the claim. The gate binds this to
   * the approved causal methodology `method.causal.${shockType}.v1` the claim must cite.
   */
  shockType?: ShockType
  verified: boolean
}
