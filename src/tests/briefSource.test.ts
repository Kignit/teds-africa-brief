import { describe, it, expect } from 'vitest'
import { loadBrief } from '../app/briefSource'
import { composeDeterministicBrief } from '../server/analysis/buildBrief'
import { validateFigures } from '../server/verification/validateFigure'
import { serializeArtifact } from '../server/runtime/produceBrief'
import type { BriefDraft } from '../domain/brief'

const ASOF = '2026-05-29T06:00:00.000Z'

// Fixed clock + timestamps for the freshness (TTL = 36h) checks.
const NOW_MS = Date.parse('2026-06-02T12:00:00.000Z')
const now = () => NOW_MS
const FRESH = '2026-06-02T06:00:00.000Z' // 6h before now → within the 36h TTL
const STALE = '2026-05-30T00:00:00.000Z' // ~84h before now → beyond the 36h TTL

// A real, gate-passing brief: one verified fx figure from its contracted, registered
// source, assembled by the deterministic composer (figure claim, no events).
function gatedBrief(): BriefDraft {
  const figures = validateFigures([
    {
      metric: 'fx.NGN_USD',
      label: 'NGN / USD',
      value: 1452,
      unit: 'NGN/USD',
      asOf: ASOF,
      countryCode: 'NG',
      sourceIds: ['src.open_er_api'],
    },
  ])
  return composeDeterministicBrief({
    id: 'b',
    date: '2026-05-29',
    edition: 'daily',
    dataMode: 'live',
    figures,
    events: [],
  })
}

// The on-disk artifact envelope, round-tripped through JSON exactly as deployed (also
// exercises the producer's serializeArtifact).
function artifact(brief: BriefDraft | null, generatedAt = FRESH): unknown {
  return JSON.parse(serializeArtifact(brief, generatedAt))
}

function fakeFetch(body: unknown, ok = true): typeof fetch {
  return (async () => ({ ok, json: async () => body })) as unknown as typeof fetch
}
function rejectingFetch(): typeof fetch {
  return (async () => {
    throw new Error('network down')
  }) as unknown as typeof fetch
}

function load(body: unknown, ok = true) {
  return loadBrief('/brief.json', fakeFetch(body, ok), now)
}

describe('loadBrief — artifact loading', () => {
  it('returns a fresh, gate-passed brief plus its generatedAt from the artifact', async () => {
    const loaded = await load(artifact(gatedBrief()))
    expect(loaded).not.toBeNull()
    expect(loaded!.brief.figures.map((f) => f.metric)).toContain('fx.NGN_USD')
    expect(loaded!.generatedAt).toBe(FRESH)
  })

  it('returns null when the artifact is absent (404)', async () => {
    expect(await load(null, false)).toBeNull()
  })

  it('returns null on a network/parse error', async () => {
    expect(await loadBrief('/brief.json', rejectingFetch(), now)).toBeNull()
  })

  it('returns null on a non-object / malformed payload', async () => {
    expect(await load('not a brief')).toBeNull()
    expect(await load(42)).toBeNull()
  })

  it('returns null when brief is null (cleared artifact)', async () => {
    expect(await load(artifact(null))).toBeNull()
  })

  it('returns null when a served brief does NOT pass the gate (defense-in-depth)', async () => {
    const brief = gatedBrief()
    const ungated = {
      ...brief,
      figures: brief.figures.map((f) => ({ ...f, status: 'rejected' as const })),
    }
    expect(await load(artifact(ungated))).toBeNull()
  })
})

describe('loadBrief — freshness (TTL via generatedAt)', () => {
  it('returns null when generatedAt is missing', async () => {
    expect(await load({ brief: gatedBrief() })).toBeNull()
  })

  it('returns null when generatedAt is not a valid date', async () => {
    expect(await load({ generatedAt: 'not-a-date', brief: gatedBrief() })).toBeNull()
  })

  it('returns null when the artifact is stale (older than the TTL)', async () => {
    expect(await load(artifact(gatedBrief(), STALE))).toBeNull()
  })

  it('renders a brief generated within the TTL', async () => {
    expect(await load(artifact(gatedBrief(), FRESH))).not.toBeNull()
  })
})

describe('loadBrief — strict brief shape (no defaulted scalars)', () => {
  it('rejects a fresh envelope whose brief has only arrays and no scalar metadata', async () => {
    const brief = {
      figures: [],
      events: [],
      claims: [],
      sections: [],
      profiles: [],
      methodologies: [],
    }
    expect(await load({ generatedAt: FRESH, brief })).toBeNull()
  })

  it('rejects a missing id', async () => {
    const brief = { ...gatedBrief() } as Record<string, unknown>
    delete brief.id
    expect(await load({ generatedAt: FRESH, brief })).toBeNull()
  })

  it('rejects a wrong status', async () => {
    expect(
      await load({ generatedAt: FRESH, brief: { ...gatedBrief(), status: 'archived' } }),
    ).toBeNull()
  })

  it('rejects a wrong edition', async () => {
    expect(
      await load({ generatedAt: FRESH, brief: { ...gatedBrief(), edition: 'monthly' } }),
    ).toBeNull()
  })

  it('rejects a wrong dataMode', async () => {
    expect(
      await load({ generatedAt: FRESH, brief: { ...gatedBrief(), dataMode: 'sample' } }),
    ).toBeNull()
  })

  it('rejects an invalid brief date', async () => {
    expect(
      await load({ generatedAt: FRESH, brief: { ...gatedBrief(), date: 'not-a-date' } }),
    ).toBeNull()
  })
})
