import type { CausalEffect, CausalLink } from '../../domain/analysis'

// The single seam where natural language is produced. V0 is fully deterministic:
// it returns the already-grounded strings unchanged. If an LLM is introduced
// later it must implement this interface and may ONLY rephrase the grounded
// `why` / `mechanism` text it is given — it must never add facts, figures,
// sources, citations, or change tone, evidence, or confidence.
export interface Phraser {
  readonly name: string
  effect(effect: CausalEffect): string
  mechanism(link: CausalLink): string
}

export const deterministicPhraser: Phraser = {
  name: 'deterministic-v0',
  effect: (effect) => effect.why,
  mechanism: (link) => link.mechanism,
}
