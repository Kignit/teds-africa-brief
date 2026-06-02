import type { ShockType, TransmissionChannel } from './analysis'

// A Methodology turns raw sourced inputs into a derived analytical label
// (e.g. external-debt % of GNI -> high/medium/low exposure). It is treated as
// reviewable methodology, NOT as data hidden in code: the rule lives here with an
// id, version, owner, and an explicit approval status. A derived label may only
// be emitted by an `approved` methodology, and must reference it.
export type MethodologyStatus = 'draft' | 'approved'

// 'banding' turns a raw number into a label (e.g. debt exposure). 'causal' is a
// deterministic causal rule that licenses an effect's mechanism text + channel
// mapping (e.g. an oil shock). Both are versioned, owned, and approval-gated.
export type MethodologyKind = 'banding' | 'causal'

// One band of a banding rule: the label applied when value is in [gte, lt).
// Bounds are explicit and reviewable — there are no hidden thresholds in code.
export interface MethodologyBand {
  label: string
  /** Inclusive lower bound; omit for no lower bound. */
  gte?: number
  /** Exclusive upper bound; omit for no upper bound. */
  lt?: number
}

export interface Methodology {
  id: string
  name: string
  version: string
  description: string
  kind: MethodologyKind
  /** Raw input field(s) this methodology consumes, e.g. ['externalDebtPctGni']. */
  inputs: string[]
  /** Banding thresholds, as explicit reviewable data (empty for causal rules). */
  bands: MethodologyBand[]
  // For causal rules: the shock the rule applies to, and the mechanism + channels
  // it licenses — so the deterministic analysis is described by the rule itself,
  // not anonymous hardcoded logic wrapped by a generic description.
  shockType?: ShockType
  mechanism?: string
  channels?: TransmissionChannel[]
  owner: string
  status: MethodologyStatus
}

// The band label for a value, or undefined if no band matches. Pure and total.
export function applyBands(value: number, bands: MethodologyBand[]): string | undefined {
  for (const band of bands) {
    const aboveMin = band.gte === undefined || value >= band.gte
    const belowMax = band.lt === undefined || value < band.lt
    if (aboveMin && belowMax) return band.label
  }
  return undefined
}
