import type { ConnectorContext } from './types'
import type { NewsItem } from '../../domain/news'

// Generic RSS reader. Lightweight, dependency-free parsing so it runs in any
// environment. RSS is the integration path for local press and FT/Economist.
const ITEM_RE = /<item\b[\s\S]*?<\/item>/gi
const FIELD_RE = {
  title: /<title[^>]*>([\s\S]*?)<\/title>/i,
  link: /<link[^>]*>([\s\S]*?)<\/link>/i,
  description: /<description[^>]*>([\s\S]*?)<\/description>/i,
  pubDate: /<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i,
}

function decodeEntities(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .trim()
}

function field(block: string, re: RegExp): string {
  const m = block.match(re)
  return m ? decodeEntities(m[1]) : ''
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
    return {
      id: `${sourceId}:${hash(link || title)}`,
      sourceId,
      title,
      summary: stripHtml(field(block, FIELD_RE.description)).slice(0, 400),
      url: link,
      publishedAt: toIso(field(block, FIELD_RE.pubDate), now),
      language: 'en',
    }
  })
}

export async function fetchRss(
  ctx: ConnectorContext,
  sourceId: string,
  url: string,
): Promise<NewsItem[]> {
  const res = await ctx.fetch(url)
  if (!res.ok) return []
  const xml = await res.text()
  return parseRss(xml, sourceId, ctx.now())
}
