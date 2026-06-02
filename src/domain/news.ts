// A NewsItem is a single piece of reporting from one source (an RSS entry,
// a wire headline, etc.). NewsItems are triangulated into Events.
export interface NewsItem {
  id: string
  sourceId: string
  title: string
  summary: string
  url: string
  /** ISO-8601 publication timestamp. */
  publishedAt: string
  language: string
}
