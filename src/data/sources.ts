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
    // BACI/HS trade data via OEC (oec.world). Keyless. Secondary / official-DERIVED:
    // BACI is CEPII's cleaned version of UN Comtrade, so it ranks below the primary
    // src.comtrade for the same fields.
    id: 'src.oec',
    name: 'Observatory of Economic Complexity (BACI/HS)',
    tier: 'multilateral',
    credibility: 'secondary',
    url: 'https://oec.world',
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
    // Business/economy category feed (less non-economic noise than the site-wide feed).
    feedUrl: 'https://www.premiumtimesng.com/business/feed',
  },
  {
    id: 'src.nairametrics_ng',
    name: 'Nairametrics',
    tier: 'local_press',
    credibility: 'secondary',
    url: 'https://nairametrics.com',
    accessMethod: 'rss',
    countryCode: 'NG',
    feedUrl: 'https://nairametrics.com/feed/',
  },
  {
    id: 'src.standardmedia_ke',
    name: 'The Standard (Nairobi)',
    tier: 'local_press',
    credibility: 'secondary',
    url: 'https://www.standardmedia.co.ke',
    accessMethod: 'rss',
    countryCode: 'KE',
    // Business section feed (less non-economic noise than the headlines feed).
    feedUrl: 'https://www.standardmedia.co.ke/rss/business.php',
  },
  {
    id: 'src.capitalfm_ke',
    name: 'Capital FM (Business)',
    tier: 'local_press',
    credibility: 'secondary',
    url: 'https://www.capitalfm.co.ke',
    accessMethod: 'rss',
    countryCode: 'KE',
    feedUrl: 'https://www.capitalfm.co.ke/business/feed/',
  },
  {
    id: 'src.myjoyonline_gh',
    name: 'MyJoyOnline',
    tier: 'local_press',
    credibility: 'secondary',
    url: 'https://www.myjoyonline.com',
    accessMethod: 'rss',
    countryCode: 'GH',
    // Business category feed (the site-wide feed is heavily non-economic).
    feedUrl: 'https://www.myjoyonline.com/business/feed/',
  },
  {
    id: 'src.bft_gh',
    name: 'Business & Financial Times (Ghana)',
    tier: 'local_press',
    credibility: 'secondary',
    url: 'https://thebftonline.com',
    accessMethod: 'rss',
    countryCode: 'GH',
    feedUrl: 'https://thebftonline.com/feed/',
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
