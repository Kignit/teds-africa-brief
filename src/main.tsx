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
root.render(
  <StrictMode>
    <App />
  </StrictMode>,
)

void loadBrief().then((brief) => {
  if (brief) {
    root.render(
      <StrictMode>
        <App brief={brief} />
      </StrictMode>,
    )
  }
})
