# TASK_QUEUE — THE LIVE QUEUE (2026-08-09)

**THE DIST: 11fb42e74f7a1af6f7153ac58fddd4b3aeb9db60d86aa5f3bb823187c4b8fd86. THE BATTERY: 175 pass / 0 fail / 638 expect.**

---

## THE GATES' STATE (the enforcement chain)

| Gate | State |
|---|---|
| The task firewall ([NO LAZY PROMPTS] — the re-enabled) | ACTIVE — the thin prompts blocked with the wave-generator directive + the [WAVE VERBATIM]/[WAVE BATCH] checks |
| The either/or gate (waveGeneratorUsed OR dispatchSkillLoads) | ACTIVE |
| The leaf-node gate | ACTIVE — the subagents cannot spawn + the 'question' tool banned (the 2026-08-09 addition) |
| The CT ORDER gate | ACTIVE — the setup with the validated plan first (the deep test's current state — the re-validation pending) |
| The CTX_FLOORS | ACTIVE — the thin context args refused with the named field (the message now teaches the dense writing) |
| The SSTF claim gate | ACTIVE + FIXED (the completed-message arming) |
| The doc-density gate | ACTIVE — the per-type floors at finalize |
| The ISE soft-warn firewall | ACTIVE |
| The theatrical firewall (the throw-only) | ACTIVE — the v3 verdict + the tracker + the ESCALATE throw + the accumulated-count check |
| The [WAVE VERBATIM] + the [WAVE BATCH] + the lines-gate | ACTIVE — the SHA verification + the multi-agent enforcement + the slop-exemption gate |

---

## THE ACTIVE TASKS (owner: the next session; dependencies; done-when)

### T1 — THE CONTAINER DEEP TEST (the #1 priority — the ACTIVE build)
- **WHAT:** execute the 7-scenario plan (.trident/test-plan.md — preflighted READY) in the container theatrical-fw-ct: the setup's re-validation (the ORDER gate) → S1 the auth probe (the generation) → S2 the fixtures (the exec) → S3 the condensed → the [WAVE VERBATIM] block → S4 the exact single → the [WAVE BATCH] block → S5 the 2-line slop → the [TASK FIREWALL] block (the lines-gate) → S6 the DPL1-grade verbatim → the EXEMPTION PASS → S7 the read regression. THE RED-TEAM DISCIPLINE: the found bugs IDENTIFIED + FIXED in the codebase + RETESTED + zero regressions.
- **THE STATE:** the fixtures ready (the wave-fx + the wave-dpl manifests in the container's tmp), the model live (DeepSeek V4 Flash (2x usage) / OpenCode Go — verified), the plan preflighted READY — the setup's re-validation is the immediate next action.
- **DEPENDENCIES:** NONE (the operator's "do the proper container deep test" is the go-ahead).
- **DONE-WHEN:** the artifact .trident/container-test-results.json records the per-scenario PASS verdicts (the passToken in tool-result context + the failToken absent + the container name + the dist SHA) + the found bugs fixed + the battery 175/0.

### T2 — THE HOST DEPLOY of 11fb42e7 (the operator's action)
- **WHAT:** the operator deploys the dist to the host (the direct copy — the host currently runs the GNR dist after the revert).
- **DEPENDENCIES:** the operator.
- **DONE-WHEN:** `sha256sum ~/.config/opencode/plugins/trident/dist/index.js` == 11fb42e7 + the process restarted + the direct tests (the wave-verbatim + the theatrical + the identity) run on the host.

### T3 — THE CHECKPOINT + THE PACKAGE SYNC
- **WHAT:** the checkpoint (Checkpoints/ALL_TOOLS_WORKING_TRIDENT_WAVE_GENERATOR_7_4) + the SHIP_PACKAGE sync to 11fb42e7 (the dist + the src + the tests + the docs) + the three-way hash.
- **DEPENDENCIES:** the deep test's completion (the sync carries the final state).
- **DONE-WHEN:** the three-way hash verified (live == checkpoint == package — 1 unique).

---

## THE COMPLETED TASKS (with the evidence they closed on — the marathon)

### C1 — THE WAVE-GENERATOR RELIABILITY FIXES (COMPLETE — the container 6/6 + the host live)
- The SSE streaming transport (the root-cause — the probes: 48.9s non-stream vs 1.0s streaming first-byte), the bounded pool (3), the telemetry, the retry-on-500, the named-partial, the 180s ceiling, the ISE prepend. THE EVIDENCE: wavegen-fix-ct's 6/6 + the host waves.

### C2 — THE THEATRICAL FIREWALL OVERHAUL (COMPLETE — the ESCALATE-throw live)
- The v3 verdict + the tracker + the throw-only enforcement + the 4 live-caught bugs fixed. THE EVIDENCE: the container's ESCALATE throw (the screenshot) + the battery.

### C3 — THE WAVE-VERBATIM OVERHAUL (COMPLETE — the host's direct tests fired the firewalls live)
- The [WAVE VERBATIM] + the [WAVE BATCH] + the lines-gate + the question-ban + the promptFile + the preservation. THE EVIDENCE: the host's direct-test tool errors + the battery.

### C4 — THE IDENTITY OVERHAUL (COMPLETE — the operator-approved finals)
- The warheads 12/13/14 + the inline wiring + the AGENTS.md + the warhead-writing skill (the full workflow + the META-AUDIT). THE EVIDENCE: the source + the build + the battery.

---

## THE BACKLOG (prioritized + the rationale)

### B1 — THE CANON DOCS' FINAL REFRESH (after the deep test)
- WHAT: the BUILD_STATE/CURRENT_STATE/EVIDENCE_STATE/NEXT_STEPS/TASK_QUEUE/DECISION_CHAIN/CHANGELOG updated with the deep test's results (the per-scenario verdicts + the found bugs + the fixes).
- RATIONALE: the docs must carry the deep test's outcomes — the current prep carries the takeover state.

### B2 — THE CT-TOOL FIXES (the TASK_QUEUE note)
- The switch-model action's race (the verify racing the variant modal — verified:false while the switch landed; the status bar is the ground truth), the setup's stale-distSha mismatch, the deploy's post-restart identity reset, the container OOM instability.
- RATIONALE: the CT tool is the single sanctioned container path — its reliability is the runtime-grade law's foundation.

### B3 — THE HONEST-LIMIT VARIANTS (the theatrical overhaul's next iterations)
- The hollow-slice, the pre-seeded fixture, the fake fork — each needs a NEW detection layer — FLAGGED, not over-engineered.

### B4 — THE WAVE-DISPATCH SCHEMA DRIFT (the extraction's finding)
- The wave-dispatch-schema.ts vs the inline zod — the two schema sources for one tool — the drift risk.

---

## THE BLOCKED ITEMS (with the blockers + the unblock paths)

### BL1 — THE CONTAINER DEEP TEST'S RUN
- **THE BLOCKER:** NONE technical — the model is live (the Go provider), the fixtures ready, the plan preflighted. The earlier attempts were blocked by the provider exhaustion + my config fumbling — RESOLVED (the switch-model with the correct display name).
- **THE UNBLOCK:** the setup's re-validation (the ORDER gate) → the 7 scenarios.

### BL2 — THE HOST DEPLOY
- **THE BLOCKER:** the operator's action (the host runs the GNR dist).
- **THE UNBLOCK:** the operator's deploy of 11fb42e7.

---

## THE IDEA FIRES (the task-queue tool's records — nothing lost)

| id | The idea | The status |
|---|---|---|
| 1 | The skill-path finding: the runtime loads skills from the project's .opencode/skills/, not the config dir | recorded (M6-followup) |
| 2 | The question-tool overhaul (the 3-call cap is "stupidly engineered") | the backlog (the cap still active — the leaf ban's the subagent-side fix) |
| 3 | The internal SQLite task-queue state machine (the operator's mandate) | the backlog |
| 4 | The CT-tool fixes (the switch-model race, the stale-distSha, the identity reset, the OOM) | the backlog B2 |
| 5 | The theatrical overhaul's honest-limit variants | the backlog B3 |
| 6 | THE CONTAINER DEEP TEST (the operator's "FIX ALL OF THIS AND FUCKING PROPERLY CONTAINER TEST") | THE ACTIVE T1 |

---

## THE BACKLOG DETAILS (the actionable content per item)

### B2 — THE CT-TOOL FIXES (the detail)
- THE SWITCH-MODEL RACE: the switch-model action's verify raced the variant modal — the "verified:false after 20 attempts" while the switch LANDED (the status bar is the ground truth — the WARHEAD 14). THE FIX IDEA: the verify reads the status bar's provider field + retries the variant-modal dismissal before reporting the failure.
- THE SETUP'S STALE-DISTSHA MISMATCH: the setup's recorded distSha vs the deployed — the stale-dist copy path. THE FIX IDEA: the setup verifies the deployed file's SHA against the local after the copy.
- THE DEPLOY'S POST-RESTART IDENTITY RESET: the restart boots with the default model (the status bar) — the identity's model preference not restored. THE FIX IDEA: the deploy restores the session's model after the restart.
- THE CONTAINER OOM INSTABILITY: the heavy generations (the 16MB dist context) OOM the container. THE FIX IDEA: the memory limit + the context-size guard.

### B3 — THE THEATRICAL HONEST-LIMIT VARIANTS (the detail)
- THE HOLLOW-SLICE: "the adapter's happy path" claimed as "the integration works" — the subject-scope inflation, no substitute token. THE NEXT DETECTION LAYER: the scope classification.
- THE PRE-SEEDED FIXTURE: a fixture written to pass with no substitute token in the claim. THE BACKSTOP: the SSTF claim gate's container-evidence requirement.
- THE FAKE FORK: a modified copy of a module claimed as the original fixed. THE HARDEST — requires the diff-vs-claim correlation.

### B4 — THE WAVE-DISPATCH SCHEMA DRIFT (the detail)
- The wave-dispatch-schema.ts (WaveAgentSpec/WaveDispatchArgs/CTX_FLOORS) vs the inline zod in createWaveDispatchTool — the two schema sources for one tool. THE FIX IDEA: the schema file consumed by the tool factory or removed.

## THE IDEA FIRES' FOLLOW-UPS
- The question-tool overhaul (id 2): the 3-call cap's redesign — the operator's "stupidly engineered" — the timeframe-based design (the backlog).
- The SQLite task-queue state machine (id 3): the trident-task-queue as the INTERNAL state machine — the operator's T1/T2 hierarchy (the todo = T1, the queue = T2).

---

## THE GATES' VERIFICATION ANCHORS (the fresh agent's check targets)

- The task firewall: trident-hooks.ts:1757+ (the [NO LAZY PROMPTS] throw) + the wave-verbatim checks at :1760+ (the tfDesc/tfPrompt/tfVerbatimEntry/tfWaveTotal logic).
- The either/or: the dispatchSkillLoads/waveGeneratorUsed sets (the firewall's first gate).
- The leaf-node gate: trident-hooks.ts:1550+ (the leafBanned — the wave tools + the question tool).
- The CT ORDER gate: container-test.ts:1220+ (the CT_SCENARIO_ACTIONS allowlist — the setup-with-plan first).
- The CTX_FLOORS: trident-task-preflight.ts:129 (the named-field refusal + the dense-writing directive).
- The SSTF: semantic-smoke-firewall.ts:322-334 + the completed-message arming at trident-hooks.ts:864+.
- The doc-density: the hooks' finalize.
- The ISE soft-warn: trident-hooks.ts:1976+.
- The theatrical throw-only: trident-hooks.ts:2033-2070 (the accumulated-count + the ESCALATE).
- The [WAVE VERBATIM]/[WAVE BATCH]/lines-gate: trident-hooks.ts:1006+ + :1760+.

## THE ACTIVE TASK'S SEQUENCE (the deep test — the step-by-step)
1. The plan wrap + the preflight (READY).
2. The setup (the ORDER gate) — the testPlanValidated + the distSha.
3. The model check (the status bar — the Go).
4. The fixtures check (the exec).
5. S1-S7 per the plan.
6. The bugs fixed + retested.
7. The artifact.
8. The sync + the hash + the docs.

---

## THE COMPLETED TASKS' EVIDENCE DETAIL (the closed items' proofs)

- C1 (the wave-generator fixes): the container 6/6 suite's per-scenario tokens (the telemetry, the 2-agent wave, the thin-args, the read, the batch contract, the switches) + the host live waves (the th-ctx: durationMs 158724, status ok) + the streaming probes (1.0s vs 48.9s first-byte).
- C2 (the theatrical): the container's ESCALATE-throw screenshot (count 15) + the 4 live-caught bugs' fixes (the F8, the scoping, the history-rescan, the production-anchor) + the battery.
- C3 (the wave-verbatim): the host's direct-test tool errors (the [WAVE VERBATIM] + the [WAVE BATCH]) + the battery + the source audit.
- C4 (the identity): the operator-approved warheads + the inline regen + the AGENTS.md + the skill (the full workflow) + the battery.

## THE QUEUE'S NEXT-SESSION CONTRACT (the deep test's owner obligations)

- The owner: the next session (the POST-COMPACTION_PROMPT's sequence).
- The obligations: the setup's re-validation → the 7 scenarios → the bugs fixed + retested → the artifact → the sync → the docs.
- The evidence standard: the per-scenario verdicts in the artifact (the WARHEAD 13).
- The proven-path discipline: the args-check first, the skill-load on failure, never improvise (the WARHEAD 14).

---

## THE TASK QUEUE'S RESUME PROTOCOL (the next session's entry)

1. The FIRST action: the proof-of-context (the 5 points in the POST-COMPACTION_PROMPT).
2. The FIRST task: T1 (the container deep test) — the setup's re-validation → the 7 scenarios.
3. The gates' verification: the battery (175/0) + the dist (11fb42e7) + the container (alive + the Go model).
4. The evidence standard: the artifact's per-scenario verdicts (the WARHEAD 13).
5. The discipline: the proven-path (the args-check first), the red-team (the adversarial dominant), the density (the family multipliers).

## THE QUEUE'S COMPLETION CRITERIA (the deep test's done-when)

- The artifact: the per-scenario PASS verdicts (the S1-S2 + S6-S7 PASS + the S3-S5 BLOCK).
- The battery: 175/0 after the fixes.
- The sync: the three-way hash (1 unique).
- The docs: the canon refresh + the DEBUG_LOG/BUILD_REPORT entries.

---

## THE QUEUE'S OPERATOR-CONTEXT (the why the deep test matters)

The ship rejection + the "FIX ALL OF THIS AND FUCKING PROPERLY CONTAINER TEST" — the deep test is the trust-rebuild: the current build's container verification must be REAL (the plan + the full run + the fixes) before the operator's deploy. The artifact's verdicts are the operator's evidence.

---

## THE QUEUE'S CROSS-DOC REFERENCES

- The deep test's plan: .trident/test-plan.md + NEXT_STEPS.md's scenario details.
- The state: BUILD_STATE.md (the SHA chain) + CURRENT_STATE.md (the modules).
- The evidence: EVIDENCE_STATE.md (the provenance + the pending claims).
- The doctrine: DECISION_CHAIN.md (the canon) + COMPACTION_SURVIVAL.md (the laws).

---

## THE QUEUE'S READER'S NOTE

The queue is the live state — the next session's first task is T1 (the deep test); the gates' table is the enforcement map; the backlog is the prioritized future.
