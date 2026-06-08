import { writeFileSync, readFileSync, mkdirSync } from 'node:fs'
import process from 'node:process'
import { produceBriefResult, serializeArtifact } from '../src/server/runtime/produceBrief'
import {
  readPriorWindow,
  serializeNewsWindow,
  DEFAULT_WINDOW_MS,
} from '../src/server/ingestion/newsWindow'
import {
  fxConnector,
  brentConnector,
  fredConnector,
  gdeltConnector,
  countryProfileConnector,
  rssConnectorsFromSources,
} from '../src/server/ingestion/liveConnectors'
import { getConfig } from '../src/server/config'
import { SOURCES } from '../src/data/sources'
import type { ConnectorContext } from '../src/server/connectors/types'
import type {
  LiveIngestionDiagnostics,
  LiveIngestionResult,
} from '../src/server/ingestion/pipeline'
import type { BriefDraft } from '../src/domain/brief'
import type { NewsItem } from '../src/domain/news'
import type { ProfileTradeDiagnostic } from '../src/server/connectors/countryProfile'
import type { ClaimYieldDiagnostic } from '../src/server/analysis/claimYieldDiagnostics'

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
// Rolling news-window store: committed, OUTSIDE public/ — never served, never read by
// the client (whose only runtime artifact remains public/brief.json). It holds raw
// source-backed news items so corroboration can accumulate across runs.
const STORE_DIR = 'data'
const STORE_FILE = `${STORE_DIR}/news-window.json`
// GDELT DOC API rejects unparenthesized OR groups with HTTP 200 + text/html body
// `Queries containing OR'd terms must be surrounded by ().` - which the connector's
// res.json() then throws on. Wrapping the OR group in parens is the canonical syntax
// and the only thing needed to make the query accepted.
const NEWS_QUERY = '(Africa economy OR Africa currency OR Africa oil)'

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

// Surface WHY each country profile has or lacks trade fields (keyExports /
// importDependence): the Comtrade/OEC enrichment path per country. Purely informational
// — it never changes a field or the gate — so an omission is auditable, never silent.
function logProfileTradeDiagnostics(diags: ProfileTradeDiagnostic[]): void {
  if (diags.length === 0) return
  const byCode = new Map<string, string[]>()
  for (const d of diags) {
    const arr = byCode.get(d.code) ?? []
    const stage = d.flow ? `${d.stage}[${d.flow}]` : d.stage
    arr.push(`${stage}=${d.outcome}${d.detail ? `(${d.detail})` : ''}`)
    byCode.set(d.code, arr)
  }
  console.log('Profile trade enrichment (why trade fields are present/absent):')
  for (const [code, parts] of byCode) console.log(`  ${code}: ${parts.join(', ')}`)
}

// Surface the corroborated-event -> claim funnel: per corroborated event, the classifier
// result, scored-effect count, and the blocker when no claim resulted. Pure observability
// (not in the artifact) — it explains why corroborated != claims in a run.
function logClaimYieldDiagnostics(diags: ClaimYieldDiagnostic[]): void {
  if (diags.length === 0) return
  const producing = diags.filter((d) => d.blocker === null).length
  console.log(
    `Claim yield (corroborated events -> claims): ${diags.length} corroborated, ${producing} produced effects`,
  )
  for (const d of diags) {
    const cc = d.countryCodes.join(',') || '—'
    const outcome =
      d.blocker === null ? `effects=${d.effectCount} -> CLAIM` : `blocked: ${d.blocker}`
    const title = d.title.length > 60 ? `${d.title.slice(0, 57)}...` : d.title
    console.log(`  [${cc}] ${d.shock}: ${outcome} — "${title}" (${d.sourceIds.join('+')})`)
  }
}

// Load the prior rolling window, FAILING CLOSED to current-run-only ([]) if the store
// is missing/unreadable (readFileSync throws) or malformed/stale (readPriorWindow
// returns []). A bad store can never inject fabricated or expired evidence.
function loadPriorWindow(now: string): NewsItem[] {
  try {
    return readPriorWindow(readFileSync(STORE_FILE, 'utf8'), now, DEFAULT_WINDOW_MS)
  } catch {
    return []
  }
}

async function main(): Promise<void> {
  const generatedAt = new Date().toISOString()
  const date = generatedAt.slice(0, 10)
  const ctx: ConnectorContext = {
    fetch: globalThis.fetch,
    config: getConfig(process.env),
    now: () => new Date().toISOString(),
  }

  // Prior rolling window (fails closed to current-run-only — see loadPriorWindow).
  const priorNews = loadPriorWindow(generatedAt)

  // Collect auditable trade-enrichment diagnostics from the country-profile connector
  // (Comtrade skipped/failed, OEC attempted/non-OK/empty/populated) — logged below.
  const profileDiags: ProfileTradeDiagnostic[] = []

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
      // GDELT (global aggregator) + every registry RSS feed that declares a
      // feedUrl. Multiple INDEPENDENT registered sources are what make >= 2-source
      // corroboration — and therefore publishable causal claims — possible at all.
      newsConnectors: [gdeltConnector(NEWS_QUERY), ...rssConnectorsFromSources(SOURCES)],
      profileConnectors: [countryProfileConnector(undefined, (d) => profileDiags.push(d))],
      sources: SOURCES,
      // Rolling 72h window: prior runs' registered news items widen the corroboration
      // pool so independent sources reporting the same event at different times line up.
      priorNews,
      newsWindowMs: DEFAULT_WINDOW_MS,
      brief: { id: `live_${date}`, date, edition: 'daily' },
    })
    brief = result.brief
  } catch (e) {
    error = e
  }

  mkdirSync(OUT_DIR, { recursive: true })
  writeFileSync(OUT_FILE, serializeArtifact(brief, generatedAt))

  // Persist the merged rolling window for the next run — ONLY when the pipeline ran
  // (result present). On a pipeline throw we leave the prior store untouched rather than
  // clobber it. Evidence only: raw news items, never generated analysis.
  if (result) {
    mkdirSync(STORE_DIR, { recursive: true })
    writeFileSync(
      STORE_FILE,
      serializeNewsWindow(result.newsWindow, generatedAt, DEFAULT_WINDOW_MS),
    )
  }

  // Always surface the ingestion audit trail when we have one — connector failures,
  // drops and counts — so the run log explains a thin or null brief.
  if (result) {
    logDiagnostics(result.diagnostics)
    logProfileTradeDiagnostics(profileDiags)
    logClaimYieldDiagnostics(result.diagnostics.claimYield)
    console.log(
      `Rolling window: prior=${priorNews.length} -> persisted=${result.newsWindow.length} items (72h)`,
    )
  }

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
