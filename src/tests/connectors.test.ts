import { describe, it, expect, vi } from 'vitest'
import { fetchAfricanFx } from '../server/connectors/fx'
import { fetchWorldBankIndicator } from '../server/connectors/worldBank'
import { fetchBrentEia } from '../server/connectors/marketData'
import { fetchGdelt } from '../server/connectors/gdelt'
import { fetchRss, parseRss } from '../server/connectors/rss'
import type { ConnectorContext } from '../server/connectors/types'
import type { AppConfig } from '../server/config'

const now = () => '2026-05-29T06:00:00.000Z'

function ctxWith(json: unknown, ok = true, config: AppConfig = {}): ConnectorContext {
  const fetch = vi.fn(
    async () =>
      ({
        ok,
        json: async () => json,
        text: async () => '',
      }) as unknown as Response,
  )
  return { fetch, config, now }
}

describe('connectors', () => {
  it('fx connector maps the five African currencies to raw figures', async () => {
    const ctx = ctxWith({
      result: 'success',
      time_last_update_unix: 1748498400,
      rates: { NGN: 1452, KES: 128.9, ETB: 141.2, GHS: 13.4, ZAR: 18.04, EUR: 0.9 },
    })
    const figs = await fetchAfricanFx(ctx)
    expect(figs.map((f) => f.metric).sort()).toEqual([
      'fx.ETB_USD',
      'fx.GHS_USD',
      'fx.KES_USD',
      'fx.NGN_USD',
      'fx.ZAR_USD',
    ])
    expect(figs.every((f) => f.sourceIds[0] === 'src.open_er_api')).toBe(true)
  })

  it('world bank connector takes the latest non-null datapoint', async () => {
    const body = [
      { page: 1 },
      [
        { date: '2026', value: null },
        { date: '2025', value: 23.4 },
      ],
    ]
    const figs = await fetchWorldBankIndicator(ctxWith(body), {
      countryCode: 'NG',
      indicator: 'FP.CPI.TOTL.ZG',
      label: 'Inflation',
      unit: '%',
    })
    expect(figs).toHaveLength(1)
    expect(figs[0].value).toBe(23.4)
  })

  it('keyed connectors stay disabled until configured (never fabricate)', async () => {
    const res = await fetchBrentEia(ctxWith({}))
    expect(res.disabled).toBe(true)
  })

  it('gdelt retries a 429 then FAILS CLOSED (never silent-empty), recording attempts', async () => {
    const fetch = vi.fn(
      async () =>
        ({
          ok: false,
          status: 429,
          json: async () => ({}),
          text: async () => '',
        }) as unknown as Response,
    )
    // no-op sleep so the retry/backoff path runs instantly in tests
    const ctx: ConnectorContext = { fetch, config: {}, now, sleep: async () => {} }
    await expect(fetchGdelt(ctx, 'oil')).rejects.toThrow(/after 3 attempt\(s\): HTTP 429/)
    expect(fetch).toHaveBeenCalledTimes(3) // initial + 2 retries
  })

  it('gdelt recovers when a retry succeeds (429 then 200)', async () => {
    let n = 0
    const fetch = vi.fn(async () => {
      n += 1
      if (n === 1)
        return {
          ok: false,
          status: 429,
          json: async () => ({}),
          text: async () => '',
        } as unknown as Response
      return {
        ok: true,
        status: 200,
        json: async () => ({
          articles: [
            {
              title: 'Naira steadies as CBN clears FX backlog',
              url: 'https://x.test/n',
              seendate: '20260603T060000Z',
              language: 'English',
            },
          ],
        }),
        text: async () => '',
      } as unknown as Response
    })
    const ctx: ConnectorContext = { fetch, config: {}, now, sleep: async () => {} }
    const items = await fetchGdelt(ctx, 'naira')
    expect(items).toHaveLength(1)
    expect(items[0].countryCodes).toEqual(['NG'])
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('gdelt returns [] on a 200 with no articles (a legitimate empty, not a failure)', async () => {
    expect(await fetchGdelt(ctxWith({ articles: [] }), 'oil')).toEqual([])
  })

  it('rss fails loud on a non-OK response', async () => {
    const ctx: ConnectorContext = {
      fetch: vi.fn(
        async () =>
          ({
            ok: false,
            status: 503,
            json: async () => ({}),
            text: async () => '',
          }) as unknown as Response,
      ),
      config: {},
      now,
    }
    await expect(fetchRss(ctx, 'src.businessday_ng', 'https://x.test/feed')).rejects.toThrow(/503/)
  })

  it('rss decodes HTML entities (incl. numeric) in title and summary', () => {
    const xml = `<rss><channel><item>
      <title>85% of budget released &#8211; Finance Ministry</title>
      <link>https://x.test/a</link>
      <description>Eskom&#8217;s plan &amp; more</description>
      <pubDate>Wed, 03 Jun 2026 06:00:00 GMT</pubDate>
    </item></channel></rss>`
    const [item] = parseRss(xml, 'src.bft_gh', now())
    expect(item.title).toBe(
      `85% of budget released ${String.fromCodePoint(0x2013)} Finance Ministry`,
    )
    expect(item.title).not.toContain('&#8211;')
    expect(item.summary).toBe(`Eskom${String.fromCodePoint(0x2019)}s plan & more`)
    // classification is not broadened: 'Eskom' still tags ZA; the entity adds no spurious tag
    expect(item.countryCodes).toEqual(['ZA'])
  })

  it('gdelt decodes HTML entities in the title', async () => {
    const items = await fetchGdelt(
      ctxWith({
        articles: [
          {
            title: 'Nigeria&#8217;s naira firms &amp; holds',
            url: 'https://x.test/g',
            seendate: '20260603T060000Z',
            language: 'English',
          },
        ],
      }),
      'naira',
    )
    expect(items[0].title).toBe(`Nigeria${String.fromCodePoint(0x2019)}s naira firms & holds`)
    expect(items[0].title).not.toContain('&#8217;')
    // classification is not broadened: 'Nigeria'/'naira' tag NG as before
    expect(items[0].countryCodes).toEqual(['NG'])
  })
})
