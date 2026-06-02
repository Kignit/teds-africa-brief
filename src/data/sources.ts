import type { Source } from '../domain/source'

// The source registry referenced by figures/events. Mirrors the Source Map.
export const SOURCES: Source[] = [
  {
    id: 'src.open_er_api',
    name: 'open.er-api.com',
    tier: 'market_data',
    credibility: 'secondary',
    url: 'https://open.er-api.com',
    accessMethod: 'api',
  },
  {
    id: 'src.worldbank',
    name: 'World Bank Open Data',
    tier: 'multilateral',
    credibility: 'primary',
    url: 'https://data.worldbank.org',
    accessMethod: 'api',
  },
  {
    id: 'src.comtrade',
    name: 'UN Comtrade',
    tier: 'multilateral',
    credibility: 'primary',
    url: 'https://comtradeplus.un.org',
    accessMethod: 'api',
  },
  {
    id: 'src.gdelt',
    name: 'GDELT Project',
    tier: 'aggregator',
    credibility: 'secondary',
    url: 'https://gdeltproject.org',
    accessMethod: 'api',
  },
  {
    id: 'src.eia',
    name: 'US EIA',
    tier: 'market_data',
    credibility: 'primary',
    url: 'https://www.eia.gov',
    accessMethod: 'api',
  },
  {
    id: 'src.fred',
    name: 'FRED (St. Louis Fed)',
    tier: 'market_data',
    credibility: 'primary',
    url: 'https://fred.stlouisfed.org',
    accessMethod: 'api',
  },
  {
    id: 'src.cbn',
    name: 'Central Bank of Nigeria',
    tier: 'primary',
    credibility: 'primary',
    url: 'https://www.cbn.gov.ng',
    accessMethod: 'rss',
    countryCode: 'NG',
  },
  {
    id: 'src.sarb',
    name: 'South African Reserve Bank',
    tier: 'primary',
    credibility: 'primary',
    url: 'https://www.resbank.co.za',
    accessMethod: 'api',
    countryCode: 'ZA',
  },
  {
    id: 'src.businessday_ng',
    name: 'BusinessDay (Lagos)',
    tier: 'local_press',
    credibility: 'secondary',
    url: 'https://businessday.ng',
    accessMethod: 'rss',
    countryCode: 'NG',
  },
  {
    id: 'src.nation_ke',
    name: 'Business Daily (Nairobi)',
    tier: 'local_press',
    credibility: 'secondary',
    url: 'https://www.businessdailyafrica.com',
    accessMethod: 'rss',
    countryCode: 'KE',
  },
]

export const SOURCE_BY_ID = new Map(SOURCES.map((s) => [s.id, s]))

export function sourceName(id: string): string {
  return SOURCE_BY_ID.get(id)?.name ?? id
}
