import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import App from '../app/App'

describe('App', () => {
  it('renders the prototype banner and a verified figure', () => {
    render(<App />)
    expect(screen.getByText(/prototype build/i)).toBeInTheDocument()
    expect(screen.getByText(/NGN \/ USD/i)).toBeInTheDocument()
  })

  it('does not present sample data as live, cross-checked intelligence', () => {
    const { container } = render(<App />)
    expect(container.textContent ?? '').not.toMatch(/cross-checked across \d+ sources/i)
  })

  it('omits unsourced Eurobond spreads instead of faking them', () => {
    const { container } = render(<App />)
    expect(container.textContent ?? '').toMatch(/spreads.*omitted/i)
  })
})
