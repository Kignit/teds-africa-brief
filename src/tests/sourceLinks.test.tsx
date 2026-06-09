import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import App from '../app/App'
import { SourceLinks } from '../components/SourceLinks'
import type { BriefDraft } from '../domain/brief'
import type { Event } from '../domain/event'

const ARTICLE = 'https://news.test/world-bank-article'

// A corroborated event whose first source carries a real article URL and whose second source
// carries none (so the UI must link one and render the other as text). Source ids are real
// registry ids so sourceName resolves to readable names.
function eventWithLink(): Event {
  return {
    id: 'evt-corr',
    title: 'Naira firms after the central bank clears its FX backlog',
    summary: 'evidence summary',
    occurredAt: '2026-05-29T06:00:00.000Z',
    countryCodes: ['NG'],
    topic: '',
    status: 'corroborated',
    corroboration: {
      newsItemIds: ['n1', 'n2'],
      sourceIds: ['src.worldbank', 'src.open_er_api'],
      independentSourceCount: 2,
      primarySourceCount: 0,
      sources: [{ newsItemId: 'n1', sourceId: 'src.worldbank', url: ARTICLE }],
    },
  }
}

function brief(): BriefDraft {
  return {
    id: 'b',
    date: '2026-05-29',
    edition: 'daily',
    status: 'draft',
    dataMode: 'live',
    sections: [],
    figures: [],
    profiles: [],
    methodologies: [],
    events: [eventWithLink()],
    claims: [
      {
        id: 'claim-1',
        kind: 'causal',
        text: 'NG: a verified claim citing the event',
        figureIds: [],
        eventIds: ['evt-corr'],
        profileFields: [],
        profileSourceIds: ['src.oec'], // a profile/data source -> never linked
        methodologyIds: [],
        verified: true,
      },
    ],
  }
}

describe('source-article links in the UI', () => {
  it('renders an event source with a URL as a link, and a source without a URL as text', () => {
    render(<App brief={brief()} />)
    const events = screen.getByRole('region', { name: 'Events' })

    const link = within(events).getByRole('link', { name: /World Bank Open Data/i })
    expect(link).toHaveAttribute('href', ARTICLE)
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'))

    // the second event source has no URL -> plain text, not a link
    expect(within(events).queryByRole('link', { name: /er-api/i })).not.toBeInTheDocument()
    expect(within(events).getByText(/er-api/i)).toBeInTheDocument()
  })

  it('links a claim source only when it comes from a cited event link; profile sources stay text', () => {
    render(<App brief={brief()} />)
    const claims = screen.getByRole('region', { name: 'Claims' })

    expect(within(claims).getByRole('link', { name: /World Bank Open Data/i })).toHaveAttribute(
      'href',
      ARTICLE,
    )

    expect(
      within(claims).queryByRole('link', { name: /Observatory of Economic Complexity/i }),
    ).not.toBeInTheDocument()
    expect(within(claims).getByText(/Observatory of Economic Complexity/i)).toBeInTheDocument()
  })

  it('event card: a malformed source link does not block a later valid link for the same source', () => {
    const ev: Event = {
      id: 'evt-corr',
      title: 'Event whose source link is repaired by a later valid URL',
      summary: 'evidence',
      occurredAt: '2026-05-29T06:00:00.000Z',
      countryCodes: ['NG'],
      topic: '',
      status: 'corroborated',
      corroboration: {
        newsItemIds: ['n1', 'n2'],
        sourceIds: ['src.worldbank'],
        independentSourceCount: 2,
        primarySourceCount: 0,
        sources: [
          { newsItemId: 'n1', sourceId: 'src.worldbank', url: 'not-a-url' },
          { newsItemId: 'n2', sourceId: 'src.worldbank', url: 'https://valid.test/late' },
        ],
      },
    }
    const b: BriefDraft = {
      id: 'b',
      date: '2026-05-29',
      edition: 'daily',
      status: 'draft',
      dataMode: 'live',
      sections: [],
      figures: [],
      profiles: [],
      methodologies: [],
      claims: [],
      events: [ev],
    }
    render(<App brief={b} />)
    const events = screen.getByRole('region', { name: 'Events' })
    const link = within(events).getByRole('link', { name: /World Bank Open Data/i })
    expect(link).toHaveAttribute('href', 'https://valid.test/late')
  })
})

describe('SourceLinks - first valid URL wins on duplicate sourceId', () => {
  it('uses a later valid URL when an earlier ref for the same source is invalid', () => {
    render(
      <SourceLinks
        sources={[
          { sourceId: 'src.worldbank', url: 'not-a-url' },
          { sourceId: 'src.worldbank', url: 'https://valid.test/article' },
        ]}
      />,
    )
    const links = screen.getAllByRole('link')
    expect(links).toHaveLength(1)
    expect(links[0]).toHaveAttribute('href', 'https://valid.test/article')
    expect(links[0]).toHaveTextContent('World Bank Open Data')
  })

  it('keeps the first valid URL when two refs for the same source are both valid', () => {
    render(
      <SourceLinks
        sources={[
          { sourceId: 'src.worldbank', url: 'https://first.test/a' },
          { sourceId: 'src.worldbank', url: 'https://second.test/b' },
        ]}
      />,
    )
    const links = screen.getAllByRole('link')
    expect(links).toHaveLength(1)
    expect(links[0]).toHaveAttribute('href', 'https://first.test/a')
  })
})
