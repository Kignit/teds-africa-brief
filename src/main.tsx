import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './app/App'
import { loadBrief } from './app/briefSource'

const root = createRoot(document.getElementById('root')!)

// Render the empty state immediately, then upgrade to the live brief ONLY if a
// gate-passed BriefDraft loads. No artifact, a load/parse error, or a brief that
// fails the re-run gate all leave the runtime in its empty state. The browser never
// runs connectors or the ingestion pipeline — it only renders a served, re-validated
// brief.
// Initial paint shows a distinct LOADING state (not the empty state), so the empty-state
// copy is not shown while the artifact is still being fetched and re-validated.
root.render(
  <StrictMode>
    <App loading />
  </StrictMode>,
)

// After the loader resolves, upgrade to the gate-passed brief (with its generatedAt for the
// "Updated <time>" indicator), or fall back to the empty state. A null result (no artifact, a
// load/parse error, a stale or malformed brief, or one that fails the re-run gate) renders the
// empty state, never stale or partial data.
void loadBrief().then((loaded) => {
  root.render(
    <StrictMode>
      {loaded ? <App brief={loaded.brief} generatedAt={loaded.generatedAt} /> : <App />}
    </StrictMode>,
  )
})

// Register the offline app shell in production only (skipped in dev so it cannot cache the
// module graph during HMR). The worker caches the static shell and serves the brief artifact
// network-first; freshness is still enforced by loadBrief's 36h gate on every load, so the
// worker can never present a stale brief as current.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js')
  })
}
