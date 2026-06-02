// A Claim is an assertion in a brief. It is verified only when every figure
// it cites is a verified figure and every event it cites is corroborated
// (or explicitly labelled single-source/unconfirmed).
export type ClaimKind = 'figure' | 'event' | 'causal'

export interface Claim {
  id: string
  kind: ClaimKind
  text: string
  figureIds: string[]
  eventIds: string[]
  verified: boolean
}
