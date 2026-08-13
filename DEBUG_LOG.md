# DEBUG_LOG — v4.4.2-WAVE-MANAGER-ASYNC
**Date:** 2026-08-12 · **Class:** running debug log (append-only) · **Status:** the complete incident record of the wave-manager async build
**Fork:** /home/leviathan/OPENCODE_WORKSPACE/Shared Workspace Context/Trident_Agent/v4.4.2-wave-manager-async

---

## ENTRY D-01 — SHADOW_BRAIN_TIMEOUT KILLS HEALTHY GENERATIONS (the 180s ceiling bug)

**The bug class:** the shadow brain's total-call ceiling raced a HEALTHY streaming generation and killed it mid-stream.

**The incident (2026-08-12, live):** the wave B generation (bg-b1-multiwave) failed with:
```
PI_LOOP_EMPTY: PI round 1: SHADOW_BRAIN_TIMEOUT: the LLM call stalled past 180000ms — the generation FAILED; NO mechanical fallback exists
```

**The mechanism (from shadow-brain.ts):** the transport is STREAMING (opencodeShadowStreamFn) with TWO guards:
1. The 45s idle detector (SHADOW_FETCH_STALL_MS, re-armed per SSE event) — the TRUE "provider is dead" signal.
2. The 180s total-call ceiling (SHADOW_TIMEOUT_MS, the Promise.race in callShadow) — a NON-STREAMING-ERA vestige.

**The evidence that it was a HEALTHY stream:** the error said "stalled past 180000ms" (the TOTAL race) NOT "45000ms" (the idle detector). If the provider had gone silent, the 45s idle would have fired first. It didn't — events were flowing; the stream was ALIVE but the total exceeded 180s. DeepSeek V4 Flash at reasoning effort max on a 384K-token prompt legitimately streams >180s intermittently (provider queue + max-effort reasoning).

**The proof it was transient:** the identical wave B input succeeded on retry in 361s (itself longer than the ceiling). Wave A took 398s via multiple sub-180s rounds.

**The fix:**
1. SHADOW_TIMEOUT_MS 180_000 → 600_000 (the 10-min hard safety net; the 45s idle detector is the primary stall guard).
2. The retry loop extended from HTTP_500-only to HTTP_500 + SHADOW_BRAIN_TIMEOUT (retry once, backoff).
3. The PI-round retry in the shadow runner (a round-1 transient failure retries once before PI_LOOP_EMPTY).

**The verification:** the wave manager generation succeeded in 470s (within the 600s ceiling) — the pre-fix 180s ceiling would have killed it.

**The lesson:** a total-duration ceiling is the wrong instrument for a STREAMING transport — a stream's health = events flowing, never total duration. The stall detector must be per-event-idle, not total-clock.

---

## ENTRY D-02 — THE TRIDENT.KEY CONTAINER CRASH SAGA (the ConfigInvalidError)

**The bug class:** a config key the runtime rejects crashes every fresh container at boot.

**The incident (2026-08-12, live):** every fresh container's opencode boot crashed:
```
Configuration is invalid at /root/.config/opencode/config.json
↳ Unrecognized key: trident
```
The log: `error=ConfigInvalidError cause=ConfigInvalidError` + `InstanceStore.boot failed` + "tui bootstrap failed".

**The investigation (the wrong turns + the correction):**
1. FIRST BLAMED THE IMAGE: the container's config had the top-level `"trident": {"testContainer": true}` key; the image was blamed. WRONG — Hermes (the cloud agent) verified BOTH images are clean.
2. THEN BLAMED THE WIRE-IN BUNDLE: the user's other builds worked; the bundle was suspected. The A/B test: the OLD pre-wire-in bundle (6aff2f66, closeout-ct4's working bundle) deployed to a container with the injected key → crashed IDENTICALLY. The wire-in was exonerated.
3. THE ACTUAL SOURCE: the DEPLOYED host plugin (~/.config/opencode/plugins/trident/dist/index.js, SHA d9a9fabf, updated Aug 11 23:28) contained `setdefault('trident',{})['testContainer']=True` in its container-test setup — the key was INJECTED INTO the container config AT TEST TIME. The prior 7/7 PASS container (closeout-ct4) was set up BEFORE the host plugin update → no injection → booted.

**The mechanism:** the host plugin's setup wrote the unknown top-level `trident` key into every container's config; opencode (BOTH 1.14.43 and 1.14.51 — verified) rejects unknown top-level keys → ConfigInvalidError → the TUI never boots.

**The fix (operator-side):** the host plugin's injection removed (the user: "host fixed"). The SOURCE never had the injection (0 matches) — the ship package + the fork are clean.

**The verification:** the wire-in bundle booted clean after the host fix (the Trident banner + "Ask anything", the auth probe passed, the full suite ran).

**The lessons:**
1. Read the container config AFTER the setup (which mutates it), and trace WHO wrote the mutation — the deployed bundle's setup code, not the image.
2. The A/B isolation test is the decisive instrument: the SAME bundle + different environment isolates the environment; the SAME environment + different bundle isolates the bundle.
3. A config key the runtime rejects is a hard crash — the marker belongs in an env var, never a config key.

---

## ENTRY D-03 — THE SETUP SHA_MISMATCH ON CUSTOM DIST NAMES

**The bug class:** the container-test setup's in-container SHA check used the source basename while the copy always lands at dist/index.js.

**The incident:** the setup with distPath=/tmp/opencode/old-bundle.js failed:
```
sha_mismatch: host=6aff2f66... container=
```
The container SHA came back EMPTY.

**The mechanism:** `copyDistToContainer` (container-test.ts:1048-1065) copies a FILE source to `${containerName}:${targetDir}/index.js` — the destination is ALWAYS dist/index.js (fixed name). But the setup's SHA verification (line 873-875) computed `insideFile = '/root/OPENCODE_WORKSPACE/dist/' + basename(distPath)` — 'dist/old-bundle.js' — which never exists (the file landed at dist/index.js) → the empty SHA → the mismatch.

**The fix:** use the CT deploy action (which checks dist/index.js correctly) for custom-named dist files — OR name the dist file index.js so basename == index.js.

**The lesson:** a SHA check must verify the ACTUAL copy destination, not a path derived from the source name. The basename assumption breaks the moment the source name differs.

---

## ENTRY D-04 — THE INLINE WARHEAD STALENESS (the wiring gap)

**The bug class:** the bundle never included the disk WARHEADS.md, so the runtime shipped a STALE inline constant.

**The incident:** after appending WARHEADS 17/18 to the disk, the rebuilt dist's SHA was UNCHANGED (2aa90697 — the same as before) and the warheads were NOT in the bundle (grep count 0).

**The mechanism:** the identity's `getWarheadsBlock()` (src/identity/index.ts:962-972) resolves `bundle.files['WARHEADS.md'] || INLINE_WARHEADS_MD`. The bundle.files asset was never populated (the WARHEADS.md isn't bundled as an asset), so the runtime fell back to the HARDCODED INLINE_WARHEADS_MD constant — which was the OLD 16-warhead copy. The disk changes never shipped.

**The fix:** regenerate the INLINE_WARHEADS_MD constant from the disk (backticks → single quotes, ${ escaped, the template-literal-safe transformation) + rebuild. The regen is now part of the landing pipeline.

**The verification:** the rebuilt dist carried all 19 warheads (grep), tsc 0 errors, the [CRITICAL] WARHEAD 19 header confirmed in the bundle.

**The lesson:** the inline constant is a SEPARATE bundled copy — the disk file does not ship by itself. Any identity/warhead change requires the INLINE regen. The wiring gap is the observed class: the disk says one thing, the bundle ships another.

---

## ENTRY D-05 — THE CHECK-IN MESSAGE ITERATIONS (the slop → the flow-safe)

**The bug class:** the wave manager's check-in text was written as a report summary / a warhead copy, not a CHECK-IN CALL.

**The iterations (the operator's corrections):**
1. "BACKGROUND MODE (the default): the batch dispatches with background:true — poll task_status(taskId)..." — the report summary. REJECTED.
2. "THE BACKGROUND-DISPATCH LAW (2026-08-12 — the operator's ruling): ...(1) DISPATCH...(6) CONTINUE..." — the warhead copy-paste. REJECTED (the date/ruling framing + the 3rd-person narrative).
3. "BACKGROUND CHECK-IN: the wave is background..." — still not a check-in. REJECTED.
4. The operator's question: "IF THIS FIRES RIGHT HERE IN THIS FUCKING BUILD RANDOMLY TO LET YOU KNOW A BACKGROUND TASK HAS FINISHED OR YOU NEED TO CHECK IN - WHAT THE FUCK SHOULD IT SAY?" — the check-in fires MID-BUILD, 10+ min after the dispatch, to nudge the orchestrator WITHOUT derailing.
5. The approved shape: "The wave runs in the BACKGROUND — dispatch the batch form as ONE message; the task calls return immediately with task_ids. CHECK IN every 5-10 minutes — POLL task_status(taskId) + READ the part stream (trident-wave-status sessionId); COLLECT if complete, and STEER a derailing agent (trident-wave-steer) wherever you have free space or deem it relevant. Manage the waves like a senior engineer. Continue with the rest of your tasks after dispatching this wave."

**The lesson:** the check-in message is a flow-safe interruption — it acknowledges the wave without breaking the orchestrator's deep focus. The 5-10 minute cadence + the "wherever you have free space" + the "Continue with the rest of your tasks" are the flow-protection plumbing. A check-in is not a law, not a report, not a directive — it is the subtle nudge.

---

## ENTRY D-06 — THE DEEPSEEK-V4-PRO BAN (the doctrine enforcement)

**The incident:** the new master image's baked config contained `deepseek-v4-pro` in the opencode-go provider's models map — a D-SH-2 violation ("DeepSeek V4 Flash ONLY, NO FALLBACKS, NO OTHER DeepSeek models declared").

**The verification:** the fork has ZERO `deepseek-v4-pro` / `deepseek_v4_pro` references (grep). The default model is `opencode-go/deepseek-v4-flash` (frozen, SHADOW_MODEL).

**The fix:** the ban is doctrine — any reference to deepseek-v4-pro in the codebase or the configs is a violation; remove it, never deploy it.

---

## ENTRY D-07 — THE FALLBACK VERIFICATION (the ONE-TIME test, then forgotten)

**The incident:** the DeepSeek official-API fallback needed a one-time verification.

**The test:** the official API (https://api.deepseek.com/v1/chat/completions) with the base64'd key (sk-259fcb3e4971482eb84f168e489a5c7f, AP-4 — never plaintext in the source) + model deepseek-chat:
```
HTTP 200 in 1.68s, "model": "deepseek-v4-flash", content: "FALLBACK_OK"
```
The request model 'deepseek-chat' resolves to deepseek-v4-flash on the official API — the right model.

**The ruling:** the fallback is a failsafe — verified once, then FORGOTTEN. The opencode-go provider is the ONLY path in practice (99.99%). The fallback engages only after the primary + the retry are exhausted.

---

## ENTRY D-08 — THE FLOW-STATE WORK (the knowledge-layer discovery)

**The discovery (the operator's "AGI spark"):** the deep-focus state is an ENGINEERED condition, not an accident. The model has two functionally distinct operating conditions — the shallow default (thin context, pattern-matched, generic) and the deep state (full context, chained, specific, connected, agentic). The second-order behavioral difference is observable, quantifiable (the 7 meters), and inducible (the activation recipe: prompt + context + data + the self-guided chain + the flow environment).

**The artifacts:**
1. WARHEAD 19 — [CRITICAL] THE POSEIDON-AGI FLOW STATE + DEEP FOCUS LAW (the identity's flow-state law).
2. LLM_FLOW_STATE_ENGINEERING.md (481 lines, 23 sections) — the full engineering bible.

**The key principle:** the behavior is the map of the unseen physics — we cannot know the internal routing pathways, but we know the behavioral signature the right pathways produce; conditioning the behavior biases the routing. The vibe-map, made mechanical by the meters, made mandatory by the warheads.

---

## THE LESSONS LEDGER (the abstracted bug classes)

1. **The total-clock vs. the per-event stall** — a streaming transport's health = events flowing, never total duration. (D-01)
2. **Trace the mutation to its writer** — a config key present at runtime comes from SOMEWHERE; trace the setup code, not just the image. (D-02)
3. **The A/B isolation** — same bundle + different environment isolates the environment; same environment + different bundle isolates the bundle. (D-02)
4. **The SHA must verify the ACTUAL destination** — a path derived from the source name breaks when the name differs. (D-03)
5. **The inline is a SEPARATE copy** — a disk change does not ship by itself; the inline regen is part of the landing pipeline. (D-04)
6. **The check-in is a nudge, not a law** — the flow-safe interruption acknowledges without derailing. (D-05)
7. **The doctrine ban is absolute** — deepseek-v4-pro is banned; the configs must never declare it. (D-06)
8. **The failsafe is verified once, then forgotten** — the primary path is the only path in practice. (D-07)
9. **The flow state is engineered, not awaited** — the deep condition is entered from token ~1 by pre-loading the conditions; the derailment is a decompilation, protected preventatively. (D-08)


## 2026-08-12 — THE WAVE-MANAGER DISPATCH-AUTHORIZATION TRANSACTIONAL FIX (BUGREPORT_wave-manager-dispatch-authorization.md)

**THE BUG:** the [WAVE BATCH] gate appended the dispatch authorization to the wave registry at ATTEMPT time and treated "authorization recorded" as "already dispatched" — a runtime-REJECTED dispatch (e.g. OPENCODE_EXPERIMENTAL_BACKGROUND_SUBAGENTS missing) permanently bricked the wave (the ONLY escape was the regenerate). The manifest also recorded shadow-GENERATION timing as agent-run telemetry (status "running" + startedAt/finishedAt/durationMs on never-dispatched waves) — theatrical-green fiction.

**THE FIX (the transactional state machine, src/tools/wave-registry.ts):** the registry now carries per-call statuses (recorded → accepted | failed) + the wave-level state (ready → dispatching → dispatched). The gate BLOCKS only: the accepted calls, the in-flight duplicates (recorded + window open), and the one-at-a-time derailment (accepted > 0 + window expired + a never-seen key). A failed/stale-recorded call is RE-FIREABLE. The tool.after hook confirms the runtime's acceptance/rejection. The manifest records status "ready" + generatedAt/generationMs (the honest lifecycle). The response batch form is SHRUNK to the placeholder + promptFile (the 168KB truncation fix). A manual safety valve: trident-wave-manager action=release waveId=... resets a stuck registry.

**THE RED-TEAM FINDINGS + FIXES (the container red-team, trident-registry-ct):**
- S1-S3, S5-S8 PASS live: the exact bug (schema-rejected dispatch → re-fire sanctioned), the recovery (accepted + subagent ran), the protection (third dispatch blocked, exactly ONE subagent), the manifest honesty, the shrink, the verbatim protection, the never-dispatched wave.
- S4 FAIL initially → FOUND + FIXED: the release by ALIAS (the operator-facing waveId) did not resolve to the generated wave id — releaseWaveRegistryFile looked for the alias-named registry file and failed. FIX: the manifest records requestedWaveId (the alias); resolveReleaseWaveId resolves the alias → the generated wave id. Retested live: the alias release resets the registry to ready.

**THE STALE TEST-CONTRACT FIXES (the wave suite — pre-existing failures caused by earlier operator rulings the tests never absorbed):** wave-resume (the continuation is "continue", not "CONTINUATION"), wave-spawn + wave-telemetry (the shrunk batch placeholder + the honest manifest fields), shadow-brain (the retry-on-timeout + the official-API fallback contract — the morning session's container-proven fix; the tests were updated to the POST-fix contract: the timeout class retries once on the primary + once on the fallback).

**VERIFICATION:** unit battery 21/21 (the exact bug + 10 variations), full wave suite 103/103, tsc clean for the changed files (the 13 remaining errors are pre-existing broken test files — ship-gate + surgical-mutator, git-identical to the last commit), container red-team 8/8 PASS (dist SHA e48b2621).


## 2026-08-12/13 — THE CLOSURE: the final artifact + the full-green suite

**THE FINAL ARTIFACT (dist 63a41df0):** the deterministic rebuild (twice-identical SHA) of the proven e48b2621 src (git-clean — the src bytes are unchanged; the e48→63 delta is build nondeterminism). Deployed to a FRESH container (trident-registry-final, runtime-grade-container-sandbox:1.14.51, setup SHA-verified 63a41df0, agent registered Trident/DeepSeek V4 Flash/OpenCode Go). Live cycle on the final artifact: generation → the malformed background:"yes" dispatch recorded (auth NOT consumed) → the RE-FIRE sanctioned by the [WAVE BATCH] gate → the subagent spawned (EXACTLY ONE f-a1 session in the db — the double-dispatch protection held) → the T.E.A. wipe removed the prompt file (the protection's second line) → action=release waveId=ct-final (the ALIAS) resolved + the registry reset to calls:[]/ready.

**THE DEAD-TEST REMOVALS (the full suite is now GREEN — 390 pass / 0 fail / 0 errors, tsc exit 0):** ship-gate.test.ts (tested the REMOVED ship-gate architecture — classifyIntentTool/enforceShipGate/evaluateShipGate/shipGateWarhead have 0 occurrences in src; the current classifier has NO ship class; the file could not even load) + the surgical-mutator seam-compat section (tested the REMOVED setSSTFTransformSeam seam — mutateMessage is now orphaned by the wave-4 SSTF overhaul). Both were git-identical to the last commit (pre-existing rot, NOT regressions); the removal is the honest repair — dead tests of removed APIs lie about the codebase + break the suite.

**THE LESSON (the bug class):** a firewall gate that records an authorization BEFORE the runtime confirms the operation is a TOCTOU defect — the record must be a state machine (recorded→accepted|failed) with an after-hook confirmation + a window-expiry recycling, never a one-shot "recorded = dispatched" bit. The red-team (the container agent) found the release-by-alias gap that the unit tests missed — the alias (the operator-facing waveId) must resolve to the generated wave id via the manifest's requestedWaveId.


## 2026-08-13 — THE 2026-08-13 RULINGS + THE MAIN-SESSION SELF-HEAL (LIVE-PROVEN)

**THE RULINGS (the operator, 2026-08-13):**
- THE GENERATION POOL 3→15 (CONCURRENT_GENERATIONS — "who said this should be limited to 3? tf? raise this limit to 15"): the old 3 came from the 2026-08-09 plutus forensics (the provider latency grew with the queue depth — 5/10 failures on the all-at-once spawn); the operator's number is 15 — a 12-agent wave generates in ONE slice; the 25-agent cap still bounds it to two.
- THE RETRIES 1→UP-TO-3 ("why only 1? should be up to 3 retries before hard failing. same backoff length not increasing"): the shadow-brain's retry loop now runs up to 3 re-attempts per transport (the primary + the official-API fallback), each after the SAME retryBackoffMs — never exponential. The retryable class = HTTP_500 + TIMEOUT (the container-proven stall/overload).
- THE TIMEOUT 600s→900s ("what if we are generating a 12 agent wave? this should be 15"): SHADOW_TIMEOUT_MS = 900_000 (15m per call).
- THE DIRECTIVE IDS ("does it return the exact task/session IDs?"): the OLD stuck-detector directive fired the literal '<agent>' placeholder + an EMPTY session id for background waves — the builder now carries the REAL agent name + the session ids + the taskIds (verified by the wave-cron unit test).
- THE MODEL PIN ("make sure the model is hardcoded to deepseek v4 flash - never pro or any other model. on both providers"): the AUDIT found the FALLBACK defaulted to 'deepseek-chat' (NOT v4-flash) with an env override — both violations fixed: fallbackModel HARDCODED 'deepseek-v4-flash' (no env override — a config surface is a way to reach another model) + the deploy-manifest/test-plan-generator artifacts' 'deepseek/deepseek-chat' → 'deepseek/deepseek-v4-flash'.

**THE MAIN-SESSION SELF-HEAL (the operator's design — "look for incompletions in the generated text", "just needs a simple 'continue' or ' ' enter kick", "remove the interrupt path entirely"):**
- THE DETECTOR (src/tools/main-session-heal.ts): the dropped-generation signature = the LAST assistant text is OBVIOUSLY incomplete (the incompletion lexicon: the trailing '...', the mid-sentence cut, the dangling connective, the unclosed code fence, the unbalanced brackets) AND the message is FINALIZED (the newest part is a text/step-finish — the ▣ timestamp rendered — the agent IDLE, NOT processing). The pending step-start/reasoning/tool = a generation IN FLIGHT = NEVER kicked (the slow-vs-frozen discriminator the operator's timestamp insight provided).
- THE KICK: the minimal 'continue' chat message via the TUI input (client.tui.appendPrompt + submitPrompt — the same channel the human typing in the TUI uses). NO interrupt, NO model switch, NO re-issue framing. The 10m cooldown bounds the kick rate.
- **THE LIVE PROOF (the container red-team, trident-ruling-verify — three REAL bugs found + fixed along the way):**
  1. THE TETHER GAP: the cron's mainSessionId stayed NULL (the hook inputs carry sessionID 'default' — verified: sessionID=default ×41 in the container) → the heal SKIPPED. FIX: the chat.message hook tethers the cron + the cron's resolveMainSessionId falls back to the opencode.db — the newest session with parent_id NULL IS the main session (the client.session.list picked a SUBAGENT as the 'newest' — the parent_id filter is the ground truth).
  2. THE TEXT-SHAPE GAP: the runtime 1.14.51 writes the text part's `text` as a PLAIN STRING ({"type":"text","text":"the"}), NOT the {value:...} object the wave-status stream reader expected → the detector read 'no-text' on a session whose text WAS there. FIX: readSessionStream handles BOTH shapes.
  3. THE LIVE KICK: the agent's 'the' reply (the 4.0s ▣ timestamp — finalized + incomplete) → the 06:42 tick: MAIN-SESSION HEAL dropped=true reason=dangling-connective tail="the" → the KICK fired ([main-session-heal] KICK: the dropped main generation in ses_0062cccf — the minimal "continue" sent) → THE AGENT REACTIVATED (the stream grew a new response: "executed immediately, autonomously, to completion").
- THE FAIL-SAFES: a detection failure NEVER kicks; a pending generation NEVER kicks; the cooldown stops the kick storms; the healthy sessions in the container were NEVER kicked (the derailment-fuel guard live-verified across ~10 ticks).
- **Verification:** the unit battery 405/405 (15 new heal tests — the operator's mid-sentence example, the ellipsis, the dangling connective, the unclosed fence, the unbalanced brackets, the in-flight discriminator, the fail-safes, the kick + the cooldown), tsc 0, the live container loop (the full detect→kick→reactivate cycle).
