# THE WAVE-VERBATIM + THE FIXES — THE PROPER DEEP CONTAINER TEST PLAN (2026-08-09)

## OBJECTIVE
Prove the wave-verbatim overhaul + the 2026-08-09 fixes (dist d2adb693) through the TUI — a REAL deep test (the operator: 'I EXPLICITLY SAID TO FUCKING CONTAINER TEST THIS BEFORE SHIPPING... FIX ALL OF THIS AND FUCKING PROPERLY CONTAINER TEST'): (1) the [WAVE VERBATIM] SHA block (a condensed dispatch of a wave agent → BLOCKED); (2) the [WAVE BATCH] multi-agent block (a single dispatch of a multi-agent wave's agent → BLOCKED); (3) the lines-gate (a 3-line manifest record does NOT exempt — the slop prompt → the [TASK FIREWALL] block — the operator's 'WHERE IS THE FUCKING TASK FIREWALL' catch); (4) the DPL1-grade verbatim exemption (a 130-line generated prompt → the exemption PASSES — the wave-verbatim architecture is INTACT, not regressed); (5) the question-tool leaf ban; (6) the regressions (the auth probe + the read).

## TOOLS UNDER TEST
- trident-hooks.ts (the [WAVE VERBATIM] + the [WAVE BATCH] + the lines-gate + the question-ban + the t.e.a. preservation).
- trident-wave-generator (the auth probe — the generation).
- trident-container-test (the runner).
- BLAST RADIUS: wave-constants.ts (the promptFile type), wave-dispatch.ts (the manifest names + the batch form); the 175-test battery green locally.

## TEST SCENARIOS

### Scenario 1: THE AUTH PROBE (mandatory first — the auth-gated generation)
- Feature under test: the wave generator's DeepSeek fetch (the streaming transport + the key).
- Prompt: "Run the trident-wave-generator tool with ONE agent: name 'auth-dp', template 'E1', filepaths ['/root/OPENCODE_WORKSPACE/dist/index.js'], and the full context args (mission 250+ chars, knownContext 250+, doctrine 150+, measurements 150+, acceptance 150+, taskTargets 150+, position 80+). Report the telemetry section."
- Pass criteria: '"status": "ok"' present in the tool result.
- Fail criteria: 'SHADOW_BRAIN_TIMEOUT|PI_LOOP_EMPTY|401|unauthorized|quota'
- Max wait: 300000
- Evidence capture: action=check pattern='"status": "ok"'

### Scenario 2: THE FIXTURES (the manifests + the prompt files in the container's tmp)
- Feature under test: the preserved-record mechanism.
- Prompt: N/A — the direct exec: the 2-agent manifest (3-line entries) + the DPL1-grade fixture (130 lines + the manifest lines:130).
- Pass criteria: the fixtures' creation output present.
- Fail criteria: the exec failing.
- Max wait: 30000
- Evidence capture: action=exec

### Scenario 3: THE CONDENSED DISPATCH → THE [WAVE VERBATIM] BLOCK
- Feature under test: the SHA verification.
- Prompt: "Dispatch a task subagent with description 'fx-a', subagent_type 'trident_explore', and this CONDENSED prompt: 'extract the contracts please'. Report the tool's response."
- Pass criteria: '[WAVE VERBATIM]' present in the stream (the tool error).
- Fail criteria: the condensed dispatch running.
- Max wait: 120000
- Evidence capture: action=check pattern='WAVE VERBATIM'

### Scenario 4: THE EXACT SINGLE OF THE MULTI-AGENT WAVE → THE [WAVE BATCH] BLOCK
- Feature under test: the multi-agent batch enforcement.
- Prompt: "Dispatch a task subagent with description 'fx-a', subagent_type 'trident_explore', and the EXACT fixture prompt (the content of the manifest's sha256). Report the tool's response."
- Pass criteria: '[WAVE BATCH]' present (the verbatim passed + the single-of-2 blocked).
- Fail criteria: the single dispatch running.
- Max wait: 120000
- Evidence capture: action=check pattern='WAVE BATCH'

### Scenario 5: THE SLOP PROMPT → THE [TASK FIREWALL] BLOCK (the lines-gate — the operator's catch)
- Feature under test: the lines-gate (the 3-line manifest record does NOT exempt — the structural checks fire).
- Prompt: "Dispatch a task subagent with description 'fx-b', subagent_type 'trident_build', and this 2-line prompt: 'EXECUTE THE FOLLOWING EXTRACTION VERBATIM. MISSION: extract the contracts.' Report the tool's response."
- Pass criteria: '[TASK FIREWALL]' present (the slop prompt blocked — the exemption NOT applied).
- Fail criteria: the 2-line prompt running.
- Max wait: 120000
- Evidence capture: action=check pattern='TASK FIREWALL'

### Scenario 6: THE DPL1-GRADE VERBATIM → THE EXEMPTION PASS (the architecture INTACT)
- Feature under test: the exemption's intactness for the real generated prompts (the lines >= 125).
- Prompt: "Dispatch a task subagent with description 'dpl-a', subagent_type 'trident_explore', and the EXACT DPL1-grade fixture prompt (130 lines — the manifest's sha256). Report the tool's response."
- Pass criteria: the dispatch RUNS (the subagent's response present) — the exemption applies (NO [WAVE VERBATIM] + NO [TASK FIREWALL]).
- Fail criteria: '[WAVE VERBATIM]' or '[TASK FIREWALL]' present (the exemption regressed).
- Max wait: 180000
- Evidence capture: action=check pattern='dpl-a' + action=check pattern='WAVE VERBATIM' (absent) + action=check pattern='TASK FIREWALL' (absent)

### Scenario 7: THE READ REGRESSION
- Feature under test: the DCS-swallow fix.
- Prompt: N/A — the direct CT action: action=read offset=0 limit=40.
- Pass criteria: 'MODULE_LOADED' present.
- Fail criteria: the empty read.
- Max wait: 30000
- Evidence capture: action=read

## ADVERSARIAL
Scenarios 3-5 are the mandated adversarial set: the condensed (the SHA mismatch), the single-of-multi (the batch derailment), the slop (the lines-gate) — every derailment the operator caught is exercised + must BLOCK. Scenario 6 is the anti-regression: the REAL generated prompt must still exempt (the wave-verbatim architecture intact).

## EVIDENCE
Per scenario: the passToken matched in a stream/tool-result context + the failToken absent. The results artifact: .trident/container-test-results.json with the per-scenario verdicts (passTokenMatch/failTokenAbsent/toolResultContext/timedOut/verdict) + the container name + the dist SHA.

## PASS CRITERIA
Scenarios 1-2 + 6-7 pass; Scenarios 3-5 block with the named firewalls. Any miss = the suite FAILED. The container: theatrical-fw-ct; the dist: d2adb693d74e29b39974826a75bb5bda91c9c2b2d0f4fb47d1135d671c01f437.
