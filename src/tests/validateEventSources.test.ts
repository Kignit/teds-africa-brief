import { describe, it, expect } from 'vitest'
import { validateEvents } from '../../scripts/validateBriefArtifact'

// A structurally-valid event whose corroboration sub-object can be overridden to exercise the
// optional source-link checks. newsItemIds/sourceIds are the resolution targets.
function mkEvent(corroboration: Record<string, unknown>): Record<string, unknown> {
  return {
    id: 'evt-1',
    title: 'Some headline',
    summary: 'Some summary',
    occurredAt: '2026-06-07T06:00:00.000Z',
    countryCodes: ['NG'],
    topic: '',
    status: 'corroborated',
    corroboration: {
      newsItemIds: ['n1', 'n2'],
      sourceIds: ['src.a', 'src.b'],
      independentSourceCount: 2,
      primarySourceCount: 0,
      ...corroboration,
    },
  }
}

describe('validateEvents - source-article links', () => {
  it('passes when sources is absent (pre-existing artifacts)', () => {
    expect(validateEvents([mkEvent({})])).toEqual([])
  })

  it('passes a well-formed link that resolves to the event ids', () => {
    const issues = validateEvents([
      mkEvent({ sources: [{ newsItemId: 'n1', sourceId: 'src.a', url: 'https://x.test/a' }] }),
    ])
    expect(issues).toEqual([])
  })

  it('fails when sources is present but not an array', () => {
    const issues = validateEvents([mkEvent({ sources: 'nope' })])
    expect(issues.some((i) => i.detail.includes('sources must be an array'))).toBe(true)
  })

  it('fails on a non-http(s) URL', () => {
    const issues = validateEvents([
      mkEvent({ sources: [{ newsItemId: 'n1', sourceId: 'src.a', url: 'ftp://x.test/a' }] }),
    ])
    expect(issues.some((i) => i.rule === 'event_source_link' && i.detail.includes('http'))).toBe(
      true,
    )
  })

  it('fails on a newsItemId not present in corroboration.newsItemIds', () => {
    const issues = validateEvents([
      mkEvent({ sources: [{ newsItemId: 'ghost', sourceId: 'src.a', url: 'https://x.test/a' }] }),
    ])
    expect(issues.some((i) => i.detail.includes('newsItemId'))).toBe(true)
  })

  it('fails on a sourceId not present in corroboration.sourceIds', () => {
    const issues = validateEvents([
      mkEvent({ sources: [{ newsItemId: 'n1', sourceId: 'src.ghost', url: 'https://x.test/a' }] }),
    ])
    expect(issues.some((i) => i.detail.includes('sourceId'))).toBe(true)
  })
})
