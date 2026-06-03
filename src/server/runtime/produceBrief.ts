import { runLiveIngestion } from '../ingestion/pipeline'
import type { LiveIngestionInput } from '../ingestion/pipeline'
import type { BriefDraft } from '../../domain/brief'
import type { BriefArtifact } from '../../domain/artifact'

// Server-side producer: runs the live pipeline and returns ONLY a gate-passed brief
// (null otherwise — runLiveIngestion already withholds the brief unless the publish
// gate passed). This is the single bridge from connector output to a brief the
// runtime may render. It lives in src/server because it pulls in connectors,
// network, and keys; the client bundle must never import it (ESLint enforces this).
export async function produceGatedBrief(input: LiveIngestionInput): Promise<BriefDraft | null> {
  const result = await runLiveIngestion(input)
  return result.brief
}

// Serialize the runtime artifact: a { generatedAt, brief } envelope. A null brief
// (gate did not pass / no brief) is written explicitly so it overwrites any stale
// artifact → the runtime shows its empty state. Pretty-printed for readable, auditable
// git diffs of the committed artifact.
export function serializeArtifact(brief: BriefDraft | null, generatedAt: string): string {
  const artifact: BriefArtifact = { generatedAt, brief }
  return `${JSON.stringify(artifact, null, 2)}\n`
}
