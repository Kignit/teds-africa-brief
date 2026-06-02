// An Event is a real-world occurrence assembled from one or more NewsItems.
// It is only 'corroborated' once two independent sources report it.
export type EventStatus = 'corroborated' | 'single_source' | 'unconfirmed'

export interface EventCorroboration {
  newsItemIds: string[]
  sourceIds: string[]
  /** Distinct independent sources reporting this event. */
  independentSourceCount: number
  /** How many of those are primary (issuer) sources. */
  primarySourceCount: number
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
