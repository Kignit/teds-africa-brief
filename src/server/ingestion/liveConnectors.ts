import type { CountryProfileConnector, FigureConnector, NewsConnector } from './pipeline'
import { fetchAfricanFx } from '../connectors/fx'
import { fetchBrentEia } from '../connectors/marketData'
import { fetchGdelt } from '../connectors/gdelt'
import { fetchRss } from '../connectors/rss'
import { fetchCountryProfiles, type CountryProfileSpec } from '../connectors/countryProfile'

// Adapters that present the existing connectors as pipeline connectors. Each id
// matches a registered Source so produced figures/events always resolve.

// Market — open.er-api.com FX for the five launch currencies (free, no key).
export const fxConnector: FigureConnector = {
  id: 'src.open_er_api',
  run: (ctx) => fetchAfricanFx(ctx),
}

// Market (keyed) — US EIA Brent crude. Contributes nothing until EIA_API_KEY is
// set; it never fabricates a value.
export const brentConnector: FigureConnector = {
  id: 'src.eia',
  run: async (ctx) => {
    const res = await fetchBrentEia(ctx)
    return res.disabled ? [] : res.figures
  },
}

// News — GDELT global/continental backbone (free, no key).
export function gdeltConnector(query: string): NewsConnector {
  return { id: 'src.gdelt', run: (ctx) => fetchGdelt(ctx, query) }
}

// News — a single RSS feed bound to a registered source id.
export function rssConnector(sourceId: string, url: string): NewsConnector {
  return { id: sourceId, run: (ctx) => fetchRss(ctx, sourceId, url) }
}

// Country profiles — World Bank backbone (no key) + optional Comtrade enrichment
// (keyed). Field-level provenance; unsourceable fields are omitted.
export function countryProfileConnector(specs?: CountryProfileSpec[]): CountryProfileConnector {
  return { id: 'src.worldbank', run: (ctx) => fetchCountryProfiles(ctx, specs) }
}

// The default no-key live set: one market connector + one news connector, both
// resolving to registry sources, so the pipeline runs with zero configuration.
// Keyed connectors (EIA/FRED) and RSS feeds are added by a caller that has the
// credentials and feed URLs.
export function defaultLiveConnectors(
  newsQuery = 'Africa economy OR Africa currency OR Africa oil',
): {
  figureConnectors: FigureConnector[]
  newsConnectors: NewsConnector[]
  profileConnectors: CountryProfileConnector[]
} {
  return {
    figureConnectors: [fxConnector],
    newsConnectors: [gdeltConnector(newsQuery)],
    profileConnectors: [countryProfileConnector()],
  }
}
