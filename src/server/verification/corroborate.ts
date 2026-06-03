import type { NewsItem } from '../../domain/news'
import type { Event, EventStatus } from '../../domain/event'
import { sameEvent, type SameEventOptions } from './eventSignature'

// Topic key for human-readable ids/topic: first few normalized words of a headline.
function topicKey(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .slice(0, 8)
    .join(' ')
}

function hash(s: string): string {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0
  return (h >>> 0).toString(36)
}

export interface CorroborateOptions extends SameEventOptions {
  /** Map a sourceId to its independent "organisation" id (defaults to identity). */
  organisationOf?: (sourceId: string) => string
  /** Source ids that count as primary (issuer) sources. */
  primarySourceIds?: Set<string>
}

// Group NewsItems into Events by the STRICT same-event test (eventSignature), using
// union-find so the grouping is transitive and order-independent. An Event is
// 'corroborated' only when reported by >= 2 independent registered sources;
// otherwise it is explicitly 'single_source'. Independence is counted over
// registered source ids (via organisationOf) — never over publisher domains.
export function corroborateEvents(items: NewsItem[], opts: CorroborateOptions = {}): Event[] {
  const orgOf = opts.organisationOf ?? ((s: string) => s)
  const primary = opts.primarySourceIds ?? new Set<string>()

  // Union-find over item indices.
  const parent = items.map((_, i) => i)
  const find = (x: number): number => {
    let r = x
    while (parent[r] !== r) r = parent[r]
    while (parent[x] !== r) {
      const next = parent[x]
      parent[x] = r
      x = next
    }
    return r
  }
  const union = (a: number, b: number): void => {
    const ra = find(a)
    const rb = find(b)
    if (ra !== rb) parent[ra] = rb
  }

  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      if (sameEvent(items[i], items[j], opts)) union(i, j)
    }
  }

  // Collect clusters (preserve input order of representatives for determinism).
  const clusters = new Map<number, NewsItem[]>()
  items.forEach((it, i) => {
    const root = find(i)
    const arr = clusters.get(root)
    if (arr) arr.push(it)
    else clusters.set(root, [it])
  })

  const events: Event[] = []
  for (const group of clusters.values()) {
    const orgs = new Set(group.map((g) => orgOf(g.sourceId)))
    const independentSourceCount = orgs.size
    const primarySourceCount = new Set(
      group.filter((g) => primary.has(g.sourceId)).map((g) => orgOf(g.sourceId)),
    ).size
    const status: EventStatus = independentSourceCount >= 2 ? 'corroborated' : 'single_source'
    const first = group[0]
    const key = topicKey(first.title) || 'event'
    events.push({
      // Title-derived slug + a stable hash of the member ids keeps ids readable yet
      // unique across distinct clusters that happen to share a leading headline.
      id: `evt_${key.replace(/ /g, '_')}_${hash(
        group
          .map((g) => g.id)
          .sort()
          .join('|'),
      )}`,
      title: first.title,
      summary: first.summary,
      occurredAt: first.publishedAt,
      countryCodes: [...new Set(group.flatMap((g) => g.countryCodes ?? []))],
      topic: key,
      status,
      corroboration: {
        newsItemIds: group.map((g) => g.id),
        sourceIds: [...new Set(group.map((g) => g.sourceId))],
        independentSourceCount,
        primarySourceCount,
      },
    })
  }
  return events
}
