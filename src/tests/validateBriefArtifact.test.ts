import { describe, it, expect } from 'vitest'
import {
  validateArtifact,
  validateEnvelope,
  validateBriefShape,
  validateEvents,
  validateClaimReferences,
  validateSections,
  validateWindowStore,
  scanEntityResidue,
  scanAllPublicText,
  summarise,
  formatReport,
  type Issue,
} from '../../scripts/validateBriefArtifact'

// ---------- fixture helpers ----------
// Minimal-valid building blocks; tests mutate copies to exercise specific defects.
function mkEvent(over: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
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
    },
    ...over,
  }
}
function mkWindowItem(over: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id: 'src.foo:abc',
    sourceId: 'src.foo',
    title: 'A clean headline',
    summary: 'A clean summary',
    url: 'https://x.test/a',
    publishedAt: '2026-06-07T06:00:00.000Z',
    language: 'en',
    countryCodes: ['NG'],
    ...over,
  }
}
function mkBrief(over: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id: 'brief-1',
    date: '2026-06-07',
    edition: 'daily',
    status: 'published',
    dataMode: 'live',
    sections: [],
    claims: [],
    figures: [],
    events: [],
    profiles: [],
    methodologies: [],
    ...over,
  }
}
function mkEnvelope(brief: unknown): unknown {
  return { generatedAt: '2026-06-07T08:00:00.000Z', brief }
}
function mkWindow(items: unknown[]): unknown {
  return { updatedAt: '2026-06-07T08:00:00.000Z', windowMs: 259200000, items }
}
const ofRule =
  (rule: string) =>
  (i: Issue): boolean =>
    i.rule === rule

// ---------- happy path ----------
describe('validateArtifact - clean fixture', () => {
  it('reports zero issues for a minimal well-formed brief + empty window', () => {
    const issues = validateArtifact(mkEnvelope(mkBrief()), mkWindow([]))
    expect(issues).toEqual([])
    expect(summarise(issues).exitCode).toBe(0)
  })
})

// ---------- envelope + shape failures ----------
describe('envelope failures', () => {
  it('flags a non-object envelope', () => {
    const { issues } = validateEnvelope('not an object')
    expect(issues.some(ofRule('envelope_shape'))).toBe(true)
  })
  it('flags an invalid generatedAt', () => {
    const { issues } = validateEnvelope({ generatedAt: 'not-a-date', brief: {} })
    expect(issues.some(ofRule('envelope_generated_at'))).toBe(true)
  })
  it('flags a missing brief field', () => {
    const { issues } = validateEnvelope({ generatedAt: '2026-06-07T08:00:00.000Z' })
    expect(issues.some(ofRule('envelope_shape'))).toBe(true)
  })
})

describe('brief shape failures', () => {
  it('flags wrong edition / status / dataMode', () => {
    const issues = validateBriefShape({
      ...mkBrief(),
      edition: 'monthly',
      status: 'unknown',
      dataMode: 'mock',
    })
    expect(issues.filter(ofRule('brief_shape')).length).toBeGreaterThanOrEqual(3)
  })
  it('flags missing collections (events, claims, ...)', () => {
    const broken = { ...mkBrief() }
    delete (broken as Record<string, unknown>).events
    const issues = validateBriefShape(broken)
    expect(issues.some((i) => i.detail.includes('brief.events'))).toBe(true)
  })
})

// ---------- per-collection shape failures ----------
describe('events / window items', () => {
  it('flags an event missing corroboration sub-fields', () => {
    const issues = validateEvents([
      mkEvent({ corroboration: { newsItemIds: [], sourceIds: 'not-array' } }),
    ])
    expect(issues.some((i) => i.detail.includes('sourceIds'))).toBe(true)
    expect(issues.some((i) => i.detail.includes('independentSourceCount'))).toBe(true)
  })
  it('flags an event with invalid status / occurredAt', () => {
    const issues = validateEvents([mkEvent({ status: 'rumour', occurredAt: 'tomorrow' })])
    expect(issues.some((i) => i.detail.includes('status'))).toBe(true)
    expect(issues.some((i) => i.detail.includes('occurredAt'))).toBe(true)
  })
  it('flags a window item missing required source-backed fields', () => {
    const issues = validateWindowStore(
      mkWindow([
        // no sourceId, no url
        { id: 'x', title: 'y', publishedAt: '2026-06-07T06:00:00.000Z' },
      ]),
    )
    expect(issues.some((i) => i.detail.includes('sourceId'))).toBe(true)
    expect(issues.some((i) => i.detail.includes('url'))).toBe(true)
  })
})

// ---------- claim cross-references ----------
// Build the exact shape validateClaimReferences accepts (5 unknown[] collections), so
// tests can mutate just the claims while keeping the resolvable refs constant.
function mkClaimRefInput(claims: unknown[]): {
  claims: unknown[]
  events: unknown[]
  figures: unknown[]
  methodologies: unknown[]
  profiles: unknown[]
} {
  return {
    claims,
    events: [mkEvent({ id: 'evt-known' })],
    figures: [{ id: 'fig-known', status: 'verified' }],
    methodologies: [{ id: 'method.known.v1', status: 'approved' }],
    profiles: [{ code: 'NG' }],
  }
}

describe('claim cross-references', () => {
  it('flags a claim citing an unknown eventId', () => {
    const issues = validateClaimReferences(
      mkClaimRefInput([
        {
          id: 'c1',
          kind: 'causal',
          eventIds: ['evt-missing'],
          methodologyIds: [],
          figureIds: [],
          verified: true,
          countryCode: 'NG',
        },
      ]),
    )
    expect(issues.some(ofRule('claim_event_unresolved'))).toBe(true)
  })

  it('flags a claim citing an unknown methodologyId', () => {
    const issues = validateClaimReferences(
      mkClaimRefInput([
        {
          id: 'c2',
          kind: 'causal',
          eventIds: ['evt-known'],
          methodologyIds: ['method.missing.v1'],
          figureIds: [],
          verified: true,
          countryCode: 'NG',
        },
      ]),
    )
    expect(issues.some(ofRule('claim_methodology_unresolved'))).toBe(true)
  })

  it('flags a verified claim whose figure / country does not resolve', () => {
    const issues = validateClaimReferences(
      mkClaimRefInput([
        {
          id: 'c3',
          kind: 'figure',
          eventIds: [],
          methodologyIds: [],
          figureIds: ['fig-missing'],
          verified: true,
          countryCode: 'XX',
        },
      ]),
    )
    expect(issues.some(ofRule('claim_figure_unresolved'))).toBe(true)
    expect(issues.some(ofRule('claim_country_unresolved'))).toBe(true)
  })

  it('flags a verified claim with no figure or event backing', () => {
    const issues = validateClaimReferences(
      mkClaimRefInput([
        {
          id: 'c4',
          kind: 'causal',
          eventIds: [],
          methodologyIds: [],
          figureIds: [],
          verified: true,
        },
      ]),
    )
    expect(issues.some(ofRule('claim_unbacked'))).toBe(true)
  })

  it('does NOT flag an unverified (draft) claim with unresolved provenance', () => {
    const issues = validateClaimReferences(
      mkClaimRefInput([
        {
          id: 'c5',
          kind: 'causal',
          eventIds: ['evt-missing'],
          methodologyIds: [],
          figureIds: ['fig-missing'],
          verified: false,
        },
      ]),
    )
    // claim_event_unresolved fires (it is a structural integrity check, not a verify check),
    // but figure / country / unbacked checks only apply to verified=true claims.
    expect(issues.some(ofRule('claim_figure_unresolved'))).toBe(false)
    expect(issues.some(ofRule('claim_unbacked'))).toBe(false)
  })
})

// ---------- entity residue ----------
describe('scanEntityResidue - failures', () => {
  it('flags any well-formed decimal/hex entity with ";" as a failure', () => {
    const fails1 = scanEntityResidue('event.title', 'evt-x', 'budget &#8211; ministry')
    expect(fails1.some(ofRule('entity_residue_full'))).toBe(true)
    const fails2 = scanEntityResidue('event.title', 'evt-x', 'dash &#x2013; here')
    expect(fails2.some(ofRule('entity_residue_full'))).toBe(true)
  })

  it('flags decoder-known named entities with ";" as a failure', () => {
    const fails = scanEntityResidue('event.title', 'evt-x', 'Tom &amp; Jerry and &hellip;')
    expect(fails.filter(ofRule('entity_residue_full')).length).toBe(2)
  })

  it('flags allowlisted decimal WITHOUT ";" as a failure (leniency should have decoded)', () => {
    const fails = scanEntityResidue('event.summary', 'evt-x', '[&#8230 here and &#8217s plan')
    expect(fails.every(ofRule('entity_residue_allowlist_no_semi'))).toBe(true)
    expect(fails.length).toBe(2)
  })
})

describe('scanEntityResidue - warnings (deliberate residue, not regressions)', () => {
  it('flags unrecoverable numeric fragments like [&# and [&#823 as WARNINGS', () => {
    const w1 = scanEntityResidue('event.summary', 'evt-x', 'see [&# here')
    expect(w1.every((i) => i.category === 'warning')).toBe(true)
    expect(w1.some(ofRule('entity_residue_fragment'))).toBe(true)
    const w2 = scanEntityResidue('event.summary', 'evt-x', 'see [&#823 here')
    expect(w2.every((i) => i.category === 'warning')).toBe(true)
    expect(w2.some(ofRule('entity_residue_fragment'))).toBe(true)
  })

  it('flags non-allowlisted decimal WITHOUT ";" (e.g. "&#1234") as a WARNING', () => {
    const w = scanEntityResidue('event.summary', 'evt-x', 'an &#1234 thing')
    expect(w.every((i) => i.category === 'warning')).toBe(true)
  })

  it('flags hex WITHOUT ";" as a WARNING (decoder leaves it literal on purpose)', () => {
    const w = scanEntityResidue('event.summary', 'evt-x', 'a &#x2013 dash')
    expect(w.every((i) => i.category === 'warning')).toBe(true)
  })

  it('does NOT double-count a hex fragment as both numeric AND hex', () => {
    // Without the negative-lookahead carve-out, "&#x2013" would fire BOTH the numeric and
    // hex no-semi scanners. Assert exactly one warning emitted.
    const w = scanEntityResidue('event.summary', 'evt-x', '&#x2013 only')
    expect(w.length).toBe(1)
  })
})

describe('scanEntityResidue - ignored (decoder leaves alone on purpose)', () => {
  it('does NOT flag plain text or bare ampersands', () => {
    expect(scanEntityResidue('event.title', 'evt-x', 'AT&T and R&D')).toEqual([])
    expect(scanEntityResidue('event.title', 'evt-x', 'plain text')).toEqual([])
    expect(scanEntityResidue('event.title', 'evt-x', 'no entities here at all')).toEqual([])
  })

  it('does NOT flag unknown named entities like &foobar; (decoder leaves them intact)', () => {
    expect(scanEntityResidue('event.title', 'evt-x', 'keep &foobar; intact')).toEqual([])
  })
})

// ---------- composition + end-to-end happy/error paths ----------
describe('end-to-end validation against composed fixtures', () => {
  it('clean artifact + clean window -> 0 failures, 0 warnings, exit 0', () => {
    const issues = validateArtifact(
      mkEnvelope(
        mkBrief({
          events: [mkEvent({ id: 'evt-1' })],
          claims: [
            {
              id: 'c1',
              kind: 'event',
              text: 'Some headline',
              eventIds: ['evt-1'],
              methodologyIds: [],
              figureIds: [],
              profileFields: [],
              profileSourceIds: [],
              verified: true,
            },
          ],
        }),
      ),
      mkWindow([mkWindowItem()]),
    )
    expect(summarise(issues).failures).toEqual([])
    expect(summarise(issues).warnings).toEqual([])
    expect(summarise(issues).exitCode).toBe(0)
  })

  it('one decoder regression + one unrecoverable fragment -> 1 failure, 1 warning, exit 1', () => {
    const issues = validateArtifact(
      mkEnvelope(
        mkBrief({
          events: [mkEvent({ id: 'evt-1', summary: 'budget &#8211; ministry' })],
          claims: [],
        }),
      ),
      mkWindow([mkWindowItem({ summary: 'see [&#823 here' })]),
    )
    const s = summarise(issues)
    expect(s.failures.length).toBe(1)
    expect(s.warnings.length).toBe(1)
    expect(s.exitCode).toBe(1)
  })

  it('formatReport emits ASCII-only lines that include PASS/FAIL', () => {
    const issues = validateArtifact(mkEnvelope(mkBrief()), mkWindow([]))
    const report = formatReport(
      'a.json',
      'b.json',
      { events: 0, claims: 0, windowItems: 0 },
      summarise(issues),
    )
    expect(report).toContain('PASS')
    // ASCII guard: no characters above 0x7f
    // eslint-disable-next-line no-control-regex
    expect(/[^\x00-\x7f]/.test(report)).toBe(false)
  })

  it('scanAllPublicText scopes scans to events / claims / sections / methodologies / window', () => {
    // Each scope name should appear at most once for a single bad text in each field.
    const issues = scanAllPublicText(
      {
        events: [mkEvent({ id: 'e1', title: 'bad &amp; title', summary: 'good summary' })],
        claims: [{ id: 'c1', text: 'bad &#8217 text', verified: true, eventIds: [] }],
        sections: [
          {
            id: 's1',
            kicker: 'k',
            title: 'bad &amp; section title',
            body: 'good body',
            claimIds: [],
          },
        ],
        methodologies: [
          { id: 'm1', name: 'Bad &amp; Method', description: 'd', mechanism: '&hellip;' },
        ],
      },
      [mkWindowItem({ id: 'w1', title: 'good', summary: '&hellip; bad summary' })],
    )
    expect(issues.some((i) => i.detail.startsWith('event.title'))).toBe(true)
    expect(issues.some((i) => i.detail.startsWith('claim.text'))).toBe(true)
    expect(issues.some((i) => i.detail.startsWith('window.summary'))).toBe(true)
    expect(issues.some((i) => i.detail.startsWith('section.title'))).toBe(true)
    expect(issues.some((i) => i.detail.startsWith('methodology.name'))).toBe(true)
    expect(issues.some((i) => i.detail.startsWith('methodology.mechanism'))).toBe(true)
  })
})

// ---------- sections + methodologies (Codex follow-up) ----------
describe('validateSections - direct unit checks', () => {
  it('passes a well-formed section with a resolvable claimId', () => {
    expect(
      validateSections(
        [{ id: 's1', kicker: 'k', title: 't', body: 'b', claimIds: ['c1'] }],
        new Set(['c1']),
      ),
    ).toEqual([])
  })

  it('flags missing/typed fields independently of cross-refs', () => {
    const issues = validateSections([{ id: 's1', kicker: 'k' }], new Set())
    expect(issues.some((i) => i.detail.includes('title'))).toBe(true)
    expect(issues.some((i) => i.detail.includes('body'))).toBe(true)
    expect(issues.some((i) => i.detail.includes('claimIds'))).toBe(true)
  })

  it('flags an unresolved claimId even when the shape is otherwise valid', () => {
    const issues = validateSections(
      [{ id: 's1', kicker: 'k', title: 't', body: 'b', claimIds: ['missing'] }],
      new Set(['c1']), // 'missing' is not in here
    )
    expect(issues.some((i) => i.rule === 'section_claim_unresolved')).toBe(true)
  })
})

describe('sections - shape + claim-reference resolution', () => {
  it('flags malformed section shape (missing kicker / body / wrong claimIds type)', () => {
    const issues = validateArtifact(
      mkEnvelope(
        mkBrief({
          sections: [
            // missing kicker, body not a string, claimIds not an array
            { id: 's1', title: 't', kicker: undefined, body: 5, claimIds: 'nope' },
          ],
        }),
      ),
      mkWindow([]),
    )
    const fails = summarise(issues).failures
    expect(fails.some((i) => i.rule === 'section_shape' && i.detail.includes('kicker'))).toBe(true)
    expect(fails.some((i) => i.rule === 'section_shape' && i.detail.includes('body'))).toBe(true)
    expect(fails.some((i) => i.rule === 'section_shape' && i.detail.includes('claimIds'))).toBe(
      true,
    )
  })

  it('flags a section claimId that does not resolve to a carried claim', () => {
    const issues = validateArtifact(
      mkEnvelope(
        mkBrief({
          claims: [],
          sections: [{ id: 's1', kicker: 'k', title: 't', body: 'b', claimIds: ['missing'] }],
        }),
      ),
      mkWindow([]),
    )
    const fails = summarise(issues).failures
    expect(fails.some((i) => i.rule === 'section_claim_unresolved')).toBe(true)
    expect(summarise(issues).exitCode).toBe(1)
  })

  it('accepts a section whose claimId resolves to a carried claim', () => {
    const issues = validateArtifact(
      mkEnvelope(
        mkBrief({
          claims: [
            {
              id: 'c1',
              kind: 'event',
              text: 'ok',
              eventIds: ['evt-1'],
              methodologyIds: [],
              figureIds: [],
              verified: true,
            },
          ],
          events: [mkEvent({ id: 'evt-1' })],
          sections: [{ id: 's1', kicker: 'k', title: 't', body: 'b', claimIds: ['c1'] }],
        }),
      ),
      mkWindow([]),
    )
    expect(summarise(issues).failures.filter((i) => i.rule === 'section_claim_unresolved')).toEqual(
      [],
    )
    expect(summarise(issues).failures.filter((i) => i.rule === 'section_shape')).toEqual([])
  })
})

describe('section / methodology text residue', () => {
  it('flags section text containing decoder-known entities (kicker / title / body)', () => {
    const issues = validateArtifact(
      mkEnvelope(
        mkBrief({
          sections: [
            {
              id: 's1',
              kicker: 'Tom &amp; Jerry',
              title: 'a &#8217; b',
              body: 'c &hellip; d',
              claimIds: [],
            },
          ],
        }),
      ),
      mkWindow([]),
    )
    const fails = summarise(issues).failures
    expect(
      fails.some((i) => i.rule === 'entity_residue_full' && i.detail.startsWith('section.kicker')),
    ).toBe(true)
    expect(
      fails.some((i) => i.rule === 'entity_residue_full' && i.detail.startsWith('section.title')),
    ).toBe(true)
    expect(
      fails.some((i) => i.rule === 'entity_residue_full' && i.detail.startsWith('section.body')),
    ).toBe(true)
  })

  it('flags methodology display text (name / description / mechanism) containing entities', () => {
    const issues = validateArtifact(
      mkEnvelope(
        mkBrief({
          methodologies: [
            {
              id: 'method.x.v1',
              name: 'Bad &amp; Method',
              description: 'desc &#8211; here',
              mechanism: 'm &hellip; ok',
            },
          ],
        }),
      ),
      mkWindow([]),
    )
    const fails = summarise(issues).failures
    expect(
      fails.some(
        (i) => i.rule === 'entity_residue_full' && i.detail.startsWith('methodology.name'),
      ),
    ).toBe(true)
    expect(
      fails.some(
        (i) => i.rule === 'entity_residue_full' && i.detail.startsWith('methodology.description'),
      ),
    ).toBe(true)
    expect(
      fails.some(
        (i) => i.rule === 'entity_residue_full' && i.detail.startsWith('methodology.mechanism'),
      ),
    ).toBe(true)
  })

  it('does NOT scan methodology.mechanism when absent (mechanism is optional on banding rules)', () => {
    const issues = validateArtifact(
      mkEnvelope(
        mkBrief({
          methodologies: [{ id: 'method.x.v1', name: 'Clean Name', description: 'clean desc' }],
        }),
      ),
      mkWindow([]),
    )
    expect(summarise(issues).failures).toEqual([])
  })

  // The full Codex regression: all three defects from the review thread, in one artifact.
  it('rejects the Codex regression artifact (section text + missing claim + methodology name)', () => {
    const issues = validateArtifact(
      mkEnvelope(
        mkBrief({
          claims: [],
          sections: [
            { id: 's1', kicker: 'k', title: 'T &amp; T', body: 'b', claimIds: ['missing'] },
          ],
          methodologies: [{ id: 'method.x.v1', name: 'Bad &amp; Method', description: 'd' }],
        }),
      ),
      mkWindow([]),
    )
    const fails = summarise(issues).failures
    expect(
      fails.some((i) => i.rule === 'entity_residue_full' && i.detail.startsWith('section.title')),
    ).toBe(true)
    expect(fails.some((i) => i.rule === 'section_claim_unresolved')).toBe(true)
    expect(
      fails.some(
        (i) => i.rule === 'entity_residue_full' && i.detail.startsWith('methodology.name'),
      ),
    ).toBe(true)
    expect(summarise(issues).exitCode).toBe(1)
  })
})
