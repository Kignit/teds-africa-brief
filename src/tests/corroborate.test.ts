import { describe, it, expect } from 'vitest'
import { corroborateEvents } from '../server/verification/corroborate'
import type { NewsItem } from '../domain/news'

function item(id: string, sourceId: string, title: string): NewsItem {
  return {
    id,
    sourceId,
    title,
    summary: '',
    url: `https://example.test/${id}`,
    publishedAt: '2026-05-29T06:00:00.000Z',
    language: 'en',
  }
}

describe('corroborateEvents', () => {
  it('marks an event corroborated when two independent sources report it', () => {
    const events = corroborateEvents([
      item('a', 'src.businessday_ng', 'Naira firms as central bank clears FX backlog'),
      item('b', 'src.nation_ke', 'Naira firms as central bank clears FX backlog'),
    ])
    expect(events).toHaveLength(1)
    expect(events[0].status).toBe('corroborated')
    expect(events[0].corroboration.independentSourceCount).toBe(2)
  })

  it('marks a lone report as single_source (not corroborated)', () => {
    const events = corroborateEvents([
      item('a', 'src.businessday_ng', 'A scoop that no other outlet has run'),
    ])
    expect(events[0].status).toBe('single_source')
    expect(events[0].corroboration.independentSourceCount).toBe(1)
  })
})
