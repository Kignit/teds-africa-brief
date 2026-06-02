import type { NewsItem } from '../../domain/news'
import type { Event, EventStatus } from '../../domain/event'

// Naive topic key from a headline: lowercased, alphanumerics only, first words.
function normalizeKey(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .slice(0, 8)
    .join(' ')
}

export interface CorroborateOptions {
  /** Map a sourceId to its independent "organisation" id (defaults to identity). */
  organisationOf?: (sourceId: string) => string
  /** Source ids that count as primary (issuer) sources. */
  primarySourceIds?: Set<string>
}

// Group NewsItems into Events. An Event is 'corroborated' only when reported by
// >= 2 independent sources; otherwise it is explicitly 'single_source'.
export function corroborateEvents(items: NewsItem[], opts: CorroborateOptions = {}): Event[] {
  const orgOf = opts.organisationOf ?? ((s: string) => s)
  const primary = opts.primarySourceIds ?? new Set<string>()

  const groups = new Map<string, NewsItem[]>()
  for (const it of items) {
    const key = normalizeKey(it.title)
    const arr = groups.get(key) ?? []
    arr.push(it)
    groups.set(key, arr)
  }

  const events: Event[] = []
  for (const [key, group] of groups) {
    const orgs = new Set(group.map((g) => orgOf(g.sourceId)))
    const independentSourceCount = orgs.size
    const primarySourceCount = new Set(
      group.filter((g) => primary.has(g.sourceId)).map((g) => orgOf(g.sourceId)),
    ).size
    const status: EventStatus = independentSourceCount >= 2 ? 'corroborated' : 'single_source'
    const first = group[0]
    events.push({
      id: `evt_${key.replace(/ /g, '_')}`,
      title: first.title,
      summary: first.summary,
      occurredAt: first.publishedAt,
      countryCodes: [],
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
