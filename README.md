# TRIDENT v4.3.3 — Algorithmic Audit Engine

**Status:** ✅ RUNTIME GRADE — 18-LAYER AUDIT ENGINE — ORCHESTRATOR NEVER BLOCKS
**Bundle:** 14.5 MB (251,731 lines ESM)
**Runtime:** opencode 1.14.43+

---

## Overview

Trident v4.3.3 is a runtime-grade algorithmic audit engine plugin for opencode. It is a **documentation-only agent**: it produces findings, fix plans, and deployment manifests — it never edits code.

The engine is built around a **16-warhead architecture** (HookRegistry-based plugin system), an **18-layer AST-powered audit pipeline (R0-R17)** including the new R17 Theatrical Integrity layer (10 detectors D1-D10), a **6-gate workflow state machine**, an **NLP-driven theatrical code detector** with peggy grammars, all orchestrated by a **pure TypeScript FSM orchestrator** with the core principle: **the orchestrator is a REPORTER, not a GATE — no tool is ever blocked by state.**

### Key Improvements in v4.3.3

- **R17 Theatrical Integrity Layer (D1-D10):** Catches whitespace-padded templates, cookie-cutter structures, stub returns, silent catches, phantom tests, fire-and-forget promises, placeholder code, documentation drift, config theater, and pipeline no-ops
- **Orchestrator never blocks:** `startMode()` always resets, `advanceLayer()` auto-recovers from COMPLETE, `transition()` logs instead of throws — any tool callable at any time
- **Semantic layer detection:** Deep-planning automatically detects Layer 1 (generative prompt, output in chat), Layer 2 (build spec, .md file), Layer 3 (context library, 9 .md files) based on user intent
- **`output.args` fix:** 7-Q enforcement and all hooks read tool args from `output.args`, not `input.args` — the correct opencode SDK contract
- **v4.3.2 guard pattern restored:** All 4 hooks use `getCurrentAgent()` with early return — no identity leakage to non-trident sessions
- **PRE_SYNTHESIZED_T1 bloat removed:** 47KB of whitespace-padded theatrical templates eliminated from T1 injection path
- **Identity system:** Dedup check, deload on agent switch, `break` in SCAN+REPLACE, T1 splice at index 1 per OPERATIONAL_IDENTITY_BIBLE.md

---

## Architecture

```
                  +-----------------------+
                  |     opencode.json      |
                  |   (Plugin Registrar)   |
                  +-----------+-----------+
                              | loads
                  +-----------v-----------+
                  |    TRIDENT v4.3.3      |
                  |   (dist/index.js)      |
                  +-----------+-----------+
                              | hooks into
          +-------------------+-------------------+
          |                   |                   |
   +------v------+   +-------v-------+   +-------v--------+
   |  event      |   |  tool.before  |   |  identity &    |
   |  hook       |   |  output.args  |   |  deload/dedup  |
   |  (session   |   |  fix applied  |   |  (v4.3.2       |
   |   init)     |   |  7-Q gate     |   |   pattern)      |
   +-------------+   +-------+-------+   +----------------+
                             |
                             v
                    +------------------+
                    | 18-Layer Audit   |
                    | Engine (R0-R17)  |
                    +--------+---------+
                             |
                             v
                    +------------------+
                    |  Pure TS FSM     |
                    |  Orchestrator    |
                    |  (never blocks)  |
                    +------------------+
```

---

## Agents (2)

| Agent | Type | Mode | Description |
|-------|------|------|-------------|
| trident | Primary | primary | Full audit engine — all 8 tools, code review, deep planning, problem solving, context synthesis |
| trident_explore | Subagent | subagent | Read-only context ingestion — deep reading, pattern extraction, V1/V2 synthesis protocol |

---

## Tools (8)

### Mode Tools:

| Tool | Description | Output |
|------|-------------|--------|
| `trident-code-audit` | 18-layer AST-powered audit (R0-R17) with confidence scoring | CODE_REVIEW.md |
| `trident-deep-planning` | 3 layers with semantic detection: L1 (generative prompt, in chat), L2 (build spec, .md), L3 (context library, 9 .md files) | BUILD_SPEC + CONTEXT_LIBRARY |
| `trident-problem-solving` | 6-layer reasoning chain (assumption → action → observe → gap → meta → verify) | PLAN.md |
| `trident-context-synthesis` | 4-layer context synthesis (collect → score → compress → inject), T1 injectable or T2 knowledge file | T1_INJECTABLE.md / T2_KNOWLEDGE.md |

### Support Tools:

| Tool | Description |
|------|-------------|
| `trident-gate` | Evaluate specific audit layers (R0-R17) |
| `trident-status` | Current Trident state (mode, layer, iteration, artifacts) |
| `trident-vision` | Analyze images using GLM-4.6V-Flash VLM |
| `trident-help` | Reference for all commands and modes |

---

## 18-Layer Audit Engine (R0-R17)

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
| R17 | Theatrical Integrity (D1-D10) | Content quality — whitespace padding, template repetition, stub returns, silent catches, phantom tests, fire-and-forget, placeholder code, documentation drift, config theater, pipeline no-ops |

---

## Orchestrator (Never Blocks)

The orchestrator is a **REPORTER, not a GATE**:

- `startMode()` always resets — no status check, no throw
- `advanceLayer()` auto-recovers from COMPLETE, ERROR, or TIMEOUT — never throws
- `transition()` logs irregular transitions instead of throwing
- Any tool callable at any time, in any order, at any point in a session
- State tracked for `trident-status` reporting only

---

## Warhead Architecture (16 Warheads)

| Warhead | Module | Purpose |
|---------|--------|---------|
| Gates | `warhead-gates.ts` | Audit layer progression (R0-R17 tracking) |
| Identity Layer | `warhead-identity-layer.ts` | Cross-agent identity isolation |
| NLP | `warhead-nlp.ts` | Intent parsing, theatrical detection |
| Persistence | `warhead-persistence.ts` | Session state, Merkle chain |
| Testing | `warhead-testing.ts` | Property-based test orchestration |
| Runtime Grade | `warhead-runtime-grade.ts` | Bible compliance enforcement |
| TypeScript Compiler | `warhead-tscompiler.ts` | AST analysis, call graphs |
| Concurrency | `warhead-concurrency.ts` | Token bucket, circuit breaker |
| Dynamic State | `warhead-dynamic-state.ts` | Mode switching, state tracking |
| Explore | `warhead-explore.ts` | Swarm deployment protocol |
| Common Sense | `warhead-common-sense.ts` | Knowledge library probing |
| Distilled Knowledge | `warhead-distilled-knowledge.ts` | KB file technique counting |
| Container Testing | `warheads/container-testing/` | Docker + tmux control |
| Seven-Q Enforcement | `warheads/seven-q-enforcement/` | Pre-tool mechanical gate |
| P1-P10 Scanner | `warheads/p1-p10-scanner/` | Principle verification |
| XState FSM | `warheads/xstate-fsm/` | Machine definitions |
| TS Compiler API | `warheads/ts-compiler-api/` | Local ts.Program wrapper |
| NLP Pipeline | `warheads/nlp-pipeline/` | wink-nlp intent routing |

---

## Identity System

- v4.3.2 guard pattern: `getCurrentAgent()` only — no `input?.agent` fallback chain
- Dedup check prevents double injection
- Deload removes trident content on agent switch
- `break` in SCAN+REPLACE after first match
- T1 splice at index 1 (per OPERATIONAL_IDENTITY_BIBLE.md §5.3)
- compactingHook guard runs BEFORE identity injection
- `output.args` read at all 4 tool.execute.before enforcement points

---

## Bundle Integrity

```bash
sha256sum dist/index.js
# 0f02e60e8c5fc3aaa6d497c3b50108ac91cde043e8926bb7a447713e6d26a7ee
```

---

## Source Structure

```
src/
├── index.ts                  # Plugin entry point
├── orchestrator.ts           # Pure TS FSM (never blocks)
├── agents/                   # Agent definitions
├── hooks/
│   ├── trident-hooks.ts      # 8 hook handlers (output.args fix)
│   ├── session-hook.ts       # Session init
│   ├── guardian-hook.ts      # Runtime guardian
│   └── identity-enforcer-hook.ts
├── tools/
│   ├── trident-tools.ts      # 8 tools (semantic detection)
│   └── trident-vision.ts     # VLM integration
├── artifacts/
│   ├── deep-planning-artifact.ts  # L1/L2/L3 split
│   ├── context-synthesis-artifact.ts
│   ├── problem-solving-artifact.ts
│   └── code-review-artifact.ts
├── audit-engine/
│   ├── index.ts              # 18 layers registered
│   ├── layers/               # R0-R17 implementations
│   └── ...                   # scoring, types, preflight
├── modes/                    # Mode validation modules
├── fsm/                      # XState machine definitions
├── shared/
│   ├── trident-warhead-synthesizer.ts  # No PRE_SYNTHESIZED_T1
│   └── warheads/             # 12 warhead implementations
├── warheads/                 # 7 dedicated warheads
├── identity/                 # Identity files
├── evidence/                 # Merkle chain, evidence store
├── security/                 # Allowlist, path containment
├── nlp/                      # PEG grammars, intent parsing
└── tests/                    # Property-based tests
```

---

## R17 Theatrical Integrity Detectors

| Detector | Name | Severity | What It Catches |
|----------|------|----------|-----------------|
| D1 | WHITESPACE_PADDING | CRITICAL | String literals with >15% trailing whitespace |
| D2 | COOKIE_CUTTER_TEMPLATE | CRITICAL | Array literals with >70% word-overlap similarity |
| D3 | STUB_RETURN | CRITICAL | Functions returning hardcoded success without real work |
| D4 | SILENT_CATCH | CRITICAL | Catch blocks with empty or comment-only bodies |
| D5 | PHANTOM_TEST | CRITICAL | Test functions with zero assertion calls |
| D6 | FIRE_AND_FORGET | HIGH | Async functions with no await and no try/catch |
| D7 | PLACEHOLDER_CODE | HIGH | Functions with >10% TODO/FIXME marker ratio |
| D8 | DOCUMENTATION_DRIFT | HIGH | JSDoc return types that don't match actual code |
| D9 | CONFIG_THEATER | MEDIUM | Config keys defined but never referenced |
| D10 | PIPELINE_THEATER | HIGH | CI commands that intentionally no-op |

R17 self-audits (`auditSelf: true`) — catches issues in its own code.

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
      "mode": "primary"
    }
  }
}
```

---

## Build from Source

```bash
cd src
npm install
npx tsc --noEmit
npx esbuild index.ts --bundle --platform=node --format=esm --target=node22 \
  --external:@opencode-ai/plugin --external:zod \
  --outfile=../dist/index.js \
  --banner:js='import { createRequire } from "module"; const require = createRequire(import.meta.url);'
```

---

## Infrastructure

See [INFRASTRUCTURE.md](./INFRASTRUCTURE.md) for full layer reference, build instructions, and version history.
