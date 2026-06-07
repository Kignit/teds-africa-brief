# Artifact workflow runbook

Operational guide to the "Generate brief artifact" GitHub Actions workflow. Covers the
three workflow paths, validator failure triage, the rollback procedure for a bad artifact,
and the exact post-run audit checklist. Read this before dispatching a run.

This is a structural runbook. It does NOT replace the trust doctrine: the publish gate,
field-source contracts, methodology approval, and corroboration rules all stay in force.
The artifact validator is a separate, narrower structural audit layered on top - it never
re-runs classifier / gate / scoring / methodology logic.

## Workflow at a glance

The workflow lives in `.github/workflows/brief.yml`. It runs `workflow_dispatch` on demand
and via cron at `0 6 * * *` (daily 06:00 UTC). Steps in order:

| #   | step                                    | flags                                     |
| --- | --------------------------------------- | ----------------------------------------- |
| 1   | `actions/checkout@v4` (ref: main)       | -                                         |
| 2   | `actions/setup-node@v4`                 | -                                         |
| 3   | `npm ci`                                | -                                         |
| 4   | `npm run brief:generate`                | `id: generate`, `continue-on-error: true` |
| 5   | `npm run brief:validate`                | `if: steps.generate.outcome == 'success'` |
| 6   | `npm run verify`                        | default `if: success()`                   |
| 7   | `npm run build`                         | default `if: success()`                   |
| 8   | Commit artifact if changed              | `if: success()`                           |
| 9   | Fail the run if generation did not pass | `if: steps.generate.outcome == 'failure'` |

Steps 4-9 land the artifact (or a cleared null) and mark the job pass/fail. Steps 1-3 are
setup. The combined trust gate is `validate` + `verify` + `build` - all three must pass
before the commit step runs.

## The three paths

| path                  | generate  | validate                     | verify+build | commit               | final fail-step | job       | artifact effect                                 |
| --------------------- | --------- | ---------------------------- | ------------ | -------------------- | --------------- | --------- | ----------------------------------------------- |
| **A** happy           | ok        | runs, passes                 | runs, passes | commits live brief   | skipped         | **green** | new gate-passed brief on main                   |
| **B** validate blocks | ok        | runs, **fails**              | auto-skipped | **auto-skipped**     | skipped         | **red**   | no change; bad artifact NOT pushed              |
| **C** generate fails  | **fails** | **skipped** (gate condition) | runs, passes | commits cleared null | runs, exit 1    | **red**   | `{ brief: null }` on main; stale output cleared |

Why the validator is skipped on Path C: a generation failure writes the cleared
`{ brief: null }` envelope. That envelope intentionally fails `validateBriefShape`, which
would block the cleared-and-clear commit path. The `if: steps.generate.outcome == 'success'`
gate sidesteps validation in that case, so the existing fail-and-clear behaviour is
preserved and the final step still marks the run red.

Why no invalid artifact ever lands on Path B: validate is NOT `continue-on-error`, so its
failure makes `success()` false for every subsequent default-`if` step. Verify and build
auto-skip; the commit step's explicit `if: success()` also evaluates false; the commit is
skipped without needing any other gating.

## Validator failure triage

`npm run brief:validate` exits 1 on any failure. Each rule below is a failure (block);
warnings are listed in the next section and are non-blocking.

| failure rule                       | what it means                                                                                      | first place to look                              |
| ---------------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| `envelope_shape`                   | top-level JSON not `{ generatedAt, brief }`                                                        | brief writer / `produceBrief.ts`                 |
| `envelope_generated_at`            | `generatedAt` missing or not a valid ISO                                                           | clock / serialization                            |
| `brief_shape`                      | brief id/date/edition/status/dataMode wrong, or a required collection missing                      | schema drift vs `domain/brief.ts`                |
| `event_shape`                      | event missing id/title/summary/status/occurredAt or `corroboration` sub-fields                     | connector or `corroborate.ts`                    |
| `window_shape`                     | rolling-window envelope wrong shape                                                                | `newsWindow.ts` serialization                    |
| `window_item_shape`                | window item missing source-backed fields                                                           | RSS / GDELT connector                            |
| `claim_event_unresolved`           | claim cites an event not in `brief.events`                                                         | `buildBrief.ts` pruning                          |
| `claim_methodology_unresolved`     | claim cites a methodology not in `brief.methodologies`                                             | `buildBrief.ts` methodology dedup                |
| `claim_figure_unresolved`          | verified claim cites a missing figure                                                              | `buildBrief.ts` figure filter                    |
| `claim_country_unresolved`         | verified claim country not in `brief.profiles`                                                     | profile verification dropped it                  |
| `claim_unbacked`                   | verified claim has no figure or event backing                                                      | publish gate regression - investigate            |
| `section_shape`                    | section field missing / typed wrong                                                                | `buildBrief.ts` section construction             |
| `section_claim_unresolved`         | section cites a claim not in `brief.claims`                                                        | `buildBrief.ts` section-claim wiring             |
| `entity_residue_full`              | a well-formed `&amp;` / `&#NN;` / `&#xNN;` / decoder-known named entity survived in public text    | `decodeEntities.ts` regression - rerun ingestion |
| `entity_residue_allowlist_no_semi` | an allowlisted decimal (`38`, `8211`, `8216`, `8217`, `8220`, `8221`, `8230`) survived without `;` | decoder leniency regression                      |

After diagnosing: do NOT hand-edit the artifact. Fix the underlying cause, then re-dispatch
the workflow (path A). If the bug is in the validator itself rather than the artifact, fix
the validator and re-validate.

## Validator warnings (non-blocking)

| warning rule              | what it means                                                                                                                                                                                                         |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `entity_residue_fragment` | broad fragment like `[&#`, `[&#823`, `&#1234`, or hex without `;` (e.g. `&#x2013`) - the decoder intentionally leaves these literal because there is no safe decode (the original entity is unknowable). Report-only. |

A small handful of these per regen is normal (typically 2-6 from real upstream feed
truncation). A sudden jump in warning count means an upstream source's encoding changed -
worth a look, but never blocks landing.

## Rollback procedure (bad artifact on main)

PR #33 makes a bad artifact landing on main near-impossible: validate fails -> commit skipped.
But document the recovery path anyway, in case a future workflow change unblocks something
or a defect bypasses the validator:

1. Identify the bad commit: `git fetch origin && git log origin/main --oneline -3`. The
   bad commit is a `chore: regenerate brief artifact (...)` by `github-actions[bot]`.
2. Pick the last known-good artifact commit immediately before it.
3. From a clean clone:
   ```
   git fetch origin
   git checkout -b revert/bad-artifact origin/main
   git revert <bad-SHA> --no-edit
   git push -u origin revert/bad-artifact
   ```
4. Open a PR via the GitHub UI. Codex / human review. Merge to main.
5. Vercel auto-redeploys serving the prior brief.

Alternative (preferred when the underlying defect is already fixed): re-dispatch the
"Generate brief artifact" workflow on main. A fresh path-A run lands a new clean artifact
that supersedes the bad one; no revert needed. The rolling-window store is rewritten
in the same commit, so any persisted-window contamination clears in the same regen cycle
(per PR #30's idempotent decode at `readPriorWindow`).

## Post-run audit checklist

Run this after every "Generate brief artifact" dispatch (or after the daily cron). The
goal is to confirm the workflow took Path A and produced a pre-production safe artifact.

Steps 2-6 below can be automated: `npm run brief:audit` reads the committed artifact +
window, reuses the validator's checks, and emits a deterministic JSON report covering
counts, validator failures / warnings, oilStance labels by country, and each verified
claim's resolved provenance (events, methodologies, source ids, figures, plus any
unresolved refs). It exits 1 on validator failures and 0 otherwise - useful for CI
archival or piping into a triage doc. Step 1 (workflow-log inspection) and step 7
(verdict) still want a human.

1. **Workflow log**: confirm step order in the run is
   `generate -> validate -> verify -> build -> commit`. The "Validate the freshly
   generated artifact before commit" step must show non-skipped output (Path A, not C).
   No `git push` may occur before validate completes in the same job.

2. **New commit on main**: `git fetch origin && git log origin/main --oneline -3`. Expect a
   single new `chore: regenerate brief artifact (<ISO>)` commit by `github-actions[bot]`,
   touching only `public/brief.json` and `data/news-window.json`.

3. **Independent re-validation**: from a clean clone of the new HEAD, run
   `npm run brief:validate`. Expect:
   - exit code 0 (PASS)
   - failures: 0
   - warnings: a small handful (`entity_residue_fragment`) - typical, not blocking

4. **Counts vs the prior artifact**: extract `generatedAt` plus event / corroborated /
   claim / figure / profile counts from the new `public/brief.json`. Any movement should
   be attributable to news-window drift (different items in the rolling 72h window), not
   to classifier / gate / scoring / methodology rule changes.

5. **Claim spot-check**: for each verified claim, confirm `eventIds`, `methodologyIds`,
   `figureIds`, `profileSourceIds`, and `countryCode` all resolve cleanly to objects the
   brief carries. The runtime provenance display (PR #28) renders these directly, so a
   broken ref would surface as a visible defect.

6. **Stance / classification stability**: confirm `oilStance` labels remain stable on the
   five profiles (NG exporter / ET, KE, ZA importer / GH neutral) given the same raw
   `petroleumTrade`. Confirm refinery-capacity stories (e.g. Dangote) and electricity-
   utility stories (e.g. Eskom) stay corroborated-but-unclassified - those are expected
   evidence-only outcomes, not regressions.

7. **Verdict**: pre-production safe = **yes** if validator PASS + no rule drift + every
   verified claim resolves. Otherwise **no**, and triage from the failure list above.

## References

- Workflow: `.github/workflows/brief.yml`
- Validator script: `scripts/validateBriefArtifact.ts` (invoked via `npm run brief:validate`)
- Validator tests: `src/tests/validateBriefArtifact.test.ts`
- Runtime loader (re-runs the publish gate before render): `src/app/briefSource.ts`
- Rolling-window store: `data/news-window.json` (committed; outside `public/`)
- Publish gate (the trust gate that runs both at generation time and on the runtime
  loader): `src/server/publishing/publishGate.ts`, with the field-source / corroboration
  contracts under `src/server/verification/`
- Key PRs that shape the current pre-production posture: #28 (claim provenance display),
  #29 (ingestion HTML entity decoding), #30 (persisted rolling-window sanitation),
  #31 (truncated numeric entity decoding), #32 (artifact validator),
  #33 (workflow wiring)
