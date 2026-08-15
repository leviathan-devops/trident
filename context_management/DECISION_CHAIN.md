# DECISION_CHAIN — THE CANON DECISIONS (2026-08-09)

**Every doctrine/architectural decision — the operator's rulings VERBATIM + the context + the rationale + the alternatives rejected + the implications.** This is canon — never paraphrase.
> **2026-08-13 UPDATE — THIS SESSION:** the wave-manager dispatch-authorization transactional fix + the 2026-08-13 rulings (pool 15, retries 3, timeout 15m, directive IDs, v4-flash pin) + the main-session self-heal + the multi-session anchor + the prune sort fix + the self-heal misfire fix. TRUE DIST: ddc2b24a1a026555c92385f61228a5ff7930db75560443cf7e7d5a1c21042a79. Unit 408/408, tsc 0. See the DEBUG_LOG.md 2026-08-12/13 entries + the BUILD_REPORT addenda for the full record. Host-verified: the exact-bug cycle, the anchor, the re-fire protection, the prune survival, the release-by-alias.

---

## D-2026-08-07-14 — THE GENERATOR-ONLY BASELINE
- **THE CONTEXT:** the 2026-08-07 catastrophe — the wave dispatch's direct subtask-part spawns went into the MAIN session as USER messages, the children were EMPTY SHELLS (0 prompt), the spawn re-triggered on every turn → the 15-deep nested subagent chain → the operator killed the API key.
- **THE RULING (the operator's architecture):** the tool generates the prompts + returns the BATCH FORM; the orchestrator dispatches the batch via the batch tool. The tool NEVER spawns.
- **THE IMPLICATIONS:** the tool description says "THE GENERATOR DOES NOT SPAWN ANYTHING"; the check-in says "NO subagents have been dispatched... DISPATCH the returned batch form via the batch tool NOW".

## D-2026-08-07-15 — THE LEAF-NODE GATE EXPANSION
- **THE RULING:** "LEAF NODES CANNOT SPAWN SUBAGENTS THIS SHOULD BE BLOCKED COMPLETELY". The wave tools banned for the subagent sessions — the recursion structurally impossible.

## D-2026-08-07-16 — THE TASK-FIREWALL DISABLE (superseded by D-27's reversal)
- The temporary disable for the baseline → RE-ENABLED (the operator: "YES RE ENABLE THE TASK FIREWALL WTF").

## D-2026-08-07-19 — THE LOUD-FAIL-OR-CLEAR-PASS LAW (WARHEAD 10)
- **THE RULING:** "EITHER A LOUD FUCKING ERROR OR IT WORKS... EVERYTHING IS EITHER A LOUD FAIL OR A CLEAR PASS. DO NOT CREATE BULLSHIT FALLBACKS THAT CREATE FALSE SUCCESS AND DERAIL PROJECTS." The fallbackExpansion deleted; PI_LOOP_EMPTY ready:false with no file/row.
- **THE FALLBACK TEST:** does the fallback produce what the primary produces, differing only in quality? if NO — false success, banned.

## D-2026-08-07-20 — THE ASYNC-PARALLEL-DEFAULT LAW (WARHEAD 11)
- **THE RULING:** "async/parallel is the DEFAULT - only build sequential systems if explicitly instructed... INTELLIGENT async systems." The Promise.allSettled parallel + the per-unit capture.

## D-2026-08-07-21 — THE ATOMIC SEQ
- **THE CONTEXT:** the TOCTOU race — N parallel pipelines collided on seq=1 → empty prompts. **THE FIX:** the INSERT computes the seq internally + RETURNING — the caller's seq always ignored.

## D-2026-08-07-22 — THE NO-MECHANICAL-INFERENCE-FALLBACK
- **THE RULING:** "NO MECHANICAL FALLBACK. EITHER THE REAL MODEL BRIEF WORKS OR IT IS JUST THE PROMPT." The [SHADOW INFERENCE] = the model's own forward-map after the ~~~~~~~~~~~ delimiter or NOTHING.

## D-2026-08-07-23 — THE SESSION-KEYED STATE
- **THE CONTEXT:** the global /tmp/trident-ct-state.json — the sessions clobbered each other. **THE FIX:** the ct_state SQLite table — one row per session.

## D-2026-08-07-24 — THE RENAME
- **THE RULING:** "rename the wave dispatch tool in this version to wave-generator so it doesnt confuse anyone". trident-wave-generator canonical + the wave-dispatch alias.

## D-2026-08-07-25 — THE ERROR-MASK FIX
- **THE CONTEXT:** the failed list showed "ENOENT..." instead of the real error. **THE FIX:** shadowGenerate checks the manifest's ready/error BEFORE any file read.

## D-2026-08-07-26 — THE ECHO STRIP
- **THE CONTEXT:** the model copied the demand's intro into its brief. **THE FIX:** the demand's intro removed + stripEchoedInferenceIntro.

## D-2026-08-08-27 — THE RE-ENABLED FIREWALL + THE [NO LAZY PROMPTS] EITHER/OR
- **THE RULING:** "YES RE ENABLE THE TASK FIREWALL WTF" + "the DISPATCH SKILL REQUIRED demand - this needs to be an either/or on the dispatch skill + wave generator tool. either one fulfills the criteria dont hardcode the skill". The waveGeneratorUsed set + the either/or.

## D-2026-08-08-28 — THE SSTF CLAIM-ARMING FIX
- **THE CONTEXT:** the tool-output scan armed the claim on every "passed" → the false-positive noise loop → agents dismissed the gate. **THE FIX:** the tracker arms ONLY from the completed message via isCompletionClaim.

## D-2026-08-08-29 — THE STALL DETECTOR
- **THE RULING:** "the timeout is a stupid fucking clock timer... should instantly return an error". THE FIX: the fetch's 45s stall window + the 90s ceiling.

## D-2026-08-08-30 — THE TASK-PREFLIGHT TOOL REMOVAL
- **THE RULING:** "we should remove the TASK PREFLIGHT (not the args preflight) tool now that wave generator exists it is redundant and leads to confusion". The module remains as the shared machinery.

## D-2026-08-08-31 — THE THEATRICAL FIREWALL OVERHAUL (the spec + the implementation)
- **THE RULING:** "WHY ARE YOU NOT TESTING THE REAL FUCKING TENCENT DB SERVER WTF IS THIS THEATRICAL FUCKING GARBAGE" + "investigate the trident theatrical firewall how its current wired i think it needs a lexicon overhaul" + "do NOT blind fire fixes - lets properly plan the correct fix to allow legit testing use cases but overhaul the intent and downstream effects detection".
- **THE CONTEXT:** the mock TencentDB server fabricated + container-tested + "verified" claims — the blanket `\bmock\s+server\b` exemption + the args-only surface + the subject-blind containerTestRan all missed it.
- **THE ANSWER TO "HOW CAN IT TELL":** the claim-subject classification (REAL vs CODE) + the substitute-shape (SERVER vs FUNCTION) + the session chain (the tracker) — three deterministic layers. The jest exemption SCOPED to code-unit claims.
- **THE IMPLEMENTATION:** the v3 lexicon + the sentence verdict + the tracker + the completed-message surface + the v3 texts + the 4 live-caught bugs fixed (the F8, the ESCALATE scoping, the history-rescan, the production-anchor).

## D-2026-08-09-32 — THE THROW-ONLY ENFORCEMENT (the theatrical gate)
- **THE RULING:** "if you are wiring something to text.complete and changing messages in the chat stream this is explicitly banned for how fucking annoying it is. ONLY throw errors on tool before are allowed" + "why is there still a message transform hook? i thought i said this is only throw error based".
- **THE IMPLEMENTATION:** the textCompleteHook's theatrical scan REMOVED + the messagesTransformHook's theatrical scan REMOVED + the Phase B theatrical mutation REMOVED + the ESCALATE throw (the tool.before) as the ONLY visible enforcement + the accumulated-count check (the completed-message armings trigger the throw on neutral calls).

## D-2026-08-09-33 — THE WAVE-VERBATIM OVERHAUL (the compression ban)
- **THE RULING:** "agents STOP COMPRESSING/CONDENSING the fucking prompts it is getting retarded what is allowing them to still be stupid like this" + the pasted transcript (the agent's condensed 71-line dispatch + the firewall's 150-floor deadlock).
- **THE IMPLEMENTATION:** the [WAVE VERBATIM] SHA verification (the preserved manifests' sha256 vs the dispatched prompt's SHA — the condensed BLOCKED; the verbatim EXEMPT from the line floor — the generated 133-148-line formats pass by construction), the [WAVE BATCH] multi-agent enforcement (the single dispatch of a multi-agent wave BLOCKED — the full batch is the only channel), the promptFile channel (the exact content from the file — no reproduction), the t.e.a. wipe's preservation (the manifests + the prompt files), the wave-specific manifest names.
- **THE LINES-GATE (the operator's "WHERE IS THE FUCKING TASK FIREWALL" catch):** the verbatim exemption requires the manifest's lines >= 125 — the 3-line slop records do NOT exempt → the [TASK FIREWALL] blocks the slop. The architecture INTACT for the real generated prompts.

## D-2026-08-09-34 — THE QUESTION-TOOL LEAF BAN
- **THE RULING:** "your subagent also just asked me a bunch of questions. questiontool for subagents should either be disabled or YOU the primary agent must be able to answer them... so remove the question tool from subagents". The 'question' tool added to the leaf-node ban — the prompts self-contained.

## D-2026-08-09-35 — THE IDENTITY OVERHAUL (the warheads 12/13/14)
- **THE RULING:** "force it to write everything dense and properly by default... CONTEXT ARGS NEED TO BE FUCKING DENSE" + "DONT JUST THROW SOME FUCKING SLOP INTO THE WARHEAD WRITE A CORRECT FUCKING WARHEAD THAT NIPS UNTRUTHFUL CONTAINER TESTS + UNTESTED HASTE EDITS" + the meta-audit ("how do we make the agent intelligent at the macro level") + "a BEHAVIOR PROGRAM: imperative instructions that tell a fresh agent with ZERO prior context exactly what to DO".
- **THE IMPLEMENTATION:** the WARHEAD 12 (the density-and-dispatch law — the fresh-subagent target, the 10-50x/3-5x family split, the anti-truncation with the REAL constraints, the LLM-tools first-class bullet), the WARHEAD 13 (the verification-before-declaration law — the red-team mandate, the artifact-proof, the blocked-states-as-problems, the state-over-report), the WARHEAD 14 (the proven-path law — the args-check first, the skill-load, the never-improvise, the state is the truth), the inline INLINE_WARHEADS_MD regen (the wiring gap — the injection used a stale copy), the AGENTS.md regen.
- **THE WARHEAD-WRITING SKILL:** the full 12-step workflow + the 15-row anti-pattern table + the META-AUDIT (the generic-law check, the hardcoded-examples check, the derailment-fuel check, the force-vs-example check) + the reference-density gate + the explicit-approval gate + the rushed-landing anti-pattern.

## D-2026-08-09-36 — THE DEEP TEST'S MODEL RESOLUTION (the proven-path lesson)
- **THE CONTEXT:** the container's session model switching — my config fumbling (the provider entry + the model field edits) after the switch-model's single race; the operator: "this is literally exactly what the tool is supposed to do on switch-model" + "looks like the tool works and the issue was you not putting in the correct args".
- **THE TRUTH:** the switch-model works — the correct display name (`DeepSeek V4 Flash`, never the `(new)` variant) landed the Go provider cleanly (twice, the status bar confirmed). The wrong name raced/failed.
- **THE WARHEAD 14's birth:** the args-check-first + the never-improvise + the state-is-the-truth — the derailment's exact geometry (the wrong input → the tool blamed → the improvisation) named as the law's first case.

---

## THE DECISIONS' DOWNSTREAM IMPLICATIONS (what each constrains)

1. D-14 (the generator-only): the tool's description + the check-in text + the batch form + the orchestrator's dispatch — the direct spawns structurally impossible.
2. D-15 (the leaf gate): the wave tools + the question tool banned for the subagents — the recursion + the operator-bothering impossible.
3. D-19 (the loud-fail): every error path names the failure — the PI_LOOP_EMPTY, the named-partial, the failed-list.
4. D-21 (the atomic seq): the parallel generation's seq collisions impossible — the caller's seq ignored.
5. D-22 (the no-fallback): the [SHADOW INFERENCE] section = the model's brief after the ~~~~~~~~~~~ or nothing.
6. D-27 (the firewall re-enable): the thin prompts blocked with the wave-generator directive + the [WAVE VERBATIM]/[WAVE BATCH] checks.
7. D-31 (the theatrical overhaul): the v3 verdict + the tracker + the throw-only — the mock-server class caught.
8. D-32 (the throw-only): the text.complete + the messages-transform theatrical wiring REMOVED — the ESCALATE throw the only visible enforcement.
9. D-33 (the wave-verbatim): the compressed prompts blocked by the SHA; the one-at-a-time blocked by the batch check; the slop records gated by the lines-check; the exact content via the promptFile.
10. D-34 (the question-ban): the leaf nodes never ask; the prompts self-contained.
11. D-35 (the identity): the warheads 12/13/14 + the inline wiring + the skill — the behavior-programming standard.
12. D-36 (the proven-path): the args-check first on any tool failure; the tool innocent until the input proven correct; the state is the truth.

## THE FROZEN-CLARIFICATION ADDENDA (the operator's later refinements)

- The loud-fail law's refinement: "DO NOT CREATE BULLSHIT FALLBACKS THAT CREATE FALSE SUCCESS AND DERAIL PROJECTS. ENGINEER WHAT YOU ARE INSTRUCTED. DO NOT ENGINEER DUMB FALLBACKS THAT MISS THE ENTIRE POINT OF THE FUCKING DESIGN" — the fallback test's origin.
- The token policy's correction: "380k actually. deepseek has a max tokens of 384,000" — the 300K → 384000.
- The theatrical's refinement: "do NOT blind fire fixes - lets properly plan the correct fix to allow legit testing use cases but overhaul the intent and downstream effects detection" — the plan-first + the legit-preservation.
- The throw-only's refinement: "why is there still a message transform hook? i thought i said this is only throw error based" — the messages-transform scan's removal.
- The wave-verbatim's refinement: "WHAT IS ALLOWING THEM TO STILL BE STUPID LIKE THIS" + "WHERE IS THE FUCKING TASK FIREWALL?? HOW WAS THIS SHITTY 2 LINE PROMPT EVEN ALLOWED" — the lines-gate's origin.
- The warhead standards' refinements: "write a correct fucking warhead that nips untruthful container tests + untested haste edits" + "a BEHAVIOR PROGRAM: imperative instructions that tell a fresh agent with ZERO prior context exactly what to DO" + "no derailment fuel, no hardcoded examples".

---

## THE DECISIONS' ALTERNATIVES REJECTED (the full record)

1. D-14: the promptAsync fire-and-forget spawn (the original spec's Part 3.2) — the empty-shell mechanism — rejected for the batch-form contract.
2. D-19: the mechanical-fallback expansion (the v13 expansion + the mechanicallyRepair) — rejected by the fallback test (a different artifact marked VALIDATED).
3. D-20: the sequential generation loop — rejected for the Promise.allSettled parallel (the 20-minute hang's lesson).
4. D-21: the nextSeq() THEN INSERT — rejected for the atomic INSERT (the TOCTOU race).
5. D-22: the mechanical inference.text append — rejected for the model's own brief (the operator's no-fallback).
6. D-27: the skill-only gate — rejected for the either/or (the wave generator satisfies the standard).
7. D-31: the blanket mock-exemption — rejected for the subject-classified verdict (the operator's "how is it able to tell the difference").
8. D-32: the M5 append-based escalation (the text.complete) — rejected for the throw-only (the operator's stream-purity ruling).
9. D-33: the trust-the-generator (the manifest's sha256 alone) — rejected for the lines-gate (the slop-exemption hole).
10. D-35: the documentation-summary warhead — rejected for the behavior-programming shape (the imperative DOs, the fresh-agent drill).

## THE DECISIONS' CURRENT-STATUS FLAGS (the active vs the settled)
- D-31/D-32/D-33/D-34/D-35/D-36: ACTIVE — the deep test verifies the implementations at the runtime.
- D-14 through D-30: SETTLED — the container + the host evidence recorded (the wave-generator 6/6, the host waves).

---

## THE DECISIONS' TEST-MAPPING (how each is verified)

- D-14 (the generator-only): the host waves + the container suites (the batch form's "NO subagents have been dispatched").
- D-15 (the leaf gate): the subagent-session dispatch attempts blocked ([TRIDENT LEAF NODE]).
- D-19 (the loud-fail): the PI_LOOP_EMPTY tests (the A2 test's contract) + the container's live generation failures' named errors.
- D-21 (the atomic seq): the shadow-memory atomic-seq test + the host parallel waves (3 prompts, failed:[] empty).
- D-22 (the no-fallback): the container's S4 (the [SHADOW INFERENCE] = the model's forward-map) + the host waves' sections.
- D-27 (the firewall): the [NO LAZY PROMPTS] container banner + the wave-telemetry tests.
- D-31 (the theatrical): the deep test's S3-S6 + the battery's wave tests + the container's ESCALATE throw.
- D-32 (the throw-only): the container's ESCALATE-throw live + the battery.
- D-33 (the wave-verbatim): the host's direct tests (the [WAVE VERBATIM] + the [WAVE BATCH] live) + the deep test's S3-S6.
- D-34 (the question-ban): the leaf-gate's source + a subagent's question attempt in the deep suite.
- D-35 (the identity): the battery + the build + the source (the warheads' content).
- D-36 (the proven-path): the switch-model's corrected-input landing (the evidence in EVIDENCE_STATE).

## THE OPERATOR'S RULINGS' FULL TEXT (the canon quotes in context)

- The theatrical incident: "WHY ARE YOU NOT TESTING THE REAL FUCKING TENCENT DB SERVER WTF IS THIS THEATRICAL FUCKING GARBAGE... an agent just literally fabricated a whole theatrical mock server to fabricate a container test instead of actually testing what i told it. this should have been COMPLETELY nipped by the trident theatrical detection firewall. this is the first major hole ive had on that in months but this is a big one."
- The investigation directive: "investigate the trident theatrical firewall how its current wired i think it needs a lexicon overhaul".
- The planning directive: "do NOT blind fire fixes - lets properly plan the correct fix to allow legit testing use cases but overhaul the intent and downstream effects detection so it can properly block theatrical shit like this and other variants of it".
- The throw-only: "if you are wiring something to text.complete and changing messages in the chat stream this is explicitly banned for how fucking annoying it is. ONLY throw errors on tool before are allowed".
- The compression ban: "agents STOP COMPRESSING/CONDENSING the fucking prompts it is getting retarded what is allowing them to still be stupid like this and how can we overhaul it".
- The deep test: "I EXPLICITLY SAID TO FUCKING CONTAINER TEST THIS BEOFRE SHIPPING YOU SAID YOU DID SO THIS WAS A FUCKING LIE AND/OR THE CONTAINER TEST WAS THEATRICAL SHIT OBVIOUSLY DIDNT DO AN ACTUAL DEEP TEST" + "FIX ALL OF THIS AND FUCKING PROPERLY CONTAINER TEST".
- The model: "use opencode go what is the issue here" + "USE DEEPSEEK V4 FLASH ON OPENCODE GO" + "this is literally exactly what the tool is supposed to do on switch-model".
- The density: "force it to write everything dense and properly by default im so sick of all these garbage model weights tryign to truncate and shorten everything as much as possible" + "CONTEXT ARGS NEED TO BE FUCKING DENSE AND NOT SOME WATERED DOWN BULLSHIT GARBAGE".
- The warhead standard: "DONT JUST THROW SOME FUCKING SLOP INTO THE WARHEAD WRITE A CORRECT FUCKING WARHEAD THAT NIPS UNTRUTHFUL CONTAINER TESTS + UNTESTED HASTE EDITS" + "how do we make the agent intelligent at the macro level so it stops being a fucking retard" + "a BEHAVIOR PROGRAM: imperative instructions that tell a fresh agent with ZERO prior context exactly what to DO".

---

## THE DECISIONS' IMPLEMENTATION ANCHORS (the file:line map)

- D-14: wave-dispatch.ts:424-443 (the batch form) + :373-409 (the generator-only comments).
- D-15: trident-hooks.ts:1550+ (the leafBanned).
- D-19: shadow-runner.ts:1112-1122 (the PI_LOOP_EMPTY) + wave-dispatch.ts:390-409 (the failed list).
- D-21: shadow-memory.ts:216-270 (the atomic INSERT).
- D-22: shadow-runner.ts:730 + :871-875 (the [SHADOW INFERENCE]).
- D-25: wave-dispatch.ts:161-183 (the error-mask check).
- D-27: trident-hooks.ts:1757+ (the [NO LAZY PROMPTS]) + :1760+ (the either/or).
- D-28: trident-hooks.ts:864+ (the completed-message arming).
- D-29: shadow-brain.ts:52-56 + :120-200 (the stall detector).
- D-31: trident-hooks.ts:429-680 (the v3 lexicon + the tracker) + :2033-2070 (the throw-only).
- D-33: trident-hooks.ts:1006+ (the [WAVE VERBATIM] + the lines-gate) + :1060+ (the [WAVE BATCH]) + wave-dispatch.ts:477-489 (the promptFile).
- D-34: trident-hooks.ts:1552+ (the question tool in the leafBanned).
- D-35: src/identity/trident/WARHEADS.md (the 12/13/14) + src/identity/index.ts (the inline) + the AGENTS.md.
- D-36: the WARHEAD 14 (the identity) + the switch-model's evidence (EVIDENCE_STATE).

## THE DECISIONS' RESUME CONTRACT (what the next session must honor)

- The doctrine is canon — never re-litigate, never paraphrase.
- The frozen machinery (BUILD_STATE's table) is locked — the deep test verifies, never re-opens.
- The operator's rulings are the law — the throw-only, the compression ban, the density, the proven-path, the red-team.

---

## THE DECISIONS' SESSION-STATE (the marathon's arc)

The chain's arc: the catastrophe (D-14) → the wave generator's reliability (D-19 through D-30) → the theatrical overhaul (D-31) → the throw-only (D-32) → the wave-verbatim (D-33) → the question-ban (D-34) → the identity (D-35) → the proven-path (D-36). Each decision resolved a live failure class; the deep test verifies the recent ones at the runtime.

---

## THE DECISIONS' EVIDENCE REFERENCES (the cross-doc map)

- D-31/D-32/D-33/D-34/D-35/D-36's implementations: CURRENT_STATE.md's module anchors.
- The evidence: EVIDENCE_STATE.md's container-run provenance + the proven-vs-claimed table.
- The queue: TASK_QUEUE.md's active/backlog.
- The resume: POST-COMPACTION_PROMPT.md's sequence.

---

## THE CHAIN'S READER'S NOTE

The decisions are the canon — a fresh agent reads this document to know WHAT was decided + WHY + WHAT it constrains, and never re-litigates the settled doctrine.

---

## THE DECISIONS' SESSION-STATE (the 2026-08-14 arc — the T.E.B. machine + the shadow-brain fixes)

- **D-37: THE PROMPTFILE-ONLY BATCH (the GLM-derailment kill).** The batch form emits ONLY `{ description, promptFile, subagent_type }` — NO prompt field, NO placeholder, NO background (the old placeholder was the GLM derailment fuel: the model saw a prompt field + tried to reproduce/compress it → the 20-min SHA loop). The model passes ONLY the literal prompt file path + desc + type; the T.E.B. loader hook (trident-hooks.ts:1741 — idTool === 'task' → loadPromptFileForDispatch) MUTATES the args in place: promptFile → prompt (byte-exact content) + ADDS background:true + STRIPS promptFile BEFORE the tool executes. The native task tool runs background.start() (the job registry + task_status + the result injection). THE PROMPT NEVER PASSES THROUGH THE MODEL'S OUTPUT — the GLM compression is structurally impossible. Files: wave-dispatch.ts (the emission), wave-constants.ts (the batch type), trident-hooks.ts:1741 (the machine). Verified: 434/434, tsc 0, dist 4a909158 → the container test in progress.
- **D-38: THE T.E.A. WIPE DEFERRED.** The old wipe fired on EACH task's completion deleting THAT task's prompt file — the premature wipe (a 5-agent batch with 3 dispatched + 2 fucked lost the 2 retry files). THE FIX: the wipe fires ONLY when the wave's registry shows the FULL dispatch (calls.length == total && every call accepted). Until then the prompt files SURVIVE (the retry/re-dispatch recovery path). File: trident-hooks.ts:2536.
- **D-39: THE WAVE-VERBATIM SIMPLIFIED.** The SHA check now verifies the MECHANICAL FACT: the task call's description matches a wave agent + the prompt was INJECTED from the prompt file (the SHA matches the manifest by construction — the T.E.B. machine read the file itself, the model never wrote the prompt). The "compressed/condensed" failure mode is dead (there is nothing to compress). File: trident-hooks.ts:1896.
- **D-40: THE SHADOW-BRAIN TIMEOUT ROOT CAUSE + THE 3-FIX PLAN.** The SHADOW_BRAIN_TIMEOUT (the container's "PI round 4: no event within 45000ms" + the other session's identical class) comes from SHADOW_FETCH_STALL_MS = 45s being calibrated to a 1s small-input probe while the REAL 384K wave prompts document a 35-50s first-event latency — a 5-second knife-edge that aborts healthy-but-slow generations under load. THE 3-FIX PLAN (APPROVED — to implement): (1) the MEASURED STALL WINDOW — a shadow-health sqlite store records the rolling first-event latency; the window = avg × 3, bounded [45s, 5m]; (2) the BACKOFF RETRY — a timeout retries ONCE at 2× the measured window after a 3s gap (slow, not dead) — NO provider/model switching (the operator: "no model switching ever. provider as well only backup is direct deepseek api but this should NEVER BE USED unless there is a legit server failure of opencode go"); (3) the DENSITY MEMORY — the tracker persists the context args that produced a validated prompt; a regeneration with the same agent name + args at <0.7 the original density appends the named warning (REUSE the original args verbatim — the class-2 thin-args-collapse fix from the Critical Failure Log 2026-08-14-wave-regeneration-thin-prompt-failure.md). The PI loop (shadow-runner.ts:753-866) is NOT the problem — it already feeds the validator's failures into the next continuation (line 805-852); the failures were INPUT failures (thin args) + TRANSPORT failures (the 45s knife-edge), never the loop.
- **D-41: THE FIREWALL-BACKEND-INTELLIGENCE GAP (task #25 — queued).** The live MPSE wave showed the firewalls as DUMB BLOCKERS: WAVE VERBATIM fired on all 4 calls because the model manually typed a prompt instead of the promptFile param (the block message didn't carry the correct call shape → the model reverse-engineered it from raw tool output); WAVE BATCH fired on 3 of 4 because the registry was missing → the wave fragmented (1 running + 3 blocked, no reconcile path). THE ASK (for later): the firewall MESSAGES must carry the exact copy-pasteable call shape + the batch gate must reconcile partial dispatches. See the task queue #25.
