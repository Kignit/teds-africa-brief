# Ted's Africa Brief

An AI-powered intelligence brief for five African launch markets — **Ethiopia,
Kenya, Nigeria, Ghana, South Africa** — that makes sense of global events and
explains what they mean for each country and the continent.

This repository is the **engineering foundation**, not the finished product. The
goal of this pass was to move from a static design prototype to a real,
test-enforced trust pipeline. **The AI analysis engine (the moat) is not built
yet** — it is the next milestone.

---

## The product principle: the moat is the trust pipeline, not the UI

1. Numbers and news travel in **separate intake lanes**.
2. A number becomes a `VerifiedFigure` only after **source attribution,
   timestamping, and range validation**.
3. News becomes an `Event` only after **deduplication and corroboration**
   (≥ 2 independent sources, else it is explicitly marked single-source).
4. The (future) AI may reason only over verified figures, corroborated events,
   and country profiles.
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
```

Optional API keys (the app runs without them; keyed connectors stay disabled
until set — they never fabricate data):

```bash
cp .env.example .env   # then add EIA_API_KEY / FRED_API_KEY if you have them
```

---

## Project structure

```txt
src/
  app/          App shell + theme (one honest screen)
  components/   Provenance, FigureCard — render only from trusted data
  data/         sources, country profiles, labelled SAMPLE data
  domain/       typed trust models (the contracts)
  server/
    connectors/   World Bank, open.er-api FX, RSS, GDELT, EIA/FRED (keyed)
    ingestion/    dedupe
    verification/ validateFigure, ranges, corroborate, spreads
    analysis/     composeStub  (NON-AI placeholder — the real engine is next)
    publishing/   publishGate  (mechanical trust enforcement)
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

---

## What is real vs prototype-only

**Real (this pass):**

- Build / test / lint / type-check tooling, with the required scripts.
- The typed trust domain model.
- The publish gate and verification logic, enforced by tests.
- First connectors as typed, unit-tested functions (injectable `fetch`, so
  tests never hit the network).
- One honest screen rendered from the contracts.

**Prototype-only / not yet built:**

- `prototype/` — the original static mockups. The **Economist Edition** is the
  intended visual reference. Its figures are illustrative, not live.
- **Sample data** in `src/data/sampleData.ts` — clearly labelled, used only to
  render the screen. The app shows a "Prototype build" banner.
- **Connectors are not yet scheduled or run** against live sources; there is no
  database, scheduler, or runtime ingestion yet.
- **No AI.** `analysis/composeStub.ts` is a deterministic placeholder.

---

## Next milestone

Not "more screens." The next milestone is the **analysis engine** — the causal
reasoning that turns verified figures + corroborated events + country profiles
into divergent, per-country impact. That is the moat. See
`Ted's Africa Brief — Source Map.md` for how sources connect.
