import type {
  CountryProfile,
  CountryProfileEvidenceField,
  DerivedCountryProfileField,
  RawCountryProfileField,
  SourcedCountryProfileField,
} from '../../domain/country'
import { unknownIds } from './sources'

export const RAW_COUNTRY_PROFILE_FIELDS: RawCountryProfileField[] = ['externalDebtPctGni']
export const REQUIRED_COUNTRY_PROFILE_FIELDS: RawCountryProfileField[] = ['externalDebtPctGni']

export const DERIVED_COUNTRY_PROFILE_FIELDS: DerivedCountryProfileField[] = [
  'dollarDebtExposure',
  'oilStance',
]

export const SOURCED_COUNTRY_PROFILE_FIELDS: SourcedCountryProfileField[] = [
  'keyExports',
  'importDependence',
  'politicalSensitivities',
  'currencyRegime',
]

export const COUNTRY_PROFILE_EVIDENCE_FIELDS: CountryProfileEvidenceField[] = [
  ...RAW_COUNTRY_PROFILE_FIELDS,
  ...DERIVED_COUNTRY_PROFILE_FIELDS,
  ...SOURCED_COUNTRY_PROFILE_FIELDS,
]

// A field-source contract says exactly which provenance is acceptable for a field.
// A registered source is necessary but NOT sufficient — the source must be the one
// declared for that specific field, with the right indicator/methodology metadata.
// A field with NO contract cannot be accepted at all (e.g. oil stance, currency
// regime, and political sensitivities have no accepted live source yet).
export type FieldContractKind = 'raw' | 'sourced' | 'derived'

export interface FieldSourceContract {
  kind: FieldContractKind
  /** The only source ids permitted for this field. */
  allowedSourceIds: string[]
  /** Required indicator/series code for raw inputs. */
  requiredIndicator?: string
  /** For derived labels: the raw input field(s) the methodology must consume. */
  methodologyInputs?: string[]
  /** For product-level trade fields: require reporter/flow/scheme/products/year. */
  requireProductMetadata?: boolean
}

export type FieldSourceContracts = Partial<Record<CountryProfileEvidenceField, FieldSourceContract>>

export const FIELD_SOURCE_CONTRACTS: FieldSourceContracts = {
  externalDebtPctGni: {
    kind: 'raw',
    allowedSourceIds: ['src.worldbank'],
    requiredIndicator: 'DT.DOD.DECT.GN.ZS',
  },
  // Comtrade (primary) AND OEC (keyless, secondary/official-derived BACI/HS) are both
  // accepted for the trade-product fields. Comtrade is NOT weakened — OEC is added
  // explicitly; both must still carry full product-level metadata.
  keyExports: {
    kind: 'sourced',
    allowedSourceIds: ['src.comtrade', 'src.oec'],
    requireProductMetadata: true,
  },
  importDependence: {
    kind: 'sourced',
    allowedSourceIds: ['src.comtrade', 'src.oec'],
    requireProductMetadata: true,
  },
  dollarDebtExposure: {
    kind: 'derived',
    allowedSourceIds: ['src.worldbank'],
    methodologyInputs: ['externalDebtPctGni'],
  },
  // oilStance, currencyRegime, politicalSensitivities: no accepted contract yet.
}

export interface RejectedCountryProfile {
  code: string
  reasons: string[]
}

function validTimestamp(value: string): boolean {
  return value.length > 0 && !Number.isNaN(Date.parse(value))
}

// Whether the profile carries a value for this field. Optional fields are omitted,
// not blanked, when unsourced.
function hasValue(profile: CountryProfile, field: CountryProfileEvidenceField): boolean {
  switch (field) {
    case 'externalDebtPctGni':
      return profile.externalDebtPctGni !== undefined
    case 'dollarDebtExposure':
      return profile.dollarDebtExposure !== undefined
    case 'oilStance':
      return profile.oilStance !== undefined
    case 'currencyRegime':
      return profile.currencyRegime !== undefined
    case 'keyExports':
      return (profile.keyExports?.length ?? 0) > 0
    case 'importDependence':
      return (profile.importDependence?.length ?? 0) > 0
    case 'politicalSensitivities':
      return (profile.politicalSensitivities?.length ?? 0) > 0
  }
}

// Basic provenance: evidence exists, has a source, a valid timestamp, and (when a
// registry is supplied) resolves to it. Shared by the baseline and strict checks.
function provenanceBasics(
  profile: CountryProfile,
  field: CountryProfileEvidenceField,
  knownSourceIds?: Set<string>,
): string[] {
  const reasons: string[] = []
  const evidence = profile.evidence[field]
  if (!evidence) {
    reasons.push(`${field} missing evidence`)
    return reasons
  }
  if (evidence.sourceIds.length === 0) reasons.push(`${field} missing source`)
  if (!validTimestamp(evidence.asOf)) reasons.push(`${field} missing valid timestamp`)
  if (knownSourceIds) {
    for (const id of unknownIds(evidence.sourceIds, knownSourceIds)) {
      reasons.push(`${field} references unknown source ${id}`)
    }
  }
  return reasons
}

// A derived label must reference a methodology that is present on the profile and
// approved — otherwise it is an unexplained classification.
function methodologyReasons(profile: CountryProfile, field: DerivedCountryProfileField): string[] {
  const methodologyId = profile.evidence[field]?.methodologyId
  if (!methodologyId) {
    return [`${field} is a derived label without a methodology reference`]
  }
  const methodology = (profile.methodologies ?? []).find((m) => m.id === methodologyId)
  if (!methodology) {
    return [`${field} references unknown methodology ${methodologyId}`]
  }
  if (methodology.status !== 'approved') {
    return [`${field} references methodology ${methodologyId}, which is not approved`]
  }
  return []
}

function sameSet(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((x) => b.includes(x))
}

// Strict contract check for one present field: a registered source is necessary
// but not sufficient — it must be the source/indicator/methodology the contract
// declares. Derived labels additionally require their raw inputs to pass too.
function contractReasons(
  profile: CountryProfile,
  field: CountryProfileEvidenceField,
  contracts: FieldSourceContracts,
  knownSourceIds?: Set<string>,
): string[] {
  const contract = contracts[field]
  if (!contract) return [`${field} has no accepted source contract`]

  const reasons = provenanceBasics(profile, field, knownSourceIds)
  const evidence = profile.evidence[field]
  if (!evidence) return reasons // already reported as missing

  for (const id of evidence.sourceIds) {
    if (!contract.allowedSourceIds.includes(id)) {
      reasons.push(`${field} source ${id} is not allowed by its contract`)
    }
  }

  if (contract.kind === 'raw' && contract.requiredIndicator) {
    if (evidence.indicator !== contract.requiredIndicator) {
      reasons.push(
        `${field} requires indicator ${contract.requiredIndicator}, got ${evidence.indicator ?? 'none'}`,
      )
    }
  }

  if (contract.requireProductMetadata) {
    if (!evidence.reporterCode) reasons.push(`${field} missing reporter code`)
    if (!evidence.flowCode) reasons.push(`${field} missing flow code`)
    if (!evidence.classification) reasons.push(`${field} missing commodity classification`)
    if ((evidence.productCodes?.length ?? 0) === 0) reasons.push(`${field} missing product codes`)
    if (evidence.refYear === undefined) reasons.push(`${field} missing reference year`)
  }

  if (contract.kind === 'derived') {
    reasons.push(...methodologyReasons(profile, field as DerivedCountryProfileField))
    const expectedInputs = contract.methodologyInputs ?? []
    const methodology = (profile.methodologies ?? []).find(
      (m) => m.id === evidence.methodologyId && m.status === 'approved',
    )
    if (methodology && !sameSet(methodology.inputs, expectedInputs)) {
      reasons.push(
        `${field} methodology inputs [${methodology.inputs.join(', ')}] do not match contract inputs [${expectedInputs.join(', ')}]`,
      )
    }
    // Each raw input the methodology consumes must itself be present and contract-valid.
    for (const input of expectedInputs) {
      const inputField = input as CountryProfileEvidenceField
      if (!hasValue(profile, inputField)) {
        reasons.push(`${field} requires raw input ${input}, which is absent`)
        continue
      }
      reasons.push(...contractReasons(profile, inputField, contracts, knownSourceIds))
    }
  }

  return reasons
}

// Strict verification: every present field must satisfy its declared source
// contract, and the required raw backbone must be present. This is the pipeline
// gate — a field cannot pass merely because it has *some* registered source.
export function countryProfileEvidenceReasons(
  profile: CountryProfile,
  knownSourceIds?: Set<string>,
  contracts: FieldSourceContracts = FIELD_SOURCE_CONTRACTS,
): string[] {
  const reasons: string[] = []

  for (const field of REQUIRED_COUNTRY_PROFILE_FIELDS) {
    if (!hasValue(profile, field)) reasons.push(`${field} missing value`)
  }

  for (const field of COUNTRY_PROFILE_EVIDENCE_FIELDS) {
    if (!hasValue(profile, field)) continue
    reasons.push(...contractReasons(profile, field, contracts, knownSourceIds))
  }

  return reasons
}

// Strict contract check for a SINGLE present field — the publish gate uses this
// to re-validate each profile field a verified causal claim relies on.
export function countryProfileFieldReasons(
  profile: CountryProfile,
  field: CountryProfileEvidenceField,
  knownSourceIds?: Set<string>,
  contracts: FieldSourceContracts = FIELD_SOURCE_CONTRACTS,
): string[] {
  return contractReasons(profile, field, contracts, knownSourceIds)
}

export function verifiedCountryProfiles(
  profiles: CountryProfile[],
  knownSourceIds?: Set<string>,
  contracts: FieldSourceContracts = FIELD_SOURCE_CONTRACTS,
): { profiles: CountryProfile[]; rejected: RejectedCountryProfile[] } {
  const accepted: CountryProfile[] = []
  const rejected: RejectedCountryProfile[] = []

  for (const profile of profiles) {
    const reasons = countryProfileEvidenceReasons(profile, knownSourceIds, contracts)
    if (reasons.length === 0) {
      accepted.push(profile)
    } else {
      rejected.push({ code: profile.code, reasons })
    }
  }

  return { profiles: accepted, rejected }
}
