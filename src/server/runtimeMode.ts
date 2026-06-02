// Runtime latch for live ingestion. The app starts idle and flips to live once
// connector-backed ingestion runs.
export type RuntimeMode = 'idle' | 'live'

let current: RuntimeMode = 'idle'

export function currentMode(): RuntimeMode {
  return current
}

// Latch the process into live mode. Idempotent and one-way in normal use.
export function engageLiveMode(): void {
  current = 'live'
}

// Test-only: reset the latch so suites can exercise both modes in isolation.
export function resetRuntimeModeForTests(): void {
  current = 'idle'
}
