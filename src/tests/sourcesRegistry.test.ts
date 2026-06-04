import { describe, it, expect } from 'vitest'
import { SOURCES, SOURCE_BY_ID } from '../data/sources'
import { rssConnectorsFromSources } from '../server/ingestion/liveConnectors'

// Verified-feed expansion (probed live 2026-06-04): independent local business/economy
// outlets with working RSS + recent items. Ethiopia and South Africa were the thin
// markets. State media (fanabc, kbc) and general/high-noise feeds were excluded;
// aggregators are NOT added here.
const NEW_FEEDS = [
  'src.capitalethiopia_et',
  'src.ethiopianmonitor_et',
  'src.newbusinessethiopia_et',
  'src.ethiopianbusinessreview_et',
  'src.norvanreports_gh',
  'src.ghanabusinessnews_gh',
  'src.biznews_za',
  'src.citizen_za',
]

describe('source registry — verified RSS feed expansion', () => {
  it('registers each new feed with rss access, a countryCode, and an https feedUrl', () => {
    for (const id of NEW_FEEDS) {
      const s = SOURCE_BY_ID.get(id)
      expect(s, id).toBeDefined()
      expect(s!.accessMethod, id).toBe('rss')
      expect(s!.credibility, id).toBe('secondary')
      expect(s!.countryCode, id).toBeTruthy()
      expect(s!.feedUrl ?? '', id).toMatch(/^https:\/\//)
    }
  })

  it('wires an RSS connector (by registered source id) for every feed with a feedUrl', () => {
    const wired = new Set(rssConnectorsFromSources(SOURCES).map((c) => c.id))
    for (const id of NEW_FEEDS) expect(wired.has(id), id).toBe(true)
    // Connectors are bound to registered ids — never publisher-domain pseudo-sources.
    expect(rssConnectorsFromSources(SOURCES).every((c) => c.id.startsWith('src.'))).toBe(true)
  })

  it('has no duplicate source ids', () => {
    const ids = SOURCES.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('each launch market now has multiple independent wired feeds (coverage improved)', () => {
    const byCountry: Record<string, number> = {}
    for (const s of SOURCES) {
      if (s.feedUrl && s.countryCode) byCountry[s.countryCode] = (byCountry[s.countryCode] ?? 0) + 1
    }
    expect(byCountry.NG ?? 0).toBeGreaterThanOrEqual(3)
    expect(byCountry.GH ?? 0).toBeGreaterThanOrEqual(3)
    expect(byCountry.ZA ?? 0).toBeGreaterThanOrEqual(3) // was 1 before this PR
    expect(byCountry.ET ?? 0).toBeGreaterThanOrEqual(3) // was 1 before this PR
    expect(byCountry.KE ?? 0).toBeGreaterThanOrEqual(2) // remaining gap toward the 3-5 goal
  })
})
