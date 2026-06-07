import type { NewsItem } from '../../domain/news'
import { dedupeNewsItems } from './dedupe'
import { decodeEntities } from '../connectors/decodeEntities'

// Rolling news window. Persists RAW, source-backed NewsItems across runs so that
// independent registered sources reporting the same event at DIFFERENT TIMES can still
// corroborate within a 72h window — instead of depending on a single stateless daily
// snapshot. EVIDENCE ONLY: this module handles raw news items, never generated causal
// analysis/claims. The publish gate and corroboration rules are unchanged; this merely
// widens the pool of items they already reason over (eventSignature's match window is
// also 72h, so cross-time grouping is already supported).

export const DEFAULT_WINDOW_MS = 72 * 60 * 60 * 1000 // 72 hours
// Safety cap on the committed store size — bounds the file and guards against a runaway
// store; newest items are kept.
export const DEFAULT_MAX_ITEMS = 1500

export interface NewsWindowStore {
  /** ISO-8601 time the store was last written. */
  updatedAt: string
  /** Window length the store was pruned to, in ms (for transparency/audit). */
  windowMs: number
  /** Raw, source-backed news items ONLY — never events/claims/analysis. */
  items: NewsItem[]
}

function withinWindow(publishedAt: string, cutoffMs: number): boolean {
  const t = Date.parse(publishedAt)
  return !Number.isNaN(t) && t >= cutoffMs
}

// Sanitise the USER-FACING text fields of a persisted news item by decoding any HTML
// entities the connectors did not decode at ingestion time (this is the carryover path for
// items written to the rolling store before PR #29). Decoding ONLY title and summary so id /
// sourceId / url / publishedAt / language / countryCodes are preserved verbatim (an "&amp;"
// in a URL is a meaningful query-param separator and must not be touched). Pure + idempotent: once
// an item is clean, re-decoding is a no-op (decoder leaves bare & and unknown entities alone).
function decodeNewsItemText(item: NewsItem): NewsItem {
  const title = decodeEntities(item.title)
  const summary = item.summary === undefined ? undefined : decodeEntities(item.summary)
  if (title === item.title && summary === item.summary) return item
  return { ...item, title, ...(summary !== undefined && { summary }) }
}

// Merge this run's fresh items into the prior window: union (fresh first, so the newest
// copy wins on a duplicate URL), drop anything older than the window, sort newest-first,
// cap. Pure + deterministic given `now`. Never fabricates.
export function mergeNewsWindow(
  prior: NewsItem[],
  fresh: NewsItem[],
  now: string,
  windowMs: number = DEFAULT_WINDOW_MS,
  maxItems: number = DEFAULT_MAX_ITEMS,
): NewsItem[] {
  const cutoff = Date.parse(now) - windowMs
  return dedupeNewsItems([...fresh, ...prior])
    .filter((it) => withinWindow(it.publishedAt, cutoff))
    .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))
    .slice(0, maxItems)
}

// A parsed value is a usable NewsItem (the fields corroboration relies on).
function isNewsItem(v: unknown): v is NewsItem {
  if (typeof v !== 'object' || v === null) return false
  const o = v as Record<string, unknown>
  const str = (x: unknown): x is string => typeof x === 'string'
  if (!str(o.id) || !str(o.sourceId) || !str(o.title) || !str(o.url) || !str(o.publishedAt)) {
    return false
  }
  if (o.summary !== undefined && !str(o.summary)) return false
  if (o.language !== undefined && !str(o.language)) return false
  if (o.countryCodes !== undefined && !(Array.isArray(o.countryCodes) && o.countryCodes.every(str)))
    return false
  return true
}

// Read the prior window from the store file's raw text, FAILING CLOSED to "no prior
// items" (current-run-only) on anything wrong: missing (null), unparseable JSON, wrong
// shape, or a STALE store (updatedAt older than the window). Surviving items are pruned
// to the window before use, and each item is shape-validated — so a malformed or stale
// store can never inject fabricated or expired evidence.
export function readPriorWindow(
  raw: string | null,
  now: string,
  windowMs: number = DEFAULT_WINDOW_MS,
): NewsItem[] {
  if (!raw) return []
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return []
  }
  if (typeof parsed !== 'object' || parsed === null) return []
  const store = parsed as Record<string, unknown>
  if (!Array.isArray(store.items)) return []
  // Stale store (or no/invalid updatedAt) → ignore entirely: fail closed to current-run.
  const updatedAt = typeof store.updatedAt === 'string' ? Date.parse(store.updatedAt) : NaN
  if (Number.isNaN(updatedAt) || Date.parse(now) - updatedAt > windowMs) return []
  const cutoff = Date.parse(now) - windowMs
  return store.items
    .filter((it): it is NewsItem => isNewsItem(it))
    .filter((it) => withinWindow(it.publishedAt, cutoff))
    .map(decodeNewsItemText)
}

// Serialize the store as a pretty-printed { updatedAt, windowMs, items } envelope —
// readable, auditable git diffs, matching the brief artifact's formatting.
export function serializeNewsWindow(
  items: NewsItem[],
  now: string,
  windowMs: number = DEFAULT_WINDOW_MS,
): string {
  const store: NewsWindowStore = { updatedAt: now, windowMs, items }
  return `${JSON.stringify(store, null, 2)}\n`
}
