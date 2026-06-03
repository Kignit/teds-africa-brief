import { writeFileSync, mkdirSync } from 'node:fs'
import process from 'node:process'
import { produceBriefResult, serializeArtifact } from '../src/server/runtime/produceBrief'
import {
  fxConnector,
  brentConnector,
  fredConnector,
  gdeltConnector,
  countryProfileConnector,
} from '../src/server/ingestion/liveConnectors'
import { getConfig } from '../src/server/config'
import { SOURCES } from '../src/data/sources'
import type { ConnectorContext } from '../src/server/connectors/types'
import type {
  LiveIngestionDiagnostics,
  LiveIngestionResult,
} from '../src/server/ingestion/pipeline'
import type { BriefDraft } from '../src/domain/brief'

// Out-of-band brief generator. Runs the live pipeline (real connectors, real network)
// OUTSIDE the Vercel build, and writes the runtime artifact `public/brief.json` as a
// { generatedAt, brief } envelope. It is server-side only: it pulls in connectors,
// network, and keys, and must never be imported by the client bundle (enforced by the
// ESLint boundary + the client-import-graph test).
//
// Outcomes:
//   - gate-passed brief                 -> { generatedAt, brief },       exit 0
//   - no gate-passed brief (or a throw) -> { generatedAt, brief: null }, exit 1
// Either way the artifact is WRITTEN, so a failed run clears any stale brief to the
// empty state; the non-zero exit lets the workflow alert while still committing the
// cleared artifact. Connector keys live only in the connector context (from env), never
// in the artifact — the brief carries figures/events/sources, never secrets.

const OUT_DIR = 'public'
const OUT_FILE = `${OUT_DIR}/brief.json`
const NEWS_QUERY = 'Africa economy OR Africa currency OR Africa oil'

// Surface the ingestion audit trail to the run log so a thin or null brief is
// diagnosable from the workflow output: which connectors FAILED (e.g. a GDELT 429 —
// now a loud failure rather than a silent empty list), what was dropped or rejected,
// and the final counts. The brief and the published artifact carry no diagnostics.
function logDiagnostics(d: LiveIngestionDiagnostics): void {
  console.log(
    `Ingestion diagnostics: connectors_failed=${d.connectorFailures.length}, figures=${d.figureCount}, events=${d.eventCount}, profiles=${d.profileCount}`,
  )
  for (const f of d.connectorFailures) console.warn(`  connector failed: ${f.id} — ${f.reason}`)
  const dropped: string[] = [
    ...d.rejectedFigures.map((r) => `figure invalid ${r.metric}: ${r.reasons.join(', ')}`),
    ...d.droppedUnknownSourceFigures.map((x) => `figure unknown-source ${x}`),
    ...d.droppedContractFigures.map((x) => `figure contract ${x}`),
    ...d.droppedUnknownSourceNews.map((x) => `news unknown-source ${x}`),
    ...d.rejectedProfiles.map((r) => `profile ${r.code}: ${r.reasons.join(', ')}`),
  ]
  for (const line of dropped) console.warn(`  dropped: ${line}`)
}

async function main(): Promise<void> {
  const generatedAt = new Date().toISOString()
  const date = generatedAt.slice(0, 10)
  const ctx: ConnectorContext = {
    fetch: globalThis.fetch,
    config: getConfig(process.env),
    now: () => new Date().toISOString(),
  }

  // Explicit, honest source set. fx + World Bank are keyless; Brent (EIA) + FRED
  // (US Treasuries) + Comtrade (via country profiles) are keyed and FAIL CLOSED when
  // their key is absent — they contribute nothing rather than fabricating.
  let result: LiveIngestionResult | null = null
  let brief: BriefDraft | null = null
  let error: unknown = null
  try {
    result = await produceBriefResult({
      ctx,
      figureConnectors: [fxConnector, brentConnector, fredConnector],
      newsConnectors: [gdeltConnector(NEWS_QUERY)],
      profileConnectors: [countryProfileConnector()],
      sources: SOURCES,
      brief: { id: `live_${date}`, date, edition: 'daily' },
    })
    brief = result.brief
  } catch (e) {
    error = e
  }

  mkdirSync(OUT_DIR, { recursive: true })
  writeFileSync(OUT_FILE, serializeArtifact(brief, generatedAt))

  // Always surface the ingestion audit trail when we have one — connector failures,
  // drops and counts — so the run log explains a thin or null brief.
  if (result) logDiagnostics(result.diagnostics)

  if (brief && !error) {
    console.log(
      `Wrote ${OUT_FILE}: gate-passed brief (figures=${brief.figures.length}, events=${brief.events.length}, claims=${brief.claims.length}) at ${generatedAt}`,
    )
  } else {
    const reason = error
      ? `pipeline error: ${error instanceof Error ? error.message : String(error)}`
      : 'no gate-passed brief produced'
    console.error(
      `Wrote ${OUT_FILE}: null artifact (${reason}) at ${generatedAt} — cleared stale output`,
    )
    process.exitCode = 1
  }
}

main().catch((e) => {
  console.error(e)
  process.exitCode = 1
})
