# TRIDENT v4.4-POSEIDON — God Loop Orchestrator

**Status:** ✅ GOD LOOP — 17-LAYER AUDIT ENGINE — POSEIDON MODE — TRIDENT_BUILD SUBAGENT
**Bundle:** 14.4 MB (ESM)
**Runtime:** opencode 1.14.43+

---

## Overview

Trident v4.4-POSEIDON is a runtime-grade **God Loop orchestrator** plugin for opencode. It introduces a closed feedback cycle — **AUDIT → PLAN → BUILD → VERIFY** — that autonomously drives code quality to 96%+ runtime grade through a self-supervising loop.

The engine adds a **5th mode tool** (`trident-poseidon`) that functions as a God Orchestrator, a **Trident_Build subagent** with CODE-enforced quality gates, and a **semantic activation system** that prevents autonomous activation — the user must explicitly unlock Poseidon Mode.

### Key Features in v4.4

- **Poseidon God Loop (AUDIT → PLAN → BUILD → VERIFY):** Closed-loop quality enforcement — Trident audits, generates remediation plans, dispatches Trident_Build, re-audits, and loops until 96%+ runtime grade, then runs container validation
- **Semantic activation system:** PoseidonDetector uses regex first-pass + signal-word scoring second-pass. No single-string activation. The agent CANNOT activate Poseidon Mode — only the user can
- **Trident_Build subagent:** 8+ file harness with CODE-enforced quality gates, Merkle chain evidence tracking, AST analysis, theatrical detection, and runtime grade enforcement
- **Auto-lock on completion:** The `trident-poseidon` tool locks itself after execution — human must re-activate
- **Evidence archival:** Full audit trail per cycle, per session — `.trident/poseidon-audits/{sessionId}/cycle_{N}/`
- **17-layer audit engine (R0-R16):** From build chain integrity through runtime grade bible enforcement

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          POSEIDON MODE v4.4                                 │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                   REGISTRATION LAYER (17 files)                     │   │
│  │  trident-tools.ts | tool-allowlist.ts | guardian-hook.ts            │   │
│  │  orchestrator-machine-v2.ts | orchestrator.ts | trident-hooks.ts    │   │
│  │  identity/index.ts | agents/definitions.ts | index.ts               │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                         │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                   SEMANTIC ACTIVATION LAYER                          │   │
│  │  User Message → PoseidonDetector.detect() → regex first-pass        │   │
│  │    → semantic second-pass (ON/OFF signal word scoring)              │   │
│  │    → poseidonState.activate/deactivate() — session-scoped Map       │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                         │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                   GOD ORCHESTRATOR LOOP                              │   │
│  │                                                                     │   │
│  │  trident-poseidon tool → poseidonState.isActive() check            │   │
│  │    → GodLoopOrchestrator.runLoop(targetPath, maxCycles)            │   │
│  │      │                                                              │   │
│  │      ├─ PHASE A: AUDIT (Trident primary)                           │   │
│  │      │  → 17-layer audit → extract score + findings                │   │
│  │      │  → if score ≥ 96% → skip to PHASE D                         │   │
│  │      │  → generate remediation plan (exact file:line:fix)           │   │
│  │      │                                                              │   │
│  │      ├─ PHASE B: EXECUTE (Trident_Build subagent)                  │   │
│  │      │  → dispatchToBuildAgent(plan, targetPath)                    │   │
│  │      │  → task({ subagent_type: 'trident_build', prompt })         │   │
│  │      │  → Trident_Build fixes ALL findings in ONE batch            │   │
│  │      │  → returns changed files + SHA256 hashes                    │   │
│  │      │                                                              │   │
│  │      ├─ PHASE C: RE-AUDIT (loop back to PHASE A)                  │   │
│  │      │  → if score < 96% → GOTO PHASE A                            │   │
│  │      │                                                              │   │
│  │      └─ PHASE D: CONTAINER TEST (final validation)                 │   │
│  │         → spawn container → 11 mechanical tests → 8 runtime checks  │   │
│  │         → if fail → feed findings back to PHASE A                   │   │
│  │         → if pass → BUILD APPROVED                                  │   │
│  │                                                                     │   │
│  │  → autoDeactivate() — tool locks itself                             │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                         │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                   TRIDENT_BUILD SUBAGENT (8+ files)                  │   │
│  │  src/subagents/trident-build/                                       │   │
│  │  ├── index.ts                    Entry + hook factory                │   │
│  │  ├── identity/                                                      │   │
│  │  │   ├── agent-identity.ts       isTridentBuildAgent()              │   │
│  │  │   └── t1-prompt.ts            T1 system prompt                   │   │
│  │  ├── hooks/                                                         │   │
│  │  │   ├── index.ts                Hook factory                        │   │
│  │  │   ├── guardian-hook.ts        CODE-enforced enforcement          │   │
│  │  │   ├── gate-hook.ts            Evidence + tracking                │   │
│  │  │   └── system-transform.ts     Identity injection                  │   │
│  │  ├── harness/                                                        │   │
│  │  │   ├── semantic-engine.ts      AST analysis (5 checks)            │   │
│  │  │   ├── theatrical-block.ts     20+ patterns (3 severity levels)   │   │
│  │  │   ├── runtime-grade.ts        P1-P10 + E10 + L5.x enforcement    │   │
│  │  │   ├── evidence-pipeline.ts    Merkle chain tracking              │   │
│  │  │   └── enforcement-error.ts    EnforcementError class             │   │
│  │  ├── shared/                                                         │   │
│  │  │   ├── state-store.ts          Map<sessionId, State>              │   │
│  │  │   └── agent-state.ts          Session-scoped tracking            │   │
│  │  └── tools/                                                          │   │
│  │       └── build-status.ts        Status reporting                   │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Agents (3)

| Agent | Type | Mode | Color | Description |
|-------|------|------|-------|-------------|
| **trident** | Primary | primary | `#8B5CF6` | God Loop orchestrator — 17-layer audit engine, Poseidon Mode, all 10 tools |
| **trident_explore** | Subagent | subagent | — | Read-only context ingestion scout for parallel information gathering |
| **trident_build** | Subagent | subagent | `#0066CC` | Runtime-grade build engineer — executes remediation plans verbatim |

---

## Tools (10)

### Mode Tools (5):

| Tool | Description | Output |
|------|-------------|--------|
| `trident-code-audit` | 17-layer AST-powered audit (R0-R16) with confidence scoring | CODE_REVIEW artifact |
| `trident-deep-planning` | 3-layer plans (L1 first-principles, L2 workflow, L3 context-lib) | BUILD_SPEC + CONTEXT_LIBRARY |
| `trident-problem-solving` | 6-layer reasoning (assumption→action→observe→gap→meta→verify) | PLAN artifact |
| `trident-context-synthesis` | 4-layer synthesis (collect→score→compress→inject) | T1_INJECTABLE / T2_KNOWLEDGE |
| **`trident-poseidon`** | **God Loop orchestrator — quality-enforced build execution with auto-lock** | **BUILD REPORT** |

### Support Tools (5):

| Tool | Description |
|------|-------------|
| `trident-gate` | Evaluate specific audit layers (R0-R16) |
| `trident-status` | Current Trident state (mode, layer, iteration, artifacts) |
| `trident-vision` | Analyze images using GLM-4.6V-Flash VLM via llama-server API |
| `trident-help` | Reference for all commands and modes |
| `trident-poseidon` (status/abort) | Check loop status or send abort signal |

---

## 17-Layer Audit Engine (R0-R16)

Every finding includes: **confidence score**, **AST construct trace**, **call graph reference**, **mechanical evidence gate**.

| Layer | Name | Purpose |
|-------|------|---------|
| R0 | Build Chain | Build pipeline integrity, dependency resolution |
| R1 | Hook Contract | Hook registration compliance, lifecycle validation |
| R2 | State Machine | FSM correctness, state transition validation |
| R3 | Async Correctness | Promise handling, fire-and-forget detection |
| R4 | Error Handling | Error path completeness, no empty catches |
| R5 | Container Deploy | Container test compliance, deployment manifest |
| R6 | Dependency Integrity | Package.json validation, dependency graph |
| R7 | Config Schema | Plugin config schema validation |
| R8 | Source Hygiene | Code style, naming, dead code detection |
| R9 | Runtime Contract | Hook output contract verification |
| R10 | Invocation Integrity | Tool call verification, dead function detection |
| R11 | Theatrical Integrity | Theatrical code detection — stub returns, `{blocked: false}` |
| R12 | Cross-Plugin Isolation | Cross-agent identity leak detection |
| R13 | Data Flow Analysis | `any` type detection, unsafe casts |
| R14 | Control Flow Graph | Unreachable code, silent catch detection |
| R15 | Container Pre-flight | Container environment validation |
| R16 | Bible Enforcement | P1-P10 mechanical checks |

---

## Semantic Activation System

### PoseidonDetector

Poseidon Mode cannot be activated by the agent — it requires explicit user consent via natural language:

```
User Message
  → regex first-pass: /\bposeidon\b/i
  → semantic second-pass: signal word scoring
    → ON_SIGNALS: activate, enable, start, engage, unlock, begin,
                   initiate, power, wake, arm, ignite, launch, open,
                   unleash, awaken, summon, enter
    → OFF_SIGNALS: disable, off, stop, revoke, deactivate, disengage,
                    lock, end, terminate, shut, close, cancel, abort,
                    halt, suspend, finish, complete, exit, quit, sleep
    → negation detection: /don'?t\s+(activate|enable|...)/i,
                          /(no|not|never)\s+poseidon/i
  → returns { detected, action: 'activate'|'deactivate', confidence }
```

### PoseidonState

Session-scoped state machine:

```
interface PoseidonSession {
  active: boolean;
  activatedAt: number;
  lastActivityAt: number;
  cycles: number;
  cyclesSinceImprovement: number;
  currentScore: number;
  highestScore: number;
  targetPath: string;
  abortFlag: boolean;
}
```

- `isActive()` returns `false` for unknown sessions (safe default — tool stays locked)
- `autoDeactivate()` called in trident-poseidon tool's `finally` block
- On session end: state cleared via `session.ended` hook cleanup

---

## God Loop Orchestrator

### GodLoopOrchestrator.runLoop()

```
while cycle < maxCycles:
  1. PHASE A: Trident runs 17-layer audit on target source
  2. Extract score from audit output (regex patterns: "Score: N/100", "N%", "pass rate: N")
  3. if score >= 96% → break to PHASE D
  4. Generate remediation plan (exact file:line:fix format)
  5. PHASE B: Dispatch Trident_Build subagent via task()
     - Plan format: CRITICAL FINDINGS list with FILE:LINE:ISSUE:FIX
     - Trident_Build must execute ALL fixes verbatim
     - Returns changed files with SHA256 hashes
  6. Archive cycle evidence
  7. Increment cycle counter → GOTO PHASE A
  8. PHASE D: If 96%+ → container validation (11 tests + 8 checks)
  9. autoDeactivate() — lock the tool
```

### Remediation Plan Format

```
## CYCLE {N} REMEDIATION PLAN
## Current Score: {score}/100
## Verdict: {NOT_RUNTIME_GRADE | APPROACHING | RUNTIME_GRADE}

### CRITICAL FINDINGS (fix ALL — do not skip):

1. FILE: {relative/path} LINE: {line}
   ISSUE: {one-line description}
   FIX: {exact instruction — what to change}

### INSTRUCTIONS:
- Fix ALL findings in ONE batch
- Do NOT skip, add features, or refactor unrelated code
- Build after fixing: <EXACT BUILD COMMAND>
- Report every changed file with SHA256 hash
```

---

## Trident_Build Subagent

### Fixes Applied vs v4.7 Baseline

| Bug | Original Issue | Fix Applied |
|-----|---------------|-------------|
| **A** | `system-transform-hook.ts` wrong import path | Correct relative path |
| **B** | `state-store.ts` duplicate key `'shark-context'` | Removed duplicate |
| **C** | `shark-status.ts` dead code branch (`if variant === 'micro'`) | Removed unreachable branch |
| **D** | Test runner hardcoded `/home/leviathan/...` paths | `process.cwd()` + relative paths |
| **E** | Regex-based gate advancement (fragile) | Evidence-based verification |
| **F** | Single-session module variables | `Map<sessionId, State>` pattern |
| **G** | No compaction survival (no-op hook) | Cache invalidation + state export |
| **H** | No semantic intelligence | SemanticEngine + TheatricalBlock |
| **I** | No anti-derailment (L5) | L5.x enforcement from Trident v4.3.3 |
| **J** | No contextual firewall | Phase-aware tool blocking |

### Harness Components

**SemanticEngine** (from Manta v2.3, adapted):
- 5 AST checks: theatrical return detection, hardcoded path detection, empty catch detection, mock-in-production detection, dead code detection
- MULTI-CONDITION CONJUNCTION: ALL conditions must be true before flagging

**TheatricalBlock** (from Manta v2.3, adapted):
- 20+ regex patterns across 3 severity levels:
  - CRITICAL (10): `return {blocked:false}`, empty catch, "I saw it work", `return true;//TODO`, mock/stub, `process.exit(0)`, `return { ok: true }`, `return []`, hardcoded paths, phantom test
  - HIGH (6): TODO/FIXME, console.log, debugger, empty function, dead code, unused imports
  - MEDIUM (4): `any as`, `var`, `@ts-ignore`, `eval`
- Only fires on write/edit tools (not mode/planning tools)

**RuntimeGradeEngineer** (from Manta v2.3, adapted):
- P1: ESM/CJS import mismatch
- P2: >5 unsafe `as` casts
- P3: Empty catch blocks
- P4: setInterval without clearInterval
- P5: Hardcoded paths (CRITICAL — blocks before disk)
- P6: npm/bun/yarn install without lock file
- P7: Path traversal
- P8: Invalid JSON config
- P9: Top-level await in non-async context
- P10: Implicit any return type
- E10: Evidence claims without proof
- L5.x: Anti-derailment (success claims, mocks, scope creep, etc.)

**EvidencePipeline** (from Manta v2.3, adapted):
- Merkle chain on every tool execution
- SHA-256 chain: `{ hash, previousHash, timestamp, tool, passed, dataHash }`

---

## Evidence Archival

Every God Loop cycle is archived to disk:

```
.trident/poseidon-audits/{sessionId}/
├── cycle_1/
│   ├── AUDIT_RAW.md              Full 17-layer audit output
│   ├── SCORE.txt                 Extracted score
│   ├── PLAN.md                   Remediation plan sent to Trident_Build
│   ├── BUILD_RESULT.md           Build output
│   ├── CHANGED_FILES.json        File paths + SHA256 hashes
│   └── SELF_SCORE.txt            Honest self-assessment
├── cycle_2/
│   └── ...
├── FINAL_SCORE.txt               Final score when loop exits
├── CONTAINER_RESULT.json         Container test results
└── LOOP_SUMMARY.md               Human-readable summary

Compaction survival files:
├── LOOP_STATE.md                 Current cycle, score, target, highest score
├── NEXT_STEPS.md                 What needs to happen next
└── SESSION_ANCHOR.md             Session ID, container name, PID
```

---

## Tool Status Output Format

```
## POSEIDON MODE — BUILD REPORT

### Final Score: 97/100 — RUNTIME GRADE

### Loop Statistics
- Total Cycles: 7
- Highest Score: 97/100
- Starting Score: 12/100
- Nodes Fixed: 24
- Total Artifacts: 14

### Phase Results
| Phase | Cycles | Result |
|-------|--------|--------|
| AUDIT | 1 | Baseline: 12/100 — 24 findings |
| PLAN→EXECUTE→RE-AUDIT | 5 | Scores: 34→58→72→89→97 |
| CONTAINER TEST | 1 | Passed: 11/11 tests, 8/8 checks |

### Auto-Deactivation
Poseidon Mode has been locked. The agent cannot re-activate it.
Say "Poseidon Mode Activate" when ready to build again.
```

---

## Identity System

- v4.3.2 guard pattern: `getCurrentAgent()` only — no `input?.agent` fallback chain
- Dedup check via IDENTITY BINDING marker prevents double injection
- Deload removes trident content on agent switch
- `break` in SCAN+REPLACE after first match
- T1 splice at index 1 (per OPERATIONAL_IDENTITY_BIBLE.md §5.3)
- compactingHook guard runs BEFORE identity injection
- `output.args` read at all tool.execute.before enforcement points
- Trident_Build has its OWN identity system: `isTridentBuildAgent()`, separate T1 prompt, separate hooks

---

## Bundle Integrity

```bash
md5sum dist/index.js
# fce6d7a16fc4cfe70d99bddec752cc83
```

---

## Source Structure

```
src/
├── index.ts                              # Plugin entry — registers trident_build subagent
├── orchestrator.ts                       # Pure TS FSM (add/stop Poseidon)
├── config.ts                             # Plugin config
├── agents/
│   └── definitions.ts                    # Agent definitions + tool lists
├── hooks/
│   ├── trident-hooks.ts                  # 8 hooks + Poseidon detection in chatMessageHook
│   ├── session-hook.ts                   # Session init
│   ├── guardian-hook.ts                  # Runtime guardian + trident-poseidon in TRIDENT_TOOLS
│   └── identity-enforcer-hook.ts         # Identity enforcement
├── tools/
│   ├── trident-tools.ts                  # Tool registry — adds trident-poseidon
│   ├── trident-poseidon.ts               # NEW: God Loop orchestrator tool
│   └── trident-vision.ts                 # VLM integration
├── poseidon/
│   ├── poseidon-state.ts                 # NEW: Session-scoped state management
│   ├── god-loop.ts                       # NEW: God Loop orchestrator
│   └── evidence.ts                       # NEW: Evidence archival
├── fsm/
│   ├── orchestrator-machine-v2.ts        # Adds POSEIDON to TridentMode + MODE_LAYER_MAP
│   ├── deep-planning-machine.ts
│   ├── problem-solving-machine.ts
│   └── context-synthesis-machine.ts
├── artifacts/
│   ├── code-review-artifact.ts
│   ├── context-synthesis-artifact.ts
│   ├── deep-planning-artifact.ts
│   └── problem-solving-artifact.ts
├── audit-engine/
│   ├── index.ts                          # 17 layers registered
│   ├── layers/                           # R0-R16 implementations
│   └── ...                               # scoring, types, preflight
├── modes/
│   ├── context-synthesis.ts
│   ├── deep-planning.ts
│   ├── problem-solving.ts
│   └── context-synthesis-engine.ts
├── security/
│   ├── tool-allowlist.ts                 # Adds trident-poseidon
│   └── path-containment.ts
├── identity/
│   ├── index.ts                          # Updated identity header
│   ├── agent-identity.ts                 # Adds trident_build recognition
│   ├── identity-enforcer.ts
│   ├── loader.ts
│   └── trident/                          # Identity .md files
├── shared/
│   ├── trident-warhead-synthesizer.ts
│   ├── warheads/                         # 12 warhead implementations
│   └── ...
├── warheads/
│   ├── nlp-pipeline/
│   │   ├── poseidon-detector.ts          # NEW: Semantic detection
│   │   ├── intent-router.ts              # Updated with Poseidon verb frames
│   │   └── ...
│   └── ... (concurrency, container-testing, etc.)
├── subagents/
│   └── trident-build/                    # NEW: Full subagent (8+ files)
│       ├── index.ts
│       ├── identity/
│       ├── hooks/
│       ├── harness/
│       ├── shared/
│       └── tools/
├── context-library/                      # 9 .md files
├── evidence/                             # Merkle chain, evidence store
├── nlp/                                  # PEG grammars, intent parsing
├── tests/                                # Property-based tests
└── types.ts
```

---

## Deployment

```bash
# Copy the plugin bundle
cp dist/index.js ~/.config/opencode/plugins/trident/dist/index.js
```

### opencode.json Reference

```json
{
  "plugin": [
    "file:///path/to/plugins/trident/dist/index.js"
  ],
  "agent": {
    "trident": {
      "color": "#8B5CF6",
      "mode": "primary"
    }
  },
  "mcp": {}
}
```

---

## Build from Source

```bash
cd src
bun install
bun run build
# Output: dist/index.js
```

---

## Previous Versions

- `archive/v4.3.3` — PRE_SYNTHESIZED_T1 warhead system with L5 firewall enforcement, 16-warhead architecture, 18-layer audit (R0-R17), R17 Theatrical Integrity detectors (D1-D10)
- `archive/v4.3.1-T3` — Legacy T3 architecture
- `v4.3.2` — Stable release with warhead registry, 7-Q enforcement

---

## License

MIT
