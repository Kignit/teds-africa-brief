import type { BriefDraft } from '../../domain/brief'
import type { GateViolation, PublishGateResult } from '../../domain/gate'
import { isInventedSpread } from '../verification/spreads'

// The publish gate is the mechanical enforcement of the trust rules. A brief is
// only publishable when this returns passed: true.
export function runPublishGate(brief: BriefDraft): PublishGateResult {
  const violations: GateViolation[] = []

  for (const f of brief.figures) {
    if (f.status !== 'verified') {
      violations.push({
        rule: 'unverified_figure',
        detail: `${f.metric} is ${f.status}`,
        ref: f.id,
      })
    }
    if (f.sourceIds.length === 0) {
      violations.push({
        rule: 'figure_missing_source',
        detail: `${f.metric} has no source`,
        ref: f.id,
      })
    }
    if (!f.asOf || Number.isNaN(Date.parse(f.asOf))) {
      violations.push({
        rule: 'figure_missing_timestamp',
        detail: `${f.metric} has no valid timestamp`,
        ref: f.id,
      })
    }
    if (!f.validation.withinRange) {
      violations.push({
        rule: 'figure_out_of_range',
        detail: `${f.metric} failed range validation`,
        ref: f.id,
      })
    }
    if (isInventedSpread(f)) {
      violations.push({
        rule: 'invented_spread',
        detail: `${f.metric} has no permitted source`,
        ref: f.id,
      })
    }
  }

  for (const e of brief.events) {
    if (e.status === 'unconfirmed') {
      violations.push({
        rule: 'uncorroborated_event',
        detail: `event ${e.id} is unconfirmed`,
        ref: e.id,
      })
    }
  }

  const figById = new Map(brief.figures.map((f) => [f.id, f]))
  const evById = new Map(brief.events.map((e) => [e.id, e]))
  for (const c of brief.claims) {
    if (!c.verified) continue
    const figuresOk = c.figureIds.every((id) => figById.get(id)?.status === 'verified')
    const eventsOk = c.eventIds.every((id) => {
      const ev = evById.get(id)
      return ev !== undefined && ev.status !== 'unconfirmed'
    })
    if (!figuresOk || !eventsOk) {
      violations.push({
        rule: 'unbacked_provenance_claim',
        detail: `claim ${c.id} is marked verified without verified backing`,
        ref: c.id,
      })
    }
  }

  return { passed: violations.length === 0, violations }
}

// Convenience: returns the brief flipped to 'published' only if the gate passes.
export function publish(brief: BriefDraft): { brief: BriefDraft; gate: PublishGateResult } {
  const gate = runPublishGate(brief)
  return { brief: gate.passed ? { ...brief, status: 'published' } : brief, gate }
}
