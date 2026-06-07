import { describe, it, expect } from 'vitest'
import { decodeEntities } from '../server/connectors/decodeEntities'

// Expected decoded characters, built from code points so this test source stays ASCII.
const EN_DASH = String.fromCodePoint(0x2013)
const LSQUO = String.fromCodePoint(0x2018)
const RSQUO = String.fromCodePoint(0x2019)

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
})
