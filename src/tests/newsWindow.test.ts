import { describe, it, expect } from 'vitest'
import {
  mergeNewsWindow,
  readPriorWindow,
  serializeNewsWindow,
  DEFAULT_WINDOW_MS,
} from '../server/ingestion/newsWindow'
import type { NewsItem } from '../domain/news'

const NOW = '2026-06-03T12:00:00.000Z'
const hoursAgo = (h: number): string => new Date(Date.parse(NOW) - h * 3_600_000).toISOString()

function item(over: Partial<NewsItem> & { id: string; sourceId: string }): NewsItem {
  return {
    title: 'A headline',
    summary: '',
    url: `https://x.test/${over.id}`,
    publishedAt: NOW,
    language: 'en',
    ...over,
  }
}

describe('mergeNewsWindow', () => {
  it('unions fresh + prior and dedupes by canonical URL (fresh copy wins)', () => {
    const prior = [item({ id: 'a', sourceId: 'src.businessday_ng', title: 'old copy' })]
    const fresh = [
      item({ id: 'a', sourceId: 'src.businessday_ng', title: 'new copy' }), // same URL as prior
      item({ id: 'b', sourceId: 'src.premiumtimes_ng' }),
    ]
    const merged = mergeNewsWindow(prior, fresh, NOW)
    expect(merged).toHaveLength(2)
    expect(merged.find((m) => m.url.endsWith('/a'))!.title).toBe('new copy')
  })

  it('prunes items older than the window', () => {
    const prior = [item({ id: 'old', sourceId: 'src.businessday_ng', publishedAt: hoursAgo(100) })]
    const fresh = [item({ id: 'fresh', sourceId: 'src.premiumtimes_ng', publishedAt: hoursAgo(1) })]
    expect(mergeNewsWindow(prior, fresh, NOW).map((m) => m.id)).toEqual(['fresh'])
  })

  it('sorts newest-first and caps at maxItems', () => {
    const items = [
      item({ id: '1', sourceId: 's', publishedAt: hoursAgo(3) }),
      item({ id: '2', sourceId: 's', publishedAt: hoursAgo(1) }),
      item({ id: '3', sourceId: 's', publishedAt: hoursAgo(2) }),
    ]
    expect(mergeNewsWindow([], items, NOW, DEFAULT_WINDOW_MS, 2).map((m) => m.id)).toEqual([
      '2',
      '3',
    ])
  })
})

describe('readPriorWindow — fails closed', () => {
  it('returns [] for a missing store (null)', () => {
    expect(readPriorWindow(null, NOW)).toEqual([])
  })

  it('returns [] for malformed JSON', () => {
    expect(readPriorWindow('{ not json', NOW)).toEqual([])
  })

  it('returns [] for a wrong-shaped store (items not an array)', () => {
    expect(readPriorWindow(JSON.stringify({ updatedAt: NOW, items: 'nope' }), NOW)).toEqual([])
  })

  it('returns [] for a stale store (updatedAt older than the window)', () => {
    const stale = JSON.stringify({
      updatedAt: hoursAgo(100),
      windowMs: DEFAULT_WINDOW_MS,
      items: [item({ id: 'x', sourceId: 'src.businessday_ng', publishedAt: hoursAgo(1) })],
    })
    expect(readPriorWindow(stale, NOW)).toEqual([])
  })

  it('returns within-window items, dropping malformed and expired ones', () => {
    const raw = JSON.stringify({
      updatedAt: hoursAgo(1),
      windowMs: DEFAULT_WINDOW_MS,
      items: [
        item({ id: 'good', sourceId: 'src.businessday_ng', publishedAt: hoursAgo(2) }),
        item({ id: 'expired', sourceId: 'src.premiumtimes_ng', publishedAt: hoursAgo(100) }),
        { id: 'malformed', sourceId: 5 }, // bad shape -> dropped
      ],
    })
    expect(readPriorWindow(raw, NOW).map((i) => i.id)).toEqual(['good'])
  })

  // Carryover defect: items persisted to the store BEFORE PR #29 still carry literal
  // HTML entities in title / summary. The connector decoder only runs on FRESH ingestion,
  // so without this sanitisation a regenerated artifact keeps surfacing "&#8211;" etc.
  // Decode at the load boundary so every persisted item is cleaned exactly once on the
  // way in; URLs/ids/timestamps stay verbatim (an "&amp;" in a URL is meaningful).
  it('decodes HTML entities in title and summary of persisted prior-window items', () => {
    const RSQUO = String.fromCodePoint(0x2019)
    const EN_DASH = String.fromCodePoint(0x2013)
    const HELLIP = String.fromCodePoint(0x2026)
    const raw = JSON.stringify({
      updatedAt: hoursAgo(1),
      windowMs: DEFAULT_WINDOW_MS,
      items: [
        item({
          id: 'dirty',
          sourceId: 'src.businessday_ng',
          title: 'BMW SA&#8217;s &#8216;hidden gem&#8217; &#8211; 700,000 bpd',
          summary: 'Eskom&#8217;s plan &#8230; Tom &#038; Jerry',
          publishedAt: hoursAgo(2),
          // URLs must NOT be entity-decoded: "&amp;" is a query-separator there.
          url: 'https://x.test/dirty?a=1&amp;b=2',
        }),
        item({
          id: 'clean',
          sourceId: 'src.premiumtimes_ng',
          title: 'plain text passes through unchanged',
          summary: 'no entities here',
          publishedAt: hoursAgo(3),
        }),
      ],
    })
    const [dirty, clean] = readPriorWindow(raw, NOW)
    // The four entity codes the audit found in production are all decoded.
    expect(dirty.title).toBe(
      `BMW SA${RSQUO}s ${String.fromCodePoint(0x2018)}hidden gem${RSQUO} ${EN_DASH} 700,000 bpd`,
    )
    expect(dirty.summary).toBe(`Eskom${RSQUO}s plan ${HELLIP} Tom & Jerry`)
    // No entity literal survives in the user-facing text.
    const entityRe = /&(?:#\d+|#x[0-9a-f]+|[a-z][a-z0-9]+);/i
    expect(entityRe.test(dirty.title)).toBe(false)
    expect(entityRe.test(dirty.summary ?? '')).toBe(false)
    // URLs are NOT decoded (would corrupt query strings).
    expect(dirty.url).toBe('https://x.test/dirty?a=1&amp;b=2')
    // Plain text is preserved (decoder is identity on entity-free input).
    expect(clean.title).toBe('plain text passes through unchanged')
    expect(clean.summary).toBe('no entities here')
  })
})

describe('serializeNewsWindow', () => {
  it('round-trips through readPriorWindow', () => {
    const items = [item({ id: 'a', sourceId: 'src.businessday_ng', publishedAt: hoursAgo(1) })]
    const raw = serializeNewsWindow(items, NOW)
    expect(readPriorWindow(raw, NOW).map((i) => i.id)).toEqual(['a'])
    expect(raw.endsWith('\n')).toBe(true)
  })

  it('one regen-cycle round-trip wipes the entity backlog from the persisted store', () => {
    // Stale store -> read decodes -> persist re-serialises -> second read is identity.
    // This proves the backlog clears in one regeneration: after the regen rewrites
    // data/news-window.json, subsequent reads never re-introduce entities.
    const dirty = JSON.stringify({
      updatedAt: hoursAgo(1),
      windowMs: DEFAULT_WINDOW_MS,
      items: [
        item({
          id: 'a',
          sourceId: 'src.businessday_ng',
          title: 'budget &#8211; ministry',
          summary: 'Eskom&#8217;s plan',
          publishedAt: hoursAgo(2),
        }),
      ],
    })
    const cleaned = readPriorWindow(dirty, NOW)
    const reserialized = serializeNewsWindow(cleaned, NOW)
    // Persisted JSON no longer carries entity literals in title/summary.
    expect(reserialized).not.toMatch(/&#8211;|&#8217;/)
    // Second read is byte-identical to the first.
    expect(readPriorWindow(reserialized, NOW)).toEqual(cleaned)
  })
})
