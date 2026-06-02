import type {
  CountryProfile,
  CountryProfileEvidence,
  CountryProfileEvidenceMap,
  Exposure,
} from '../../domain/country'
import type { Methodology } from '../../domain/methodology'

const AS_OF = '2026-05-29T06:00:00.000Z'

// Synthetic APPROVED methodology for the test markets. The real one ships 'draft'
// (see src/server/analysis/methodologies.ts); tests use an approved one so the
// derived-label paths can be exercised.
export const TEST_DEBT_METHODOLOGY: Methodology = {
  id: 'method.test.debt',
  name: 'Test debt-exposure banding',
  version: '1.0.0',
  description: 'Synthetic banding for test markets.',
  kind: 'banding',
  inputs: ['externalDebtPctGni'],
  bands: [
    { label: 'high', gte: 50 },
    { label: 'medium', gte: 25, lt: 50 },
    { label: 'low', lt: 25 },
  ],
  owner: 'test',
  status: 'approved',
}

function rawDebtEvidence(): CountryProfileEvidence {
  return { sourceIds: ['src.worldbank'], asOf: AS_OF, indicator: 'DT.DOD.DECT.GN.ZS' }
}

function comtradeEvidence(flowCode: string, productCodes: string[]): CountryProfileEvidence {
  return {
    sourceIds: ['src.comtrade'],
    asOf: AS_OF,
    reporterCode: '566',
    flowCode,
    classification: 'HS',
    productCodes,
    refYear: 2022,
  }
}

interface ProfileShape {
  code: string
  name: string
  externalDebtPctGni: number
  dollarDebtExposure: Exposure
  keyExports: string[]
  importDependence: string[]
}

// Builds a fully contract-valid synthetic profile: raw external debt (World Bank +
// indicator), a methodology-derived exposure label, and Comtrade product labels
// with product-level metadata. No uncontracted fields (oil stance, currency regime,
// political sensitivities) — those are exercised via scoreCountryImpact directly.
function profile(p: ProfileShape): CountryProfile {
  const evidence: CountryProfileEvidenceMap = {
    externalDebtPctGni: rawDebtEvidence(),
    dollarDebtExposure: {
      sourceIds: ['src.worldbank'],
      asOf: AS_OF,
      methodologyId: TEST_DEBT_METHODOLOGY.id,
    },
    keyExports: comtradeEvidence('X', ['27']),
    importDependence: comtradeEvidence('M', ['84']),
  }
  return {
    code: p.code,
    name: p.name,
    externalDebtPctGni: p.externalDebtPctGni,
    dollarDebtExposure: p.dollarDebtExposure,
    keyExports: p.keyExports,
    importDependence: p.importDependence,
    evidence,
    methodologies: [TEST_DEBT_METHODOLOGY],
  }
}

// Synthetic profiles only — made-up test markets. Raw debt values are consistent
// with their derived exposure bands. Contract-valid, so they pass strict analysis.
export const TEST_COUNTRY_PROFILES: CountryProfile[] = [
  profile({
    code: 'XA',
    name: 'Exporter Test Market',
    externalDebtPctGni: 60,
    dollarDebtExposure: 'high',
    keyExports: ['test crude'],
    importDependence: ['test wheat'],
  }),
  profile({
    code: 'XB',
    name: 'Importer Test Market',
    externalDebtPctGni: 60,
    dollarDebtExposure: 'high',
    keyExports: ['test services'],
    importDependence: ['test fuel'],
  }),
  profile({
    code: 'XC',
    name: 'Managed Test Market',
    externalDebtPctGni: 30,
    dollarDebtExposure: 'medium',
    keyExports: ['test minerals'],
    importDependence: ['test crude'],
  }),
]

// A profile whose REQUIRED raw backbone (external debt) lacks source provenance —
// must fail verification.
export function unsourcedProfile(): CountryProfile {
  const base = TEST_COUNTRY_PROFILES[0]
  return {
    ...base,
    evidence: {
      ...base.evidence,
      externalDebtPctGni: { sourceIds: [], asOf: AS_OF, indicator: 'DT.DOD.DECT.GN.ZS' },
    },
  }
}

// A profile carrying a derived label with NO methodology reference — must fail
// verification (a classification without an explicit, approved methodology).
export function derivedWithoutMethodologyProfile(): CountryProfile {
  return {
    code: 'XD',
    name: 'Derived Without Methodology',
    externalDebtPctGni: 60,
    dollarDebtExposure: 'high',
    evidence: {
      externalDebtPctGni: rawDebtEvidence(),
      dollarDebtExposure: { sourceIds: ['src.worldbank'], asOf: AS_OF }, // no methodologyId
    },
    methodologies: [],
  }
}

// Profiles that satisfy the strict field-source contracts but carry NO derived
// label — exactly what live mode produces while the debt methodology is draft.
// Used by pipeline tests, where the strict contract gate runs.
function contractValid(code: string, externalDebtPctGni: number): CountryProfile {
  return {
    code,
    name: `${code} market`,
    externalDebtPctGni,
    keyExports: ['mineral fuels, oils'],
    importDependence: ['machinery'],
    evidence: {
      externalDebtPctGni: rawDebtEvidence(),
      keyExports: comtradeEvidence('X', ['27']),
      importDependence: comtradeEvidence('M', ['84']),
    },
  }
}

export const CONTRACT_VALID_PROFILES: CountryProfile[] = [
  contractValid('XA', 60),
  contractValid('XB', 40),
  contractValid('XC', 20),
]
