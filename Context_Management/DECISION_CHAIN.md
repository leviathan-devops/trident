# DECISION_CHAIN.md — Trident v4.4.3 Overhaul — Doctrine & Architecture

**CANON CONTEXT DOC.** The decision chain: operator rulings (verbatim), architectural decisions, rejected alternatives, and the 3 overhaul tasks. This is the settled doctrine — do NOT re-litigate. Recorded 2026-07-31.

---

## 1. OPERATOR RULINGS (verbatim, canon — the highest authority)

### 1.1 No fallbacks
> "no fallbacks and force it to work in the overhauled infra or fail"

**Interpretation (settled):** model-required God Loop phases reject any wrong action. There is NO silent fallback, NO auto-advance, NO lenient path. Wrong action at wrong phase = `[POSEIDON: PHASE ACTION ERROR]` and the call is REJECTED. Implemented in trident-poseidon.ts line 95 via validatePhaseAction.

### 1.2 Container testing is the primary agent's job, adversarially
> "no primary agent FULLY OWNS the ENTIRE container testing process here... ADVERSARIALLY from 5+ different angles"

**Interpretation (settled):** the primary agent does NOT delegate container testing to a subagent who only reports "pass". The primary agent runs the container tests itself, attacking from 5+ angles (identity, audit replay, enforcement, wrong-action, evidence gate...). Implemented as the CONTAINER_TEST phase being FULLY MANUAL + GATE-D's D1–D7 adversarial suite.

### 1.3 No blanket /poseidon
> "no blanket /poseidon activate. reject this output and force a proper goal task"

**Interpretation (settled):** /poseidon cannot be invoked without a concrete goal. An activation without a task is rejected. Phase 2's GoalDriver enforces this (spec-only for now). Law 2.

### 1.4 Poseidon has built-in workflow/direct-execution intelligence
> "poseidon needs to have built in intelligence to know when a task requires workflows and when it can just directly execute"

**Interpretation (settled):** the God Loop must discriminate between tasks that need subagent workflow dispatch and tasks that can be executed directly by the primary agent. Not hardcoded to one mode. Law 9-ish behavior for the planner.

### 1.5 Grep is the primary smoke mechanism
> "grep should have been blocked harder than the others as that is the primary mechanism of smoke test garbage"

**Interpretation (settled):** in the SSTF, grep-as-proof is the #1 theatrical mechanism and must be gated hardest. SSTF v4 doctrine: "Block the theatrical CLAIM, not the legitimate WORK. Grep/read for modification is engineering; presenting grep/read as proof of correctness is smoke." Drives GATE-B.

### 1.6 TUI display-name typing
> "this is not how it appears in the TUI menu 'MiMo V2.5 OpenCode Go' - this is how it appears... and how it needs to be typed"

**Interpretation (settled):** switch-model must type the DISPLAY string exactly as it appears in the TUI model picker (e.g. "MiMo V2.5 OpenCode Go"), NOT the config model ID. Implemented in switchModel (DISPLAY-name typing) in both v4.4.2 and v4.4.3.

### 1.7 Verification action returning TUI state
> "this tool needs a verification action that tmux capture pane and returns these values [agent] [model] [provider]"

**Interpretation (settled):** a verify action must capture the tmux pane and return the ACTUAL [agent] [model] [provider] from the TUI status bar — real state, no guesses. Implemented as verify-model (returns agent/model/provider/matched/verified) and verify-agent (returns agent/verified). Uses parseStatusBar on a real tmux capture-pane.

### 1.8 More provider plans
> "add here also Alibaba Token Plan, Zhipu AI Coding Plan, Kimi For Coding"

**Interpretation (settled):** the provider list for model switching must include Alibaba Token Plan, Zhipu AI Coding Plan, Kimi For Coding (in addition to existing providers). Drives the switch-model provider param documentation and TUI typing support.

---

## 2. ARCHITECTURAL DECISIONS (settled, with rationale)

### AD-1: Converged build (v4.4.2 foundation + v4.4.3 Poseidon)
- **Decision:** build ONE converged binary (hash 17018421 → 76ac96ec) rather than maintaining two lines.
- **Rationale:** the v4.4.2 foundation (battle-ready: 18-layer audit, identity, firewall, input-validation, globalThis, intent gate) must carry the v4.4.3 Poseidon God Loop. One dist = one contract.
- **Status:** converged. Current v4.4.3 dist 76ac96ec.

### AD-2: Phase intelligence as 5 context generators + action map
- **Decision:** `phase-intelligence.ts` provides 5 context generators (DECIDE/PLAN/VERIFY/CONTAINER_TEST/PROBLEM_SOLVE) + PHASE_ACTIONS map + validatePhaseAction.
- **Rationale:** the model must receive phase-appropriate intelligence (what to decide/plan/verify) and be CONSTRAINED to valid actions. No free-for-all.
- **Status:** implemented (Phase 1).

### AD-3: No fallbacks in the God Loop
- **Decision:** model-required phases reject wrong actions with PHASE ACTION ERROR. No fallback routing.
- **Rationale:** operator ruling 1.1. Fallbacks hide model errors and produce theatrical passes.
- **Status:** implemented in trident-poseidon.ts + PHASE_ACTIONS.

### AD-4: Container test evidence gate
- **Decision:** CONTAINER_TEST cannot PASS without evidence-store container entries + phaseRepeatCount>0. No evidence = REJECTED.
- **Rationale:** operator ruling (container evidence or nothing, law 8). A "pass" without container evidence is theatrical.
- **Status:** implemented in god-loop.ts phaseContainerTest.

### AD-5: Tool schema sanitizer (flattenAnyOf)
- **Decision:** a tool.definition hook recursively flattens nested anyOf in tool schemas before registration.
- **Rationale:** VERIFIED fixing Google API "Invalid value at tools[0].function_declarations[24]". Complex zod unions (trident-poseidon, container-test) break provider schema validation without it.
- **Status:** implemented in trident-hooks.ts (flattenAnyOf line 1409, hook line 1453).

### AD-6: SSTF v4 claim-gating
- **Decision:** SSTF v4 gates the theatrical CLAIM, not legitimate WORK. Grep/read for modification allowed; grep/read presented as proof of correctness blocked.
- **Rationale:** operator ruling 1.5 + SSTF v3 misfires (5 documented flaws). The #1 smoke mechanism (grep-as-proof) gets the hardest gate.
- **Status:** SPEC ONLY (590 lines), pending GATE-B.

### AD-7: DP test-plan-first
- **Decision:** L1/L2 Deep Planning flips to test-plan-first — a plan is invalid without a test plan.
- **Rationale:** DP audit finding: plans were generated before test planning, allowing untested designs to proceed.
- **Status:** SPEC ONLY (389 lines), pending GATE-C.

### AD-8: switch-model param resolution (params.model || params.modelName)
- **Decision:** switch-model accepts BOTH param names; model is canonical, modelName is legacy alias.
- **Rationale:** backward compatibility + the operator's display-name typing ruling (1.6). Fix verified in both v4.4.2 (line 1160) and v4.4.3 (line 1157).
- **Status:** implemented in both projects.

### AD-9: Verify actions return real TUI state
- **Decision:** verify-model / verify-agent capture the tmux pane and parse the status bar, returning [agent] [model] [provider].
- **Rationale:** operator ruling 1.7. Real state beats guessed state; no false positives.
- **Status:** implemented (v4.4.2 fully wired; v4.4.3 schema/dispatch sync incomplete — Task A.0).

### AD-10: build order enforced (v4.4.2 polish → Phase 1 CT → Phase 2 → Phase 3)
- **Decision:** GATE-A/B/C (v4.4.2 side quest) precede GATE-D (Phase 1 container test) which precedes GATE-E/F.
- **Rationale:** law 5 + law 6 (frozen features preserved). The container-test actions must be proven live before Phase 1 can be tested with them.

---

## 3. REJECTED ALTERNATIVES (recorded so they are not re-proposed)

| Alternative | Rejected because |
|-------------|------------------|
| Fallback routing for model-required phases (auto-advance on wrong action) | Violates ruling 1.1; hides model errors; produces theatrical passes |
| Blanket /poseidon activate without goal | Violates ruling 1.3 |
| Delegated container testing (subagent reports pass, primary trusts it) | Violates ruling 1.2; the primary agent must OWN it adversarially |
| Hardcoded workflow-only execution for Poseidon | Violates ruling 1.4; Poseidon must discriminate workflows vs direct execution |
| gating ALL grep/read equally | Violates ruling 1.5 + SSTF v4 doctrine; would block legitimate engineering |
| Type config model IDs into the TUI picker | Violates ruling 1.6; the picker matches DISPLAY names |
| Verify via guess/inference instead of tmux capture-pane | Violates ruling 1.7; no real TUI state = no verification |
| Maintaining separate v4.4.2 and v4.4.3 code lines | Rejected at convergence (AD-1); one dist = one contract |
| Plan-first (not test-plan-first) for L1/L2 | Rejected by DP audit finding (AD-7) |

---

## 4. THE 3 OVERHAUL TASKS (the macro goals)

### Task 1 — Phase 1: God Loop Phase Intelligence (CODE COMPLETE)
- 5 context generators + PHASE_ACTIONS + validatePhaseAction
- 5 model-required phases (DECIDE/PLAN/VERIFY/CONTAINER_TEST/PROBLEM_SOLVE)
- trident-poseidon rewrite (5 new actions, no fallbacks)
- Container test evidence gate
- **Status:** implemented, compiles (dist 76ac96ec), NOT container-tested

### Task 2 — Phase 2: /poseidon command + GoalDriver (SPEC ONLY)
- Part 2 of TRIDENT_V4.4.3_OVERHAUL_SPEC.md
- NO blanket /poseidon (ruling 1.3)
- 3 execution modes: DIRECT / LINEAR / PARALLEL
- GoalDriver: event hook + client.session.prompt for continuation
- Adversarial verification panel (3 skeptics)
- **Status:** spec-only, gate E

### Task 3 — Phase 3: Forked Sessions + Shadow Agents (SPEC ONLY)
- Part 3 of TRIDENT_V4.4.3_OVERHAUL_SPEC.md
- WorkflowRegistry, ShadowAgentSidecar, RadioBus, ShadowPoseidon, ShortTermMemory, DependencyGraph
- **Status:** spec-only, gate F

### Dependency — Decision-Making Engine (SPEC ONLY)
- TRIDENT_DECISION_MAKING_TOOL_SPEC.md (1,525 lines)
- 5 layers (0–4), 20 frameworks, inverse of the problem-solving tool
- **Status:** spec-only; declared dependency (law 4)

---

## 5. THE 10 LAWS (the operating constitution)

1. NO FALLBACKS — model-required phases reject wrong actions
2. NO BLANKET /poseidon — must have goal
3. CONTAINER TEST FULLY MANUAL — 5+ adversarial angles
4. DECISION-MAKING ENGINE IS DEPENDENCY
5. BUILD ORDER: Phase 1 → 2 → 3
6. v4.4.2 FROZEN FEATURES PRESERVED (SSTF, input-validation, globalThis, intent gate)
7. THE BINARY IS THE ONLY CONTRACT
8. CONTAINER EVIDENCE OR NOTHING
9. EVERY CLAIM VERIFIED
10. MINIMAL CHANGE DISCIPLINE

---

## 6. FROZEN LIST (never re-open)

- 18-layer audit engine (R0–R16)
- identity system
- 3-layer firewall
- input-validation
- globalThis agent-state
- C1–C8 fixes
- Kraken 0→94/100 machinery (16 findings, 12 fixed, 4 remaining, zero .md false positives)
- Toy project 8/8 PASS machinery
- Agent fix dirty.ts 50→100/100 (SHA256 9f68f4d7...)

---

## 7. SETTLED-DOCTRINE CHANGE PROTOCOL

- A ruling is changed ONLY by the operator, verbatim, and must be recorded here.
- An architectural decision is revised ONLY when a gate fails and the failure root-causes to the decision.
- Rejected alternatives stay in §3 — they are closed, not "temporarily rejected".
- When a new ruling lands: update §1, update the affected laws/ADs, update COMPACTION_SURVIVAL.md + POST-COMPACTION_PROMPT.md, then continue the current gate.
- This document is canon. The fresh agent must NOT paraphrase rulings — verbatim only.

---

## 8. GATE DECISION RECORD (what each gate is deciding)

| Gate | Decision being validated | Artifact it unlocks |
|------|--------------------------|---------------------|
| GATE-A | v4.4.2 container-test actions (verify-model/verify-agent/switch-model/switch-agent) actually work live, adversarially | GATE-B/C can build on a trusted foundation |
| GATE-B | SSTF v4 claim-gating actually blocks theatrical claims (9/9) | GATE-D can run without smoke-test noise |
| GATE-C | DP test-plan-first actually rejects planless plans (5/5) | GATE-D plans are trustworthy |
| GATE-D | Phase 1 God Loop Phase Intelligence actually behaves in a container (D1–D7) | Phase 1 officially COMPLETE; Phase 2/3 can start |
| GATE-E | Phase 2 /poseidon + GoalDriver work end-to-end, no-blanket enforced | Phase 3 can build on GoalDriver |
| GATE-F | Phase 3 shadow-agent stack works | Overhaul complete → ship package |

Each gate's evidence is written to EVIDENCE_STATE.md. No gate may be marked green without its evidence (law 8).

---

## 9. DECISION-MAKING ENGINE — DESIGN PRINCIPLES (from the spec)

The TRIDENT_DECISION_MAKING_TOOL_SPEC.md (1,525 lines) defines:
- **5 layers (0–4):** increasing abstraction of decision support.
- **20 frameworks:** decision-making frameworks (e.g. Pareto, First Principles, Hypothesis-Driven, etc.) selectable per problem.
- **Inverse of the problem-solving tool:** where problem-solving diagnoses a failure to a fix, the decision-making engine selects among options when the path is ambiguous.
- **Dependency role:** Phase 2 (GoalDriver) and Phase 3 (ShadowPoseidon) consult it. Law 4.
- **Gate:** implemented + container-tested after GATE-F (Wave G), or before/with Phase 2 per the build order.

**Do NOT implement the decision engine before its gate.** It is spec-only.

---

## 10. VERBATIM-DOCTRINE QUICK REFERENCE (for the fresh agent)

```
NO FALLBACKS:                    "no fallbacks and force it to work in the overhauled infra or fail"
PRIMARY OWNS CT:                 "no primary agent FULLY OWNS the ENTIRE container testing process here... ADVERSARIALLY from 5+ different angles"
NO BLANKET POSEIDON:             "no blanket /poseidon activate. reject this output and force a proper goal task"
POSEIDON INTELLIGENCE:           "poseidon needs to have built in intelligence to know when a task requires workflows and when it can just directly execute"
GREP = PRIMARY SMOKE:            "grep should have been blocked harder than the others as that is the primary mechanism of smoke test garbage"
DISPLAY-NAME TYPING:             "this is not how it appears in the TUI menu 'MiMo V2.5 OpenCode Go' - this is how it appears... and how it needs to be typed"
VERIFY RETURNS [agent][model][provider]: "this tool needs a verification action that tmux capture pane and returns these values [agent] [model] [provider]"
MORE PROVIDER PLANS:             "add here also Alibaba Token Plan, Zhipu AI Coding Plan, Kimi For Coding"
```

These 8 rulings are the load-bearing doctrine. Every architectural decision in §2 traces to one or more of them.

---

## 11. CHAIN INTEGRITY

- This document is canon and must stay byte-stable across compactions except for legitimate doctrine updates.
- The full chain: operator ruling → law → architectural decision → implementation → gate → evidence.
- When in doubt about a decision, trace it: find the ruling in §1, the law in §5, the AD in §2, the code location in CURRENT_STATE.md, the gate in TASK_QUEUE.md.
- Never invent a doctrine that is not recorded here. If it's not here, it isn't canon — confirm with the operator.
