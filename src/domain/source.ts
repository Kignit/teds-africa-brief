// A Source is an origin of data or reporting. Every user-facing fact must
// eventually trace back to one or more Source records.
export type SourceTier =
  | 'primary' // central banks, debt-management / finance offices
  | 'official_stats' // national statistics offices
  | 'multilateral' // IMF, World Bank, AfDB
  | 'market_data' // FX / commodity / rate feeds
  | 'local_press'
  | 'newswire' // FT, Economist, Reuters, Bloomberg
  | 'aggregator' // GDELT, Google News

// Primary sources (issuers of the fact) outrank secondary (reporting on it).
export type SourceCredibility = 'primary' | 'secondary'

export type AccessMethod = 'api' | 'rss' | 'download' | 'scrape'

export interface Source {
  id: string
  name: string
  tier: SourceTier
  credibility: SourceCredibility
  url: string
  accessMethod: AccessMethod
  /** ISO country code when the source is country-specific. */
  countryCode?: string
  /** RSS/Atom feed URL, when this source is ingested as a news feed. */
  feedUrl?: string
}

// A concrete document/payload retrieved from a Source at a point in time.
export interface SourceDocument {
  id: string
  sourceId: string
  url: string
  title: string
  /** ISO-8601 timestamp of retrieval. */
  fetchedAt: string
  language: string
  /** Hash of the retrieved content, for change-detection and audit. */
  contentHash: string
}
