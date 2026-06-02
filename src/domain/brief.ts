import type { Claim } from './claim'
import type { VerifiedFigure } from './figure'
import type { Event } from './event'

export type Edition = 'daily' | 'weekly'
export type BriefStatus = 'draft' | 'published'

// 'sample' content is illustrative/prototype and MUST be labelled in the UI.
// Only 'live' content may present provenance as verified.
export type DataMode = 'live' | 'sample'

export interface BriefSection {
  id: string
  kicker: string
  title: string
  body: string
  claimIds: string[]
}

export interface BriefDraft {
  id: string
  /** ISO date, e.g. '2026-05-29'. */
  date: string
  edition: Edition
  status: BriefStatus
  dataMode: DataMode
  sections: BriefSection[]
  claims: Claim[]
  figures: VerifiedFigure[]
  events: Event[]
}
