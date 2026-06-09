/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'
import { validateArtifact, summarise, type Issue } from './validateBriefArtifact'

// Post-run audit report for the committed public/brief.json + data/news-window.json.
// READ-ONLY: this script reads the artifact, reuses the validator's checks, and emits a
// deterministic JSON report covering counts, validator issues, oilStance labels, and
// per-verified-claim provenance resolution. It never edits the artifact, regenerates,
// re-runs classifier / scoring / methodology / publish-gate / connector logic, or hits
// the network. Exit code is driven purely by the validator: 1 if there are any failures,
// 0 if only warnings (or none).
//
// This automates steps 2-6 of the post-run audit checklist in docs/runbook/artifact-
// workflow.md so an operator can drop the JSON into a triage doc or pipe it elsewhere
// instead of walking the checklist by hand.

// ---------- types ----------
export interface ResolvedEvent {
  id: string
  resolved: boolean
  title?: string
  status?: string
  sourceIds?: string[]
  newsItemIds?: string[]
}

export interface ResolvedMethodology {
  id: string
  resolved: boolean
  name?: string
  status?: string
  shockType?: string
}

export interface ResolvedFigure {
  id: string
  resolved: boolean
}

export interface VerifiedClaimReport {
  id: string
  countryCode: string | null
  shockType: string | null
  text: string
  events: ResolvedEvent[]
  methodologies: ResolvedMethodology[]
  profileSourceIds: string[]
  figures: ResolvedFigure[]
  unresolvedRefs: {
    events: string[]
    methodologies: string[]
    figures: string[]
  }
}

export interface OilStanceEntry {
  countryCode: string
  oilStance: string | null
}

export interface AuditReport {
  artifact: {
    briefPath: string
    windowPath: string
  }
  generatedAt: string | null
  counts: {
    figures: number
    events: number
    corroboratedEvents: number
    claims: number
    verifiedClaims: number
    profiles: number
    methodologies: number
    windowItems: number
    sourceLinks: number
  }
  validator: {
    failures: number
    warnings: number
    issues: Issue[]
  }
  oilStance: OilStanceEntry[]
  verifiedClaims: VerifiedClaimReport[]
}

// ---------- helpers ----------
function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}
function isString(v: unknown): v is string {
  return typeof v === 'string'
}
function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : []
}
function asString(v: unknown): string | null {
  return typeof v === 'string' ? v : null
}

// Stable per-id ordering so report output is deterministic across runs / machines. Tests
// can construct expected output without depending on artifact insertion order.
function byId<T extends { id: string }>(a: T, b: T): number {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}
function byCountry(a: OilStanceEntry, b: OilStanceEntry): number {
  return a.countryCode < b.countryCode ? -1 : a.countryCode > b.countryCode ? 1 : 0
}

// ---------- report builder (pure; tested directly) ----------
export function buildAuditReport(
  briefArtifact: unknown,
  windowStore: unknown,
  paths: { briefPath: string; windowPath: string } = {
    briefPath: '(unknown)',
    windowPath: '(unknown)',
  },
): AuditReport {
  // Run the validator FIRST so issue counts are part of the report regardless of how
  // well-formed the brief is. The validator handles its own envelope/shape guards.
  // summarise() returns failures/warnings as Issue[] (full lists). The report carries
  // both: a count for at-a-glance triage and the full issues list for operator detail.
  const issues = validateArtifact(briefArtifact, windowStore)
  const summary = summarise(issues)
  const failures = summary.failures.length
  const warnings = summary.warnings.length

  const envelope = isObject(briefArtifact) ? briefArtifact : {}
  const brief = isObject(envelope.brief) ? envelope.brief : null
  const generatedAt = asString(envelope.generatedAt)
  const windowObj = isObject(windowStore) ? windowStore : null

  const events = brief ? asArray(brief.events) : []
  const claims = brief ? asArray(brief.claims) : []
  const figures = brief ? asArray(brief.figures) : []
  const profiles = brief ? asArray(brief.profiles) : []
  const methodologies = brief ? asArray(brief.methodologies) : []
  const windowItems = windowObj ? asArray(windowObj.items) : []

  // Indexes for per-claim resolution. Filter to entries with string ids first so the
  // resolver never returns a truthy object for a missing-id event/methodology/figure.
  const eventById = new Map<string, Record<string, unknown>>()
  for (const e of events) {
    if (isObject(e) && isString(e.id)) eventById.set(e.id, e)
  }
  const methodologyById = new Map<string, Record<string, unknown>>()
  for (const m of methodologies) {
    if (isObject(m) && isString(m.id)) methodologyById.set(m.id, m)
  }
  const figureIdSet = new Set<string>()
  for (const f of figures) {
    if (isObject(f) && isString(f.id)) figureIdSet.add(f.id)
  }

  const corroboratedEvents = events.filter(
    (e): e is Record<string, unknown> => isObject(e) && e.status === 'corroborated',
  ).length
  // Total source-article links carried across events (raw count; the validator above flags any
  // malformed URL or unresolved newsItemId/sourceId, so those surface in validator.issues).
  const sourceLinks = events.reduce((n: number, e) => {
    if (!isObject(e) || !isObject(e.corroboration)) return n
    return n + asArray((e.corroboration as Record<string, unknown>).sources).length
  }, 0)
  const verifiedClaimObjects = claims.filter(
    (c): c is Record<string, unknown> => isObject(c) && c.verified === true,
  )

  // oilStance: report what the brief carries, generically. No country names are
  // hardcoded; the labels themselves come straight from the artifact's profiles.
  const oilStance: OilStanceEntry[] = []
  for (const p of profiles) {
    if (!isObject(p)) continue
    const countryCode = asString(p.code)
    if (countryCode === null) continue
    oilStance.push({ countryCode, oilStance: asString(p.oilStance) })
  }
  oilStance.sort(byCountry)

  const verifiedClaims: VerifiedClaimReport[] = verifiedClaimObjects.map((c) => {
    const id = asString(c.id) ?? '(no id)'
    const eventIds = asArray(c.eventIds).filter(isString)
    const methodologyIds = asArray(c.methodologyIds).filter(isString)
    const figureIds = asArray(c.figureIds).filter(isString)
    const profileSourceIds = asArray(c.profileSourceIds).filter(isString)

    const resolvedEvents: ResolvedEvent[] = eventIds.map((eid) => {
      const e = eventById.get(eid)
      if (!e) return { id: eid, resolved: false }
      return {
        id: eid,
        resolved: true,
        title: asString(e.title) ?? undefined,
        status: asString(e.status) ?? undefined,
        sourceIds: isObject(e.corroboration)
          ? asArray((e.corroboration as Record<string, unknown>).sourceIds).filter(isString)
          : [],
        newsItemIds: isObject(e.corroboration)
          ? asArray((e.corroboration as Record<string, unknown>).newsItemIds).filter(isString)
          : [],
      }
    })

    const resolvedMethodologies: ResolvedMethodology[] = methodologyIds.map((mid) => {
      const m = methodologyById.get(mid)
      if (!m) return { id: mid, resolved: false }
      return {
        id: mid,
        resolved: true,
        name: asString(m.name) ?? undefined,
        status: asString(m.status) ?? undefined,
        shockType: asString(m.shockType) ?? undefined,
      }
    })

    const resolvedFigures: ResolvedFigure[] = figureIds.map((fid) => ({
      id: fid,
      resolved: figureIdSet.has(fid),
    }))

    return {
      id,
      countryCode: asString(c.countryCode),
      shockType: asString(c.shockType),
      text: asString(c.text) ?? '',
      events: resolvedEvents.slice().sort(byId),
      methodologies: resolvedMethodologies.slice().sort(byId),
      profileSourceIds: profileSourceIds.slice().sort(),
      figures: resolvedFigures.slice().sort(byId),
      unresolvedRefs: {
        events: resolvedEvents
          .filter((e) => !e.resolved)
          .map((e) => e.id)
          .sort(),
        methodologies: resolvedMethodologies
          .filter((m) => !m.resolved)
          .map((m) => m.id)
          .sort(),
        figures: resolvedFigures
          .filter((f) => !f.resolved)
          .map((f) => f.id)
          .sort(),
      },
    }
  })
  verifiedClaims.sort(byId)

  return {
    artifact: { briefPath: paths.briefPath, windowPath: paths.windowPath },
    generatedAt,
    counts: {
      figures: figures.length,
      events: events.length,
      corroboratedEvents,
      claims: claims.length,
      verifiedClaims: verifiedClaimObjects.length,
      profiles: profiles.length,
      methodologies: methodologies.length,
      windowItems: windowItems.length,
      sourceLinks,
    },
    validator: { failures, warnings, issues },
    oilStance,
    verifiedClaims,
  }
}

// ---------- CLI ----------
function readJson(path: string): { ok: true; value: unknown } | { ok: false; error: string } {
  try {
    return { ok: true, value: JSON.parse(readFileSync(path, 'utf8')) }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

export function main(argv: string[] = process.argv.slice(2)): number {
  const briefPath = resolve(process.cwd(), argv[0] ?? 'public/brief.json')
  const windowPath = resolve(process.cwd(), argv[1] ?? 'data/news-window.json')

  const briefRead = readJson(briefPath)
  const windowRead = readJson(windowPath)

  if (!briefRead.ok) {
    process.stderr.write(`audit: cannot read ${briefPath}: ${briefRead.error}\n`)
    return 1
  }
  if (!windowRead.ok) {
    process.stderr.write(`audit: cannot read ${windowPath}: ${windowRead.error}\n`)
    return 1
  }

  const report = buildAuditReport(briefRead.value, windowRead.value, { briefPath, windowPath })
  process.stdout.write(JSON.stringify(report, null, 2) + '\n')
  return report.validator.failures > 0 ? 1 : 0
}

// Run as CLI unless invoked from the vitest runner (which imports the named exports
// above and would otherwise trigger main() as a module side effect). Same pattern as
// scripts/validateBriefArtifact.ts; gating on process.env.VITEST is the standard way.
if (!process.env.VITEST) {
  process.exit(main())
}
