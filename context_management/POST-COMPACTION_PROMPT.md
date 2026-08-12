# POST-COMPACTION PROMPT — THE FRESH AGENT'S ENTRY (2026-08-10 — the FULL-TEST + FIXES session)

**READ THIS FIRST. THIS IS THE MISSION.**

## THE PROJECT
/home/leviathan/OPENCODE_WORKSPACE/Shared Workspace Context/Manta Agent/Active_Projects/Trident_v4.4.2/
(the workspace root /home/leviathan/OPENCODE_WORKSPACE/ is the OLD v4.3 tree — IGNORE its src).
The canonical ship: /home/leviathan/OPENCODE_WORKSPACE/Shared Workspace Context/Trident_Agent/Ship_Packages/TRIDENT_V4.4.2_LEXICON_PROMPTFILE_KEYFIX/

## THE STATE (verified 2026-08-10 — THE WAVE-BATCH FALSE-POSITIVE FINAL — dist 6b7024d5)
- **THE DIST: 6b7024d52e27db65349b95c95e61366f3e2999723148e8df56be9fb259336faa** — the FINAL (the atomic wave-dispatch registry design; 432 modules). tsc 0. THE BATTERY: 707/10/2628/717 (the 10 = the immutable stale Checkpoints). The four-way 1 unique.
- **THE FINAL DESIGN — THE ATOMIC WAVE-DISPATCH REGISTRY:** the generator writes .wave-registry-<waveId>.json = { wave, total, calls, windowStart: null }; the gate's SYNC read-modify-write (the event-loop atomicity) — the batch's N calls append + PASS within the 60s window (opens on the FIRST call); the next-turn one-at-a-time derailment → the expired-window block; the stale wave (no registry) → the REGENERATE directive; the re-fired call → the 'already recorded' block. THE CONTAINER-PROVEN (closeout-ct): S2 the batch dispatch PASSED (the 2-call batch, the registry 2/2, NO [WAVE BATCH], the tasks ran) — THE FALSE POSITIVE IS DEAD. The re-fire ENOENT (the wipe's closed loop). The stale blocked with the named remedy. The wipe fires on every task's completion.
- **THE RED-TEAM'S LIVE FINDS (fixed in 6b7024d5):** the single-agent-wave shape (the agents.length filter skipped 1-agent wave-level manifests — the file-name discriminator), the sha-matched wave lookup (the same-name cross-wave collision), the wave-record hygiene (the 1h + cap-20 prune), the verbatim's stale-clause, the config-lock's read-verb widening, the messages' batch-process wording.
- **THE HOST: STALE** (runs 4c50e0a4 or earlier) — the deploy of 6b7024d5 is the operator's action (the ship's dist/index.js → ~/.config/opencode/plugins/trident/dist/index.js).

## THE FIXES LANDED + PROVEN (this session)
1. **THE WAVE-GENERATOR GENERATION FIX (the AGENT PARTIAL root cause)** — shadow-runner.ts: the validation-feedback loop (each failed candidate's NAMED deficiencies feed the next continuation — "THE VALIDATION FAILURES: ... REWRITE THE COMPLETE PROMPT with the template structure"), the drafting-scratchpad strip in extractFinalPrompt, PI_MAX_ROUNDS 4→6. PROVEN LIVE: the mission that failed 3× generated clean (failed: [], status ok).
2. **THE T.E.A. WIPE REWIRED TO THE TASK TOOL** — the wipe fires on the task's completion with the exact prompt-file match on the task's input (the dispatched file dies exactly when the task that consumed it completes). The generator NEVER wipes (the "files were wiped" + the survive messages removed). PROVEN LIVE: agent-1.md present pre-dispatch → GONE post-completion.
3. **THE ANTI-CUCK SUFFIX REMOVED FROM ALL THE FIREWALL MESSAGES** (the misread mandate corrected — the warhead now states the trigger scope: only the shrink-reflex-class blocks).
4. **THE WARHEADS CLEANED (warhead-writing skill):** the headers name-only (no dates/parentheticals/quotes), the LIVE EVIDENCE bullets removed, WARHEAD 15 = **DON'T BE A CUCK LAW** (all are laws), the skill's own "name + the date" rule cleaned to "name only". The ISE doc MOVED to /home/leviathan/OPENCODE_WORKSPACE/Shared Workspace Context/KNOWLEDGE_LIBRARY/Bibles/INTELLIGENT_SYSTEMS_ENGINEERING_T1.md + the WARHEAD 9 pointer carries the full path.
5. **THE FIREWALL MESSAGES WARHEAD-GRADE (< 90 tokens each):** [NO LAZY PROMPTS] ~49, [WAVE VERBATIM] ~44, [WAVE BATCH] ~55, [TASK FIREWALL] ~16+dynamic, [ESCALATE] ~25 ("RUN trident-wave-generator ONCE + dispatch its batch verbatim. Non-negotiable."), [WAVE AUDIT GATE] ~66 (was 337).
6. **THE BATCH PROCESS (the terminology lock):** the batch = the message (2-25 tool calls as the parts of ONE message, executed concurrently — the runtime's native parallel channel). HOW_TO_BATCH.md at the project root. WARHEAD 16 + WARHEAD 11 carry the doctrine. The wave generator's batch form's tools array maps 1:1 to the message's tool parts.

## THE RESUME SEQUENCE
1. **DEPLOY 42de956e** (the ship's dist/index.js → the host plugin) — then the host tests run on the latest.
2. **THE OPEN ITEMS** (the task queue — trident-task-queue): (a) THE DEFAULT-NAME COLLISION — the generator defaults to 'agent-N' when the name field is omitted + the names collide across waves (an external 3-agent wave's agent-1 file was overwritten) — the fix: the generator requires/derives a unique name; (b) the container suite re-run vs 42de956e (theatrical-fw-ct — the S2 anti-cuck probe + the message-text probes); (c) the wave-generator failure log's remaining work (the post-composition validator's generator-side land — the shadow's drafting is now stripped + fed back, but the failure log's work order items should be closed against the current code); (d) the batch-tool's model-surface question (the harness lacks the batch tool — the one-message channel is the batch — the batch-tool.ts module exists in the src but the runtime doesn't expose it — do NOT chase; the one-message channel is sanctioned); (e) the code-audit tool's LSP overhaul (item 21 — the audit engine consumes the tsc diagnostics); (f) the wave-audit gate's write-tool stitching (item 14 — the gate should only gate the shipping surface); (g) the firstDispatchTs persistence verification (item 20).
3. **THE RUNNING DOCS:** DEBUG_LOG_V3.md (F-27..F-31 appended) + BUILD_REPORT_V3.md — APPEND-ONLY. The canon docs' SHA cross-consistency at every build.

## THE OPERATOR'S RULINGS (the law)
- THE CONTAINER IS FOR TESTING NOT FOR BUILDS — host-side builds/copies only.
- BATCH BY DEFAULT — every execution is a batch (2-25 calls in ONE message); the sequential exception = only a true data dependency.
- THE BLOCK IS THE WORK ORDER — a firewall block's remedy is executed AUTONOMOUSLY + COMPLETELY in the same turn.
- The warhead-writing skill: the headers carry ONLY the name; no operator quotes, no session records, no dates.
- The firewall messages: warhead-grade, < 90 tokens, proper English, no slop.
