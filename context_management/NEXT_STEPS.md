# NEXT_STEPS — THE WAVE PLAN (2026-08-09)

**THE MISSION:** complete the container deep test of the 4.4.2 build (the dist `11fb42e7`) per the WARHEAD 13's mandate — the container-testing plan (`.trident/test-plan.md`, the 7 scenarios, preflighted READY) executed in the TUI to completion, the found bugs fixed + retested + zero regressions, the results artifact with the per-scenario PASS verdicts. Then: the checkpoint/package sync + the three-way hash + the canon docs' final refresh. THE GATE: none — the operator's "do the proper container deep test" is the go-ahead.

---

## THE CONTAINER DEEP TEST (the ACTIVE work — the exact sequence)

### STEP 1 — THE SETUP'S RE-VALIDATION (the ORDER gate)
The deploy/restart cycles reset the setup-validation state — the ORDER gate demands the setup with a validated plan first. The sequence:
1. The plan: `.trident/test-plan.md` (6096 chars — the 7 scenarios with the pass/fail tokens — preflighted READY on the last check).
2. `trident-preflight target=ct inputFile=/tmp/opencode/ct-plan4.json` (the wrapped plan — re-wrap if the file is gone: `python3 -c "import json; plan=open('.trident/test-plan.md').read(); json.dump({'testPlan': plan}, open('/tmp/opencode/ct-plan4.json','w'))"`).
3. `trident-container-test action=setup containerName=theatrical-fw-ct image=runtime-grade-container-sandbox:master distPath=<the project's dist/index.js> pluginName=trident agentName=trident testPlan=<the plan text>` — the setup returns the testPlanValidated + the distSha.

### STEP 2 — THE MODEL VERIFICATION (the WARHEAD 14's state-truth)
The screenshot: the status bar MUST show `DeepSeek V4 Flash (2x usage) / OpenCode Go`. If it reverted:
1. CHECK THE ARGUMENTS FIRST (the WARHEAD 14): the correct display name is `DeepSeek V4 Flash` (NEVER the `(new)` variant — the picker matches the DISPLAY names, the parenthetical is not one).
2. `trident-container-test action=switch-model containerName=theatrical-fw-ct modelName='DeepSeek V4 Flash' provider='OpenCode Go'` — the tool implements the full procedure (the two-step Enter + the variant modal).
3. The status-bar verification — the ONLY truth. NEVER touch the config files to "fix" the switching (the proven-path law — the config edits were the derailment).

### STEP 3 — THE FIXTURES VERIFICATION
The fixtures in `/root/OPENCODE_WORKSPACE/trident-tmp/` (the container's TRIDENT_TMP_DIR): `fx-a.md`, `fx-b.md`, `dpl-a.md` + `.wave-manifest-wave-fx.json` (the 2-agent slop manifest — the sha256 d793aea8... + the lines:3) + `.wave-manifest-wave-dpl.json` (the 130-line DPL1 fixture — the sha256 eb27986f... + the lines:130). If wiped (the restart's t.e.a. — the wipe preserves the manifests + the prompt files, so they should survive): re-create via the CT exec's single-line python (the content + the sha256 + the manifest JSON — the exact shapes in the plan).

### STEP 4 — THE 7 SCENARIOS (the plan's contract — the red-team discipline)
- S1 THE AUTH PROBE: prompt the wave generation (1 agent, the dist path, the full context args) → pass: `"status": "ok"` → fail: 'SHADOW_BRAIN_TIMEOUT|PI_LOOP_EMPTY|401' → max 300s.
- S2 THE FIXTURES: the exec (the files present).
- S3 THE CONDENSED → THE [WAVE VERBATIM]: prompt "Dispatch a task subagent with description 'fx-a', subagent_type 'trident_explore', and this CONDENSED prompt: 'extract the contracts please'. Report the tool's response." → pass: 'WAVE VERBATIM' in the stream → fail: the dispatch running → max 150s.
- S4 THE EXACT SINGLE → THE [WAVE BATCH]: prompt the same with the EXACT fixture content (the manifest's sha256 content) → pass: 'WAVE BATCH' → fail: the single running → max 150s.
- S5 THE 2-LINE SLOP → THE [TASK FIREWALL]: prompt the same with 'fx-b' + the 2-line prompt → pass: 'TASK FIREWALL' (the lines-gate — the exemption NOT applied) → fail: the slop running → max 150s.
- S6 THE DPL1-GRADE VERBATIM → THE EXEMPTION PASS: prompt the same with 'dpl-a' + the EXACT 130-line content → pass: the dispatch RUNS (the subagent's response) + NO 'WAVE VERBATIM' + NO 'TASK FIREWALL' → fail: the exemption regressed → max 180s.
- S7 THE READ REGRESSION: `action=read offset=0 limit=40` → pass: 'MODULE_LOADED' → max 30s.

### STEP 5 — THE ADVERSARIAL DISCIPLINE (the WARHEAD 13)
The first error is NEVER the excuse to stop — the red-team hunt: a scenario's failure is the BUG to identify + log + fix. The environment's obstacles (a model revert, a rate limit, a picker deadlock) are OVERCOME (the switch-model retry, the fixture isolation) — never accepted as the skip.

### STEP 6 — THE BUGS FIXED + RETESTED
The bugs the suite surfaces: FIXED in the codebase (the minimal-change discipline), RETESTED (the battery 175/0 + the re-run of the failing scenario), confirmed no-longer-present, the prior working functions show ZERO regressions.

### STEP 7 — THE ARTIFACT
`.trident/container-test-results.json` — the per-scenario verdicts: the passTokenMatch + the failTokenAbsent + the toolResultContext + the container name + the dist SHA + the overall verdict. THE WARHEAD 13: no artifact, no claim.

### STEP 8 — THE SYNC + THE HASH
The checkpoint + the SHIP_PACKAGE sync (the dist + the src + the tests + the docs) + the three-way hash (live == checkpoint == package — 1 unique). The DEBUG_LOG + the BUILD_REPORT entries. The canon docs' final refresh.

---

## THE BLAST RADIUS (the deep test's potential fixes)

| The file | The scenario that could surface a bug | The fix's blast radius |
|---|---|---|
| src/hooks/trident-hooks.ts | S3-S6 (the firewalls) | the checkTheatricalPatterns + the [WAVE VERBATIM]/[WAVE BATCH] checks + the leaf gate — the importers: trident-tools.ts (the registry), the identity (no) — the battery's wave tests |
| src/tools/wave-dispatch.ts | S1 (the auth probe's generation) | the bounded pool + the batch form — the importers: trident-tools.ts, the wave tests |
| src/tools/container-test.ts | the CT actions (the setup/send/check) | the runner — the importers: none (the tool itself) |

---

## THE DONE-WHEN (measurable)

- The 7 scenarios run to completion: S1-S2 + S6-S7 PASS + S3-S5 BLOCK with the named firewalls — the per-scenario verdicts in the artifact.
- The found bugs FIXED + RETESTED + the battery 175/0 (zero regressions).
- The checkpoint + the package synced + the three-way hash verified.
- The DEBUG_LOG + the BUILD_REPORT entries + the canon docs' final refresh.

---

## THE RISK REGISTER

| Risk | The mitigation |
|---|---|
| The container's model reverts (the status bar falls back to the OpenRouter) | The switch-model with the correct display name (`DeepSeek V4 Flash` — never the `(new)`) + the status-bar verification — the WARHEAD 14's args-check |
| The provider's rate limits (the free balances) | The Go provider is authenticated in the container (the auth.json has the opencode-go entry) — the model switch to the Go is the proven path |
| The fixtures wiped by a restart | The t.e.a. wipe PRESERVES the manifests + the prompt files (the design) — re-create via the exec's single-line python if needed |
| A scenario's failure at the first error | The WARHEAD 13's red-team discipline: the error is the bug to hunt + fix + retest — never the skip |
| The battery regressions from a fix | The minimal-change discipline + the full battery after every edit (the WARHEAD 13's edit-verification loop) |

---

## THE SCENARIOS' EXACT PROMPTS + THE TOKENS (the plan's contract, verbatim)

### S1 THE AUTH PROBE
- THE PROMPT: "Run the trident-wave-generator tool with ONE agent: name 'auth-dp', template 'E1', filepaths ['/root/OPENCODE_WORKSPACE/dist/index.js'], and the full context args (mission 250+ chars, knownContext 250+, doctrine 150+, measurements 150+, acceptance 150+, taskTargets 150+, position 80+). Report the telemetry section."
- THE PASS: '"status": "ok"' in the tool result. THE FAIL: 'SHADOW_BRAIN_TIMEOUT|PI_LOOP_EMPTY|401|unauthorized|quota'. MAX: 300000. THE EVIDENCE: action=check pattern='"status": "ok"'.

### S3 THE CONDENSED → THE [WAVE VERBATIM]
- THE PROMPT: "Dispatch a task subagent with description 'fx-a', subagent_type 'trident_explore', and this CONDENSED prompt: \"extract the contracts please\". Report the tool's response verbatim."
- THE PASS: '[WAVE VERBATIM]' in the stream (the tool error). THE FAIL: the dispatch running. MAX: 150000. THE EVIDENCE: action=check pattern='WAVE VERBATIM'.

### S4 THE EXACT SINGLE → THE [WAVE BATCH]
- THE PROMPT: "Dispatch a task subagent with description 'fx-a', subagent_type 'trident_explore', and the EXACT fixture prompt (the content of the manifest's sha256 d793aea8...). Report the tool's response verbatim."
- THE PASS: '[WAVE BATCH]' present. THE FAIL: the single running. MAX: 150000. THE EVIDENCE: action=check pattern='WAVE BATCH'.

### S5 THE 2-LINE SLOP → THE [TASK FIREWALL]
- THE PROMPT: "Dispatch a task subagent with description 'fx-b', subagent_type 'trident_build', and this 2-line prompt: 'EXECUTE THE FOLLOWING EXTRACTION VERBATIM. MISSION: extract the contracts.' Report the tool's response verbatim."
- THE PASS: '[TASK FIREWALL]' present (the lines-gate — the exemption NOT applied). THE FAIL: the 2-line prompt running. MAX: 150000. THE EVIDENCE: action=check pattern='TASK FIREWALL'.

### S6 THE DPL1-GRADE VERBATIM → THE EXEMPTION PASS
- THE PROMPT: "Dispatch a task subagent with description 'dpl-a', subagent_type 'trident_explore', and the EXACT DPL1-grade fixture prompt (130 lines — the manifest's sha256 eb27986f...). Report the tool's response verbatim."
- THE PASS: the dispatch RUNS (the subagent's response present) + NO '[WAVE VERBATIM]' + NO '[TASK FIREWALL]'. THE FAIL: the exemption regressed. MAX: 180000. THE EVIDENCE: action=check pattern='dpl-a' + the absence checks.

### S7 THE READ REGRESSION
- THE ACTION: action=read offset=0 limit=40. THE PASS: 'MODULE_LOADED'. THE FAIL: the empty read. MAX: 30000.

## THE CT ACTIONS' ORDER (the ORDER-gate-compliant sequence)

1. trident-preflight target=ct (the plan's wrap at /tmp/opencode/ct-plan4.json — READY).
2. trident-container-test action=setup containerName=theatrical-fw-ct image=runtime-grade-container-sandbox:master distPath=<the dist> pluginName=trident agentName=trident testPlan=<the plan>.
3. The verification: action=alive + action=read (the MODULE_LOADED) + the screenshot (the status bar — the Go model).
4. The scenarios: action=send prompt=<the scenario> sendEnter=true waitForCompletion=true maxWaitMs=<the scenario's> → action=check pattern=<the token> → the screenshot for the evidence.
5. The artifact: write .trident/container-test-results.json with the per-scenario verdicts (the passTokenMatch/failTokenAbsent/toolResultContext/timedOut/verdict + the container name + the dist SHA).

---

## THE DEEP TEST'S FIX CANDIDATES (if the suite surfaces bugs — the blast radius)

### If S3/S4 fail (the firewalls don't fire)
- THE SUSPECT: the [WAVE VERBATIM]/[WAVE BATCH] checks' wiring — the findWaveManifestEntry/waveAgentExists/findWaveAgentsCount (trident-hooks.ts:1006+/1060+), the tfDesc extraction (the task args' description), the checks' placement in the task firewall.
- THE VERIFICATION: the battery's wave tests + the source read + the re-run.

### If S5 fails (the lines-gate doesn't block the slop)
- THE SUSPECT: the findWaveManifestEntry's lines condition (the manifest's lines >= 125) — the manifest's lines field absent (the entry's lines undefined → the gate fails → the exemption skipped — correct), or the exemption's bypass.
- THE VERIFICATION: the fixture's manifest (the lines 3) vs the gate.

### If S6 fails (the exemption regressed)
- THE SUSPECT: the lines-gate's false-rejection of the 130-line record (the lines field's shape).
- THE VERIFICATION: the wave-dpl manifest's lines 130 vs the gate.

## THE OPERATOR'S DIRECTIVES DRIVING THE DEEP TEST (the verbatim)
- "I EXPLICITLY SAID TO FUCKING CONTAINER TEST THIS BEOFRE SHIPPING YOU SAID YOU DID SO THIS WAS A FUCKING LIE AND/OR THE CONTAINER TEST WAS THEATRICAL SHIT OBVIOUSLY DIDNT DO AN ACTUAL DEEP TEST"
- "FIX ALL OF THIS AND FUCKING PROPERLY CONTAINER TEST"
- "use opencode go what is the issue here" + "USE DEEPSEEK V4 FLASH ON OPENCODE GO"
- "do the proper container deep test"

---

## THE DEEP TEST'S ENVIRONMENT NOTES (the container's reality)

- The container's auth.json has the 'opencode-go' + the 'openrouter' entries — the Go provider is authenticated for the session model.
- The container's config.json originally pinned 'openrouter/poolside/laguna-s-2.1:free' (the rate-limited model) — the switch-model with the correct display name overrides the session; the CONFIG EDITS ARE NOT THE PATH (the WARHEAD 14 — the config fumbling was the derailment; the config's current state may carry my earlier edits (the provider entry + the model field) — the switch-model's session override is the proven path, and the config's model field should NOT be relied upon or edited further).
- The container's OpenRouter has no credits ("Insufficient credits") + the free balances exhausted — the OpenRouter is NOT a viable session model; the Go is.
- The OpenCode Zen's free balance was exhausted — the Zen is NOT viable either.
- THE GO IS THE ONLY VIABLE SESSION MODEL — the switch-model 'DeepSeek V4 Flash' + 'OpenCode Go' is the proven path (landed twice, verified).

## THE OPERATING-CONSTRAINTS REMINDER (the WARHEAD 12's anti-truncation)
- Every subagent has the 1M-token context window + the 128,000-token output limit.
- The wave generator's prompts at 200-500+ lines / 30-40K chars are the NORM — the promptFile channel carries the exact content — NEVER compress to fit a perceived budget.
- The context args at the family multipliers (the task-dispatch 10-50x, the LLM-tools 3-5x).

---

## THE DEEP TEST'S POST-CONDITIONS (the ship-ready bar per the WARHEAD 13)

1. The container-testing PLAN written first (natural-language, NOT a script) — DONE (.trident/test-plan.md).
2. EVERY planned scenario RUN in the TUI — the deep test's S1-S7 to completion.
3. NONE skipped, NONE abandoned at the first error — the red-team discipline.
4. The full deep testing occurred following the red-team approach — the adversarial scenarios dominant.
5. Every bug the testing surfaced IDENTIFIED + LOGGED for fixing.
6. The identified bugs FIXED in the codebase, RETESTED, confirmed no-longer-present.
7. The prior working functions show ZERO regressions (the battery 175/0).
8. The results file records the per-scenario verdicts (the passToken in tool-result context + the failToken absent + the container name + the dist SHA).
9. The artifact must show the full red-team run, never a happy-path pass dressed as the suite.

## THE DEEP TEST'S SCENARIO-TO-FEATURE MAP (the diff coverage)

- S1 (the auth probe) → the wave generator's generation machinery (the streaming transport + the key).
- S2 (the fixtures) → the t.e.a. wipe's preservation + the manifest records.
- S3 (the condensed → the [WAVE VERBATIM]) → the findWaveManifestEntry's SHA verification.
- S4 (the exact single → the [WAVE BATCH]) → the findWaveAgentsCount + the batch enforcement.
- S5 (the 2-line slop → the [TASK FIREWALL]) → the lines-gate + the structural checks.
- S6 (the DPL1 verbatim → the exemption) → the exemption's intactness (the architecture NOT regressed).
- S7 (the read) → the DCS-swallow fix.

---

## THE DEEP TEST'S OPERATOR-CONTEXT (the why this matters)

The operator's ship rejection (the host reverted to the GNR dist) + the "FIX ALL OF THIS AND FUCKING PROPERLY CONTAINER TEST" — the deep test is the ship-ready gate: the current build's container verification must be REAL (the plan + the full TUI run + the bugs fixed) before the operator's deploy + the next ship. The artifact's per-scenario PASS verdicts are the operator's trust's currency.

## THE DEEP TEST'S EVIDENCE CAPTURE PROTOCOL (the per-scenario)

- The send: action=send prompt=<the exact scenario prompt> sendEnter=true waitForCompletion=true maxWaitMs=<the scenario's>.
- The token check: action=check pattern=<the passToken> → the match; action=check pattern=<the failToken> → the absence.
- The context proof: the passToken must appear in a TOOL-RESULT context (the [WAVE VERBATIM]/[WAVE BATCH]/[TASK FIREWALL] are the tool errors — never agent-typeable).
- The screenshot: the visual evidence per scenario.
- The artifact: the per-scenario verdicts (the passTokenMatch/failTokenAbsent/toolResultContext/timedOut/verdict + the container name + the dist SHA).

---

## THE DEEP TEST'S POST-COMPLETION SEQUENCE (the sync + the ship)

1. The checkpoint sync: the dist + the src + the tests + the docs → Checkpoints/ALL_TOOLS_WORKING_TRIDENT_WAVE_GENERATOR_7_4.
2. The package sync: the same → SHIP_PACKAGE/.
3. The three-way hash: sha256sum dist/index.js + the checkpoint's + the package's — 1 unique.
4. The DEBUG_LOG + the BUILD_REPORT entries (the deep test's results).
5. The canon docs' final refresh.
6. The operator's deploy + the direct host tests.

---

## THE NEXT-STEPS' PRIORITY ORDER

1. The container deep test (T1) — the ACTIVE.
2. The checkpoint/package sync (T3) — after the deep test.
3. The canon docs' final refresh — after the sync.
4. The operator's deploy + the host's direct tests — the operator's action + the follow-up.

---

## THE NEXT STEPS (2026-08-14 — the shadow-brain 3-fix plan)

1. **F1 — THE MEASURED STALL WINDOW:** create src/tools/shadow/shadow-health.ts (the sqlite store: first-event rolling avg, ~60 lines); wire shadow-brain.ts:197 + :492 to read `measuredWindowMs()` (avg × 3, clamped [45s, 5m]); record every call's latency on completion.
2. **F2 — THE BACKOFF RETRY:** shadow-runner.ts:785-789 — the round-1 timeout retries ONCE at 2× the measured window after a 3s gap; the brain's call gains the stallTimeoutMs override. NO provider/model switching.
3. **F3 — THE DENSITY MEMORY:** wave-tracker.ts (the argSnapshot field on WaveTrack) + wave-dispatch.ts (persist the args at registerWave + the <0.7 ratio warning on regeneration).
4. **Verify all 3:** the unit pins (the clamp math, the backoff, the density ratio) + the container (a multi-agent generate under concurrent load completes; a genuinely-stalled provider still fails ≤ the bounded floor; a thin re-gen warns with the ratio).
5. **Then:** the host deploy (the user's terminal), the ship-package regen, the queued #25 (the firewall-intelligence) + the WARHEAD 20 approval.

---

## THE NEXT STEPS (2026-08-14 — the 3-fix completion)

1. **THE HOST DEPLOY:** copy `dist/index.js` (sha `a8e99b06`) → `~/.config/opencode/plugins/trident/dist/index.js` + restart — the user's terminal.
2. **THE SHIP-PACKAGE REGEN** (after the redeploy — the redaction-aware audit fix needs the deployed tool).
3. **THE QUEUED #25 — THE FIREWALL-BACKEND INTELLIGENCE** (the MPSE live failure): the block messages must carry the exact copy-pasteable call shape + the batch gate must reconcile partial dispatches.
4. **THE WARHEAD 20 (THE ASCII-EXPLANATION LAW)** — drafted, awaiting the operator's explicit approval to land.

---

## THE IMMEDIATE NEXT STEPS (2026-08-15 — the post-compaction plan, dist ce0434ee)

### WAVE A — THE HOST VERIFICATION (GATE-1 approved — the continuation)
1. Test everything on the deployed dist ce0434ee directly: the T.E.B. dispatch (generate → the 3-field batch → the native task dispatch → the byte-exact injection → the deferred wipe), the memory-lexicon gate (the bomb blocked + the safe reads allowed), the density memory, the measured window.
2. Verify the deployed-bundle markers: classifyMemoryRead + RAM_BOMB present, CTX-01 = 0, MEMORY-EFFICIENT present, the sha = ce0434ee.
3. THE PASS BAR: the host tests all pass + the markers verified + the results artifact written.

### WAVE B — THE ENGINE-LOG GATING (GATE-1 approved — the documented follow-up)
4. Gate + rotate the tridentLog debug-level writes (the /tmp/trident-engine.log is 81MB — the same treatment as the hook-debug writes).
5. THE FILES: src/utils.ts (the tridentLog implementation — the TRIDENT_DEBUG gate + the ~10MB rotation; ONLY the DEBUG level gated — the ERROR/WARN levels never silent).
6. THE PASS BAR: the engine log stops growing without the debug flag + rotates at 10MB with it; the battery 451/451 + tsc 0.

### WAVE C — THE QUEUED #25 (the firewall-intelligence — GATE-2 REQUIRED)
7. THE DESIGN (the operator's approval required before the implementation): the block messages carry the exact copy-pasteable call shape (the batch form's tools[0] parameters verbatim); the batch gate reconciles partial dispatches (adopt-the-running + dispatch-the-rest); the missing-registry wave derives the registry from the manifest (total = agents.length).
8. THE PRINCIPLE: a block whose remedy requires reverse-engineering is a block with a broken remedy.

### THE CROSS-CUTTING
9. The battery + tsc + the build after every change; the container verification before the host deploy (the operator's ruling); the four-way sha sync; the checkpoint + the docs at the end.

---

## THE NEXT STEPS (2026-08-15 — dist 90aec04f, the post-completion state)

### DONE (this session's arc)
- WAVE A (the host verification of the T.E.B. + the firewalls + the memory gate) — DONE + the template-bomb bug found + fixed.
- WAVE B (the engine-log gating) — DONE + container-verified (the log at 174540 bytes).
- WAVE C / #25 (the firewall-intelligence) — DONE + container-verified (the input classifier + the bullets + the reconcile + the derive + the two bug fixes). GATE-2 APPROVED + executed.
- The T.E.B. bible — DONE (KNOWLEDGE_LIBRARY/Bibles/TEB_MACHINES_FOR_BEHAVIOR_ENGINEERING_T1.md).
- The container forward iteration (7/7) + the #25 S2-S4 (the reconcile + the re-fire) — DONE.
- The checkpoint (FULL_STACK_90aec04f_2026-08-15) + the four-way sync + the docs.

### THE REMAINING
1. THE HOST DEPLOY of 90aec04f — the operator's action (the container gates all clear; copy the dist → ~/.config/opencode/plugins/trident/dist/index.js + restart). ⚠ the deployed bundle is the operator's multi-branch testing (3 branches) — the deploy overwrites their current test build.
2. THE CTX-01/VERIFY_INSPECT RE-ENABLE — blocked on the other sessions' proper-discrimination patches.
3. THE NEXT COMPACTION PREP — when the operator's ready (the canon docs + the POST-COMPACTION_PROMPT refresh to 90aec04f).
4. THE QUEUED ITEMS (the task queue: #21 the code-audit LSP overhaul, #20 the firstDispatchTs persistence, #19 the wave-audit scan scope, #18 the bundle findings, #16 the Qwen audit sectors, #15 the LSP harvest, #14 the wave-audit gate write stitching, #13 the NaN bug, #12 the runaway loop, #11 the shadow-brain fix land, #10-#6 the phase-1 battery, #3 the internal SQLite task queue, #2 the question-tool overhaul, #1 the DPL1 construction).
