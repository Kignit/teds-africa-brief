import type { CountryProfile, CountryProfileEvidenceField } from '../../domain/country'
import type { Event } from '../../domain/event'
import type {
  CausalEffect,
  Confidence,
  Direction,
  EvidenceRef,
  ShockType,
  Tone,
  TransmissionChannel,
} from '../../domain/analysis'
import { downgrade } from './confidence'
import { CAUSAL_METHODOLOGIES } from './methodologies'

const POLITICAL = /tax|cost of living|protest|unrest|subsid/i

export interface ScoreContext {
  shock: ShockType
  direction: Direction
  event: Event
  profile: CountryProfile
  /** Verified figure ids relevant to this event, for evidence. */
  figureIds: string[]
  /** Base confidence, already reduced for single-source / unclear-direction events. */
  baseConfidence: Confidence
}

// Produces one country's divergent effect(s) under a shock. May return more than
// one effect when channels diverge in tone (e.g. debt positive, consumers negative).
export function scoreCountryImpact(ctx: ScoreContext): CausalEffect[] {
  const { shock, direction, event, profile, figureIds, baseConfidence } = ctx
  const cc = profile.code
  const effects: CausalEffect[] = []

  // Only cite profile fields the profile actually carries evidence for. Optional
  // fields may be omitted, so we never claim provenance we do not have. The
  // event id is always present, so an effect never loses all of its grounding.
  const evidence = (profileFields: CountryProfileEvidenceField[]): EvidenceRef => {
    const present = profileFields.filter((field) => profile.evidence[field] !== undefined)
    const sourceIds = new Set<string>()
    const methodologyIds = new Set<string>()
    for (const field of present) {
      const fieldEvidence = profile.evidence[field]!
      for (const sourceId of fieldEvidence.sourceIds) sourceIds.add(sourceId)
      if (fieldEvidence.methodologyId) methodologyIds.add(fieldEvidence.methodologyId)
    }
    // Every effect cites the causal rule that licensed its mechanism + channels.
    methodologyIds.add(CAUSAL_METHODOLOGIES[shock].id)
    return {
      eventIds: [event.id],
      figureIds,
      profileFields: present.map((field) => `${cc}.${field}`),
      profileSourceIds: [...sourceIds],
      methodologyIds: [...methodologyIds],
    }
  }
  const push = (
    tone: Tone,
    channels: TransmissionChannel[],
    why: string,
    confidence: Confidence,
    profileFields: CountryProfileEvidenceField[],
  ) =>
    effects.push({
      countryCode: cc,
      tone,
      channels,
      why,
      confidence,
      evidence: evidence(profileFields),
    })

  switch (shock) {
    case 'oil_shock': {
      if (!profile.oilStance) break
      const tone: Tone = direction === 'unclear' ? 'neutral' : direction === 'up' ? 'pos' : 'neg'
      const conf = direction === 'unclear' ? downgrade(baseConfidence) : baseConfidence
      if (profile.oilStance === 'exporter') {
        push(
          tone,
          ['fiscal_revenue', 'trade_balance'],
          direction === 'down'
            ? 'lower crude prices cut export revenue and strain the budget'
            : 'higher crude prices lift export revenue and the fiscal position',
          conf,
          ['oilStance'],
        )
      } else if (profile.oilStance === 'importer') {
        push(
          direction === 'unclear' ? 'neutral' : direction === 'up' ? 'neg' : 'pos',
          ['trade_balance', 'inflation', 'consumers'],
          direction === 'down'
            ? 'a cheaper import bill narrows the trade gap and eases inflation'
            : 'a costlier import bill widens the trade gap and lifts fuel-driven inflation',
          conf,
          ['oilStance'],
        )
      } else {
        push(
          'neutral',
          ['trade_balance'],
          'roughly balanced oil exposure',
          downgrade(baseConfidence),
          ['oilStance'],
        )
      }
      break
    }

    case 'dollar_rates_shock': {
      // An exposure conclusion is a banded judgement, which only an approved
      // methodology can license. Without the derived label we make no
      // exposure-sensitive claim — even though the raw external-debt figure
      // exists on the profile — rather than guess.
      if (profile.dollarDebtExposure === undefined) break
      if (profile.dollarDebtExposure === 'low') {
        push(
          'neutral',
          ['debt_service', 'fx'],
          'little hard-currency debt, so limited sensitivity',
          downgrade(baseConfidence),
          ['dollarDebtExposure'],
        )
        break
      }
      const relief = direction === 'down'
      const tone: Tone = direction === 'unclear' ? 'neutral' : relief ? 'pos' : 'neg'
      let conf: Confidence =
        profile.dollarDebtExposure === 'high' ? baseConfidence : downgrade(baseConfidence)
      const hasRegime = profile.currencyRegime !== undefined
      const managed = profile.currencyRegime === 'managed' || profile.currencyRegime === 'peg'
      if (managed) conf = downgrade(conf)
      // Currency regime is optional; without it we know less, so trim confidence
      // and make no claim about pass-through.
      if (!hasRegime) conf = downgrade(conf)
      const regimeNote = !hasRegime
        ? ''
        : managed
          ? ' — though a managed regime mutes the pass-through'
          : ' and a floating currency passes the move through directly'
      push(
        tone,
        ['debt_service', 'fx'],
        (relief
          ? 'a softer dollar trims the local-currency cost of hard-currency debt'
          : 'a firmer dollar raises the local-currency cost of hard-currency debt') + regimeNote,
        conf,
        hasRegime ? ['dollarDebtExposure', 'currencyRegime'] : ['dollarDebtExposure'],
      )
      break
    }

    case 'inflation_shock': {
      const up = direction !== 'down'
      push(
        up ? 'neg' : 'pos',
        ['inflation', 'consumers'],
        up ? 'higher prices squeeze households' : 'cooling prices ease the squeeze on households',
        baseConfidence,
        [],
      )
      const sens = profile.politicalSensitivities
      if (up && sens && POLITICAL.test(sens.join(' '))) {
        push(
          'neg',
          ['political_risk'],
          `cost-of-living pressure raises political risk (${sens.join(', ')})`,
          downgrade(baseConfidence),
          ['politicalSensitivities'],
        )
      }
      break
    }

    case 'policy_rate_decision': {
      const hike = direction === 'up'
      push(
        hike ? 'neutral' : 'pos',
        hike ? ['fx', 'growth', 'consumers', 'debt_service'] : ['growth', 'consumers'],
        hike
          ? 'higher rates support the currency but weigh on growth and borrowers'
          : 'lower rates support growth and ease the burden on borrowers',
        baseConfidence,
        [],
      )
      break
    }

    case 'fx_move': {
      const depreciation = direction === 'down'
      push(
        depreciation ? 'neg' : 'pos',
        ['inflation', 'consumers'],
        depreciation
          ? 'a weaker currency lifts import costs and inflation'
          : 'a firmer currency eases import costs',
        baseConfidence,
        ['currencyRegime'],
      )
      if (
        depreciation &&
        profile.oilStance === 'exporter' &&
        (profile.keyExports?.length ?? 0) > 0
      ) {
        push(
          'pos',
          ['trade_balance'],
          'exporters gain some competitiveness from a weaker currency',
          downgrade(baseConfidence),
          ['keyExports'],
        )
      }
      break
    }

    case 'debt_fiscal_event': {
      // Ground in the derived exposure label when one exists, else in the raw
      // external-debt figure — never assert a band the methodology hasn't licensed.
      const debtField: CountryProfileEvidenceField | undefined =
        profile.dollarDebtExposure !== undefined
          ? 'dollarDebtExposure'
          : profile.externalDebtPctGni !== undefined
            ? 'externalDebtPctGni'
            : undefined
      push(
        'pos',
        ['debt_service', 'fiscal_revenue'],
        'a credible programme stabilises financing and the debt outlook',
        downgrade(baseConfidence),
        debtField ? [debtField] : [],
      )
      const sens = profile.politicalSensitivities
      if (sens && POLITICAL.test(sens.join(' '))) {
        push(
          'neg',
          ['consumers', 'political_risk'],
          `austerity or new taxes raise the cost of living and the risk of unrest (${sens.join(', ')})`,
          baseConfidence,
          ['politicalSensitivities'],
        )
      }
      break
    }

    case 'trade_integration_event': {
      if ((profile.keyExports?.length ?? 0) === 0) break
      push(
        'pos',
        ['trade_balance', 'growth'],
        'deeper trade integration supports exports and growth',
        downgrade(baseConfidence),
        ['keyExports'],
      )
      break
    }

    case 'deal_investment_event': {
      push(
        'pos',
        ['growth', 'fiscal_revenue'],
        'new investment supports growth and the fiscal position',
        downgrade(baseConfidence),
        [],
      )
      break
    }

    case 'political_stability_event': {
      const sens = profile.politicalSensitivities
      push(
        'neg',
        ['political_risk', 'growth'],
        sens?.length
          ? `heightened political risk (${sens.join(', ')})`
          : 'heightened political risk',
        baseConfidence,
        sens?.length ? ['politicalSensitivities'] : [],
      )
      break
    }

    case 'unclassified':
      break
  }

  return effects
}
