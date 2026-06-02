// Provenance is what permits the UI to claim a fact is verified / cross-checked.
// If a component is given no Provenance, it must NOT render verification language.
export interface Provenance {
  sourceIds: string[]
  /** ISO-8601 timestamp the underlying data is as of. */
  asOf: string
  /** True only when corroborated across >= 2 independent sources. */
  crossChecked: boolean
  sourceCount: number
}
