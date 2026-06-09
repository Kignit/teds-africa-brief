import { theme } from '../app/theme'
import { sourceName } from '../data/sources'
import { isHttpUrl } from '../domain/url'

export interface SourceRef {
  sourceId: string
  /** The real source-article URL, when one exists. Absent/malformed renders as plain text. */
  url?: string
}

// Renders distinct source names, comma-separated. A source with a valid http/https article URL
// renders as a link (new tab); otherwise plain text. De-dupes by sourceId in first-appearance
// order, choosing the FIRST VALID URL for each source - so an earlier ref with no/invalid URL
// never blocks a later valid one. Fail-closed: no valid URL renders as text, never a fabricated
// link.
export function SourceLinks({ sources }: { sources: SourceRef[] }) {
  const order: string[] = []
  const urlBySource = new Map<string, string | undefined>()
  for (const s of sources) {
    if (!urlBySource.has(s.sourceId)) {
      order.push(s.sourceId)
      urlBySource.set(s.sourceId, isHttpUrl(s.url) ? s.url : undefined)
    } else if (urlBySource.get(s.sourceId) === undefined && isHttpUrl(s.url)) {
      urlBySource.set(s.sourceId, s.url)
    }
  }
  return (
    <>
      {order.map((sourceId, i) => {
        const url = urlBySource.get(sourceId)
        return (
          <span key={sourceId}>
            {i > 0 ? ', ' : ''}
            {isHttpUrl(url) ? (
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: theme.accent, textDecoration: 'underline' }}
              >
                {sourceName(sourceId)}
              </a>
            ) : (
              sourceName(sourceId)
            )}
          </span>
        )
      })}
    </>
  )
}
