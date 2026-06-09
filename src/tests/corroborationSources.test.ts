import { describe, it, expect } from 'vitest'
import { corroborateEvents } from '../server/verification/corroborate'
import type { NewsItem } from '../domain/news'

const T0 = '2026-06-03T06:00:00.000Z'
function item(over: Partial<NewsItem> & { id: string; sourceId: string; title: string }): NewsItem {
  return { summary: '', url: `https://x.test/${over.id}`, publishedAt: T0, language: 'en', ...over }
}

// Two headlines that the same-event tests cluster into one event (mirrors the corroboration
// suite's clustering fixture), so the event carries both items' source links.
const A = 'Naira firms as the central bank clears its FX backlog'
const B = 'Naira firms after the central bank cleared the FX backlog'

describe('corroborateEvents - source-article links', () => {
  it('attaches one link per item with a valid http(s) URL, in news-item order', () => {
    const events = corroborateEvents([
      item({ id: 'a', sourceId: 'src.businessday_ng', title: A, url: 'https://businessday.ng/a' }),
      item({
        id: 'b',
        sourceId: 'src.premiumtimes_ng',
        title: B,
        url: 'https://premiumtimesng.com/b',
      }),
    ])
    expect(events).toHaveLength(1)
    expect(events[0].corroboration.sources).toEqual([
      { newsItemId: 'a', sourceId: 'src.businessday_ng', url: 'https://businessday.ng/a' },
      { newsItemId: 'b', sourceId: 'src.premiumtimes_ng', url: 'https://premiumtimesng.com/b' },
    ])
  })

  it('omits items whose URL is missing or malformed (never fabricates a link)', () => {
    const events = corroborateEvents([
      item({ id: 'a', sourceId: 'src.businessday_ng', title: A, url: 'https://businessday.ng/a' }),
      item({ id: 'b', sourceId: 'src.premiumtimes_ng', title: B, url: 'not-a-url' }),
    ])
    expect(events).toHaveLength(1)
    expect(events[0].corroboration.sources).toEqual([
      { newsItemId: 'a', sourceId: 'src.businessday_ng', url: 'https://businessday.ng/a' },
    ])
  })

  it('omits the sources field entirely when no item carries a usable URL', () => {
    const events = corroborateEvents([
      item({
        id: 'a',
        sourceId: 'src.businessday_ng',
        title: 'A lone unmatched cocoa headline',
        url: '',
      }),
    ])
    expect(events).toHaveLength(1)
    expect(events[0].corroboration.sources).toBeUndefined()
  })
})
