# BUILD_STATE.md — Trident v4.4.3 Overhaul — Checkpoints, SHA Chain, Verified Results

**CANON CONTEXT DOC.** The build state: checkpoint structure, full SHA chain, build commands, verified results, container state, deploy targets. Recorded 2026-07-31.

---

## 1. CURRENT BUILD (verified this session)

| Field | v4.4.3 (overhaul) | v4.4.2 (battle-ready foundation) |
|-------|-------------------|----------------------------------|
| Path | `Trident_Agent/Active_Projects/v4.4.3/` | `Manta Agent/Active_Projects/Trident_v4.4.2/` |
| dist/index.js size | 15,174,726 bytes (15.17 MB) | 15,683,085 bytes (15.68 MB) |
| dist sha256 | `76ac96ec0bf5a1df695843ea41291da9f64a9631d3c95f381bfde53505db302a` | `5a6d5729ad9c30d6...` |
| src .ts count | 168 | 167 |
| Phase 1 code | COMPLETE + compiles | — |
| Container-test actions | INCOMPLETE sync (3 actions missing from schema/dispatch) | FULLY wired |
| Container-tested | NO | (side quest in progress) |

**Law 7 (binary is the only contract):** the sha256 of dist/index.js is the ground truth. Re-hash after any build.

---

## 2. FULL SHA CHAIN (v4.4.3)

```
e28e727   original frozen baseline
  → e9b86dfa   C1–C8 fixes
  → f7b9d15e   architecture fixes
  → 17018421   converged merge (v4.4.2 + v4.4.3 Poseidon)
  → 7461c3d3   preflight wired
  → d886c171   Phase 1 code complete
  → 76ac96ec   CURRENT — methods synced
```

### 2.1 Checkpoint ↔ hash mapping (verified via sha256sum this session)

| Checkpoint dir | dist hash (first 16) | Notes |
|----------------|----------------------|-------|
| `Checkpoints/v4.4.3_OVERHAUL_PHASE1/` | d886c171 | **STALE** — records Phase-1-code-era; needs refresh to 76ac96ec src/dist |
| `Checkpoints/pending-ship-approval/` | 7461c3d3 | preflight-wired era |
| `Checkpoints/v4.4.3_BUGFIX_VERIFIED/` | f7b9d15e | architecture-fix era |
| `Checkpoints/working_baseline/` | (no dist verified) | baseline |
| `Checkpoints/20260715T153628Z-live-trident-dist/` | (snapshot) | live dist snapshot, sha256.txt present |
| `Checkpoints/Functioning_Poseidon_V1/` | (historical) | early poseidon |
| `Checkpoints/Functioning_Poseidon_V2_Loop_Verified/` | (historical) | loop verified; has kraken-test-evidence dirs |
| `Checkpoints/v4.4.3_SEMANTIC_AST_VERIFIED/` | (historical) | semantic AST |
| `Checkpoints/v4.4.3_SPG_UPGRADE_VERIFIED/` | (historical) | ship-package-generator upgrade |

### 2.2 Ship package history
- `Ship_Packages/` in v4.4.3 is EMPTY (verified this session).
- Legacy ship package: `TRIDENT_V4.4.3_CONVERGED_POSEIDON_GODLOOP/` referenced in prior docs (convergence-era) — not present in the current Ship_Packages listing. If needed for history, search Trident_Agent root for it.

---

## 3. BUILD COMMANDS (from package.json)

```bash
# typecheck — must pass before build
npm run typecheck                 # tsc --noEmit

# primary build (bun bundle) — produces dist/index.js
npm run build                     # bun build src/index.ts --outdir dist --target bun --format esm --bundle
npm run build:bun                 # same as build

# legacy esbuild path (with CJS require banner)
npm run build:esbuild

# tests
npm run test                      # npx tsx ../tests/properties.ts
```

**Standard build→verify sequence (do this after ANY src change):**
```bash
cd <project root>
npm run typecheck
npm run build
sha256sum dist/index.js        # record the hash
cat dist/sha256.txt            # update this file with the new hash
```

---

## 4. VERIFIED RESULTS (prior sessions — do NOT re-run)

### 4.1 Toy project 8/8 PASS
| # | Check | Result |
|---|-------|--------|
| 1 | identity | PASS |
| 2 | tool-first | PASS |
| 3 | firewall (3-layer) | PASS |
| 4 | poseidon lifecycle | PASS |
| 5 | clean audit (18-layer, zero findings) | PASS |
| 6 | God Loop | PASS |
| 7 | malformed path | PASS |
| 8 | phantom result | PASS |

### 4.2 Kraken 0→94/100
- 16 findings identified in initial audit
- 12 fixed via Poseidon-dispatched build agents
- 4 remaining (accepted/residual, documented)
- **Zero .md false positives** — no false findings on markdown docs
- Evidence dirs in `Checkpoints/Functioning_Poseidon_V2_Loop_Verified/` (kraken-test-*)

### 4.3 Agent fix dirty.ts 50→100/100
- Target: dirty.ts
- Result: 50→100/100
- SHA256 9f68f4d7...

### 4.4 tool.definition flattenAnyOf (verified)
- Fix: recursive flattenAnyOf in trident-hooks.ts (line 1409), tool.definition hook (~line 1453)
- Resolves Google API: `"Invalid value at tools[0].function_declarations[24]"`

---

## 5. THIS SESSION'S VERIFICATIONS (2026-07-31 — all mechanical)

1. **v4.4.3 dist hash** `76ac96ec0bf5a1df...` — confirmed sha256sum.
2. **v4.4.2 dist hash** `5a6d5729ad9c30d6...` — confirmed sha256sum.
3. **Spec line counts:** OVERHAUL 1843, DECISION 1525, SSTF 590, DP 389.
4. **Phase 1 machinery presence:**
   - phase-intelligence.ts: 5 generators (lines 17/79/135/194/246), PHASE_ACTIONS (332), validatePhaseAction (355)
   - god-loop.ts: phaseDecide (559) with 3 hard limits, setPhasePayload (1881), CONTAINER_TEST manual phase, PROBLEM_SOLVE diagnosis store
   - trident-poseidon.ts: 5 new actions (decide/plan/verify/diagnose/solve) + decision/reasoning/payload params
   - trident-hooks.ts: flattenAnyOf (1409) + tool.definition (1453)
5. **v4.4.2 container-test full wiring:** dispatch cases 388-391, schema enum 1752, dist contains all 4 action strings.
6. **v4.4.3 container-test INCOMPLETE wiring:** dispatch 388 only switch-model, schema 1750 only switch-model, dist has NO verify-model/verify-agent strings.
7. **Container inventory:** 19 containers (v443-converged-test UP 40h+, Kraken present, model switch verified).

---

## 6. CONTAINER STATE

Target container: **v443-converged-test** — UP 40 hours, has the Kraken project, model switch verified working. This is the GATE-A container of choice.

Full inventory (verified `docker ps -a`): v443-converged-test, trident-final-test, trident-godloop-verify, grok-identity-ct, grok-poseidon-ct, grok-v443-infra-ct, grok-v443-infra-ct-reverify, grok-whale-integr-ct, grok-whale-integr-ct-reverify, grok-trident-v443-live-1785453081, grok-trident-ct, grok-battle-crucible-ct, grok-aether-crucible-ct, grok-aether-v2-ct, preflight-zen, preflight-v2, plutus-v455-ct, pf-final, display-plutus-dash (18m), shark-iter11 (exited).

**Container-test tool path note:** the model-facing tool is `trident-container-test` (in v4.4.2) / `trident-container-test` from `createContainerTestTool()` (trident-tools.ts line 2439 in v4.4.3). Action enum currently exposes switch-model only in v4.4.3 — verify-model/verify-agent/switch-agent require Task A.0 wiring first.

---

## 7. DEPLOY TARGETS

1. **v4.4.2** — battle-ready foundation, deployed at Manta path. Source of side-quest changes (container-test overhaul, SSTF v4, DP test-plan-first). Hash 5a6d5729.
2. **v4.4.3** — overhaul, dist 76ac96ec. Needs: schema+dispatch sync, then Phase 1 container test, then Phase 2/3.
3. **Ship package** — to be generated at acceptance into `Ship_Packages/TRIDENT_V4.4.3_.../`.

---

## 8. INTEGRITY PROTOCOL (frozen — follow always)

1. Never trust a claimed hash — run sha256sum.
2. After every src edit: typecheck → build → re-hash → update sha256.txt.
3. Before a gate claim: container evidence on disk.
4. Checkpoints for a LOCKED baseline: `chmod -R a-w`.
5. Checkpoints are named `v{VERSION}_{LABEL}` under Checkpoints/.
6. dist/index.js is the contract; src is the engineering artifact.

---

## 8.1 PHASE 1 BUILD UNIT DETAIL (what 76ac96ec contains)

### phase-intelligence.ts (NEW — 15,169 bytes)
```
line 17:   generateDecideContext(state)            — DECIDE decision context
line 79:   generatePlanContext(...)                — PLAN file-strategy context
line 135:  generateVerifyContext(...)              — VERIFY per-agent verdict context
line 194:  generateContainerTestContext(...)       — CONTAINER_TEST adversarial context
line 246:  generateProblemSolveContext(...)        — PROBLEM_SOLVE analysis context
line 332:  PHASE_ACTIONS: Record<string, string[]> — per-phase allowed actions
line 355:  validatePhaseAction(currentPhase, requestedAction) — {valid, error}
```
PHASE_ACTIONS exact map:
- INIT/AUDIT/SCORE/COLLECT/AUDIT_RECHECK → ['start']
- DECIDE → ['decide']; PLAN → ['plan']; DISPATCH → ['start']; VERIFY → ['verify']; PROBLEM_SOLVE → ['solve']
- CONTAINER_TEST → ['start', 'diagnose']; PASS/LOOP → []

### god-loop.ts (MODIFIED — 92,324 bytes)
Key verified behaviors:
- `phaseDecide` (559): HARD LIMIT 1 score≥SCORE_TARGET(96)→CONTAINER_TEST; HARD LIMIT 2 cycle≥MAX_CYCLES(50)→LOOP; HARD LIMIT 3 no findings→CONTAINER_TEST; else payload-driven routing (PROBLEM_SOLVE / ACCEPT_RISK[clears findings, score=100] / default PLAN); no payload → stay DECIDE + generateDecideContext + requiresModelAction:true
- `setPhasePayload` (1881): load `.trident/god-loop/state.json`, set phasePayload, atomic write
- `phaseContainerTest` (~1216): CHECK 1 stored diagnosis → routes PLAN or PROBLEM_SOLVE by nextPhase; pass requires evidence gate
- `phaseProblemSolve` (1300): score≥target skips; payload→writes `CONTEXT_MANAGEMENT/PROBLEM_SOLVING_PLANS/model_diagnosis/plan_v{N}.md`, routes PLAN or LOOP; else generateProblemSolveContext
- WaveVerifier integration: verdict types TRUSTED/QUARANTINED/REJECTED (strategic-intelligence.ts:90)

### trident-poseidon.ts (REWRITTEN — 9,397 bytes)
- action enum (line 21): start/status/abort/decide/plan/verify/diagnose/solve/phase/deactivate/revoke
- params (29-31): decision (PLAN|PROBLEM_SOLVE|ACCEPT_RISK), reasoning, payload (JSON string)
- line 95: validatePhaseAction enforcement — NO FALLBACKS
- handlers store payloads via setPhasePayload (decide→{decision,reasoning}, plan→{fileStrategies}, verify→{agentVerdicts})

### trident-hooks.ts (MODIFIED — 94,813 bytes)
- flattenAnyOf (1409): recursive collapse of nested anyOf
- tool.definition hook (1453): sanitizes schemas pre-registration
- Verified fix for Google API function_declarations[24] error

### container-test.ts (MODIFIED — 96,600 bytes) ⚠️ INCOMPLETE SYNC
- methods present: verifyModel (1064), verifyAgent (1082), switchAgent (1098), switchModel (1153)
- union type line 74 lists all 4
- dispatch (388) + schema enum (1750): ONLY switch-model — GAP

---

## 9. OUTSTANDING BUILD ACTIONS

- [ ] Task A.0: wire switch-agent/verify-model/verify-agent into v4.4.3 container-test dispatch + schema; rebuild; re-hash
- [ ] GATE-A: 7 live tests on v443-converged-test
- [ ] GATE-B: SSTF v4 (9/9)
- [ ] GATE-C: DP test-plan-first (5/5)
- [ ] GATE-D: v4.4.3 Phase 1 container test (D1–D7)
- [ ] Refresh Checkpoints/v4.4.3_OVERHAUL_PHASE1 to 76ac96ec
- [ ] Ship package generation
