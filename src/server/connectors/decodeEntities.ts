// Decodes HTML / XML character entities in INGESTED feed text to their plain-text
// characters, so titles and summaries never reach the artifact (or the UI) as literal
// "&#8211;" / "&#8217;" / "&amp;". Output is PLAIN TEXT only: this returns a string, does
// no HTML parsing or rendering, and never emits markup - callers render it as escaped text.
// Conservative: unknown named entities and bare ampersands (e.g. "AT&T", "R&D") are left
// untouched, and decoding is single-pass (so "&amp;lt;" decodes once to "&lt;", not to "<").

// Common NAMED entities seen in news feeds, mapped to their Unicode CODE POINT. Numeric
// entities (decimal &#NN; and hex &#xNN;) are handled generically below, so only names need
// listing. Storing code points (not literal characters) keeps this source pure ASCII; the
// real character is produced at runtime via String.fromCodePoint.
const NAMED_ENTITIES: Record<string, number> = {
  amp: 0x26, // &
  lt: 0x3c, // <
  gt: 0x3e, // >
  quot: 0x22, // "
  apos: 0x27, // '
  nbsp: 0x20, // normalise a non-breaking space to a regular space
  ndash: 0x2013, // en dash
  mdash: 0x2014, // em dash
  lsquo: 0x2018,
  rsquo: 0x2019, // curly apostrophe
  sbquo: 0x201a,
  ldquo: 0x201c,
  rdquo: 0x201d,
  bdquo: 0x201e,
  hellip: 0x2026, // ellipsis
  deg: 0xb0,
  copy: 0xa9,
  reg: 0xae,
  trade: 0x2122,
  eacute: 0xe9,
  egrave: 0xe8,
  agrave: 0xe0,
}

const ENTITY_RE = /&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi

export function decodeEntities(text: string): string {
  if (!text.includes('&')) return text
  return text.replace(ENTITY_RE, (match, body: string) => {
    let code: number
    if (body[0] === '#') {
      const isHex = body[1] === 'x' || body[1] === 'X'
      code = isHex ? Number.parseInt(body.slice(2), 16) : Number.parseInt(body.slice(1), 10)
    } else {
      const named = NAMED_ENTITIES[body.toLowerCase()]
      if (named === undefined) return match // unknown named entity: leave it untouched
      code = named
    }
    // Reject out-of-range / surrogate code points; leave the original text untouched.
    if (!Number.isInteger(code) || code <= 0 || code > 0x10ffff) return match
    try {
      return String.fromCodePoint(code)
    } catch {
      return match
    }
  })
}
