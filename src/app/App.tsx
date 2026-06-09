import type { BriefDraft } from '../domain/brief'
import type { Claim } from '../domain/claim'
import type { Event } from '../domain/event'
import type { Methodology } from '../domain/methodology'
import type { CountryProfile, CountryProfileEvidenceField } from '../domain/country'
import { FigureCard } from '../components/FigureCard'
import { SectionHead } from '../components/SectionHead'
import { SourceLinks, type SourceRef } from '../components/SourceLinks'
import { sourceName } from '../data/sources'
import { isHttpUrl } from '../domain/url'
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

interface ClaimProvenance {
  events: string[]
  sources: SourceRef[]
  methodologies: string[]
}

// A claim's provenance, built ONLY from data the brief already carries: the cited corroborated
// event title(s), the sources behind those events plus the claim's profile fields, and the
// methodology names (falling back to the id when no name is carried). Article URLs come ONLY
// from a cited event's own source links (first per source); profile/data sources (World Bank,
// Comtrade, etc.) carry none and so render as text. Nothing is invented.
function claimProvenance(
  claim: Claim,
  eventById: Map<string, Event>,
  methodologyById: Map<string, Methodology>,
): ClaimProvenance {
  const citedEvents = claim.eventIds.map((id) => eventById.get(id)).filter((e): e is Event => !!e)

  const urlBySource = new Map<string, string>()
  for (const e of citedEvents) {
    for (const s of e.corroboration.sources ?? []) {
      // First VALID url per source wins; an invalid earlier url never blocks a later valid one.
      if (isHttpUrl(s.url) && !urlBySource.has(s.sourceId)) urlBySource.set(s.sourceId, s.url)
    }
  }

  const eventSourceIds = citedEvents.flatMap((e) => e.corroboration.sourceIds)
  const sourceIds = [...new Set([...eventSourceIds, ...claim.profileSourceIds])]

  return {
    events: citedEvents.map((e) => e.title),
    sources: sourceIds.map((id) => ({ sourceId: id, url: urlBySource.get(id) })),
    methodologies: claim.methodologyIds.map((id) => methodologyById.get(id)?.name ?? id),
  }
}

// Distinct sources for an event, each carrying the first real article URL for that source when
// one exists (text fallback otherwise). Drives the event card's clickable Sources line.
function eventSourceRefs(event: Event): SourceRef[] {
  const urlBySource = new Map<string, string>()
  for (const s of event.corroboration.sources ?? []) {
    // First VALID url per source wins; an invalid earlier url never blocks a later valid one.
    if (isHttpUrl(s.url) && !urlBySource.has(s.sourceId)) urlBySource.set(s.sourceId, s.url)
  }
  return event.corroboration.sourceIds.map((id) => ({ sourceId: id, url: urlBySource.get(id) }))
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

// Distinct sources actually backing the brief - the union of every sourceId across
// figures, corroborated events, claim profile fields, and country-profile evidence.
// Feeds the masthead provenance line; derived only from the artifact, never fabricated.
function distinctSourceCount(brief: BriefDraft): number {
  const ids = new Set<string>()
  for (const f of brief.figures) for (const s of f.sourceIds) ids.add(s)
  for (const e of brief.events) for (const s of e.corroboration.sourceIds) ids.add(s)
  for (const c of brief.claims) for (const s of c.profileSourceIds) ids.add(s)
  for (const p of brief.profiles)
    for (const ev of Object.values(p.evidence)) for (const s of ev?.sourceIds ?? []) ids.add(s)
  return ids.size
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
  const editionLabel = brief?.edition === 'weekly' ? 'Weekly brief' : 'Daily brief'
  const sourceCount = brief ? distinctSourceCount(brief) : 0
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
        <header style={{ marginBottom: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                width: 42,
                height: 42,
                borderRadius: 13,
                background: theme.accent,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                boxShadow: '0 4px 12px rgba(61,78,232,.35)',
              }}
            >
              <span style={{ color: '#fff', fontWeight: 800, fontSize: 17, letterSpacing: -1 }}>
                tab
              </span>
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <h1
                style={{
                  fontFamily: theme.serif,
                  fontSize: 'clamp(22px, 6vw, 27px)',
                  fontWeight: 600,
                  letterSpacing: -0.3,
                  lineHeight: 1.1,
                  margin: 0,
                }}
              >
                Ted&apos;s Africa Brief
              </h1>
              <div style={{ fontSize: 12.5, color: theme.muted, marginTop: 3 }}>
                {view === 'loading' ? (
                  'Loading the latest brief...'
                ) : view === 'empty' ? (
                  statusText(null)
                ) : updated ? (
                  <>
                    {editionLabel}
                    <span
                      aria-hidden="true"
                      style={{
                        display: 'inline-block',
                        width: 3,
                        height: 3,
                        borderRadius: 3,
                        background: 'currentColor',
                        opacity: 0.5,
                        margin: '0 7px',
                        verticalAlign: 'middle',
                      }}
                    />
                    <span>Updated {updated}</span>
                  </>
                ) : (
                  editionLabel
                )}
              </div>
            </div>
          </div>
          {view === 'loaded' && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                flexWrap: 'wrap',
                marginTop: 12,
              }}
            >
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  fontSize: 11,
                  fontWeight: 700,
                  color: theme.muted,
                }}
              >
                <span
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: 7,
                    background: brief?.status === 'published' ? theme.pos : theme.accent,
                  }}
                />
                {statusText(brief)}
              </span>
              {sourceCount > 0 && (
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    fontSize: 11,
                    fontWeight: 600,
                    color: theme.muted,
                  }}
                >
                  <svg width="12" height="13" viewBox="0 0 12 13" aria-hidden="true">
                    <path
                      d="M6 1l4.5 1.8v3.4c0 2.7-1.9 5-4.5 5.8C3.4 11.2 1.5 8.9 1.5 6.2V2.8L6 1z"
                      fill="none"
                      stroke={theme.muted}
                      strokeWidth="1.1"
                    />
                    <path
                      d="M4 6.4l1.4 1.4L8.3 5"
                      stroke={theme.muted}
                      strokeWidth="1.2"
                      fill="none"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  AI-drafted from {sourceCount} source{sourceCount === 1 ? '' : 's'}
                </span>
              )}
            </div>
          )}
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
              <SectionHead kicker="Markets" />
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

            <section aria-label="Events">
              <SectionHead kicker="Events" title="What moved" />
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
                    {e.corroboration.sourceIds.length > 0 && (
                      <div style={{ fontSize: 11, color: theme.muted, marginTop: 5 }}>
                        <span style={{ fontWeight: 700 }}>Sources:</span>{' '}
                        <SourceLinks sources={eventSourceRefs(e)} />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>

            {watchlistEvents.length > 0 && (
              <section aria-label="Watchlist">
                <SectionHead kicker="Watchlist - unverified" color={theme.warnInk} />
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

            <section aria-label="Claims">
              <SectionHead kicker="Claims" />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {claims.map((claim) => {
                  const prov = claimProvenance(claim, eventById, methodologyById)
                  const hasProvenance =
                    prov.events.length > 0 ||
                    prov.sources.length > 0 ||
                    prov.methodologies.length > 0
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
                      {hasProvenance && (
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
                          {prov.events.length > 0 && (
                            <div style={{ fontSize: 11, color: theme.muted, lineHeight: 1.4 }}>
                              <span style={{ fontWeight: 700 }}>Event:</span>{' '}
                              {prov.events.join('; ')}
                            </div>
                          )}
                          {prov.sources.length > 0 && (
                            <div style={{ fontSize: 11, color: theme.muted, lineHeight: 1.4 }}>
                              <span style={{ fontWeight: 700 }}>Sources:</span>{' '}
                              <SourceLinks sources={prov.sources} />
                            </div>
                          )}
                          {prov.methodologies.length > 0 && (
                            <div style={{ fontSize: 11, color: theme.muted, lineHeight: 1.4 }}>
                              <span style={{ fontWeight: 700 }}>Methodology:</span>{' '}
                              {prov.methodologies.join(', ')}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </section>

            {profiles.length > 0 && (
              <section aria-label="Country profiles">
                <SectionHead kicker="Country profiles" />
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
            No gate-passed brief is live right now. This screen stays empty until a verified brief
            is published - it never shows placeholder figures, events, or analysis.
          </section>
        )}
      </div>
    </div>
  )
}
