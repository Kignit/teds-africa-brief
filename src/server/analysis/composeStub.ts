// DEPRECATED. The V0 analysis engine now lives in composeAnalysisDraft.ts and the
// modules beside it (classifyEvent, inferTransmissionChannels, scoreCountryImpact,
// generateCausalLinks, confidence, languageAdapter). Brief assembly moved to
// buildBrief.ts. This shim only re-exports so older imports keep working.
export { composeDeterministicBrief } from './buildBrief'
export type { ComposeInput } from './buildBrief'
