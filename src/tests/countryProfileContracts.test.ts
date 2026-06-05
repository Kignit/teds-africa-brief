import { describe, it, expect } from 'vitest'
import {
  countryProfileEvidenceReasons,
  verifiedCountryProfiles,
} from '../server/verification/countryProfiles'
import { knownSourceIds } from '../server/verification/sources'
import { SOURCES } from '../data/sources'
import type { CountryProfile } from '../domain/country'
import type { Methodology } from '../domain/methodology'

const AS_OF = '2026-05-29T06:00:00.000Z'
const known = knownSourceIds(SOURCES)
const DEBT_INDICATOR = 'DT.DOD.DECT.GN.ZS'

const APPROVED_DEBT: Methodology = {
  id: 'method.debt.approved',
  name: 'Debt banding',
  version: '1.0.0',
  description: 'test',
  kind: 'banding',
  inputs: ['externalDebtPctGni'],
  bands: [{ label: 'high', gte: 50 }],
  owner: 'test',
  status: 'approved',
}

// An approved petroleum-trade banding methodology, to exercise the derived oilStance contract.
const APPROVED_OIL: Methodology = {
  id: 'method.oil.approved',
  name: 'Oil-stance banding',
  version: '1.0.0',
  description: 'test',
  kind: 'banding',
  inputs: ['petroleumTrade'],
  bands: [
    { label: 'exporter', gte: 0.2 },
    { label: 'neutral', gte: -0.2, lt: 0.2 },
    { label: 'importer', lt: -0.2 },
  ],
  minInputUsd: 1_000_000_000,
  owner: 'test',
  status: 'approved',
}

const validRawDebt = { sourceIds: ['src.worldbank'], asOf: AS_OF, indicator: DEBT_INDICATOR }

// A contract-valid raw petroleumTrade evidence: single source, reporter, HS-27 codes, ref year.
const validPetroleum = {
  sourceIds: ['src.comtrade'],
  asOf: AS_OF,
  reporterCode: '566',
  classification: 'HS',
  productCodes: ['27'],
  refYear: 2022,
}

function validComtrade(flowCode: string) {
  return {
    sourceIds: ['src.comtrade'],
    asOf: AS_OF,
    reporterCode: '566',
    flowCode,
    classification: 'HS',
    productCodes: ['27'],
    refYear: 2022,
  }
}

function reasons(p: CountryProfile): string[] {
  return countryProfileEvidenceReasons(p, known)
}
function isRejected(p: CountryProfile): boolean {
  return verifiedCountryProfiles([p], known).rejected.length === 1
}

describe('country-profile field-source contracts', () => {
  it('accepts a profile whose every field matches its source contract', () => {
    const p: CountryProfile = {
      code: 'XX',
      name: 'XX',
      externalDebtPctGni: 60,
      keyExports: ['mineral fuels, oils'],
      importDependence: ['machinery'],
      evidence: {
        externalDebtPctGni: validRawDebt,
        keyExports: validComtrade('X'),
        importDependence: validComtrade('M'),
      },
    }
    expect(reasons(p)).toEqual([])
    expect(isRejected(p)).toBe(false)
  })

  it('rejects Comtrade exports that lack product-level metadata', () => {
    const p: CountryProfile = {
      code: 'XX',
      name: 'XX',
      externalDebtPctGni: 60,
      keyExports: ['fuel'],
      evidence: {
        externalDebtPctGni: validRawDebt,
        // right source, but no reporter/flow/scheme/products/year
        keyExports: { sourceIds: ['src.comtrade'], asOf: AS_OF },
      },
    }
    expect(reasons(p).some((r) => r.includes('keyExports') && /product codes/.test(r))).toBe(true)
    expect(isRejected(p)).toBe(true)
  })

  // A registered source is necessary but NOT sufficient: src.comtrade is in the
  // registry, but it is not the contract source for external debt.
  it('rejects externalDebtPctGni sourced from Comtrade (wrong source)', () => {
    const p: CountryProfile = {
      code: 'XX',
      name: 'XX',
      externalDebtPctGni: 60,
      evidence: {
        externalDebtPctGni: { sourceIds: ['src.comtrade'], asOf: AS_OF, indicator: DEBT_INDICATOR },
      },
    }
    expect(reasons(p).some((r) => r.includes('externalDebtPctGni') && /not allowed/.test(r))).toBe(
      true,
    )
    expect(isRejected(p)).toBe(true)
  })

  it('rejects externalDebtPctGni with the wrong indicator', () => {
    const p: CountryProfile = {
      code: 'XX',
      name: 'XX',
      externalDebtPctGni: 60,
      evidence: {
        externalDebtPctGni: { sourceIds: ['src.worldbank'], asOf: AS_OF, indicator: 'WRONG.CODE' },
      },
    }
    expect(reasons(p).some((r) => /indicator/.test(r))).toBe(true)
    expect(isRejected(p)).toBe(true)
  })

  it('rejects keyExports sourced from World Bank (wrong source)', () => {
    const p: CountryProfile = {
      code: 'XX',
      name: 'XX',
      externalDebtPctGni: 60,
      keyExports: ['fuel'],
      evidence: {
        externalDebtPctGni: validRawDebt,
        keyExports: { sourceIds: ['src.worldbank'], asOf: AS_OF },
      },
    }
    expect(reasons(p).some((r) => r.includes('keyExports') && /not allowed/.test(r))).toBe(true)
    expect(isRejected(p)).toBe(true)
  })

  it('rejects importDependence sourced from World Bank (wrong source)', () => {
    const p: CountryProfile = {
      code: 'XX',
      name: 'XX',
      externalDebtPctGni: 60,
      importDependence: ['fuel'],
      evidence: {
        externalDebtPctGni: validRawDebt,
        importDependence: { sourceIds: ['src.worldbank'], asOf: AS_OF },
      },
    }
    expect(reasons(p).some((r) => r.includes('importDependence') && /not allowed/.test(r))).toBe(
      true,
    )
    expect(isRejected(p)).toBe(true)
  })

  it('rejects a derived label whose raw input provenance is invalid', () => {
    const p: CountryProfile = {
      code: 'XX',
      name: 'XX',
      externalDebtPctGni: 60,
      dollarDebtExposure: 'high',
      evidence: {
        // raw input from the wrong source — invalid provenance
        externalDebtPctGni: { sourceIds: ['src.comtrade'], asOf: AS_OF, indicator: DEBT_INDICATOR },
        dollarDebtExposure: {
          sourceIds: ['src.worldbank'],
          asOf: AS_OF,
          methodologyId: APPROVED_DEBT.id,
        },
      },
      methodologies: [APPROVED_DEBT],
    }
    expect(reasons(p).some((r) => r.includes('externalDebtPctGni') && /not allowed/.test(r))).toBe(
      true,
    )
    expect(isRejected(p)).toBe(true)
  })

  // --- derived oilStance contract (Phase 2): an approved petroleumTrade banding methodology
  // must produce it, AND the underlying raw petroleumTrade must itself be contract-valid. ---
  function validOilStanceProfile(): CountryProfile {
    return {
      code: 'XX',
      name: 'XX',
      externalDebtPctGni: 60,
      petroleumTrade: { exportValueUsd: 50e9, importValueUsd: 20e9, refYear: 2022 },
      oilStance: 'exporter',
      evidence: {
        externalDebtPctGni: validRawDebt,
        petroleumTrade: { ...validPetroleum },
        oilStance: { sourceIds: ['src.comtrade'], asOf: AS_OF, methodologyId: APPROVED_OIL.id },
      },
      methodologies: [APPROVED_OIL],
    }
  }

  it('accepts a derived oilStance backed by an approved petroleumTrade methodology', () => {
    const p = validOilStanceProfile()
    expect(reasons(p)).toEqual([])
    expect(isRejected(p)).toBe(false)
  })

  it('rejects oilStance whose source and methodology do not match its contract', () => {
    // Wrong source for oil stance, a debt (not petroleum) methodology, and no petroleumTrade.
    const p: CountryProfile = {
      code: 'XX',
      name: 'XX',
      externalDebtPctGni: 60,
      oilStance: 'exporter',
      evidence: {
        externalDebtPctGni: validRawDebt,
        oilStance: { sourceIds: ['src.worldbank'], asOf: AS_OF, methodologyId: APPROVED_DEBT.id },
      },
      methodologies: [APPROVED_DEBT],
    }
    const rs = reasons(p)
    expect(rs.some((r) => r.includes('oilStance') && /not allowed/.test(r))).toBe(true)
    expect(rs.some((r) => r.includes('oilStance') && /do not match contract inputs/.test(r))).toBe(
      true,
    )
    expect(rs.some((r) => /requires raw input petroleumTrade, which is absent/.test(r))).toBe(true)
    expect(isRejected(p)).toBe(true)
  })

  it('rejects a derived oilStance with no methodology reference', () => {
    const p = validOilStanceProfile()
    p.evidence.oilStance = { sourceIds: ['src.comtrade'], asOf: AS_OF } // no methodologyId
    p.methodologies = []
    expect(reasons(p).some((r) => r.includes('oilStance') && /without a methodology/.test(r))).toBe(
      true,
    )
    expect(isRejected(p)).toBe(true)
  })

  it('rejects a derived oilStance backed by a draft (unapproved) methodology', () => {
    const draftOil: Methodology = { ...APPROVED_OIL, id: 'method.oil.draft', status: 'draft' }
    const p = validOilStanceProfile()
    p.evidence.oilStance = { sourceIds: ['src.comtrade'], asOf: AS_OF, methodologyId: draftOil.id }
    p.methodologies = [draftOil]
    expect(reasons(p).some((r) => r.includes('oilStance') && /not approved/.test(r))).toBe(true)
    expect(isRejected(p)).toBe(true)
  })

  it('rejects a derived oilStance when the raw petroleumTrade input is absent', () => {
    const p: CountryProfile = {
      code: 'XX',
      name: 'XX',
      externalDebtPctGni: 60,
      oilStance: 'exporter',
      evidence: {
        externalDebtPctGni: validRawDebt,
        oilStance: { sourceIds: ['src.comtrade'], asOf: AS_OF, methodologyId: APPROVED_OIL.id },
      },
      methodologies: [APPROVED_OIL],
    }
    expect(
      reasons(p).some((r) => /requires raw input petroleumTrade, which is absent/.test(r)),
    ).toBe(true)
    expect(isRejected(p)).toBe(true)
  })

  it('rejects a derived oilStance whose underlying petroleumTrade has invalid provenance', () => {
    const p = validOilStanceProfile()
    // The raw input is sourced from a source its own contract forbids.
    p.evidence.petroleumTrade = { ...validPetroleum, sourceIds: ['src.worldbank'] }
    expect(reasons(p).some((r) => r.includes('petroleumTrade') && /not allowed/.test(r))).toBe(true)
    expect(isRejected(p)).toBe(true)
  })
})
