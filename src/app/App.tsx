import type { BriefDraft } from '../domain/brief'
import { FigureCard } from '../components/FigureCard'
import { theme } from './theme'

export interface AppProps {
  brief?: BriefDraft | null
}

function statusText(brief: BriefDraft | null): string {
  if (!brief) return 'No connector-backed brief loaded'
  return brief.status === 'published' ? 'Live brief published' : 'Live brief awaiting QA'
}

// Runtime shell: renders user-facing facts only when a connector-backed BriefDraft
// is supplied by the live pipeline. With no brief it shows an empty state, not
// placeholder figures or analysis.
export default function App({ brief = null }: AppProps) {
  const figures = brief?.figures ?? []
  // Public runtime presents only corroborated events as intelligence. Single-source
  // and unconfirmed events are segregated into a clearly-labelled watchlist below,
  // never the main Events surface, so they cannot look like verified intelligence.
  const events = (brief?.events ?? []).filter((e) => e.status === 'corroborated')
  const watchlistEvents = (brief?.events ?? []).filter((e) => e.status !== 'corroborated')
  // Runtime view shows verified analysis only — never unverified claims from a draft.
  const claims = (brief?.claims ?? []).filter((c) => c.verified)

  return (
    <div
      style={{
        minHeight: '100vh',
        background: theme.bg,
        color: theme.ink,
        fontFamily: theme.sans,
        WebkitFontSmoothing: 'antialiased',
      }}
    >
      <div style={{ maxWidth: 760, margin: '0 auto', padding: '24px 18px 48px' }}>
        <div
          style={{
            background: theme.warnBg,
            color: theme.warnInk,
            borderRadius: 12,
            padding: '10px 14px',
            fontSize: 12.5,
            fontWeight: 600,
            marginBottom: 22,
          }}
        >
          {statusText(brief)}
        </div>

        <header style={{ marginBottom: 18 }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 800,
              letterSpacing: 1.2,
              textTransform: 'uppercase',
              color: theme.accent,
            }}
          >
            Intelligence
          </div>
          <h1 style={{ fontFamily: theme.serif, fontSize: 28, fontWeight: 600, margin: '6px 0 0' }}>
            Ted&apos;s Africa Brief
          </h1>
          <p style={{ fontSize: 13, color: theme.muted, margin: '6px 0 0', lineHeight: 1.5 }}>
            Runtime screen for gated connector output. No hardcoded figures, events, country
            profiles, or analysis are rendered here.
          </p>
        </header>

        {brief ? (
          <>
            <section aria-label="Verified market figures">
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
                  gap: 12,
                }}
              >
                {figures.map((f) => (
                  <FigureCard key={f.id} figure={f} />
                ))}
              </div>
            </section>

            <section aria-label="Events" style={{ marginTop: 26 }}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 800,
                  letterSpacing: 1.2,
                  textTransform: 'uppercase',
                  color: theme.accent,
                  marginBottom: 10,
                }}
              >
                Events
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {events.map((e) => (
                  <div
                    key={e.id}
                    style={{
                      background: theme.card,
                      borderRadius: 14,
                      padding: 14,
                      boxShadow: theme.shadow,
                    }}
                  >
                    <div style={{ fontSize: 14, fontWeight: 700 }}>{e.title}</div>
                    <div
                      style={{ fontSize: 12.5, color: theme.muted, marginTop: 3, lineHeight: 1.45 }}
                    >
                      {e.summary}
                    </div>
                    <div
                      style={{ fontSize: 11, fontWeight: 600, color: theme.muted, marginTop: 8 }}
                    >
                      {e.status} · {e.corroboration.independentSourceCount} independent source
                      {e.corroboration.independentSourceCount === 1 ? '' : 's'}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {watchlistEvents.length > 0 && (
              <section aria-label="Watchlist" style={{ marginTop: 26 }}>
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 800,
                    letterSpacing: 1.2,
                    textTransform: 'uppercase',
                    color: theme.warnInk,
                    marginBottom: 6,
                  }}
                >
                  Watchlist · unverified — not intelligence
                </div>
                <p
                  style={{ fontSize: 12, color: theme.muted, margin: '0 0 10px', lineHeight: 1.5 }}
                >
                  Single-source or unconfirmed reports, shown as raw evidence only. They are not
                  corroborated and do not feed the brief&apos;s analysis.
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {watchlistEvents.map((e) => (
                    <div
                      key={e.id}
                      style={{
                        border: `1px dashed ${theme.hair}`,
                        borderRadius: 14,
                        padding: 14,
                      }}
                    >
                      <div style={{ fontSize: 14, fontWeight: 700 }}>{e.title}</div>
                      <div
                        style={{
                          fontSize: 12.5,
                          color: theme.muted,
                          marginTop: 3,
                          lineHeight: 1.45,
                        }}
                      >
                        {e.summary}
                      </div>
                      <div
                        style={{
                          fontSize: 11,
                          fontWeight: 600,
                          color: theme.warnInk,
                          marginTop: 8,
                        }}
                      >
                        {e.status} · {e.corroboration.independentSourceCount} independent source
                        {e.corroboration.independentSourceCount === 1 ? '' : 's'} · not publishable
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            <section aria-label="Claims" style={{ marginTop: 26 }}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 800,
                  letterSpacing: 1.2,
                  textTransform: 'uppercase',
                  color: theme.accent,
                  marginBottom: 10,
                }}
              >
                Claims
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {claims.map((claim) => (
                  <div
                    key={claim.id}
                    style={{
                      background: theme.card,
                      borderRadius: 14,
                      padding: 14,
                      boxShadow: theme.shadow,
                      fontSize: 13,
                      lineHeight: 1.5,
                    }}
                  >
                    {claim.text}
                  </div>
                ))}
              </div>
            </section>
          </>
        ) : (
          <section
            aria-label="Empty live brief"
            style={{
              marginTop: 26,
              padding: 18,
              border: `1px dashed ${theme.hair}`,
              borderRadius: 12,
              color: theme.muted,
              fontSize: 13,
              lineHeight: 1.55,
            }}
          >
            No publish-gated connector output is available in this runtime yet.
          </section>
        )}
      </div>
    </div>
  )
}
