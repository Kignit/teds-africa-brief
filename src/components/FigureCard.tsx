import type { VerifiedFigure } from '../domain/figure'
import type { Provenance } from '../domain/provenance'
import { ProvenanceLine } from './Provenance'
import { sourceName } from '../data/sources'
import { theme } from '../app/theme'

function provenanceOf(f: VerifiedFigure): Provenance {
  return {
    sourceIds: f.sourceIds,
    asOf: f.asOf,
    crossChecked: f.sourceIds.length >= 2,
    sourceCount: f.sourceIds.length,
  }
}

export function FigureCard({ figure }: { figure: VerifiedFigure }) {
  return (
    <div
      style={{
        background: theme.card,
        borderRadius: 16,
        padding: 14,
        boxShadow: theme.shadow,
      }}
    >
      <div style={{ fontSize: 12.5, fontWeight: 700, color: theme.ink }}>{figure.label}</div>
      <div
        style={{
          fontFamily: theme.mono,
          fontSize: 22,
          fontWeight: 700,
          color: theme.ink,
          marginTop: 4,
        }}
      >
        {figure.value}
        <span style={{ fontSize: 12, color: theme.muted, marginLeft: 4 }}>{figure.unit}</span>
      </div>
      <div style={{ marginTop: 8 }}>
        <ProvenanceLine provenance={provenanceOf(figure)} />
      </div>
      <div style={{ fontSize: 10.5, color: theme.muted, marginTop: 4 }}>
        {figure.sourceIds.map(sourceName).join(', ')}
      </div>
    </div>
  )
}
