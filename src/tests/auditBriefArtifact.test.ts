import { describe, it, expect } from 'vitest'
import {
  buildAuditReport,
  type AuditReport,
  type VerifiedClaimReport,
} from '../../scripts/auditBriefArtifact'

// ---------- fixture helpers ----------
// Minimal-valid building blocks; tests mutate copies to exercise specific defects.
// Synthetic IDs/names only (no live event titles, no real source ids).
function mkEvent(over: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id: 'evt-1',
    title: 'A synthetic headline',
    summary: 'synthetic summary',
    occurredAt: '2026-06-07T06:00:00.000Z',
    countryCodes: ['XX'],
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
    title: 'window headline',
    summary: 'window summary',
    url: 'https://x.test/a',
    publishedAt: '2026-06-07T06:00:00.000Z',
    language: 'en',
    countryCodes: ['XX'],
    ...over,
  }
}
function mkMethodology(
  id: string,
  over: Partial<Record<string, unknown>> = {},
): Record<string, unknown> {
  return {
    id,
    name: 'A methodology name',
    version: '1.0.0',
    description: 'desc',
    kind: 'causal',
    inputs: [],
    bands: [],
    shockType: 'trade_integration_event',
    owner: 'test',
    status: 'approved',
    ...over,
  }
}
function mkProfile(code: string, oilStance: string | null = null): Record<string, unknown> {
  const p: Record<string, unknown> = {
    code,
    name: code,
    externalDebtPctGni: 40,
    evidence: {},
  }
  if (oilStance !== null) p.oilStance = oilStance
  return p
}
function mkClaim(over: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id: 'c1',
    kind: 'causal',
    text: 'XX: synthetic causal claim',
    eventIds: ['evt-1'],
    methodologyIds: ['method.causal.trade_integration_event.v1'],
    figureIds: [],
    profileFields: [],
    profileSourceIds: ['src.a'],
    countryCode: 'XX',
    shockType: 'trade_integration_event',
    tone: 'pos',
    channels: ['trade_balance', 'growth'],
    verified: true,
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
function paths(): { briefPath: string; windowPath: string } {
  return { briefPath: 'fixture-brief.json', windowPath: 'fixture-window.json' }
}

// ---------- happy path ----------
describe('buildAuditReport - clean artifact with one verified claim', () => {
  function cleanArtifact(): { brief: unknown; window: unknown } {
    const event = mkEvent({ id: 'evt-known' })
    const methodology = mkMethodology('method.causal.trade_integration_event.v1')
    const profile = mkProfile('XX', 'exporter')
    const claim = mkClaim({
      id: 'c-known',
      eventIds: ['evt-known'],
      methodologyIds: ['method.causal.trade_integration_event.v1'],
    })
    const brief = mkBrief({
      events: [event],
      methodologies: [methodology],
      profiles: [profile],
      claims: [claim],
    })
    return { brief: mkEnvelope(brief), window: mkWindow([mkWindowItem()]) }
  }

  it('emits zero validator failures and zero warnings', () => {
    const { brief, window } = cleanArtifact()
    const report = buildAuditReport(brief, window, paths())
    expect(report.validator.failures).toBe(0)
    expect(report.validator.warnings).toBe(0)
    expect(report.validator.issues).toEqual([])
  })

  it('reports counts (figures, events, corroborated, claims, verified, profiles, methodologies, window items)', () => {
    const { brief, window } = cleanArtifact()
    const report = buildAuditReport(brief, window, paths())
    expect(report.counts).toEqual({
      figures: 0,
      events: 1,
      corroboratedEvents: 1,
      claims: 1,
      verifiedClaims: 1,
      profiles: 1,
      methodologies: 1,
      windowItems: 1,
      sourceLinks: 0,
    })
  })

  it('counts source-article links and stays clean when they are well-formed', () => {
    const event = mkEvent({
      id: 'evt-known',
      corroboration: {
        newsItemIds: ['n1', 'n2'],
        sourceIds: ['src.a', 'src.b'],
        independentSourceCount: 2,
        primarySourceCount: 0,
        sources: [
          { newsItemId: 'n1', sourceId: 'src.a', url: 'https://x.test/a' },
          { newsItemId: 'n2', sourceId: 'src.b', url: 'https://x.test/b' },
        ],
      },
    })
    const brief = mkBrief({
      events: [event],
      methodologies: [mkMethodology('method.causal.trade_integration_event.v1')],
      profiles: [mkProfile('XX', 'exporter')],
      claims: [
        mkClaim({
          id: 'c-known',
          eventIds: ['evt-known'],
          methodologyIds: ['method.causal.trade_integration_event.v1'],
        }),
      ],
    })
    const report = buildAuditReport(mkEnvelope(brief), mkWindow([mkWindowItem()]), paths())
    expect(report.counts.sourceLinks).toBe(2)
    expect(report.validator.failures).toBe(0)
  })

  it('surfaces a malformed source-link URL as a validator failure in the audit', () => {
    const event = mkEvent({
      corroboration: {
        newsItemIds: ['n1'],
        sourceIds: ['src.a'],
        independentSourceCount: 2,
        primarySourceCount: 0,
        sources: [{ newsItemId: 'n1', sourceId: 'src.a', url: 'not-a-url' }],
      },
    })
    const report = buildAuditReport(mkEnvelope(mkBrief({ events: [event] })), mkWindow([]), paths())
    expect(report.validator.failures).toBeGreaterThan(0)
    expect(report.validator.issues.some((i) => i.rule === 'event_source_link')).toBe(true)
  })

  it('reports oilStance labels straight from the artifact profiles (no hardcoded countries)', () => {
    const brief = mkBrief({
      profiles: [
        mkProfile('NG', 'exporter'),
        mkProfile('KE', 'importer'),
        mkProfile('GH', 'neutral'),
        mkProfile('XX', null), // profile present but no oilStance
      ],
    })
    const report = buildAuditReport(mkEnvelope(brief), mkWindow([]), paths())
    // Sorted by countryCode for deterministic ordering.
    expect(report.oilStance).toEqual([
      { countryCode: 'GH', oilStance: 'neutral' },
      { countryCode: 'KE', oilStance: 'importer' },
      { countryCode: 'NG', oilStance: 'exporter' },
      { countryCode: 'XX', oilStance: null },
    ])
  })

  it('resolves each verified claim event / methodology / source / figure provenance', () => {
    const { brief, window } = cleanArtifact()
    const report = buildAuditReport(brief, window, paths())
    expect(report.verifiedClaims).toHaveLength(1)
    const c = report.verifiedClaims[0]
    expect(c.id).toBe('c-known')
    expect(c.countryCode).toBe('XX')
    expect(c.shockType).toBe('trade_integration_event')
    expect(c.text).toMatch(/synthetic causal claim/)
    expect(c.events).toEqual([
      {
        id: 'evt-known',
        resolved: true,
        title: 'A synthetic headline',
        status: 'corroborated',
        sourceIds: ['src.a', 'src.b'],
        newsItemIds: ['n1', 'n2'],
      },
    ])
    expect(c.methodologies).toEqual([
      {
        id: 'method.causal.trade_integration_event.v1',
        resolved: true,
        name: 'A methodology name',
        status: 'approved',
        shockType: 'trade_integration_event',
      },
    ])
    expect(c.profileSourceIds).toEqual(['src.a'])
    expect(c.figures).toEqual([])
    expect(c.unresolvedRefs).toEqual({ events: [], methodologies: [], figures: [] })
  })
})

// ---------- exit-code paths driven by reused validator ----------
describe('exit code is driven by the reused validator', () => {
  it('returns failures > 0 when an event title contains a decodable named entity (&amp;)', () => {
    // Validator's entity_residue_full rule fires - exit code 1 via CLI main().
    const brief = mkBrief({
      events: [mkEvent({ id: 'e1', title: 'Tom &amp; Jerry sign deal' })],
    })
    const report = buildAuditReport(mkEnvelope(brief), mkWindow([]), paths())
    expect(report.validator.failures).toBeGreaterThan(0)
    expect(report.validator.issues.some((i) => i.rule === 'entity_residue_full')).toBe(true)
  })

  it('returns failures === 0 for warning-only unrecoverable fragments (e.g. "[&#823")', () => {
    // Validator's entity_residue_fragment is a WARNING, not a failure - exit 0.
    const brief = mkBrief({
      events: [mkEvent({ id: 'e1', summary: 'see [&#823 in upstream feed' })],
    })
    const report = buildAuditReport(mkEnvelope(brief), mkWindow([]), paths())
    expect(report.validator.failures).toBe(0)
    expect(report.validator.warnings).toBeGreaterThan(0)
    expect(report.validator.issues.every((i) => i.category === 'warning')).toBe(true)
  })
})

// ---------- unresolved-ref surfacing ----------
describe('unresolved provenance refs are surfaced per claim', () => {
  it('flags an unresolved eventId on a verified claim', () => {
    const brief = mkBrief({
      claims: [
        mkClaim({
          id: 'c-bad-event',
          eventIds: ['evt-missing'],
          methodologyIds: ['method.causal.trade_integration_event.v1'],
        }),
      ],
      methodologies: [mkMethodology('method.causal.trade_integration_event.v1')],
      profiles: [mkProfile('XX')],
    })
    const report = buildAuditReport(mkEnvelope(brief), mkWindow([]), paths())
    const c = report.verifiedClaims.find((x: VerifiedClaimReport) => x.id === 'c-bad-event')
    expect(c).toBeDefined()
    expect(c!.unresolvedRefs.events).toEqual(['evt-missing'])
    expect(c!.events).toEqual([{ id: 'evt-missing', resolved: false }])
    // Validator also fails for cross-ref integrity - this drives exit 1 from main().
    expect(report.validator.issues.some((i) => i.rule === 'claim_event_unresolved')).toBe(true)
    expect(report.validator.failures).toBeGreaterThan(0)
  })

  it('flags an unresolved methodologyId on a verified claim', () => {
    const brief = mkBrief({
      events: [mkEvent({ id: 'evt-known' })],
      claims: [
        mkClaim({
          id: 'c-bad-method',
          eventIds: ['evt-known'],
          methodologyIds: ['method.missing.v1'],
        }),
      ],
      profiles: [mkProfile('XX')],
    })
    const report = buildAuditReport(mkEnvelope(brief), mkWindow([]), paths())
    const c = report.verifiedClaims.find((x: VerifiedClaimReport) => x.id === 'c-bad-method')
    expect(c).toBeDefined()
    expect(c!.unresolvedRefs.methodologies).toEqual(['method.missing.v1'])
    expect(report.validator.issues.some((i) => i.rule === 'claim_methodology_unresolved')).toBe(
      true,
    )
  })

  it('flags an unresolved figureId on a verified figure claim', () => {
    const brief = mkBrief({
      events: [mkEvent({ id: 'evt-known' })],
      methodologies: [mkMethodology('method.causal.trade_integration_event.v1')],
      claims: [
        mkClaim({
          id: 'c-bad-fig',
          kind: 'figure',
          eventIds: [],
          methodologyIds: [],
          figureIds: ['fig-missing'],
        }),
      ],
    })
    const report = buildAuditReport(mkEnvelope(brief), mkWindow([]), paths())
    const c = report.verifiedClaims.find((x: VerifiedClaimReport) => x.id === 'c-bad-fig')
    expect(c).toBeDefined()
    expect(c!.figures).toEqual([{ id: 'fig-missing', resolved: false }])
    expect(c!.unresolvedRefs.figures).toEqual(['fig-missing'])
  })
})

// ---------- determinism ----------
describe('deterministic report shape', () => {
  it('produces byte-identical JSON across runs for the same input', () => {
    // Two independent builds of the same fixture must serialize identically. Key
    // ordering inside objects is preserved by JSON.stringify's insertion order; all
    // arrays in the report are sorted (by id / countryCode / source-id) before output.
    const brief = mkBrief({
      events: [mkEvent({ id: 'evt-z' }), mkEvent({ id: 'evt-a' })],
      methodologies: [mkMethodology('method.zzz.v1'), mkMethodology('method.aaa.v1')],
      profiles: [
        mkProfile('ZA', 'importer'),
        mkProfile('GH', 'neutral'),
        mkProfile('NG', 'exporter'),
      ],
      claims: [
        mkClaim({
          id: 'claim-z',
          eventIds: ['evt-z', 'evt-a'],
          methodologyIds: ['method.zzz.v1', 'method.aaa.v1'],
          profileSourceIds: ['src.b', 'src.a'],
        }),
        mkClaim({
          id: 'claim-a',
          eventIds: ['evt-a'],
          methodologyIds: ['method.aaa.v1'],
        }),
      ],
    })
    const r1 = buildAuditReport(mkEnvelope(brief), mkWindow([]), paths())
    const r2 = buildAuditReport(mkEnvelope(brief), mkWindow([]), paths())
    expect(JSON.stringify(r1, null, 2)).toBe(JSON.stringify(r2, null, 2))

    // Cross-cutting determinism checks: per-claim arrays are sorted; verifiedClaims sorted;
    // oilStance sorted.
    expect(r1.verifiedClaims.map((c: VerifiedClaimReport) => c.id)).toEqual(['claim-a', 'claim-z'])
    const claimZ = r1.verifiedClaims.find((c: VerifiedClaimReport) => c.id === 'claim-z')!
    expect(claimZ.events.map((e) => e.id)).toEqual(['evt-a', 'evt-z'])
    expect(claimZ.methodologies.map((m) => m.id)).toEqual(['method.aaa.v1', 'method.zzz.v1'])
    expect(claimZ.profileSourceIds).toEqual(['src.a', 'src.b']) // sorted
    expect(r1.oilStance.map((o: { countryCode: string }) => o.countryCode)).toEqual([
      'GH',
      'NG',
      'ZA',
    ])
  })
})

// ---------- report shape sanity ----------
describe('top-level report shape', () => {
  it('carries the artifact paths from the caller (no resolution side-effects)', () => {
    const report = buildAuditReport(mkEnvelope(mkBrief()), mkWindow([]), {
      briefPath: '/abs/path/to/brief.json',
      windowPath: '/abs/path/to/window.json',
    })
    expect(report.artifact).toEqual({
      briefPath: '/abs/path/to/brief.json',
      windowPath: '/abs/path/to/window.json',
    })
  })

  it('exposes generatedAt verbatim from the envelope', () => {
    const report = buildAuditReport(mkEnvelope(mkBrief()), mkWindow([]), paths())
    expect(report.generatedAt).toBe('2026-06-07T08:00:00.000Z')
  })

  it('returns generatedAt: null when the envelope lacks one (and the validator flags it)', () => {
    const report = buildAuditReport({ brief: mkBrief() }, mkWindow([]), paths())
    expect(report.generatedAt).toBe(null)
    expect(report.validator.issues.some((i) => i.rule === 'envelope_generated_at')).toBe(true)
  })

  // Sanity: the AuditReport keys are exactly the documented set (no accidental fields).
  it('has the documented top-level key set', () => {
    const report: AuditReport = buildAuditReport(mkEnvelope(mkBrief()), mkWindow([]), paths())
    expect(Object.keys(report).sort()).toEqual([
      'artifact',
      'counts',
      'generatedAt',
      'oilStance',
      'validator',
      'verifiedClaims',
    ])
  })
})
