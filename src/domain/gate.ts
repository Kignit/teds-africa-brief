// The publish gate is the mechanical enforcement of the trust rules.
// A BriefDraft may only become 'published' when the gate passes.
export type GateRule =
  | 'unverified_figure'
  | 'figure_missing_source'
  | 'figure_missing_timestamp'
  | 'figure_out_of_range'
  | 'figure_source_contract_mismatch'
  | 'uncorroborated_event'
  | 'event_missing_source'
  | 'event_missing_news_item'
  | 'event_corroboration_mismatch'
  | 'invented_spread'
  | 'unknown_source'
  | 'unbacked_provenance_claim'
  | 'single_source_verified_claim'
  | 'unverified_claim'
  | 'claim_text_not_canonical'
  | 'invalid_section_claim'
  | 'profile_evidence_missing'
  | 'profile_field_contract_mismatch'
  | 'profile_source_mismatch'
  | 'methodology_missing'
  | 'methodology_not_approved'
  | 'methodology_registry_mismatch'
  | 'methodology_extra'
  | 'methodology_duplicate'
  | 'causal_methodology_missing'
  | 'causal_methodology_shock_mismatch'
  | 'causal_channel_not_methodology_bound'
  | 'claim_country_not_grounded'
  | 'claim_profile_country_mismatch'
  | 'claim_event_country_mismatch'

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
