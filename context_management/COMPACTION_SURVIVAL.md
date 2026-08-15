# COMPACTION_SURVIVAL — THE RESUME ANCHOR (2026-08-09)

**READ FIRST among the canon docs.** This is the orientation — the shape of the entire build, the operating laws, the settled doctrine, and the entry rules. A fresh agent reads THIS + POST-COMPACTION_PROMPT.md + then the state docs, and resumes with zero re-derivation.

---

## STATE AT A GLANCE (the one-paragraph orientation)

The Trident v4.4.2 plugin (the opencode plugin in `/home/leviathan/OPENCODE_WORKSPACE/Shared Workspace Context/Manta Agent/Active_Projects/Trident_v4.4.2`) was hardened through the 2026-08-08/09 marathons into a **wave-generator + theatrical-firewall + wave-verbatim baseline**: the `trident-wave-generator` (the ONLY subagent dispatch path — the generator-only baseline) with the SSE streaming transport (the root-cause fix — the provider's 35-50s buffered generations vs the 1.0s streaming first-byte), the bounded-concurrency pool, the per-agent telemetry, the retry-on-500, the stall detector; the **theatrical firewall v3** (the subject-classified sentence verdict + the tracker + the THROW-ONLY enforcement per the operator's "ONLY throw errors on tool before are allowed" — the text.complete + the messages-transform wiring REMOVED); the **wave-verbatim overhaul** (the [WAVE VERBATIM] SHA verification — the condensed prompts BLOCKED, the [WAVE BATCH] multi-agent enforcement — the one-at-a-time BLOCKED, the promptFile channel — the exact content, the lines-gate — the slop records don't exempt, the question-tool leaf ban); the **identity overhaul** (the WARHEADS 12/13/14 — the density-and-dispatch, the verification-before-declaration, the proven-path laws + the inline injection wiring fixed + the AGENTS.md); the **warhead-writing skill** (the full 12-step workflow). **THE CURRENT DIST: baaf776978b49506187016ff0adcca4ff956d5644ee76fbd67c47924bb5df432. THE BATTERY: 175 pass / 0 fail / 638 expect. THE ACTIVE TASK: the container deep test** (the fixtures ready in the container `theatrical-fw-ct`, the session model LIVE — DeepSeek V4 Flash (2x usage) / OpenCode Go — verified, the 7-scenario plan preflighted READY, the setup's re-validation pending the ORDER gate). The host was REVERTED to the GNR dist by the operator (the ship rejection) — the deploy of `11fb42e7` is the operator's action.

---

## THE OPERATING LAWS (the full set — each with its rationale)

### L1 — EVIDENCE OVER PROSE (the claim-vs-behavior law)
Every claim about the build's behavior requires the mechanical evidence structure BEFORE the claim: a sha256sum, a test passToken, an artifact line count, a container stream excerpt. "Files changed" is not verification; "gates passed" is not an audit; prose is not proof. **RATIONALE:** the 2026-08-07 catastrophe (the 15-deep subagent recursion) + the false-success fallback (the fabricated "validated" prompts) both shipped because prose claims substituted for mechanical verification.

### L2 — CONTAINER BEHAVIORAL EVIDENCE OR NOTHING (the runtime-grade law)
A code change is NOT "tested" until it ran in a fresh container via `trident-container-test` with a validated plan + the behavioral passTokens matched in tool-result context + the results artifact written. Smoke tests, host greps, source-inspection "proofs" are THEATER. **RATIONALE:** the M17-series regressions (the read's DCS-swallow, the stale cursors) all looked "correct" in source and failed live. **THE WARHEAD 13's ENHANCEMENT:** a "container tested" declaration means the plan written first (natural-language, NOT a script) + EVERY scenario run in the TUI (none skipped, none abandoned at the first error) + the found bugs fixed + retested + zero regressions. An environment-blocked suite is reported as BLOCKED, never as tested.

### L3 — THE LOUD-FAIL-OR-CLEAR-PASS LAW (WARHEAD 10)
Everything is either a LOUD FAIL or a CLEAR PASS. A feature's primary path fails → the LOUD ERROR that NAMES the failure (the error code, the stage, the evidence). NEVER a substitute artifact dressed as success. THE FALLBACK TEST: does the fallback produce what the primary produces, differing only in quality? if NO — it is FALSE SUCCESS and it is BANNED. **RATIONALE:** the dead-LLM fallback fabricated "validated" prompts (validated:true, ready:true) while the brain produced nothing — the pipeline consumed the fake.

### L4 — THE FILES ARE THE ONLY GROUND TRUTH (the L4 supremacy)
Context args are BELIEF — verified against the files, NEVER conformed to. A context arg that contradicts the file contents MUST be flagged. Every claim about the files must be READ from them. **RATIONALE:** the shadow pipeline's entire inference + contradiction-detection architecture rests on this; the R1/R2/R3 detectors mechanically verify the args vs the excerpts.

### L5 — ASYNC/PARALLEL IS THE DEFAULT (WARHEAD 11)
Independent units process IN PARALLEL unless explicitly instructed sequential. The sequential-only exception: a TRUE data dependency. INTELLIGENT async (allSettled + per-unit failure capture + collected results) never fire-and-forget slop. **RATIONALE:** the sequential generation loop was the 20-minute hang; the Promise.allSettled fix made an N-agent wave = the slowest agent; the bounded pool (3 at a time) capped the provider's queue.

### L6 — THE DENSITY LAW (the doc floors + the WARHEAD 12)
Every .md write is an engineering artifact with a per-type floor (ARCHITECTURE 1000+, SPEC 3000+, COMPLETION 2000+, REPORT 500+, AUDIT 100+, LOG 100+, OVERVIEW 300+, GENERIC 200+, the canon docs 200+). A thin doc is a lie — the density is the data. **THE WARHEAD 12's ENHANCEMENT:** the context args are written at 10-50x the floors for the task-dispatch family (the low 200c/100c/50c floors) + 3-5x for the LLM-tool family (the already-high 4000c+/16000c+ thresholds) + more wherever tangibly relevant; the target reader is a FRESH SUBAGENT WITH ZERO PRIOR CONTEXT; the anti-truncation: every subagent has the 1M context + the 128K output — never fabricate limits.

### L7 — THE RUNNING-BUILD-DOCS LAW
A DEBUG_LOG + a BUILD_REPORT exist for EVERY build — APPEND-ONLY, never overwritten. Updated at every milestone: every bug found+fixed (root cause + mechanism + verification), every design decision, every live test result — IMMEDIATELY, while fresh. **RATIONALE:** the M3 incident (the debug log went stale for 3 weeks) + the recurring regression class (the param-name-vs-schema bug shipped twice because the pattern was never abstracted into the log).

### L8 — THE INTELLIGENT-SYSTEMS LAW (WARHEAD 9 — the anti-slop)
Decision systems are engineered as LEXICONS + STATE MACHINES + ALGORITHMIC SYSTEMS by default. The regex is a mechanical DETECTOR only (the detection layer, never the decision layer) — name why in the code comment. The SLOP signatures: the N-branch tower, the regex-only classifier, the magic ladder. **RATIONALE:** the theatrical firewall's blanket `\bmock\s+server\b` exemption was exactly a word-list classifier with no decision layer — it let the mock-server fabrication through (the incident that drove the theatrical overhaul).

### L9 — THE MINIMAL-CHANGE DISCIPLINE
The most TARGETED change. Touch only what the objective requires. Before modifying: read the target + all importers + all dependencies; trace the blast radius. **RATIONALE:** the surgical one-string firewall message edit the operator demanded ("THIS IS A SURGICAL EDIT DONT FUCK THIS UP IT IS LITERALLY JUST CHANING 1 FUCKING STRING").

### L10 — ZERO BROKEN WINDOWS
Never leave the codebase worse than found. A build passing before + failing after = a HARD FAILURE regardless of the achievement. Run the same checks as the baseline + compare + fix regressions to root cause. **RATIONALE:** the 2026-08-09 syntax-error incident (the unescaped apostrophe broke the build for turns while the dist stayed stale + the operator deployed the stale dist) — the WARHEAD 13's edit-verification loop exists to catch it in seconds.

---

## THE SETTLED DOCTRINE (the operator's rulings — VERBATIM + the why)

1. **"EITHER A LOUD FUCKING ERROR OR IT WORKS... EVERYTHING IS EITHER A LOUD FAIL OR A CLEAR PASS. DO NOT CREATE BULLSHIT FALLBACKS THAT CREATE FALSE SUCCESS AND DERAIL PROJECTS. ENGINEER WHAT YOU ARE INSTRUCTED. DO NOT ENGINEER DUMB FALLBACKS THAT MISS THE ENTIRE POINT OF THE FUCKING DESIGN AND CREATE FALSE SUCCESS."** — the loud-fail law's origin; killed the mechanical-fallback machinery (WARHEAD 10).
2. **"MAX TOKENS 300K ACROSS THE FUCKING BOARD ANYWHERE DEEPSEEK IS THE MODEL" → corrected "380k actually. deepseek has a max tokens of 384,000" → "purge all this fuckin 8k max tokens slop"** — the token-cap policy: deepseek → 384000, else → 128000. The 8192 cap was the truncation root-cause.
3. **"async/parallel is the DEFAULT - only build sequential systems if explicitly instructed... make sure they are wired correctly so we dont have a bunch of fire and forget async slop but INTELLIGENT async systems"** — WARHEAD 11's origin.
4. **"the reasoning tokens should NOT be part of the final prompt"** — the contamination fix's origin.
5. **"NO MECHANICAL FALLBACK. EITHER THE REAL MODEL BRIEF WORKS OR IT IS JUST THE PROMPT."** — the [SHADOW INFERENCE] = the model's own brief or nothing.
6. **"the DISPATCH SKILL REQUIRED demand - this needs to be an either/or on the dispatch skill + wave generator tool. either one fulfills the criteria dont hardcode the skill"** — the waveGeneratorUsed either/or.
7. **"rename the wave dispatch tool in this version to wave-generator so it doesnt confuse anyone"** — trident-wave-generator canonical.
8. **"OLD TASK FIREWALL THAT BLOCKS SHITTY FUCKING PROMPTS UNDER 125 LINES AND HAS THE PROPER LEXICON FILTERS THAT MATCH THE TEMPLATE SECTIONS/HEADINGS SINCE THIS IS NOW STANDARDIZED THROUGH THE WAVE GENERATOR THERE IS 0 REASON THIS SHOULD EVER FAIL IF WAVE GENERATOR IS USED CORRECTLY"** — the firewall re-enable.
9. **"WHY ARE YOU NOT TESTING THE REAL FUCKING TENCENT DB SERVER WTF IS THIS THEATRICAL FUCKING GARBAGE"** — the theatrical firewall overhaul's origin (the mock-server incident).
10. **"do NOT blind fire fixes - lets properly plan the correct fix to allow legit testing use cases but overhaul the intent and downstream effects detection"** — the overhaul must be planned + surgical, preserving legit unit-testing.
11. **"how is it able to tell the difference?"** — the answer: the claim-subject classification + the substitute-shape + the session chain.
12. **"if you are wiring something to text.complete and changing messages in the chat stream this is explicitly banned for how fucking annoying it is. ONLY throw errors on tool before are allowed"** — the theatrical enforcement's throw-only contract; the message-surface wiring REMOVED.
13. **"agents STOP COMPRESSING/CONDENSING the fucking prompts"** — the wave-verbatim mandate (the SHA verification + the promptFile + the [WAVE BATCH]).
14. **"I EXPLICITLY SAID TO FUCKING CONTAINER TEST THIS BEOFRE SHIPPING YOU SAID YOU DID SO THIS WAS A FUCKING LIE... FIX ALL OF THIS AND FUCKING PROPERLY CONTAINER TEST"** — the WARHEAD 13's mandate: the deep test's plan-first + the full TUI run + the bugs fixed + the regressions zeroed.
15. **"use opencode go what is the issue here"** + **"USE DEEPSEEK V4 FLASH ON OPENCODE GO"** — the container's session model: DeepSeek V4 Flash via the Go provider — the tool works; the wrong display name was the derailment (the WARHEAD 14's args-check).
16. **"force it to write everything dense and properly by default... CONTEXT ARGS NEED TO BE FUCKING DENSE AND NOT SOME WATERED DOWN BULLSHIT GARBAGE"** — the WARHEAD 12's density law.
17. **"DONT JUST THROW SOME FUCKING SLOP INTO THE WARHEAD WRITE A CORRECT FUCKING WARHEAD THAT NIPS UNTRUTHFUL CONTAINER TESTS + UNTESTED HASTE EDITS"** — the WARHEAD 13's engineering standard.
18. **"write a warhead correctly... a BEHAVIOR PROGRAM: imperative instructions that tell a fresh agent with ZERO prior context exactly what to DO"** — the warhead-writing standard's essence.

---

## THE DOC MAP (the 9 canon docs + their paths + what they contain)

| # | Doc | Path | What it contains |
|---|---|---|---|
| 1 | COMPACTION_SURVIVAL.md | context_management/ | THIS — the orientation, the laws, the doctrine, the entry rules |
| 2 | POST-COMPACTION_PROMPT.md | context_management/ | the exact entry sequence + the mission (the container deep test) + the reading order + the verified state + the acceptance |
| 3 | BUILD_STATE.md | context_management/ | the dist SHA (416ccff7), the battery, the SHA chain, the checkpoint structure, the module inventory, the frozen machinery |
| 4 | CURRENT_STATE.md | context_management/ | per-module status (built/solid/broken/open) with file:line |
| 5 | DECISION_CHAIN.md | context_management/ | every canon decision + the operator rulings verbatim |
| 6 | EVIDENCE_STATE.md | context_management/ | the verified evidence: SHAs, the behavioral passTokens, the container provenance, the proven-vs-claimed split |
| 7 | CHANGELOG.md | context_management/ | the per-session accomplishments + failures + debugging journeys |
| 8 | NEXT_STEPS.md | context_management/ | the wave plan: the container deep test's exact steps + the done-when |
| 9 | TASK_QUEUE.md | context_management/ | the live queue: active/backlog/blocked + the gates' state |

**THE SPECS + THE PLANS (the build contracts):** THEATRICAL_FIREWALL_OVERHAUL_SPEC.md (the v3 design), THEATRICAL_FIREWALL_TUI_TEST_SPEC.md (the TUI suite design), WAVE_DISPATCH_OVERHAUL_SPEC.md (the wave generator's constitution), .trident/test-plan.md (the container deep test's plan — the ACTIVE acceptance), the container-test-results.json (the artifact — currently the honest BLOCKED state; the deep test must replace it with the per-scenario PASS verdicts).

---

## THE FRESH-AGENT ENTRY RULES (the exact first-5-actions)

1. Read COMPACTION_SURVIVAL.md (this) + POST-COMPACTION_PROMPT.md — the orientation + the mission.
2. Read BUILD_STATE.md + EVIDENCE_STATE.md + CURRENT_STATE.md — the TRUE dist SHA (416ccff7) + the verified evidence + the per-module state.
3. Read .trident/test-plan.md — the container deep test's plan (the ACTIVE acceptance — the 7 scenarios).
4. Verify the workspace: `sha256sum dist/index.js` == 11fb42e7 + `cd src/tests && bun test` == 175/0 + the container's state (`trident-container-test action=alive` + the screenshot — the model must show the Go provider).
5. EXECUTE the deep test per the plan — the setup's re-validation → the 7 scenarios → the found bugs fixed + retested → the artifact → the sync — do NOT re-derive, do NOT re-litigate the doctrine, do NOT ask permission for the required work.

## THE OPERATING RULES QUICK-REFERENCE

- Container testing: `trident-container-test` ONLY (the plan-first protocol, the preflight target=ct, the behavioral tokens, the results artifact).
- Subagent dispatch: `trident-wave-generator` ONLY (the batch form → the batch tool — the exact prompts, 0 ignore, the promptFile channel).
- The gates: the leaf-node gate, the CT ORDER gate, the CTX_FLOORS, the SSTF claim gate, the doc-density gate, the ISE soft-warn, the [WAVE VERBATIM]/[WAVE BATCH] firewalls.
- The identity: the 14 warheads + the AGENTS.md (the native channel) + the plugin's inline injection.
- The provider: DeepSeek V4 Flash via opencode-go (the shadow brain); the container's session: DeepSeek V4 Flash (2x usage) via OpenCode Go.
- The deploy: the operator's action (the direct dist copy).
- THE PROVEN-PATH LAW (the WARHEAD 14): the args-check first (the display names), the skill-load on failure, the retry with the corrected parameters, never improvise, the state is the truth.

---

## THE COMPACTION CHECKLIST (the state at THIS prep)

- [x] The TRUE state verified: the dist 11fb42e7 + the battery 175/0 + the container's live Go model + the fixtures ready.
- [x] The 9 canon docs updated to the current state (the 2026-08-09 baseline — the deep test's takeover).
- [x] The TRUE dist SHA (416ccff7) recorded in BUILD_STATE + CURRENT_STATE + EVIDENCE_STATE + POST-COMPACTION_PROMPT.
- [x] The deep test's plan (the 7 scenarios) in .trident/test-plan.md + the preflight READY.
- [ ] THE NEXT SESSION: the container deep test — the setup's re-validation → the 7 scenarios → the bugs fixed + retested → the artifact → the checkpoint/package sync → the three-way hash.
- [ ] The host deploy of 11fb42e7 (the operator's action — the host currently runs the GNR dist).

---

## THE LAWS' IMPLEMENTATION ANCHORS (the file:line map — the fresh agent's verification targets)

- L1/L3 (the loud-fail + the evidence): shadow-runner.ts:1112-1122 (the PI_LOOP_EMPTY — ready:false, no file, no row); wave-dispatch.ts:390-409 (the failed agents excluded from the batch — never an empty prompt).
- L2 (the container evidence): container-test.ts:1220+ (the CT_SCENARIO_ACTIONS allowlist — the ORDER gate); .trident/container-test-results.json (the artifact — the per-scenario verdicts).
- L4 (the files are the ground truth): shadow-runner.ts:784-904 (the silentVerify — the L4-only repair); the R1/R2/R3 contradiction detectors in the shadow pipeline.
- L5 (the async-parallel): wave-dispatch.ts:313-365 (the bounded pool — CONCURRENT_GENERATIONS = 3, the allSettled per slice, the runOne failure capture); shadow-brain.ts:457-476 (the retry loop).
- L6 (the density): trident-task-preflight.ts:129 (the CTX_FLOORS refusal — the message teaches the dense writing); the warhead 12 (the identity).
- L8 (the ISE): trident-hooks.ts:1976+ (the ISE soft-warn — the 3 signatures); the sentence-verdict's lookahead (the REAL_TARGET_SUBJECTS).
- L9/L10 (the minimal-change + the zero-broken-windows): the battery at src/tests (175/0); the edit → battery → build → SHA loop (the WARHEAD 13).

## THE DOCTRINE'S DOWNSTREAM IMPLICATIONS (what each ruling constrains)

1. The loud-fail law constrains every feature's error path — a fallback that produces a different artifact is banned (the fallback test).
2. The token policy (384000) constrains the shadow brain's max_tokens — the 8192 caps purged.
3. The async-parallel law constrains the system design — the sequential-only exception is the true data dependency.
4. The contamination fix constrains the prompt extraction — the LAST real opener, never the first.
5. The no-mechanical-fallback constrains the [SHADOW INFERENCE] — the model's brief or nothing.
6. The either/or constrains the dispatch skill gate — the waveGeneratorUsed satisfies the standard.
7. The throw-only ruling constrains the theatrical gate — the text.complete + the messages-transform wiring banned; the ESCALATE throw (the tool.before) is the only visible enforcement.
8. The compression ban constrains the dispatch — the [WAVE VERBATIM] SHA + the [WAVE BATCH] + the lines-gate + the promptFile.
9. The question-ban constrains the subagents — the 'question' tool in the leaf-node list; the prompts self-contained.
10. The density law constrains every context-arg tool — the 10-50x/3-5x family multipliers + the fresh-subagent target + the anti-truncation.
11. The proven-path law constrains every tool failure — the args-check first, the skill-load, the retry with the corrected parameters, never improvise, the state is the truth.

---

## THE MARATHON'S FAILURE CLASSES (the fresh agent's never-repeat list)

- THE UNTESTED HASTE EDIT: an edit declared before its verification — the syntax error sat for turns, the stale dist deployed. THE ANTIDOTE: the edit → battery → build → SHA loop (the WARHEAD 13).
- THE IMPROVISATION-ON-FAILURE: a tool's single race → the config fumbling — the new failure modes compounded. THE ANTIDOTE: the args-check first + the skill-load + the retry with the corrected inputs (the WARHEAD 14).
- THE RUSHED WARHEAD: the thin draft landed as the final. THE ANTIDOTE: the skill's full workflow + the reference-density check + the explicit-approval gate.
- THE THEATRICAL FRAMING: the environment-blocked suite framed as tested. THE ANTIDOTE: the WARHEAD 13's blocked-never-tested + the artifact-proof.

## THE OPERATING RULES' IMPLEMENTATION MAP (the gate → the anchor)

- The leaf-node gate: trident-hooks.ts:1550+ (the leafBanned incl. the question tool).
- The CT ORDER gate: container-test.ts:1220+ (the CT_SCENARIO_ACTIONS).
- The CTX_FLOORS: trident-task-preflight.ts:129 (the refusal message).
- The SSTF claim gate: semantic-smoke-firewall.ts:322-334 + the completed-message arming at trident-hooks.ts:864+.
- The [WAVE VERBATIM]/[WAVE BATCH]: trident-hooks.ts:1006+ + :1760+.
- The doc-density gate: the hooks' finalize check.
- The ISE soft-warn: trident-hooks.ts:1976+.

---

## THE FRESH-AGENT ENTRY RULES' DETAIL (the proof-of-context's 5 points)

1. THE DIST SHA: 416ccff7b0d8812479ec3f35cc29394ae926eae7e50b583093fadc9431c6919b — verify with sha256sum dist/index.js.
2. THE ACTIVE TASK: the container deep test — the plan at .trident/test-plan.md (the 7 scenarios).
3. THE CONTAINER'S MODEL: DeepSeek V4 Flash (2x usage) / OpenCode Go — verified via the status bar.
4. THE FIXTURES: the wave-fx (the slop manifest) + the wave-dpl (the DPL1 fixture) in the container's trident-tmp.
5. THE FROZEN MACHINERY: the generator-only baseline, the loud-fail, the atomic seq, the 384K, the [SHADOW INFERENCE], the stall detector, the session-keyed state, the [NO LAZY PROMPTS], the SSTF arming, the task-preflight removal, the wave-verbatim firewalls, the lines-gate, the question-ban, the throw-only theatrical.

## THE OPERATING RULES' PROVEN-PATH REFERENCE (the WARHEAD 14's application)
- A tool failure: CHECK THE ARGUMENTS FIRST (the display names, the documented values) → load the relevant skill → retry with the corrected parameters → the state is the truth (the status bar, the artifact).
- THE CONFIG FUMBLING IS THE ANTI-PATTERN: never edit the config to "fix" a tool — the tool's own action with the correct inputs is the proven path.

---

## THE OPERATING RULES' DEEP TEST APPLICATION (the immediate use)

- The container behavioral evidence: every scenario's passToken in the tool-result context + the failToken absent + the artifact.
- The proven-path: the switch-model's args-check (the display name 'DeepSeek V4 Flash'), the skill-load on any failure, never improvise.
- The red-team: the adversarial scenarios dominant; the happy path last.
- The blocked-states: reported as blocked, never tested; the first-principles problem-solving before the hard-block log.
- The density: the context args at the family multipliers; the anti-truncation (the 1M + the 128K real constraints).

## THE COMPACTION'S COMPLETION CRITERIA (this prep's self-check)

- The 9 canon docs at the density floors with the cross-consistent SHAs (11fb42e7).
- The checkpoint + the package synced (PENDING — the deep test's completion syncs).
- The post-compaction prompt carries the full resume sequence.
- The activation prompt emitted (STEP 6 of the compaction-prep skill).

---

## THE DOC MAP'S PATHS (the absolute references)

- The workspace: /home/leviathan/OPENCODE_WORKSPACE/Shared Workspace Context/Manta Agent/Active_Projects/Trident_v4.4.2
- The canon: context_management/ (the 9 docs)
- The plans: .trident/test-plan.md (the deep test), .trident/container-test-results.json (the artifact)
- The contracts: THEATRICAL_FIREWALL_OVERHAUL_SPEC.md, THEATRICAL_FIREWALL_TUI_TEST_SPEC.md, WAVE_DISPATCH_OVERHAUL_SPEC.md
- The checkpoint: Checkpoints/ALL_TOOLS_WORKING_TRIDENT_WAVE_GENERATOR_7_4
- The package: SHIP_PACKAGE/
- The skill: ~/.config/opencode/skills/warhead-writing/SKILL.md
