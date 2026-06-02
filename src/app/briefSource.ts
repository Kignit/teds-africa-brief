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

// Loads the runtime brief and returns it ONLY if it is well-formed AND re-passes the
// publish gate. The gate is the final authority even at the render boundary: a served
// artifact that is missing, unparseable, malformed, or does not pass the gate yields
// null, and the runtime shows its empty state. The browser never runs connectors or
// the ingestion pipeline — it only re-validates an already-produced brief (the gate
// and its dependencies are pure: no network, keys, or connectors).
export async function loadBrief(
  url: string = DEFAULT_BRIEF_URL,
  fetchImpl: typeof fetch = fetch,
): Promise<BriefDraft | null> {
  let payload: unknown
  try {
    const res = await fetchImpl(url)
    if (!res.ok) return null
    payload = await res.json()
  } catch {
    return null
  }
  if (!isBriefShape(payload)) return null
  try {
    const gate = runPublishGate(payload, { knownSourceIds: KNOWN_SOURCE_IDS })
    return gate.passed ? payload : null
  } catch {
    return null
  }
}
