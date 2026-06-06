import { describe, it, expect } from 'vitest'
import { corroborateEvents } from '../server/verification/corroborate'
import { sameEvent, significantTokens } from '../server/verification/eventSignature'
import { inferCountryCodes } from '../data/countryKeywords'
import type { NewsItem } from '../domain/news'

const T0 = '2026-06-03T06:00:00.000Z'
function item(over: Partial<NewsItem> & { id: string; sourceId: string; title: string }): NewsItem {
  return { summary: '', url: `https://x.test/${over.id}`, publishedAt: T0, language: 'en', ...over }
}

describe('inferCountryCodes — conservative, deterministic', () => {
  it('tags an unambiguous country / currency / place', () => {
    expect(inferCountryCodes('Naira firms as CBN clears FX backlog')).toEqual(['NG'])
    expect(inferCountryCodes('Cedi steadies in Accra trading')).toEqual(['GH'])
    expect(inferCountryCodes('South African markets rally in Johannesburg')).toEqual(['ZA'])
    expect(inferCountryCodes('Addis Ababa tightens as the birr slips')).toEqual(['ET'])
  })

  it('tags every named launch market (multi)', () => {
    expect(inferCountryCodes('Nigeria and Ghana sign a trade pact').sort()).toEqual(['GH', 'NG'])
  })

  it('omits when ambiguous or absent — never guesses', () => {
    expect(inferCountryCodes('Shilling steadies in regional trade')).toEqual([]) // no "Kenya"
    expect(inferCountryCodes('The rand and the dollar diverge')).toEqual([]) // bare "rand" excluded
    expect(inferCountryCodes('Oil prices jump on supply fears')).toEqual([])
    expect(inferCountryCodes('Niger coup unsettles the Sahel')).toEqual([]) // not Nigeria
  })

  it('tags ZA from unambiguous domestic institutions / market identity', () => {
    expect(inferCountryCodes('Eskom municipal takeover may expand to 30 municipalities')).toEqual([
      'ZA',
    ])
    expect(inferCountryCodes('SARB keeps policy stance unchanged')).toEqual(['ZA'])
    expect(inferCountryCodes('Transnet rail bottlenecks hit exporters')).toEqual(['ZA'])
    expect(inferCountryCodes('NERSA approves electricity tariff increase')).toEqual(['ZA'])
    expect(inferCountryCodes('JSE-listed shares rally')).toEqual(['ZA'])
    // Spelled-out forms already tag ZA via the existing demonym / place patterns.
    expect(inferCountryCodes('South African Reserve Bank holds rates')).toEqual(['ZA'])
    expect(inferCountryCodes('Johannesburg Stock Exchange closes higher')).toEqual(['ZA'])
  })

  it('does not tag ZA without a strong ZA token (no source-country guessing)', () => {
    expect(inferCountryCodes('Oil company profits surge after refinery upgrade')).toEqual([])
    expect(inferCountryCodes('Rand weakens against the dollar')).toEqual([]) // bare "rand" excluded
    expect(inferCountryCodes('SARS outbreak prompts a health warning')).toEqual([]) // SARS is not SARB
    expect(inferCountryCodes('Wall Street banks hire AI consultants')).toEqual([])
    expect(inferCountryCodes('Rhinos return to billionaire-backed Zimbabwe park')).toEqual([])
    expect(
      inferCountryCodes('RWC on SuperSport as Canal+ CEO comments on Winter Olympics'),
    ).toEqual([])
  })
})

describe('sameEvent — strict grouping (clusters matches, never merges unrelated)', () => {
  const base = item({
    id: 'a',
    sourceId: 'src.businessday_ng',
    title: 'Naira firms as central bank clears FX backlog',
  })

  it('matches two near-identical reports of one event', () => {
    const b = item({
      id: 'b',
      sourceId: 'src.premiumtimes_ng',
      title: 'Naira firms after the central bank clears its FX backlog',
    })
    expect(sameEvent(base, b)).toBe(true)
  })

  it('does NOT match a merely same-topic story', () => {
    const c = item({
      id: 'c',
      sourceId: 'src.premiumtimes_ng',
      title: 'Stocks rise as oil rallies on global supply fears',
    })
    expect(sameEvent(base, c)).toBe(false)
  })

  it('does NOT merge identical wording across disjoint named countries', () => {
    const ng = item({
      id: 'n',
      sourceId: 'src.businessday_ng',
      title: 'Central bank raises the benchmark policy rate',
      countryCodes: ['NG'],
    })
    const ke = item({
      id: 'k',
      sourceId: 'src.standardmedia_ke',
      title: 'Central bank raises the benchmark policy rate',
      countryCodes: ['KE'],
    })
    expect(sameEvent(ng, ke)).toBe(false)
  })

  it('does NOT match reports outside the time window', () => {
    const far = item({
      id: 'f',
      sourceId: 'src.premiumtimes_ng',
      title: 'Naira firms as central bank clears FX backlog',
      publishedAt: '2026-05-01T06:00:00.000Z',
    })
    expect(sameEvent(base, far)).toBe(false)
  })

  it('significantTokens drops stopwords and short tokens', () => {
    expect([...significantTokens('The oil price is up today')].sort()).toEqual([
      'oil',
      'price',
      'today',
    ])
  })
})

describe('corroborateEvents — clustering then status', () => {
  it('corroborates one event reported by two independent registered sources', () => {
    const events = corroborateEvents([
      item({
        id: 'a',
        sourceId: 'src.businessday_ng',
        title: 'Naira firms as central bank clears FX backlog',
        countryCodes: ['NG'],
      }),
      item({
        id: 'b',
        sourceId: 'src.premiumtimes_ng',
        title: 'Naira firms after the central bank clears its FX backlog',
        countryCodes: ['NG'],
      }),
    ])
    expect(events).toHaveLength(1)
    expect(events[0].status).toBe('corroborated')
    expect(events[0].corroboration.independentSourceCount).toBe(2)
    expect(events[0].corroboration.sourceIds.sort()).toEqual([
      'src.businessday_ng',
      'src.premiumtimes_ng',
    ])
  })

  it('keeps same-topic / different-country reports as separate single_source events', () => {
    const events = corroborateEvents([
      item({
        id: 'n',
        sourceId: 'src.businessday_ng',
        title: 'Central bank raises the benchmark policy rate',
        countryCodes: ['NG'],
      }),
      item({
        id: 'k',
        sourceId: 'src.standardmedia_ke',
        title: 'Central bank raises the benchmark policy rate',
        countryCodes: ['KE'],
      }),
    ])
    expect(events).toHaveLength(2)
    expect(events.every((e) => e.status === 'single_source')).toBe(true)
  })

  it('does NOT self-corroborate two reports from the same source', () => {
    const events = corroborateEvents([
      item({
        id: 'a',
        sourceId: 'src.businessday_ng',
        title: 'Naira firms as central bank clears FX backlog',
        countryCodes: ['NG'],
      }),
      item({
        id: 'b',
        sourceId: 'src.businessday_ng',
        title: 'Naira firms after the central bank clears its FX backlog',
        countryCodes: ['NG'],
      }),
    ])
    expect(events).toHaveLength(1)
    expect(events[0].status).toBe('single_source')
    expect(events[0].corroboration.independentSourceCount).toBe(1)
  })

  it('does not merge unrelated stories from different sources', () => {
    const events = corroborateEvents([
      item({
        id: 'a',
        sourceId: 'src.businessday_ng',
        title: 'Naira firms as central bank clears FX backlog',
      }),
      item({
        id: 'b',
        sourceId: 'src.moneyweb_za',
        title: 'Gold miners lift the Johannesburg bourse to a record',
      }),
    ])
    expect(events).toHaveLength(2)
    expect(events.every((e) => e.status === 'single_source')).toBe(true)
  })
})
