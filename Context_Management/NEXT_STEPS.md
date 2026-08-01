# NEXT_STEPS.md — Trident v4.4.3 Overhaul — Wave Build Plan (A→G)

**CANON CONTEXT DOC.** The executable build plan. Each wave has: goal, exact commands, done-when criteria, gate. Follow the gate order — do NOT skip.

---

## 0. GATE CHAIN (the master sequence)

```
GATE-A (v4.4.2 container-test actions verified)
  → GATE-B (SSTF v4 9/9)
  → GATE-C (DP test-plan-first 5/5)
  → GATE-D (v4.4.3 Phase 1 container test)
  → GATE-E (Phase 2)
  → GATE-F (Phase 3)
  → Decision-Making Engine (dependency, spec exists)
  → Acceptance + Ship Package
```

Working directory anchors:
- v4.4.2 (side quest): `Shared Workspace Context/Manta Agent/Active_Projects/Trident_v4.4.2/`
- v4.4.3 (overhaul): `Shared Workspace Context/Trident_Agent/Active_Projects/v4.4.3/`

---

## 1. WAVE A — GATE-A: v4.4.2 container-test actions verified (ACTIVE, current focus)

### A.0 First: complete the v4.4.3 schema+dispatch sync (verified gap)
The v4.4.2 overhaul is fully wired, but v4.4.3 `src/tools/container-test.ts` only exposes `switch-model` in dispatch (line 388) and schema enum (line 1750). **Before GATE-D can run, v4.4.3 must expose all 4 actions.**

**Task A.0.1 — v4.4.3 wiring completion:**
```
Edit v4.4.3/src/tools/container-test.ts:
1. Dispatch switch (after line 388, `case 'switch-model'`):
   case 'switch-agent': data = await this.switchAgent(params); break;
   case 'verify-model': data = await this.verifyModel(); break;
   case 'verify-agent': data = await this.verifyAgent(); break;
2. Zod schema enum (line 1750): add 'switch-agent', 'verify-model', 'verify-agent'
   after 'switch-model'.
3. Rebuild + re-sha256 dist.
```
Mirror this EXACTLY from v4.4.2's dispatch (lines 388-391) + schema (line 1752).

**Done-when:** `grep -o "verify-model\|verify-agent\|switch-agent\|switch-model" v4.4.3/dist/index.js | sort | uniq -c` shows all 4 present. v4.4.3 dist hash changes.

### A.1 Live verification of v4.4.2 actions (the actual GATE-A test)
Target container: **v443-converged-test** (UP 40h+, has Kraken project, model switch verified working).

**Test 1 — verify-model (adversarial angle 1: does it return TRUE TUI state?):**
```
trident-container-test action=connect containerName=v443-converged-test
trident-container-test action=verify-model
```
**Done-when:** response contains `agent`, `model`, `provider`, `matched` from a REAL `tmux capture-pane` status-bar parse. Must match the actual TUI display string (e.g. "MiMo V2.5 OpenCode Go").

**Test 2 — verify-agent (adversarial angle 2: active agent name):**
```
trident-container-test action=verify-agent
```
**Done-when:** returns the ACTIVE agent name from the status bar, `verified: true` when matched, `expected` echoes STATE.agentName.

**Test 3 — switch-model round-trip (adversarial angle 3: DISPLAY-name typing + parseStatusBar confirmation):**
```
trident-container-test action=switch-model model="MiMo V2.5 OpenCode Go" provider="OpenCode Go"
trident-container-test action=verify-model
```
**Done-when:** switch reports `switched: true`; verify-model after switch confirms the status bar shows the requested model. Use the EXACT display string from the TUI menu — "this is not how it appears in the TUI menu 'MiMo V2.5 OpenCode Go'" (operator ruling).

**Test 4 — switch-agent round-trip (adversarial angle 4):**
```
trident-container-test action=switch-agent agent=trident
trident-container-test action=verify-agent
```
**Done-when:** `switched: true`, verify-agent confirms `trident` active. Also test switching to another agent (e.g. manta/build) and back.

**Test 5 — legacy alias regression (adversarial angle 5: modelName still works):**
```
trident-container-test action=switch-model modelName="DeepSeek V4 Flash Free"
trident-container-test action=verify-model
```
**Done-when:** legacy `modelName` param resolves (params.model || params.modelName fix), status bar confirms the model.

**Test 6 — wrong-param adversarial (adversarial angle 6):**
```
trident-container-test action=switch-model    # no model/modelName
```
**Done-when:** `invalid_params` error returned, NOT a crash, NOT a false success.

**Test 7 — dead-container adversarial (adversarial angle 7):**
```
trident-container-test action=verify-model on a stopped/nonexistent container
```
**Done-when:** clean error (`container unavailable` / `container_dead`), no false positive.

**GATE-A done-when:** all 7 tests pass in the live container; each result recorded with the raw capture-pane evidence. Record in EVIDENCE_STATE.md.

---

## 2. WAVE B — GATE-B: SSTF v4 implementation + 9/9 (pending)

Source of truth: `v4.4.3/SSTF_V4_OVERHAUL_SPEC.md` (590 lines). Implement in v4.4.2 first (build order: v4.4.2 polish FIRST).

**Core work:**
- New `semantic-smoke-firewall.ts` (~120 new lines) + `trident-hooks.ts` modifications (~80 lines).
- Claim-gated enforcement: block the theatrical CLAIM, not the legitimate WORK.
- Fix SSTF v3 flaws: (1) allow read/ls for gathering, (2) gate grep-as-proof, (3) stop deriving intent from user chat words, (4) implement the stubbed VerificationStateTracker, (5) run verb classification for read/grep tools.
- Semantic order target: L3 (Behavioral).

**The 9 scenarios (from the spec, GATE-B 9/9):**
1. Grep presented as correctness proof → BLOCKED (theatrical claim)
2. Grep/read used for modification/engineering → ALLOWED
3. Read of source for understanding → ALLOWED
4. Theatrical claim with no evidence → BLOCKED
5. Legitimate claim with real evidence (sha, container output) → ALLOWED
6. User-intent poisoning attempt → IGNORED (never derive from chat words)
7. VerificationStateTracker actually tracks → PASS (no stubs)
8. Verb classification runs for read/grep → PASS
9. L3 behavioral gating works end-to-end → PASS

**Done-when:** 9/9 scenarios pass in the container test. Record evidence.

---

## 3. WAVE C — GATE-C: DP test-plan-first implementation + 5/5 (pending)

Source of truth: `v4.4.3/DP_L1_L2_TESTPLAN_FIRST_OVERHAUL_SPEC.md` (389 lines). Implement in v4.4.2.

**Core work:** flip the L1/L2 Deep Planning order to test-plan-first. A plan is invalid without a test plan.

**The 5 scenarios (GATE-C 5/5):**
1. Plan submitted without test plan → REJECTED
2. Plan with test plan → ACCEPTED
3. Test plan covers the acceptance criteria → PASS
4. Test plan-first flow generates the plan correctly → PASS
5. End-to-end: plan → test plan → implementation → verification chain works → PASS

**Done-when:** 5/5 scenarios pass in container test. Record evidence.

---

## 4. WAVE D — GATE-D: v4.4.3 Phase 1 container test (the big one)

The God Loop Phase Intelligence machinery (phase-intelligence.ts, god-loop.ts, trident-poseidon.ts) is CODE COMPLETE but NEVER container-tested. Test ADVERSARIALLY from 5+ angles (operator ruling).

**Prerequisites:** GATE-A (Wave A) passed AND v4.4.3 schema+dispatch sync complete (Task A.0.1).

**D1 — Identity test:** run a God Loop on the toy project in-container; confirm identity/firewall/C1-C8 still hold.
**D2 — Kraken audit replay:** deploy Kraken project, run full audit, confirm findings machinery (16 findings path, 12 fixed, 4 remaining, zero .md false positives).
**D3 — DECIDE enforcement:** get God Loop to DECIDE; submit action=start → must be REJECTED with PHASE ACTION ERROR; submit action=decide → accepted. Confirm hard limits (score≥96→CONTAINER_TEST, cycle≥50→LOOP, no findings→CONTAINER_TEST).
**D4 — wrong-action adversarial:** at PLAN submit action=decide → rejected; at VERIFY submit action=plan → rejected; at PROBLEM_SOLVE submit action=start → rejected. NO FALLBACKS.
**D5 — PLAN enforcement:** at PLAN, submit action=plan with `fileStrategies` payload → accepted, wave manifest generated with root cause + approach + blast radius + depth.
**D6 — VERIFY enforcement:** at VERIFY, submit action=verify with agentVerdicts (TRUSTED/QUARANTINED/REJECTED); REJECTED agents → THEATRICAL → AUDIT_RECHECK.
**D7 — Container evidence gate:** attempt to PASS CONTAINER_TEST with action=start but NO container evidence → REJECTED. With real evidence-store container entries + phaseRepeatCount>0 → PASS.

**GATE-D done-when:** all D1–D7 pass in container with captured evidence. This is the milestone that makes Phase 1 officially COMPLETE.

---

## 5. WAVE E — GATE-E: Phase 2 (/poseidon command + GoalDriver)

Source of truth: TRIDENT_V4.4.3_OVERHAUL_SPEC.md Part 2.
- NO blanket /poseidon (operator ruling) — command requires a goal.
- 3 execution modes: DIRECT / LINEAR / PARALLEL.
- GoalDriver: event hook + `client.session.prompt` for continuation.
- Adversarial verification panel (3 skeptics).
- Decision-Making Engine is the dependency — ensure it exists (Wave G) before or with this.

**Done-when:** /poseidon with a goal runs end-to-end in container; DIRECT/LINEAR/PARALLEL all demonstrable; no-goal invocation rejected.

---

## 6. WAVE F — GATE-F: Phase 3 (Forked Sessions + Shadow Agents)

Source of truth: TRIDENT_V4.4.3_OVERHAUL_SPEC.md Part 3.
- WorkflowRegistry, ShadowAgentSidecar, RadioBus, ShadowPoseidon, ShortTermMemory, DependencyGraph.

**Done-when:** shadow agents fork sessions, communicate over RadioBus, poseidon works with short-term memory + dependency graph in container.

---

## 7. WAVE G — Decision-Making Engine

Source of truth: TRIDENT_DECISION_MAKING_TOOL_SPEC.md (1,525 lines).
- 5 layers (0–4), 20 frameworks, inverse of problem-solving tool.

**Done-when:** the tool exists, layers 0–4 demonstrable, frameworks selectable, container-tested.

---

## 8. ACCEPTANCE (final done-when)

1. All gates A–F green with container evidence.
2. Decision-Making Engine implemented + container-tested.
3. v4.4.3 dist rebuilt + sha256 recorded.
4. Checkpoints/v4.4.3_OVERHAUL_PHASE1 updated to current hash.
5. Ship package generated (Ship_Packages/TRIDENT_V4.4.3_.../) with BUILD_REPORT + DEBUG_LOG.
6. Every claim in the ship package mechanically verified.

---

## 9. EXECUTION RULES FOR ALL WAVES

1. **Verify first:** sha256 dist before/after each change.
2. **Container evidence or nothing:** every green needs capture-pane or tool output on disk.
3. **5+ adversarial angles:** never a single happy-path test.
4. **Minimal change discipline:** surgical edits, mirror existing style.
5. **No fallbacks:** if a phase rejects an action, record the rejection — do not route around it.
6. **Parallel subagents only on disjoint files.** Poseidon decides when workflows are needed vs direct execution.
7. **Record evidence** in EVIDENCE_STATE.md after each gate.
8. **Rebuild + re-sha256 after ANY src edit.**
