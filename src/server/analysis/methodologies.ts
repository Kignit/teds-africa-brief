import type { CountryProfile, Exposure } from '../../domain/country'
import type { Methodology } from '../../domain/methodology'
import { applyBands } from '../../domain/methodology'
import type { ShockType, TransmissionChannel } from '../../domain/analysis'

// The dollar-debt exposure banding rule, expressed as explicit, versioned,
// owned methodology — NOT as thresholds hidden in connector/engine code. It
// ships as 'draft': until a human approves it, no high/medium/low label is
// emitted, and the engine works without an exposure conclusion (never guessing).
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
  status: 'draft',
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
  [...Object.values(CAUSAL_METHODOLOGIES), DEBT_EXPOSURE_BANDING_V1].map((m) => [m.id, m]),
)

// Methodologies the system knows about. Only `approved` ones ever derive a label.
export const METHODOLOGIES: Methodology[] = [DEBT_EXPOSURE_BANDING_V1]

export function approvedMethodologies(methodologies: Methodology[] = METHODOLOGIES): Methodology[] {
  return methodologies.filter((m) => m.status === 'approved')
}

function isExposure(label: string | undefined): label is Exposure {
  return label === 'high' || label === 'medium' || label === 'low'
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

  return profiles.map((profile) => {
    if (
      !debtMethodology ||
      profile.dollarDebtExposure !== undefined ||
      profile.externalDebtPctGni === undefined
    ) {
      return profile
    }
    const rawEvidence = profile.evidence.externalDebtPctGni
    if (!rawEvidence) return profile

    const label = applyBands(profile.externalDebtPctGni, debtMethodology.bands)
    if (!isExposure(label)) return profile

    return {
      ...profile,
      dollarDebtExposure: label,
      evidence: {
        ...profile.evidence,
        dollarDebtExposure: {
          sourceIds: rawEvidence.sourceIds,
          asOf: rawEvidence.asOf,
          methodologyId: debtMethodology.id,
        },
      },
      methodologies: [...(profile.methodologies ?? []), debtMethodology],
    }
  })
}
