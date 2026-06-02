import type { NewsItem } from '../../domain/news'

function dedupeKey(it: NewsItem): string {
  const url = it.url
    .trim()
    .toLowerCase()
    .replace(/[?#].*$/, '')
  return url || it.title.trim().toLowerCase()
}

// Remove duplicate NewsItems (same canonical URL, or same title when no URL).
export function dedupeNewsItems(items: NewsItem[]): NewsItem[] {
  const seen = new Set<string>()
  const out: NewsItem[] = []
  for (const it of items) {
    const key = dedupeKey(it)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(it)
  }
  return out
}
