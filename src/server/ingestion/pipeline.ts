import type { ConnectorContext } from '../connectors/types'
import type { RawFigure } from '../../domain/figure'
import type { NewsItem } from '../../domain/news'
import type { CountryProfile } from '../../domain/country'
import type { Source } from '../../domain/source'
import type { AnalysisDraft } from '../../domain/analysis'
import type { BriefDraft, Edition } from '../../domain/brief'
import type { PublishGateResult } from '../../domain/gate'
import type { CorroborateOptions } from '../verification/corroborate'
import { validateFigures } from '../verification/validateFigure'
import { corroborateEvents } from '../verification/corroborate'
import { knownSourceIds, unknownIds } from '../verification/sources'
import { figureContractReasons } from '../verification/figureContracts'
import {
  verifiedCountryProfiles,
  type RejectedCountryProfile,
} from '../verification/countryProfiles'
import { dedupeNewsItems } from './dedupe'
import { mergeNewsWindow } from './newsWindow'
import { composeAnalysisDraft } from '../analysis/composeAnalysisDraft'
import { composeBriefFromAnalysis } from '../analysis/buildBrief'
import { diagnoseClaimYield, type ClaimYieldDiagnostic } from '../analysis/claimYieldDiagnostics'
import { deriveCountryProfiles, METHODOLOGIES } from '../analysis/methodologies'
import { runPublishGate } from '../publishing/publishGate'
import { engageLiveMode } from '../runtimeMode'

// A connector is the only thing that turns the outside world into raw, untrusted
// inputs. It must never fabricate: on failure it throws (the pipeline records the
// failure and contributes nothing) or returns an empty list (e.g. disabled keyed
// connectors). The injectable `ConnectorContext.fetch` keeps it testable offline.
export interface FigureConnector {
  id: string
  run: (ctx: ConnectorContext) => Promise<RawFigure[]>
}

export interface NewsConnector {
  id: string
  run: (ctx: ConnectorContext) => Promise<NewsItem[]>
}

export interface CountryProfileConnector {
  id: string
  run: (ctx: ConnectorContext) => Promise<CountryProfile[]>
}

export interface ConnectorFailure {
  id: string
  reason: string
}

export interface RejectedFigure {
  metric: string
  reasons: string[]
}

// A transparent record of everything the pipeline dropped and why — so omissions
// are auditable, never silent. Nothing here is rendered as intelligence.
export interface LiveIngestionDiagnostics {
  connectorFailures: ConnectorFailure[]
  rejectedFigures: RejectedFigure[]
  droppedUnknownSourceFigures: string[]
  /** Figures dropped because their metric family's source contract was violated. */
  droppedContractFigures: string[]
  droppedUnknownSourceNews: string[]
  figureCount: number
  eventCount: number
  profileCount: number
  rejectedProfiles: RejectedCountryProfile[]
  /** Per corroborated event: classifier result, scored-effect count, and blocker (if any). */
  claimYield: ClaimYieldDiagnostic[]
}

export interface LiveIngestionResult {
  /** The publish gate outcome — the final authority on whether this may ship. */
  gate: PublishGateResult
  analysis: AnalysisDraft
  diagnostics: LiveIngestionDiagnostics
  /**
   * The brief to render. Present ONLY when the gate passed; null otherwise — a
   * caller literally cannot render an ungated brief.
   */
  brief: BriefDraft | null
  /**
   * The merged + pruned rolling news window (registered, within-window items) for the
   * caller to persist for the next run. Raw evidence only — never analysis.
   */
  newsWindow: NewsItem[]
}

export interface LiveIngestionInput {
  ctx: ConnectorContext
  figureConnectors: FigureConnector[]
  newsConnectors: NewsConnector[]
  profileConnectors: CountryProfileConnector[]
  /** The source registry every figure/event must trace back to. */
  sources: Source[]
  brief: { id: string; date: string; edition: Edition }
  corroborate?: CorroborateOptions
  /**
   * Prior runs' registered news items (the rolling window), already pruned to the
   * window by the caller. Merged with this run's fresh items so independent sources
   * reporting the same event at different times can corroborate. Omitted/empty =>
   * current-run-only behaviour (fail closed).
   */
  priorNews?: NewsItem[]
  /** Rolling-window length in ms (defaults to the newsWindow module default). */
  newsWindowMs?: number
}

function failureReason(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

// End-to-end live pipeline:
//   connectors -> RawFigure[]/NewsItem[]/CountryProfile[] -> validate/corroborate ->
//   composeAnalysisDraft -> composeBriefFromAnalysis -> runPublishGate ->
//   brief (only if the gate passes).
// Every stage fails closed: missing or untraceable evidence is omitted and
// recorded in diagnostics, never filled in.
export async function runLiveIngestion(input: LiveIngestionInput): Promise<LiveIngestionResult> {
  // Running the live pipeline engages live mode for this process.
  engageLiveMode()

  const { ctx, sources } = input
  const known = knownSourceIds(sources)
  const connectorFailures: ConnectorFailure[] = []

  // 1. Collect. A throwing connector contributes nothing and is recorded —
  //    there is no fabricated fallback.
  const rawFigures: RawFigure[] = []
  for (const c of input.figureConnectors) {
    try {
      rawFigures.push(...(await c.run(ctx)))
    } catch (e) {
      connectorFailures.push({ id: c.id, reason: failureReason(e) })
    }
  }
  const rawNews: NewsItem[] = []
  for (const c of input.newsConnectors) {
    try {
      rawNews.push(...(await c.run(ctx)))
    } catch (e) {
      connectorFailures.push({ id: c.id, reason: failureReason(e) })
    }
  }
  const rawProfiles: CountryProfile[] = []
  for (const c of input.profileConnectors) {
    try {
      rawProfiles.push(...(await c.run(ctx)))
    } catch (e) {
      connectorFailures.push({ id: c.id, reason: failureReason(e) })
    }
  }

  // 2. Validate figures. Anything that fails source/timestamp/range is omitted.
  const validated = validateFigures(rawFigures)
  const rejectedFigures: RejectedFigure[] = validated
    .filter((f) => f.status !== 'verified')
    .map((f) => ({ metric: f.metric, reasons: f.validation.reasons }))
  let figures = validated.filter((f) => f.status === 'verified')

  // 3. Resolve provenance. Drop any figure/news whose source id is not in the
  //    registry (fail closed); the gate re-checks this as the final authority.
  const droppedUnknownSourceFigures: string[] = []
  figures = figures.filter((f) => {
    const unknown = unknownIds(f.sourceIds, known)
    if (unknown.length > 0) {
      droppedUnknownSourceFigures.push(`${f.metric} (${unknown.join(', ')})`)
      return false
    }
    return true
  })

  // Enforce the figure source contracts: a registered source is necessary but not
  // sufficient — fx.* must come from src.open_er_api, commodity.brent from src.eia,
  // etc. A registered-but-wrong source (or an uncontracted metric) is dropped here
  // and re-checked by the gate. Mirrors the unknown-source resolution above.
  const droppedContractFigures: string[] = []
  figures = figures.filter((f) => {
    const reasons = figureContractReasons(f)
    if (reasons.length > 0) {
      droppedContractFigures.push(`${f.metric} (${reasons.join('; ')})`)
      return false
    }
    return true
  })

  const droppedUnknownSourceNews: string[] = []
  const freshNews = dedupeNewsItems(rawNews).filter((n) => {
    if (!known.has(n.sourceId)) {
      droppedUnknownSourceNews.push(`${n.id} (${n.sourceId})`)
      return false
    }
    return true
  })

  // 4. Corroborate news into events (>= 2 independent REGISTERED sources => corroborated).
  //    First widen the evidence pool with the rolling window: prior runs' registered news
  //    items (already pruned to the window by the caller) merged with this run's fresh
  //    items, so independent sources reporting the same event at different TIMES still
  //    line up. Prior items are re-filtered to the registry here (defense in depth — a
  //    tampered store cannot inject unknown sources); the gate re-checks every event's
  //    sources as the final authority. Corroboration RULES are unchanged.
  const priorNews = (input.priorNews ?? []).filter((n) => known.has(n.sourceId))
  const newsWindow = mergeNewsWindow(priorNews, freshNews, ctx.now(), input.newsWindowMs)
  const events = corroborateEvents(newsWindow, input.corroborate)

  // 5. Country profiles. Connectors emit raw sourced inputs; an explicit,
  //    approved methodology turns them into derived labels (none ship approved by
  //    default, so labels are simply absent). Verification then requires source
  //    provenance for raw fields and an approved methodology for derived ones.
  const derivedProfiles = deriveCountryProfiles(rawProfiles, METHODOLOGIES)
  const { profiles, rejected: rejectedProfiles } = verifiedCountryProfiles(derivedProfiles, known)

  // 6. Analyse. Deterministic V0 over verified figures + events + sourced profiles.
  const analysis = composeAnalysisDraft({
    id: `analysis_${input.brief.id}`,
    figures,
    events,
    profiles,
    now: ctx.now,
  })

  // Claim-yield audit trail: for each corroborated event, why it did or didn't produce
  // scored effects. A pure read over the generated links — no effect on the analysis,
  // the claims, or the gate.
  const claimYield = diagnoseClaimYield(events, analysis.causalLinks, profiles)

  // 7. Assemble a live brief, then 8. let the publish gate decide.
  const draft = composeBriefFromAnalysis({
    id: input.brief.id,
    date: input.brief.date,
    edition: input.brief.edition,
    dataMode: 'live',
    analysis,
    figures,
    events,
    profiles,
  })
  const gate = runPublishGate(draft, { knownSourceIds: known })

  return {
    gate,
    analysis,
    brief: gate.passed ? draft : null,
    newsWindow,
    diagnostics: {
      connectorFailures,
      rejectedFigures,
      droppedUnknownSourceFigures,
      droppedContractFigures,
      droppedUnknownSourceNews,
      figureCount: figures.length,
      eventCount: events.length,
      profileCount: profiles.length,
      rejectedProfiles,
      claimYield,
    },
  }
}
