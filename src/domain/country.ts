import type { Methodology } from './methodology'

// A CountryProfile holds the structural inputs that let the analysis engine
// reason about divergent impact (who gains / who is exposed).
//
// It strictly separates RAW sourced inputs (numbers as published) from DERIVED
// labels (classifications). A raw value carries source provenance. A derived
// label additionally carries the methodology that produced it, and may exist
// only when an approved methodology is referenced — otherwise it is omitted and
// the engine skips the paths that need it. No analytical thresholds live in code.
export type OilStance = 'exporter' | 'importer' | 'neutral'
export type Exposure = 'high' | 'medium' | 'low'
export type CurrencyRegime = 'float' | 'managed' | 'peg'

// Raw sourced inputs — published numbers, no interpretation.
export type RawCountryProfileField = 'externalDebtPctGni'

// Derived labels — classifications. Each requires an approved methodology.
export type DerivedCountryProfileField = 'dollarDebtExposure' | 'oilStance'

// Labels taken directly from a source (no derivation, no methodology).
export type SourcedCountryProfileField =
  | 'keyExports'
  | 'importDependence'
  | 'politicalSensitivities'
  | 'currencyRegime'

export type CountryProfileEvidenceField =
  | RawCountryProfileField
  | DerivedCountryProfileField
  | SourcedCountryProfileField

export interface CountryProfileEvidence {
  sourceIds: string[]
  /** ISO-8601 timestamp the field evidence was retrieved or last verified. */
  asOf: string
  /** Source series/indicator code for raw inputs, e.g. 'DT.DOD.DECT.GN.ZS'. */
  indicator?: string
  /** Methodology id for derived labels — required for any derived field. */
  methodologyId?: string
  // Product-level trade metadata for Comtrade-sourced fields (keyExports /
  // importDependence), so the provenance is the specific reporter/flow/products
  // and year — not merely "from Comtrade".
  reporterCode?: string
  flowCode?: string
  /** Commodity classification scheme, e.g. 'HS'. */
  classification?: string
  /** Product codes used, e.g. ['27', '84']. */
  productCodes?: string[]
  refYear?: number
}

// Provenance for every field that is present. Required/derived rules are enforced
// by verification, not the type (so omission is always representable).
export type CountryProfileEvidenceMap = Partial<
  Record<CountryProfileEvidenceField, CountryProfileEvidence>
>

export interface CountryProfile {
  code: string
  name: string

  // Raw sourced input (number as published by the source).
  externalDebtPctGni?: number

  // Derived classifications — present only with an approved methodology.
  dollarDebtExposure?: Exposure
  oilStance?: OilStance

  // Labels taken directly from a source.
  keyExports?: string[]
  importDependence?: string[]
  politicalSensitivities?: string[]
  currencyRegime?: CurrencyRegime

  // Provenance for every present field (+ methodologyId for derived labels).
  evidence: CountryProfileEvidenceMap
  // Methodologies referenced by this profile's derived labels.
  methodologies?: Methodology[]
}
