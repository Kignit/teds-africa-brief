import type { ConnectorContext } from './types'
import type { NewsItem } from '../../domain/news'
import { inferCountryCodes } from '../../data/countryKeywords'
import { decodeEntities } from './decodeEntities'

// GDELT DOC 2.0 API — free, no key. The broad global/continental backbone used
// to surface triggers for the causal map. Returns links + metadata, not full text.
const SOURCE_ID = 'src.gdelt'

// GDELT's free endpoint throttles per IP ("one request every 5 seconds") and on
// shared CI egress IPs it 429s aggressively — query shape / maxrecords don't change
// that. We retry a couple of times with backoff (respecting its ~5s window) so the
// request can succeed if the shared-IP window opens, then FAIL CLOSED. Best-effort:
// a persistently throttled IP still fails, and that failure is recorded in
// diagnostics (never silently treated as "no news").
const RETRY_DELAYS_MS = [5000, 10000]

const realSleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

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

function toNewsItems(body: GdeltResponse, now: () => string): NewsItem[] {
  const articles = body.articles ?? []
  return articles
    .filter((a) => a.url && a.title)
    .map((a, i) => {
      const title = decodeEntities(a.title ?? '')
      return {
        id: `${SOURCE_ID}:${i}:${a.url}`,
        sourceId: SOURCE_ID,
        title,
        summary: '',
        url: a.url ?? '',
        publishedAt: parseGdeltDate(a.seendate) ?? now(),
        language: a.language ?? 'en',
        // Deterministic, conservative country tag (empty when no launch market is named).
        countryCodes: inferCountryCodes(title),
      }
    })
}

export async function fetchGdelt(ctx: ConnectorContext, query: string): Promise<NewsItem[]> {
  const url = `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(
    query,
  )}&mode=artlist&format=json&maxrecords=25`
  const sleep = ctx.sleep ?? realSleep

  let attempts = 0
  let lastError = 'unknown error'
  for (let i = 0; i <= RETRY_DELAYS_MS.length; i++) {
    if (i > 0) await sleep(RETRY_DELAYS_MS[i - 1])
    attempts += 1
    try {
      const res = await ctx.fetch(url)
      if (res.ok) {
        // A 200 with no articles is a legitimate empty, not a failure.
        return toNewsItems((await res.json()) as GdeltResponse, ctx.now)
      }
      lastError = `HTTP ${res.status}`
      // 429 / 5xx are transient (shared-IP throttle, outage) → retry; other 4xx won't
      // improve on retry → stop and fail closed immediately.
      if (res.status !== 429 && res.status < 500) break
    } catch (e) {
      // Transient network error (connection reset / DNS) → retry, then fail closed.
      lastError = e instanceof Error ? e.message : String(e)
    }
  }
  // Fail LOUD: recorded as a connector failure in diagnostics, never a silent empty.
  throw new Error(`GDELT request failed after ${attempts} attempt(s): ${lastError}`)
}
