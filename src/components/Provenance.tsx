import type { Provenance } from '../domain/provenance'
import { theme } from '../app/theme'

interface Props {
  provenance?: Provenance
}

// Renders verification language ONLY when backed by provenance. With no
// provenance it renders nothing — the UI never claims verified/cross-checked
// without evidence.
export function ProvenanceLine({ provenance }: Props) {
  if (!provenance) return null

  const date = new Date(provenance.asOf).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
  })

  if (provenance.crossChecked) {
    return (
      <span style={{ fontSize: 11, fontWeight: 600, color: theme.muted }}>
        Cross-checked across {provenance.sourceCount} sources · as of {date}
      </span>
    )
  }

  return (
    <span style={{ fontSize: 11, fontWeight: 600, color: theme.muted }}>
      {provenance.sourceCount} source{provenance.sourceCount === 1 ? '' : 's'} · as of {date}
    </span>
  )
}
