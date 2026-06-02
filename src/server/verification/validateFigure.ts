import type { FigureValidation, RawFigure, VerifiedFigure } from '../../domain/figure'
import { getRange } from './ranges'
import { isInventedSpread } from './spreads'

let counter = 0
function nextId(metric: string): string {
  counter += 1
  return `fig_${metric}_${counter}`
}

// A RawFigure becomes a VerifiedFigure only after passing: source attribution,
// a valid timestamp, finiteness, range sanity, and the invented-spread check.
export function validateFigure(raw: RawFigure): VerifiedFigure {
  const reasons: string[] = []

  const hasSource = raw.sourceIds.length > 0
  if (!hasSource) reasons.push('no source attribution')

  const hasTimestamp = !Number.isNaN(Date.parse(raw.asOf))
  if (!hasTimestamp) reasons.push('missing or invalid timestamp')

  const finite = Number.isFinite(raw.value)
  if (!finite) reasons.push('value is not a finite number')

  const range = getRange(raw.metric)
  let withinRange = finite
  if (finite && range) {
    withinRange = raw.value >= range.min && raw.value <= range.max
    if (!withinRange) {
      reasons.push(`value ${raw.value} outside plausible range [${range.min}, ${range.max}]`)
    }
  }

  if (isInventedSpread(raw)) {
    withinRange = false
    reasons.push('eurobond spread has no permitted free source for this country')
  }

  const validation: FigureValidation = { hasSource, hasTimestamp, withinRange, reasons }
  const verified = hasSource && hasTimestamp && finite && withinRange

  return {
    id: nextId(raw.metric),
    metric: raw.metric,
    label: raw.label,
    value: raw.value,
    unit: raw.unit,
    asOf: raw.asOf,
    countryCode: raw.countryCode,
    sourceIds: raw.sourceIds,
    status: verified ? 'verified' : 'rejected',
    validation,
  }
}

export function validateFigures(raws: RawFigure[]): VerifiedFigure[] {
  return raws.map(validateFigure)
}
