import { theme } from '../app/theme'

interface Props {
  /** Small-caps eyebrow above the rule. */
  kicker: string
  /** Optional serif section title. */
  title?: string
  /** Kicker colour; defaults to the accent (warn ink is used for the watchlist). */
  color?: string
}

// Economist-style section divider: a hairline rule, a small-caps kicker, and an
// optional serif title. Presentation only - it carries no data.
export function SectionHead({ kicker, title, color = theme.accent }: Props) {
  return (
    <div style={{ padding: '26px 0 10px' }}>
      <div style={{ height: 1, background: theme.hair, marginBottom: 12 }} />
      <div
        style={{
          fontSize: 11,
          fontWeight: 800,
          letterSpacing: 1.3,
          textTransform: 'uppercase',
          color,
        }}
      >
        {kicker}
      </div>
      {title && (
        <h2
          style={{
            fontFamily: theme.serif,
            fontSize: 22,
            fontWeight: 600,
            letterSpacing: -0.2,
            color: theme.ink,
            margin: '7px 0 0',
            lineHeight: 1.15,
          }}
        >
          {title}
        </h2>
      )}
    </div>
  )
}
