import type { BriefDraft, BriefSection, DataMode, Edition } from '../../domain/brief'
import type { VerifiedFigure } from '../../domain/figure'
import type { Event } from '../../domain/event'
import type { Claim } from '../../domain/claim'

// NON-AI placeholder. Assembles a BriefDraft from already-verified figures and
// corroborated events, with no causal reasoning. The real engine (the moat)
// replaces this in a later pass — nothing here calls a model or invents text.
export interface ComposeInput {
  id: string
  date: string
  edition: Edition
  dataMode: DataMode
  figures: VerifiedFigure[]
  events: Event[]
}

export function composeDeterministicBrief(input: ComposeInput): BriefDraft {
  const figures = input.figures.filter((f) => f.status === 'verified')
  const claims: Claim[] = figures.map((f, i) => ({
    id: `claim_fig_${i}`,
    kind: 'figure',
    text: `${f.label} is ${f.value} ${f.unit}.`,
    figureIds: [f.id],
    eventIds: [],
    verified: true,
  }))
  const sections: BriefSection[] = [
    {
      id: 'markets',
      kicker: 'Finance & economics',
      title: 'Verified market figures',
      body: 'Figures shown have cleared source attribution, timestamping and range validation.',
      claimIds: claims.map((c) => c.id),
    },
  ]
  return {
    id: input.id,
    date: input.date,
    edition: input.edition,
    status: 'draft',
    dataMode: input.dataMode,
    sections,
    claims,
    figures,
    events: input.events,
  }
}
