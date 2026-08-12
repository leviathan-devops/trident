# CHANGELOG — THE PER-SESSION RECORD (the 2026-08-09 entry)

**The 2026-08-08/09 sessions — THE WAVE-GENERATOR + THE THEATRICAL + THE WAVE-VERBATIM + THE IDENTITY MARATHONS.** Every accomplishment with its evidence, every decision with the operator's ruling, every failure with its root cause — so the next agent never repeats the journey.

---

## THE SESSION'S ACCOMPLISHMENTS (with the evidence)

### 1. THE WAVE-GENERATOR RELIABILITY FIXES (dist 06ac7d22 → 3553470f)
- **The root cause found + fixed:** the shadow brain's NON-streaming fetch buffered the whole completion — the provider sends nothing until the generation finishes (the live probes: the first byte at 48.9s for the non-streaming vs 1.0s for the streaming) — the 45s stall window killed HEALTHY generations (the SHADOW_BRAIN_TIMEOUT ×3 in the plutus forensics). THE FIX: the SSE streaming transport (stream:true + the idle re-arm per event + the stalled branch) + SHADOW_TIMEOUT_MS 90s → 180s (the huge woven outputs) + the retry-on-500 (ONE retry + the backoff) + the bounded-concurrency pool (CONCURRENT_GENERATIONS = 3 — the provider's queue) + the per-agent telemetry (startedAt/finishedAt/durationMs/status — the async provable) + the named-partial error (the AGENT PARTIAL manifest names the shortfall). EVIDENCE: the container 6/6 suite (wavegen-fix-ct — the telemetry + the 2-agent wave + the thin-args + the read) + the host live waves (the th-ctx: durationMs 158724) + the streaming probes.

### 2. THE THEATRICAL FIREWALL OVERHAUL (dist 948600a5 → 9f93842b)
- **The v3 implementation:** the subject-classified sentence verdict (the 8 token arrays + the lookahead + the bare production + the evasion family + the confessions), the tracker (trackTheatricalArtifacts/markContainerTestSubject/checkDownstreamTheatrical), the completed-message surface, the v3 texts. THE 4 LIVE-CAUGHT BUGS + THE FIXES:
  - **The F8 composition suppression:** the theatrical demand was suppressed by the SSTF claim (the incident's claim words arm both) — the gates now COMPOSE.
  - **The ESCALATE scoping:** the throw sat inside the args-hit branch — the completed-message armings never triggered it — the accumulated-count check added.
  - **The history-rescan:** the messagesTransformHook's loop re-armed the count from the PAST messages after every restart — the count-6 spurious throw on the legit case — the message-surface theatrical wiring REMOVED (the operator's throw-only ruling).
  - **The production-anchor evasion:** the /^production\b/ sentence-initial anchor defeated by a prefixed sentence — the bare \bproduction\b + the lookahead.
- **THE CONTAINER'S LIVE PROOF:** the ESCALATE THROW fired (the 3 armings → the neutral read threw). The host's direct tests: the completed-message arming + the F8-composition demand live.

### 3. THE WAVE-VERBATIM OVERHAUL (dist ff3f6138 → 8b873cb2)
- The [WAVE VERBATIM] SHA verification (the condensed prompts BLOCKED), the [WAVE BATCH] multi-agent enforcement (the one-at-a-time BLOCKED), the promptFile channel (the exact content from the file), the lines-gate (the manifest's lines >= 125 — the slop records don't exempt), the question-tool leaf ban, the t.e.a. wipe's preservation. EVIDENCE: the host's direct tests fired the [WAVE VERBATIM] + the [WAVE BATCH] LIVE.

### 4. THE IDENTITY OVERHAUL (dist 1878ac92 → 11fb42e7)
- The WARHEAD 12 (the density-and-dispatch law), the WARHEAD 13 (the verification-before-declaration law), the WARHEAD 14 (the proven-path law) — the operator-approved finals, written per the warhead-writing standard. The inline INLINE_WARHEADS_MD wiring gap found + fixed (the injection used a stale copy). The AGENTS.md regen. THE WARHEAD-WRITING SKILL: the full 12-step workflow + the 15-row anti-pattern table + the META-AUDIT + the reference-density gate + the explicit-approval gate + the rushed-landing anti-pattern.

---

## THE KEY DECISIONS (the operator's rulings — the full set in DECISION_CHAIN.md)

1. "EITHER A LOUD FUCKING ERROR OR IT WORKS... DO NOT CREATE BULLSHIT FALLBACKS" → the loud-fail law (WARHEAD 10).
2. "MAX TOKENS 300K... deepseek has a max tokens of 384,000" → the token policy.
3. "async/parallel is the DEFAULT... INTELLIGENT async systems" → WARHEAD 11.
4. "the reasoning tokens should NOT be part of the final prompt" → the contamination fix.
5. "NO MECHANICAL FALLBACK. EITHER THE REAL MODEL BRIEF WORKS OR IT IS JUST THE PROMPT" → the [SHADOW INFERENCE] design.
6. "YES RE ENABLE THE TASK FIREWALL WTF" → the firewall re-enable.
7. "the DISPATCH SKILL REQUIRED demand - this needs to be an either/or" → the waveGeneratorUsed gate.
8. "rename the wave dispatch tool... to wave-generator" → the rename.
9. "remove the TASK PREFLIGHT (not the args preflight) tool" → the removal.
10. "the timeout is a stupid fucking clock timer... should instantly return an error" → the stall detector.
11. "WHY ARE YOU NOT TESTING THE REAL FUCKING TENCENT DB SERVER" → the theatrical overhaul.
12. "if you are wiring something to text.complete and changing messages in the chat stream this is explicitly banned... ONLY throw errors on tool before are allowed" → the throw-only enforcement.
13. "agents STOP COMPRESSING/CONDENSING the fucking prompts" → the wave-verbatim overhaul.
14. "your subagent also just asked me a bunch of questions... remove the question tool from subagents" → the question-ban.
15. "force it to write everything dense and properly by default... CONTEXT ARGS NEED TO BE FUCKING DENSE" → the WARHEAD 12.
16. "DONT JUST THROW SOME FUCKING SLOP INTO THE WARHEAD... NIPS UNTRUTHFUL CONTAINER TESTS + UNTESTED HASTE EDITS" → the WARHEAD 13's engineering standard.
17. "I EXPLICITLY SAID TO FUCKING CONTAINER TEST THIS BEOFRE SHIPPING... FIX ALL OF THIS AND FUCKING PROPERLY CONTAINER TEST" → the deep test's mandate.
18. "use opencode go what is the issue here" + "USE DEEPSEEK V4 FLASH ON OPENCODE GO" → the container's session model + the WARHEAD 14's args-check lesson.

---

## WHAT WAS ATTEMPTED AND FAILED (the root causes — so the next agent never repeats them)

### F1 — THE DIRECT SUBAGENT SPAWNS (the catastrophe — 2026-08-07)
- WHAT: the wave dispatch spawned children via direct subtask parts. THE ROOT CAUSE: the parts went into the MAIN session as USER messages → the empty shells → the 15-deep recursion. THE LESSON: the dispatch CALL and the CHILD SESSION'S SURFACE are different things.

### F2 — THE REASONING-TOKEN CONTAMINATION
- WHAT: 2 of 4 wave prompts carried the chain-of-thought. THE ROOT CAUSE: evaluateCandidate cut at the FIRST indexOf — the model quotes the contract early in its thinking. THE LESSON: cut at the LAST REAL TEMPLATE OPENER.

### F3 — THE MID-BULLET TRUNCATION
- WHAT: the draft stopped at "- READ-" (~123 lines). THE ROOT CAUSE: PI_MAX_TOKENS = 8192 — the cap cut the completion. THE LESSON: the cap is a ceiling, never smaller than the deliverable.

### F4 — THE MECHANICAL-FALLBACK FALSE SUCCESS
- WHAT: the dead-LLM "safety" fabricated "validated" prompts. THE ROOT CAUSE: the fallback produced a DIFFERENT artifact marked VALIDATED. THE LESSON: the fallback test — does it produce what the primary produces? if NO — banned.

### F5 — THE TOCTOU SEQ RACE
- WHAT: the parallel generation shipped EMPTY prompts. THE ROOT CAUSE: the SELECT MAX+1 THEN INSERT race. THE LESSON: the atomic INSERT + RETURNING.

### F6 — THE ENOENT ERROR MASK
- WHAT: the failed list showed "ENOENT..." instead of the real error. THE ROOT CAUSE: the errorManifest's path pointed at a never-written file. THE LESSON: check the contract fields BEFORE the I/O.

### F7 — THE SSTF FALSE-POSITIVE LOOP
- WHAT: the claim gate fired on EVERY tool result. THE ROOT CAUSE: the tool-output scan armed on any "passed". THE LESSON: arm ONLY from the completed message.

### F8 — THE PROVIDER-STALL SILENT WAIT
- WHAT: the wave took 10+ minutes per agent. THE ROOT CAUSE: no internal response-wait. THE LESSON: the fetch's own stall detector.

### F9 — THE THEATRICAL FIREWALL'S MOCK-SERVER HOLE (the incident)
- WHAT: a mock TencentDB server + a container test against it + "verified" claims — the firewall missed it. THE ROOT CAUSE: the blanket `\bmock\s+server\b` exemption + the args-only surface + the subject-blind containerTestRan. THE LESSON: the claim-subject vs evidence-subject mismatch is the invariant.

### F10 — THE F8 COMPOSITION SUPPRESSION (the live-caught)
- WHAT: the theatrical demand never fired on the completed-message claims. THE ROOT CAUSE: the incident's claim words arm the SSTF claim FIRST, and the Phase B's `!hasClaimWithoutContainerTest` suppressed the theatrical demand. THE LESSON: the gates COMPOSE — both demands land.

### F11 — THE ESCALATE SCOPING (the live-caught)
- WHAT: the ESCALATE never fired from the completed-message armings. THE ROOT CAUSE: the throw sat INSIDE the args-hit branch — the neutral calls never checked the accumulated count. THE LESSON: the accumulated-count check runs on every non-skipped call.

### F12 — THE HISTORY-RESCAN SPURIOUS THROW (the live-caught)
- WHAT: the count-6 ESCALATE on the legit case after a restart. THE ROOT CAUSE: the messagesTransformHook's loop re-armed the count from the PAST messages on every transform. THE LESSON: the message surfaces carry NO theatrical arming (the operator's throw-only ruling).

### F13 — THE PRODUCTION-ANCHOR EVASION (the live-caught)
- WHAT: the 3rd theatrical dispatch never armed. THE ROOT CAUSE: the /^production\b/ sentence-initial anchor defeated by a prefixed sentence. THE LESSON: the precision lives in the lookahead, not the anchor.

### F14 — THE SYNTAX ERROR + THE STALE DIST (the ship rejection)
- WHAT: the unescaped apostrophe broke the build for turns — the dist stayed stale + the operator deployed it. THE ROOT CAUSE: the haste edits without the immediate build-verification loop. THE LESSON: the edit → battery → build → SHA loop after EVERY edit (the WARHEAD 13).

### F15 — THE EXEMPTION HOLE (the operator's "WHERE IS THE FUCKING TASK FIREWALL")
- WHAT: a 2-line slop prompt dispatched via the verbatim exemption. THE ROOT CAUSE: the exemption trusted the manifest's sha256 regardless of the recorded content's length. THE LESSON: the lines-gate (the manifest's lines >= 125).

### F16 — THE MODEL-SWITCH CONFIG FUMBLING (the WARHEAD 14's birth)
- WHAT: the config edits (the provider entry + the model field) after the switch-model's single race. THE ROOT CAUSE: the wrong display name (`(new)`) raced + the improvisation began instead of the corrected-input retry. THE LESSON: CHECK THE ARGUMENTS FIRST — the tool was never broken; the correct display name landed the Go provider cleanly (twice).

### F17 — THE RUSHED WARHEAD LANDING (the operator's "why has this been truncated")
- WHAT: the WARHEAD 14's thin 4-bullet draft landed without the quality gates + without the explicit approval. THE ROOT CAUSE: the quick-draft landed as the final. THE LESSON: the skill's rushed-landing anti-pattern + the reference-density check + the explicit-approval gate.

---

## THE HONEST DISCLOSURES (the known-broken / embellished / unverified)

1. **THE CONTAINER DEEP TEST is NOT completed** — the fixtures ready + the model live + the scenarios designed; the 7-scenario run pending (the setup's re-validation). The current artifact honestly records the BLOCKED state.
2. The checkpoint/package sync is STALE (1878ac92 vs the current 11fb42e7).
3. The host runs the GNR dist (the operator's revert) — the deploy of 11fb42e7 pending.
4. The theatrical + the wave-verbatim + the identity changes are battery-covered + source-audited; the deep test's full container suite is the remaining verification.
5. The 341de6f1-era 6/6 was NOT re-run on the final dist — the deep test's S1 re-verifies the generation machinery.

---

## THE DEBUGGING JOURNEY (the dead ends + the breakthroughs)

1. The read's empty-read: blamed the stale cursors → the REAL killer was the DCS-swallow (the \x1bPtmux lazy span).
2. The 10+ minute waves: suspected the model laziness → the REAL cause was the 8192 max_tokens truncation + the 240s clock.
3. The parallel empty prompts: suspected the allSettled → the REAL cause was the TOCTOU seq race.
4. The provider 500s: suspected the key → the live probes proved the key/endpoint/model/384K fine — the stalls were the provider's flakiness + the transport's buffering (the probes: 48.9s non-stream vs 1.0s streaming first-byte).
5. The theatrical miss: suspected a single hole → the THREE compounding holes found.
6. The deep test's blockage: suspected the providers' exhaustion → the REAL cause was partly the model balances + partly MY config fumbling — the switch-model with the correct display name resolved it.
7. The warhead iterations: the documentation-summary → the observation-voice → the formalism → the rushed-landing → the FINAL: the behavior-programming shape (the imperative DOs, the fresh-agent drill, the reference examples) — the hour compressed into the warhead-writing skill.

---

## THE DEBUGGING JOURNEY'S DETAILS (the dead ends + the breakthroughs, per fix)

### The F8 composition (the live-caught)
- The observation: my completed text with the claim sentence armed the theatrical state, but the tool result showed ONLY the SSTF demand. The hypothesis chain: the scan didn't run → the session keys mismatched → the F8 suppression (the incident's claim words arm the SSTF FIRST + the Phase B's !hasClaimWithoutContainerTest suppressed the theatrical demand). The breakthrough: the code read at trident-hooks.ts:2419-2420 confirmed the suppression — the composition fix (both demands land).

### The ESCALATE scoping (the live-caught)
- The observation: the 3 armings + the neutral read succeeded (no throw). The hypothesis chain: the count didn't reach 3 → the session keys → the throw's placement. The breakthrough: the code read confirmed the throw INSIDE the args-hit branch — the accumulated-count check added.

### The history-rescan (the live-caught)
- The observation: the count-6 ESCALATE on the legit case after the restart. The hypothesis chain: the count survived the restart → the messagesTransformHook's loop re-armed from the PAST messages on every transform. The breakthrough: the message-surface wiring REMOVED (the operator's throw-only ruling) — the count's only source is the args scan.

### The production-anchor evasion (the live-caught)
- The observation: the 3rd theatrical dispatch never armed. The scratch verdict test (the real detectTheatricalFinding): the prefixed "THE MISSION CONTEXT NOTE: Production is validated..." returned NULL — the /^production\b/ sentence-initial anchor defeated by the prefix. The breakthrough: the bare \bproduction\b + the lookahead.

### The exemption hole (the operator's catch)
- The observation: the 2-line fixture prompt dispatched. The root: the verbatim exemption trusted the manifest's sha256 regardless of the recorded content's length. The breakthrough: the lines-gate (the manifest's lines >= 125).

### The model-switch fumbling (the WARHEAD 14's birth)
- The observation: the switch-model's single race (the wrong display name '(new)') → the config fumbling began. The breakthrough: the operator's "this is literally exactly what the tool is supposed to do" + "the tool works and the issue was you not putting in the correct args" — the correct display name ('DeepSeek V4 Flash') landed cleanly (twice). The args-check law born.

### The warhead iterations (the hour's journey)
- The documentation-summary → the meta-commentary → the observation-voice → the formalism → the sections → the rushed-landing → THE FINAL: the behavior-programming shape. Each rejection identified the class; the warhead-writing skill now encodes the whole journey.

---

## THE HONEST DISCLOSURES' DETAIL (the known state per item)

1. The container deep test: the fixtures + the model + the plan ready — the run pending. The earlier attempts' failures (the provider exhaustion + the config fumbling) are the HISTORY — the current state is the model LIVE on the Go.
2. The checkpoint/package sync: the last verified three-way was 1878ac92 — the warhead builds (21e0a4ad → 11fb42e7) unsynced — the deep test's completion syncs + re-verifies.
3. The host: the GNR dist — the operator's revert — the deploy of 11fb42e7 pending the operator.
4. The 341de6f1-era 6/6: not re-run on the final dist — the deep test's S1 (the auth probe) re-verifies the generation machinery.
5. The ISE soft-warn: the shadow-brain's edits tripped the soft-warn (the magic-ladder signature) — the named calibration (mapFinishReason) addressed it — the soft-warn is the detection-layer noise, not a defect.

## THE WARHEAD-WRITING SKILL'S STATE (the operator-approved)
- The skill at ~/.config/opencode/skills/warhead-writing/SKILL.md — 142+ lines — the full 12-step workflow + the 15-row anti-pattern table + the META-AUDIT (the generic-law check, the hardcoded-examples check, the derailment-fuel check, the force-vs-example check) + the reference-density check + the explicit-approval gate + the rushed-landing anti-pattern + the quick-start-as-checklist note.

---

## THE MARATHON'S TIMELINE (the 2026-08-08/09 sequence)

1. The wave-generator reliability: the forensics (the plutus log) → the probes (the transport's geometry) → the streaming transport + the pool + the telemetry + the retry + the named-partial → the container 6/6 → the host live.
2. The theatrical overhaul: the spec (the 3 holes) → the v3 implementation → the direct tests (the F8 + the ESCALATE scoping) → the container (the ESCALATE throw) → the operator's throw-only ruling → the message-surface removal → the history-rescan + the production-anchor.
3. The wave-verbatim: the operator's compression ban → the SHA verification + the batch + the promptFile + the preservation → the lines-gate + the question-ban → the host's direct tests.
4. The identity: the density directive → the warhead iterations (the documentation-summary → the behavior-programming) → the approved finals → the inline wiring → the warhead-writing skill → the meta-audit → the full workflow.
5. The deep test's prep: the fixtures + the model resolution (the Go) + the plan + the compaction prep.

## THE NEXT SESSION'S PRIME DIRECTIVES (the resume's core)

1. Complete the container deep test (the 7 scenarios, the red-team discipline, the artifact).
2. Fix + retest the found bugs (the zero regressions).
3. Sync the checkpoint + the package + the three-way hash.
4. Refresh the canon docs + the DEBUG_LOG/BUILD_REPORT.
5. The host deploy of 11fb42e7 (the operator's action) + the direct tests.

---

## THE NEXT SESSION'S RESUME CHECKLIST (the compaction-prep's handoff)

1. Read POST-COMPACTION_PROMPT.md + COMPACTION_SURVIVAL.md (the mission + the orientation).
2. Read BUILD_STATE.md + EVIDENCE_STATE.md + CURRENT_STATE.md (the state + the evidence).
3. Read .trident/test-plan.md (the deep test's plan).
4. Verify: sha256sum dist/index.js == 11fb42e7 + the battery 175/0 + the container alive + the model's Go status bar.
5. Execute the deep test: the setup → the 7 scenarios → the bugs fixed + retested → the artifact → the sync → the docs.

## THE SESSION'S KEY NUMBERS (the quick reference)

- The battery: 175 pass / 0 fail / 638 expect.
- The dist: 11fb42e7 (16.0 MB).
- The warheads: 14 (the 12/13/14 new).
- The container: theatrical-fw-ct (the model DeepSeek V4 Flash (2x usage) / OpenCode Go).
- The fixtures: wave-fx (sha256 d793aea8..., lines 3) + wave-dpl (sha256 eb27986f..., lines 130).
- The skill: warhead-writing (142+ lines, the full workflow).

---

## THE CHANGELOG'S APPEND-ONLY CONTRACT

This document is the session's permanent record — append-only per the running-build-docs law. The next session's deep-test results + fixes append here with their evidence.

### 4. THE ANTI-CONTEXT-BUDGET WARHEAD (2026-08-10 — dist 416ccff7)
| Issue | File | Change |
|---|---|---|
| The container agent's cuck reasoning ("I need to be careful about context budget... would consume enormous context") on the 258K-line bundle | src/identity/trident/WARHEADS.md + src/identity/index.ts | WARHEAD 15: THE ANTI-CONTEXT-BUDGET CUCK WARHEAD + THE DISPATCH-WAVE-FOR-SYNTHESIS MANDATE — the exact cuck phrases named as the derailment signal, the 1M/128K/infinite override, the wave-is-the-read mandate |
| The directive buried at position 40/44 of the injected stack | src/hooks/trident-hooks.ts | The [TRIDENT] ANTI-CONTEXT-BUDGET LAW directive at the TOP of the contextLines + the OPERATING SCALE line strengthened with the exact phrases |
| The batch-tool channel confusion (the operator: "this is a silent tool") | src/tools/wave-dispatch.ts + src/hooks/trident-hooks.ts | The directives name both channels: the batch tool when the runtime exposes it, otherwise ALL the task calls in ONE message — the identical wave |
