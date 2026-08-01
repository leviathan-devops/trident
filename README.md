# TRIDENT — T3 ALGORITHMIC AUDIT ENGINE
# ============================================================
# Version: v4.4.3 — POSEIDON GOD LOOP OVERHAUL (Phase 1 Complete)
# Build: 330 modules | 15.18 MB | dist hash 76ac96ec
# ============================================================

Trident is a T3 Algorithmic Audit Engine built as an OpenCode plugin. It
combines an 18-layer AST-powered code audit engine with the Poseidon God
Loop — a 13-phase autonomous build orchestration system that audits a target
project, identifies defects, dispatches build agents to fix them (one agent
per file), verifies results with zero-trust wave verification, and validates
via container testing.

**v4.4.3 is the convergence of two development tracks:**
- **v4.4.2 foundation** — battle-ready horizontal systems: Semantic Smoke Test
  Firewall, deterministic input validation, globalThis-backed agent state,
  Poseidon intent gate, container-test skill enforcement.
- **v4.4.3 Poseidon** — the 13-phase God Loop with Phase 1 intelligence
  overhaul complete: 6 model-required phases where the model makes real
  engineering judgments (DECIDE, PLAN, DISPATCH, VERIFY, CONTAINER_TEST,
  PROBLEM_SOLVE) with NO mechanical fallbacks.

---

## THE POSEIDON GOD LOOP — WHAT IS BUILT RIGHT NOW (End of Phase 1)

The God Loop is a closed-loop control system for autonomous build execution.
The model is the engine, the tool is the driver, the state file is the memory.
The hook is a guardrail, not a driver.

### The 13-Phase State Machine

```
INIT → AUDIT → SCORE → DECIDE → PLAN → DISPATCH → COLLECT → VERIFY
                    ↑                    ↓                      ↓
              AUDIT_RECHECK ←←←←←←←←←←←←←←←←←←←← ←                     │
                    ↓                                                      │
                 SCORE → DECIDE                                            │
                                                              PASS (terminal)
                                                              LOOP (reset→INIT)

         PROBLEM_SOLVE entered from DECIDE (stall), VERIFY (theatrical),
         COLLECT (dispatch failure), CONTAINER_TEST (undiagnosed failure)
```

### Phase 1 Intelligence Overhaul — 6 Model-Required Phases

Phase 1 transformed the God Loop from 1 model-required phase (DISPATCH) to 6.
Each model-required phase:
1. Runs mechanical pre-processing (unchanged)
2. Generates an intelligence context via `phase-intelligence.ts`
3. Requires the phase-specific action (decide/plan/verify/diagnose/solve)
4. Processes the model's decision payload (`setPhasePayload` → `runPhase`)

**NO FALLBACKS.** Calling `action=start` at a model-required phase is REJECTED
with a PHASE ACTION ERROR. The model engages with the intelligence or the loop
stalls — and the stall detector escalates.

| Phase | Type | Model Action | What the Model Does |
|-------|------|--------------|---------------------|
| INIT | Mechanical | — | Scan files, compute snapshot hash |
| AUDIT | Mechanical | — | 18-layer AST engine runs |
| SCORE | Mechanical | — | Formula: max(0, 100−15C−8H−3M−1L) |
| **DECIDE** | **Model** | `action=decide` | Choose PLAN / PROBLEM_SOLVE / ACCEPT_RISK with reasoning |
| **PLAN** | **Model** | `action=plan` | Fix strategies per file: root cause, approach, blast radius, depth |
| **DISPATCH** | **Model** | `task()` calls | Dispatch trident_build agents (one per file) |
| COLLECT | Mechanical | — | Read agent output files |
| **VERIFY** | **Model** | `action=verify` | Per-agent verdicts: TRUSTED / QUARANTINED / REJECTED |
| AUDIT_RECHECK | Mechanical | — | Re-run audit engine |
| **CONTAINER_TEST** | **Model (FULLY MANUAL)** | `action=diagnose` (on failure) | Design + run 5+ adversarial container tests |
| **PROBLEM_SOLVE** | **Model** | `action=solve` | Read source, propose architectural changes |
| PASS | Terminal | — | Goal complete |
| LOOP | Terminal→Reset | — | Round reset with accumulated learning |

### Hard Safety Limits (still mechanical — never model-negotiable)
- Score ≥ 96 → CONTAINER_TEST directly (no judgment needed)
- Cycle ≥ 50 → LOOP (hard stop)
- No findings remain → CONTAINER_TEST (escape valve)

### The Intelligence Context (phase-intelligence.ts)

Each model-required phase receives a rich decision context generated from
God Loop state + audit findings:

- **generateDecideContext** — current state, remaining findings by file,
  previous wave results, stall analysis, decision options with consequence hints
- **generatePlanContext** — file groupings, source context with `>>>` markers,
  strategy requirements (root cause, approach, blast radius, depth)
- **generateVerifyContext** — agent output summaries, mechanical check results,
  trust judgment prompts (construction-vs-evidence, sniff test)
- **generateContainerTestContext** — the FULLY MANUAL mandate: 5+ adversarial
  angles, evidence requirements, quality gates
- **generateProblemSolveContext** — trigger info, unresolved findings,
  depth calibration (surface/medium/deep/root), frameworks to apply

### Phase Action Enforcement (validatePhaseAction)

```
PHASE_ACTIONS:
  INIT/AUDIT/SCORE/COLLECT/AUDIT_RECHECK → ['start']
  DECIDE    → ['decide']
  PLAN      → ['plan']
  DISPATCH  → ['start']        (model dispatches agents via task())
  VERIFY    → ['verify']
  PROBLEM_SOLVE → ['solve']
  CONTAINER_TEST → ['start', 'diagnose']
```

Wrong action at the wrong phase → `[POSEIDON: PHASE ACTION ERROR]` with the
valid actions listed. No fallback to mechanical routing.

### Container Test — Fully Manual, Primary Agent Owned

The CONTAINER_TEST phase is NOT automated. The primary agent:
1. Designs a container test plan with 5+ DIFFERENT adversarial angles
2. Executes each test via `trident-container-test` manually
3. Analyzes every failure mode (root cause, not symptom)
4. Declares PASS only with mechanical evidence from all angles

**Evidence gate:** a pass declaration requires `phaseRepeatCount > 0` (the model
saw the adversarial context) AND evidence store entries from container test
execution. No evidence = REJECTED.

On failure: `action=diagnose` with error/root-cause/fix-approach routes to
PLAN or PROBLEM_SOLVE.

---

## THE 18-LAYER AST AUDIT ENGINE

The audit engine is a genuine static analysis system built on the TypeScript
Compiler API — zero regex on program code. Each layer registers AST-based
rules evaluated against constructs from `ts.createProgram` (or the filesystem
fallback for >40-file projects).

| Layer | Name | Checks |
|-------|------|--------|
| R0 | Build Chain | Compiler-only builds, tsconfig, dist validation |
| R1 | Hook Contract | tool.execute.before/system.transform handler contracts |
| R2 | State Machine | Return-to-COMPLETE without advanceLayer() |
| R3 | Async Correctness | Await without try/catch, .then() without .catch() |
| R4 | Error Handling | Empty catch, silent catch, theatrical success signals |
| R5 | Container Deploy | Hardcoded paths, localhost URLs |
| R6 | Dependency Integrity | Missing deps, unused imports, require() in ESM |
| R7 | Config Schema | opencode.json validation, unguarded config access |
| R8 | Source Hygiene | Dead exports, typo detection |
| R9 | Runtime Contract | `as any` casts, untyped catches, eval() |
| R10 | Invocation Integrity | Dead enforcement functions, bare returns |
| R11 | Theatrical Integrity | Success returns without side effects |
| R12 | Cross-Plugin Isolation | Missing agent guards, name prefix mixing |
| R13 | Data Flow Analysis | Env→sink flows, JSON.parse without validation |
| R14 | Control Flow Graph | Unreachable code, constant conditions |
| R15 | Container Preflight | Env vars without defaults, path concatenation |
| R16 | Bible Enforcement | 11 sub-checks (B1-B11) |
| R17 | Theatrical Integrity | 10 detectors (D1-D10): stub returns, phantom tests |

**Scoring:** confidence-weighted (0.0-1.0 per finding), evidence-gated
(preflight tsc+build suppress/support), severity weights
CRITICAL=15, HIGH=8, MEDIUM=3, LOW=1.

**Verified:** zero false positives on .md documentation files (C8 fix —
AST_SOURCE_EXTENSIONS filter), 8/8 toy project scenarios PASS, Kraken project
0→94/100 with real findings.

---

## THE 10-HOOK ENFORCEMENT SYSTEM

| Hook | Purpose |
|------|---------|
| event | Session lifecycle — clears state on session end |
| chat.message | Poseidon detection, build intent, narration/phantom blocking |
| chat.params | Temperature 0 during God Loop |
| tool.execute.before | 3-layer blocking (L1 tools, L2 hive, L3 theatrical NLP+Merkle) + phase action validation |
| tool.execute.after | Poseidon derailment check, agent output collection, SSTF claim tracking |
| tool.definition | **Recursive anyOf schema sanitizer** — flattens anyOf for Google API compatibility (verified fix) |
| system.transform | Identity injection via SCAN+REPLACE |
| messages.transform | Backup identity injection, God Loop stall injection, SSTF context window |
| compacting | Identity preservation across compaction |
| command.execute | Blocks `opencode run` (headless) |

### 3-Layer Blocking

**Layer 1 — Blocked Tools:** bash/write/edit blocked unless Poseidon active.
**Layer 2 — Hive Blocked:** shark/manta gate tools always blocked.
**Layer 3 — Theatrical:** semantic DESCRIPTIVE-vs-SUGGESTIVE scoring on tool
args + Merkle chain verification for phantom claims.

### Identity Injection
Triple-layered: system.transform (primary, SCAN+REPLACE) + messages.transform
(backup) + compacting (survival). The runtime identity is built from inline
constants — "Trident Agent — T3 Algorithmic Intelligence."

---

## THE 13 TOOLS

| Tool | Purpose |
|------|---------|
| trident-code-audit | 18-layer AST audit engine |
| trident-deep-planning | L1/L2/L3 spec generation |
| trident-context-synthesis | T1/T2 context synthesis |
| trident-problem-solving | 6-framework problem diagnosis |
| trident-poseidon | God Loop orchestrator — 11 actions incl. decide/plan/verify/diagnose/solve |
| trident-container-test | Military-grade container testing (22 actions incl. switch-model/switch-agent/verify-model/verify-agent) |
| trident-ship-package | Ship package generator |
| trident-preflight | Mechanical input validation before expensive LLM calls |
| trident-status | Current mode/layer/state |
| trident-help | Tool documentation |
| trident-gate | Layer gate evaluation |
| trident-omni-vision | Multimodal perception |
| build-status | Build agent status |

---

## THE ENFORCEMENT SYSTEMS (7)

1. **3-Layer Tool Blocking** — L1 blocked tools, L2 hive-blocked, L3 theatrical NLP+Merkle
2. **SSTF** — Semantic Smoke Test Firewall (v3 concept; v4 claim-gated overhaul spec written)
3. **Identity Injection** — SCAN+REPLACE defeats runtime defaults
4. **Poseidon Intent Gate** — PERMISSIONS vs GOD_LOOP classification
5. **Container Skill Enforcement** — test plan required before bash
6. **God Loop Phase Enforcement** — phase-appropriate actions, no fallbacks
7. **L3 Dispatch Enforcement** — forces task() calls during DISPATCH

---

## BUILD

```bash
bun install
bun build src/index.ts --outdir dist --target bun --format esm --bundle
sha256sum dist/index.js
```

**Current dist hash:** `76ac96ec5cd16b2bd4f14842a57c7b3b547d54c4972172ed8f06819a7a1d0fb5`

---

## REPOSITORY MAP

| Path | Contents |
|------|----------|
| `src/` | Full TypeScript source (168 files) |
| `dist/` | Built bundle + sha256.txt |
| `Context_Management/` | 9 canon context docs (compaction survival) |
| `TRIDENT_V4.4.3_OVERHAUL_SPEC.md` | The 3-part macro overhaul spec (1,843 lines) |
| `TRIDENT_DECISION_MAKING_TOOL_SPEC.md` | Decision engine spec (1,525 lines) |
| `SSTF_V4_OVERHAUL_SPEC.md` | Smoke firewall v4 spec (claim-gated) |
| `DP_L1_L2_TESTPLAN_FIRST_OVERHAUL_SPEC.md` | Test-plan-first planning spec |
| `BUILD_REPORT.md` / `DEBUG_LOG.md` | Session documentation |

---

## THE OVERHAUL ROADMAP (post-Phase-1)

- **Phase 2:** `/poseidon` slash command (goal-required, no blanket activation),
  GoalDriver (event-driven macro loop via event hook + client.session.prompt),
  adversarial verification panel (3 skeptics, majority vote), 3 execution modes
  (DIRECT/LINEAR/PARALLEL), removal of NLP-based Poseidon detection.
- **Phase 3:** Forked session workflows — WorkflowRegistry, ShadowAgentSidecar,
  RadioBus, ShadowPoseidon filter, ShortTermMemory, DependencyGraph. Parallel
  God Loops with parent/child session bridging.
- **Decision-Making Engine:** 5-layer, 20-framework decision tool (spec complete)
  — the inverse of the problem-solving tool: foresight + real-time decision
  making + meta-cognition + derivation + enhancement.

---

*Trident v4.4.3 — the Poseidon God Loop overhaul, Phase 1 complete. 6
model-required phases, no fallbacks, fully manual container testing with
adversarial quality gates. Verified: 8/8 toy scenarios, Kraken 0→94/100,
zero .md false positives.*
