import type { BriefDraft } from '../domain/brief'
import { runPublishGate } from '../server/publishing/publishGate'
import { knownSourceIds } from '../server/verification/sources'
import { SOURCES } from '../data/sources'

// The static artifact the out-of-band pipeline writes a gate-passed brief to. It is
// absent in environments that have not produced one (e.g. a no-key preview), in which
// case the runtime shows its empty state.
const DEFAULT_BRIEF_URL = '/brief.json'

// The gate's provenance authority. The source REGISTRY is static reference data (not
// product data), so the runtime may know it; it lets the client re-run the gate fully.
const KNOWN_SOURCE_IDS = knownSourceIds(SOURCES)

// Maximum age the runtime will render as current intelligence. A brief whose artifact
// is older than this — e.g. because the generation job stalled — expires to the empty
// state rather than showing stale data as current. (Judged against the client clock;
// best-effort, as a static site has no server to assert time.)
const MAX_ARTIFACT_AGE_MS = 36 * 60 * 60 * 1000 // 36h

const DATE_YMD = /^\d{4}-\d{2}-\d{2}$/

function isValidDate(value: unknown): boolean {
  return typeof value === 'string' && (DATE_YMD.test(value) || !Number.isNaN(Date.parse(value)))
}

// Strict structural validation of the loaded artifact BEFORE the gate runs. Every
// required scalar must be present with the right type/value and every collection must
// be an array — nothing is defaulted. A missing or wrong field returns false, so the
// loader yields null and the runtime stays in its empty state rather than rendering a
// partial or malformed brief.
function isBriefShape(value: unknown): value is BriefDraft {
  if (typeof value !== 'object' || value === null) return false
  const b = value as Record<string, unknown>
  return (
    typeof b.id === 'string' &&
    b.id.length > 0 &&
    isValidDate(b.date) &&
    (b.edition === 'daily' || b.edition === 'weekly') &&
    (b.status === 'draft' || b.status === 'published') &&
    b.dataMode === 'live' &&
    Array.isArray(b.sections) &&
    Array.isArray(b.claims) &&
    Array.isArray(b.figures) &&
    Array.isArray(b.events) &&
    Array.isArray(b.profiles) &&
    Array.isArray(b.methodologies)
  )
}

// Loads the runtime brief from the `{ generatedAt, brief }` artifact and returns it
// ONLY if the artifact is fresh AND the brief is well-formed AND it re-passes the
// publish gate. Anything else — missing/404, unparseable, a non-object envelope, a
// missing/invalid/stale `generatedAt`, `brief: null`, a malformed brief, or a brief
// that fails the gate — yields null, and the runtime shows its empty state. The browser
// never runs connectors or the ingestion pipeline; it only re-validates an
// already-produced brief (the gate and its dependencies are pure: no network, keys, or
// connectors). `now` is injectable for tests.
export async function loadBrief(
  url: string = DEFAULT_BRIEF_URL,
  fetchImpl: typeof fetch = fetch,
  now: () => number = () => Date.now(),
): Promise<BriefDraft | null> {
  let payload: unknown
  try {
    const res = await fetchImpl(url)
    if (!res.ok) return null
    payload = await res.json()
  } catch {
    return null
  }

  // Envelope must be an object carrying a valid, fresh generatedAt.
  if (typeof payload !== 'object' || payload === null) return null
  const envelope = payload as { generatedAt?: unknown; brief?: unknown }
  if (typeof envelope.generatedAt !== 'string') return null
  const generatedAtMs = Date.parse(envelope.generatedAt)
  if (Number.isNaN(generatedAtMs)) return null
  if (now() - generatedAtMs > MAX_ARTIFACT_AGE_MS) return null // stale → empty state

  // The brief must be present and strictly well-formed, then re-pass the gate.
  const brief = envelope.brief
  if (!isBriefShape(brief)) return null
  try {
    const gate = runPublishGate(brief, { knownSourceIds: KNOWN_SOURCE_IDS })
    return gate.passed ? brief : null
  } catch {
    return null
  }
}
