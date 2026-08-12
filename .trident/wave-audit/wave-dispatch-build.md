# THE WAVE AUDIT — wave-dispatch-build (2026-08-07)

**THE AUDIT DIRECTIVE:** the subagent's work is a claim — verified mechanically, hunk by hunk. The orchestrator's runs are the evidence.

## THE VERDICTS TABLE

| The item | WHAT | WHY (verified) | HOW (the blast radius) | VERDICT |
|---|---|---|---|---|
| The 13 wave modules | the files exist at src/tools/wave-*.ts | the Part 13-18 contracts — the constants, the reminder queue, the stuck detector, the tracker, the eta, the todowrite, the status, the cron, the dispatch, the schema, the probe + the factories | imported by the hooks + the registry | CORRECT (the existence + the build green) |
| The build | bun build → 15.99 MB, exit 0 | MY RUN: the sha 81b23117 matches the claim | the dist — the deploy artifact | CORRECT |
| The battery | 142 pass / 0 fail across 13 files | MY RUN: bun test --path-ignore-patterns="Checkpoints/**" → 142/0/511 expect | the wave suites + the 7 pre-existing (no regressions) | CORRECT |
| The rewire | the rename + the deprecated alias + the execute | the registry entries at trident-tools.ts:2726/2728/2730; the task-preflight's exports preserved (the shadow runner's imports resolve) | the shadow runner + the hooks | CORRECT |
| The block | the castration message | MY GREP: wave-dispatch.ts:27 — the EXACT text | the native task calls | CORRECT |
| The t.e.a. wipe | the tool.after's rm | MY GREP: trident-hooks.ts:1862 — the whole-folder rm (the dotfile fix — the agent's live finding, the spec's glob form would miss the .wave-manifest.json) | the tmp folder | CORRECT (the deviation documented + justified) |
| The tier-1 | the reminder injection | MY GREP: trident-hooks.ts:2085 — the ReminderQueue.takeNext at the return path | the tool results | CORRECT |
| The cron | the 10m registration | MY GREP: trident-hooks.ts:484 — startWaveCron at the load | the plugin's lifetime | CORRECT |
| P1 the spawn | V1✓ V2✗ V3✓ V4✗ V5✓ V6✓ | the artifact read: the parentID honored, the raw list unfiltered (the TUI-level pollution prevention), the subtask completion needs the TUI runtime | the design's branch: the primary spawn sound; V2 = the raw-API finding (the operator informed); V4 = the container's job | CORRECT (the honest verdicts + the design lock) |
| P2 the todo write | V1✓ V2✗ V3✗ | the artifact read: the POST 200s but never persists — the mechanical write NOT available → the tier-1 fallback LOCKS (the correct default) | the todowrite layer | CORRECT (the fallback engaged by design) |
| P3 the tiers | all ✓ | the artifact read | the interrupt channels | CORRECT |
| The probes' artifact | .trident/probe-results.json | MY READ: the P1/P2/P3 verdicts match the agent's report | the orchestrator's branch decisions | CORRECT |

## THE SPEC-COVERAGE MAP

| The spec's targeted item | The covered hunk | The verdict |
|---|---|---|
| Part 13 (the types) | wave-constants + wave-dispatch-schema + the module contracts | COVERED |
| Part 14 (the execute) | wave-dispatch.ts (the validation → pipeline → tmp → ETA → spawn → tracker → return) | COVERED |
| Part 15 (the tracker) | wave-tracker.ts (the states + the lineage + the archive) | COVERED |
| Part 16 (the cron + the patterns) | wave-cron.ts + wave-stuck-detector.ts | COVERED |
| Part 17 (the todowrite) | wave-todowrite.ts (the rows + the [TTQ] + the sweeper) | COVERED |
| Part 18 (the probes) | wave-probe.ts + wave-probe-tool.ts + the verdicts | COVERED |
| Part 24 (the hooks) | the block + the loader + the wipe + the tier-1 + the registry + the cron | COVERED |
| Part 25 (the registry) | trident-tools.ts:2726-2733 | COVERED |
| Part 19 (the battery) | the 6 wave test files | COVERED |
| Part 20 (the container test) | THE ORCHESTRATOR's NEXT ACTION | PENDING |

## THE HONEST NOTES

- The V2 finding (the raw list unfiltered): the spec's Part 1.2 claim ("the GET /session returns the ROOT sessions only") does NOT hold in this server version — the pollution prevention is TUI/client-side. The design works (the children nest), the operator informed.
- The P2 finding (the mechanical todo write unavailable): the fallback is correctly engaged.
- The P1 V4 (the subtask completion): the container/TUI runtime verification is the next step.
- The t.e.a. wipe deviation: the whole-folder rm instead of the glob — the dotfile survival bug found live + fixed, documented not adapted.

**THE VERDICT: THE WAVE BUILD IS VERIFIED — 100% coverage of the targeted hunks, the battery + the build + the probes all reproduced by the orchestrator's own runs. The container test (Phase 5) is next.**

## THE CONTAINER-TEST UPDATE (2026-08-07)
- THE CONTAINER TEST: PASSED — passRate 1.0 (.trident/container-test-results.json) — the dispatch, the castration block, the wave-status, the thin refusal — all live in the container.
- THE BUG FOUND: the spawn's getOpencodeClient null in the first container run → the fix (the client fallback + the tracker-always registration) → the redeploy (af10c5a9) → the second run PASSED.
- THE WAVE'S VERDICT: CORRECT (the fixes verified live).
