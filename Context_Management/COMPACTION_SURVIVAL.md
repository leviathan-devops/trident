# COMPACTION_SURVIVAL.md — Trident v4.4.3 Overhaul

**CANON CONTEXT DOC — READ FIRST AFTER ANY COMPACTION.**
**Purpose:** Let a fresh agent resume the v4.4.3 overhaul with ZERO lost context. Everything needed to reload is here or linked.
**Last verified:** 2026-07-31. **Overwrite-safe:** yes — this file is regenerated each prep.

---

## 1. RESUME POINT (The One-Line Answer)

Trident v4.4.3 is the ACTIVE OVERHAUL project. **Phase 1 (God Loop Phase Intelligence) is CODE COMPLETE and compiles, but is NOT container-tested.** The current focus is the SIDE QUEST: v4.4.2 container-test polish (GATE-A), which must be fully verified before Phase 1 can be container-tested (GATE-D). Build order is strict: **v4.4.2 polish FIRST → v4.4.3 Phase 1 container test → Phase 2 → Phase 3**.

---

## 2. DOC MAP (What each context doc contains)

| # | Doc | Contains |
|---|-----|----------|
| 1 | COMPACTION_SURVIVAL.md | (this) resume point, doc map, state at a glance, 10 laws, gates, checkpoints, frozen/open lists, first actions |
| 2 | CURRENT_STATE.md | exact build state: layout tree, what's solid, what's broken/not done, blocked reasons, unblocking path, container inventory, true stats |
| 3 | NEXT_STEPS.md | Wave A–G build plan with exact commands, done-when criteria, gates |
| 4 | TASK_QUEUE.md | gates table, active tasks (GATE-A detailed), pending (GATE-B 9, GATE-C 5), completed, backlog, priority |
| 5 | BUILD_STATE.md | checkpoint structure, full SHA chain, build commands, verified results (toy 8/8, Kraken), container state, deploy targets |
| 6 | CHANGELOG.md | session history with honest disclosures (incl. Phase 1 NOT container-tested, switch-model false positive, incomplete schema sync) |
| 7 | POST-COMPACTION_PROMPT.md | paste-ready activation prompt for the fresh agent |
| 8 | DECISION_CHAIN.md | operator rulings verbatim, architectural decisions, rejected alternatives, the 3 overhaul tasks |

Auxiliary (unchanged): BOOT_PROMPT.md, BUILD_AGENT_HANDOVER.md, DEBUG_LOG.md, EVIDENCE_STATE.md, v4.4.3_INTEGRATION_PLAN.md, handover-packages/ (4 explore-agent finding docs).

---

## 3. STATE AT A GLANCE (both projects)

### Project A: v4.4.3 (OVERHAUL — ACTIVE)
- **Path:** `Shared Workspace Context/Trident_Agent/Active_Projects/v4.4.3/`
- **Dist hash:** `76ac96ec0bf5a1df695843ea41291da9f64a9631d3c95f381bfde53505db302a` (sha256 of dist/index.js)
- **Dist size:** 15,174,726 bytes (15.17 MB), 168 .ts source files
- **Convergence of:** v4.4.2 battle-ready foundation + v4.4.3 Poseidon God Loop
- **Phase 1 status:** CODE COMPLETE, compiles, **NOT container-tested**

### Project B: v4.4.2 (BATTLE-READY FOUNDATION — DEPLOYED)
- **Path:** `Shared Workspace Context/Manta Agent/Active_Projects/Trident_v4.4.2/`
- **Dist hash:** `5a6d5729ad9c30d6...` (sha256 of dist/index.js)
- **Dist size:** 15,683,085 bytes (15.68 MB), 167 .ts source files
- **SIDE QUEST target:** container-test overhaul APPLIED + BUILDING here, hash 5a6d5729

---

## 4. THE 3 OVERHAUL TASKS (the macro goal)

1. **Phase 1 — God Loop Phase Intelligence.** CODE COMPLETE. 5 context generators + PHASE_ACTIONS map + validatePhaseAction in `src/poseidon/phase-intelligence.ts`. God Loop 5 phases model-required. trident-poseidon rewritten with 5 new actions (decide/plan/verify/diagnose/solve). Container test evidence gate. **MISSING: container test (GATE-D).**
2. **Phase 2 — /poseidon command + GoalDriver.** SPEC ONLY. In TRIDENT_V4.4.3_OVERHAUL_SPEC.md Part 2. NO blanket /poseidon (operator ruling). 3 execution modes (DIRECT/LINEAR/PARALLEL). Adversarial verification panel (3 skeptics).
3. **Phase 3 — Forked Sessions + Shadow Agents.** SPEC ONLY. Part 3. WorkflowRegistry, ShadowAgentSidecar, RadioBus, ShadowPoseidon, ShortTermMemory, DependencyGraph.

**Decision-Making Engine (DEPENDENCY):** SPEC ONLY — TRIDENT_DECISION_MAKING_TOOL_SPEC.md (1,525 lines). 5 layers (0–4), 20 frameworks, inverse of problem-solving tool.

---

## 5. SIDE QUEST STATUS (current focus)

- **v4.4.2 container-test overhaul:** APPLIED + BUILDING (hash 5a6d5729). switch-model FIXED (params.model||modelName, DISPLAY-name typing, parseStatusBar verification). switch-agent/verify-model/verify-agent NEW. **GATE-A must verify these in a live container.**
- **ZERO-TRUST FINDING:** the sync into v4.4.3 is **INCOMPLETE** — see CURRENT_STATE.md §6. The methods + union type synced; the schema enum + dispatch switch in v4.4.3 still only expose `switch-model`. This MUST be completed before GATE-D.
- **SSTF v4:** spec written (590 lines), pending impl in v4.4.2 (GATE-B).
- **DP test-plan-first:** spec written (389 lines), pending impl in v4.4.2 (GATE-C).
- **v4.4.3 Phase 1 container test:** pending (GATE-D).
- **Phase 2 / Phase 3:** spec only (GATE-E, GATE-F).

---

## 6. THE 10 OPERATING LAWS (canon — never violate)

1. **NO FALLBACKS** — model-required phases reject wrong actions. Wrong action at wrong phase = PHASE ACTION ERROR, REJECTED.
2. **NO BLANKET /poseidon** — the command must have a goal. No `activate` without a task.
3. **CONTAINER TEST FULLY MANUAL** — the primary agent OWNS the entire container testing process, ADVERSARIALLY from 5+ different angles. No delegated hand-waving.
4. **DECISION-MAKING ENGINE IS DEPENDENCY** — Phase 2/3 build on the decision engine; it must be spec'd/implemented as the dependency.
5. **BUILD ORDER: Phase 1 → 2 → 3.** Never skip ahead.
6. **v4.4.2 FROZEN FEATURES PRESERVED** — SSTF, input-validation, globalThis, intent gate. Do not regress.
7. **THE BINARY IS THE ONLY CONTRACT** — verification happens against dist, not claims. sha256 checks.
8. **CONTAINER EVIDENCE OR NOTHING** — container test evidence gate rejects pass without evidence.
9. **EVERY CLAIM VERIFIED** — no assertion without mechanical proof.
10. **MINIMAL CHANGE DISCIPLINE** — surgical edits; no speculative rewrites.

---

## 7. OPERATOR RULINGS (verbatim, canon — full list in DECISION_CHAIN.md)

- "no fallbacks and force it to work in the overhauled infra or fail"
- "no primary agent FULLY OWNS the ENTIRE container testing process here... ADVERSARIALLY from 5+ different angles"
- "no blanket /poseidon activate. reject this output and force a proper goal task"
- "poseidon needs to have built in intelligence to know when a task requires workflows and when it can just directly execute"
- "grep should have been blocked harder than the others as that is the primary mechanism of smoke test garbage"
- "this is not how it appears in the TUI menu 'MiMo V2.5 OpenCode Go' - this is how it appears... and how it needs to be typed"
- "this tool needs a verification action that tmux capture pane and returns these values [agent] [model] [provider]"
- "add here also Alibaba Token Plan, Zhipu AI Coding Plan, Kimi For Coding"

---

## 8. GATE ORDER (the chain)

```
GATE-A (v4.4.2 container-test actions verified)
  → GATE-B (SSTF v4 9/9)
  → GATE-C (DP test-plan-first 5/5)
  → GATE-D (v4.4.3 Phase 1 container test)
  → GATE-E (Phase 2)
  → GATE-F (Phase 3)
```

Each gate has exact done-when criteria in NEXT_STEPS.md and TASK_QUEUE.md.

---

## 9. SHA CHAIN (v4.4.3) — full hashes in BUILD_STATE.md

```
e28e727 (original frozen)
→ e9b86dfa (C1–C8 fixes)
→ f7b9d15e (architecture fixes)
→ 17018421 (converged merge)
→ 7461c3d3 (preflight wired)
→ d886c171 (Phase 1 code)
→ 76ac96ec (CURRENT, methods synced)
```

---

## 10. CHECKPOINT INVENTORY

| Checkpoint | Path (under v4.4.3/Checkpoints/) | Hash recorded | Status |
|-----------|----------------------------------|---------------|--------|
| v4.4.3_OVERHAUL_PHASE1 | `Checkpoints/v4.4.3_OVERHAUL_PHASE1/` | d886c171 | NEEDS UPDATE to 76ac96ec src/dist |
| pending-ship-approval | `Checkpoints/pending-ship-approval/` | 7461c3d3 | frozen |
| v4.4.3_BUGFIX_VERIFIED | `Checkpoints/v4.4.3_BUGFIX_VERIFIED/` | f7b9d15e | verified |
| Functioning_Poseidon_V1 | `Checkpoints/Functioning_Poseidon_V1/` | — | historical |
| Functioning_Poseidon_V2_Loop_Verified | `Checkpoints/Functioning_Poseidon_V2_Loop_Verified/` | — | historical, has kraken-test evidence |
| working_baseline | `Checkpoints/working_baseline/` | — | baseline |
| 20260715T153628Z-live-trident-dist | `Checkpoints/20260715T153628Z-live-trident-dist/` | — | live dist snapshot |
| v4.4.3_SEMANTIC_AST_VERIFIED | `Checkpoints/v4.4.3_SEMANTIC_AST_VERIFIED/` | — | historical |
| v4.4.3_SPG_UPGRADE_VERIFIED | `Checkpoints/v4.4.3_SPG_UPGRADE_VERIFIED/` | — | historical |

---

## 11. FROZEN LIST (do NOT re-open, do NOT re-litigate)

- 18-layer audit engine (R0–R16)
- identity system
- 3-layer firewall
- input-validation
- globalThis agent-state
- C1–C8 fixes
- Kraken 0→94/100 machinery (16 findings, 12 fixed, 4 remaining, zero .md false positives)
- Toy project 8/8 PASS (identity, tool-first, firewall, poseidon lifecycle, clean audit, God Loop, malformed path, phantom result)
- Agent fix dirty.ts: 50→100/100, SHA256 9f68f4d7...

---

## 12. OPEN LIST (what the next agent MAY touch)

- v4.4.2 container-test schema + dispatch wiring COMPLETION (verify-model/verify-agent/switch-agent) — currently INCOMPLETE in v4.4.3
- v4.4.2 container-test GATE-A live verification (5+ adversarial angles)
- SSTF v4 implementation (GATE-B)
- DP test-plan-first implementation (GATE-C)
- v4.4.3 Phase 1 container test (GATE-D)
- Phase 2 / Phase 3 (GATE-E, GATE-F)
- Decision-Making Engine
- Checkpoints/v4.4.3_OVERHAUL_PHASE1 update to 76ac96ec
- Ship package refresh

---

## 13. FRESH AGENT ENTRY RULES

1. Read THIS doc first, then POST-COMPACTION_PROMPT.md.
2. Give the 5-line proof-of-context (see POST-COMPACTION_PROMPT.md §first-action) BEFORE executing anything.
3. Read CURRENT_STATE.md before touching any code.
4. Do NOT skip GATE-A. The gate chain is sequential.
5. Every success claim requires container evidence or sha256 verification.
6. Follow the 10 laws. Especially: no fallbacks, container test fully manual/adversarial, binary is the contract.
7. Build order is v4.4.2 polish → Phase 1 container test → Phase 2 → Phase 3. Never reorder.
8. If a doc says "SPEC ONLY", do not implement it unless the gate authorizes it.
9. Mechanical verification before ANY claim. Evidence or nothing.
10. When a task requires workflows, use them; when it can be executed directly, execute directly (poseidon intelligence ruling).

---

## 14. FIRST ACTIONS (for the fresh agent, in order)

1. Verify the two dist hashes (76ac96ec... and 5a6d5729...) with sha256sum. Confirm the binary is the contract.
2. Read CURRENT_STATE.md §6 (the incomplete schema sync finding) — understand why GATE-A must include wiring completion.
3. Open GATE-A in TASK_QUEUE.md and NEXT_STEPS.md Wave A.
4. Execute Wave A: verify v4.4.2 container-test actions in the live v443-converged-test container (5+ adversarial angles).
5. After GATE-A passes, proceed to Wave B (SSTF v4) — the current side-quest chain.

---

## 15. ZERO-TRUST FINDINGS SUMMARY (verified 2026-07-31, mechanical)

The following were verified against the actual files/dist, NOT taken on claim:

1. **v4.4.3 dist hash** `76ac96ec...` confirmed via sha256sum of dist/index.js (15,174,726 bytes).
2. **v4.4.2 dist hash** `5a6d5729...` confirmed (15,683,085 bytes).
3. **v4.4.3 src count** 168 .ts files; **v4.4.2 src count** 167 .ts files.
4. **Spec line counts confirmed:** OVERHAUL 1843, DECISION 1525, SSTF 590, DP 389.
5. **Phase 1 machinery present:** 5 generators, PHASE_ACTIONS map, validatePhaseAction, phaseDecide 3 hard limits, setPhasePayload, CONTAINER_TEST evidence gate, PROBLEM_SOLVE diagnosis store, trident-poseidon 5 actions, trident-hooks flattenAnyOf + tool.definition hook.
6. **CRITICAL — INCOMPLETE SYNC:** v4.4.3 `src/tools/container-test.ts` contains the method bodies (verifyModel@1064, verifyAgent@1082, switchAgent@1098, switchModel@1153) and the union type (line 74 lists all 4 actions), BUT the dispatch switch (line 388) and the zod schema enum (line 1750) ONLY expose `switch-model`. `verify-model` and `verify-agent` strings are ABSENT from the v4.4.3 dist entirely. v4.4.2 dist contains all 4. **Conclusion: the container-test overhaul is complete in v4.4.2, but the schema + dispatch wiring was NOT carried into v4.4.3. GATE-A must complete this wiring as part of its scope, OR gate the Phase-1 container test on it.**
7. **switch-model param fix present in both:** v4.4.2 line 1160 and v4.4.3 line 1157 both use `params.model || params.modelName`. DISPLAY-name typing + parseStatusBar verification present in both.

These findings are recorded so a fresh agent does NOT assume the v4.4.3 container-test sync is complete.

---

## 16. VERSION / REGENERATION NOTE

This file is a CANON prep artifact. It is OVERWRITTEN each compaction-prep cycle. Do not hand-edit trivia; regenerate from the verified state. If a fact here conflicts with a mechanically verified current state, the verified state wins and this file must be updated.

### Regeneration checklist
- [ ] sha256 both dist files, record exact hashes
- [ ] confirm spec line counts
- [ ] confirm the 5 Phase-1 generators still exist in phase-intelligence.ts
- [ ] confirm container-test schema/dispatch wiring state (switch-model only vs all 4)
- [ ] confirm docker container inventory (v443-converged-test etc.)
- [ ] confirm checkpoint hashes (d886c171, 7461c3d3, f7b9d15e)
- [ ] re-verify gate order and open list
- [ ] update POST-COMPACTION_PROMPT.md with any state changes
