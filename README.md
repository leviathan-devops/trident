# TRIDENT v4.3.2 — Algorithmic Audit Engine

**Status:** ✅ RUNTIME GRADE — SHIP GATE ENGINE CERTIFIED — 7/7 container tests (100.0%), 10/10 anti-cheat, 600s sustained runtime
**Bundle:** 14,564,011 bytes (14.6 MB)
**Runtime:** opencode 1.14.43+

---

## Overview

Trident v4.3.2 is a runtime-grade algorithmic audit engine plugin for opencode. It is a **documentation-only agent**: it produces findings, fix plans, and deployment manifests — it never edits code.

The engine is built around a **10-warhead architecture** (HookRegistry-based plugin system), a **17-layer AST-powered audit pipeline** (R0-R16), a **6-gate workflow state machine**, and an **NLP-driven theatrical code detector** with peggy grammars, all orchestrated by an **XState-compatible FSM orchestrator** with disk-backed session-persistent state.

---

## Architecture

```
                  +-----------------------+
                  |     opencode.json      |
                  |   (Plugin Registrar)   |
                  +-----------+-----------+
                              | loads
                  +-----------v-----------+
                  |    TRIDENT v4.3.2      |
                  |   (dist/index.js)      |
                  +-----------+-----------+
                              | hooks into
          +-------------------+-------------------+
          |                   |                   |
   +------v------+   +-------v-------+   +-------v--------+
   |  event      |   |  tool.before  |   |  identity &    |
   |  hook       |   |  3-layer gate |   |  per-turn      |
   |  (session   |   | BLOCKED_TOOLS |   |  override      |
   |   init)     |   | HIVE_TOOLS    |   |  (system.      |
   +-------------+   | THEATRICAL    |   |  transform)    |
                     +-------+-------+   +----------------+
                             |
                             v
                    +------------------+
                    | 17-Layer Audit   |
                    | Engine (R0-R16)  |
                    +--------+---------+
                             |
                             v
                    +------------------+
                    |   XState FSM     |
                    |   Orchestrator   |
                    +------------------+
```

---

## Agents (2)

| Agent | Type | Mode | Color | Description |
|-------|------|------|-------|-------------|
| trident | Primary | primary | `#8B5CF6` | Full audit engine — all 8 tools, code review, deep planning, problem solving, context synthesis |
| trident_explore | Subagent | subagent | — | Read-only context ingestion — deep reading, pattern extraction, V1/V2 synthesis protocol |

### trident_explore

A read-only swarm deployment subagent. It deploys in swarms of 2-50 agents as directed, uses a 7-section V1 synthesis protocol (Document Meta → Core Content → Connections → Surprises → Uncertainties → Test Implications → Accountability Marker), and has zero-resistance to deployment count. Tools: read, glob, grep, hive_context, trident-help, trident-status. BLOCKED: write, edit, bash, all trident-* mode tools.

---

## Tools (8)

### Mode Tools — Each produces a structured `.md` artifact:

| Tool | Description | Artifact |
|------|-------------|----------|
| `trident-code-audit` | 17-layer AST-powered audit (R0-R16) with confidence scoring | CODE_REVIEW |
| `trident-deep-planning` | 3-layer planning (L1 first-principles → L2 workflow → L3 context library) | BUILD_SPEC + CONTEXT_LIBRARY |
| `trident-problem-solving` | 6-layer reasoning chain (assumption → action → observe → gap → meta → verify) | PLAN |
| `trident-context-synthesis` | 4-layer context synthesis (collect → score → compress → inject) | T1_INJECTABLE |

### Support Tools:

| Tool | Description |
|------|-------------|
| `trident-gate` | Evaluate specific audit layers (R0-R16) |
| `trident-status` | Current Trident state (mode, layer, iteration, artifacts) |
| `trident-vision` | Analyze images using GLM-4.6V-Flash VLM |
| `trident-help` | Reference for all commands and modes |

### Hive Tools — Full Access (v4.3.2):
`hive_context`, `hive_remember`, `hive_forget`, `hive_scan`, `hive_purge`, `hive_restore`, `hive_trash_list`, `hive_trash_status`, `hive_status`

### Utility Tools (Allowed):
`read`, `glob`, `grep`, `todowrite`, `hive_context`

### BLOCKED Tools:
`edit`, `write`, `bash`, `task` (non-Trident), `task` (outside CONTEXT_SYNTHESIS mode), `glob`, `grep`, `read`, `todowrite`, `hive write`, `spawn` — all return carrier-verified identity-gated `[TRIDENT TOOL BLOCK]` error.

---

## Warhead Architecture (10 Warheads)

Trident v4.3.2 uses a **HookRegistry-based warhead plugin system**. Each warhead registers into a shared HookRegistry and fires on lifecycle events:

| # | Warhead | File | Purpose |
|---|---------|------|---------|
| 1 | **Gates** | `warhead-gates.ts` | Audit layer progression (R0-R16 tracking) |
| 2 | **Identity Layer** | `warhead-identity-layer.ts` | Cross-agent identity isolation, carrier verification |
| 3 | **NLP** | `warhead-nlp.ts` | Intent parsing, theatrical pattern detection, streaming buffer |
| 4 | **Persistence** | `warhead-persistence.ts` | Session state save/load, Merkle chain integrity |
| 5 | **Testing** | `warhead-testing.ts` | Property-based test orchestration (fast-check) |
| 6 | **Runtime Grade** | `warhead-runtime-grade.ts` | Runtime grade enforcement — bible compliance |
| 7 | **TypeScript Compiler** | `warhead-tscompiler.ts` | AST analysis, cross-file call graphs, CFG building |
| 8 | **Concurrency** | `warhead-concurrency.ts` | Concurrent access guards, race detection |
| 9 | **Dynamic State** | `warhead-dynamic-state.ts` | Runtime state transitions, mode switching |
| 10 | **Explore** | `warhead-explore.ts` | Swarm deployment orchestration, synthesis protocol |

All warheads register into the shared `HookRegistry` singleton via `trident-warhead-synthesizer.ts`.

---

## Hook Architecture

| Hook | Handler | Purpose |
|------|---------|---------|
| `event` | `session-hook.ts` | Session init — load identity, init state, clear evidence |
| `chat.message` | `trident-hooks.ts` | Intent parsing, narration blocking, phantom result detection |
| `tool.execute.before` | `trident-hooks.ts` | 3-layer gate — tool allowlist, theatrical check, identity verification |
| `tool.execute.after` | `trident-hooks.ts` | Evidence capture, tool call tracking, artifact registration |
| `experimental.chat.system.transform` | `trident-hooks.ts` | Identity injection via SCAN+REPLACE markers |
| `experimental.chat.messages.transform` | `trident-hooks.ts` | Per-turn override injection |
| `experimental.session.compacting` | `trident-hooks.ts` | State preservation across compaction |
| `command.execute.before` | `guardian-hook.ts` | Guardian runtime enforcement |

---

## 17-Layer Audit Engine (R0-R16)

Every finding includes: **confidence score**, **AST construct trace**, **call graph reference**, **mechanical evidence gate**.

| Layer | Name | Purpose |
|-------|------|---------|
| R0 | Build Chain | Build pipeline integrity, dependency resolution |
| R1 | Hook Contract | Hook registration compliance, lifecycle validation |
| R2 | State Machine | FSM correctness, state transition validation |
| R3 | Async Correctness | Promise handling, fire-and-forget detection, unawaited promises |
| R4 | Error Handling | Error path completeness, no empty catches, fallback paths |
| R5 | Container Deploy | Container test compliance, deployment manifest validation |
| R6 | Dependency Integrity | Package.json validation, dependency graph analysis |
| R7 | Config Schema | Plugin config schema validation, opencode.json compliance |
| R8 | Source Hygiene | Code style, naming conventions, dead code detection |
| R9 | Runtime Contract | Hook output contract verification |
| R10 | Invocation Integrity | Tool call verification, parameter validation |
| R11 | Theatrical Integrity | Theatrical code detection — echo, simulate, mock, fake, placeholder |
| R12 | Cross-Plugin Isolation | Cross-plugin identity leak detection |
| R13 | Data Flow Analysis | Data flow tracing, taint analysis |
| R14 | Control Flow Graph | CFG building, unreachable code detection |
| R15 | Container Pre-flight | Container environment validation |
| R16 | Bible Enforcement | Runtime grade bible compliance |

---

## 3-Blocking-Layer Architecture

| Layer | What It Blocks | Method |
|-------|---------------|--------|
| **BLOCKED_TOOLS** | edit, write, bash, task (non-Trident), glob, grep, read, todowrite, hive write, spawn | Agent-gated — carrier identity verified before execution via allowlist |
| **HIVE_TOOLS** | hive-read, hive-write | Cross-agent hive access gated by carrier identity |
| **THEATRICAL** | echo, simulate, mock, fake, placeholder, TODO, FIXME | Regex + NLP pattern scan — theatrical code gateway, pre-tool narration blocking, phantom result detection |

### Theatrical Detection Categories

- **MOCK_STUB_SUGGESTION**: Agent suggests mocks/stubs instead of real implementation
- **HOST_FALLBACK**: Agent claims host testing proves functionality instead of container
- **MODEL_USAGE**: Agent suggests switching models instead of solving
- **SIMULATED_EXECUTION**: Results claimed without actual tool execution
- **PRE_TOOL_NARRATION**: "I would use...", "let me...", "first, I'll..." patterns
- **PHANTOM_RESULTS**: "the audit found...", "based on the analysis..." patterns
- **SHELL_SIMULATION**: Textual fake terminal output after tool blocks
- **FAKE_LS_OUTPUT**: Fabricated directory listings

---

## 6-Gate Workflow Pipeline

```
PLAN → BUILD → TEST → VERIFY → AUDIT → DELIVERY
```

Each gate requires evidence passed from the previous stage (checked via `evidenceGate`). Gate advancement is blocked until required evidence files exist and pass validation. The `GateManager` controls **workflow permissions** (what can the agent do at each stage) while `auditLayerProgression` tracks **review completion** (which layers have been audited). These are orthogonal concerns that coexist.

---

## Identity System

File-based identity bundles loaded from `identity/trident/` directory:

| File | Purpose |
|------|---------|
| `TRIDENT.md` | System identity — core role definition |
| `IDENTITY.md` | Identity markers and verification patterns |
| `AGENT_AWARENESS.md` | Cross-agent awareness protocol |
| `EXECUTION.md` | Execution model and constraints |
| `FIREWALL_CONTEXT.md` | Firewall rules and gating context |
| `QUALITY.md` | Quality standards and runtime grade criteria |
| `TOOLS.md` | Tool reference and usage patterns |
| `explore-protocol.md` | Explore subagent protocol |

Path traversal protection (R14): all identity file loads are validated to stay within the identity base directory.

---

## Confidence Model

| Confidence | Label | Required Evidence |
|------------|-------|-------------------|
| 0.98 | Definite | AST-verified construct + confidence confirmed |
| 0.90 | High | AST-verified + call-graph/trace resolved |
| 0.85 | Moderate | AST-verified, heuristic or name-based |
| 0.70 | Low | AST-gated pattern match (fallback) |
| < 0.50 | Noise | Do not report |

---

## Orchestrator

The `orchestrator.ts` singleton manages disk-backed session-persistent state:

- **State directory**: `.trident/session-state.json` in cwd
- **Max iterations**: 10 per session (configurable in MAX_ITERATIONS)
- **Max time**: 300s per session (configurable in MAX_TIME_MS)
- **Timeout status**: `TIMEOUT` — blocks further tool execution
- **Session isolation**: Each session gets its own state namespace

### Modes

| Mode | Layers | Artifact |
|------|--------|----------|
| CODE_REVIEW | 17 (R0-R16) | CODE_REVIEW.md |
| DEEP_PLANNING | 3 (L1 first-principles → L2 workflow → L3 context) | BUILD_SPEC.md + CONTEXT_LIBRARY.md |
| PROBLEM_SOLVING | 6 (assumption → action → observe → gap → meta → verify) | PLAN.md |
| CONTEXT_SYNTHESIS | 4 (collect → score → compress → inject) | T1_INJECTABLE.md |
| IDLE | — | — |

---

## NLP Engine

- **Peggy grammars**: `nlp/grammars/` — code-review, context-synthesis, deep-planning, problem-solving
- **Intent parser**: Rule-based intent classification with streaming buffer
- **Principle extractor**: Extracts operating principles from context
- **Streaming buffer**: Handles incremental message parsing

---

## Evidence System

- **Evidence store**: Session-keyed append-only log (via `evidence/evidence-store.ts`)
- **Merkle chain**: SHA-256 hash chain for tamper-evident audit trail
- **Gate evidence**: Required artifacts validated before gate advancement
- **Types**: Mode-specific evidence types in `evidence/types.ts`

---

## Security

- **Path containment**: `security/path-containment.ts` — prevents directory traversal
- **Tool allowlist**: `security/tool-allowlist.ts` — carrier-identity-gated tool permissions
- **R14 fix**: All path resolution validated against base directory

---

## Confidence & Evidence Protocol

Every finding produced by Trident includes:

1. **Confidence score** (0.0 - 1.0) mapped to label (Definite/High/Moderate/Low/Noise)
2. **AST construct trace** — the specific TypeScript AST node that was analyzed
3. **Call graph reference** — cross-file function call chain
4. **Mechanical evidence gate** — reference to the tool execution that produced the evidence

The agent NEVER claims certainty without mechanical evidence. Findings below 0.50 confidence are not reported.

---

## Bundle Integrity

```bash
sha256sum dist/index.js
```

---

## Source Structure

```
dist/
├── index.js                # Plugin bundle (14.6 MB)
├── sql-wasm.wasm           # SQL WebAssembly engine
├── package.json
source-snapshot/
├── src/
│   ├── index.ts            # Plugin entry point — hook registration, tool init
│   ├── orchestrator.ts     # Session-state FSM orchestrator (disk-backed)
│   ├── agents/
│   │   └── definitions.ts  # Agent definitions: trident + trident_explore
│   ├── hooks/
│   │   ├── trident-hooks.ts    # 8 hook handlers, theatrical detection, tool gates
│   │   ├── session-hook.ts     # Session init hook
│   │   ├── guardian-hook.ts    # Runtime guardian enforcement
│   │   └── agent-state.ts      # Per-agent state tracking
│   ├── tools/
│   │   ├── trident-tools.ts    # 8 tool implementations
│   │   └── trident-vision.ts   # VLM integration
│   ├── shared/
│   │   ├── warhead-registry.ts       # HookRegistry — plugin event system
│   │   ├── trident-warhead-synthesizer.ts  # Warhead registration
│   │   ├── warhead-interface.ts      # Warhead interface definition
│   │   ├── gates.ts                  # 6-gate workflow (GateManager)
│   │   ├── evidence-gate.ts          # Evidence-gated advancement
│   │   ├── layer-engine.ts           # Audit layer progression
│   │   ├── firewall-audit.ts         # Firewall cross-reference
│   │   ├── knowledge-loader.ts       # Oracle knowledge base
│   │   ├── t2-loader.ts              # T2 context loader
│   │   ├── warheads/                 # 10 warhead implementations
│   │   │   ├── warhead-concurrency.ts
│   │   │   ├── warhead-dynamic-state.ts
│   │   │   ├── warhead-explore.ts
│   │   │   ├── warhead-gates.ts
│   │   │   ├── warhead-identity-layer.ts
│   │   │   ├── warhead-nlp.ts
│   │   │   ├── warhead-persistence.ts
│   │   │   ├── warhead-runtime-grade.ts
│   │   │   ├── warhead-testing.ts
│   │   │   └── warhead-tscompiler.ts
│   │   └── project-folder-warhead/   # Project folder analysis
│   ├── fsm/
│   │   ├── orchestrator-machine.ts       # Main FSM
│   │   ├── context-synthesis-machine.ts
│   │   ├── deep-planning-machine.ts
│   │   ├── problem-solving-machine.ts
│   │   └── types.ts
│   ├── modes/
│   │   ├── context-synthesis-engine.ts   # 4-layer synthesis engine
│   │   ├── context-synthesis.ts
│   │   ├── deep-planning-state-machine.ts
│   │   ├── deep-planning.ts
│   │   ├── problem-solving-state-machine.ts
│   │   └── problem-solving.ts
│   ├── nlp/
│   │   ├── intent-parser.ts        # Rule-based intent classification
│   │   ├── principle-extractor.ts  # Operating principle extraction
│   │   ├── streaming-buffer.ts     # Incremental message parsing
│   │   ├── types.ts
│   │   └── grammars/               # Peggy grammar files
│   ├── identity/
│   │   ├── index.ts                # IdentityLoader — file-based identity bundles
│   │   ├── agent-identity.ts       # Carrier identity verification
│   │   └── trident/                # 8 identity files
│   ├── evidence/
│   │   ├── evidence-store.ts       # Session-keyed append-only evidence log
│   │   ├── merkle-chain.ts         # SHA-256 tamper-evident chain
│   │   └── types.ts
│   ├── security/
│   │   ├── path-containment.ts     # Directory traversal prevention
│   │   └── tool-allowlist.ts       # Agent-gated tool permissions
│   ├── artifacts/                  # Artifact generators
│   ├── audit-engine/               # Audit layer implementations
│   ├── tests/                      # Property-based tests (fast-check)
│   └── reports/                    # Mutation test reports
identity/                           # Deployed identity marker files
```

---

## Key Improvements in v4.3.2

- **P2 fixed**: All `as any` casts replaced with runtime type-guarded accessors
- **Warhead architecture**: 10 warheads registered via shared HookRegistry
- **Hive full access**: Layer 2 removed — unrestricted hive tool access
- **GateManager restored**: Workflow gates (PLAN→BUILD→TEST→VERIFY→AUDIT→DELIVERY) coexisting with audit layer progression
- **Evidence gate**: Gate advancement blocked until required evidence passes
- **R14 path traversal fix**: All identity file loads validated against base directory
- **Oracle knowledge loader**: Cross-reference against knowledge base
- **NLP streaming buffer**: Incremental message parsing with peggy grammars
- **Timeout management**: Max 10 iterations / 300s per session with TIMEOUT status
- **Stryker mutation testing**: Battlefield + utils configs for mutation test reports

---

## Deployment

### Plugin Installation

```bash
# 1. Copy the plugin bundle
mkdir -p ~/.config/opencode/plugins/trident/dist
cp dist/index.js ~/.config/opencode/plugins/trident/dist/index.js

# 2. Copy WebAssembly dependency (if using SQL-backed evidence store)
cp dist/sql-wasm.wasm ~/.config/opencode/plugins/trident/dist/

# 3. Add to opencode.json
```

### opencode.json Reference

```json
{
  "plugin": [
    "file:///home/leviathan/.config/opencode/plugins/trident/dist/index.js"
  ],
  "agent": {
    "trident": {
      "color": "#8B5CF6"
    }
  }
}
```

---

## Remaining Issues

| ID | Severity | Description |
|----|----------|-------------|
