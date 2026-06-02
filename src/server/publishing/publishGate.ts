import type { BriefDraft } from '../../domain/brief'
import type { CountryProfileEvidenceField } from '../../domain/country'
import type { GateRule, GateViolation, PublishGateResult } from '../../domain/gate'
import { isInventedSpread } from '../verification/spreads'
import { unknownIds } from '../verification/sources'
import {
  countryProfileFieldReasons,
  DERIVED_COUNTRY_PROFILE_FIELDS,
} from '../verification/countryProfiles'
import type { Methodology } from '../../domain/methodology'
import { METHODOLOGY_REGISTRY } from '../analysis/methodologies'

export interface PublishGateOptions {
  /**
   * When provided, every source id referenced by a figure or event must be a
   * member of this set, otherwise the brief is blocked. Live ingestion always
   * passes the source registry here so the gate is the final authority on
   * provenance. Omitted only in isolated tests that do not exercise registry
   * enforcement.
   */
  knownSourceIds?: Set<string>
  /**
   * Extra approved-methodology registry entries, merged over the built-in
   * METHODOLOGY_REGISTRY. The gate validates every methodology a brief carries
   * against this registry — never against the brief's self-declared status. Used
   * by tests to supply approved synthetic methodologies.
   */
  methodologyRegistry?: Methodology[]
}

// The publish gate is the mechanical enforcement of the trust rules. A brief is
// only publishable when this returns passed: true.
export function runPublishGate(
  brief: BriefDraft,
  opts: PublishGateOptions = {},
): PublishGateResult {
  const violations: GateViolation[] = []
  const known = opts.knownSourceIds

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
    if (known) {
      for (const id of unknownIds(f.sourceIds, known)) {
        violations.push({
          rule: 'unknown_source',
          detail: `${f.metric} references source ${id}, which is not in the registry`,
          ref: f.id,
        })
      }
    }
  }

  for (const e of brief.events) {
    if (e.corroboration.sourceIds.length === 0) {
      violations.push({
        rule: 'event_missing_source',
        detail: `event ${e.id} has no source evidence`,
        ref: e.id,
      })
    }
    if (e.corroboration.newsItemIds.length === 0) {
      violations.push({
        rule: 'event_missing_news_item',
        detail: `event ${e.id} has no originating news items`,
        ref: e.id,
      })
    }
    if (
      e.status === 'corroborated' &&
      (e.corroboration.independentSourceCount < 2 || e.corroboration.sourceIds.length < 2)
    ) {
      violations.push({
        rule: 'event_corroboration_mismatch',
        detail: `event ${e.id} is marked corroborated without two independent sources`,
        ref: e.id,
      })
    }
    if (e.status === 'unconfirmed') {
      violations.push({
        rule: 'uncorroborated_event',
        detail: `event ${e.id} is unconfirmed`,
        ref: e.id,
      })
    }
    if (known) {
      for (const id of unknownIds(e.corroboration.sourceIds, known)) {
        violations.push({
          rule: 'unknown_source',
          detail: `event ${e.id} references source ${id}, which is not in the registry`,
          ref: e.id,
        })
      }
    }
  }

  const figById = new Map(brief.figures.map((f) => [f.id, f]))
  const evById = new Map(brief.events.map((e) => [e.id, e]))
  for (const c of brief.claims) {
    // A publishable brief carries only verified claims. Single-source/unconfirmed
    // events are stored as evidence but must never reach a published brief as analysis.
    if (!c.verified) {
      violations.push({
        rule: 'unverified_claim',
        detail: `claim ${c.id} is not verified and cannot appear in a published brief`,
        ref: c.id,
      })
      continue
    }
    const hasBacking = c.figureIds.length > 0 || c.eventIds.length > 0
    const figuresOk = c.figureIds.every((id) => figById.get(id)?.status === 'verified')
    const eventsOk = c.eventIds.every((id) => {
      const ev = evById.get(id)
      return ev !== undefined && ev.status !== 'unconfirmed'
    })
    const singleSourceEvent = c.eventIds.find((id) => evById.get(id)?.status === 'single_source')
    if (singleSourceEvent) {
      violations.push({
        rule: 'single_source_verified_claim',
        detail: `claim ${c.id} is marked verified but references single-source event ${singleSourceEvent}`,
        ref: c.id,
      })
    }
    if (!hasBacking || !figuresOk || !eventsOk) {
      violations.push({
        rule: 'unbacked_provenance_claim',
        detail: `claim ${c.id} is marked verified without verified backing`,
        ref: c.id,
      })
    }
  }

  // Sections may only reference claims the brief carries, and only verified ones.
  const claimById = new Map(brief.claims.map((c) => [c.id, c]))
  for (const section of brief.sections) {
    for (const claimId of section.claimIds) {
      const claim = claimById.get(claimId)
      if (!claim) {
        violations.push({
          rule: 'invalid_section_claim',
          detail: `section ${section.id} references missing claim ${claimId}`,
          ref: section.id,
        })
      } else if (!claim.verified) {
        violations.push({
          rule: 'invalid_section_claim',
          detail: `section ${section.id} references unverified claim ${claimId}`,
          ref: section.id,
        })
      }
    }
  }

  // Profile + methodology evidence for verified causal claims. Claim-level evidence
  // is not decorative: the claim's own source/methodology arrays must EXACTLY match
  // what its cited fields resolve to in the brief, and the claim must cite the exact
  // causal rule bound to its shock — validated against the APPROVED REGISTRY, not the
  // brief's self-declared methodologies (so a brief cannot self-attest approval).
  const profileByCode = new Map(brief.profiles.map((p) => [p.code, p]))
  const methodologyById = new Map(brief.methodologies.map((m) => [m.id, m]))
  const derivedFields = new Set<string>(DERIVED_COUNTRY_PROFILE_FIELDS)
  // The approved-methodology registry is the authority; tests may inject entries.
  const registry = new Map(METHODOLOGY_REGISTRY)
  for (const m of opts.methodologyRegistry ?? []) registry.set(m.id, m)
  // A methodology a claim relies on must be carried by the brief (self-contained),
  // exist in the registry as approved, and match the registry object byte-for-byte
  // (so a brief cannot self-attest approval or carry a mutated copy).
  const auditMethodology = (id: string): GateRule | null => {
    const carried = methodologyById.get(id)
    if (!carried) return 'methodology_missing'
    const entry = registry.get(id)
    if (!entry || entry.status !== 'approved') return 'methodology_not_approved'
    if (!sameMethodology(carried, entry)) return 'methodology_registry_mismatch'
    return null
  }
  // The brief's methodology section must be EXACTLY what the verified causal claims
  // require — accumulated here, then checked for extras/duplicates after the loop.
  const requiredMethodologyIds = new Set<string>()

  for (const c of brief.claims) {
    if (!c.verified || c.kind !== 'causal') continue

    const requiredSourceIds = new Set<string>()
    const requiredFieldMethodologyIds = new Set<string>()
    let profileFieldsResolved = true

    for (const cited of c.profileFields) {
      const dot = cited.indexOf('.')
      const code = dot >= 0 ? cited.slice(0, dot) : ''
      const field = (dot >= 0 ? cited.slice(dot + 1) : cited) as CountryProfileEvidenceField
      const profile = profileByCode.get(code)
      const fieldEvidence = profile?.evidence[field]
      if (!profile || !fieldEvidence) {
        violations.push({
          rule: 'profile_evidence_missing',
          detail: `claim ${c.id} cites profile field ${cited} but the brief carries no such profile evidence`,
          ref: c.id,
        })
        profileFieldsResolved = false
        continue
      }
      for (const reason of countryProfileFieldReasons(profile, field, known)) {
        violations.push({
          rule: 'profile_field_contract_mismatch',
          detail: `claim ${c.id} profile field ${cited}: ${reason}`,
          ref: c.id,
        })
      }
      for (const id of fieldEvidence.sourceIds) requiredSourceIds.add(id)
      if (derivedFields.has(field) && fieldEvidence.methodologyId) {
        requiredFieldMethodologyIds.add(fieldEvidence.methodologyId)
      }
    }
    for (const id of requiredFieldMethodologyIds) requiredMethodologyIds.add(id)

    // Claim-level source evidence must exactly match the sources of its cited
    // profile fields — no missing, no wrong, and no extra source ids.
    if (profileFieldsResolved && !sameStringSet(requiredSourceIds, c.profileSourceIds)) {
      violations.push({
        rule: 'profile_source_mismatch',
        detail: `claim ${c.id} profileSourceIds [${c.profileSourceIds.join(', ')}] do not match the sources required by its cited fields [${[...requiredSourceIds].join(', ')}]`,
        ref: c.id,
      })
    }

    // Every derived field's methodology must be cited, carried by the brief, and
    // match an approved registry entry — not merely be approved on the profile.
    const citedMethodologies = new Set(c.methodologyIds)
    for (const id of requiredFieldMethodologyIds) {
      if (!citedMethodologies.has(id)) {
        violations.push({
          rule: 'methodology_missing',
          detail: `claim ${c.id} omits methodology ${id} required by a derived profile field`,
          ref: c.id,
        })
        continue
      }
      const rule = auditMethodology(id)
      if (rule) {
        violations.push({
          rule,
          detail: `claim ${c.id} derived-field methodology ${id} failed registry audit (${rule})`,
          ref: c.id,
        })
      }
    }

    // The claim must cite the exact causal rule bound to its shock; that rule must
    // be approved in the registry, carried by the brief, and unmutated — never
    // self-attested by the brief.
    const expectedCausalId = c.shockType ? `method.causal.${c.shockType}.v1` : undefined
    if (expectedCausalId) requiredMethodologyIds.add(expectedCausalId)
    const registryEntry = expectedCausalId ? registry.get(expectedCausalId) : undefined
    const expectedApproved = registryEntry?.status === 'approved'
    if (!expectedCausalId || !expectedApproved || !citedMethodologies.has(expectedCausalId)) {
      violations.push({
        rule: 'causal_methodology_missing',
        detail: `claim ${c.id} must cite the approved causal methodology for its shock (${expectedCausalId ?? 'no shock type'})`,
        ref: c.id,
      })
    } else {
      const rule = auditMethodology(expectedCausalId)
      if (rule) {
        violations.push({
          rule,
          detail: `claim ${c.id} causal methodology ${expectedCausalId} failed registry audit (${rule})`,
          ref: c.id,
        })
      }
    }

    // No other methodology may be cited: a real causal rule for a different shock is
    // a shock mismatch; anything else is a bogus/self-declared or unapproved citation.
    for (const id of citedMethodologies) {
      if (requiredFieldMethodologyIds.has(id) || id === expectedCausalId) continue
      const entry = registry.get(id)
      if (entry && entry.kind === 'causal') {
        violations.push({
          rule: 'causal_methodology_shock_mismatch',
          detail: `claim ${c.id} cites causal methodology ${id}, which is not the rule for its shock (${c.shockType ?? 'none'})`,
          ref: c.id,
        })
      } else if (!methodologyById.has(id)) {
        violations.push({
          rule: 'methodology_missing',
          detail: `claim ${c.id} cites methodology ${id} not present in the brief`,
          ref: c.id,
        })
      } else {
        violations.push({
          rule: 'methodology_not_approved',
          detail: `claim ${c.id} cites methodology ${id}, which is not a required field methodology or the approved causal rule for its shock`,
          ref: c.id,
        })
      }
    }
  }

  // The methodology audit trail must be EXACT: no methodology beyond what a verified
  // causal claim requires, and no id carried twice. (Required-but-omitted is already
  // flagged per-claim as methodology_missing above.)
  const seenMethodologyIds = new Set<string>()
  for (const m of brief.methodologies) {
    if (seenMethodologyIds.has(m.id)) {
      violations.push({
        rule: 'methodology_duplicate',
        detail: `brief carries methodology ${m.id} more than once`,
        ref: m.id,
      })
    }
    seenMethodologyIds.add(m.id)
  }
  for (const id of seenMethodologyIds) {
    if (!requiredMethodologyIds.has(id)) {
      violations.push({
        rule: 'methodology_extra',
        detail: `brief carries methodology ${id}, which no verified causal claim requires`,
        ref: id,
      })
    }
  }

  return { passed: violations.length === 0, violations }
}

function sameStringSet(a: Iterable<string>, b: Iterable<string>): boolean {
  const sa = new Set(a)
  const sb = new Set(b)
  if (sa.size !== sb.size) return false
  for (const x of sa) if (!sb.has(x)) return false
  return true
}

// Whether a brief-carried methodology matches its registry entry on EVERY field —
// so any mutation (incl. name/description/owner) is caught, not just analytical ones.
function sameMethodology(a: Methodology, b: Methodology): boolean {
  return (
    a.id === b.id &&
    a.name === b.name &&
    a.version === b.version &&
    a.description === b.description &&
    a.kind === b.kind &&
    a.owner === b.owner &&
    a.status === b.status &&
    a.shockType === b.shockType &&
    a.mechanism === b.mechanism &&
    JSON.stringify(a.channels ?? null) === JSON.stringify(b.channels ?? null) &&
    JSON.stringify(a.inputs) === JSON.stringify(b.inputs) &&
    JSON.stringify(a.bands) === JSON.stringify(b.bands)
  )
}

// Convenience: returns the brief flipped to 'published' only if the gate passes.
export function publish(
  brief: BriefDraft,
  opts: PublishGateOptions = {},
): { brief: BriefDraft; gate: PublishGateResult } {
  const gate = runPublishGate(brief, opts)
  return { brief: gate.passed ? { ...brief, status: 'published' } : brief, gate }
}
