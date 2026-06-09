import type { BriefDraft } from '../domain/brief'
import type { Claim } from '../domain/claim'
import type { Event } from '../domain/event'
import type { Methodology } from '../domain/methodology'
import type { CountryProfile, CountryProfileEvidenceField } from '../domain/country'
import { FigureCard } from '../components/FigureCard'
import { sourceName } from '../data/sources'
import { theme } from './theme'

export interface AppProps {
  brief?: BriefDraft | null
  /** The artifact's generatedAt (from the loader); shown as "Updated <time>". */
  generatedAt?: string | null
  /** True while the loader is in flight, so the UI shows a distinct loading state. */
  loading?: boolean
}

function statusText(brief: BriefDraft | null): string {
  if (!brief) return 'No connector-backed brief loaded'
  return brief.status === 'published' ? 'Live brief published' : 'Live brief awaiting QA'
}

// Deterministic UTC formatting of the artifact's generatedAt for the "Updated <time>"
// indicator (UTC + fixed month names, so it is stable across environments and tests). An
// unparseable value yields an empty string, so the indicator is simply omitted.
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
function formatUpdated(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getUTCDate())} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}, ${p(d.getUTCHours())}:${p(d.getUTCMinutes())} UTC`
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

// A country profile's display rows, built ONLY from carried data. A derived field
// (oilStance, dollarDebtExposure) shows its methodology name (resolved from the carried
// methodologies, falling back to the id) plus source names; a raw/sourced field shows source
// names. A field with no value OR no carried evidence is omitted entirely - nothing is
// defaulted or fabricated. Field order follows the brief's priority.
function profileRows(
  profile: CountryProfile,
  methodologyById: Map<string, Methodology>,
): { label: string; value: string; sources: string; methodology?: string }[] {
  const rows: { label: string; value: string; sources: string; methodology?: string }[] = []
  const ev = profile.evidence
  const usdB = (n: number) => `$${(n / 1e9).toFixed(1)}B`
  const sourcesFor = (field: CountryProfileEvidenceField): string =>
    [...new Set(ev[field]?.sourceIds ?? [])].map(sourceName).join(', ')
  const methodologyFor = (field: CountryProfileEvidenceField): string | undefined => {
    const id = ev[field]?.methodologyId
    return id ? (methodologyById.get(id)?.name ?? id) : undefined
  }

  if (profile.oilStance && ev.oilStance) {
    rows.push({
      label: 'Oil stance',
      value: profile.oilStance,
      sources: sourcesFor('oilStance'),
      methodology: methodologyFor('oilStance'),
    })
  }
  if (profile.petroleumTrade && ev.petroleumTrade) {
    const pt = profile.petroleumTrade
    rows.push({
      label: 'Petroleum trade',
      value: `exports ${usdB(pt.exportValueUsd)} / imports ${usdB(pt.importValueUsd)} (${pt.refYear})`,
      sources: sourcesFor('petroleumTrade'),
    })
  }
  if (profile.keyExports?.length && ev.keyExports) {
    rows.push({
      label: 'Key exports',
      value: profile.keyExports.join(', '),
      sources: sourcesFor('keyExports'),
    })
  }
  if (profile.importDependence?.length && ev.importDependence) {
    rows.push({
      label: 'Import dependence',
      value: profile.importDependence.join(', '),
      sources: sourcesFor('importDependence'),
    })
  }
  if (profile.externalDebtPctGni !== undefined && ev.externalDebtPctGni) {
    rows.push({
      label: 'External debt (% GNI)',
      value: `${profile.externalDebtPctGni}%`,
      sources: sourcesFor('externalDebtPctGni'),
    })
  }
  // Derived: rendered ONLY when actually present. Its banding ships draft today, so it is
  // normally absent and therefore omitted (never fabricated).
  if (profile.dollarDebtExposure && ev.dollarDebtExposure) {
    rows.push({
      label: 'Dollar-debt exposure',
      value: profile.dollarDebtExposure,
      sources: sourcesFor('dollarDebtExposure'),
      methodology: methodologyFor('dollarDebtExposure'),
    })
  }
  return rows
}

// Runtime shell: renders user-facing facts only when a connector-backed BriefDraft
// is supplied by the live pipeline. With no brief it shows an empty state, not
// placeholder figures or analysis.
export default function App({ brief = null, generatedAt = null, loading = false }: AppProps) {
  // Three explicit views: loading (loader in flight), loaded (a gate-passed brief), or empty.
  // Loading is distinct from empty so the "no brief" copy never flashes during the fetch.
  const view: 'loading' | 'loaded' | 'empty' =
    loading && !brief ? 'loading' : brief ? 'loaded' : 'empty'
  const updated = brief && generatedAt ? formatUpdated(generatedAt) : ''
  const bannerText =
    view === 'loading'
      ? 'Loading the latest brief...'
      : view === 'empty'
        ? statusText(null)
        : updated
          ? `${statusText(brief)} · Updated ${updated}`
          : statusText(brief)
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
  // Country profiles carried by the brief (raw + derived fields with per-field provenance).
  const profiles = brief?.profiles ?? []

  return (
    <div
      style={{
        minHeight: '100dvh',
        background: theme.bg,
        color: theme.ink,
        fontFamily: theme.sans,
        WebkitFontSmoothing: 'antialiased',
      }}
    >
      <div
        style={{
          maxWidth: 760,
          margin: '0 auto',
          paddingTop: 'calc(24px + env(safe-area-inset-top))',
          paddingRight: 'max(18px, env(safe-area-inset-right))',
          paddingBottom: 'calc(48px + env(safe-area-inset-bottom))',
          paddingLeft: 'max(18px, env(safe-area-inset-left))',
        }}
      >
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
          {bannerText}
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
          <h1
            style={{
              fontFamily: theme.serif,
              fontSize: 'clamp(23px, 6.4vw, 28px)',
              fontWeight: 600,
              margin: '6px 0 0',
            }}
          >
            Ted&apos;s Africa Brief
          </h1>
          <p style={{ fontSize: 13, color: theme.muted, margin: '6px 0 0', lineHeight: 1.5 }}>
            Runtime screen for gated connector output. No hardcoded figures, events, country
            profiles, or analysis are rendered here.
          </p>
        </header>

        {view === 'loading' ? (
          <section
            aria-label="Loading brief"
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
            Fetching the latest gate-passed brief...
          </section>
        ) : view === 'loaded' ? (
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

            {profiles.length > 0 && (
              <section aria-label="Country profiles" style={{ marginTop: 26 }}>
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
                  Country profiles
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {profiles.map((p) => {
                    const rows = profileRows(p, methodologyById)
                    return (
                      <div
                        key={p.code}
                        style={{
                          background: theme.card,
                          borderRadius: 14,
                          padding: 14,
                          boxShadow: theme.shadow,
                        }}
                      >
                        <div style={{ fontSize: 14, fontWeight: 700 }}>
                          {p.name}{' '}
                          <span style={{ color: theme.muted, fontWeight: 600 }}>({p.code})</span>
                        </div>
                        {rows.length > 0 ? (
                          <div
                            style={{
                              marginTop: 8,
                              display: 'flex',
                              flexDirection: 'column',
                              gap: 6,
                            }}
                          >
                            {rows.map((row) => (
                              <div key={row.label} style={{ fontSize: 12.5, lineHeight: 1.4 }}>
                                <span style={{ fontWeight: 700 }}>{row.label}:</span> {row.value}
                                <div style={{ fontSize: 11, color: theme.muted, marginTop: 1 }}>
                                  {row.methodology ? `Methodology: ${row.methodology} · ` : ''}
                                  {row.sources ? `Source: ${row.sources}` : ''}
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div style={{ fontSize: 12, color: theme.muted, marginTop: 4 }}>
                            No sourced fields carried.
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </section>
            )}
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
