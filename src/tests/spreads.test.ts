import { describe, it, expect } from 'vitest'
import { isInventedSpread } from '../server/verification/spreads'
import { validateFigure } from '../server/verification/validateFigure'
import { runPublishGate } from '../server/publishing/publishGate'
import type { BriefDraft } from '../domain/brief'

const ASOF = '2026-05-29T06:00:00.000Z'

describe('invented spreads', () => {
  it('flags a Kenya eurobond spread with no permitted source', () => {
    expect(
      isInventedSpread({
        metric: 'spread.eurobond.KE',
        countryCode: 'KE',
        sourceIds: ['src.open_er_api'],
      }),
    ).toBe(true)
  })

  it('does not flag a South Africa spread (a free source exists)', () => {
    expect(
      isInventedSpread({
        metric: 'spread.eurobond.ZA',
        countryCode: 'ZA',
        sourceIds: ['src.sarb'],
      }),
    ).toBe(false)
  })

  it('rejects an invented spread at validation and blocks it at the gate', () => {
    const fig = validateFigure({
      metric: 'spread.eurobond.GH',
      label: 'Ghana 2030 spread',
      value: 830,
      unit: 'bps',
      asOf: ASOF,
      countryCode: 'GH',
      sourceIds: ['src.made_up'],
    })
    expect(fig.status).toBe('rejected')

    const brief: BriefDraft = {
      id: 'b',
      date: '2026-05-29',
      edition: 'daily',
      status: 'draft',
      dataMode: 'live',
      sections: [],
      claims: [],
      figures: [fig],
      events: [],
      profiles: [],
      methodologies: [],
    }
    const res = runPublishGate(brief)
    expect(res.passed).toBe(false)
    expect(res.violations.map((v) => v.rule)).toContain('invented_spread')
  })
})
