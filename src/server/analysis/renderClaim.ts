import type { Claim } from '../../domain/claim'
import type { ShockType, Tone, TransmissionChannel } from '../../domain/analysis'
import type { VerifiedFigure } from '../../domain/figure'
import type { Event } from '../../domain/event'

// The single, deterministic seam that turns a claim's STRUCTURED, audited evidence
// into its published text. Publishable claim text is never free prose: it is
// mechanically rendered from enum-only fields (country, shock, tone, channels) and
// resolved figure/event values, so the publish gate can recompute it and reject any
// tampered or invented text — including a future LLM rephrase — that no longer
// matches the evidence. The engine and the gate call the SAME renderer, so a claim's
// text is canonical by construction and re-verifiable byte-for-byte.

const SHOCK_PHRASE: Record<ShockType, string> = {
  oil_shock: 'the oil-price move',
  dollar_rates_shock: 'the dollar and US-rates move',
  inflation_shock: 'the inflation move',
  policy_rate_decision: 'the policy-rate decision',
  fx_move: 'the currency move',
  debt_fiscal_event: 'the debt and fiscal event',
  trade_integration_event: 'deeper trade integration',
  deal_investment_event: 'new investment',
  political_stability_event: 'the political-stability event',
  unclassified: 'the event',
}

const TONE_ADJ: Record<Tone, string> = {
  pos: 'positive',
  neg: 'negative',
  neutral: 'mixed',
}

const CHANNEL_LABEL: Record<TransmissionChannel, string> = {
  fx: 'the currency',
  inflation: 'inflation',
  debt_service: 'debt service',
  fiscal_revenue: 'fiscal revenue',
  trade_balance: 'the trade balance',
  consumers: 'households',
  growth: 'growth',
  political_risk: 'political risk',
}

function joinList(items: string[]): string {
  if (items.length === 0) return 'the broader economy'
  if (items.length === 1) return items[0]
  if (items.length === 2) return `${items[0]} and ${items[1]}`
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`
}

// The grounded clause for a causal effect — a pure function of enums ONLY.
export function causalClause(
  shock: ShockType,
  tone: Tone,
  channels: TransmissionChannel[],
): string {
  const where = joinList(channels.map((c) => CHANNEL_LABEL[c]))
  return `${SHOCK_PHRASE[shock]} is ${TONE_ADJ[tone]} via ${where}`
}

export function renderCausalClaimText(
  countryCode: string,
  shock: ShockType,
  tone: Tone,
  channels: TransmissionChannel[],
): string {
  return `${countryCode}: ${causalClause(shock, tone, channels)}`
}

export function renderFigureClaimText(
  fig: Pick<VerifiedFigure, 'label' | 'value' | 'unit'>,
): string {
  return `${fig.label} is ${fig.value} ${fig.unit}.`
}

export function renderEventClaimText(ev: Pick<Event, 'title'>): string {
  return ev.title
}

export interface ClaimTextContext {
  figureById: Map<string, VerifiedFigure>
  eventById: Map<string, Event>
}

// The canonical text the gate expects for a claim, recomputed from its structured
// fields + resolved evidence. Returns undefined when it cannot be rendered (missing
// structured inputs or unresolved references) — the gate treats undefined as a
// failure, so a claim that cannot be re-derived from evidence can never publish.
export function expectedClaimText(claim: Claim, ctx: ClaimTextContext): string | undefined {
  switch (claim.kind) {
    case 'causal': {
      if (
        claim.countryCode === undefined ||
        claim.tone === undefined ||
        claim.channels === undefined ||
        claim.channels.length === 0 ||
        claim.shockType === undefined
      ) {
        return undefined
      }
      return renderCausalClaimText(claim.countryCode, claim.shockType, claim.tone, claim.channels)
    }
    case 'figure': {
      if (claim.figureIds.length !== 1) return undefined
      const fig = ctx.figureById.get(claim.figureIds[0])
      return fig ? renderFigureClaimText(fig) : undefined
    }
    case 'event': {
      if (claim.eventIds.length !== 1) return undefined
      const ev = ctx.eventById.get(claim.eventIds[0])
      return ev ? renderEventClaimText(ev) : undefined
    }
  }
}
