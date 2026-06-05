import type { Event } from '../../domain/event'
import type { CausalLink, ShockType } from '../../domain/analysis'
import type { CountryProfile } from '../../domain/country'
import { classifyEvent } from './classifyEvent'
import { GLOBAL_SHOCKS } from './generateCausalLinks'

// Read-only explanation of the corroborated-event -> claim funnel, surfaced in the
// generator log (NEVER in the published artifact). For each CORROBORATED event it records
// the classifier result, how many scored effects the engine produced for it, and — when
// none — the blocker. PURE DIAGNOSTICS: it reads the already-generated causal links and
// re-runs the (pure) classifier; it never changes classification, scoring, the publish
// gate, the methodology registry, or any claim.
export interface ClaimYieldDiagnostic {
  eventId: string
  title: string
  countryCodes: string[]
  sourceIds: string[]
  /** classifyEvent result for the event. */
  shock: ShockType
  /** Number of scored causal effects the engine produced for this event. */
  effectCount: number
  /** null when the event produced effects (claim-producing); otherwise the blocker. */
  blocker: string | null
}

// Profile fields whose ABSENCE makes a classified shock score zero effects (see the
// guards in scoreCountryImpact). Mirrored here for DIAGNOSTIC EXPLANATION only — it is
// never consulted by the analysis itself, and the absence is confirmed against the actual
// target profiles below rather than assumed.
const DERIVED_LABEL_GUARD: Partial<Record<ShockType, keyof CountryProfile>> = {
  oil_shock: 'oilStance',
  dollar_rates_shock: 'dollarDebtExposure',
  trade_integration_event: 'keyExports',
}

// Why a classified shock yielded no scored effect — derived from the same target set
// generateCausalLinks uses (GLOBAL_SHOCKS fan out to all profiles; others only to the
// covered countries the event names) plus the confirmed absence of a required field.
function zeroEffectBlocker(shock: ShockType, event: Event, profiles: CountryProfile[]): string {
  const targets = GLOBAL_SHOCKS.has(shock)
    ? profiles
    : profiles.filter((p) => event.countryCodes.includes(p.code))
  if (targets.length === 0) return 'no covered country in countryCodes'
  const field = DERIVED_LABEL_GUARD[shock]
  if (field && targets.every((p) => p[field] === undefined)) return `missing ${field}`
  return 'no scored effect'
}

// One diagnostic per CORROBORATED event (single-source/unconfirmed events never reach the
// engine, mirroring generateCausalLinks). effectCount is read from the already-generated
// links; blocker is null only when the event produced >= 1 effect.
export function diagnoseClaimYield(
  events: Event[],
  links: CausalLink[],
  profiles: CountryProfile[],
): ClaimYieldDiagnostic[] {
  const effectCountByEvent = new Map(links.map((l) => [l.eventId, l.effects.length]))
  return events
    .filter((event) => event.status === 'corroborated')
    .map((event) => {
      const shock = classifyEvent(event)
      const effectCount = effectCountByEvent.get(event.id) ?? 0
      let blocker: string | null = null
      if (shock === 'unclassified') blocker = 'unclassified'
      else if (effectCount === 0) blocker = zeroEffectBlocker(shock, event, profiles)
      return {
        eventId: event.id,
        title: event.title,
        countryCodes: event.countryCodes,
        sourceIds: event.corroboration.sourceIds,
        shock,
        effectCount,
        blocker,
      }
    })
}
