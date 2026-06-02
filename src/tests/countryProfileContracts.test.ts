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

const validRawDebt = { sourceIds: ['src.worldbank'], asOf: AS_OF, indicator: DEBT_INDICATOR }

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

  it('rejects oilStance — it has no accepted source/methodology contract', () => {
    const p: CountryProfile = {
      code: 'XX',
      name: 'XX',
      externalDebtPctGni: 60,
      oilStance: 'exporter',
      evidence: {
        externalDebtPctGni: validRawDebt,
        // even with a methodology, oil stance has no accepted contract
        oilStance: { sourceIds: ['src.worldbank'], asOf: AS_OF, methodologyId: APPROVED_DEBT.id },
      },
      methodologies: [APPROVED_DEBT],
    }
    expect(
      reasons(p).some((r) => r.includes('oilStance') && /no accepted source contract/.test(r)),
    ).toBe(true)
    expect(isRejected(p)).toBe(true)
  })
})
