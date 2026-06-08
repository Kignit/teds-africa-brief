import { describe, it, expect } from 'vitest'
import { corroborateEvents } from '../server/verification/corroborate'
import {
  sameEvent,
  significantTokens,
  normalizeToken,
  stripBoilerplate,
  anchorTokens,
  signatureTokens,
  pathBBridge,
  overlapCoefficient,
  entityAnchors,
  PATH_B_MIN_SHARED,
  PATH_B_MIN_OVERLAP,
  PATH_B_MIN_ENTITY_ANCHORS,
} from '../server/verification/eventSignature'
import { inferCountryCodes } from '../data/countryKeywords'
import type { NewsItem } from '../domain/news'

const T0 = '2026-06-03T06:00:00.000Z'
function item(over: Partial<NewsItem> & { id: string; sourceId: string; title: string }): NewsItem {
  return { summary: '', url: `https://x.test/${over.id}`, publishedAt: T0, language: 'en', ...over }
}

describe('inferCountryCodes — conservative, deterministic', () => {
  it('tags an unambiguous country / currency / place', () => {
    expect(inferCountryCodes('Naira firms as CBN clears FX backlog')).toEqual(['NG'])
    expect(inferCountryCodes('Cedi steadies in Accra trading')).toEqual(['GH'])
    expect(inferCountryCodes('South African markets rally in Johannesburg')).toEqual(['ZA'])
    expect(inferCountryCodes('Addis Ababa tightens as the birr slips')).toEqual(['ET'])
  })

  it('tags every named launch market (multi)', () => {
    expect(inferCountryCodes('Nigeria and Ghana sign a trade pact').sort()).toEqual(['GH', 'NG'])
  })

  it('omits when ambiguous or absent — never guesses', () => {
    expect(inferCountryCodes('Shilling steadies in regional trade')).toEqual([]) // no "Kenya"
    expect(inferCountryCodes('The rand and the dollar diverge')).toEqual([]) // bare "rand" excluded
    expect(inferCountryCodes('Oil prices jump on supply fears')).toEqual([])
    expect(inferCountryCodes('Niger coup unsettles the Sahel')).toEqual([]) // not Nigeria
  })

  it('tags ZA from unambiguous domestic institutions / market identity', () => {
    expect(inferCountryCodes('Eskom municipal takeover may expand to 30 municipalities')).toEqual([
      'ZA',
    ])
    expect(inferCountryCodes('SARB keeps policy stance unchanged')).toEqual(['ZA'])
    expect(inferCountryCodes('Transnet rail bottlenecks hit exporters')).toEqual(['ZA'])
    expect(inferCountryCodes('NERSA approves electricity tariff increase')).toEqual(['ZA'])
    expect(inferCountryCodes('JSE-listed shares rally')).toEqual(['ZA'])
    // Spelled-out forms already tag ZA via the existing demonym / place patterns.
    expect(inferCountryCodes('South African Reserve Bank holds rates')).toEqual(['ZA'])
    expect(inferCountryCodes('Johannesburg Stock Exchange closes higher')).toEqual(['ZA'])
  })

  it('does not tag ZA without a strong ZA token (no source-country guessing)', () => {
    expect(inferCountryCodes('Oil company profits surge after refinery upgrade')).toEqual([])
    expect(inferCountryCodes('Rand weakens against the dollar')).toEqual([]) // bare "rand" excluded
    expect(inferCountryCodes('SARS outbreak prompts a health warning')).toEqual([]) // SARS is not SARB
    expect(inferCountryCodes('Wall Street banks hire AI consultants')).toEqual([])
    expect(inferCountryCodes('Rhinos return to billionaire-backed Zimbabwe park')).toEqual([])
    expect(
      inferCountryCodes('RWC on SuperSport as Canal+ CEO comments on Winter Olympics'),
    ).toEqual([])
  })
})

describe('sameEvent — strict grouping (clusters matches, never merges unrelated)', () => {
  const base = item({
    id: 'a',
    sourceId: 'src.businessday_ng',
    title: 'Naira firms as central bank clears FX backlog',
  })

  it('matches two near-identical reports of one event', () => {
    const b = item({
      id: 'b',
      sourceId: 'src.premiumtimes_ng',
      title: 'Naira firms after the central bank clears its FX backlog',
    })
    expect(sameEvent(base, b)).toBe(true)
  })

  it('does NOT match a merely same-topic story', () => {
    const c = item({
      id: 'c',
      sourceId: 'src.premiumtimes_ng',
      title: 'Stocks rise as oil rallies on global supply fears',
    })
    expect(sameEvent(base, c)).toBe(false)
  })

  it('does NOT merge identical wording across disjoint named countries', () => {
    const ng = item({
      id: 'n',
      sourceId: 'src.businessday_ng',
      title: 'Central bank raises the benchmark policy rate',
      countryCodes: ['NG'],
    })
    const ke = item({
      id: 'k',
      sourceId: 'src.standardmedia_ke',
      title: 'Central bank raises the benchmark policy rate',
      countryCodes: ['KE'],
    })
    expect(sameEvent(ng, ke)).toBe(false)
  })

  it('does NOT match reports outside the time window', () => {
    const far = item({
      id: 'f',
      sourceId: 'src.premiumtimes_ng',
      title: 'Naira firms as central bank clears FX backlog',
      publishedAt: '2026-05-01T06:00:00.000Z',
    })
    expect(sameEvent(base, far)).toBe(false)
  })

  it('significantTokens drops stopwords and short tokens', () => {
    expect([...significantTokens('The oil price is up today')].sort()).toEqual([
      'oil',
      'price',
      'today',
    ])
  })
})

describe('corroborateEvents — clustering then status', () => {
  it('corroborates one event reported by two independent registered sources', () => {
    const events = corroborateEvents([
      item({
        id: 'a',
        sourceId: 'src.businessday_ng',
        title: 'Naira firms as central bank clears FX backlog',
        countryCodes: ['NG'],
      }),
      item({
        id: 'b',
        sourceId: 'src.premiumtimes_ng',
        title: 'Naira firms after the central bank clears its FX backlog',
        countryCodes: ['NG'],
      }),
    ])
    expect(events).toHaveLength(1)
    expect(events[0].status).toBe('corroborated')
    expect(events[0].corroboration.independentSourceCount).toBe(2)
    expect(events[0].corroboration.sourceIds.sort()).toEqual([
      'src.businessday_ng',
      'src.premiumtimes_ng',
    ])
  })

  it('keeps same-topic / different-country reports as separate single_source events', () => {
    const events = corroborateEvents([
      item({
        id: 'n',
        sourceId: 'src.businessday_ng',
        title: 'Central bank raises the benchmark policy rate',
        countryCodes: ['NG'],
      }),
      item({
        id: 'k',
        sourceId: 'src.standardmedia_ke',
        title: 'Central bank raises the benchmark policy rate',
        countryCodes: ['KE'],
      }),
    ])
    expect(events).toHaveLength(2)
    expect(events.every((e) => e.status === 'single_source')).toBe(true)
  })

  it('does NOT self-corroborate two reports from the same source', () => {
    const events = corroborateEvents([
      item({
        id: 'a',
        sourceId: 'src.businessday_ng',
        title: 'Naira firms as central bank clears FX backlog',
        countryCodes: ['NG'],
      }),
      item({
        id: 'b',
        sourceId: 'src.businessday_ng',
        title: 'Naira firms after the central bank clears its FX backlog',
        countryCodes: ['NG'],
      }),
    ])
    expect(events).toHaveLength(1)
    expect(events[0].status).toBe('single_source')
    expect(events[0].corroboration.independentSourceCount).toBe(1)
  })

  it('does not merge unrelated stories from different sources', () => {
    const events = corroborateEvents([
      item({
        id: 'a',
        sourceId: 'src.businessday_ng',
        title: 'Naira firms as central bank clears FX backlog',
      }),
      item({
        id: 'b',
        sourceId: 'src.moneyweb_za',
        title: 'Gold miners lift the Johannesburg bourse to a record',
      }),
    ])
    expect(events).toHaveLength(2)
    expect(events.every((e) => e.status === 'single_source')).toBe(true)
  })
})

describe('signature normalization (title-primary, boilerplate, stemming)', () => {
  it('normalizeToken collapses simple plural variants, with guards', () => {
    expect(normalizeToken('renewals')).toBe('renewal')
    expect(normalizeToken('licenses')).toBe('license')
    expect(normalizeToken('banks')).toBe('bank')
    expect(normalizeToken('reviews')).toBe('review')
    expect(normalizeToken('currencies')).toBe('currency')
    // guards: -ss / -is / -us endings and short tokens are left alone
    expect(normalizeToken('press')).toBe('press')
    expect(normalizeToken('analysis')).toBe('analysis')
    expect(normalizeToken('oil')).toBe('oil')
    // never stem a word INTO a stopword
    expect(normalizeToken('news')).toBe('news')
  })

  it('stripBoilerplate removes known RSS tails but keeps event text', () => {
    expect(
      stripBoilerplate('Naira steadies. The post Naira steadies appeared first on Nairametrics.'),
    ).toBe('Naira steadies.')
    expect(stripBoilerplate('Cedi gains ground read more')).toBe('Cedi gains ground')
    expect(stripBoilerplate('No boilerplate here')).toBe('No boilerplate here')
  })

  it('anchorTokens extracts acronyms, proper nouns and numbers (diagnostics only)', () => {
    const anchors = anchorTokens('CBN to fine banks N100 million in Lagos')
    expect(anchors.has('cbn')).toBe(true)
    expect(anchors.has('lagos')).toBe(true)
    expect(anchors.has('n100')).toBe(true)
    expect(anchors.has('fine')).toBe(false) // a lowercase common word is not an anchor
  })

  it('signatureTokens is title-primary: a rich title ignores the summary', () => {
    const sig = signatureTokens(
      item({
        id: 'sig',
        sourceId: 'src.bft_gh',
        title: 'Yango Group hosts Innovation Day 2026 in Abidjan',
        summary: 'Totally unrelated body text about cocoa exports and rainfall.',
      }),
    )
    expect(sig.has('yango')).toBe(true)
    expect(sig.has('cocoa')).toBe(false) // summary is not consulted when the title suffices
  })

  it('TRUE: identical titles still match when RSS boilerplate summaries diverge', () => {
    const a = item({
      id: 'y1',
      sourceId: 'src.bft_gh',
      title: 'Yango Group hosts Innovation Day 2026 in Abidjan',
      summary:
        'Yango Group convened partners across markets. The post Yango Group hosts Innovation Day 2026 in Abidjan appeared first on B&FT Online.',
    })
    const b = item({
      id: 'y2',
      sourceId: 'src.myjoyonline_gh',
      title: 'Yango Group hosts Innovation Day 2026 in Abidjan',
      summary:
        'The technology group gathered policymakers and founders for a day of demos. read more',
    })
    expect(sameEvent(a, b)).toBe(true)
  })

  it('TRUE: plural/singular variants align after light stemming', () => {
    // Without stemming these titles share no significant token (banks/bank, licenses/license,
    // renewals/renewal, reviews/review all differ); with it they match.
    const a = item({
      id: 'r1',
      sourceId: 'src.businessday_ng',
      title: 'Banks face licenses renewals review',
      countryCodes: ['NG'],
    })
    const b = item({
      id: 'r2',
      sourceId: 'src.nairametrics_ng',
      title: 'Regulator reviews bank license renewal rules',
      countryCodes: ['NG'],
    })
    expect(sameEvent(a, b)).toBe(true)
  })

  it('FALSE: two distinct CBN stories do not merge (title-primary ignores shared summary vocabulary)', () => {
    const a = item({
      id: 'c1',
      sourceId: 'src.businessday_ng',
      title: "CBN's new FX manual to raise dollar liquidity, enhance market confidence",
      summary:
        'The Central Bank of Nigeria said the foreign exchange market reform aims to deepen liquidity.',
      countryCodes: ['NG'],
    })
    const b = item({
      id: 'c2',
      sourceId: 'src.nairametrics_ng',
      title: 'CBN to fine banks N100 million for inadequate forex documents',
      summary:
        'The Central Bank of Nigeria will penalise lenders in the foreign exchange market over documentation.',
      countryCodes: ['NG'],
    })
    expect(sameEvent(a, b)).toBe(false)
  })

  it('FALSE: identical titles in different countries stay apart (country guard)', () => {
    const ng = item({
      id: 'cc1',
      sourceId: 'src.businessday_ng',
      title: 'Central bank raises the benchmark policy rate',
      countryCodes: ['NG'],
    })
    const ke = item({
      id: 'cc2',
      sourceId: 'src.standardmedia_ke',
      title: 'Central bank raises the benchmark policy rate',
      countryCodes: ['KE'],
    })
    expect(sameEvent(ng, ke)).toBe(false)
  })

  it('FALSE: identical titles outside the time window stay apart (window guard)', () => {
    const a = item({
      id: 'w1',
      sourceId: 'src.businessday_ng',
      title: 'Naira firms as central bank clears FX backlog',
      publishedAt: '2026-06-03T06:00:00.000Z',
    })
    const b = item({
      id: 'w2',
      sourceId: 'src.premiumtimes_ng',
      title: 'Naira firms as central bank clears FX backlog',
      publishedAt: '2026-05-20T06:00:00.000Z',
    })
    expect(sameEvent(a, b)).toBe(false)
  })

  it('same-source reports cluster but never self-corroborate (needs independentSourceCount >= 2)', () => {
    // Two reports from the SAME source with divergent boilerplate summaries still cluster into
    // one event under the normalized title, but stay single_source - normalization must not
    // create corroboration from a single organisation.
    const events = corroborateEvents([
      item({
        id: 's1',
        sourceId: 'src.bft_gh',
        title: 'Yango Group hosts Innovation Day 2026 in Abidjan',
        summary:
          'Body one. The post Yango Group hosts Innovation Day 2026 in Abidjan appeared first on B&FT Online.',
        countryCodes: ['GH'],
      }),
      item({
        id: 's2',
        sourceId: 'src.bft_gh',
        title: 'Yango Group hosts Innovation Day 2026 in Abidjan',
        summary: 'A different body entirely. read more',
        countryCodes: ['GH'],
      }),
    ])
    expect(events).toHaveLength(1)
    expect(events[0].status).toBe('single_source')
    expect(events[0].corroboration.independentSourceCount).toBe(1)
  })
})

describe('Path B overlap bridge (SHADOW MODE - not wired into sameEvent)', () => {
  const roadshowA = item({
    id: 'pb_road_a',
    sourceId: 'src.myjoyonline_gh',
    title:
      'Ghana makes strong investment pitch in London as Finance Minister, BoG Governor court global investors',
    countryCodes: ['GH'],
  })
  const roadshowB = item({
    id: 'pb_road_b',
    sourceId: 'src.bft_gh',
    title:
      'Finance Minister, Governor present powerful, unified case for Ghana to global financiers and investors',
    countryCodes: ['GH'],
  })

  it('exposes explicit thresholds (no buried magic numbers)', () => {
    expect(PATH_B_MIN_SHARED).toBe(4)
    expect(PATH_B_MIN_OVERLAP).toBe(0.5)
    expect(PATH_B_MIN_ENTITY_ANCHORS).toBe(1)
  })

  it('overlapCoefficient is intersection / min set size (length-robust)', () => {
    expect(overlapCoefficient(new Set(['a', 'b']), new Set(['a', 'b', 'c', 'd']))).toBe(1)
    expect(overlapCoefficient(new Set(['a', 'b', 'c']), new Set(['a', 'x', 'y', 'z']))).toBeCloseTo(
      1 / 3,
    )
    expect(overlapCoefficient(new Set(), new Set(['a']))).toBe(0)
  })

  it('entityAnchors keeps named entities/roles but drops dates and observance framing', () => {
    const env = entityAnchors('UBA Foundation Marks World Environment Day 2026 in Ikoyi')
    expect(env.has('uba')).toBe(true) // acronym entity kept
    expect(env.has('foundation')).toBe(true) // proper noun kept
    expect(env.has('2026')).toBe(false) // pure number dropped
    expect(env.has('world')).toBe(false) // observance framing dropped
    expect(env.has('environment')).toBe(false)
    expect(env.has('day')).toBe(false) // calendar token dropped
    const road = entityAnchors('Finance Minister, BoG Governor court global investors')
    expect(road.has('governor')).toBe(true) // a role survives as an entity anchor
    expect(road.has('minister')).toBe(true)
    // generic anchorTokens still includes the calendar number (the two sets are separate)
    expect(anchorTokens('World Environment Day 2026').has('2026')).toBe(true)
  })

  it('TRUE: bridges the Ghana London roadshow (length-asymmetric; entity anchors governor/minister)', () => {
    expect(pathBBridge(roadshowA, roadshowB)).toBe(true)
  })

  it('TRUE: bridges a genuine second pair via a single strong entity anchor (OpenAI/ChatGPT)', () => {
    // Cross-org, length-asymmetric headlines of the same event, bridged by the shared entity
    // anchor "chatgpt" (no country tag, so it corroborates as evidence but yields no claim).
    const a = item({
      id: 'pb_oai_a',
      sourceId: 'src.nairametrics_ng',
      title: 'OpenAI plans biggest ChatGPT overhaul, targets superapp status ahead of IPO',
    })
    const b = item({
      id: 'pb_oai_b',
      sourceId: 'src.biznews_za',
      title: 'OpenAI plots biggest ChatGPT overhaul since launch',
    })
    expect(pathBBridge(a, b)).toBe(true)
  })

  it('SHADOW: a Path-B-only pair is still NOT a Path A match (emitted events unchanged)', () => {
    // The point of shadow mode: pathBBridge may report a bridge, but sameEvent (the acceptance
    // path corroborateEvents uses) still rejects it, so corroboration is unchanged.
    expect(sameEvent(roadshowA, roadshowB)).toBe(false)
  })

  it('FALSE: two distinct CBN stories are not bridged (overlap far below floor)', () => {
    const a = item({
      id: 'pb_cbn_a',
      sourceId: 'src.businessday_ng',
      title: "CBN's new FX manual to raise dollar liquidity, enhance market confidence",
      countryCodes: ['NG'],
    })
    const b = item({
      id: 'pb_cbn_b',
      sourceId: 'src.nairametrics_ng',
      title: 'CBN to fine banks N100 million for inadequate forex documents',
      countryCodes: ['NG'],
    })
    expect(pathBBridge(a, b)).toBe(false)
  })

  it('FALSE: cross-country pairs are rejected by the country guard', () => {
    const ng = item({
      id: 'pb_cc_ng',
      sourceId: 'src.businessday_ng',
      title: 'Finance Minister, Governor present unified case for Ghana to global investors',
      countryCodes: ['NG'],
    })
    const ke = item({
      id: 'pb_cc_ke',
      sourceId: 'src.standardmedia_ke',
      title: 'Finance Minister, Governor present unified case for Ghana to global investors',
      countryCodes: ['KE'],
    })
    expect(pathBBridge(ng, ke)).toBe(false)
  })

  it('FALSE: out-of-window pairs are rejected by the time guard', () => {
    expect(pathBBridge(roadshowA, { ...roadshowB, publishedAt: '2026-05-20T06:00:00.000Z' })).toBe(
      false,
    )
  })

  it('FALSE: same-organisation pairs are rejected by cross-org eligibility', () => {
    expect(pathBBridge(roadshowA, { ...roadshowB, sourceId: 'src.myjoyonline_gh' })).toBe(false)
  })

  // --- documented findings: precision gap now FIXED; recall gap remains (still shadow-only) ---

  it('FALSE: recurring calendar observance does not bridge (no shared ENTITY anchor)', () => {
    // The earlier precision blocker: "World Environment Day 2026" shares only generic calendar /
    // observance tokens (world/environment/day/2026). entityAnchors excludes those, so the two
    // DIFFERENT stories have zero shared entity anchors and Path B now rejects them.
    const a = item({
      id: 'pb_env_a',
      sourceId: 'src.nairametrics_ng',
      title:
        'UBA Foundation Marks World Environment Day 2026 with Tree-Planting Initiative in Ikoyi',
    })
    const b = item({
      id: 'pb_env_b',
      sourceId: 'src.bft_gh',
      title: 'World Environment Day 2026: Happy World Environment Day',
    })
    expect(pathBBridge(a, b)).toBe(false)
  })

  it('KNOWN RECALL GAP: a lexically-divergent genuine same-event is NOT bridged', () => {
    // The Ghana T-bill auction reported by two outlets shares only {bill, auction} after
    // normalization (overlap 0.4, 0 shared anchors). Path B (lexical overlap) cannot bridge it;
    // this is a semantic-match case beyond Path B (see PR description).
    const a = item({
      id: 'pb_tbill_a',
      sourceId: 'src.myjoyonline_gh',
      title: 'T-bills auction: Government exceeds target by 11.9%, but interest rates surge',
      countryCodes: ['GH'],
    })
    const b = item({
      id: 'pb_tbill_b',
      sourceId: 'src.norvanreports_gh',
      title: 'T-Bill Auction Oversubscribed as 91-Day Bill Clears at 5.01%',
      countryCodes: ['GH'],
    })
    expect(pathBBridge(a, b)).toBe(false)
  })
})
