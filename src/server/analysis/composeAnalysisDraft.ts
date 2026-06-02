import type { Event } from '../../domain/event'
import type { VerifiedFigure } from '../../domain/figure'
import type { CountryProfile } from '../../domain/country'
import type { AnalysisDraft, CausalLink, Confidence } from '../../domain/analysis'
import type { Claim } from '../../domain/claim'
import { countryProfileEvidenceReasons } from '../verification/countryProfiles'
import { generateCausalLinks } from './generateCausalLinks'
import { renderCausalClaimText } from './renderClaim'

export interface AnalyzeInput {
  figures: VerifiedFigure[]
  events: Event[]
  profiles: CountryProfile[]
  id?: string
  now?: () => string
}

const RANK: Record<Confidence, number> = { low: 0, medium: 1, high: 2 }

// Each causal effect becomes a Claim grounded in its originating event (always
// present) plus any figures. Profile fields add context but the gate keys off
// the event/figure references.
function claimsFromLinks(links: CausalLink[], events: Event[]): Claim[] {
  const claims: Claim[] = []
  const eventById = new Map(events.map((event) => [event.id, event]))
  links.forEach((link, li) => {
    link.effects.forEach((effect, ei) => {
      const event = eventById.get(link.eventId)
      claims.push({
        id: `claim_${li}_${ei}`,
        kind: 'causal',
        // Canonical text: rendered from the structured (country, shock, tone,
        // channels) by the same function the gate uses to re-derive and verify it.
        text: renderCausalClaimText(
          effect.countryCode,
          link.shockType,
          effect.tone,
          effect.channels,
        ),
        figureIds: effect.evidence.figureIds,
        eventIds: effect.evidence.eventIds,
        // Carry profile + methodology evidence so the publish gate can re-check it.
        profileFields: effect.evidence.profileFields,
        profileSourceIds: effect.evidence.profileSourceIds,
        methodologyIds: effect.evidence.methodologyIds,
        // Structured inputs the gate recomputes the canonical text from.
        countryCode: effect.countryCode,
        tone: effect.tone,
        channels: effect.channels,
        // The shock binds the claim to its approved causal methodology at the gate.
        shockType: link.shockType,
        verified: event?.status === 'corroborated',
      })
    })
  })
  return claims
}

// V0 engine entry point. Deterministic; refuses unverified figures; ignores
// unconfirmed events (handled in generateCausalLinks).
export function composeAnalysisDraft(input: AnalyzeInput): AnalysisDraft {
  const unverified = input.figures.find((f) => f.status !== 'verified')
  if (unverified) {
    throw new Error(
      `analysis refused: figure ${unverified.metric} is not verified (status=${unverified.status})`,
    )
  }
  // Production analysis enforces the full field-source contracts (the same check
  // the pipeline applies) — the engine never reasons over a profile the pipeline
  // would reject. Tests that need uncontracted fields exercise scoreCountryImpact
  // directly instead of going through this entry point.
  const invalidProfile = input.profiles
    .map((profile) => ({ profile, reasons: countryProfileEvidenceReasons(profile) }))
    .find((entry) => entry.reasons.length > 0)
  if (invalidProfile) {
    throw new Error(
      `analysis refused: country profile ${invalidProfile.profile.code} lacks evidence (${invalidProfile.reasons.join(
        '; ',
      )})`,
    )
  }
  const now = input.now ?? (() => new Date().toISOString())

  const links = generateCausalLinks(input.events, input.figures, input.profiles)
  const claims = claimsFromLinks(links, input.events)

  const leadClaimIds = links
    .flatMap((l, li) =>
      l.effects.map((e, ei) => ({ id: `claim_${li}_${ei}`, rank: RANK[e.confidence] })),
    )
    .sort((a, b) => b.rank - a.rank)
    .slice(0, 5)
    .map((x) => x.id)

  return {
    id: input.id ?? `analysis_${now()}`,
    generatedAt: now(),
    method: 'deterministic',
    model: '',
    causalLinks: links,
    claims,
    leadClaimIds,
  }
}
