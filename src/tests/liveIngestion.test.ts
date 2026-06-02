import { describe, it, expect, vi, afterEach } from 'vitest'
import { runLiveIngestion } from '../server/ingestion/pipeline'
import type {
  CountryProfileConnector,
  FigureConnector,
  NewsConnector,
} from '../server/ingestion/pipeline'
import { fxConnector, gdeltConnector } from '../server/ingestion/liveConnectors'
import { runPublishGate } from '../server/publishing/publishGate'
import { composeAnalysisDraft } from '../server/analysis/composeAnalysisDraft'
import { composeBriefFromAnalysis } from '../server/analysis/buildBrief'
import { validateFigures } from '../server/verification/validateFigure'
import { knownSourceIds } from '../server/verification/sources'
import { engageLiveMode, currentMode, resetRuntimeModeForTests } from '../server/runtimeMode'
import { SOURCES } from '../data/sources'
import {
  CONTRACT_VALID_PROFILES,
  TEST_COUNTRY_PROFILES,
  unsourcedProfile,
} from './fixtures/countryProfiles'
import type { ConnectorContext, FetchLike } from '../server/connectors/types'
import type { RawFigure } from '../domain/figure'
import type { NewsItem } from '../domain/news'
import type { Event } from '../domain/event'
import type { CountryProfile } from '../domain/country'

const NOW = '2026-05-29T06:00:00.000Z'
const now = () => NOW
const known = knownSourceIds(SOURCES)
const briefMeta = { id: 'live_2026_05_29', date: '2026-05-29', edition: 'daily' as const }

// A fetch the fake connectors below must never call — the pipeline is exercised
// through injected connector output, not the network.
const noFetch: FetchLike = async () => {
  throw new Error('this test must not hit the network')
}
const baseCtx: ConnectorContext = { fetch: noFetch, config: {}, now }

afterEach(() => {
  resetRuntimeModeForTests()
  vi.restoreAllMocks()
})

function figureConn(id: string, figures: RawFigure[]): FigureConnector {
  return { id, run: async () => figures }
}
function newsConn(id: string, items: NewsItem[]): NewsConnector {
  return { id, run: async () => items }
}
function profileConn(id: string, profiles: CountryProfile[]): CountryProfileConnector {
  return { id, run: async () => profiles }
}
function throwingFigureConn(id: string): FigureConnector {
  return {
    id,
    run: async () => {
      throw new Error('connector exploded')
    },
  }
}
function throwingNewsConn(id: string): NewsConnector {
  return {
    id,
    run: async () => {
      throw new Error('feed unreachable')
    },
  }
}
function throwingProfileConn(id: string): CountryProfileConnector {
  return {
    id,
    run: async () => {
      throw new Error('profile connector exploded')
    },
  }
}

function fxFigure(over: Partial<RawFigure> = {}): RawFigure {
  return {
    metric: 'fx.NGN_USD',
    label: 'NGN / USD',
    value: 1452,
    unit: 'NGN/USD',
    asOf: NOW,
    countryCode: 'NG',
    sourceIds: ['src.open_er_api'],
    ...over,
  }
}
function newsItem(
  over: Partial<NewsItem> & { id: string; sourceId: string; title: string },
): NewsItem {
  return {
    summary: '',
    url: `https://example.test/${over.id}`,
    publishedAt: NOW,
    language: 'en',
    ...over,
  }
}

const OIL_TITLE = 'Oil jumps as Middle East tension threatens supply'

// Two independent registered sources reporting the same headline -> corroborated.
function corroboratedOilConnectors(): NewsConnector[] {
  return [
    newsConn('src.businessday_ng', [
      newsItem({ id: 'a', sourceId: 'src.businessday_ng', title: OIL_TITLE }),
    ]),
    newsConn('src.nation_ke', [newsItem({ id: 'b', sourceId: 'src.nation_ke', title: OIL_TITLE })]),
  ]
}

function run(figureConnectors: FigureConnector[], newsConnectors: NewsConnector[]) {
  return runLiveIngestion({
    ctx: baseCtx,
    figureConnectors,
    newsConnectors,
    profileConnectors: [profileConn('test.profiles', CONTRACT_VALID_PROFILES)],
    sources: SOURCES,
    brief: briefMeta,
  })
}

function jsonResponse(body: unknown, ok = true): Response {
  return { ok, json: async () => body, text: async () => '' } as unknown as Response
}

describe('live ingestion pipeline', () => {
  it('assembles a live, gated brief from connector output', async () => {
    const res = await run(
      [figureConn('src.open_er_api', [fxFigure()])],
      corroboratedOilConnectors(),
    )

    expect(res.brief).not.toBeNull()
    expect(res.brief!.dataMode).toBe('live')
    expect(res.gate.passed).toBe(true)
    expect(res.gate.violations).toHaveLength(0)
    // running the live pipeline engages the runtime boundary
    expect(currentMode()).toBe('live')

    expect(res.diagnostics.figureCount).toBe(1)
    expect(res.diagnostics.eventCount).toBe(1)
    expect(res.brief!.figures.map((f) => f.metric)).toContain('fx.NGN_USD')

    // Oil-shock country effects are skipped: oil stance has no accepted source
    // contract, so the verified pipeline never carries it into analysis.
    expect(res.analysis.causalLinks.find((l) => l.shockType === 'oil_shock')).toBeUndefined()
  })

  it('runs the real fx and gdelt connectors end-to-end', async () => {
    const fetch = vi.fn(async (url: string) => {
      if (url.includes('open.er-api.com')) {
        return jsonResponse({
          result: 'success',
          time_last_update_unix: 1748498400,
          rates: { NGN: 1452, KES: 128.9, ETB: 141.2, GHS: 13.4, ZAR: 18.04 },
        })
      }
      if (url.includes('gdeltproject.org')) {
        return jsonResponse({
          articles: [
            {
              title: 'Oil jumps as supply fears mount',
              url: 'https://example.test/oil',
              seendate: '20260529T060000Z',
              language: 'English',
            },
          ],
        })
      }
      return jsonResponse({}, false)
    })
    const ctx: ConnectorContext = { fetch: fetch as unknown as FetchLike, config: {}, now }

    const res = await runLiveIngestion({
      ctx,
      figureConnectors: [fxConnector],
      newsConnectors: [gdeltConnector('oil')],
      profileConnectors: [profileConn('test.profiles', CONTRACT_VALID_PROFILES)],
      sources: SOURCES,
      brief: briefMeta,
    })

    expect(res.brief).not.toBeNull()
    expect(res.brief!.dataMode).toBe('live')
    expect(res.diagnostics.figureCount).toBe(5) // five launch-market currencies
    expect(res.diagnostics.profileCount).toBe(3)
    expect(res.brief!.figures.map((f) => f.metric).sort()).toContain('fx.NGN_USD')
    expect(res.diagnostics.eventCount).toBeGreaterThanOrEqual(1)
    expect(res.gate.passed).toBe(true)
    // GDELT alone is a single organisation (single-source) -> no publishable analysis
    expect(res.brief!.claims).toHaveLength(0)
  })

  it('fails closed on connector errors — no fabricated figures or events', async () => {
    const res = await runLiveIngestion({
      ctx: baseCtx,
      figureConnectors: [
        figureConn('src.open_er_api', [fxFigure()]),
        throwingFigureConn('src.eia'),
      ],
      newsConnectors: [...corroboratedOilConnectors(), throwingNewsConn('src.gdelt')],
      profileConnectors: [
        profileConn('test.profiles', CONTRACT_VALID_PROFILES),
        throwingProfileConn('profile.bad'),
      ],
      sources: SOURCES,
      brief: briefMeta,
    })

    expect(res.diagnostics.connectorFailures.map((f) => f.id).sort()).toEqual([
      'profile.bad',
      'src.eia',
      'src.gdelt',
    ])
    // healthy connectors still produced data; failures were not papered over
    expect(res.diagnostics.figureCount).toBe(1)
    expect(res.diagnostics.eventCount).toBe(1)
    expect(res.brief!.figures).toHaveLength(1)
    expect(res.brief!.events).toHaveLength(1)
  })

  it('live ingestion engages live mode', async () => {
    expect(currentMode()).toBe('idle')
    engageLiveMode()
    expect(currentMode()).toBe('live')
  })

  it('drops figures and news from unregistered sources, and records the omission', async () => {
    const res = await run(
      [figureConn('rogue', [fxFigure({ sourceIds: ['src.bogus'] })])],
      [newsConn('rogue', [newsItem({ id: 'z', sourceId: 'src.bogus', title: OIL_TITLE })])],
    )

    expect(res.diagnostics.droppedUnknownSourceFigures).toHaveLength(1)
    expect(res.diagnostics.droppedUnknownSourceNews).toHaveLength(1)
    expect(res.diagnostics.figureCount).toBe(0)
    expect(res.diagnostics.eventCount).toBe(0)
    expect(res.brief?.figures ?? []).toHaveLength(0)
  })

  it('drops a figure from a registered but contract-wrong source', async () => {
    // src.eia is registered, but the fx.* contract permits only src.open_er_api,
    // so a registered-but-wrong source is dropped (and recorded), not shown.
    const res = await run(
      [figureConn('src.eia', [fxFigure({ sourceIds: ['src.eia'] })])],
      corroboratedOilConnectors(),
    )

    expect(res.diagnostics.droppedContractFigures).toHaveLength(1)
    expect(res.diagnostics.droppedUnknownSourceFigures).toHaveLength(0)
    expect(res.diagnostics.figureCount).toBe(0)
    expect(res.brief?.figures ?? []).toHaveLength(0)
  })

  it('rejects country profiles that lack registered field evidence', async () => {
    const res = await runLiveIngestion({
      ctx: baseCtx,
      figureConnectors: [],
      newsConnectors: corroboratedOilConnectors(),
      profileConnectors: [profileConn('test.profiles', [unsourcedProfile()])],
      sources: SOURCES,
      brief: briefMeta,
    })

    expect(res.diagnostics.profileCount).toBe(0)
    expect(res.diagnostics.rejectedProfiles).toHaveLength(1)
    expect(res.analysis.causalLinks).toHaveLength(0)
  })
})

describe('publish gate as the final authority on live briefs', () => {
  function liveBrief(figures: RawFigure[], events: Event[]) {
    const verified = validateFigures(figures)
    const analysis = composeAnalysisDraft({
      figures: verified,
      events,
      profiles: TEST_COUNTRY_PROFILES,
      now,
    })
    return composeBriefFromAnalysis({
      id: 'b',
      date: '2026-05-29',
      edition: 'daily',
      dataMode: 'live',
      analysis,
      figures: verified,
      events,
      profiles: TEST_COUNTRY_PROFILES,
    })
  }

  it('blocks a figure whose source id is not in the registry', () => {
    const brief = liveBrief([fxFigure({ sourceIds: ['src.not_registered'] })], [])
    const res = runPublishGate(brief, { knownSourceIds: known })
    expect(res.passed).toBe(false)
    expect(res.violations.map((v) => v.rule)).toContain('unknown_source')
    // without a registry the gate skips the resolution check (prototype path)
    expect(runPublishGate(brief).violations.map((v) => v.rule)).not.toContain('unknown_source')
  })

  it('blocks an event missing source or news-item evidence', () => {
    const event: Event = {
      id: 'evt_x',
      title: OIL_TITLE,
      summary: '',
      occurredAt: NOW,
      countryCodes: [],
      topic: 'oil',
      status: 'corroborated',
      corroboration: {
        newsItemIds: [],
        sourceIds: [],
        independentSourceCount: 2,
        primarySourceCount: 0,
      },
    }
    const res = runPublishGate(liveBrief([], [event]), { knownSourceIds: known })
    expect(res.passed).toBe(false)
    expect(res.violations.map((v) => v.rule)).toEqual(
      expect.arrayContaining(['event_missing_source', 'event_missing_news_item']),
    )
  })

  it('blocks an unbacked verified claim in a live brief', async () => {
    const res = await run([], corroboratedOilConnectors())
    expect(res.brief).not.toBeNull()
    expect(res.gate.passed).toBe(true)

    const tampered = {
      ...res.brief!,
      claims: [
        ...res.brief!.claims,
        {
          id: 'bad',
          kind: 'causal' as const,
          text: 'unbacked',
          figureIds: ['missing'],
          eventIds: [],
          profileFields: [],
          profileSourceIds: [],
          methodologyIds: [],
          verified: true,
        },
      ],
    }
    const after = runPublishGate(tampered, { knownSourceIds: known })
    expect(after.passed).toBe(false)
    expect(after.violations.map((v) => v.rule)).toContain('unbacked_provenance_claim')
  })

  it('blocks a verified claim with no evidence references at all', async () => {
    const res = await run([], corroboratedOilConnectors())
    expect(res.brief).not.toBeNull()
    expect(res.gate.passed).toBe(true)

    const tampered = {
      ...res.brief!,
      claims: [
        ...res.brief!.claims,
        {
          id: 'empty',
          kind: 'causal' as const,
          text: 'empty backing',
          figureIds: [],
          eventIds: [],
          profileFields: [],
          profileSourceIds: [],
          methodologyIds: [],
          verified: true,
        },
      ],
    }
    const after = runPublishGate(tampered, { knownSourceIds: known })
    expect(after.passed).toBe(false)
    expect(after.violations.map((v) => v.rule)).toContain('unbacked_provenance_claim')
  })
})
