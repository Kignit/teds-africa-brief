import type { ShockType, TransmissionChannel } from '../../domain/analysis'
import { CAUSAL_METHODOLOGIES } from './methodologies'

// The transmission channels a shock travels through are the channels its causal
// methodology licenses — sourced from the registry so there is one source of truth.
export function inferTransmissionChannels(shock: ShockType): TransmissionChannel[] {
  return CAUSAL_METHODOLOGIES[shock].channels ?? []
}
