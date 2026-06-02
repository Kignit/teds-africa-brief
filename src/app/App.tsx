import { sampleFigures, sampleEvents } from '../data/sampleData'
import { FigureCard } from '../components/FigureCard'
import { theme } from './theme'

// One honest screen rendered entirely from typed trust contracts
// (VerifiedFigure / Event) — not from a free-form mock object. Sample data is
// clearly labelled; unsourced Eurobond spreads are omitted, not faked.
export default function App() {
  const verified = sampleFigures.filter((f) => f.status === 'verified')

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
        {/* Prototype banner — sample data is never presented as live intelligence */}
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
          Prototype build · illustrative sample data · not live intelligence
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
            Finance &amp; economics
          </div>
          <h1 style={{ fontFamily: theme.serif, fontSize: 28, fontWeight: 600, margin: '6px 0 0' }}>
            Ted&apos;s Africa Brief
          </h1>
          <p style={{ fontSize: 13, color: theme.muted, margin: '6px 0 0', lineHeight: 1.5 }}>
            Every figure below traces to a source and a timestamp, and has passed range validation.
            Numbers that cannot be sourced are omitted.
          </p>
        </header>

        <section aria-label="Verified market figures">
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
              gap: 12,
            }}
          >
            {verified.map((f) => (
              <FigureCard key={f.id} figure={f} />
            ))}
          </div>
        </section>

        {/* Honest omission, per the source map */}
        <div
          style={{
            marginTop: 16,
            padding: '12px 14px',
            border: `1px dashed ${theme.hair}`,
            borderRadius: 12,
            fontSize: 12,
            color: theme.muted,
            lineHeight: 1.5,
          }}
        >
          Eurobond spreads for Kenya, Ghana and Egypt are omitted — there is no free source for them
          yet. They will appear only once a real source publishes them.
        </div>

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
            Corroborated events
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {sampleEvents.map((e) => (
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
                <div style={{ fontSize: 12.5, color: theme.muted, marginTop: 3, lineHeight: 1.45 }}>
                  {e.summary}
                </div>
                <div style={{ fontSize: 11, fontWeight: 600, color: theme.muted, marginTop: 8 }}>
                  {e.status === 'corroborated' ? 'Corroborated' : 'Single source'} ·{' '}
                  {e.corroboration.independentSourceCount} independent source
                  {e.corroboration.independentSourceCount === 1 ? '' : 's'}
                </div>
              </div>
            ))}
          </div>
        </section>

        <footer style={{ marginTop: 30, textAlign: 'center' }}>
          <div style={{ fontSize: 11.5, color: theme.muted }}>
            Prototype · sample data · awaiting live pipeline
          </div>
        </footer>
      </div>
    </div>
  )
}
