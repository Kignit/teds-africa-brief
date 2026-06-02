# Ted's Africa Brief

An AI-powered intelligence brief for five African launch markets — **Ethiopia,
Kenya, Nigeria, Ghana, South Africa** — that makes sense of global events and
explains what they mean for each country and the continent.

This repository is the **engineering foundation**, a **V0 analysis engine**, and
a **live ingestion pipeline**. It moved from a static design prototype to a real,
test-enforced trust pipeline, added deterministic country-specific causal
reasoning over the trusted inputs, and now runs real connectors end-to-end —
collect → validate/corroborate → analyse → publish gate — with hardcoded product
data removed from runtime, raw sourced inputs kept separate from methodology-gated
derived labels, and country profiles requiring source evidence. There is **no LLM yet** — V0 is fully
rules-based, and any future model must sit behind an adapter that only rephrases
already-grounded text (it may not create facts, figures, sources, events, or
citations).

---

## The product principle: the moat is the trust pipeline, not the UI

1. Numbers and news travel in **separate intake lanes**.
2. A number becomes a `VerifiedFigure` only after **source attribution,
   timestamping, and range validation**.
3. News becomes an `Event` only after **deduplication and corroboration**
   (≥ 2 independent sources, else it is explicitly marked single-source).
4. The (future) AI may reason only over verified figures, corroborated events,
   and source-backed country profiles.
5. The AI must not invent facts, figures, sources, or spreads.
6. Anything unverified is **omitted or clearly labelled** — never faked.
7. A brief is publishable only after passing the **publish gate**.

These rules are enforced by tests (see Guardrails below), not just by intent.

---

## Running it

```bash
npm install      # install dependencies (required first)
npm run dev       # start the dev server
npm run build     # type-check + production build
npm run test      # run the test suite once
npm run test:watch
npm run lint       # eslint
npm run typecheck  # tsc project references, no emit
npm run format     # prettier --write
npm run verify     # format:check + typecheck + lint + test (the full gate)
```

Optional API keys (the app runs without them; keyed connectors stay disabled
until set — they never fabricate data):

```bash
cp .env.example .env   # then add EIA_API_KEY / FRED_API_KEY if you have them
```

---

## Deploy / preview gates

A deployed preview must not go live from a commit that merely builds — it must
pass the **same trust suite as local development**.

- `npm run verify` runs **format:check → typecheck → lint → test**; the production
  build is a separate `npm run build`.
- **Vercel** ([`vercel.json`](vercel.json)) builds with
  `npm run verify && npm run build`, so a preview is published **only** after the
  full gate suite passes — failing tests, lint, typecheck, or formatting fail the
  deployment.
- **GitHub Actions** ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)) runs
  `npm install`, `npm run verify`, then `npm run build` on every push/PR to `main`.
- The build needs **no live connector API keys and fetches no network data**: the
  runtime entry renders an empty state until a gated `BriefDraft` is supplied, and
  connectors (injectable `fetch`, keyed feeds disabled by default) are never invoked
  at build time.

---

## Project structure

```txt
src/
  app/          App shell + theme (one honest screen)
  components/   Provenance, FigureCard — render only from trusted data
  data/         source registry/config only, not intelligence facts
  domain/       typed trust models incl. Methodology (raw inputs vs derived labels)
  server/
    runtimeMode   live ingestion latch
    connectors/   open.er-api FX, World Bank (figures + raw profile inputs), RSS,
                  GDELT, EIA/FRED (keyed), UN Comtrade (keyed, profile products)
    ingestion/    runLiveIngestion pipeline, live connector wiring, dedupe
    verification/ validateFigure, ranges, corroborate, spreads, sources,
                  country-profile field-source contracts (raw + derived + methodology)
    analysis/     V0 engine — classifyEvent, inferTransmissionChannels,
                  scoreCountryImpact, generateCausalLinks, confidence,
                  languageAdapter, methodologies (raw→label, approval-gated),
                  composeAnalysisDraft, buildBrief (composeStub.ts is a deprecated shim)
    publishing/   publishGate  (mechanical trust enforcement, source-registry aware)
  tests/        guardrail + smoke tests
prototype/      the original static HTML/JSX mockups (reference only)
```

### Domain model (every fact traces back to a source)

`Source → SourceDocument → (VerifiedFigure | Event) → Claim → BriefDraft →
PublishGateResult → published`

---

## Guardrails (enforced by tests)

- A brief **cannot publish** with an unverified figure.
- A market figure must have **source, timestamp, and in-range value**.
- A news event needs **≥ 2 independent sources**, otherwise it is marked
  single-source (not corroborated).
- **Invented Eurobond spreads are rejected** at validation and at the gate.
- A claim marked "verified" with no verified backing is blocked.
- The UI **does not render "verified" / "cross-checked"** without provenance.
- The app renders and shows its prototype banner.
- The analysis engine **refuses unverified figures** and generates analysis **only
  from corroborated events** — single-source and unconfirmed news are stored as
  evidence but never become causal links.
- **A published brief contains no unverified claims** (`unverified_claim`), and a
  section may only reference a claim the brief carries and that is verified
  (`invalid_section_claim`). The runtime UI renders **only verified claims**.
- The public runtime **event display is corroborated-only**: the main Events surface
  shows only corroborated events, and single-source/unconfirmed events are segregated
  into a clearly-labelled, non-publishable **watchlist** — they can never look like
  verified intelligence.
- **Every causal effect carries evidence references** (event id, figure id, profile
  field id, and profile-field source ids when profiles are used).
- Oil-shock country effects appear only when a sourced `oilStance` exists; a
  dollar/rates shock weighs sourced dollar-debt exposure; currency-regime and
  political-sensitivity effects appear only when those fields are sourced.
- Analysis claims pass the publish gate **only when backed**.
- Runtime content comes **only from the ingestion pipeline**; product-looking
  sample data and unsourced country profiles are not allowed in `src/app` or `src/server`.
- A connector failure **fails closed** — it contributes nothing and is recorded
  in diagnostics, never replaced by a fabricated fallback.
- Every figure/event **source id must resolve** to the source registry — enforced
  at ingestion and again at the publish gate.
- Country profiles store **raw sourced inputs** (e.g. external debt % of GNI, with
  source ids, timestamp, and indicator code) **separately from derived labels**
  (e.g. high/medium/low exposure). Profiles missing the required raw backbone or
  carrying unregistered evidence are rejected before analysis.
- **Each profile field must match a declared source contract** — a registered
  source is necessary but **not sufficient**. External debt is accepted only from
  World Bank with indicator `DT.DOD.DECT.GN.ZS`; exports/import-dependence only from
  Comtrade — and Comtrade fields additionally require **product-level metadata**
  (reporter, flow, scheme, product codes, year), not just a source id. Oil stance,
  currency regime, and political sensitivities have **no accepted contract yet** and
  are rejected if present. Wrong source, wrong/missing indicator, missing product
  metadata, or a derived label whose **raw inputs** fail their own contract all
  fail verification.
- A **derived label** (debt exposure, oil stance) is emitted only through an
  **explicit, approved methodology** and carries both source and methodology
  provenance. With no approved methodology the label is **omitted** and the engine
  **skips** the exposure-sensitive conclusions that would need it — never guessing.
- **No analytical thresholds or causal rules are hardcoded anonymously.** Banding
  rules and the **deterministic causal rules** (oil shock, dollar/rates, inflation,
  policy rate, FX move, debt/fiscal, trade, deal, political risk) live in versioned,
  owned `Methodology` objects (`kind: 'banding' | 'causal'`). A causal rule carries
  the `shockType`, mechanism, and channels it licenses (the registry, not the
  engine, is the source of truth), and each causal effect cites it.
- Country-profile fields with no real source (currency regime, political
  sensitivities) are **omitted, not guessed**; the engine degrades gracefully.
- **Profile + methodology evidence survives** from analysis effect → claim →
  brief → publish gate. A `Claim` carries the profile fields, source ids, and
  methodology ids it relies on; the `BriefDraft` carries the verified profiles and
  methodologies as a self-contained audit trail.
- **Claim-level evidence is not decorative.** For every verified causal claim the
  gate re-resolves its cited profile fields and requires the claim's own
  `profileSourceIds` to **exactly** match (no missing, wrong, or extra ids —
  `profile_source_mismatch`), each field to pass its source contract
  (`profile_field_contract_mismatch`) and resolve to a profile in the brief
  (`profile_evidence_missing`), and the methodology citations to be complete
  (`methodology_missing` / `methodology_not_approved`).
- **No verified causal claim publishes on event corroboration alone** — every one,
  including event-only claims, must cite the **exact causal rule bound to its shock**
  (`method.causal.${shockType}.v1`); a rule for the wrong shock fails
  (`causal_methodology_shock_mismatch`), a draft/missing one fails
  (`causal_methodology_missing`).
- **The methodology section is an exact, registry-verified audit trail.** Every
  methodology a claim relies on — causal rules **and** derived-field (banding)
  methodologies — must be **carried by the brief** (`methodology_missing` if omitted)
  and validated against the approved `METHODOLOGY_REGISTRY`, never the brief's or
  profile's self-declared status. The carried object must match the registry on
  **every field** (a mutated name/description/owner/mechanism/channels/status/
  shockType/version/bands fails — `methodology_registry_mismatch`); a
  **fake/unregistered** "approved" methodology fails (`methodology_not_approved`).
  And the set must be **exact**: nothing beyond what a verified claim requires
  (`methodology_extra`) and no id carried twice (`methodology_duplicate`). The gate
  is the final authority for figures, events, profile fields, and methodologies.
- A live brief is returned for rendering **only when the gate passes** (otherwise null).

---

## Analysis engine (V0)

Deterministic, transparent, and grounded. The flow (`src/server/analysis/`):

1. **Inputs** — only verified figures, corroborated/single-source-labelled events,
   and source-backed country profiles. Unverified figures are refused; unconfirmed
   events are ignored; profiles are refused unless raw inputs carry source evidence
   and any derived label carries an approved methodology reference.
2. **classifyEvent** — tags each event by shock type (oil, dollar/rates, inflation,
   policy-rate, FX move, debt/fiscal, trade, deal, political).
3. **inferTransmissionChannels** — the channels in play (FX, inflation, debt service,
   fiscal revenue, trade balance, consumers, growth, political risk).
4. **scoreCountryImpact** — turns each `CountryProfile` into country-specific
   effects. Banded conclusions (e.g. dollar-debt exposure) run only when an
   approved-methodology label is present; with a raw value but no methodology it
   skips the exposure conclusion rather than guessing. Any path whose required
   field is absent is skipped.
5. **generateCausalLinks → composeAnalysisDraft** — emits `CausalLink[]` and verified
   `Claim[]` as an `AnalysisDraft`. Each effect's evidence records source ids and,
   for derived fields, the methodology ids behind them.
6. The draft folds into a `BriefDraft` so the **publish gate** still blocks anything unbacked.

**Raw data vs derived analysis.** Connectors emit _raw sourced inputs_ only (e.g.
World Bank external debt % of GNI, stored with its source, timestamp, and indicator
code). Turning a raw number into a _derived label_ (`high`/`medium`/`low` exposure,
`exporter`/`importer`/`neutral` stance) is a **methodology** decision, encoded in an
explicit, versioned, owned `Methodology` (`src/server/analysis/methodologies.ts`)
that ships `draft` until reviewed. No approved methodology ⇒ no label ⇒ the engine
omits or skips, never guesses. There are no hidden thresholds in connector/engine code.

Each effect carries: trigger, mechanism, per-country tone (`pos | neg | neutral`),
channels, **evidence references**, a **confidence** level, and a concise "why".

**Limits of V0 (read before trusting it):** it is rule-based, not a model; direction
and classification come from headline keywords; confidence is heuristic; it reasons
only over the inputs it is given. Language is produced by a deterministic phraser
behind the `Phraser` seam in `languageAdapter.ts` — the only place a future LLM may
plug in, and only to rephrase grounded text.

---

## What is real vs prototype-only

**Real (this pass):**

- Build / test / lint / type-check tooling, with the required scripts.
- The typed trust domain model.
- The publish gate and verification logic, enforced by tests.
- First connectors as typed, unit-tested functions (injectable `fetch`, so
  tests never hit the network).
- **Live ingestion pipeline** (`src/server/ingestion/`) — `runLiveIngestion`
  drives connectors → validate/corroborate → V0 analysis → publish gate end to
  end, fails closed on connector errors, and returns a brief only when the gate
  passes. Figures, news, and country profiles enter through connector interfaces.
  The default no-key set wires open.er-api FX (market), GDELT (news), and the
  World Bank country-profile connector.
- **Country-profile connector** (`src/server/connectors/countryProfile.ts`) —
  derives dollar-debt exposure (external debt % GNI) from a real World Bank
  indicator, with field-level provenance and the country name taken from the WB
  payload. UN Comtrade adds specific export/import products when keyed. Oil stance,
  currency regime, and political sensitivities are **omitted** until a real source is
  wired — never guessed. Unit-tested with an injectable `fetch`.
- One honest screen rendered from the contracts; it displays no figures, events,
  profiles, or analysis unless a gated brief is supplied.

**Prototype-only / not yet built:**

- `prototype/` — the original static mockups. The **Economist Edition** is the
  intended visual reference. Its figures are illustrative, not live.
- **No runtime sample data.** Tests use synthetic fixtures only; product runtime
  either receives connector-backed data or renders nothing.
- **No scheduler, store, or served live brief yet.** The pipeline runs on demand
  against live sources; nothing yet runs it on a timer, persists results, or
  supplies the live brief to the app screen.
- **No LLM.** The V0 analysis engine is deterministic and rule-based. A future
  model may only plug in behind the `Phraser` seam to rephrase grounded text.

---

## Next milestones

The V0 engine and the live ingestion pipeline exist. From here:

1. **Finish the country knowledge base** — the World Bank + Comtrade profile
   connector now ships dollar-debt exposure and (keyed) export/import products with
   field-level provenance. Still to source: **oil stance** from true product-level
   trade balance, **currency regime** (e.g. IMF AREAER), and **political
   sensitivities**, which are omitted today.
2. **Schedule + store + serve** — run `runLiveIngestion` on a timer, persist the
   gated briefs, and supply the live brief to the app. Add more connectors from
   the source map (RSS feeds, keyed EIA/FRED/Comtrade).
   See `Ted's Africa Brief — Source Map.md`.
3. **Sharpen the engine** — richer classification and direction detection, figure-linked
   magnitudes, and calibration of confidence beyond heuristics.
4. **Optional LLM phrasing** — only behind the `Phraser` seam, only to rephrase
   grounded text; never to create facts, figures, sources, or citations.
