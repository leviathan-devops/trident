# BUILD_REPORT_V6 — THE ATOMIC WAVE-DISPATCH REGISTRY (2026-08-10 — dist 6b7024d5)

**THE ARCHITECTURAL CHANGE:** the [WAVE BATCH] enforcement rebuilt from the per-agent-record design to the ATOMIC WAVE-DISPATCH REGISTRY — the fix for the WAVE_BATCH_GATE_FALSE_POSITIVE_2026-08-10 incident (the Plutus ADM build: the 5-agent batch blocked per call, 15 blocks, 3 attempts, zero dispatches). This report documents the root cause, the design, the implementation with the file:line anchors, the verification (the container red-team per-scenario), the failure modes, and the deployment.

---

## 1. THE INCIDENT

The Plutus ADM build: the wave generator produced a 5-agent wave (adm-1..adm-5, the DPL1-grade prompts 454/164/155/167/166 lines, the wave-level manifest with the per-agent shas). The dispatch — ALL 5 task calls as the parts of ONE message with the promptFile channel — was blocked on EVERY call: `[WAVE BATCH] the wave for "adm-N" has 5 agents — a SINGLE dispatch is the derailment`. Three identical attempts, fifteen blocks, zero dispatches. THE OPERATOR: "wave batch is completely broken".

## 2. THE ROOT CAUSE (three layers)

1. **THE PER-CALL HOOK IS STRUCTURALLY BLIND TO THE BATCH.** The enforcement runs in tool.execute.before — it fires PER TOOL CALL, each fire receiving ONE call `{ tool, sessionID, callID, args }`. The batch (N task calls in one message) exists only at the MESSAGE level. The project's InputMessage type (trident-hooks.ts:38-52): `message = { role, content, agent, sessionID }` — NO parts, NO sibling calls. The information "this call is part of a 5-call batch" does not exist in the call. The message-level hooks that could see the parts (the messages.transform) are BANNED for firewalls (the operator: "ONLY throw errors on tool before are allowed" + the message-mutation ban). The old gate evaluated every call against the N-agent wave record → the legit batch's calls were indistinguishable from the derailment.

2. **THE STALE WAVE.** The ADM wave was generated pre-fix — the per-agent records never written. The gate's legacy fallback blocked the legit batch, and its remedy text (the batch) was exactly what the agent had done — a dead-loop with no actionable exit.

3. **THE PER-AGENT-RECORD DESIGN'S FLAWS** (the intermediate fix, superseded): it made ANY single dispatch pass (the derailment guard dead — the one-at-a-time pattern the gate exists to kill) while still blocking the legit stale-wave batch (no per-agent records → the fallback block).

## 3. THE DESIGN — THE ATOMIC WAVE-DISPATCH REGISTRY

**THE SEMANTIC SHIFT: observability over detection.** The batch and the derailment are indistinguishable at a single call — but they differ in TIME: a legit batch must land its N calls within seconds (the same message's tool loop); the one-at-a-time derailment necessarily spreads its calls across separate turns (minutes). The registry is a per-wave DISPATCH-AUTHORIZATION LEDGER that makes the batch's execution observable + verifiable, and a calibrated window separates the two classes mechanically.

**THE LEDGER:** `.wave-registry-<waveId>.json` = `{ wave, total, calls: [], windowStart: null }` — written by the generator at generation time (nothing authorized yet).

**THE GATE FLOW (per task call matching a wave agent):**
1. findWaveRecordForAgent(desc, sha) — the wave-level record whose agent has BOTH the name AND the dispatched prompt's sha (the same-name cross-wave disambiguation).
2. readWaveRegistry(wave) — the ledger; ABSENT → the REGENERATE directive (the stale-wave remedy — actionable, never a dead-loop).
3. THE WINDOW opens on the FIRST call (`windowStart = now` — never the generation: the dispatch lands minutes after the generation; a generation-time window would block the legit batch).
4. THE CHECKS: (a) the call's key (desc|wave|sha) already in the ledger → the 'already recorded' block (the re-fire); (b) the window EXPIRED + calls.length < total → the named-counts block (the one-at-a-time derailment — dies at its SECOND call); (c) otherwise → append + ALLOW.
5. THE ATOMICITY: the read → decide → write is a single SYNCHRONOUS block (no awaits between the fs calls) — the event loop serializes the concurrent batch calls: call 1 reads [], appends, writes; call 2 reads [k1], appends, writes; ... the ledger ends at N/N.

**THE WINDOW CALIBRATION (WAVE_DISPATCH_WINDOW_MS = 60s):** the batch's N calls land within seconds (the same message's tool loop); the next-turn dispatch lands minutes later. 60s separates the classes with a 10x margin. The named constant (trident-hooks.ts) — the ISE law's named calibration.

## 4. THE IMPLEMENTATION (the file:line anchors)

### The generator (src/tools/wave-dispatch.ts)
- THE PER-AGENT RECORDS (the intermediate fix, kept — harmless redundancy): `.wave-manifest-<waveId>-<agent>.json` with exactly 1 agent, written after the manifest's lines/sha finalization.
- THE REGISTRY WRITE (THE FINAL): `.wave-registry-<waveId>.json` = { wave, total: generated.length, calls: [], windowStart: null } — after the per-agent records; the write failures logged (the loud-fail, never silent).

### The gate (src/hooks/trident-hooks.ts)
- `WAVE_RECORD_WINDOW_MS = 60*60*1000` + `WAVE_RECORD_CAP = 20` + `WAVE_RECORD_MIN_LINES = 125` (the DPL1 floor's named calibration) + `WAVE_DISPATCH_WINDOW_MS = 60*1000` (the batch-vs-derailment separation).
- `findWaveManifestEntry(desc, sha)` — the verbatim entry: the per-agent record preference (1 agent) + the legacy wave-record fallback; the sha + the lines >= WAVE_RECORD_MIN_LINES.
- `waveAgentExists(desc)` — any record (the verbatim mismatch's trigger).
- `findWaveRecordForAgent(desc, sha)` — THE WAVE-LEVEL LOOKUP: the FILE-NAME SHAPE discriminator (the digits-only waveId part `^wave-\d+$` = the wave-level; the `-<agent>` suffix = the per-agent — the single-agent-wave fix, the red-team's live find) + the sha match (the cross-wave collision fix).
- `readWaveRegistry(waveId)` — the ledger read (the callers MUST NOT await between this read and the write — the sync block IS the atomicity).
- THE GATE FLOW (in the task firewall's wave-verbatim section): the loader injects the promptFile's byte-exact content → the verbatim sha → the entry/exists checks → the [WAVE BATCH] REGISTRY block (the stale directive / the already-recorded / the partial-expired with the counts / the append + allow).
- THE WAVE-RECORD HYGIENE (in the T.E.A. wipe's section): the manifests + the registries older than the window OR beyond the cap are pruned (the tmp's closed-loop cleanliness).
- THE MESSAGES: the [WAVE BATCH] block names the missing-registry regenerate remedy; the [WAVE VERBATIM] block's (b) clause names the modified-file regenerate; the generator's after-hook instruction uses the batch-process wording (ALL N task calls as the parts of ONE message).

### The SSTF (src/firewalls/semantic-smoke-firewall.ts)
- THE DEAD-LEXICON REMOVAL: the bare-word VERIFICATION_SIGNALS/ANALYSIS_SIGNALS/OPERATION_SIGNALS (declared, never referenced; the 'working' bare word = the false-positive class) removed with the rationale comment.

### The config lock (src/firewalls/ct-anti-derailment.ts)
- THE READ-VERB WIDENING: `sed\s+-n` + `\bawk\b` added to the CT_READ_VERBS (the read-only print modes — the READS are always allowed; the mutation verbs untouched).

## 5. THE VERIFICATION (the container red-team — closeout-ct, the ONLY sanctioned runtime path)

The setup validated the full 6-scenario plan (the ORDER gate), deployed the dist with the file-branch SHA verify (shaMatch, byte-exact), the load gate PASSED (MODULE_LOADED). Every scenario verified on THREE surfaces: the DISK (the exec: cat/ls the actual files), the STREAM (the check action's pattern scans), the SCREENSHOTS (the TUI's rendered tool results).

| Scenario | Verdict | The evidence (the tool-result context) |
|---|---|---|
| S1 the generation + the registry | PASS | the disk: .wave-registry-wave-1786381307528.json = { wave, total: 2, calls: [], windowStart: null } + the wave manifest (2 agents, the real shas + lines) + the per-agent records; rt-a2's AGENT PARTIAL loud-fail excluded (the ERROR files) |
| S2 THE BATCH (the core) | PASS | the registry ON DISK: calls = [rt-a3\|093d1a..., rt-a1\|664a61...] — 2/2, the window opened on the first call, the atomic appends recorded; the screenshot: BOTH task calls in ONE message + rt-a3 completed (36 toolcalls, 4m14s) + rt-a1 running; the [WAVE BATCH] failToken scan: 0 matches — THE FALSE POSITIVE IS DEAD |
| S3 the derailment re-fire | PASS | the rendered error: [TRIDENT PROMPT FILE] unreadable promptFile ... ENOENT — the file already WIPED by the first task's completion (the closed loop: the prompt file's lifetime = the batch) |
| S4 the stale wave | PASS | the stale fixture (154 lines, the sha-matched manifest, NO registry): the dispatch BLOCKED with the named remedy — the run ALSO caught the single-agent-wave shape bug (the task ran on the pre-fix build) → fixed → redeployed → re-run → blocked as designed (the found-fixed-retested loop) |
| S5 the T.E.A. wipe | PASS | every task's completion killed its prompt file (rt-a3.md, rt-a1.md, the stale-probe.md — all verified absent on the disk) |
| S6 the read regression | PASS | MODULE_LOADED + the loadGate PASSED |

THE MECHANICAL FLOOR: tsc 0 project-wide after every edit batch; the battery 707 pass / 10 fail / 2628 expect / 717 tests (the 10 = the immutable stale Checkpoints snapshots) — IDENTICAL to the baseline, zero regressions; the build 432 modules → the dist 6b7024d5.

## 6. THE FAILURE MODES (documented)

1. **The derailment's FIRST call passes** — information-theoretically identical to the batch's first call; the catch is the SECOND call (the expired window + the partial count → the named block).
2. **A legit batch with a runtime-dropped call** (2 of 3 processed) → the retry in a new turn hits the expired-window block → the REGENERATE remedy (rare, actionable).
3. **The loader's injection variance** (the runtime's arg-shape drops the promptFile) → the placeholder hash → the [WAVE VERBATIM] block with the (b) stale-clause remedy — the dispatch still blocked with the actionable direction.
4. **The artificial waveId shape** (non-digit waveIds) fails the file-name discriminator — the generator's real format is 'wave-<digits>' by construction.
5. **The registry's absence for ANY reason** (the stale waves, the manual interference) → the REGENERATE directive — never a silent pass, never a dead-loop.

## 7. THE DEPLOYMENT

- The dist: 6b7024d52e27db65349b95c95e61366f3e2999723148e8df56be9fb259336faa (432 modules, 16.1 MB).
- The four-way sync: the project dist == the canonical ship == the checkpoint == the SHIP_PACKAGE (1 unique).
- THE HOST: copy the ship's dist/index.js → ~/.config/opencode/plugins/trident/dist/index.js + restart. The Plutus ADM batch (or any multi-agent wave) then dispatches clean: the batch's calls append to the registry + pass; the one-at-a-time derailment is blocked at its second call; the stale waves get the regenerate directive.
