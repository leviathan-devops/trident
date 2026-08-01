# TASK_QUEUE.md — Trident v4.4.3 Overhaul — Gate Queue & Task State

**CANON CONTEXT DOC.** The task queue: gates table, active tasks, pending tasks, completed (verified) tasks, backlog, priority order.

---

## 1. GATES TABLE

| Gate | Name | Status | Done-when (summary) | Doc |
|------|------|--------|---------------------|-----|
| GATE-A | v4.4.2 container-test actions verified | **ACTIVE** | 7 live tests pass in v443-converged-test; v4.4.3 schema+dispatch sync complete | NEXT_STEPS §1 |
| GATE-B | SSTF v4 9/9 | PENDING | 9 scenarios pass in container | NEXT_STEPS §2 |
| GATE-C | DP test-plan-first 5/5 | PENDING | 5 scenarios pass in container | NEXT_STEPS §3 |
| GATE-D | v4.4.3 Phase 1 container test | PENDING | D1–D7 pass adversarially in container | NEXT_STEPS §4 |
| GATE-E | Phase 2 (/poseidon + GoalDriver) | PENDING | /poseidon end-to-end, 3 modes, no-blanket enforced | NEXT_STEPS §5 |
| GATE-F | Phase 3 (Shadow Agents) | PENDING | registry+sidecar+radiobus+ST memory+dependency graph work | NEXT_STEPS §6 |
| — | Decision-Making Engine | PENDING (dependency) | 5 layers, 20 frameworks, container-tested | NEXT_STEPS §7 |
| — | Acceptance + Ship Package | PENDING | all gates green + evidence + ship pkg | NEXT_STEPS §8 |

---

## 2. ACTIVE TASK — GATE-A (detailed)

### 2.1 The verified gap that must be closed FIRST
**Task A.0 — Complete v4.4.3 container-test schema+dispatch sync.**
- **Context:** v4.4.3 `src/tools/container-test.ts` has methods (verifyModel@1064, verifyAgent@1082, switchAgent@1098, switchModel@1153) + union type (line 74) but dispatch (line 388) and zod schema enum (line 1750) only expose `switch-model`. v4.4.3 dist has NO `verify-model`/`verify-agent` strings.
- **Action:**
  1. Add 3 dispatch cases after line 388 (`case 'switch-agent'`, `case 'verify-model'`, `case 'verify-agent'`) mirroring v4.4.2 lines 388-391.
  2. Add the 3 actions to the z.enum at line 1750 mirroring v4.4.2 line 1752.
  3. Rebuild (`bun build`) + re-sha256.
- **Acceptance:** `grep -o "verify-model\|verify-agent\|switch-agent\|switch-model" dist/index.js | sort | uniq -c` shows all 4 present in v4.4.3 dist.

### 2.2 The 7 live verification tests (on v443-converged-test)
| # | Test | Command | Expected |
|---|------|---------|----------|
| 1 | verify-model | `trident-container-test action=verify-model` | `{agent, model, provider, matched, verified}` from real capture-pane |
| 2 | verify-agent | `trident-container-test action=verify-agent` | active agent name, `verified: true` |
| 3 | switch-model round-trip | `action=switch-model model="MiMo V2.5 OpenCode Go" provider="OpenCode Go"` then `action=verify-model` | `switched: true`, status bar confirms model |
| 4 | switch-agent round-trip | `action=switch-agent agent=trident` then `action=verify-agent` | `switched: true`, verify confirms |
| 5 | legacy alias | `action=switch-model modelName="DeepSeek V4 Flash Free"` then `verify-model` | modelName resolves |
| 6 | missing param | `action=switch-model` (no model) | `invalid_params`, no false success |
| 7 | dead container | `action=verify-model` on stopped/nonexistent container | clean error, no false positive |

**Status:** NOT YET RUN in this session. This is the current focus.

---

## 3. PENDING — GATE-B: SSTF v4 (9 scenarios)

Source: `SSTF_V4_OVERHAUL_SPEC.md` (590 lines). Implement in v4.4.2.

**Build units:**
- `semantic-smoke-firewall.ts` — new, ~120 lines
- `trident-hooks.ts` — modify, ~80 lines
- ~250 modified lines total

**The 9 scenarios (must pass 9/9):**
1. Grep presented as correctness proof → BLOCKED
2. Grep/read for modification/engineering → ALLOWED
3. Read of source for understanding → ALLOWED
4. Theatrical claim with no evidence → BLOCKED
5. Legitimate claim with real evidence → ALLOWED
6. User-intent poisoning → IGNORED
7. VerificationStateTracker tracks (no stubs) → PASS
8. Verb classification runs for read/grep → PASS
9. L3 behavioral gating works end-to-end → PASS

---

## 4. PENDING — GATE-C: DP test-plan-first (5 scenarios)

Source: `DP_L1_L2_TESTPLAN_FIRST_OVERHAUL_SPEC.md` (389 lines). Implement in v4.4.2.

**The 5 scenarios (must pass 5/5):**
1. Plan without test plan → REJECTED
2. Plan with test plan → ACCEPTED
3. Test plan covers acceptance criteria → PASS
4. Test-plan-first generates plan correctly → PASS
5. End-to-end plan→test plan→impl→verify chain → PASS

---

## 5. COMPLETED (verified — do NOT re-run)

| Item | Verification | Evidence |
|------|--------------|----------|
| Toy project 8/8 PASS | identity, tool-first, firewall, poseidon lifecycle, clean audit, God Loop, malformed path, phantom result | prior container run |
| Kraken 0→94/100 | 16 findings, 12 fixed, 4 remaining, zero .md false positives | prior container run |
| Agent fix dirty.ts 50→100/100 | SHA256 9f68f4d7... | prior container run |
| v4.4.2 container-test overhaul applied | hash 5a6d5729 dist, all 4 actions wired in v4.4.2 | sha256sum + grep dist |
| v4.4.3 Phase 1 code complete + compiles | dist 76ac96ec built | sha256sum |
| tool.definition flattenAnyOf | fixes Google API "Invalid value at tools[0].function_declarations[24]" | prior session |
| v443-converged-test model switch verified | model switch working in container | prior session |
| Specs written | OVERHAUL 1843, DECISION 1525, SSTF 590, DP 389 lines | wc -l |
| This context-doc set | 8 canon docs written 2026-07-31 | this session |

---

## 6. BACKLOG (spec-only, no code)

| Item | Spec | Gate |
|------|------|------|
| Phase 2 (/poseidon + GoalDriver) | OVERHAUL Part 2 | GATE-E |
| Phase 3 (Forked Sessions + Shadow Agents) | OVERHAUL Part 3 | GATE-F |
| Decision-Making Engine | DECISION spec (1,525 lines) | dependency |
| Ship package refresh | — | acceptance |
| Checkpoint v4.4.3_OVERHAUL_PHASE1 update to 76ac96ec | — | housekeeping |

---

## 7. PRIORITY ORDER (strict)

```
1. Task A.0   — complete v4.4.3 container-test schema+dispatch sync
2. GATE-A     — 7 live tests on v443-converged-test
3. GATE-B     — SSTF v4 impl + 9/9
4. GATE-C     — DP test-plan-first impl + 5/5
5. GATE-D     — v4.4.3 Phase 1 container test (D1–D7)
6. GATE-E     — Phase 2
7. GATE-F     — Phase 3
8. Decision   — Decision-Making Engine
9. Acceptance — ship package + checkpoint refresh
```

**Do not reorder.** v4.4.2 polish (A/B/C) MUST land before v4.4.3 Phase 1 container test (D). This is law 5 (build order) + law 1 (no fallbacks).

---

## 7.1 Priority justification (why this order is immutable)

1. **Task A.0 → GATE-A:** GATE-D's container test uses verify-model/verify-agent/switch-agent. If v4.4.3's schema doesn't expose them, Phase 1 cannot be tested adversarially. The sync is a hard prerequisite, not optional.
2. **GATE-A → GATE-B/C:** v4.4.2 is the FROZEN-feature foundation. Its container-test actions must be proven in a live container before piling SSTF v4 + DP test-plan-first on top. Law 6 (frozen features preserved) means the foundation must be trusted first.
3. **GATE-B/C → GATE-D:** the SSTF v4 firewall (claim-gated) and DP test-plan-first (plan validity) must exist so the Phase 1 container test runs on a hardened platform — otherwise the adversarial angles get drowned in smoke-test noise (the exact failure the operator flagged: "grep should have been blocked harder").
4. **GATE-D → GATE-E/F:** Phase 1 is the Poseidon God Loop foundation. Phase 2 (GoalDriver) and Phase 3 (shadow agents) ride on a proven God Loop. Law 5.
5. **Decision engine before/with Phase 2:** the decision-making tool is the inverse of problem-solving and is the declared dependency of the overhaul (law 4). It must at least be implementable when Phase 2 lands.
6. **Acceptance last:** nothing ships until every gate has container evidence (law 8).

---

## 8. QUEUE METADATA

- **Active gate:** GATE-A
- **Current container:** v443-converged-test (UP 40h+)
- **Working projects:** v4.4.2 (side quest) + v4.4.3 (overhaul)
- **Next action on resume:** Task A.0 (wiring) → GATE-A test 1–7
- **Last evidence write:** none this session (all prior-verified)
- **Update cadence:** after every gate, append evidence to EVIDENCE_STATE.md and update this table.

---

## 9. COMPLETED-TASK DETAIL (what "verified" means for each)

### 9.1 Toy project 8/8 PASS
The toy project (a minimal smoke-test target) passed all 8 checks in-container:
1. identity — the agent/binary identifies correctly
2. tool-first — tools resolve before fallback paths
3. firewall — 3-layer firewall blocks staged attacks
4. poseidon lifecycle — God Loop INIT→...→PASS runs clean
5. clean audit — 18-layer audit on clean code returns no findings
6. God Loop — full loop converges
7. malformed path — non-existent target handled gracefully
8. phantom result — no phantom/ghost outputs on empty input

These are FROZEN. Do not re-run unless a change could plausibly regress them (a core-file edit).

### 9.2 Kraken 0→94/100
Kraken = the adversarial project used to prove the audit + God Loop + build-agent machinery:
- Initial audit: score 0, 16 findings
- After 12 fixes (Poseidon-dispatched): 94/100
- 4 remaining findings documented as accepted/residual
- **Zero .md false positives** — no false findings on documentation files
- Machinery frozen (C1–C8 era)

### 9.3 Agent fix dirty.ts 50→100/100
A targeted fix: dirty.ts went 50→100/100, SHA256 9f68f4d7... Frozen.

### 9.4 v4.4.2 container-test overhaul (verified this session)
- switch-model FIXED: `params.model || params.modelName` (v4.4.2 line 1160, v4.4.3 line 1157)
- DISPLAY-name typing: TUI picker matches "MiMo V2.5 OpenCode Go", not config IDs
- parseStatusBar verification: real status-bar parse, no false positives
- switch-agent / verify-model / verify-agent NEW methods
- v4.4.2 FULLY wired (dispatch 388-391 + schema 1752, dist has all 4 strings)
- v4.4.3 NOT fully wired (the A.0 gap) — this is the honest delta

### 9.5 The tool.definition flattenAnyOf fix
- Recursive `flattenAnyOf` (trident-hooks.ts line 1409) collapses nested anyOf in tool schemas
- VERIFIED fixing Google API error `"Invalid value at tools[0].function_declarations[24]"`
- Critical for tools with complex zod unions (trident-poseidon, container-test)

---

## 10. RISK REGISTER (open risks affecting the queue)

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| v4.4.3 schema sync incomplete blocks GATE-D | HIGH (verified gap) | HIGH | Task A.0 first, mirror v4.4.2 exactly |
| Container resource contention (19 containers up) | MEDIUM | MEDIUM | Reuse v443-converged-test; kill stale grok-* if OOM |
| Phase 1 container test uncovers code bugs | MEDIUM | MEDIUM | D1–D7 each isolated; diagnose → PLAN/PROBLEM_SOLVE loop exists |
| SSTF v4 scope creep past spec | MEDIUM | MEDIUM | Minimal-change discipline, spec is 590 lines of authority |
| Checkpoint staleness after gates | HIGH (already stale) | LOW | Update d886c171→76ac96ec checkpoint after GATE-D |
| Ship package claims unverified | MEDIUM | HIGH | Every claim needs sha256/container evidence before ship |

---

## 11. DEFINITION OF DONE (queue-wide)

A task is DONE only when:
1. Its code builds (bun build) with zero errors.
2. The dist is re-hashed and the hash recorded.
3. Container evidence exists for every green claim (capture-pane output or tool response on disk).
4. The test ran adversarially (not a single happy-path).
5. The gate's done-when criteria are met in full (e.g. GATE-A 7/7, GATE-B 9/9, GATE-C 5/5, GATE-D D1–D7).
6. EVIDENCE_STATE.md and this TASK_QUEUE table are updated.
7. No frozen machinery was modified.

If ANY of these is unmet, the task is NOT done — it is in-progress or blocked.
