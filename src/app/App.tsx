import type { BriefDraft } from '../domain/brief'
import type { Claim } from '../domain/claim'
import type { Event } from '../domain/event'
import type { Methodology } from '../domain/methodology'
import { FigureCard } from '../components/FigureCard'
import { sourceName } from '../data/sources'
import { theme } from './theme'

export interface AppProps {
  brief?: BriefDraft | null
}

function statusText(brief: BriefDraft | null): string {
  if (!brief) return 'No connector-backed brief loaded'
  return brief.status === 'published' ? 'Live brief published' : 'Live brief awaiting QA'
}

// A claim's provenance, built ONLY from data the brief already carries: the cited
// corroborated event title(s), the source names behind those events plus the claim's
// profile fields, and the methodology names (falling back to the id when no name is
// carried). A category with no data is omitted; nothing is invented, and nothing is
// labelled "cross-checked" (that would need an existing corroboration/source count).
function claimProvenance(
  claim: Claim,
  eventById: Map<string, Event>,
  methodologyById: Map<string, Methodology>,
): { label: string; value: string }[] {
  const lines: { label: string; value: string }[] = []

  const citedEvents = claim.eventIds.map((id) => eventById.get(id)).filter((e): e is Event => !!e)
  if (citedEvents.length) {
    lines.push({ label: 'Event', value: citedEvents.map((e) => e.title).join('; ') })
  }

  const eventSourceIds = citedEvents.flatMap((e) => e.corroboration.sourceIds)
  const sourceNames = [...new Set([...eventSourceIds, ...claim.profileSourceIds])].map(sourceName)
  if (sourceNames.length) lines.push({ label: 'Sources', value: sourceNames.join(', ') })

  const methodologyNames = claim.methodologyIds.map((id) => methodologyById.get(id)?.name ?? id)
  if (methodologyNames.length) {
    lines.push({ label: 'Methodology', value: methodologyNames.join(', ') })
  }

  return lines
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
  // Lookups to resolve a claim's evidence ids to readable provenance (carried data only).
  const eventById = new Map((brief?.events ?? []).map((e): [string, Event] => [e.id, e]))
  const methodologyById = new Map(
    (brief?.methodologies ?? []).map((m): [string, Methodology] => [m.id, m]),
  )

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
                {claims.map((claim) => {
                  const provenance = claimProvenance(claim, eventById, methodologyById)
                  return (
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
                      <div>{claim.text}</div>
                      {provenance.length > 0 && (
                        <div
                          style={{
                            marginTop: 8,
                            paddingTop: 8,
                            borderTop: `1px solid ${theme.hair}`,
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 2,
                          }}
                        >
                          {provenance.map((line) => (
                            <div
                              key={line.label}
                              style={{ fontSize: 11, color: theme.muted, lineHeight: 1.4 }}
                            >
                              <span style={{ fontWeight: 700 }}>{line.label}:</span> {line.value}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
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
