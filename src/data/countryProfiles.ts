import type { CountryProfile } from '../domain/country'

// The five launch markets. These stable structural facts feed divergent-impact
// reasoning (who gains / who is exposed) once the analysis engine is built.
export const COUNTRY_PROFILES: CountryProfile[] = [
  {
    code: 'ET',
    name: 'Ethiopia',
    flag: '🇪🇹',
    oilStance: 'importer',
    dollarDebtExposure: 'medium',
    keyExports: ['coffee', 'gold'],
    importDependence: ['refined fuel', 'wheat'],
    politicalSensitivities: ['FX shortage', 'cost of living'],
    currencyRegime: 'managed',
  },
  {
    code: 'KE',
    name: 'Kenya',
    flag: '🇰🇪',
    oilStance: 'importer',
    dollarDebtExposure: 'high',
    keyExports: ['tea', 'horticulture'],
    importDependence: ['refined fuel', 'wheat'],
    politicalSensitivities: ['taxes', 'cost of living', 'protest risk'],
    currencyRegime: 'float',
  },
  {
    code: 'NG',
    name: 'Nigeria',
    flag: '🇳🇬',
    oilStance: 'exporter',
    dollarDebtExposure: 'high',
    keyExports: ['crude oil', 'gas'],
    importDependence: ['refined fuel', 'wheat'],
    politicalSensitivities: ['fuel subsidy', 'FX policy'],
    currencyRegime: 'managed',
  },
  {
    code: 'GH',
    name: 'Ghana',
    flag: '🇬🇭',
    oilStance: 'exporter',
    dollarDebtExposure: 'high',
    keyExports: ['gold', 'cocoa', 'crude oil'],
    importDependence: ['refined fuel'],
    politicalSensitivities: ['inflation', 'IMF programme'],
    currencyRegime: 'float',
  },
  {
    code: 'ZA',
    name: 'South Africa',
    flag: '🇿🇦',
    oilStance: 'importer',
    dollarDebtExposure: 'medium',
    keyExports: ['gold', 'platinum', 'coal'],
    importDependence: ['crude oil'],
    politicalSensitivities: ['power supply', 'unemployment'],
    currencyRegime: 'float',
  },
]

export const PROFILE_BY_CODE = new Map(COUNTRY_PROFILES.map((p) => [p.code, p]))
