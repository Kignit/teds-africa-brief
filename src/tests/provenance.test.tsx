import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ProvenanceLine } from '../components/Provenance'

describe('ProvenanceLine', () => {
  it('renders no verification language without provenance', () => {
    const { container } = render(<ProvenanceLine />)
    expect(container.textContent ?? '').not.toMatch(/verified|cross-checked/i)
  })

  it('shows cross-checked language only when provenance is cross-checked', () => {
    render(
      <ProvenanceLine
        provenance={{
          sourceIds: ['a', 'b'],
          asOf: '2026-05-29T06:00:00.000Z',
          crossChecked: true,
          sourceCount: 2,
        }}
      />,
    )
    expect(screen.getByText(/cross-checked across 2 sources/i)).toBeInTheDocument()
  })

  it('a single source is not described as cross-checked', () => {
    const { container } = render(
      <ProvenanceLine
        provenance={{
          sourceIds: ['a'],
          asOf: '2026-05-29T06:00:00.000Z',
          crossChecked: false,
          sourceCount: 1,
        }}
      />,
    )
    expect(container.textContent ?? '').not.toMatch(/cross-checked/i)
    expect(container.textContent ?? '').toMatch(/1 source/i)
  })
})
