import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import App from '../app/App'
import type { BriefDraft } from '../domain/brief'

// A minimal gate-shaped brief with one verified figure carrying exactly one source, so the
// computed masthead provenance reads "1 source" (singular) and the source count is real.
function brief(): BriefDraft {
  return {
    id: 'shell-brief',
    date: '2026-05-29',
    edition: 'daily',
    status: 'draft',
    dataMode: 'live',
    sections: [],
    claims: [],
    figures: [
      {
        id: 'fig-1',
        metric: 'fx.NGN_USD',
        label: 'NGN / USD',
        value: 1452,
        unit: 'NGN/USD',
        asOf: '2026-05-29T06:00:00.000Z',
        sourceIds: ['src.open_er_api'],
        status: 'verified',
        validation: { hasSource: true, hasTimestamp: true, withinRange: true, reasons: [] },
      },
    ],
    events: [],
    profiles: [],
    methodologies: [],
  }
}

describe('designed app shell', () => {
  it('renders the editorial masthead and drops the scaffold intro copy', () => {
    render(<App brief={brief()} generatedAt="2026-06-08T12:14:14.184Z" />)
    expect(screen.getByRole('heading', { name: /ted's africa brief/i })).toBeInTheDocument()
    expect(screen.getByText(/Updated 08 Jun 2026, 12:14 UTC/)).toBeInTheDocument()
    expect(screen.queryByText(/runtime screen for gated connector output/i)).not.toBeInTheDocument()
  })

  it('shows a provenance line computed from the real source count, not a fabricated one', () => {
    render(<App brief={brief()} generatedAt="2026-06-08T12:14:14.184Z" />)
    // exactly one distinct sourceId across the brief -> singular "1 source"
    expect(screen.getByText(/AI-drafted from 1 source\b/)).toBeInTheDocument()
  })

  it('keeps the empty state free of scaffold copy and of any fabricated data', () => {
    const { container } = render(<App />)
    expect(screen.getByText(/no connector-backed brief loaded/i)).toBeInTheDocument()
    expect(screen.queryByText(/runtime screen for gated connector output/i)).not.toBeInTheDocument()
    // no figures, tickers, or provenance leak into the empty state
    expect(container.textContent ?? '').not.toMatch(/NGN|Brent|Eurobond|Oil jumps|AI-drafted/i)
  })
})
