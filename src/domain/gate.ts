// The publish gate is the mechanical enforcement of the trust rules.
// A BriefDraft may only become 'published' when the gate passes.
export type GateRule =
  | 'unverified_figure'
  | 'figure_missing_source'
  | 'figure_missing_timestamp'
  | 'figure_out_of_range'
  | 'uncorroborated_event'
  | 'invented_spread'
  | 'unbacked_provenance_claim'

export interface GateViolation {
  rule: GateRule
  detail: string
  /** id of the offending figure/event/claim, when applicable. */
  ref?: string
}

export interface PublishGateResult {
  passed: boolean
  violations: GateViolation[]
}
