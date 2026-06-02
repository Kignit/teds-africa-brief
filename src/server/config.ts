// Configuration is passed in explicitly (never read from process at import
// time) so the modules stay isomorphic and testable. Connectors that need a
// key are disabled when the key is absent — they never invent data.
export interface AppConfig {
  fredApiKey?: string
  eiaApiKey?: string
  comtradeApiKey?: string
}

export function getConfig(env: Record<string, string | undefined> = {}): AppConfig {
  return {
    fredApiKey: env.FRED_API_KEY,
    eiaApiKey: env.EIA_API_KEY,
    comtradeApiKey: env.COMTRADE_API_KEY,
  }
}
