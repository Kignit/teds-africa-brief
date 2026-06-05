import type { ConnectorContext } from './types'
import {
  resolvePetroleumPosition,
  petroleumTradeEvidence,
  type PetroleumFlow,
  type PetroleumTradeEvidence,
} from './petroleumTrade'

// UN Comtrade — specific traded products by value. Keyed: disabled until
// COMTRADE_API_KEY is set, and it never fabricates trade structure. Used to
// enrich a country profile's keyExports / importDependence with real products.
const SOURCE_ID = 'src.comtrade'

export type ComtradeFlow = 'X' | 'M' // export / import

// Per-FLOW diagnostics so a partial enrichment (e.g. exports populated but imports
// rate-limited) is visible per country and per flow. PURE DIAGNOSTICS: emitting these
// never changes what is fetched, the products returned, or the fail-closed omission.
export type ComtradeFlowOutcome = 'skipped_no_key' | 'non_ok' | 'empty' | 'malformed' | 'populated'
export interface ComtradeFlowDiagnostic {
  flow: ComtradeFlow
  outcome: ComtradeFlowOutcome
  /** HTTP status — present when outcome is non_ok. */
  status?: number
  /** Number of fetch attempts made (>=1); >1 means HTTP 429 was retried. */
  attempts?: number
  /** Extra context: malformed reason, or product count when populated. */
  detail?: string
}
export type ComtradeFlowDiagSink = (d: ComtradeFlowDiagnostic) => void

// --- Rate-limit hardening -------------------------------------------------------------
// The UN Comtrade free tier rate-limits bursts (HTTP 429). The profile fan-out can issue
// up to 10 calls (5 markets x 2 flows); fired together they nearly all 429. So Comtrade
// requests are PACED: a shared concurrency-1 limiter with a minimum gap, plus a 429 retry
// that honours Retry-After. None of this changes WHAT is fetched, the products returned,
// or the fail-closed contract; it only spaces the SAME requests out and retries on 429.
const COMTRADE_MIN_GAP_MS = 1_000 // ~1 request/sec — respects the common free-tier limit
const COMTRADE_MAX_ATTEMPTS = 4 // 1 initial + up to 3 retries on HTTP 429
const COMTRADE_BACKOFF_BASE_MS = 1_000 // 1s, 2s, 4s backoff when no Retry-After header
const COMTRADE_MAX_WAIT_MS = 30_000 // cap any single wait (incl. a large Retry-After)

const realSleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

// Sequential limiter: runs scheduled tasks one at a time with a minimum gap between the
// end of one task and the start of the next. Created ONCE per profile run and shared
// across all markets/flows so requests are paced, not bursted. No module-global state.
export interface ComtradeLimiter {
  schedule<T>(task: () => Promise<T>): Promise<T>
}
export function createComtradeLimiter(
  minGapMs: number = COMTRADE_MIN_GAP_MS,
  sleep: (ms: number) => Promise<void> = realSleep,
): ComtradeLimiter {
  let tail: Promise<void> = Promise.resolve()
  return {
    schedule<T>(task: () => Promise<T>): Promise<T> {
      const result = tail.then(task)
      // The next task waits for this one to settle, then a minimum gap — either outcome.
      tail = result.then(
        () => sleep(minGapMs),
        () => sleep(minGapMs),
      )
      return result
    },
  }
}

// Throttle + retry config threaded through a profile run. All fields optional; the
// connector applies conservative defaults. Tests inject an instant sleep + zero gap.
export interface ComtradeRateLimit {
  limiter?: ComtradeLimiter
  sleep?: (ms: number) => Promise<void>
  maxAttempts?: number
  backoffBaseMs?: number
}
export function createComtradeRateLimit(
  overrides: {
    minGapMs?: number
    sleep?: (ms: number) => Promise<void>
    maxAttempts?: number
    backoffBaseMs?: number
  } = {},
): ComtradeRateLimit {
  const sleep = overrides.sleep ?? realSleep
  return {
    limiter: createComtradeLimiter(overrides.minGapMs ?? COMTRADE_MIN_GAP_MS, sleep),
    sleep,
    maxAttempts: overrides.maxAttempts ?? COMTRADE_MAX_ATTEMPTS,
    backoffBaseMs: overrides.backoffBaseMs ?? COMTRADE_BACKOFF_BASE_MS,
  }
}

export interface ComtradeCallOptions {
  onDiag?: ComtradeFlowDiagSink
  rate?: ComtradeRateLimit
}

interface ComtradeRow {
  cmdCode?: string
  cmdDesc?: string
  primaryValue?: number
  refYear?: number
  period?: string | number
}

interface ComtradeResponse {
  data?: ComtradeRow[]
}

export interface ComtradeProducts {
  sourceId: string
  products: string[]
  /** Product-level provenance metadata (proves the specific trade records used). */
  reporterCode: string
  flowCode: ComtradeFlow
  /** Commodity classification scheme. */
  classification: string
  /** Commodity codes of the selected products, e.g. ['27', '84']. */
  productCodes: string[]
  refYear: number
  /** ISO-8601 'as of' derived from the data's reference year. */
  asOf: string
}

function isProductRow(r: ComtradeRow): boolean {
  return (
    typeof r.primaryValue === 'number' &&
    typeof r.cmdDesc === 'string' &&
    r.cmdDesc.length > 0 &&
    r.cmdCode !== 'TOTAL' &&
    !/all commodities|commodities not specified|not elsewhere classified/i.test(r.cmdDesc)
  )
}

function rowYear(r: ComtradeRow): number {
  return Number(r.refYear ?? r.period ?? 0)
}

// Retry-After in seconds (the form Comtrade uses), as ms; null for absent/non-numeric.
function retryAfterMs(res: Response): number | null {
  const header = res.headers.get('retry-after')
  if (header === null) return null
  const secs = Number(header)
  return Number.isFinite(secs) && secs >= 0 ? secs * 1000 : null
}

// One flow's HTTP fetch with bounded 429 retry. Returns the final response + attempt
// count. ONLY HTTP 429 is retried (honouring Retry-After, else capped exponential
// backoff); any other status returns immediately for the caller to classify.
async function comtradeFetch(
  ctx: ConnectorContext,
  url: string,
  key: string,
  sleep: (ms: number) => Promise<void>,
  maxAttempts: number,
  backoffBaseMs: number,
): Promise<{ res: Response; attempts: number }> {
  let attempt = 0
  for (;;) {
    attempt += 1
    const res = await ctx.fetch(url, { headers: { 'Ocp-Apim-Subscription-Key': key } })
    if (res.status !== 429 || attempt >= maxAttempts) return { res, attempts: attempt }
    const wait = Math.min(
      retryAfterMs(res) ?? backoffBaseMs * 2 ** (attempt - 1),
      COMTRADE_MAX_WAIT_MS,
    )
    await sleep(wait)
  }
}

// Top `topN` product descriptions by trade value for the latest available year,
// excluding aggregate totals. Returns null when disabled, unreachable, malformed, or
// empty — the caller then omits the field rather than inventing one (fail-closed). The
// optional sink reports, PER FLOW, why a flow did or did not yield products:
// skipped_no_key / non_ok(status, attempts) / empty / malformed / populated. The optional
// rate limiter paces requests (concurrency 1 + min gap) and retries HTTP 429; neither
// changes what is fetched or what is returned.
export async function fetchComtradeTopProducts(
  ctx: ConnectorContext,
  reporterCode: string,
  flow: ComtradeFlow,
  topN = 3,
  options: ComtradeCallOptions = {},
): Promise<ComtradeProducts | null> {
  const { onDiag, rate } = options
  const key = ctx.config.comtradeApiKey
  if (!key) {
    onDiag?.({ flow, outcome: 'skipped_no_key' })
    return null
  }

  // HS 2-digit (AG2) chapters vs the World partner give a country's headline
  // export/import structure. Exact period handling follows Comtrade's API.
  const url =
    `https://comtradeapi.un.org/data/v1/get/C/A/HS?reporterCode=${reporterCode}` +
    `&flowCode=${flow}&partnerCode=0&cmdCode=AG2&includeDesc=true`
  const sleep = rate?.sleep ?? realSleep
  const maxAttempts = rate?.maxAttempts ?? COMTRADE_MAX_ATTEMPTS
  const backoffBaseMs = rate?.backoffBaseMs ?? COMTRADE_BACKOFF_BASE_MS

  // The request (including its 429 retries) runs in the shared limiter slot when one is
  // provided, so Comtrade calls are serialized and paced; the logic is otherwise identical.
  const run = async (): Promise<ComtradeProducts | null> => {
    const { res, attempts } = await comtradeFetch(ctx, url, key, sleep, maxAttempts, backoffBaseMs)
    if (!res.ok) {
      onDiag?.({ flow, outcome: 'non_ok', status: res.status, attempts })
      return null
    }

    // Parse + shape-check. Non-JSON, or a payload without a `data` array, is MALFORMED
    // (distinct from empty); both still fail closed to null — nothing fabricated.
    let parsed: unknown
    try {
      parsed = await res.json()
    } catch {
      onDiag?.({ flow, outcome: 'malformed', detail: 'invalid JSON', attempts })
      return null
    }
    const data = (parsed as ComtradeResponse | null)?.data
    if (!Array.isArray(data)) {
      onDiag?.({ flow, outcome: 'malformed', detail: 'no data array', attempts })
      return null
    }

    const rows = data.filter(isProductRow)
    if (rows.length === 0) {
      onDiag?.({ flow, outcome: 'empty', attempts })
      return null
    }

    const latestYear = rows.reduce((max, r) => Math.max(max, rowYear(r)), 0)
    const ofYear = latestYear > 0 ? rows.filter((r) => rowYear(r) === latestYear) : rows

    // Aggregate duplicate HS codes within the latest year BEFORE ranking: the API can
    // return several rows for the same cmdCode, which would otherwise repeat a category in
    // the top list. Sum their value so each commodity code is ranked and listed exactly
    // once (keeping the first description seen for that code). Rows without a usable code
    // are dropped — nothing is fabricated.
    const byCode = new Map<string, { cmdCode: string; cmdDesc: string; value: number }>()
    for (const r of ofYear) {
      const cmdCode = (r.cmdCode ?? '').trim()
      const cmdDesc = (r.cmdDesc ?? '').trim()
      if (cmdCode.length === 0 || cmdDesc.length === 0) continue
      const existing = byCode.get(cmdCode)
      if (existing) existing.value += r.primaryValue ?? 0
      else byCode.set(cmdCode, { cmdCode, cmdDesc, value: r.primaryValue ?? 0 })
    }
    const top = [...byCode.values()].sort((a, b) => b.value - a.value).slice(0, topN)
    const products = top.map((t) => t.cmdDesc.toLowerCase())
    const productCodes = top.map((t) => t.cmdCode)
    if (products.length === 0 || productCodes.length === 0 || latestYear === 0) {
      onDiag?.({ flow, outcome: 'empty', attempts })
      return null
    }

    onDiag?.({ flow, outcome: 'populated', attempts, detail: `${products.length} product(s)` })
    return {
      sourceId: SOURCE_ID,
      products,
      reporterCode,
      flowCode: flow,
      classification: 'HS',
      productCodes,
      refYear: latestYear,
      asOf: `${latestYear}-12-31T00:00:00.000Z`,
    }
  }

  return rate?.limiter ? rate.limiter.schedule(run) : run()
}

// Why a dedicated HS-27 petroleum capture did or did not populate (for diagnostics).
export type ComtradePetroleumReason =
  | 'populated'
  | 'skipped_no_key'
  | 'flow_failed'
  | 'cross_year'
  | 'no_data'

export interface ComtradePetroleumResult {
  evidence: PetroleumTradeEvidence | null
  reason: ComtradePetroleumReason
}

// Dedicated HS chapter-27 export/import totals for one country - the signed petroleum
// trade position, NOT a ranked product list (it does NOT reuse fetchComtradeTopProducts).
// Queries the export and import flows separately for cmdCode=27, sums the chapter-27 value
// per year, and resolves to a single COMMON year. A failed flow (non-OK / malformed) makes
// the whole field omit (a failure is never treated as zero); a successful query that
// returns no HS-27 rows is a genuine zero. Paced + 429-retried via the shared rate limiter.
export async function fetchComtradePetroleum(
  ctx: ConnectorContext,
  reporterCode: string,
  options: ComtradeCallOptions = {},
): Promise<ComtradePetroleumResult> {
  const { rate } = options
  const key = ctx.config.comtradeApiKey
  if (!key) return { evidence: null, reason: 'skipped_no_key' }

  const sleep = rate?.sleep ?? realSleep
  const maxAttempts = rate?.maxAttempts ?? COMTRADE_MAX_ATTEMPTS
  const backoffBaseMs = rate?.backoffBaseMs ?? COMTRADE_BACKOFF_BASE_MS

  const fetchFlow = (flow: ComtradeFlow): Promise<PetroleumFlow> => {
    const url =
      `https://comtradeapi.un.org/data/v1/get/C/A/HS?reporterCode=${reporterCode}` +
      `&flowCode=${flow}&partnerCode=0&cmdCode=27&includeDesc=true`
    const run = async (): Promise<PetroleumFlow> => {
      const { res } = await comtradeFetch(ctx, url, key, sleep, maxAttempts, backoffBaseMs)
      if (!res.ok) return { ok: false, byYear: new Map() } // failed flow -> not zero
      let parsed: unknown
      try {
        parsed = await res.json()
      } catch {
        return { ok: false, byYear: new Map() } // malformed -> failed, not zero
      }
      const data = (parsed as ComtradeResponse | null)?.data
      if (!Array.isArray(data)) return { ok: false, byYear: new Map() }
      // Query succeeded: sum the chapter-27 value per year (empty map = genuine zero).
      const byYear = new Map<number, number>()
      for (const r of data) {
        if ((r.cmdCode ?? '').trim() !== '27') continue
        if (typeof r.primaryValue !== 'number') continue
        const y = rowYear(r)
        if (y > 0) byYear.set(y, (byYear.get(y) ?? 0) + r.primaryValue)
      }
      return { ok: true, byYear }
    }
    return rate?.limiter ? rate.limiter.schedule(run) : run()
  }

  const [ex, im] = await Promise.all([fetchFlow('X'), fetchFlow('M')])
  if (!ex.ok || !im.ok) return { evidence: null, reason: 'flow_failed' }
  const position = resolvePetroleumPosition(ex, im)
  if (!position) {
    const noData = ex.byYear.size === 0 && im.byYear.size === 0
    return { evidence: null, reason: noData ? 'no_data' : 'cross_year' }
  }
  return {
    evidence: petroleumTradeEvidence(SOURCE_ID, reporterCode, position, ['27']),
    reason: 'populated',
  }
}
