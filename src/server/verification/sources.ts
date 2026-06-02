import type { Source } from '../../domain/source'

// Every source id referenced by a figure or event must resolve to a Source in
// the registry. An unresolved id means a figure/event is claiming provenance we
// cannot trace — it is rejected at ingestion and again at the publish gate.
export function knownSourceIds(sources: Source[]): Set<string> {
  return new Set(sources.map((s) => s.id))
}

// The ids in `ids` that are not present in the registry (deduped, order-stable).
export function unknownIds(ids: readonly string[], known: Set<string>): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const id of ids) {
    if (known.has(id) || seen.has(id)) continue
    seen.add(id)
    out.push(id)
  }
  return out
}
