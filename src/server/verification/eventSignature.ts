import type { NewsItem } from '../../domain/news'

// Stricter same-event grouping than "shares a broad topic". Two reports describe
// the SAME event only when they are about the same specific occurrence: a high
// overlap of significant content words, within a short time window, and never
// across disjoint named countries. The bar is deliberately PRECISION-FIRST — a
// false merge would manufacture corroboration (fake trust), so when in doubt the
// reports stay apart and the event simply remains single_source.

// Common words that carry no event identity. Kept small and generic on purpose.
const STOPWORDS = new Set([
  'the',
  'a',
  'an',
  'and',
  'or',
  'but',
  'as',
  'at',
  'by',
  'for',
  'in',
  'of',
  'on',
  'to',
  'from',
  'with',
  'that',
  'this',
  'it',
  'its',
  'is',
  'are',
  'was',
  'were',
  'be',
  'been',
  'being',
  'has',
  'have',
  'had',
  'will',
  'would',
  'could',
  'should',
  'may',
  'might',
  'can',
  'after',
  'over',
  'into',
  'amid',
  'says',
  'said',
  'say',
  'new',
  'out',
  'off',
  'than',
  'then',
  'his',
  'her',
  'their',
  'they',
  'them',
  'we',
  'you',
  'he',
  'she',
  'not',
  'no',
  'yes',
  'about',
  'more',
  'most',
  'some',
  'any',
  'all',
  'one',
  'two',
  'per',
  'via',
  'vs',
  'up',
  'down',
  'what',
  'why',
  'how',
  'who',
  'when',
  'where',
  'amp',
])

// Significant tokens: lowercased alphanumeric words, length >= 3, minus stopwords.
export function significantTokens(text: string): Set<string> {
  const out = new Set<string>()
  for (const raw of text.toLowerCase().split(/[^a-z0-9]+/)) {
    if (raw.length >= 3 && !STOPWORDS.has(raw)) out.add(raw)
  }
  return out
}

function sharedCount(a: Set<string>, b: Set<string>): number {
  let n = 0
  for (const x of a) if (b.has(x)) n++
  return n
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0
  const inter = sharedCount(a, b)
  return inter / (a.size + b.size - inter)
}

function disjointCountries(a?: string[], b?: string[]): boolean {
  if (!a || !b || a.length === 0 || b.length === 0) return false
  return !a.some((c) => b.includes(c))
}

function withinWindow(a: NewsItem, b: NewsItem, windowMs: number): boolean {
  const ta = Date.parse(a.publishedAt)
  const tb = Date.parse(b.publishedAt)
  // An unparseable timestamp must not silently merge distant reports, but it also
  // shouldn't block a strong token+country match — fall back to the content test.
  if (Number.isNaN(ta) || Number.isNaN(tb)) return true
  return Math.abs(ta - tb) <= windowMs
}

export interface SameEventOptions {
  /** Max gap between two reports of the same event (default 3 days). */
  windowMs?: number
  /** Min shared significant tokens (default 3). */
  minShared?: number
  /** Min Jaccard similarity of significant-token sets (default 0.34). */
  minJaccard?: number
}

const DEFAULTS: Required<SameEventOptions> = {
  windowMs: 3 * 24 * 60 * 60 * 1000,
  minShared: 3,
  minJaccard: 0.34,
}

// Light, deterministic plural/possessive normalization so "renewals"/"renewal" and
// "licenses"/"license" align. Possessive "'s" is already handled by tokenization (the
// apostrophe splits it off as a 1-char fragment that is dropped). We never stem a word INTO
// a stopword (e.g. "news" -> "new"), and never touch -ss/-is/-us endings ("press",
// "analysis", "census"). Conservative by design: it only collapses obvious variants.
export function normalizeToken(token: string): string {
  if (token.length < 4) return token
  if (/(?:ss|is|us)$/.test(token)) return token
  let stem = token
  if (/ies$/.test(token)) stem = `${token.slice(0, -3)}y`
  else if (/s$/.test(token)) stem = token.slice(0, -1)
  return STOPWORDS.has(stem) ? token : stem
}

// Strip known RSS summary boilerplate tails before a summary is allowed to contribute to the
// signature. These tails ("The post <title> appeared first on <Source>.", "read more",
// "continue reading") are publisher chrome, not event content, and otherwise inflate the
// token union and sink Jaccard for genuinely matching reports.
export function stripBoilerplate(summary: string): string {
  return summary
    .replace(/\bthe post\b[\s\S]*$/i, '')
    .replace(/\bappeared first on\b[\s\S]*$/i, '')
    .replace(/\bcontinue reading\b[\s\S]*$/i, '')
    .replace(/\bread more\b[\s\S]*$/i, '')
    .trim()
}

// Anchor tokens: acronyms (CBN, MTN), non-sentence-initial proper nouns, and numbers /
// percentages - the named entities and quantities that pin a report to a SPECIFIC
// occurrence. Exported for tests and offline diagnostics ONLY; it is deliberately NOT used
// as an acceptance path here (relaxed bridges are a separate, later-approved lane).
export function anchorTokens(title: string): Set<string> {
  const out = new Set<string>()
  const words = title.match(/[A-Za-z0-9$%.]+/g) ?? []
  words.forEach((w, i) => {
    if (/^[A-Z]{2,}$/.test(w)) out.add(w.toLowerCase())
    else if (/\d/.test(w)) out.add(w.toLowerCase().replace(/[^a-z0-9]/g, ''))
    else if (i > 0 && /^[A-Z][a-zA-Z]+$/.test(w)) out.add(w.toLowerCase())
  })
  return new Set([...out].filter((t) => t.length >= 2))
}

function normalizedTokens(text: string): Set<string> {
  return new Set([...significantTokens(text)].map(normalizeToken))
}

// The matching signature for one report. TITLE-PRIMARY: the normalized title tokens are the
// signature whenever the title alone carries at least `minTitleTokens` of them. Only when the
// title is too thin do we fall back to title + boilerplate-stripped summary, so publisher
// chrome and divergent article bodies cannot dilute (or falsely inflate) a strong title match.
export function signatureTokens(
  item: NewsItem,
  minTitleTokens: number = DEFAULTS.minShared,
): Set<string> {
  const title = normalizedTokens(item.title)
  if (title.size >= minTitleTokens) return title
  return normalizedTokens(`${item.title} ${stripBoilerplate(item.summary)}`)
}

// Whether two reports describe the same event. Every guard must pass; any single
// failure keeps them apart, so unrelated stories never merge into a false
// corroboration. (Two outlets reporting the same headline → true; the same topic
// in two different countries → false via the country guard.)
export function sameEvent(a: NewsItem, b: NewsItem, opts: SameEventOptions = {}): boolean {
  const o = { ...DEFAULTS, ...opts }
  if (disjointCountries(a.countryCodes, b.countryCodes)) return false
  if (!withinWindow(a, b, o.windowMs)) return false
  // Title-primary signature (see signatureTokens): the headline is the event identity; the
  // summary is only a fallback for a too-thin title, with RSS boilerplate stripped and tokens
  // lightly stemmed. Thresholds (minShared / minJaccard) and the country/window guards are
  // unchanged - this is Path A only.
  const ta = signatureTokens(a, o.minShared)
  const tb = signatureTokens(b, o.minShared)
  if (sharedCount(ta, tb) < o.minShared) return false
  if (jaccard(ta, tb) < o.minJaccard) return false
  return true
}
