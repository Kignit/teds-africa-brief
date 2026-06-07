/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'

// Pre-production validator for public/brief.json and data/news-window.json. This is a
// READ-ONLY audit that runs after artifact generation: it never regenerates, never edits the
// brief, and never re-runs classifier/gate/scoring/methodology logic. It checks that the
// already-produced artifact is structurally well-formed, internally cross-referenced, and
// free of the HTML-entity residue PRs #29-32 are supposed to prevent. A FAILURE blocks
// landing; a WARNING is reported but does not (used for deliberate residue like "[&#823"
// the decoder intentionally leaves literal as unrecoverable feed truncation).

export type IssueCategory = 'failure' | 'warning'
export interface Issue {
  category: IssueCategory
  rule: string
  detail: string
  ref?: string
}

// Mirrors the decoder's NAMED_ENTITIES table - any of these surviving WITH ';' indicates a
// decoder regression (a clean ingestion should have decoded it). Inlined here so the
// validator stays a self-contained tool (no shared mutable state with the decoder).
const DECODER_NAMED_ENTITIES = new Set<string>([
  'amp',
  'lt',
  'gt',
  'quot',
  'apos',
  'nbsp',
  'ndash',
  'mdash',
  'lsquo',
  'rsquo',
  'sbquo',
  'ldquo',
  'rdquo',
  'bdquo',
  'hellip',
  'deg',
  'copy',
  'reg',
  'trade',
  'eacute',
  'egrave',
  'agrave',
])

// Mirrors the decoder's LENIENT_DECIMAL_CODES allowlist. Any of these WITHOUT ';' surviving
// indicates a leniency regression - the decoder should have decoded them.
const DECODER_LENIENT_DECIMALS = new Set<string>([
  '38',
  '8211',
  '8216',
  '8217',
  '8220',
  '8221',
  '8230',
])

// Any well-formed entity reference (numeric or named) that still has its terminating ';'.
const FULL_ENTITY_RE = /&(#\d+|#x[0-9a-f]+|[a-z][a-z0-9]*);/gi
// "&#" + zero or more digits, NOT followed by another digit, ';', or 'x' (so we don't
// double-match the hex prefix). Captures the digit run for allowlist classification.
const NUMERIC_NO_SEMI_RE = /&#(\d*)(?![\dx;])/gi
// "&#x" + zero or more hex chars, NOT followed by another hex char or ';'.
const HEX_NO_SEMI_RE = /&#x[0-9a-f]*(?![0-9a-f;])/gi

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}
function isString(v: unknown): v is string {
  return typeof v === 'string'
}
function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0
}
function isValidIso(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0 && !Number.isNaN(Date.parse(v))
}
function fail(rule: string, detail: string, ref?: string): Issue {
  return { category: 'failure', rule, detail, ref }
}
function warn(rule: string, detail: string, ref?: string): Issue {
  return { category: 'warning', rule, detail, ref }
}

// Envelope: { generatedAt, brief } with a valid ISO generatedAt. Returns the inner brief
// and generatedAt when the envelope is well-formed; otherwise just the issues.
export function validateEnvelope(payload: unknown): {
  brief?: unknown
  generatedAt?: string
  issues: Issue[]
} {
  if (!isObject(payload)) {
    return { issues: [fail('envelope_shape', 'top-level artifact is not a JSON object')] }
  }
  const issues: Issue[] = []
  if (!isValidIso(payload.generatedAt)) {
    issues.push(
      fail(
        'envelope_generated_at',
        `generatedAt is missing or not a valid ISO timestamp (got ${JSON.stringify(payload.generatedAt)})`,
      ),
    )
  }
  if (payload.brief === undefined) {
    issues.push(fail('envelope_shape', 'envelope has no "brief" field'))
  }
  return {
    brief: payload.brief,
    generatedAt: isString(payload.generatedAt) ? payload.generatedAt : undefined,
    issues,
  }
}

// Brief top-level shape: matches the runtime loader's isBriefShape contract (id, date,
// edition, status, dataMode, and the six collections must be arrays).
export function validateBriefShape(brief: unknown): Issue[] {
  const issues: Issue[] = []
  if (!isObject(brief)) {
    issues.push(fail('brief_shape', 'brief is not an object'))
    return issues
  }
  if (!isNonEmptyString(brief.id))
    issues.push(fail('brief_shape', 'brief.id missing or not a non-empty string'))
  if (
    !isString(brief.date) ||
    !(ISO_DATE_RE.test(brief.date) || !Number.isNaN(Date.parse(brief.date)))
  ) {
    issues.push(fail('brief_shape', `brief.date is not a date (got ${JSON.stringify(brief.date)})`))
  }
  if (brief.edition !== 'daily' && brief.edition !== 'weekly') {
    issues.push(
      fail(
        'brief_shape',
        `brief.edition must be 'daily' or 'weekly' (got ${JSON.stringify(brief.edition)})`,
      ),
    )
  }
  if (brief.status !== 'draft' && brief.status !== 'published') {
    issues.push(
      fail(
        'brief_shape',
        `brief.status must be 'draft' or 'published' (got ${JSON.stringify(brief.status)})`,
      ),
    )
  }
  if (brief.dataMode !== 'live') {
    issues.push(
      fail('brief_shape', `brief.dataMode must be 'live' (got ${JSON.stringify(brief.dataMode)})`),
    )
  }
  for (const collection of [
    'sections',
    'claims',
    'figures',
    'events',
    'profiles',
    'methodologies',
  ] as const) {
    if (!Array.isArray(brief[collection])) {
      issues.push(fail('brief_shape', `brief.${collection} is not an array`))
    }
  }
  return issues
}

// Per-event shape: required id/title/summary/status/occurredAt + corroboration sub-fields.
// (The publish gate already enforces corroboration counts on PUBLISHED claims; here we only
// audit that the structural fields the brief carries are typed correctly.)
export function validateEvents(events: unknown[]): Issue[] {
  const issues: Issue[] = []
  events.forEach((e, i) => {
    const ref = `events[${i}]`
    if (!isObject(e)) {
      issues.push(fail('event_shape', 'event is not an object', ref))
      return
    }
    const id = isString(e.id) ? e.id : ref
    if (!isNonEmptyString(e.id)) issues.push(fail('event_shape', 'event.id missing or empty', ref))
    if (!isString(e.title))
      issues.push(fail('event_shape', 'event.title missing or not a string', id))
    if (!isString(e.summary))
      issues.push(fail('event_shape', 'event.summary missing or not a string', id))
    if (e.status !== 'corroborated' && e.status !== 'single_source' && e.status !== 'unconfirmed') {
      issues.push(
        fail(
          'event_shape',
          `event.status must be corroborated/single_source/unconfirmed (got ${JSON.stringify(e.status)})`,
          id,
        ),
      )
    }
    if (!isValidIso(e.occurredAt)) {
      issues.push(
        fail(
          'event_shape',
          `event.occurredAt is not a valid ISO timestamp (got ${JSON.stringify(e.occurredAt)})`,
          id,
        ),
      )
    }
    const c = e.corroboration
    if (!isObject(c)) {
      issues.push(fail('event_shape', 'event.corroboration missing or not an object', id))
    } else {
      if (!Array.isArray(c.sourceIds) || !c.sourceIds.every(isString)) {
        issues.push(
          fail('event_shape', 'event.corroboration.sourceIds must be an array of strings', id),
        )
      }
      if (!Array.isArray(c.newsItemIds) || !c.newsItemIds.every(isString)) {
        issues.push(
          fail('event_shape', 'event.corroboration.newsItemIds must be an array of strings', id),
        )
      }
      if (typeof c.independentSourceCount !== 'number') {
        issues.push(
          fail('event_shape', 'event.corroboration.independentSourceCount must be a number', id),
        )
      }
      if (typeof c.primarySourceCount !== 'number') {
        issues.push(
          fail('event_shape', 'event.corroboration.primarySourceCount must be a number', id),
        )
      }
    }
  })
  return issues
}

// Internal cross-references: every claim must cite events/methodologies the brief CARRIES,
// and verified claims must have figureIds/countryCode that resolve too. We do NOT re-run
// the publish gate here - the gate already validated source/methodology semantics during
// generation; this is a narrower integrity check on the SHAPE of the produced artifact.
export function validateClaimReferences(brief: {
  claims: unknown[]
  events: unknown[]
  figures: unknown[]
  methodologies: unknown[]
  profiles: unknown[]
}): Issue[] {
  const issues: Issue[] = []
  const eventIds = new Set(
    brief.events
      .filter(isObject)
      .map((e) => e.id)
      .filter(isString),
  )
  const methodologyIds = new Set(
    brief.methodologies
      .filter(isObject)
      .map((m) => m.id)
      .filter(isString),
  )
  const figureIds = new Set(
    brief.figures
      .filter(isObject)
      .map((f) => f.id)
      .filter(isString),
  )
  const profileCodes = new Set(
    brief.profiles
      .filter(isObject)
      .map((p) => p.code)
      .filter(isString),
  )

  brief.claims.forEach((claim, i) => {
    if (!isObject(claim)) {
      issues.push(fail('claim_shape', 'claim is not an object', `claims[${i}]`))
      return
    }
    const id = isString(claim.id) ? claim.id : `claims[${i}]`

    if (Array.isArray(claim.eventIds)) {
      for (const ev of claim.eventIds) {
        if (isString(ev) && !eventIds.has(ev)) {
          issues.push(
            fail('claim_event_unresolved', `claim cites event ${ev} not carried by the brief`, id),
          )
        }
      }
    }
    if (Array.isArray(claim.methodologyIds)) {
      for (const m of claim.methodologyIds) {
        if (isString(m) && !methodologyIds.has(m)) {
          issues.push(
            fail(
              'claim_methodology_unresolved',
              `claim cites methodology ${m} not carried by the brief`,
              id,
            ),
          )
        }
      }
    }

    // Verified-claim provenance must resolve all the way through.
    if (claim.verified === true) {
      if (Array.isArray(claim.figureIds)) {
        for (const f of claim.figureIds) {
          if (isString(f) && !figureIds.has(f)) {
            issues.push(
              fail(
                'claim_figure_unresolved',
                `verified claim cites figure ${f} not carried by the brief`,
                id,
              ),
            )
          }
        }
      }
      // Every verified claim needs AT LEAST ONE backing reference (figure or event).
      const hasBacking =
        (Array.isArray(claim.figureIds) && claim.figureIds.length > 0) ||
        (Array.isArray(claim.eventIds) && claim.eventIds.length > 0)
      if (!hasBacking) {
        issues.push(fail('claim_unbacked', 'verified claim has no figure or event backing', id))
      }
      if (isString(claim.countryCode) && !profileCodes.has(claim.countryCode)) {
        issues.push(
          fail(
            'claim_country_unresolved',
            `verified claim country ${claim.countryCode} not carried by the brief`,
            id,
          ),
        )
      }
    }
  })
  return issues
}

// Per-section shape + claim-reference resolution. Sections are user-facing surface in the
// runtime (kicker/title/body all render), so id / kicker / title / body must be strings and
// every section.claimIds entry must resolve to a claim the brief carries. A dangling
// claimId could surface as a broken reference in the UI - flag it as a failure here.
export function validateSections(sections: unknown[], claimIds: Set<string>): Issue[] {
  const issues: Issue[] = []
  sections.forEach((s, i) => {
    const ref = `sections[${i}]`
    if (!isObject(s)) {
      issues.push(fail('section_shape', 'section is not an object', ref))
      return
    }
    const id = isString(s.id) ? s.id : ref
    if (!isNonEmptyString(s.id))
      issues.push(fail('section_shape', 'section.id missing or empty', ref))
    if (!isString(s.kicker))
      issues.push(fail('section_shape', 'section.kicker missing or not a string', id))
    if (!isString(s.title))
      issues.push(fail('section_shape', 'section.title missing or not a string', id))
    if (!isString(s.body))
      issues.push(fail('section_shape', 'section.body missing or not a string', id))
    if (!Array.isArray(s.claimIds) || !s.claimIds.every(isString)) {
      issues.push(fail('section_shape', 'section.claimIds must be an array of strings', id))
    } else {
      for (const cid of s.claimIds) {
        if (!claimIds.has(cid)) {
          issues.push(
            fail(
              'section_claim_unresolved',
              `section cites claim ${cid} not carried by the brief`,
              id,
            ),
          )
        }
      }
    }
  })
  return issues
}

// Rolling-window items: required source-backed fields. Mirrors readPriorWindow's isNewsItem
// shape contract (string id/sourceId/title/url/publishedAt; optional summary/language/codes
// must be the right type if present).
export function validateWindowStore(store: unknown): Issue[] {
  const issues: Issue[] = []
  if (!isObject(store)) {
    issues.push(fail('window_shape', 'news-window store is not an object'))
    return issues
  }
  if (!isString(store.updatedAt)) {
    issues.push(fail('window_shape', 'news-window.updatedAt missing or not a string'))
  } else if (!isValidIso(store.updatedAt)) {
    issues.push(
      fail(
        'window_shape',
        `news-window.updatedAt is not a valid ISO (got ${JSON.stringify(store.updatedAt)})`,
      ),
    )
  }
  if (typeof store.windowMs !== 'number') {
    issues.push(fail('window_shape', 'news-window.windowMs must be a number'))
  }
  if (!Array.isArray(store.items)) {
    issues.push(fail('window_shape', 'news-window.items must be an array'))
    return issues
  }
  store.items.forEach((it, i) => {
    const ref = `items[${i}]`
    if (!isObject(it)) {
      issues.push(fail('window_item_shape', 'window item is not an object', ref))
      return
    }
    const id = isString(it.id) ? it.id : ref
    if (!isNonEmptyString(it.id))
      issues.push(fail('window_item_shape', 'window item.id missing or empty', ref))
    if (!isNonEmptyString(it.sourceId))
      issues.push(fail('window_item_shape', 'window item.sourceId missing or empty', id))
    if (!isString(it.title))
      issues.push(fail('window_item_shape', 'window item.title missing or not a string', id))
    if (!isString(it.url))
      issues.push(fail('window_item_shape', 'window item.url missing or not a string', id))
    if (!isValidIso(it.publishedAt))
      issues.push(
        fail(
          'window_item_shape',
          `window item.publishedAt is not a valid ISO (got ${JSON.stringify(it.publishedAt)})`,
          id,
        ),
      )
    if (it.summary !== undefined && !isString(it.summary))
      issues.push(
        fail('window_item_shape', 'window item.summary must be a string when present', id),
      )
    if (it.language !== undefined && !isString(it.language))
      issues.push(
        fail('window_item_shape', 'window item.language must be a string when present', id),
      )
    if (
      it.countryCodes !== undefined &&
      !(Array.isArray(it.countryCodes) && it.countryCodes.every(isString))
    ) {
      issues.push(
        fail(
          'window_item_shape',
          'window item.countryCodes must be an array of strings when present',
          id,
        ),
      )
    }
  })
  return issues
}

// Bucket a single text into failures / warnings against the decoder's contract:
//   FAILURE: any well-formed entity that the decoder SHOULD have decoded (numeric with ';',
//            or any of the decoder-known named entities with ';'), or an allowlisted decimal
//            WITHOUT ';' (the leniency path the decoder should have caught).
//   WARNING: a numeric fragment without ';' that's NOT on the allowlist (deliberately left
//            literal - "[&#823" / "[&#" / "&#1234" - unrecoverable upstream truncation), or
//            any hex fragment without ';' (Codex's hex carve-out leaves these literal too).
//   IGNORED: unknown named entities like "&foobar;" - the decoder leaves these alone on
//            purpose (no value in trying to decode an unknown name).
export function scanEntityResidue(scope: string, ref: string, text: string): Issue[] {
  if (!text || !text.includes('&')) return []
  const issues: Issue[] = []
  for (const m of text.matchAll(FULL_ENTITY_RE)) {
    const body = m[1] // captured group: the inner reference (e.g. "#8217" or "amp")
    if (body[0] === '#') {
      issues.push(fail('entity_residue_full', `${scope} contains decodable entity "${m[0]}"`, ref))
    } else if (DECODER_NAMED_ENTITIES.has(body.toLowerCase())) {
      issues.push(
        fail('entity_residue_full', `${scope} contains decodable named entity "${m[0]}"`, ref),
      )
    }
    // unknown named entity: decoder leaves intact on purpose - do not flag
  }
  for (const m of text.matchAll(NUMERIC_NO_SEMI_RE)) {
    const digits = m[1]
    if (digits && DECODER_LENIENT_DECIMALS.has(digits)) {
      issues.push(
        fail(
          'entity_residue_allowlist_no_semi',
          `${scope} contains allowlisted decimal entity without ';': "${m[0]}"`,
          ref,
        ),
      )
    } else {
      issues.push(
        warn(
          'entity_residue_fragment',
          `${scope} contains unrecoverable numeric fragment "${m[0]}"`,
          ref,
        ),
      )
    }
  }
  for (const m of text.matchAll(HEX_NO_SEMI_RE)) {
    issues.push(
      warn(
        'entity_residue_fragment',
        `${scope} contains unrecoverable hex fragment "${m[0]}"`,
        ref,
      ),
    )
  }
  return issues
}

// Public text surfaces a reader of the artifact actually sees: event title/summary, claim
// text, and rolling-window item title/summary. (Provenance lines in the runtime UI are
// derived from THESE plus source/methodology names from static registries, so cleaning the
// underlying fields cleans the rendered lines too.)
export function scanAllPublicText(
  brief: {
    events: unknown[]
    claims: unknown[]
    sections: unknown[]
    methodologies: unknown[]
  },
  windowItems: unknown[],
): Issue[] {
  const issues: Issue[] = []
  for (const e of brief.events) {
    if (!isObject(e)) continue
    const id = isString(e.id) ? e.id : '(no id)'
    if (isString(e.title)) issues.push(...scanEntityResidue('event.title', id, e.title))
    if (isString(e.summary)) issues.push(...scanEntityResidue('event.summary', id, e.summary))
  }
  for (const c of brief.claims) {
    if (!isObject(c)) continue
    const id = isString(c.id) ? c.id : '(no id)'
    if (isString(c.text)) issues.push(...scanEntityResidue('claim.text', id, c.text))
  }
  // Section kicker / title / body render verbatim in the runtime, so they need the same
  // residue audit as event/claim text - a "T &amp; T" title would surface as literal HTML.
  for (const s of brief.sections) {
    if (!isObject(s)) continue
    const id = isString(s.id) ? s.id : '(no id)'
    if (isString(s.kicker)) issues.push(...scanEntityResidue('section.kicker', id, s.kicker))
    if (isString(s.title)) issues.push(...scanEntityResidue('section.title', id, s.title))
    if (isString(s.body)) issues.push(...scanEntityResidue('section.body', id, s.body))
  }
  // Methodology name (and description / mechanism when present) is rendered by the runtime
  // claim-provenance display (PR #28), so a "Bad &amp; Method" methodology.name would surface
  // as literal HTML next to verified claims. Source names live in the static registry, not
  // the artifact, so they are out of scope here.
  for (const m of brief.methodologies) {
    if (!isObject(m)) continue
    const id = isString(m.id) ? m.id : '(no id)'
    if (isString(m.name)) issues.push(...scanEntityResidue('methodology.name', id, m.name))
    if (isString(m.description)) {
      issues.push(...scanEntityResidue('methodology.description', id, m.description))
    }
    if (isString(m.mechanism)) {
      issues.push(...scanEntityResidue('methodology.mechanism', id, m.mechanism))
    }
  }
  for (const it of windowItems) {
    if (!isObject(it)) continue
    const id = isString(it.id) ? it.id : '(no id)'
    if (isString(it.title)) issues.push(...scanEntityResidue('window.title', id, it.title))
    if (isString(it.summary)) issues.push(...scanEntityResidue('window.summary', id, it.summary))
  }
  return issues
}

// Compose every check. Returns a flat issue list; the CLI sorts and prints them.
export function validateArtifact(briefArtifact: unknown, windowStore: unknown): Issue[] {
  const issues: Issue[] = []
  const env = validateEnvelope(briefArtifact)
  issues.push(...env.issues)
  // If the envelope itself is broken, the rest of the checks would be noise.
  const shape = env.brief !== undefined ? validateBriefShape(env.brief) : []
  issues.push(...shape)
  const brief = isObject(env.brief) ? env.brief : undefined
  if (brief && Array.isArray(brief.events)) issues.push(...validateEvents(brief.events))
  if (
    brief &&
    Array.isArray(brief.claims) &&
    Array.isArray(brief.events) &&
    Array.isArray(brief.figures) &&
    Array.isArray(brief.methodologies) &&
    Array.isArray(brief.profiles)
  ) {
    issues.push(
      ...validateClaimReferences({
        claims: brief.claims,
        events: brief.events,
        figures: brief.figures,
        methodologies: brief.methodologies,
        profiles: brief.profiles,
      }),
    )
  }
  if (brief && Array.isArray(brief.sections) && Array.isArray(brief.claims)) {
    const claimIds = new Set(
      brief.claims
        .filter(isObject)
        .map((c) => c.id)
        .filter(isString),
    )
    issues.push(...validateSections(brief.sections, claimIds))
  }
  const windowIssues = validateWindowStore(windowStore)
  issues.push(...windowIssues)
  const windowItems =
    isObject(windowStore) && Array.isArray(windowStore.items) ? windowStore.items : []
  if (
    brief &&
    Array.isArray(brief.events) &&
    Array.isArray(brief.claims) &&
    Array.isArray(brief.sections) &&
    Array.isArray(brief.methodologies)
  ) {
    issues.push(
      ...scanAllPublicText(
        {
          events: brief.events,
          claims: brief.claims,
          sections: brief.sections,
          methodologies: brief.methodologies,
        },
        windowItems,
      ),
    )
  }
  return issues
}

export interface ValidationSummary {
  failures: Issue[]
  warnings: Issue[]
  exitCode: 0 | 1
}

export function summarise(issues: Issue[]): ValidationSummary {
  const failures = issues.filter((i) => i.category === 'failure')
  const warnings = issues.filter((i) => i.category === 'warning')
  return { failures, warnings, exitCode: failures.length > 0 ? 1 : 0 }
}

// Pretty-print summary + per-issue listing. ASCII only (no em dashes / arrows).
export function formatReport(
  briefPath: string,
  windowPath: string,
  briefSummary: { generatedAt?: string; events: number; claims: number; windowItems: number },
  summary: ValidationSummary,
): string {
  const lines: string[] = []
  lines.push(`brief    : ${briefPath}`)
  lines.push(`window   : ${windowPath}`)
  if (briefSummary.generatedAt) lines.push(`generated: ${briefSummary.generatedAt}`)
  lines.push(
    `counts   : events=${briefSummary.events} claims=${briefSummary.claims} windowItems=${briefSummary.windowItems}`,
  )
  lines.push('')
  lines.push(`failures: ${summary.failures.length}`)
  summary.failures.forEach((f, i) => {
    lines.push(`  [F${i + 1}] ${f.rule}${f.ref ? ` (${f.ref})` : ''}: ${f.detail}`)
  })
  lines.push(`warnings: ${summary.warnings.length}`)
  summary.warnings.forEach((w, i) => {
    lines.push(`  [W${i + 1}] ${w.rule}${w.ref ? ` (${w.ref})` : ''}: ${w.detail}`)
  })
  lines.push('')
  lines.push(summary.exitCode === 0 ? 'PASS' : 'FAIL')
  return lines.join('\n')
}

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

  const issues: Issue[] = []
  if (!briefRead.ok) {
    issues.push(fail('brief_read', `cannot read ${briefPath}: ${briefRead.error}`))
  }
  if (!windowRead.ok) {
    issues.push(fail('window_read', `cannot read ${windowPath}: ${windowRead.error}`))
  }
  if (briefRead.ok && windowRead.ok) {
    issues.push(...validateArtifact(briefRead.value, windowRead.value))
  }

  const summary = summarise(issues)
  const briefValue = briefRead.ok && isObject(briefRead.value) ? briefRead.value : undefined
  const brief = briefValue && isObject(briefValue.brief) ? briefValue.brief : undefined
  const windowValue = windowRead.ok && isObject(windowRead.value) ? windowRead.value : undefined
  const report = formatReport(
    briefPath,
    windowPath,
    {
      generatedAt: isString(briefValue?.generatedAt) ? briefValue.generatedAt : undefined,
      events: Array.isArray(brief?.events) ? brief.events.length : 0,
      claims: Array.isArray(brief?.claims) ? brief.claims.length : 0,
      windowItems: Array.isArray(windowValue?.items) ? windowValue.items.length : 0,
    },
    summary,
  )
  process.stdout.write(report + '\n')
  return summary.exitCode
}

// Run as CLI unless invoked from the vitest runner (which imports the named exports above
// and would otherwise trigger main() as a module side effect). vite-node strips the script
// path from process.argv before evaluating, so checking argv is not reliable; gating on
// process.env.VITEST is the standard pattern.
if (!process.env.VITEST) {
  process.exit(main())
}
