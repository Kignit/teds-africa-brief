import { describe, it, expect } from 'vitest'
import { loadBrief } from '../app/briefSource'
import { composeDeterministicBrief } from '../server/analysis/buildBrief'
import { validateFigures } from '../server/verification/validateFigure'
import type { BriefDraft } from '../domain/brief'

const ASOF = '2026-05-29T06:00:00.000Z'

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

// Fake fetch returning a fixed JSON body (round-tripped to mimic the real artifact).
function fakeFetch(body: unknown, ok = true): typeof fetch {
  return (async () => ({ ok, json: async () => body })) as unknown as typeof fetch
}
function rejectingFetch(): typeof fetch {
  return (async () => {
    throw new Error('network down')
  }) as unknown as typeof fetch
}

describe('loadBrief (runtime brief loading)', () => {
  it('returns a gate-passed brief from the artifact', async () => {
    const artifact = JSON.parse(JSON.stringify(gatedBrief())) // through JSON, as deployed
    const loaded = await loadBrief('/brief.json', fakeFetch(artifact))
    expect(loaded).not.toBeNull()
    expect(loaded!.figures.map((f) => f.metric)).toContain('fx.NGN_USD')
  })

  it('returns null when the artifact is absent (404) — empty state preserved', async () => {
    expect(await loadBrief('/brief.json', fakeFetch(null, false))).toBeNull()
  })

  it('returns null on a network/parse error — empty state preserved', async () => {
    expect(await loadBrief('/brief.json', rejectingFetch())).toBeNull()
  })

  it('returns null on a malformed payload — empty state preserved', async () => {
    expect(await loadBrief('/brief.json', fakeFetch({ not: 'a brief' }))).toBeNull()
  })

  it('returns null when a served brief does NOT pass the gate (defense-in-depth)', async () => {
    // Valid shape, but a figure is not verified -> the re-run gate rejects it, so the
    // runtime refuses to render it even though it was served as the artifact.
    const brief = gatedBrief()
    const ungated = {
      ...brief,
      figures: brief.figures.map((f) => ({ ...f, status: 'rejected' as const })),
    }
    expect(
      await loadBrief('/brief.json', fakeFetch(JSON.parse(JSON.stringify(ungated)))),
    ).toBeNull()
  })
})

describe('loadBrief — strict shape validation (no defaulted scalars)', () => {
  it('rejects a payload with only the six arrays and no scalar metadata', async () => {
    const arraysOnly = {
      figures: [],
      events: [],
      claims: [],
      sections: [],
      profiles: [],
      methodologies: [],
    }
    expect(await loadBrief('/brief.json', fakeFetch(arraysOnly))).toBeNull()
  })

  it('rejects a missing id', async () => {
    const noId = { ...gatedBrief() } as Record<string, unknown>
    delete noId.id
    expect(await loadBrief('/brief.json', fakeFetch(noId))).toBeNull()
  })

  it('rejects a wrong status', async () => {
    expect(
      await loadBrief('/brief.json', fakeFetch({ ...gatedBrief(), status: 'archived' })),
    ).toBeNull()
  })

  it('rejects a wrong edition', async () => {
    expect(
      await loadBrief('/brief.json', fakeFetch({ ...gatedBrief(), edition: 'monthly' })),
    ).toBeNull()
  })

  it('rejects a wrong dataMode', async () => {
    expect(
      await loadBrief('/brief.json', fakeFetch({ ...gatedBrief(), dataMode: 'sample' })),
    ).toBeNull()
  })

  it('rejects an invalid date', async () => {
    expect(
      await loadBrief('/brief.json', fakeFetch({ ...gatedBrief(), date: 'not-a-date' })),
    ).toBeNull()
  })
})
