import { describe, it, expect } from 'vitest'
import { validateFigure } from '../server/verification/validateFigure'

const ASOF = '2026-05-29T06:00:00.000Z'

describe('validateFigure', () => {
  it('verifies a figure with source, timestamp and in-range value', () => {
    const f = validateFigure({
      metric: 'fx.KES_USD',
      label: 'KES / USD',
      value: 128.9,
      unit: 'KES/USD',
      asOf: ASOF,
      countryCode: 'KE',
      sourceIds: ['src.open_er_api'],
    })
    expect(f.status).toBe('verified')
    expect(f.validation.hasSource).toBe(true)
    expect(f.validation.hasTimestamp).toBe(true)
    expect(f.validation.withinRange).toBe(true)
  })

  it('rejects a figure with no source', () => {
    const f = validateFigure({
      metric: 'fx.KES_USD',
      label: 'KES / USD',
      value: 128.9,
      unit: 'KES/USD',
      asOf: ASOF,
      sourceIds: [],
    })
    expect(f.status).toBe('rejected')
    expect(f.validation.hasSource).toBe(false)
  })

  it('rejects a figure with an invalid timestamp', () => {
    const f = validateFigure({
      metric: 'fx.KES_USD',
      label: 'KES / USD',
      value: 128.9,
      unit: 'KES/USD',
      asOf: 'not-a-date',
      sourceIds: ['src.open_er_api'],
    })
    expect(f.status).toBe('rejected')
    expect(f.validation.hasTimestamp).toBe(false)
  })

  it('rejects an out-of-range value', () => {
    const f = validateFigure({
      metric: 'rate.policy.GH',
      label: 'Policy rate',
      value: 999,
      unit: '%',
      asOf: ASOF,
      sourceIds: ['src.bog'],
    })
    expect(f.status).toBe('rejected')
    expect(f.validation.withinRange).toBe(false)
  })
})
