# CURRENT_STATE.md — Trident v4.4.3 Overhaul — Exact Build State

**CANON CONTEXT DOC.** Read before touching any code. Recorded 2026-07-31. This is the TRUE, mechanically-verified state — not the claimed state.

---

## 1. PROJECT LAYOUT TREE (verified)

```
Shared Workspace Context/Trident_Agent/Active_Projects/v4.4.3/
├── TRIDENT_V4.4.3_OVERHAUL_SPEC.md          (1,843 lines — 3-part macro spec)
├── TRIDENT_DECISION_MAKING_TOOL_SPEC.md      (1,525 lines — 5 layers, 20 frameworks)
├── SSTF_V4_OVERHAUL_SPEC.md                  (590 lines — claim-gated smoke firewall, SPEC ONLY)
├── DP_L1_L2_TESTPLAN_FIRST_OVERHAUL_SPEC.md  (389 lines — test-plan-first planning, SPEC ONLY)
├── TRIDENT_v4.4.3_POSEIDON_OVERHAUL_SPEC.md  (legacy poseidon spec)
├── package.json                              (v4.4.1 string, bun build scripts)
├── dist/
│   ├── index.js          (15,174,726 bytes — sha256 76ac96ec0bf5a1df...)
│   ├── index.js.map
│   └── sha256.txt        (records 76ac96ec0bf5a1df...)
├── src/
│   ├── poseidon/
│   │   ├── phase-intelligence.ts   (NEW — 5 context generators + PHASE_ACTIONS + validatePhaseAction)
│   │   ├── god-loop.ts             (MODIFIED — 5 phases model-required, setPhasePayload)
│   │   ├── strategic-intelligence.ts (WaveVerifier verdict types TRUSTED/QUARANTINED/REJECTED)
│   │   ├── container-tester.ts     (ContainerTestRunner)
│   │   └── problem-solver.ts       (ProblemSolver)
│   ├── tools/
│   │   ├── trident-poseidon.ts     (REWRITTEN — 5 new actions, validatePhaseAction enforcement)
│   │   ├── container-test.ts       (v4.4.2 sync — INCOMPLETE, see §6)
│   │   ├── trident-preflight.ts    (wired in 7461c3d3)
│   │   ├── trident-ship-package.ts
│   │   ├── trident-tools.ts        (registers createContainerTestTool)
│   │   ├── input-validation.ts     (frozen)
│   │   └── omni-vision.ts
│   ├── hooks/trident-hooks.ts      (tool.definition hook + flattenAnyOf — 94,813 bytes)
│   ├── evidence/evidence-store.ts   (getEvidenceStore)
│   ├── audit-engine/               (18-layer, frozen)
│   ├── identity/                   (identity system, frozen)
│   └── ... (168 .ts files total)
├── Checkpoints/                    (9 checkpoints — see BUILD_STATE.md)
├── Context_Management/             (this doc set)
├── Ship_Packages/                  (empty — no ship package yet)
└── scripts/                        (empty)
```

### Deployment twin (v4.4.2 — battle-ready foundation)
```
Shared Workspace Context/Manta Agent/Active_Projects/Trident_v4.4.2/
├── dist/index.js   (15,683,085 bytes — sha256 5a6d5729ad9c30d6...)
├── src/tools/container-test.ts     (FULLY wired — all 4 actions in dispatch + schema)
└── ... (167 .ts files)
```

---

## 2. TRUE STATS (verified mechanically)

| Metric | v4.4.3 | v4.4.2 |
|--------|--------|--------|
| dist/index.js size | 15,174,726 B (15.17 MB) | 15,683,085 B (15.68 MB) |
| dist sha256 (first 16) | 76ac96ec0bf5a1df | 5a6d5729ad9c30d6 |
| .ts source files | 168 | 167 |
| OVERHAUL spec lines | 1,843 | — |
| DECISION spec lines | 1,525 | — |
| SSTF spec lines | 590 | — |
| DP spec lines | 389 | — |

---

## 3. WHAT'S BUILT AND SOLID — PHASE 1 CODE DETAIL

### 3.1 `src/poseidon/phase-intelligence.ts` (NEW, 15,169 bytes)
- **5 context generators** (each returns model-ready instruction context):
  1. `generateDecideContext(state)` — line 17
  2. `generatePlanContext(...)` — line 79
  3. `generateVerifyContext(...)` — line 135
  4. `generateContainerTestContext(...)` — line 194
  5. `generateProblemSolveContext(...)` — line 246
- **PHASE_ACTIONS map** (line 332) — exact allowed actions per phase:
  - `INIT: ['start']`, `AUDIT: ['start']`, `SCORE: ['start']`, `COLLECT: ['start']`, `AUDIT_RECHECK: ['start']`
  - `DECIDE: ['decide']`, `PLAN: ['plan']`, `DISPATCH: ['start']`, `VERIFY: ['verify']`, `PROBLEM_SOLVE: ['solve']`
  - `CONTAINER_TEST: ['start', 'diagnose']`
  - `PASS: []`, `LOOP: []` (terminal, no action)
- **validatePhaseAction(currentPhase, requestedAction)** (line 355) — returns `{valid, error}`. On invalid: `[POSEIDON: PHASE ACTION ERROR]` message listing valid actions. **NO FALLBACKS.**

### 3.2 `src/poseidon/god-loop.ts` (MODIFIED, 92,324 bytes) — the 5 model-required phases

**DECIDE** (phaseDecide, line 559):
1. HARD LIMIT 1: `score >= SCORE_TARGET (96)` → `nextPhase: CONTAINER_TEST` (mechanical, no model)
2. HARD LIMIT 2: `cycle >= MAX_CYCLES (50)` → `nextPhase: LOOP` (hard stop)
3. HARD LIMIT 3: no preAuditFindings AND no postAuditFindings → `nextPhase: CONTAINER_TEST` (escape valve)
4. Otherwise: if `state.phasePayload` exists (model called action=decide), route by `decision`:
   - `PROBLEM_SOLVE` → nextPhase PROBLEM_SOLVE
   - `ACCEPT_RISK` → clears preAuditFindings + postAuditFindings, **score forced to 100**, justification from reasoning, nextPhase CONTAINER_TEST
   - default → nextPhase PLAN
5. No payload → generate `generateDecideContext(state)`, `requiresModelAction: true` (stays at DECIDE)

**PLAN** (phasePlan): requires `state.phasePayload` (model called action=plan with `fileStrategies`). Payload shape `{fileStrategies: [{file, approach}]}`. Model provides root cause + approach + blast radius + depth per file. Generates wave manifest with verbose source context, shows `>>>` markers, groups by root cause.

**VERIFY** (phaseVerify): evidence gate + WaveVerifier (strategic-intelligence.ts, verdict types TRUSTED/QUARANTINED/REJECTED) run MECHANICALLY FIRST. Then requires `state.phasePayload` from action=verify with `agentVerdicts: [{agentName, verdict}]`. `REJECTED` agents → routed THEATRICAL → AUDIT_RECHECK. VERIFY phase routes back to DISPATCH on partial failure (agents re-run, not re-plan).

**CONTAINER_TEST** (phaseContainerTest, line ~1216): FULLY MANUAL.
- CHECK 1: stored diagnosis (model called action=diagnose after failure) → routes to PLAN or PROBLEM_SOLVE based on `nextPhase` field
- On pass: model calls action=start → evidence gate requires `phaseRepeatCount > 0` AND evidence-store container entries. **No evidence = REJECTED.**
- Generates adversarial context via `generateContainerTestContext`.

**PROBLEM_SOLVE** (phaseProblemSolve, line 1300):
- If `score >= SCORE_TARGET` → skip, nextPhase CONTAINER_TEST
- If `state.phasePayload` (action=solve): stores diagnosis to `CONTEXT_MANAGEMENT/PROBLEM_SOLVING_PLANS/model_diagnosis/plan_v{N}.md` (auto-increments), routes to PLAN or LOOP by `nextPhase`
- Else: generates `generateProblemSolveContext(state, targetPath, triggerInfo)` with `triggerInfo` from stall_detection / container_testing / phase_crash.

**setPhasePayload** (public method, line 1881): loads state.json from `.trident/god-loop/`, sets `phasePayload`, writes atomically. Used by trident-poseidon actions.

### 3.3 `src/tools/trident-poseidon.ts` (REWRITTEN, 9,397 bytes)
- action enum: `start | status | abort | decide | plan | verify | diagnose | solve | phase | deactivate | revoke`
- New params: `decision` (PLAN|PROBLEM_SOLVE|ACCEPT_RISK), `reasoning`, `payload` (JSON string)
- Line 95: `validatePhaseAction(currentPhase, effectiveAction)` — enforcement point. Wrong action at wrong phase = PHASE ACTION ERROR.
- Action handlers store payloads via `godLoopOrchestrator.setPhasePayload(targetPath, payload)`:
  - action=decide → `{decision, reasoning}`
  - action=plan → parses payload → `{fileStrategies}`
  - action=verify → parses payload → `{agentVerdicts}`
  - action=diagnose → CONTAINER_TEST failure diagnosis
  - action=solve → PROBLEM_SOLVE solution

### 3.4 `src/hooks/trident-hooks.ts` (MODIFIED, 94,813 bytes)
- `tool.definition` hook (line ~1453) with **recursive flattenAnyOf** (line 1409)
- VERIFIED fixing the Google API error: `"Invalid value at tools[0].function_declarations[24]"` — nested anyOf in tool schemas flattened recursively before registration.
- One of 8 hooks in the architecture (event, chat.message, tool.before 3-layer, tool.after, system.transform, messages.transform, compacting, command.execute).

### 3.5 Container test evidence gate
- CONTAINER_TEST pass requires: `phaseRepeatCount > 0` + evidence-store container entries. Otherwise REJECTED.
- Implements Law 8: CONTAINER EVIDENCE OR NOTHING.

---

## 4. WHAT'S BROKEN / NOT DONE (honest)

### 4.1 Phase 1 NOT container-tested (the big one)
- **Status:** code compiles, dist built at 76ac96ec, but NO container test has validated Phase 1 behavior.
- **Blocked reason:** the gate chain. GATE-A (v4.4.2 container-test actions) is not yet verified live, and v4.4.3's container-test schema is incompletely synced (see §6). The build order mandates v4.4.2 polish FIRST.
- **Unblocking path:**
  1. Complete the v4.4.2 container-test GATE-A verification (Wave A) — includes finishing the v4.4.3 schema+dispatch sync.
  2. Complete SSTF v4 (GATE-B) and DP test-plan-first (GATE-C).
  3. Then run v4.4.3 Phase 1 container test (GATE-D) adversarially from 5+ angles: identity, Kraken audit, DECIDE enforcement, wrong-action adversarial, PLAN/VERIFY enforcement, evidence gate.

### 4.2 The incomplete container-test schema sync (verified finding)
- v4.4.3 `src/tools/container-test.ts`:
  - Method bodies present: verifyModel@1064, verifyAgent@1082, switchAgent@1098, switchModel@1153
  - Union type (line 74): all 4 actions listed
  - **Dispatch switch (line 388): ONLY `switch-model`** — missing switch-agent/verify-model/verify-agent cases
  - **Zod schema enum (line 1750): ONLY `switch-model`** — missing the 3 new actions
- v4.4.3 `dist/index.js`: contains `switch-model` twice, `switch-agent` once (in a describe string), **zero** `verify-model` / `verify-agent` strings. The binary does NOT expose the 3 new actions.
- v4.4.2 `dist/index.js`: all 4 action strings present (switch-agent 3×, switch-model 3×, verify-agent 2×, verify-model 2×). Fully wired.
- **Impact:** calling `action=verify-model` on v4.4.3 dist would fail schema validation → `unknown_action`. GATE-A must complete this wiring (add 3 dispatch cases + 3 enum entries in v4.4.3) and rebuild.

### 4.3 Phase 2, Phase 3, Decision-Making Engine — SPEC ONLY
- No code exists. Do not implement until gates authorize.

### 4.4 Checkpoints/v4.4.3_OVERHAUL_PHASE1 stale
- Records d886c171; the current build is 76ac96ec. Needs src/dist refresh.

### 4.5 Ship_Packages/ empty
- No TRIDENT_V4.4.3 ship package generated yet (last one was pre-convergence).

---

## 5. SSTF v3 MISFIRES (why SSTF v4 is needed)

From SSTF_V4_OVERHAUL_SPEC.md §1 (590-line spec, SPEC ONLY):
1. **SSTF v3 blocks information-gathering** (read/ls on source) while ALLOWING **information-presentation-as-proof** (grep on source = the #1 smoke test mechanism).
2. It **derives intent from the USER's chat words** (poisoning the window).
3. **Stubbed VerificationStateTracker methods** were supposed to provide the semantic layer.
4. **Verb classification never runs for read/grep tools**.
5. Operator ruling: "grep should have been blocked harder than the others as that is the primary mechanism of smoke test garbage."

SSTF v4 doctrine: **"Block the theatrical CLAIM, not the legitimate WORK. Grep/read for modification is engineering; presenting grep/read as proof of correctness is smoke."** Semantic order target: L3 (Behavioral).

---

## 6. DP AUDIT FINDING (why DP test-plan-first is needed)

From DP_L1_L2_TESTPLAN_FIRST_OVERHAUL_SPEC.md (389 lines, SPEC ONLY):
- The L1/L2 Deep Planning tools plan-then-test order must flip: **test-plan-first**. A plan is only valid if a test plan exists for it before implementation.
- 5 acceptance scenarios defined (see TASK_QUEUE.md GATE-C).
- Pending implementation in v4.4.2.

---

## 7. CONTAINER INVENTORY (verified via docker ps, 2026-07-31)

| Container | Status | Purpose |
|-----------|--------|---------|
| v443-converged-test | Up 40h | v4.4.3 converged test — HAS Kraken project, **model switch verified working** |
| trident-final-test | Up 40h | final test |
| trident-godloop-verify | Up 40h | god loop verify |
| grok-identity-ct | Up 36h | identity adversarial |
| grok-poseidon-ct | Up 36h | poseidon adversarial |
| grok-v443-infra-ct | Up 24h | v4.4.3 infra |
| grok-v443-infra-ct-reverify | Up 23h | v4.4.3 infra re-verify |
| grok-whale-integr-ct | Up 24h | whale integration |
| grok-whale-integr-ct-reverify | Up 23h | whale integration re-verify |
| grok-trident-v443-live-1785453081 | Up 16h | v4.4.3 live |
| grok-trident-ct | Up 15h | trident adversarial |
| grok-battle-crucible-ct | Up 15h | battle crucible |
| grok-aether-crucible-ct | Up 15h | aether crucible |
| grok-aether-v2-ct | Up 21h | aether v2 |
| preflight-zen | Up 22h | preflight |
| preflight-v2 | Up 23h | preflight v2 |
| plutus-v455-ct | Up 19h | plutus (unrelated project) |
| pf-final | Up 20h | unrelated |
| display-plutus-dash | Up 18m | unrelated |
| shark-iter11 | Exited 137 | unrelated (Shark) |

GATE-A container of choice: **v443-converged-test** (UP 40h+, Kraken project present, model switch already verified working there).

---

## 8. DEPLOY TARGETS

- **v4.4.2 (battle-ready):** deployed at `Manta Agent/Active_Projects/Trident_v4.4.2` — this is where the container-test overhaul lives and where GATE-A/B/C happen.
- **v4.4.3 (overhaul):** build target in place (dist 76ac96ec); container-test deployment once GATE-A sync + GATE-D pass.
- **Ship package:** `Ship_Packages/` empty — to be generated at the end (GATE-F + decision engine).

---

## 9. BUILD COMMANDS (from package.json)

```bash
# typecheck
npm run typecheck          # tsc --noEmit
# build (bun bundle)
npm run build              # bun build src/index.ts --outdir dist --target bun --format esm --bundle
npm run build:esbuild      # esbuild bundle with CJS banner (legacy)
# test
npm run test               # npx tsx ../tests/properties.ts
```

The verified dist (76ac96ec) was built with the bun build path. After ANY src change, rebuild and re-sha256.

---

## 10. OPEN ITEMS CHECKLIST (the delta between "solid" and "done")

- [ ] Complete v4.4.3 container-test schema + dispatch wiring (3 actions missing)
- [ ] GATE-A live verification of v4.4.2 container-test actions (5+ adversarial angles)
- [ ] SSTF v4 implementation + 9/9 scenarios (GATE-B)
- [ ] DP test-plan-first implementation + 5/5 scenarios (GATE-C)
- [ ] v4.4.3 Phase 1 container test (GATE-D)
- [ ] Update Checkpoints/v4.4.3_OVERHAUL_PHASE1 to 76ac96ec
- [ ] Phase 2 (GATE-E), Phase 3 (GATE-F), Decision-Making Engine
- [ ] Ship package + BUILD_REPORT refresh
