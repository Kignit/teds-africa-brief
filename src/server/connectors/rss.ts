import type { ConnectorContext } from './types'
import type { NewsItem } from '../../domain/news'
import { inferCountryCodes } from '../../data/countryKeywords'
import { decodeEntities } from './decodeEntities'

// Generic RSS reader. Lightweight, dependency-free parsing so it runs in any
// environment. RSS is the integration path for local press and FT/Economist.
const ITEM_RE = /<item\b[\s\S]*?<\/item>/gi
const FIELD_RE = {
  title: /<title[^>]*>([\s\S]*?)<\/title>/i,
  link: /<link[^>]*>([\s\S]*?)<\/link>/i,
  description: /<description[^>]*>([\s\S]*?)<\/description>/i,
  pubDate: /<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i,
}

// Unwrap RSS/XML CDATA, then decode HTML entities to plain text. CDATA stripping is
// XML-specific; entity decoding (including numeric entities like &#8211;) is the shared
// decoder, so titles/summaries reach the artifact as clean text, not "&#8211;".
function field(block: string, re: RegExp): string {
  const m = block.match(re)
  if (!m) return ''
  const cdataUnwrapped = m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  return decodeEntities(cdataUnwrapped).trim()
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, '').trim()
}

function hash(s: string): string {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0
  return (h >>> 0).toString(36)
}

function toIso(raw: string, fallback: string): string {
  const t = Date.parse(raw)
  return Number.isNaN(t) ? fallback : new Date(t).toISOString()
}

export function parseRss(xml: string, sourceId: string, now: string): NewsItem[] {
  const blocks = xml.match(ITEM_RE) ?? []
  return blocks.map((block) => {
    const link = field(block, FIELD_RE.link)
    const title = field(block, FIELD_RE.title)
    const summary = stripHtml(field(block, FIELD_RE.description)).slice(0, 400)
    return {
      id: `${sourceId}:${hash(link || title)}`,
      sourceId,
      title,
      summary,
      url: link,
      publishedAt: toIso(field(block, FIELD_RE.pubDate), now),
      language: 'en',
      // Deterministic, conservative country tag from headline + summary.
      countryCodes: inferCountryCodes(`${title} ${summary}`),
    }
  })
}

export async function fetchRss(
  ctx: ConnectorContext,
  sourceId: string,
  url: string,
): Promise<NewsItem[]> {
  const res = await ctx.fetch(url)
  // Fail loud so a feed outage is recorded as a connector failure, not silently empty
  // (same rationale as the GDELT connector).
  if (!res.ok) throw new Error(`RSS request failed (${sourceId}): HTTP ${res.status}`)
  const xml = await res.text()
  return parseRss(xml, sourceId, ctx.now())
}
