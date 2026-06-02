import type { RawFigure } from '../domain/figure'
import type { NewsItem } from '../domain/news'
import { validateFigures } from '../server/verification/validateFigure'
import { corroborateEvents } from '../server/verification/corroborate'
import { composeDeterministicBrief } from '../server/analysis/composeStub'

// ILLUSTRATIVE SAMPLE DATA. dataMode is 'sample' everywhere it flows. The UI
// labels it as a prototype and never presents it as live intelligence. These
// figures still carry real source attribution and timestamps so they pass the
// same validation the live pipeline will use. No Eurobond spreads are included
// for Kenya/Ghana/Egypt — there is no free source, so we omit rather than fake.
const AS_OF = '2026-05-29T06:00:00.000Z'

const rawFigures: RawFigure[] = [
  {
    metric: 'fx.NGN_USD',
    label: 'NGN / USD',
    value: 1452.0,
    unit: 'NGN/USD',
    asOf: AS_OF,
    countryCode: 'NG',
    sourceIds: ['src.open_er_api'],
  },
  {
    metric: 'fx.KES_USD',
    label: 'KES / USD',
    value: 128.9,
    unit: 'KES/USD',
    asOf: AS_OF,
    countryCode: 'KE',
    sourceIds: ['src.open_er_api'],
  },
  {
    metric: 'fx.ETB_USD',
    label: 'ETB / USD',
    value: 141.2,
    unit: 'ETB/USD',
    asOf: AS_OF,
    countryCode: 'ET',
    sourceIds: ['src.open_er_api'],
  },
  {
    metric: 'fx.GHS_USD',
    label: 'GHS / USD',
    value: 13.4,
    unit: 'GHS/USD',
    asOf: AS_OF,
    countryCode: 'GH',
    sourceIds: ['src.open_er_api'],
  },
  {
    metric: 'fx.ZAR_USD',
    label: 'ZAR / USD',
    value: 18.04,
    unit: 'ZAR/USD',
    asOf: AS_OF,
    countryCode: 'ZA',
    sourceIds: ['src.open_er_api'],
  },
  {
    metric: 'commodity.brent',
    label: 'Brent crude',
    value: 70.6,
    unit: 'USD/bbl',
    asOf: AS_OF,
    sourceIds: ['src.eia'],
  },
]

export const sampleFigures = validateFigures(rawFigures)

const rawNews: NewsItem[] = [
  {
    id: 'n1',
    sourceId: 'src.businessday_ng',
    title: 'Fed holds rates and signals a cut by Q3',
    summary: 'The US Federal Reserve left rates unchanged.',
    url: 'https://businessday.ng/sample-a1',
    publishedAt: AS_OF,
    language: 'en',
  },
  {
    id: 'n2',
    sourceId: 'src.nation_ke',
    title: 'Fed holds rates and signals a cut by Q3',
    summary: 'Policymakers kept the benchmark on hold.',
    url: 'https://businessdailyafrica.com/sample-a2',
    publishedAt: AS_OF,
    language: 'en',
  },
]

export const sampleEvents = corroborateEvents(rawNews)

export const sampleBrief = composeDeterministicBrief({
  id: 'brief_sample_2026_05_29',
  date: '2026-05-29',
  edition: 'daily',
  dataMode: 'sample',
  figures: sampleFigures,
  events: sampleEvents,
})
