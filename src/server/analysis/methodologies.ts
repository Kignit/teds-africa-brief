import type { CountryProfile, Exposure, OilStance } from '../../domain/country'
import type { Methodology } from '../../domain/methodology'
import { applyBands } from '../../domain/methodology'
import type { ShockType, TransmissionChannel } from '../../domain/analysis'

// The dollar-debt exposure banding rule: bands the raw World Bank external-debt (% of GNI)
// figure into low/medium/high dollar-debt exposure, as explicit, versioned, owned methodology -
// thresholds live here, not hidden in connector/engine code. APPROVED as of the debt-exposure
// approval PR, with thresholds reviewed against the current World Bank external-debt-%-GNI data
// (NG high; GH/ZA/KE medium; ET omitted, no value). It now emits high/medium/low and unlocks
// dollar_rates_shock for any profile carrying a contract-valid externalDebtPctGni.
export const DEBT_EXPOSURE_BANDING_V1: Methodology = {
  id: 'method.dollarDebtExposure.banding.v1',
  name: 'Dollar-debt exposure banding',
  version: '1.0.0',
  description:
    'Bands World Bank external debt stocks (% of GNI) into low/medium/high dollar-debt exposure.',
  kind: 'banding',
  inputs: ['externalDebtPctGni'],
  bands: [
    { label: 'high', gte: 50 },
    { label: 'medium', gte: 25, lt: 50 },
    { label: 'low', lt: 25 },
  ],
  owner: 'analysis-team',
  status: 'approved',
}

// The oil-stance banding rule: derives a country's exporter / neutral / importer stance
// PURELY from the raw signed petroleum (HS-27) trade already captured, never from
// keyExports, top-product presence, or any hardcoded country list. The metric is the
// normalized net petroleum position (exportValueUsd - importValueUsd) / (exportValueUsd +
// importValueUsd), in [-1, +1]; total petroleum trade below minInputUsd is treated as
// neutral so a tiny flow is not over-read. APPROVED as of the oilStance approval PR, with
// thresholds reviewed against the current raw HS-27 data: it now emits exporter / neutral /
// importer labels and unlocks oil_shock for any profile carrying contract-valid petroleumTrade.
export const OILSTANCE_BANDING_V1: Methodology = {
  id: 'method.oilStance.banding.v1',
  name: 'Oil-stance banding',
  version: '1.0.0',
  description:
    'Bands the normalized net petroleum (HS-27) trade position (export - import) / (export + import) into exporter / neutral / importer; total petroleum trade below the minimum is neutral.',
  kind: 'banding',
  inputs: ['petroleumTrade'],
  bands: [
    { label: 'exporter', gte: 0.2 },
    { label: 'neutral', gte: -0.2, lt: 0.2 },
    { label: 'importer', lt: -0.2 },
  ],
  minInputUsd: 1_000_000_000,
  owner: 'analysis-team',
  status: 'approved',
}

// First-class causal rules: the deterministic mechanism + channel mapping for each
// shock type, as versioned, owned, APPROVED methodology. Each rule carries the
// shock it applies to, the mechanism it licenses, and the channels it maps to — so
// the deterministic analysis is described by the rule itself and is gate-checked
// against this registry rather than being anonymous hardcoded statements.
function causalRule(
  shock: ShockType,
  name: string,
  mechanism: string,
  channels: TransmissionChannel[],
): Methodology {
  return {
    id: `method.causal.${shock}.v1`,
    name,
    version: '1.0.0',
    description: mechanism,
    kind: 'causal',
    inputs: [],
    bands: [],
    shockType: shock,
    mechanism,
    channels,
    owner: 'analysis-team',
    status: 'approved',
  }
}

export const CAUSAL_METHODOLOGIES: Record<ShockType, Methodology> = {
  oil_shock: causalRule(
    'oil_shock',
    'Oil-price shock mechanism',
    'An oil-price move splits the bloc along the export–import line.',
    ['fiscal_revenue', 'trade_balance', 'inflation', 'fx', 'consumers'],
  ),
  dollar_rates_shock: causalRule(
    'dollar_rates_shock',
    'Dollar / US-rates shock mechanism',
    'A move in the dollar and US rates reaches countries through their hard-currency debt and FX regime.',
    ['debt_service', 'fx', 'inflation'],
  ),
  inflation_shock: causalRule(
    'inflation_shock',
    'Inflation shock mechanism',
    'Higher prices pass through to households and, where sensitive, to politics.',
    ['inflation', 'consumers', 'political_risk'],
  ),
  policy_rate_decision: causalRule(
    'policy_rate_decision',
    'Policy-rate decision mechanism',
    'A policy-rate change trades currency support against growth and borrowers.',
    ['fx', 'growth', 'consumers', 'debt_service'],
  ),
  fx_move: causalRule(
    'fx_move',
    'FX-move mechanism',
    'A currency move reprices imports and exports.',
    ['fx', 'inflation', 'trade_balance', 'consumers'],
  ),
  debt_fiscal_event: causalRule(
    'debt_fiscal_event',
    'Debt / fiscal event mechanism',
    'Fiscal conditionality steadies the balance sheet while squeezing households.',
    ['debt_service', 'fiscal_revenue', 'consumers', 'political_risk'],
  ),
  trade_integration_event: causalRule(
    'trade_integration_event',
    'Trade-integration mechanism',
    'Deeper integration lifts trade and growth.',
    ['trade_balance', 'growth'],
  ),
  deal_investment_event: causalRule(
    'deal_investment_event',
    'Deal / investment mechanism',
    'New investment supports growth and revenue.',
    ['growth', 'fiscal_revenue'],
  ),
  political_stability_event: causalRule(
    'political_stability_event',
    'Political-stability mechanism',
    'Political stress raises risk and weighs on growth.',
    ['political_risk', 'growth', 'fx'],
  ),
  // Never cited — unclassified shocks produce no effects. Ships as draft.
  unclassified: { ...causalRule('unclassified', 'Unclassified', '', []), status: 'draft' },
}

export const CAUSAL_METHODOLOGY_BY_ID = new Map(
  Object.values(CAUSAL_METHODOLOGIES).map((m) => [m.id, m]),
)

// The single approved-methodology registry the publish gate validates against —
// causal rules plus banding methodologies. The gate treats this (not a brief's
// self-declared status) as the authority; tests may inject extra entries.
export const METHODOLOGY_REGISTRY: Map<string, Methodology> = new Map(
  [...Object.values(CAUSAL_METHODOLOGIES), DEBT_EXPOSURE_BANDING_V1, OILSTANCE_BANDING_V1].map(
    (m) => [m.id, m],
  ),
)

// Methodologies the system knows about. Only `approved` ones ever derive a label.
export const METHODOLOGIES: Methodology[] = [DEBT_EXPOSURE_BANDING_V1, OILSTANCE_BANDING_V1]

export function approvedMethodologies(methodologies: Methodology[] = METHODOLOGIES): Methodology[] {
  return methodologies.filter((m) => m.status === 'approved')
}

function isExposure(label: string | undefined): label is Exposure {
  return label === 'high' || label === 'medium' || label === 'low'
}

function isOilStance(label: string | undefined): label is OilStance {
  return label === 'exporter' || label === 'importer' || label === 'neutral'
}

// The raw signed-petroleum position banded into an oil stance, per an approved banding
// methodology. Total petroleum trade below the methodology's minInputUsd is neutral (a tiny
// flow is not over-read); otherwise the normalized net position is banded. Pure and total;
// reads nothing but the petroleumTrade values handed to it (never keyExports or a country
// list).
function deriveOilStance(
  petroleumTrade: { exportValueUsd: number; importValueUsd: number },
  methodology: Methodology,
): OilStance | undefined {
  const total = petroleumTrade.exportValueUsd + petroleumTrade.importValueUsd
  if (methodology.minInputUsd !== undefined && total < methodology.minInputUsd) return 'neutral'
  if (!(total > 0)) return undefined
  const normalizedNet = (petroleumTrade.exportValueUsd - petroleumTrade.importValueUsd) / total
  const label = applyBands(normalizedNet, methodology.bands)
  return isOilStance(label) ? label : undefined
}

// Bands the raw external-debt figure into a dollar-debt exposure label when an approved debt
// methodology is supplied. Never overwrites an existing label; requires the raw figure and
// its evidence, and carries that source provenance onto the derived label.
function applyDollarDebtExposure(
  profile: CountryProfile,
  methodology: Methodology | undefined,
): CountryProfile {
  if (
    !methodology ||
    profile.dollarDebtExposure !== undefined ||
    profile.externalDebtPctGni === undefined
  ) {
    return profile
  }
  const rawEvidence = profile.evidence.externalDebtPctGni
  if (!rawEvidence) return profile

  const label = applyBands(profile.externalDebtPctGni, methodology.bands)
  if (!isExposure(label)) return profile

  return {
    ...profile,
    dollarDebtExposure: label,
    evidence: {
      ...profile.evidence,
      dollarDebtExposure: {
        sourceIds: rawEvidence.sourceIds,
        asOf: rawEvidence.asOf,
        methodologyId: methodology.id,
      },
    },
    methodologies: [...(profile.methodologies ?? []), methodology],
  }
}

// Bands the raw petroleumTrade into an oilStance label when an approved oil methodology is
// supplied. Never overwrites an existing label; requires the raw petroleumTrade and its
// evidence, and carries that same source provenance onto the derived label. Without an
// approved methodology this is a no-op, so oilStance stays absent and oil_shock stays blocked.
function applyOilStance(
  profile: CountryProfile,
  methodology: Methodology | undefined,
): CountryProfile {
  if (!methodology || profile.oilStance !== undefined || profile.petroleumTrade === undefined) {
    return profile
  }
  const rawEvidence = profile.evidence.petroleumTrade
  if (!rawEvidence) return profile

  const label = deriveOilStance(profile.petroleumTrade, methodology)
  if (!isOilStance(label)) return profile

  return {
    ...profile,
    oilStance: label,
    evidence: {
      ...profile.evidence,
      oilStance: {
        sourceIds: rawEvidence.sourceIds,
        asOf: rawEvidence.asOf,
        methodologyId: methodology.id,
      },
    },
    methodologies: [...(profile.methodologies ?? []), methodology],
  }
}

// Applies approved methodologies to a profile's raw inputs, attaching derived
// labels with both source and methodology provenance. Methodologies that are not
// approved are ignored, so without approval no derived label is produced and the
// engine skips the paths that need it. Never overwrites an existing label.
export function deriveCountryProfiles(
  profiles: CountryProfile[],
  methodologies: Methodology[],
): CountryProfile[] {
  const debtMethodology = methodologies.find(
    (m) => m.status === 'approved' && m.inputs.includes('externalDebtPctGni'),
  )
  const oilMethodology = methodologies.find(
    (m) => m.status === 'approved' && m.inputs.includes('petroleumTrade'),
  )

  return profiles.map((profile) =>
    applyOilStance(applyDollarDebtExposure(profile, debtMethodology), oilMethodology),
  )
}
