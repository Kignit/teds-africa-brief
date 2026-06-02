import type { BriefDraft, DataMode, Edition } from '../../domain/brief'
import type { VerifiedFigure } from '../../domain/figure'
import type { Event } from '../../domain/event'
import type { Claim } from '../../domain/claim'
import type { AnalysisDraft } from '../../domain/analysis'
import type { CountryProfile } from '../../domain/country'
import type { Methodology } from '../../domain/methodology'
import { CAUSAL_METHODOLOGY_BY_ID } from './methodologies'

// The EXACT set of methodologies the claims rely on — causal rules (from the
// registry) and banding methodologies (from the profiles), resolved by the ids the
// claims actually cite. Carried on the brief so the publish gate (and the published
// artifact) is self-contained, with no unused extras.
function collectMethodologies(profiles: CountryProfile[], claims: Claim[]): Methodology[] {
  const profileMethodologyById = new Map<string, Methodology>()
  for (const profile of profiles) {
    for (const methodology of profile.methodologies ?? []) {
      profileMethodologyById.set(methodology.id, methodology)
    }
  }
  const byId = new Map<string, Methodology>()
  for (const claim of claims) {
    for (const id of claim.methodologyIds) {
      const methodology = CAUSAL_METHODOLOGY_BY_ID.get(id) ?? profileMethodologyById.get(id)
      if (methodology) byId.set(id, methodology)
    }
  }
  return [...byId.values()]
}

export interface ComposeInput {
  id: string
  date: string
  edition: Edition
  dataMode: DataMode
  figures: VerifiedFigure[]
  events: Event[]
}

// Minimal BriefDraft from verified figures (used as a simple assembler and by the
// publish-gate tests). Formerly composeStub's composeDeterministicBrief.
export function composeDeterministicBrief(input: ComposeInput): BriefDraft {
  const figures = input.figures.filter((f) => f.status === 'verified')
  const claims: Claim[] = figures.map((f, i) => ({
    id: `claim_fig_${i}`,
    kind: 'figure',
    text: `${f.label} is ${f.value} ${f.unit}.`,
    figureIds: [f.id],
    eventIds: [],
    profileFields: [],
    profileSourceIds: [],
    methodologyIds: [],
    verified: true,
  }))
  return {
    id: input.id,
    date: input.date,
    edition: input.edition,
    status: 'draft',
    dataMode: input.dataMode,
    sections: [
      {
        id: 'markets',
        kicker: 'Finance & economics',
        title: 'Verified market figures',
        body: 'Figures shown have cleared source attribution, timestamping and range validation.',
        claimIds: claims.map((c) => c.id),
      },
    ],
    claims,
    figures,
    events: input.events,
    profiles: [],
    methodologies: [],
  }
}

// Folds an AnalysisDraft into a BriefDraft so the existing publish gate can vet
// the engine's claims (it blocks anything unbacked).
export function composeBriefFromAnalysis(args: {
  id: string
  date: string
  edition: Edition
  dataMode: DataMode
  analysis: AnalysisDraft
  figures: VerifiedFigure[]
  events: Event[]
  /** Verified profiles the analysis reasoned over — carried for the audit trail. */
  profiles: CountryProfile[]
}): BriefDraft {
  return {
    id: args.id,
    date: args.date,
    edition: args.edition,
    status: 'draft',
    dataMode: args.dataMode,
    sections: [
      {
        id: 'analysis',
        kicker: 'Causal map',
        title: 'One event, divergent effects',
        body: 'Deterministic V0 analysis grounded in verified figures, corroborated events and source-backed country profiles.',
        claimIds: args.analysis.claims.map((c) => c.id),
      },
    ],
    claims: args.analysis.claims,
    figures: args.figures.filter((f) => f.status === 'verified'),
    events: args.events,
    profiles: args.profiles,
    methodologies: collectMethodologies(args.profiles, args.analysis.claims),
  }
}
