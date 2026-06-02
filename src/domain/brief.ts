import type { Claim } from './claim'
import type { VerifiedFigure } from './figure'
import type { Event } from './event'
import type { CountryProfile } from './country'
import type { Methodology } from './methodology'

export type Edition = 'daily' | 'weekly'
export type BriefStatus = 'draft' | 'published'

export type DataMode = 'live'

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
  // The published artifact carries its own audit trail: the verified country
  // profiles and the methodologies behind any derived labels the claims rely on.
  profiles: CountryProfile[]
  methodologies: Methodology[]
}
