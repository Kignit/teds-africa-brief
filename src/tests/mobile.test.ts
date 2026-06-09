import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// Source-level guards for the mobile-first shell (read as text, like the PWA wiring tests). The
// values themselves are CSS that jsdom does not evaluate (env()/dvh/clamp), so these assert that
// the wiring is present rather than computing layout.
const read = (rel: string): string =>
  readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')

const indexHtml = read('../../index.html')
const appSource = read('../app/App.tsx')

describe('mobile viewport and reset', () => {
  it('opts the viewport into the safe-area display (viewport-fit=cover)', () => {
    expect(indexHtml).toMatch(/name="viewport"[^>]*viewport-fit=cover/)
  })

  it('ships a minimal reset: border-box, no body margin, brand background, dynamic height', () => {
    expect(indexHtml).toContain('<style>')
    expect(indexHtml).toMatch(/box-sizing:\s*border-box/)
    expect(indexHtml).toMatch(/margin:\s*0/)
    // brand background (case-insensitive) so overscroll and first paint are not white
    expect(indexHtml.toLowerCase()).toContain('#eef1f5')
    expect(indexHtml).toMatch(/min-height:\s*100dvh/)
  })
})

describe('safe-area insets', () => {
  it('pads the content container by all four safe-area insets', () => {
    expect(appSource).toContain('env(safe-area-inset-top)')
    expect(appSource).toContain('env(safe-area-inset-right)')
    expect(appSource).toContain('env(safe-area-inset-bottom)')
    expect(appSource).toContain('env(safe-area-inset-left)')
  })

  it('fills the dynamic viewport height', () => {
    expect(appSource).toContain("minHeight: '100dvh'")
  })
})
