import { runLiveIngestion } from '../ingestion/pipeline'
import type { LiveIngestionInput } from '../ingestion/pipeline'
import type { BriefDraft } from '../../domain/brief'

// Server-side producer: runs the live pipeline and returns ONLY a gate-passed brief
// (null otherwise — runLiveIngestion already withholds the brief unless the publish
// gate passed). This is the single bridge from connector output to a brief the
// runtime may render. It lives in src/server because it pulls in connectors,
// network, and keys; the client bundle must never import it (ESLint enforces this).
export async function produceGatedBrief(input: LiveIngestionInput): Promise<BriefDraft | null> {
  const result = await runLiveIngestion(input)
  return result.brief
}

// Serialize a gated brief (or its absence) to the JSON artifact the runtime loads.
// A null brief serializes to "null", which the loader treats as "no brief" → the
// runtime shows its empty state.
export function serializeBrief(brief: BriefDraft | null): string {
  return JSON.stringify(brief)
}
