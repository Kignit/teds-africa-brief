import type { CountryProfileConnector, FigureConnector, NewsConnector } from './pipeline'
import type { Source } from '../../domain/source'
import { fetchAfricanFx } from '../connectors/fx'
import { fetchBrentEia, fetchFredSeries } from '../connectors/marketData'
import type { RawFigure } from '../../domain/figure'
import { fetchGdelt } from '../connectors/gdelt'
import { fetchRss } from '../connectors/rss'
import {
  fetchCountryProfiles,
  type CountryProfileSpec,
  type ProfileDiagSink,
} from '../connectors/countryProfile'

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

// Market (keyed) — US Treasury yields from FRED, the dollar/rates-shock indicators.
// Contributes nothing until FRED_API_KEY is set; it never fabricates a value.
const FRED_SERIES: { id: string; label: string; unit: string }[] = [
  { id: 'DGS10', label: 'US 10Y Treasury', unit: '%' },
  { id: 'DGS2', label: 'US 2Y Treasury', unit: '%' },
]
export const fredConnector: FigureConnector = {
  id: 'src.fred',
  run: async (ctx) => {
    const figures: RawFigure[] = []
    for (const series of FRED_SERIES) {
      const res = await fetchFredSeries(ctx, series.id, series.label, series.unit)
      if (!res.disabled) figures.push(...res.figures)
    }
    return figures
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

// News — one RSS connector per registry Source that declares a feedUrl. Each is
// bound to its REGISTERED source id, so a story it reports counts as exactly one
// distinct registered source for corroboration (never a publisher-domain
// pseudo-source). Sources without a feedUrl (e.g. a central bank with no public
// feed) are simply not wired — they contribute nothing rather than being faked.
export function rssConnectorsFromSources(sources: Source[]): NewsConnector[] {
  return sources
    .filter((s): s is Source & { feedUrl: string } => Boolean(s.feedUrl))
    .map((s) => rssConnector(s.id, s.feedUrl))
}

// Country profiles — World Bank backbone (no key) + optional Comtrade/OEC trade
// enrichment. Field-level provenance; unsourceable fields are omitted. The optional
// onDiag sink receives auditable trade-enrichment diagnostics (logged by the generator).
export function countryProfileConnector(
  specs?: CountryProfileSpec[],
  onDiag?: ProfileDiagSink,
): CountryProfileConnector {
  return { id: 'src.worldbank', run: (ctx) => fetchCountryProfiles(ctx, specs, onDiag) }
}

// The default no-key live set: one market connector + one news connector, both
// resolving to registry sources, so the pipeline runs with zero configuration.
// Keyed connectors (EIA/FRED) and RSS feeds are added by a caller that has the
// credentials and feed URLs.
export function defaultLiveConnectors(
  // GDELT DOC API requires OR'd terms to be wrapped in parens; without them it returns
  // HTTP 200 + text/html "Queries containing OR'd terms must be surrounded by ()." which
  // the connector then throws on at res.json(). See scripts/generateBrief.ts NEWS_QUERY.
  newsQuery = '(Africa economy OR Africa currency OR Africa oil)',
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
