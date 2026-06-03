import { describe, it, expect, afterEach, vi } from 'vitest'
import {
  produceBriefResult,
  produceGatedBrief,
  serializeArtifact,
} from '../server/runtime/produceBrief'
import { resetRuntimeModeForTests } from '../server/runtimeMode'
import { SOURCES } from '../data/sources'
import { CONTRACT_VALID_PROFILES } from './fixtures/countryProfiles'
import type { ConnectorContext, FetchLike } from '../server/connectors/types'
import type { RawFigure } from '../domain/figure'
import type { NewsItem } from '../domain/news'
import type { CountryProfile } from '../domain/country'

const NOW = '2026-05-29T06:00:00.000Z'
const now = () => NOW
const noFetch: FetchLike = async () => {
  throw new Error('this test must not hit the network')
}
const ctx: ConnectorContext = { fetch: noFetch, config: {}, now }

afterEach(() => {
  resetRuntimeModeForTests()
  vi.restoreAllMocks()
})

const OIL = 'Oil jumps as Middle East tension threatens supply'
function news(id: string, sourceId: string): NewsItem {
  return {
    id,
    sourceId,
    title: OIL,
    summary: '',
    url: `https://x.test/${id}`,
    publishedAt: NOW,
    language: 'en',
  }
}

describe('produceGatedBrief (server-side runtime producer)', () => {
  it('returns a gate-passed brief from connector output', async () => {
    const fx: RawFigure = {
      metric: 'fx.NGN_USD',
      label: 'NGN / USD',
      value: 1452,
      unit: 'NGN/USD',
      asOf: NOW,
      countryCode: 'NG',
      sourceIds: ['src.open_er_api'],
    }
    const profiles: CountryProfile[] = CONTRACT_VALID_PROFILES
    const brief = await produceGatedBrief({
      ctx,
      figureConnectors: [{ id: 'src.open_er_api', run: async () => [fx] }],
      newsConnectors: [
        { id: 'src.businessday_ng', run: async () => [news('a', 'src.businessday_ng')] },
        { id: 'src.nation_ke', run: async () => [news('b', 'src.nation_ke')] },
      ],
      profileConnectors: [{ id: 'test.profiles', run: async () => profiles }],
      sources: SOURCES,
      brief: { id: 'live', date: '2026-05-29', edition: 'daily' },
    })

    expect(brief).not.toBeNull()
    expect(brief!.dataMode).toBe('live')
    expect(brief!.figures.map((f) => f.metric)).toContain('fx.NGN_USD')
    // round-trips through the { generatedAt, brief } artifact the runtime loads
    const parsed = JSON.parse(serializeArtifact(brief, NOW))
    expect(parsed.generatedAt).toBe(NOW)
    expect(parsed.brief).toMatchObject({ dataMode: 'live' })
  })

  it('serializes an absent brief as a { generatedAt, brief: null } envelope', () => {
    expect(JSON.parse(serializeArtifact(null, NOW))).toEqual({ generatedAt: NOW, brief: null })
  })

  it('produceBriefResult exposes the diagnostics audit trail alongside the brief', async () => {
    const fx: RawFigure = {
      metric: 'fx.NGN_USD',
      label: 'NGN / USD',
      value: 1452,
      unit: 'NGN/USD',
      asOf: NOW,
      countryCode: 'NG',
      sourceIds: ['src.open_er_api'],
    }
    const result = await produceBriefResult({
      ctx,
      figureConnectors: [{ id: 'src.open_er_api', run: async () => [fx] }],
      newsConnectors: [
        { id: 'src.businessday_ng', run: async () => [news('a', 'src.businessday_ng')] },
        { id: 'src.nation_ke', run: async () => [news('b', 'src.nation_ke')] },
      ],
      profileConnectors: [{ id: 'test.profiles', run: async () => CONTRACT_VALID_PROFILES }],
      sources: SOURCES,
      brief: { id: 'live', date: '2026-05-29', edition: 'daily' },
    })

    expect(result.brief).not.toBeNull()
    expect(result.diagnostics.figureCount).toBe(1)
    expect(result.diagnostics.eventCount).toBe(1)
    expect(result.diagnostics.connectorFailures).toHaveLength(0)
  })
})
