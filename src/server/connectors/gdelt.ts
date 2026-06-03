import type { ConnectorContext } from './types'
import type { NewsItem } from '../../domain/news'
import { inferCountryCodes } from '../../data/countryKeywords'

// GDELT DOC 2.0 API — free, no key. The broad global/continental backbone used
// to surface triggers for the causal map. Returns links + metadata, not full text.
const SOURCE_ID = 'src.gdelt'

interface GdeltArticle {
  title?: string
  url?: string
  seendate?: string
  language?: string
}

interface GdeltResponse {
  articles?: GdeltArticle[]
}

function parseGdeltDate(s: string | undefined): string | null {
  if (!s) return null
  const m = s.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/)
  if (!m) return null
  return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}.000Z`
}

export async function fetchGdelt(ctx: ConnectorContext, query: string): Promise<NewsItem[]> {
  const url = `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(
    query,
  )}&mode=artlist&format=json&maxrecords=25`
  const res = await ctx.fetch(url)
  // Fail LOUD on a rate-limit/outage (GDELT's free endpoint 429s aggressively) so the
  // pipeline records a connector failure instead of a silent empty list that is
  // indistinguishable from "no news" and can quietly hollow out a brief. A 200 with no
  // articles remains a legitimate empty.
  if (!res.ok) throw new Error(`GDELT request failed: HTTP ${res.status}`)
  const body = (await res.json()) as GdeltResponse
  const articles = body.articles ?? []
  return articles
    .filter((a) => a.url && a.title)
    .map((a, i) => ({
      id: `${SOURCE_ID}:${i}:${a.url}`,
      sourceId: SOURCE_ID,
      title: a.title ?? '',
      summary: '',
      url: a.url ?? '',
      publishedAt: parseGdeltDate(a.seendate) ?? ctx.now(),
      language: a.language ?? 'en',
      // Deterministic, conservative country tag (empty when no launch market is named).
      countryCodes: inferCountryCodes(a.title ?? ''),
    }))
}
