// A CountryProfile holds the stable structural facts that let the analysis
// engine reason about divergent impact (who gains / who is exposed).
export type OilStance = 'exporter' | 'importer' | 'neutral'
export type Exposure = 'high' | 'medium' | 'low'
export type CurrencyRegime = 'float' | 'managed' | 'peg'

export interface CountryProfile {
  code: string
  name: string
  flag: string
  oilStance: OilStance
  dollarDebtExposure: Exposure
  keyExports: string[]
  importDependence: string[]
  politicalSensitivities: string[]
  currencyRegime: CurrencyRegime
}
