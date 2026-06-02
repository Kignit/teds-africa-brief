import { describe, it, expect } from 'vitest'
import { runPublishGate } from '../server/publishing/publishGate'
import { knownSourceIds } from '../server/verification/sources'
import { SOURCES } from '../data/sources'
import { CAUSAL_METHODOLOGIES } from '../server/analysis/methodologies'
import type { BriefDraft } from '../domain/brief'
import type { Claim } from '../domain/claim'
import type { CountryProfile } from '../domain/country'
import type { Event } from '../domain/event'
import type { Methodology } from '../domain/methodology'

const AS_OF = '2026-05-29T06:00:00.000Z'
const known = knownSourceIds(SOURCES)
const DEBT_INDICATOR = 'DT.DOD.DECT.GN.ZS'

// The real, registry-approved causal rule for the dollar/rates shock.
const SHOCK = 'dollar_rates_shock'
const CAUSAL = CAUSAL_METHODOLOGIES[SHOCK]

// An approved banding methodology, supplied to the gate as an injected registry
// entry (the real banding methodology ships draft). The brief must carry a copy.
const APPROVED_DEBT: Methodology = {
  id: 'method.debt',
  name: 'Debt banding',
  version: '1.0.0',
  description: 'test',
  kind: 'banding',
  inputs: ['externalDebtPctGni'],
  bands: [{ label: 'high', gte: 50 }],
  owner: 'test',
  status: 'approved',
}
const REGISTRY = [APPROVED_DEBT]
const opts = { knownSourceIds: known, methodologyRegistry: REGISTRY }

function corroboratedEvent(): Event {
  return {
    id: 'e1',
    title: 'Fed signals a cut and the dollar softens',
    summary: '',
    occurredAt: AS_OF,
    countryCodes: [],
    topic: '',
    status: 'corroborated',
    corroboration: {
      newsItemIds: ['n1', 'n2'],
      sourceIds: ['src.businessday_ng', 'src.nation_ke'],
      independentSourceCount: 2,
      primarySourceCount: 0,
    },
  }
}

function causalClaim(over: Partial<Claim> = {}): Claim {
  return {
    id: 'c1',
    kind: 'causal',
    text: 'XX: a softer dollar trims hard-currency debt cost',
    figureIds: [],
    eventIds: ['e1'],
    profileFields: ['XX.dollarDebtExposure'],
    profileSourceIds: ['src.worldbank'],
    methodologyIds: [APPROVED_DEBT.id, CAUSAL.id],
    shockType: SHOCK,
    verified: true,
    ...over,
  }
}

function validProfile(): CountryProfile {
  return {
    code: 'XX',
    name: 'XX',
    externalDebtPctGni: 60,
    dollarDebtExposure: 'high',
    evidence: {
      externalDebtPctGni: { sourceIds: ['src.worldbank'], asOf: AS_OF, indicator: DEBT_INDICATOR },
      dollarDebtExposure: {
        sourceIds: ['src.worldbank'],
        asOf: AS_OF,
        methodologyId: APPROVED_DEBT.id,
      },
    },
    methodologies: [APPROVED_DEBT],
  }
}

// Self-contained brief: carries the profiles + every methodology its claims rely on.
function brief(over: Partial<BriefDraft>): BriefDraft {
  return {
    id: 'b',
    date: '2026-05-29',
    edition: 'daily',
    status: 'draft',
    dataMode: 'live',
    sections: [],
    claims: [causalClaim()],
    figures: [],
    events: [corroboratedEvent()],
    profiles: [validProfile()],
    methodologies: [APPROVED_DEBT, CAUSAL],
    ...over,
  }
}

function rules(b: BriefDraft): string[] {
  return runPublishGate(b, opts).violations.map((v) => v.rule)
}

describe('publish gate — exact claim-level evidence', () => {
  it('passes a fully valid, registry-backed, self-contained brief', () => {
    const res = runPublishGate(brief({}), opts)
    expect(res.passed).toBe(true)
    expect(res.violations).toHaveLength(0)
  })

  it('rejects empty profileSourceIds when the claim cites a profile field', () => {
    expect(rules(brief({ claims: [causalClaim({ profileSourceIds: [] })] }))).toContain(
      'profile_source_mismatch',
    )
  })

  it('rejects a wrong (registered) source id', () => {
    expect(
      rules(brief({ claims: [causalClaim({ profileSourceIds: ['src.comtrade'] })] })),
    ).toContain('profile_source_mismatch')
  })

  it('rejects an extra bogus source id', () => {
    expect(
      rules(brief({ claims: [causalClaim({ profileSourceIds: ['src.worldbank', 'src.bogus'] })] })),
    ).toContain('profile_source_mismatch')
  })

  it('rejects a derived field whose methodology the claim omits', () => {
    expect(rules(brief({ claims: [causalClaim({ methodologyIds: [CAUSAL.id] })] }))).toContain(
      'methodology_missing',
    )
  })

  it('rejects a profile field with no profile in the brief', () => {
    expect(rules(brief({ profiles: [] }))).toContain('profile_evidence_missing')
  })

  it('rejects a profile field that fails its source contract', () => {
    const profile: CountryProfile = {
      ...validProfile(),
      evidence: {
        externalDebtPctGni: { sourceIds: ['src.comtrade'], asOf: AS_OF, indicator: DEBT_INDICATOR },
        dollarDebtExposure: {
          sourceIds: ['src.worldbank'],
          asOf: AS_OF,
          methodologyId: APPROVED_DEBT.id,
        },
      },
    }
    expect(rules(brief({ profiles: [profile] }))).toContain('profile_field_contract_mismatch')
  })
})

describe('publish gate — methodologies are self-contained and registry-verified', () => {
  it('rejects a causal claim with correct ids but brief.methodologies: []', () => {
    expect(rules(brief({ methodologies: [] }))).toContain('methodology_missing')
  })

  it('rejects a causal methodology carried with a mutated mechanism/channels', () => {
    const mutated: Methodology = { ...CAUSAL, mechanism: 'tampered', channels: ['growth'] }
    expect(rules(brief({ methodologies: [APPROVED_DEBT, mutated] }))).toContain(
      'methodology_registry_mismatch',
    )
  })

  it('rejects a causal methodology carried with a mutated shockType', () => {
    const mutated: Methodology = { ...CAUSAL, shockType: 'oil_shock' }
    expect(rules(brief({ methodologies: [APPROVED_DEBT, mutated] }))).toContain(
      'methodology_registry_mismatch',
    )
  })

  it('rejects a causal methodology carried with a mutated name, description, or owner', () => {
    for (const mutated of [
      { ...CAUSAL, name: 'tampered' },
      { ...CAUSAL, description: 'tampered' },
      { ...CAUSAL, owner: 'tampered' },
    ]) {
      expect(rules(brief({ methodologies: [APPROVED_DEBT, mutated] }))).toContain(
        'methodology_registry_mismatch',
      )
    }
  })

  it('rejects an unused fake approved methodology carried by the brief', () => {
    const unusedFake: Methodology = { ...APPROVED_DEBT, id: 'method.unused.fake' }
    expect(rules(brief({ methodologies: [APPROVED_DEBT, CAUSAL, unusedFake] }))).toContain(
      'methodology_extra',
    )
  })

  it('rejects an unused real registry methodology not required by any claim', () => {
    // a genuine, approved registry rule — but no verified claim needs it here
    const unusedReal = CAUSAL_METHODOLOGIES.oil_shock
    expect(rules(brief({ methodologies: [APPROVED_DEBT, CAUSAL, unusedReal] }))).toContain(
      'methodology_extra',
    )
  })

  it('rejects a duplicate methodology id, even if one copy is valid', () => {
    expect(rules(brief({ methodologies: [APPROVED_DEBT, CAUSAL, CAUSAL] }))).toContain(
      'methodology_duplicate',
    )
  })

  it('rejects a derived methodology the profile approves but the brief omits', () => {
    // profile + registry both know APPROVED_DEBT, but the brief does not carry it.
    expect(rules(brief({ methodologies: [CAUSAL] }))).toContain('methodology_missing')
  })

  it('rejects a fake approved banding methodology not in the registry', () => {
    const fake: Methodology = { ...APPROVED_DEBT, id: 'method.fake.debt' }
    const profile: CountryProfile = {
      ...validProfile(),
      evidence: {
        externalDebtPctGni: {
          sourceIds: ['src.worldbank'],
          asOf: AS_OF,
          indicator: DEBT_INDICATOR,
        },
        dollarDebtExposure: { sourceIds: ['src.worldbank'], asOf: AS_OF, methodologyId: fake.id },
      },
      methodologies: [fake],
    }
    expect(
      rules(
        brief({
          profiles: [profile],
          methodologies: [fake, CAUSAL],
          claims: [causalClaim({ methodologyIds: [fake.id, CAUSAL.id] })],
        }),
      ),
    ).toContain('methodology_not_approved')
  })

  it('rejects a brief-declared causal methodology not in the registry', () => {
    const fakeCausal: Methodology = {
      id: 'method.causal.fake.v1',
      name: 'Fake causal',
      version: '1.0.0',
      description: 'x',
      kind: 'causal',
      inputs: [],
      bands: [],
      shockType: SHOCK,
      status: 'approved',
      owner: 'attacker',
    }
    const res = rules(
      brief({
        methodologies: [APPROVED_DEBT, CAUSAL, fakeCausal],
        claims: [causalClaim({ methodologyIds: [APPROVED_DEBT.id, CAUSAL.id, fakeCausal.id] })],
      }),
    )
    expect(res).toContain('methodology_not_approved')
  })

  it('rejects an approved causal methodology for the wrong shock', () => {
    const claim = causalClaim({
      profileFields: [],
      profileSourceIds: [],
      shockType: 'oil_shock',
      methodologyIds: [CAUSAL.id],
    })
    expect(rules(brief({ claims: [claim] }))).toContain('causal_methodology_shock_mismatch')
  })

  it('rejects a draft (unclassified) causal methodology', () => {
    const claim = causalClaim({
      profileFields: [],
      profileSourceIds: [],
      shockType: 'unclassified',
      methodologyIds: [CAUSAL_METHODOLOGIES.unclassified.id],
    })
    expect(rules(brief({ claims: [claim] }))).toContain('causal_methodology_missing')
  })

  it('rejects an event-only causal claim with no causal methodology', () => {
    const claim = causalClaim({ profileFields: [], profileSourceIds: [], methodologyIds: [] })
    expect(rules(brief({ claims: [claim] }))).toContain('causal_methodology_missing')
  })

  it('passes an event-only causal claim citing the exact shock-bound registry methodology', () => {
    const claim = causalClaim({
      profileFields: [],
      profileSourceIds: [],
      methodologyIds: [CAUSAL.id],
    })
    // event-only claim requires only the causal rule — carrying the banding method
    // too would be an unused extra, so the brief carries exactly [CAUSAL].
    const res = runPublishGate(brief({ claims: [claim], methodologies: [CAUSAL] }), opts)
    expect(res.passed).toBe(true)
  })
})
