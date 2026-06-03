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
    // No verified public RSS feed found — intentionally NOT wired (no feedUrl).
  },
  {
    id: 'src.sarb',
    name: 'South African Reserve Bank',
    tier: 'primary',
    credibility: 'primary',
    url: 'https://www.resbank.co.za',
    accessMethod: 'api',
    countryCode: 'ZA',
    // No verified public RSS feed found — intentionally NOT wired (no feedUrl).
  },
  {
    id: 'src.businessday_ng',
    name: 'BusinessDay (Lagos)',
    tier: 'local_press',
    credibility: 'secondary',
    url: 'https://businessday.ng',
    accessMethod: 'rss',
    countryCode: 'NG',
    feedUrl: 'https://businessday.ng/feed',
  },
  {
    id: 'src.nation_ke',
    name: 'Business Daily (Nairobi)',
    tier: 'local_press',
    credibility: 'secondary',
    url: 'https://www.businessdailyafrica.com',
    accessMethod: 'rss',
    countryCode: 'KE',
    // No verified public RSS feed found — intentionally NOT wired (no feedUrl).
  },
  {
    id: 'src.premiumtimes_ng',
    name: 'Premium Times',
    tier: 'local_press',
    credibility: 'secondary',
    url: 'https://www.premiumtimesng.com',
    accessMethod: 'rss',
    countryCode: 'NG',
    feedUrl: 'https://www.premiumtimesng.com/feed',
  },
  {
    id: 'src.standardmedia_ke',
    name: 'The Standard (Nairobi)',
    tier: 'local_press',
    credibility: 'secondary',
    url: 'https://www.standardmedia.co.ke',
    accessMethod: 'rss',
    countryCode: 'KE',
    feedUrl: 'https://www.standardmedia.co.ke/rss/headlines.php',
  },
  {
    id: 'src.myjoyonline_gh',
    name: 'MyJoyOnline',
    tier: 'local_press',
    credibility: 'secondary',
    url: 'https://www.myjoyonline.com',
    accessMethod: 'rss',
    countryCode: 'GH',
    feedUrl: 'https://www.myjoyonline.com/feed/',
  },
  {
    id: 'src.addisfortune_et',
    name: 'Addis Fortune',
    tier: 'local_press',
    credibility: 'secondary',
    url: 'https://addisfortune.news',
    accessMethod: 'rss',
    countryCode: 'ET',
    feedUrl: 'https://addisfortune.news/feed/',
  },
  {
    id: 'src.moneyweb_za',
    name: 'Moneyweb',
    tier: 'local_press',
    credibility: 'secondary',
    url: 'https://www.moneyweb.co.za',
    accessMethod: 'rss',
    countryCode: 'ZA',
    feedUrl: 'https://www.moneyweb.co.za/feed',
  },
]

export const SOURCE_BY_ID = new Map(SOURCES.map((s) => [s.id, s]))

export function sourceName(id: string): string {
  return SOURCE_BY_ID.get(id)?.name ?? id
}
