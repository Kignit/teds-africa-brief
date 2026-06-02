// Barrel for the trust domain model. Every user-facing fact traces back to
// these records: Source -> SourceDocument -> (VerifiedFigure | Event) -> Claim
// -> BriefDraft -> (PublishGateResult) -> published.
export type * from './source'
export type * from './figure'
export type * from './news'
export type * from './event'
export type * from './country'
export type * from './claim'
export type * from './analysis'
export type * from './brief'
export type * from './gate'
export type * from './provenance'
