// Shared http(s) URL guard. The single authority on whether a value is a usable web link,
// used to decide which real NewsItem URLs may be carried into the artifact (corroboration),
// to validate the produced artifact, and to decide whether the UI renders a link. http/https
// only; anything else (mailto:, javascript:, a relative path, empty, or a non-string) is
// rejected - so a fabricated or non-web "link" can never qualify.
export function isHttpUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0) return false
  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    return false
  }
  return parsed.protocol === 'http:' || parsed.protocol === 'https:'
}
