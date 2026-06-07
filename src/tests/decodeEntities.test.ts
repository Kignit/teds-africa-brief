import { describe, it, expect } from 'vitest'
import { decodeEntities } from '../server/connectors/decodeEntities'

// Expected decoded characters, built from code points so this test source stays ASCII.
const EN_DASH = String.fromCodePoint(0x2013)
const LSQUO = String.fromCodePoint(0x2018)
const RSQUO = String.fromCodePoint(0x2019)
const HELLIP = String.fromCodePoint(0x2026)

describe('decodeEntities', () => {
  it('decodes numeric entities (decimal and hex) to the real character', () => {
    expect(decodeEntities('85% of the budget &#8211; Finance Ministry')).toBe(
      `85% of the budget ${EN_DASH} Finance Ministry`,
    )
    expect(decodeEntities('a &#x2013; b')).toBe(`a ${EN_DASH} b`)
  })

  it('decodes smart quotes / apostrophes', () => {
    expect(decodeEntities('BMW SA&#8217;s &#8216;hidden gem&#8217;')).toBe(
      `BMW SA${RSQUO}s ${LSQUO}hidden gem${RSQUO}`,
    )
  })

  it('decodes the named XML entities, including &amp; to &', () => {
    expect(decodeEntities('Tom &amp; Jerry')).toBe('Tom & Jerry')
    expect(decodeEntities('5 &lt; 10 &gt; 3')).toBe('5 < 10 > 3')
    expect(decodeEntities('&quot;quoted&quot;')).toBe('"quoted"')
    expect(decodeEntities('it&apos;s and &#39;ok&#39;')).toBe("it's and 'ok'")
  })

  it('leaves bare ampersands and unknown entities untouched (no mangling)', () => {
    expect(decodeEntities('AT&T and R&D')).toBe('AT&T and R&D')
    expect(decodeEntities('keep &foobar; intact')).toBe('keep &foobar; intact')
  })

  it('leaves plain text unchanged and does not strip punctuation', () => {
    expect(decodeEntities('plain text, with punctuation! (yes).')).toBe(
      'plain text, with punctuation! (yes).',
    )
  })

  it('is single-pass and never emits markup (text only)', () => {
    // A double-encoded entity decodes ONE level only.
    expect(decodeEntities('&amp;lt;')).toBe('&lt;')
    // Decoded angle brackets are plain text for the caller to escape, not markup.
    expect(decodeEntities('&lt;b&gt;bold&lt;/b&gt;')).toBe('<b>bold</b>')
  })

  // Feeds occasionally truncate a summary mid-entity so the terminating ";" is lost
  // (e.g. "[&#8230" / "[&#8217s"). For NUMERIC entities the digit run is unambiguous,
  // so we decode anyway when the resulting code point is printable. Control-range code
  // points without ";" are left untouched (almost certainly a longer entity truncated
  // mid-sequence). Named entities still REQUIRE ";" because "&amp" could be the start
  // of "&ampere"; lenient leniency there would silently corrupt source text.
  describe('truncated / malformed numeric entities (semicolon missing)', () => {
    it('decodes a numeric entity when ";" is missing and a non-digit follows', () => {
      expect(decodeEntities('[&#8230 here')).toBe(`[${HELLIP} here`)
      expect(decodeEntities('&#8211 budget')).toBe(`${EN_DASH} budget`)
      expect(decodeEntities('BMW SA&#8217s plan')).toBe(`BMW SA${RSQUO}s plan`)
    })

    it('decodes a numeric entity at end-of-string with no ";"', () => {
      expect(decodeEntities('[&#8230')).toBe(`[${HELLIP}`)
    })

    it('requires ";" for HEX numeric entities (avoids letter-digit ambiguity)', () => {
      // Hex digits [a-f] overlap normal letters, so the greedy run "&#x2019apple" absorbs
      // the leading "a" as hex (body becomes "#x2019a") and would corrupt "apple". So hex
      // WITHOUT ";" is left untouched. Decimal stays lenient (covered above) because [0-9]
      // can't overlap letters.
      expect(decodeEntities('&#x2019apple')).toBe('&#x2019apple')
      expect(decodeEntities('&#x2013 dash')).toBe('&#x2013 dash')
      expect(decodeEntities('&#X2019')).toBe('&#X2019')
      // Hex WITH ";" still decodes - the source has explicitly terminated the entity.
      expect(decodeEntities('&#x2013;')).toBe(EN_DASH)
      expect(decodeEntities('&#x2019;apple')).toBe(`${RSQUO}apple`)
    })

    it('leaves an out-of-allowlist decimal WITHOUT ";" untouched (likely truncation)', () => {
      // Only a small allowlist of code points (8211, 8216, 8217, 8220, 8221, 8230, 38)
      // decodes without ";" - those are the entities common feeds actually mangle. Anything
      // else without ";" is treated as a truncated fragment and left literal:
      //   - "[&#8" cut off from "&#8230;" - decoding to U+0008 (backspace) would corrupt;
      //   - "[&#823" cut off from "&#8230;" - decoding to U+0337 (combining mark) would
      //     silently attach to whatever the next character is and corrupt the rendering.
      expect(decodeEntities('[&#8')).toBe('[&#8')
      expect(decodeEntities('&#8 end')).toBe('&#8 end')
      expect(decodeEntities('[&#823')).toBe('[&#823')
      expect(decodeEntities('[&#823 here')).toBe('[&#823 here')
      // Even high, printable code points are left literal without ";" if not on the list.
      expect(decodeEntities('&#1234 plain')).toBe('&#1234 plain')
      expect(decodeEntities('&#8212 emdash')).toBe('&#8212 emdash') // em dash not on list
    })

    it('decodes the allowlist entities WITHOUT ";" (smart quotes, dashes, ellipsis, "&")', () => {
      const LDQUO = String.fromCodePoint(0x201c)
      const RDQUO = String.fromCodePoint(0x201d)
      expect(decodeEntities('&#8216 quote')).toBe(`${LSQUO} quote`)
      expect(decodeEntities('&#8220 dquote')).toBe(`${LDQUO} dquote`)
      expect(decodeEntities('&#8221 more')).toBe(`${RDQUO} more`)
      // WordPress double-encodes "&" as "&#038;"; truncation drops the ";".
      expect(decodeEntities('Tom &#038tomorrow')).toBe('Tom &tomorrow')
    })

    it('still trusts an EXPLICIT ";" even for low code points (no behavior change)', () => {
      // The semicolon is the source's explicit signal that this is the intended entity.
      expect(decodeEntities('&#8;')).toBe(String.fromCodePoint(8))
      expect(decodeEntities('&#038;')).toBe('&')
    })

    it('does NOT relax ";" for NAMED entities (avoids "&amp" / "&ampere" collisions)', () => {
      expect(decodeEntities('&amp')).toBe('&amp')
      expect(decodeEntities('&ampere')).toBe('&ampere')
      expect(decodeEntities('&hellip')).toBe('&hellip')
      // Named with ";" still works.
      expect(decodeEntities('&amp;')).toBe('&')
    })
  })
})
