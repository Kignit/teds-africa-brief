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
})

describe('serializeNewsWindow', () => {
  it('round-trips through readPriorWindow', () => {
    const items = [item({ id: 'a', sourceId: 'src.businessday_ng', publishedAt: hoursAgo(1) })]
    const raw = serializeNewsWindow(items, NOW)
    expect(readPriorWindow(raw, NOW).map((i) => i.id)).toEqual(['a'])
    expect(raw.endsWith('\n')).toBe(true)
  })
})
