import type { Event } from '../../domain/event'
import type { VerifiedFigure } from '../../domain/figure'
import type { CountryProfile } from '../../domain/country'
import type { CausalLink, Confidence, ShockType } from '../../domain/analysis'
import { classifyEvent, inferDirection } from './classifyEvent'
import { scoreCountryImpact } from './scoreCountryImpact'
import { downgrade } from './confidence'
import { CAUSAL_METHODOLOGIES } from './methodologies'

// Shocks that fan out across the whole covered set, producing divergent effects.
// Other shocks apply only to the countries the event names.
const GLOBAL_SHOCKS = new Set<ShockType>([
  'oil_shock',
  'dollar_rates_shock',
  'trade_integration_event',
])

function relevantFigureIds(shock: ShockType, cc: string, figures: VerifiedFigure[]): string[] {
  return figures
    .filter((f) => {
      if (shock === 'oil_shock') return f.metric === 'commodity.brent'
      if (shock === 'dollar_rates_shock') return f.metric.startsWith('fred.')
      if (shock === 'fx_move' || shock === 'policy_rate_decision')
        return f.countryCode === cc && f.metric.startsWith('fx.')
      return false
    })
    .map((f) => f.id)
}

export function generateCausalLinks(
  events: Event[],
  figures: VerifiedFigure[],
  profiles: CountryProfile[],
): CausalLink[] {
  const verifiedFigures = figures.filter((f) => f.status === 'verified')
  const links: CausalLink[] = []
  let n = 0

  for (const event of events) {
    // Only corroborated events may generate publishable analysis. Single-source
    // and unconfirmed events are stored as evidence but never become claims.
    if (event.status !== 'corroborated') continue

    const shock = classifyEvent(event)
    if (shock === 'unclassified') continue
    const direction = inferDirection(event)

    let baseConfidence: Confidence = 'high'
    if (direction === 'unclear') baseConfidence = downgrade(baseConfidence)

    const targets = GLOBAL_SHOCKS.has(shock)
      ? profiles
      : profiles.filter((p) => event.countryCodes.includes(p.code))

    const effects = targets.flatMap((profile) =>
      scoreCountryImpact({
        shock,
        direction,
        event,
        profile,
        figureIds: relevantFigureIds(shock, profile.code, verifiedFigures),
        baseConfidence,
      }),
    )
    if (effects.length === 0) continue

    n += 1
    links.push({
      id: `link_${n}`,
      trigger: event.title,
      shockType: shock,
      direction,
      mechanism: CAUSAL_METHODOLOGIES[shock].mechanism ?? '',
      eventId: event.id,
      effects,
    })
  }

  return links
}
