import { describe, it, expect } from 'vitest'
import { runPublishGate } from '../server/publishing/publishGate'
import { validateFigures } from '../server/verification/validateFigure'
import { composeDeterministicBrief } from '../server/analysis/composeStub'
import type { BriefDraft } from '../domain/brief'
import type { VerifiedFigure } from '../domain/figure'

const ASOF = '2026-05-29T06:00:00.000Z'

function verifiedFigure(): VerifiedFigure {
  return validateFigures([
    {
      metric: 'fx.NGN_USD',
      label: 'NGN / USD',
      value: 1452,
      unit: 'NGN/USD',
      asOf: ASOF,
      countryCode: 'NG',
      sourceIds: ['src.open_er_api'],
    },
  ])[0]
}

function draft(overrides: Partial<BriefDraft>): BriefDraft {
  return {
    id: 'b',
    date: '2026-05-29',
    edition: 'daily',
    status: 'draft',
    dataMode: 'sample',
    sections: [],
    claims: [],
    figures: [],
    events: [],
    ...overrides,
  }
}

describe('publish gate', () => {
  it('passes a brief whose figures are all verified', () => {
    const brief = composeDeterministicBrief({
      id: 'b',
      date: '2026-05-29',
      edition: 'daily',
      dataMode: 'sample',
      figures: [verifiedFigure()],
      events: [],
    })
    const res = runPublishGate(brief)
    expect(res.passed).toBe(true)
    expect(res.violations).toHaveLength(0)
  })

  it('cannot publish with an unverified figure', () => {
    const f = verifiedFigure()
    const bad: VerifiedFigure = {
      ...f,
      status: 'rejected',
      validation: { ...f.validation, withinRange: false, reasons: ['forced'] },
    }
    const res = runPublishGate(draft({ figures: [bad] }))
    expect(res.passed).toBe(false)
    expect(res.violations.map((v) => v.rule)).toContain('unverified_figure')
  })

  it('blocks a claim marked verified without verified backing', () => {
    const res = runPublishGate(
      draft({
        claims: [
          {
            id: 'c1',
            kind: 'figure',
            text: 'x',
            figureIds: ['missing'],
            eventIds: [],
            verified: true,
          },
        ],
      }),
    )
    expect(res.passed).toBe(false)
    expect(res.violations.map((v) => v.rule)).toContain('unbacked_provenance_claim')
  })
})
