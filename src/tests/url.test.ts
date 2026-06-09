import { describe, it, expect } from 'vitest'
import { isHttpUrl } from '../domain/url'

describe('isHttpUrl', () => {
  it('accepts absolute http and https URLs', () => {
    expect(isHttpUrl('https://www.reuters.com/world/africa/article-1')).toBe(true)
    expect(isHttpUrl('http://example.org/path?q=1')).toBe(true)
  })

  it('rejects non-http(s) schemes, relative paths, empty, and non-strings', () => {
    expect(isHttpUrl('ftp://files.test/a')).toBe(false)
    expect(isHttpUrl('mailto:tips@example.com')).toBe(false)
    expect(isHttpUrl('javascript:alert(1)')).toBe(false)
    expect(isHttpUrl('/relative/path')).toBe(false)
    expect(isHttpUrl('not a url')).toBe(false)
    expect(isHttpUrl('')).toBe(false)
    expect(isHttpUrl(undefined)).toBe(false)
    expect(isHttpUrl(null)).toBe(false)
    expect(isHttpUrl(42)).toBe(false)
  })
})
