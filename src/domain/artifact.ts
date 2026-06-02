import type { BriefDraft } from './brief'

// The on-disk runtime artifact (`/brief.json`): a thin envelope around a gate-passed
// BriefDraft plus the timestamp it was generated. The envelope lets the runtime
// enforce freshness (a stale artifact must not render as current intelligence) without
// touching the gated brief itself. `brief` is null when the most recent generation did
// not pass the gate, which clears any previously-served brief to the empty state.
export interface BriefArtifact {
  /** ISO-8601 timestamp the artifact was produced. */
  generatedAt: string
  brief: BriefDraft | null
}
