// A VerifiedFigure is a number that has cleared validation. The UI may only
// display numbers that exist as VerifiedFigure records with status 'verified'.
export type FigureStatus = 'verified' | 'rejected' | 'pending'

export interface FigureValidation {
  hasSource: boolean
  hasTimestamp: boolean
  withinRange: boolean
  /** Human-readable reasons a figure was rejected (empty when verified). */
  reasons: string[]
}

export interface VerifiedFigure {
  id: string
  /** Stable metric key, e.g. 'fx.NGN_USD', 'rate.policy.GH', 'spread.eurobond.KE'. */
  metric: string
  label: string
  value: number
  /** e.g. 'NGN/USD', '%', 'bps', 'USD'. */
  unit: string
  /** ISO-8601 timestamp the figure is "as of". */
  asOf: string
  countryCode?: string
  /** At least one source is required for verification. */
  sourceIds: string[]
  status: FigureStatus
  validation: FigureValidation
}

// Candidate figure before validation — the raw shape a connector emits.
export interface RawFigure {
  metric: string
  label: string
  value: number
  unit: string
  asOf: string
  countryCode?: string
  sourceIds: string[]
}
