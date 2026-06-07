// Decodes HTML / XML character entities in INGESTED feed text to their plain-text
// characters, so titles and summaries never reach the artifact (or the UI) as literal
// "&#8211;" / "&#8217;" / "&amp;". Output is PLAIN TEXT only: this returns a string, does
// no HTML parsing or rendering, and never emits markup - callers render it as escaped text.
// Conservative: unknown named entities and bare ampersands (e.g. "AT&T", "R&D") are left
// untouched, and decoding is single-pass (so "&amp;lt;" decodes once to "&lt;", not to "<").
//
// DECIMAL numeric entities also accept a MISSING terminating ";" ONLY for a small allowlist
// of code points common feed software actually mangles by dropping the ";" (smart quotes,
// dashes, ellipsis, the WordPress-double-encoded "&"). An unknown code WITHOUT ";" is left
// untouched - the most likely cause is mid-entity truncation ("[&#8" cut off from a longer
// "&#8230;", "[&#823" cut off too), and silently decoding to a combining mark / control /
// random CJK glyph would corrupt the text. HEX numeric entities still REQUIRE ";" because
// [0-9a-f] overlaps letters (e.g. "&#x2019apple" would greedy-match "2019a"). NAMED entities
// also REQUIRE ";" because the name run is ambiguous (e.g. "&amp" could be the start of
// "&ampere"). Adding a code point to the allowlist is a deliberate review-gated choice.

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

// Decimal code points the decoder will accept WITHOUT a terminating ";". Each is a known
// feed-mangling case (smart quotes, dashes, ellipsis, WordPress's "&#038;" double encoding
// of "&"). Outside this set, a missing ";" leaves the match untouched. Add a value only
// after observing the corresponding "&#NNNN" truncation in real feeds.
const LENIENT_DECIMAL_CODES = new Set<number>([
  38, // & (matches WordPress double-encoded "&#038;" without the trailing ";")
  8211, // en dash
  8216, // left single quote
  8217, // right single quote (curly apostrophe)
  8220, // left double quote
  8221, // right double quote
  8230, // horizontal ellipsis
])

const ENTITY_RE = /&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*)(;?)/gi

export function decodeEntities(text: string): string {
  if (!text.includes('&')) return text
  return text.replace(ENTITY_RE, (match, body: string, semi: string) => {
    let code: number
    if (body[0] === '#') {
      const isHex = body[1] === 'x' || body[1] === 'X'
      // Hex entities REQUIRE ";": [0-9a-f] overlaps letters, so a missing ";" makes the run
      // ambiguous - "&#x2019apple" greedy-matches "2019a" and would corrupt "apple". Leave
      // the match untouched in that case. Decimal stays lenient (next branch) because [0-9]
      // has no letter overlap, so the decimal digit run is unambiguous.
      if (isHex && semi !== ';') return match
      code = isHex ? Number.parseInt(body.slice(2), 16) : Number.parseInt(body.slice(1), 10)
      // Decimal entity WITHOUT ";" only decodes if its code point is on the allowlist of
      // known feed-mangling cases. An unknown code without ";" is almost certainly a
      // truncation mid-sequence (e.g. "[&#8" or "[&#823" cut off from a longer "&#8230;"),
      // and silently emitting U+0337-style combining marks or U+0008-style controls would
      // corrupt the text. When ";" IS present the source explicitly terminated the entity,
      // so trust its intent and decode regardless of the code point.
      if (semi !== ';' && !LENIENT_DECIMAL_CODES.has(code)) return match
    } else {
      // Named entity: ";" is REQUIRED (no leniency) because the name run is ambiguous -
      // "&amp" could legitimately be the prefix of "&ampere" or "&ample" in source text.
      if (semi !== ';') return match
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
