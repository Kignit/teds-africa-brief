import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import App from '../app/App'
import type { BriefDraft } from '../domain/brief'
import type { Event, EventStatus } from '../domain/event'

function evt(id: string, title: string, status: EventStatus, sources: number): Event {
  return {
    id,
    title,
    summary: 'evidence summary',
    occurredAt: '2026-05-29T06:00:00.000Z',
    countryCodes: [],
    topic: '',
    status,
    corroboration: {
      newsItemIds: ['n1'],
      sourceIds: Array.from({ length: sources }, (_, i) => `src.s${i}`),
      independentSourceCount: sources,
      primarySourceCount: 0,
    },
  }
}

function brief(): BriefDraft {
  return {
    id: 'test-brief',
    date: '2026-05-29',
    edition: 'daily',
    status: 'draft',
    dataMode: 'live',
    sections: [],
    claims: [
      {
        id: 'claim-1',
        kind: 'figure',
        text: 'Synthetic test figure is available.',
        figureIds: ['fig-1'],
        eventIds: [],
        profileFields: [],
        profileSourceIds: [],
        methodologyIds: [],
        verified: true,
      },
      {
        id: 'claim-2',
        kind: 'causal',
        text: 'Unverified analysis must not be rendered.',
        figureIds: [],
        eventIds: [],
        profileFields: [],
        profileSourceIds: [],
        methodologyIds: [],
        verified: false,
      },
    ],
    figures: [
      {
        id: 'fig-1',
        metric: 'test.metric',
        label: 'Synthetic metric',
        value: 1,
        unit: 'test-unit',
        asOf: '2026-05-29T06:00:00.000Z',
        sourceIds: ['src.worldbank'],
        status: 'verified',
        validation: { hasSource: true, hasTimestamp: true, withinRange: true, reasons: [] },
      },
    ],
    events: [
      evt('evt-corr', 'Corroborated headline', 'corroborated', 2),
      evt('evt-single', 'Single source headline', 'single_source', 1),
      evt('evt-unconf', 'Unconfirmed headline', 'unconfirmed', 1),
    ],
    profiles: [],
    methodologies: [],
  }
}

describe('App', () => {
  it('renders no figures, events, or analysis without a connector-backed brief', () => {
    const { container } = render(<App />)

    expect(screen.getByText(/no connector-backed brief loaded/i)).toBeInTheDocument()
    expect(container.textContent ?? '').not.toMatch(/NGN|Brent|Eurobond|Oil jumps/i)
  })

  it('renders only verified claims from a supplied BriefDraft', () => {
    render(<App brief={brief()} />)

    expect(screen.getByText(/live brief awaiting QA/i)).toBeInTheDocument()
    expect(screen.getByText(/Synthetic metric/i)).toBeInTheDocument()
    expect(screen.getByText(/Synthetic test figure is available/i)).toBeInTheDocument()
    // the unverified claim in the draft must not be rendered
    expect(screen.queryByText(/Unverified analysis must not be rendered/i)).not.toBeInTheDocument()
  })

  it('shows only corroborated events in the main brief; non-corroborated are segregated', () => {
    render(<App brief={brief()} />)

    const mainEvents = screen.getByRole('region', { name: 'Events' })
    expect(within(mainEvents).getByText(/Corroborated headline/)).toBeInTheDocument()
    expect(within(mainEvents).queryByText(/Single source headline/)).not.toBeInTheDocument()
    expect(within(mainEvents).queryByText(/Unconfirmed headline/)).not.toBeInTheDocument()

    // non-corroborated events are retained only on a clearly-separate watchlist
    const watchlist = screen.getByRole('region', { name: 'Watchlist' })
    expect(within(watchlist).getByText(/Single source headline/)).toBeInTheDocument()
    expect(within(watchlist).getByText(/Unconfirmed headline/)).toBeInTheDocument()
    expect(within(watchlist).queryByText(/Corroborated headline/)).not.toBeInTheDocument()
  })
})
