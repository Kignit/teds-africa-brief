// An Event is a real-world occurrence assembled from one or more NewsItems.
// It is only 'corroborated' once two independent sources report it.
export type EventStatus = 'corroborated' | 'single_source' | 'unconfirmed'

// A real source-article link for one corroborating NewsItem. Carried only when the item's
// URL is a valid http/https URL; never fabricated, never a source-registry homepage.
export interface EventSourceLink {
  newsItemId: string
  sourceId: string
  url: string
}

export interface EventCorroboration {
  newsItemIds: string[]
  sourceIds: string[]
  /** Distinct independent sources reporting this event. */
  independentSourceCount: number
  /** How many of those are primary (issuer) sources. */
  primarySourceCount: number
  /**
   * Real source-article links for corroborating items whose URL is a valid http/https URL,
   * in source/news-item order. Omitted entirely when no item carries a usable URL.
   */
  sources?: EventSourceLink[]
}

export interface Event {
  id: string
  title: string
  summary: string
  /** ISO-8601 timestamp. */
  occurredAt: string
  /** ISO country codes the event touches. */
  countryCodes: string[]
  topic: string
  status: EventStatus
  corroboration: EventCorroboration
}
