import type { AppConfig } from '../config'

// Injectable fetch so connectors are unit-testable without live network.
export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>

export interface ConnectorContext {
  fetch: FetchLike
  config: AppConfig
  /** Injectable clock for deterministic output. */
  now: () => string
}

export function defaultNow(): string {
  return new Date().toISOString()
}
