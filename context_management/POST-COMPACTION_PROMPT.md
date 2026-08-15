# POST-COMPACTION PROMPT — THE FRESH AGENT'S ENTRY SEQUENCE (2026-08-15)

**THE TRUE DIST SHA: `baaf776978b49506187016ff0adcca4ff956d5644ee76fbd67c47924bb5df432`.** THE BATTERY: 451/451 (28 files), tsc 0. THE CHECKPOINT: `Checkpoints/FULL_STACK_c2061233_2026-08-14/` (refreshed to ce0434ee). THE SHIP PACKAGE: `Ship_Packages/SHIP_v4.4.2-wave-manager-async_ce0434ee/` + the project `SHIP_PACKAGE/`. THE CONTAINER EVIDENCE: `.trident/container-test-results.json` (the 3-fix run 3/3 PASS).

**THIS DOCUMENT IS THE ENTRY PROMPT — paste this into the fresh session.** A fresh agent reading THIS doc + the reading-order docs knows EXACTLY what to build, what's verified, what's frozen, and how to prove it read the docs. ZERO questions. ZERO re-litigation. ZERO re-derivation.

---

## 1. THE MISSION (what to build next)

**THE SHADOW-BRAIN 3-FIX PLAN IS DONE. THE FIREWALL DISABLES ARE DONE. THE RAM-BOMB PREVENTION IS DONE.** The current build (dist ce0434ee) carries: the T.E.B. machine (the promptFile-only batch + the loader mutation + the deferred wipe), the shadow-brain 3-fix (F1 the measured stall window / F2 the backoff retry / F3 the density memory), the WARHEAD 20 (the ASCII-EXPLANATION LAW), the WARHEAD 21 (the MEMORY-EFFICIENT-DATA-RETRIEVAL LAW), the firewall disables (CTX-01 + VERIFY_INSPECT), and the memory-read lexicon (the intent-savvy RAM-bomb gate).

**THE IMMEDIATE NEXT WORK (the pending items):**
1. **THE HOST VERIFICATION OF THE LATEST DIST** — the operator deployed ce0434ee; this session must test everything directly (the T.E.B. dispatch, the memory-lexicon gate, the density memory, the measured window) + verify the deployed bundle carries all the layers (grep the markers: classifyMemoryRead, RAM_BOMB, MEMORY-EFFICIENT, CTX-01=0).
2. **THE ENGINE-LOG GATING (the documented follow-up)** — `/tmp/trident-engine.log` is 81MB (the tridentLog channel is separate from the gated hook-debug log). The hook-debug writes are gated + rotated; the ENGINE log needs the same treatment (the gate + the rotation) to prevent the NEXT multi-GB log.
3. **THE QUEUED #25 — THE FIREWALL-BACKEND INTELLIGENCE** (tagged firewalls,wave-manager,derailment,ux,batch-dispatch): the MPSE live failure showed the firewalls as dumb blockers — the block messages must carry the exact copy-pasteable call shape (the batch form's tools[0] parameters verbatim) so the model never reverse-engineers it; the batch gate must reconcile partial dispatches (1 running + 3 blocked → adopt-the-running + dispatch-the-rest); the missing-registry wave should derive the registry from the manifest. THE PRINCIPLE: a block whose remedy requires reverse-engineering is a block with a broken remedy.
4. **THE OTHER SESSIONS' FIREWALL-DISCRIMINATION PATCHES** — the CTX-01 + the VERIFY_INSPECT were disabled on THIS src (the false positives); the other sessions are patching the PROPER discrimination. When they land, re-enable the categories with the fixed logic.

**THE GATE:** GATE-1 (the operator's approval) is NOT required for the host-verification + the engine-log gating — those are the continuation of the approved build. GATE-2 IS required for #25 (the firewall-intelligence is a NEW architecture — the operator must approve the design before it ships).

---

## 2. THE WORKSPACE ROOT (absolute)

```
/home/leviathan/OPENCODE_WORKSPACE/Shared Workspace Context/Trident_Agent/Active_Projects/v4.4.2-wave-manager-async
```

**THE SHIP PACKAGE:** `/home/leviathan/OPENCODE_WORKSPACE/Shared Workspace Context/Trident_Agent/Ship_Packages/SHIP_v4.4.2-wave-manager-async_ce0434ee/` (the full deliverable: src + dist sha-verified + the canon docs + the logs + the manifest).

---

## 3. THE READING ORDER (read ALL before any code — each doc contains what's listed)

1. **`context_management/COMPACTION_SURVIVAL.md`** (203 lines) — the resume point: the operating laws (the full set with the rationale), the settled doctrine (each ruling verbatim + why), the state at a glance, the doc map, the fresh-agent entry rules. READ THIS FIRST.
2. **`context_management/DECISION_CHAIN.md`** (212 lines) — the doctrine/architectural decisions: D-37..D-41 (the T.E.B. machine, the deferred wipe, the simplified verbatim, the shadow-brain 3-fix plan, the firewall-intelligence gap) + the older D-1..D-36. The operator's rulings VERBATIM — never paraphrase.
3. **`context_management/BUILD_STATE.md`** (276 lines) — the current state: the dist SHA chain (c2061233 → d752ab3a → 0f14e9f5 → 6da09e90 → ce0434ee), the module inventory, the frozen machinery file:line list, the build command + the env.
4. **`context_management/CURRENT_STATE.md`** (204 lines) — the exact per-module state: what's built (with file:line + SHA), what's solid (with the proof), what's broken (with the failure mode), the proven-machinery inventory (what NOT to re-open).
5. **`context_management/NEXT_STEPS.md`** (223 lines) — the wave plan: the packages, the files to touch, the done-when criteria, the gate, the provider/model, the test plan, the risk register.
6. **`context_management/EVIDENCE_STATE.md`** (278 lines) — the verified evidence: the SHAs, the behavioral passTokens per scenario (the 3-fix 3/3, the T.E.B. dispatch, the CT-read 4/4, the memory-lexicon 22/22), the container-run provenance.
7. **`context_management/TASK_QUEUE.md`** (215 lines) — the gates' state, the active tasks, the completed tasks, the backlog (#25), the blocked items.
8. **`context_management/CHANGELOG.md`** (222 lines) — the per-session record: what was accomplished (with the evidence), what FAILED (with the root cause — the RAM bomb, the GLM derailment, the firewall false positives).
9. **`DEBUG_LOG_V6.md`** (the M1-M13 entries) — the running bug/fix/incident log: the RAM-bomb post-mortem (M12/M13), the GLM-derailment kill (M5/M6), the firewall disables (M11), the host verification (M10).
10. **`BUILD_REPORT_V6.md`** — the build records: the T.E.B. machine, the shadow-brain 3-fix, the WARHEAD 20/21, the firewall disables, the RAM-bomb prevention.
11. **`src/identity/trident/WARHEADS.md`** (the WARHEAD 1-21) — the operative laws. THE WARHEAD 20 (the ASCII-EXPLANATION — explanation requests open with the box-drawing diagram). THE WARHEAD 21 (the MEMORY-EFFICIENT — stat before ANY python read, the streaming tools for >100MB, `for line in open()` as the only safe in-memory read, the bounded windows, the resource caps, the instant kill).

**THE PROOF-OF-CONTEXT (the first action — BEFORE any code):** give a 5-line state summary naming FIVE specific things from the docs: (1) the current dist SHA, (2) the battery count + the tsc status, (3) the 3-fix plan's F1/F2/F3, (4) the two firewall categories disabled + why, (5) the memory-lexicon's intent classes. Then EXECUTE.

---

## 4. THE VERIFIED STATE (what's solid vs what needs fixing — do-not-re-litigate)

### THE SOLID (the proven machinery — VERIFIED, never re-open):
- **THE T.E.B. MACHINE** (wave-dispatch.ts:607-629 the promptFile-only emission + trident-hooks.ts the loader mutation): the batch emits `{ tool: "task", parameters: { description, promptFile, subagent_type } }` ONLY; the loader mutates promptFile → prompt byte-exact + background:true + strips promptFile before the tool runs. THE PROMPT NEVER PASSES THROUGH THE MODEL'S OUTPUT — the GLM compression derailment is structurally impossible. Container-proven (ct-revert-verify: the byte-exact 27179==27179 injection + the parentID lineage + the task_status running→completed). The deferred T.E.A. wipe (trident-hooks.ts:2536) fires only on the full-wave dispatch.
- **THE SHADOW-BRAIN 3-FIX** (shadow-health.ts the measured window + shadow-runner.ts:785-789 the backoff + wave-tracker.ts:59/wave-dispatch.ts:318-331 the density memory): F1 the measured stall window (avg × 3, [45s, 5m] — the 45s knife-edge dead); F2 the backoff retry (2× window + 3s gap, no provider/model switching — the operator's ruling); F3 the density memory (the DENSITY WARNING on the <0.7 re-gen). Container-proven (ct-3fix-full 3/3: the generation completes under the measured window + the DENSITY WARNING fires + the backoff wiring live). THE OPERATOR'S CONSTRAINT: "no model switching ever. provider as well only backup is direct deepseek api but this should NEVER BE USED unless there is a legit server failure of opencode go."
- **THE WARHEAD 20** (the ASCII-EXPLANATION LAW) — landed (disk + inline + bundle): explanation requests open with the box-drawing diagram + the full engineering detail.
- **THE WARHEAD 21** (the MEMORY-EFFICIENT-DATA-RETRIEVAL LAW) — landed: the RAM-bomb prevention's behavioral law.
- **THE MEMORY-READ LEXICON** (src/firewalls/memory-read-lexicon.ts — the intent-savvy RAM-bomb gate): the classifyMemoryRead state machine (the bible §1.2 PatternFamily + the Poseidon model): RAM_BOMB (block) vs SIZED_READ/LAZY_ITERATE/STREAM_TOOLS/NON_READ (allow). 22/22 pins. THE SIMPLIFIED MESSAGE: "[MEMORY GATE] inline read on an UNSIZED file (the RAM-bomb risk). SIZE FIRST: stat -c %s <path>; if >100MB use grep/tail/awk (streaming); python: for line in open() only."
- **THE FIREWALL DISABLES** — CTX-01 (the config fumbling — the tsconfig.json cp + the tee redirects false positives) removed from the pattern array (ct-anti-derailment.ts); VERIFY_INSPECT (the bundle-inspection-as-theater misread) dead (the `if (false && claimPending)` in semantic-smoke-firewall.ts). The OTHER categories (CTX-02..08 + INLINE_EXEC/HEADLESS/VERIFY_EXIST/HASH_AS_PROOF) stay LIVE.

### THE KNOWN-BROKEN / THE OPEN (what needs fixing):
- **THE ENGINE-LOG GATING** — /tmp/trident-engine.log is 81MB (the tridentLog channel, NOT gated — the hook-debug writes are gated but the engine log isn't). The next multi-GB log risk. THE FIX: gate the tridentLog debug-level writes + rotate at ~10MB.
- **THE QUEUED #25** — the firewall-backend intelligence (the block messages must carry the exact call shape; the batch gate must reconcile partial dispatches). GATE-2 required.
- **THE W-1 TRACKER GAP** — the wave manager's status shows sessionId "" for native-task spawns (the tracker propagation for task-dispatched sessions isn't wired — the #25 family).

### THE FROZEN MACHINERY (the do-not-touch):
- The T.E.B. machine's emission + loader (wave-dispatch.ts:607-629 + trident-hooks.ts the loader) — VERIFIED, the operator's spec, never re-open.
- The shadow-brain 3-fix (the measured window, the backoff, the density memory) — VERIFIED, never re-open.
- The WARHEAD 20/21 — the identity law, never re-open.
- The memory-read lexicon — VERIFIED, never re-open.
- The checkpoint `Checkpoints/FULL_STACK_c2061233_2026-08-14/` — the preserved state, treat as the reference (writable for the refresh, but never the working tree).

---

## 5. THE CRITICAL DOCTRINE (the operator's rulings VERBATIM — the canon)

1. **THE PROMPTFILE-ONLY BATCH** (2026-08-14): "the derailment was coming from this stupid placeholder prompt garbage the only thing the model should pass is the literal prompt file path generated by wave manager + subagent type and desc and thats it. the t.e.b machine handles the rest and converts it into whatever args the task tool needs in order to run" — the batch emits ONLY description + promptFile + subagent_type; the loader adds the rest.
2. **NO MODEL/PROVIDER SWITCHING** (2026-08-14): "no model switching ever. provider as well only backup is direct deepseek api but this should NEVER BE USED unless there is a legit server failure of opencode go" — the shadow-brain's backoff NEVER switches; the DeepSeek-direct backup is the never-used server-failure safety.
3. **THE FIREWALL DISABLES** (2026-08-14): "can you remove this config lock from the source here it is clearly broken... same w/ sstf" + "sstf im hesitant" — CTX-01 + VERIFY_INSPECT disabled on this src; the other sessions patch the proper discrimination.
4. **THE RAM-BOMB PREVENTION** (2026-08-15): the WARHEAD 21 + the memory-read lexicon + the gated/rotated debug writes. THE OPERATOR'S REBUILD DEMAND: "this needs a proper intent savvy lexicon per the bible like the poseidon intent gate does and doesnt start misfiring constantly" — the memory gate is the typed PatternFamily + the state machine, not a regex tower.
5. **THE SIMPLIFIED MESSAGE** (2026-08-15): "simplify the error message dont write in slop this should be universally applicable and not derail anything" — the memory gate's message is the concise universal form.
6. **THE CHECKPOINT LAW** (2026-08-14): "start actually preserving checkpoints on this build" — every milestone saves the checkpoint.
7. **THE CONTAINER-FIRST RULE**: "NO HOST DEPLOY TILL EVERYTHING IS PROPERLY CONTAINER TESTED" — the host deploy only after the full container verification.

---

## 6. THE BUILD PLAN (the waves)

### WAVE A — THE HOST VERIFICATION (the continuation — GATE-1 not required)
- THE MISSION: test everything on the deployed dist ce0434ee — the T.E.B. dispatch (generate → the 3-field batch → the native task dispatch → the byte-exact injection → the deferred wipe), the memory-lexicon gate (the bomb blocked + the safe reads allowed), the density memory, the measured window. Verify the deployed bundle's markers (classifyMemoryRead, RAM_BOMB, MEMORY-EFFICIENT, CTX-01=0).
- THE FILES: none to change — pure verification.
- THE DONE-WHEN: the host tests all pass + the deployed-bundle markers verified.
- THE TEST PLAN: the container-testing skill protocol (the plan-first, the behavioral passTokens).

### WAVE B — THE ENGINE-LOG GATING (the follow-up — GATE-1 not required)
- THE MISSION: gate + rotate the tridentLog debug-level writes (the 81MB engine log — the same treatment as the hook-debug writes).
- THE FILES: src/utils.ts (the tridentLog implementation — add the TRIDENT_DEBUG gate + the ~10MB rotation).
- THE DONE-WHEN: the engine log stops growing without the debug flag + rotates at 10MB with it; the battery + tsc green.
- THE RISK: the tridentLog is used by EVERY module — the gate must be a no-op for the ERROR/WARN levels (only the DEBUG level gated), never a silent failure (the loud-fail law).

### WAVE C — THE QUEUED #25 (the firewall-intelligence — GATE-2 required)
- THE MISSION: the block messages carry the exact copy-pasteable call shape; the batch gate reconciles partial dispatches; the missing-registry wave derives the registry from the manifest.
- THE GATE: GATE-2 (the operator's approval of the design) required BEFORE the implementation.
- THE DONE-WHEN: the MPSE live failure's reproduction (the 4-agent wave with the 1-running + 3-blocked fragmentation) is reconciled cleanly.

---

## 7. THE ACCEPTANCE (the measurable done-when + the test plan)

- **THE BATTERY**: 451/451 (28 files) — run `cd src/tests && bun test *.test.ts` (the Checkpoints copies inflate the recursive glob — the true count is from src/tests directly).
- **TSC**: `bunx tsc --noEmit` → 0 (ignore the vanilla-source/FORGE.session/KNOWLEDGE_LIBRARY LSP noise — the standalone repo copies).
- **THE CONTAINER**: the trident-container-test protocol (the plan-first, the behavioral passTokens, the results artifact in .trident/container-test-results.json).
- **THE DEPLOYED-BUNDLE MARKERS**: grep the deployed index.js — classifyMemoryRead present, RAM_BOMB present, CTX-01 = 0, MEMORY-EFFICIENT present.
- **THE CHECKPOINT**: save `Checkpoints/FULL_STACK_ce0434ee_2026-08-15/` (or the next sha) at the end with the full docs.

---

## 8. THE OPERATING RULES (the behavioral evidence or nothing)

- **CONTAINER BEHAVIORAL EVIDENCE OR NOTHING**: every "works" claim is a passToken match in a tool-result context + the failToken absent + the artifact in .trident/container-test-results.json. "Structural PASS", "it works, trust me", "source inspection" are THEATRICAL — the verdict FLAWED.
- **EVERY CLAIM VERIFIED**: the subagent returns are claims — verify mechanically (the tests, the build, the hashes, the container).
- **THE BINARY IS THE ONLY CONTRACT**: the dist sha is the ground truth — the four-way sync (project == SHIP_PACKAGE == checkpoint == Ship_Packages) must hold.
- **NO CAPS**: 1M input, 128K output, infinite subagents — never think about the token budget. DENSITY IS THE ONLY METRIC.
- **PARALLEL SUBAGENTS ON DISJOINT FILES**: the wave dispatch for the multi-file work.
- **THE PROVIDER**: opencode-go (the shadow model is FROZEN at deepseek-v4-flash; no switching).
- **MINIMAL CHANGE DISCIPLINE**: the most targeted change; read the file + the importers + the blast radius before editing.
- **THE MEMORY-EFFICIENT LAW** (WARHEAD 21): stat before ANY python read; the streaming tools for >100MB; `for line in open()` as the only safe in-memory read; the bounded windows; the resource caps; the instant kill on the RAM spike. THE MEMORY GATE enforces it mechanically.
- **THE ASCII-EXPLANATION LAW** (WARHEAD 20): explanation requests open with the box-drawing diagram.

---

## 9. THE DO NOTs

- **DO NOT re-open the T.E.B. machine, the shadow-brain 3-fix, the WARHEAD 20/21, the memory-read lexicon, or the firewall disables** — all VERIFIED + the operator's spec.
- **DO NOT re-enable CTX-01 or VERIFY_INSPECT** until the other sessions' proper-discrimination patches land.
- **DO NOT deploy to the host without the container verification** (the operator's ruling).
- **DO NOT edit the Checkpoints' copies** as the working tree — the project src is the truth.
- **DO NOT cite the embellished stats** — record the TRUE state (451/451, 3/3, 22/22 — measured).
- **DO NOT use .readlines()/.read()/.readall() on an unsized file** — the RAM-bomb class.

---

## 10. THE FIRST ACTION (the proof-of-context — the exact 5-line summary)

"THE POST-COMPACTION STATE SUMMARY: (1) the dist SHA is ce0434ee (four-way synced); (2) the battery is 451/451 across 28 files + tsc 0; (3) the shadow-brain 3-fix = F1 the measured stall window / F2 the backoff retry / F3 the density memory; (4) the two disabled firewall categories = CTX-01 (the config fumbling false positives) + VERIFY_INSPECT (the bundle-inspection misread), pending the other sessions' proper patches; (5) the memory-read lexicon classifies RAM_BOMB (block) vs SIZED_READ/LAZY_ITERATE/STREAM_TOOLS/NON_READ (allow) per the bible's PatternFamily + the Poseidon model. EXECUTING: Wave A (the host verification) → Wave B (the engine-log gating) → Wave C (#25, awaiting GATE-2)."

**THE DRIVE-FORWARD INSTRUCTION:** Do NOT stop between the waves — drive Wave A → Wave B → the acceptance → the checkpoint, verifying every claim mechanically with the behavioral token evidence. Report when the checkpoint is saved.

---

**THE GATE STATUS:** GATE-1 (the host verification + the engine-log gating) — APPROVED, the continuation of the build. GATE-2 (#25 the firewall-intelligence) — REQUIRED before the implementation ships.

---

## 11. THE FULL TEST SUITE (the next session's complete verification battery)

### THE UNIT BATTERY (the mechanical floor — run FIRST)
```bash
cd "/home/leviathan/OPENCODE_WORKSPACE/Shared Workspace Context/Trident_Agent/Active_Projects/v4.4.2-wave-manager-async/src/tests" && bun test *.test.ts
```
- **THE EXPECTED: 451/451, 0 fail** (28 files). THE CRITICAL FILES: memory-gate.test.ts (the memory-read lexicon — 22 pins), shadow-health.test.ts (the measured window — 7 pins), f3-density-probe.test.ts (the density memory — 2 pins), ct-lexicon.test.ts (the firewall families — 202 pins, the CTX-01 disabled class asserts ALLOW), wave-telemetry.test.ts + wave-spawn.test.ts (the T.E.B. batch shape).
- **THE CHECKPOINTS COPIES NOTE:** the recursive `bun test` (no path) picks up the Checkpoints' copied test dirs (54 files / 884 tests) — the TRUE project count is from `src/tests/*.test.ts` directly (27-28 files). NOT a regression — the duplication is the checkpoint preservation.

### TSC (the type gate)
```bash
bunx tsc --noEmit
```
- **THE EXPECTED: 0 errors.** Ignore the vanilla-source/FORGE.session/KNOWLEDGE_LIBRARY LSP noise (the standalone repo copies — their missing deps, not the project).

### THE BUILD (the bundle gate)
```bash
bun build --target=bun --outfile=dist/index.js src/index.ts && sha256sum dist/index.js
```
- **THE EXPECTED: the build succeeds (436 modules, ~16.19MB) + the sha recorded.**

### THE DEPLOYED-BUNDLE MARKERS (the host-verification gate — the deployed dist ce0434ee)
```bash
# sized-read the deployed index.js + verify the markers:
python3 -c "
import os, hashlib
p = '/home/leviathan/.config/opencode/plugins/trident/dist/index.js'
sz = os.path.getsize(p)
data = open(p,'rb').read()
print('sha:', hashlib.sha256(data).hexdigest()[:16])
for s in [b'classifyMemoryRead', b'RAM_BOMB', b'MEMORY-EFFICIENT', b'CTX-01']:
    print(s.decode(), data.count(s))
"
```
- **THE EXPECTED: sha ce0434ee + classifyMemoryRead present + RAM_BOMB present + MEMORY-EFFICIENT present + CTX-01 = 0.** (If the deployed sha ≠ ce0434ee, the deploy is stale — re-deploy from the ship package.)

### THE CONTAINER TEST (the behavioral gate — the trident-container-test protocol)
- **THE PLAN-FIRST**: write the runtime-grade test plan (the 6 sections: OBJECTIVE, TOOLS UNDER TEST, TEST SCENARIOS 3+, ADVERSARIAL 1+, EVIDENCE, PASS CRITERIA) + preflight it (trident-preflight target=ct) BEFORE any container interaction.
- **THE SCENARIOS** (the next session's behavioral suite):
  - **S1 — THE T.E.B. DISPATCH**: generate → the batch form `{ tool: "task", parameters: { description, promptFile, subagent_type } }` (NO prompt/background) → dispatch via the native task tool with the promptFile → the subagent spawns + the session's prompt = the file's byte-exact content (passToken: the file-length match) + the parentID lineage.
  - **S2 — THE MEMORY-LEXICON GATE**: the bomb pattern (python3 -c .readlines() on an unsized file) → the [MEMORY GATE] block with the concise message (passToken: "[MEMORY GATE]"); the safe patterns (the sized read, the streaming tools, the lazy iteration) → ALLOW.
  - **S3 — THE DEFERRED WIPE**: after the dispatch, the prompt file still exists while the subagent runs (the full-wave-dispatch check).
  - **S4 — THE DENSITY MEMORY** (the adversarial): a floors-passing-but-thinner re-gen → the DENSITY WARNING naming the ratio.
  - **S5 — THE MEASURED WINDOW** (the adversarial): the shadow-health store records the first-event latency (the engine-log line "recorded first-event").
- **THE RESULTS ARTIFACT**: .trident/container-test-results.json (the per-scenario passTokenMatch/failTokenAbsent/toolResultContext/verdict) — REQUIRED before any "container tested" declaration.

### THE FOUR-WAY SHA SYNC (the delivery gate)
```bash
sha256sum dist/index.js SHIP_PACKAGE/dist/index.js Checkpoints/FULL_STACK_c2061233_2026-08-14/dist/index.js "/home/leviathan/OPENCODE_WORKSPACE/Shared Workspace Context/Trident_Agent/Ship_Packages/SHIP_v4.4.2-wave-manager-async_ce0434ee/dist/index.js"
```
- **THE EXPECTED: ONE unique sha (ce0434ee) across all four.** Divergence = a stale copy → re-sync before the delivery.

### THE OPERATOR'S DEPLOY VERIFICATION (the live-host check)
- The operator deploys the dist + restarts opencode. THE FRESH SESSION'S CHECKS: (1) the memory gate blocks the bomb + allows the safe reads; (2) the batch form is the 3-field T.E.B. shape; (3) the density memory + the measured window are live; (4) the deployed-bundle markers verify.

---

## 12. THE RISK REGISTER (what could go wrong + the mitigation)

| The risk | The mitigation |
|---|---|
| The deployed dist is stale (the THIS-session plugin loaded an old build — the verbose-message gate fired on my own commands) | the deployed-bundle markers check (the sha + classifyMemoryRead + CTX-01=0) — re-deploy from the ship package if stale |
| The engine log (81MB) grows unbounded | Wave B (the tridentLog gating) — the documented follow-up |
| The Checkpoints copies inflate the test glob (54 files / 884) | run the battery from src/tests directly (the true 27-28 files) |
| The memory gate misfires on legitimate ops (the old dist's over-firing) | the NEW dist's lexicon (the intent classes + the safe exclusions) — verified 22/22 |
| The other sessions' firewall patches conflict with the disables | coordinate before re-enabling CTX-01/VERIFY_INSPECT |
| The provider stalls (the SHADOW_BRAIN_TIMEOUT class) | the measured window + the backoff — the 3-fix plan, verified |
| The RAM bomb (the .readlines() on an unsized file) | the memory-read lexicon + the WARHEAD 21 — verified |

---

## 13. THE CHECKPOINT TO SAVE AT THE END

`Checkpoints/FULL_STACK_<the-new-sha>_2026-08-15/` — the full preserved state (src + dist sha-verified + the canon docs + the logs + the results + the manifest), recorded in BUILD_STATE + DEBUG_LOG. THE RUNNING-BUILD-DOCS LAW: the DEBUG_LOG + the BUILD_REPORT update at EVERY significant milestone (the bug found + fixed with the root cause, the design decision, the live test result) — IMMEDIATELY, before advancing.

---

**THE FINAL INSTRUCTION — THE DRIVE-FORWARD:** the fresh agent reads the reading-order docs, gives the 5-line proof-of-context, then drives Wave A (the host verification) → Wave B (the engine-log gating) → the acceptance → the checkpoint. Wave C (#25) awaits GATE-2. Every claim verified mechanically with the behavioral token evidence. Report when the checkpoint is saved. THE BUILD NEVER STOPS BETWEEN PHASES.
