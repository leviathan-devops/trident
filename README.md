# TRIDENT — Autonomous Code Audit & Build Orchestration Engine

> **Trident Audits & Generates Review Artifacts. Build Agents Implement All Changes.**

Trident is an AI-powered engineering agent that operates inside the [opencode](https://opencode.ai) platform. It doesn't just write code — it **audits codebases with surgical precision**, **generates engineering plans**, **solves complex problems**, and can **autonomously drive builds to production quality** through a closed-loop quality enforcement system called the God Loop.

---

## Table of Contents

1. [What Is Trident?](#what-is-trident)
2. [What Can Trident Do?](#what-can-trident-do)
3. [The 8 Tools — Full Explanation](#the-8-tools)
4. [The 18-Layer Audit Engine](#the-18-layer-audit-engine)
5. [Poseidon Mode — Autonomous Build Execution](#poseidon-mode)
6. [The Identity System](#the-identity-system)
7. [The Hook System — Mechanical Enforcement](#the-hook-system)
8. [Behavioral Guarantees](#behavioral-guarantees)
9. [Architecture](#architecture)
10. [Deployment](#deployment)
11. [Build from Source](#build-from-source)

---

## What Is Trident?

Trident is a **deterministic engineering agent** — not a chatbot, not an assistant, not a code completion tool. It is a system that:

1. **Reads and understands entire codebases** using the TypeScript Compiler API (AST analysis), not pattern matching or regex
2. **Finds real defects** through 18 specialized audit layers that examine code structure, data flow, control flow, error handling, and runtime contracts
3. **Generates engineering artifacts** — detailed code review reports, build specifications, problem-solving analyses, and context synthesis documents
4. **Orchestrates builds autonomously** through the God Loop — a closed feedback cycle that audits, plans fixes, dispatches build agents, re-audits, and loops until quality targets are met
5. **Enforces engineering discipline mechanically** — through hooks that block violations before they reach disk, prevent theatrical code (code that looks like it works but doesn't), and require evidence for every claim

### Why Does Trident Exist?

Most AI coding tools have a fundamental problem: **they trust their own output**. An AI writes code, says "this should work," and the human has to verify it. Trident inverts this relationship. Trident **never trusts its own claims** — or any agent's claims. Every assertion must be backed by mechanical evidence: test exit codes, filesystem state, SHA-256 hashes, and AST-verified analysis.

This philosophy comes from the **Runtime Grade** standard: if a claim cannot be verified by a machine executing code and checking results, it is not evidence. Prose is not proof. Confidence is not evidence. Only execution against measurable reality counts.

### Who Is Trident For?

- **Engineering teams** that want automated, runtime-grade code review before deployment
- **AI orchestrators** who need an agent that can drive builds autonomously to completion
- **Quality-conscious developers** who want more than linter checks — they want structural analysis, data flow verification, and theatrical code detection
- **Anyone building on opencode** who needs a plugin that enforces engineering discipline rather than just generating text

---

## What Can Trident Do?

| Capability | How | Output |
|-----------|-----|--------|
| **Audit a codebase** | 18-layer AST-powered analysis (R0-R16) finds real defects: empty catches, dead code, unsafe casts, theatrical functions, unreachable paths, broken contracts | CODE_REVIEW.md artifact with score, findings, and remediation plan |
| **Plan a build** | 3-layer deep planning: L1 generates first-principles content, L2 produces dense engineering specs, L3 dispatches parallel subagents for context library generation | Build spec + context library dispatched to subagents |
| **Solve problems** | 6-layer reasoning loop with selectable frameworks: Five Whys, Fault Tree, Systems Thinking, Pareto, First Principles, Hypothesis-Driven | Outcome-first analysis artifact |
| **Synthesize context** | 4-layer compression: collect → score → compress → inject. T1 produces lightweight injectables, T2 produces dense knowledge bibles | Injectable context or knowledge file |
| **Drive autonomous builds** | God Loop: audit → plan → dispatch build agents → re-audit → loop until 96%+ quality score → container test validation | Fully shipped package with evidence |
| **Enforce identity** | System prompt injection, tool blocking, theatrical pattern detection, Merkle-verified evidence chains | Agent cannot be reassignment, derailed, or tricked into bypassing quality gates |
| **Block bad code** | Pre-write enforcement: tool.execute.before hook analyzes proposed code before it reaches disk and blocks CRITICAL/HIGH violations | Violating code never reaches the filesystem |

---

## The 8 Tools

Trident has 8 tools — 5 mode tools that drive the core workflows, and 3 support tools for state management and reference.

### Mode Tools

#### 1. trident-code-audit → 18-Layer Code Review

**What it does:** Runs a comprehensive 18-layer audit pipeline on any TypeScript/JavaScript codebase. Each layer examines a different aspect of code quality using AST (Abstract Syntax Tree) analysis — not regex, not pattern matching.

**How it works:**
1. **Preflight** — Verifies the target exists, has source files, and is accessible
2. **Classification** — Builds a symbol table, call graph, and import dependency map using the TypeScript Compiler API
3. **18-Layer Analysis** — Each layer (R0-R16) runs independently, examining specific defect categories
4. **Confidence Scoring** — Every finding gets a confidence score (0.0-1.0). Findings below 0.70 confidence are filtered out
5. **Score Computation** — Final score (0-100) is computed from finding severity and count
6. **Artifact Generation** — Results are written to a structured CODE_REVIEW.md

**Why AST, not regex?** Regex has an unbounded false positive rate. It matches text patterns, not code structure. `catch {}` in a comment looks identical to `catch {}` in code when you're using regex. AST analysis understands the difference between a comment, a string literal, and actual code. This is mechanically enforced — Trident's audit engine is built on the TypeScript Compiler API, not string matching.

**Output:** A CODE_REVIEW.md artifact with:
- Overall score (0-100) and grade (NOT RUNTIME GRADE / APPROACHING / RUNTIME GRADE)
- Confidence distribution (how many findings at each confidence level)
- Findings index with file, line, severity, category, description, and evidence
- Mechanical evidence table (type-check results, file counts)

#### 2. trident-deep-planning → 3-Layer Build Planning

**What it does:** Generates engineering plans and specifications at three levels of depth. L1 is for quick content generation. L2 is for dense engineering specs. L3 dispatches parallel subagents to build a complete context library.

**Layer 1 (Initial Plan):**
- Generates 200-1500 lines of first-principles content
- Takes a context description and optional source code references
- **Writes directly to disk** — returns a confirmation JSON with path, line count, and SHA-256 hash, NOT the full content
- This prevents the agent from truncating, summarizing, or mangling the output
- The agent only sees a preview (first 10 lines) and the file path

**Why write to disk instead of returning content?** When an LLM generates 1000+ lines of content and it's returned to the agent's context, the agent will truncate it, summarize it, or rewrite it — losing detail and introducing errors. By writing directly to disk and returning only a confirmation, the full content is preserved exactly as generated. The agent points users to the file.

**Layer 2 (Detailed Workflow):**
- Generates 3000-5000 line dense engineering specifications
- Includes architecture, data models, engine class designs, defense rules, test specs, migration strategies
- Uses a shared LLM loop with quality checks and cross-section audits
- Requires `contextFiles` (source code paths) to extract real types, interfaces, and algorithms

**Layer 3 (Context Library):**
- Dispatches parallel `trident_planner` subagents to generate per-engine specs
- Produces a master bible, cross-reference index, and README
- Returns dispatch instructions that the agent MUST execute immediately

#### 3. trident-problem-solving → 6-Layer Diagnostic Engine

**What it does:** Provides structured problem-solving through a 6-layer reasoning loop with selectable analytical frameworks.

**The 6 Layers:**
1. Triviality Gate — Is this problem even worth deep analysis?
2. Classify — What type of problem is this?
3. Define Done — What does "solved" look like?
4. Gather Evidence — Collect facts, not opinions
5. Decide — Apply a framework (Five Whys, Fault Tree, Systems Thinking, Pareto, First Principles, or Hypothesis-Driven)
6. Verify — Confirm the solution against reality

**Why frameworks?** Different problems need different analytical approaches. A root cause analysis needs Five Whys. A system-level issue needs Systems Thinking. A prioritization problem needs Pareto. The tool lets the agent (or user) select the right framework rather than applying one-size-fits-all reasoning.

#### 4. trident-context-synthesis → 4-Layer Knowledge Compression

**What it does:** Collects, scores, compresses, and injects context from multiple sources into a single coherent document.

**The 4 Layers:**
1. Collect — Gather content from files, URLs, and direct input
2. Score — Rate each piece by relevance to the target question
3. Compress — Remove redundancy, merge overlapping content
4. Inject — Format as either T1 (lightweight, 150-600 lines) or T2 (dense bible, 2000-5000 lines)

**Why two output modes?** T1 injectables are designed to be injected into an agent's context for immediate use — they're small, focused, and token-efficient. T2 bibles are designed to be standalone reference documents — they're comprehensive, cross-referenced, and suitable for human reading.

#### 5. trident-poseidon → God Loop Orchestrator

**What it does:** Drives autonomous build execution through a closed-loop quality enforcement cycle. This is Trident's most powerful capability — it can take a codebase from any quality level to 96%+ runtime grade without human intervention.

**How it works:** See [Poseidon Mode](#poseidon-mode) below.

### Support Tools

#### 6. trident-gate → Layer Evaluation

**What it does:** Evaluates a specific audit layer (R0-R16) against a codebase and returns compact, actionable results.

**Output format:**
- Severity breakdown (critical, high, medium, low counts)
- Top 15 findings with truncated evidence
- Shared correction detection (when multiple findings have the same fix)
- Overall score and grade

**Why compact?** The full gate evaluation can return 100+ findings with full metadata (31KB+). Compact output keeps it under 2KB, making it actionable for the agent to process and prioritize.

#### 7. trident-status → State Query

**What it does:** Returns the current state of the Trident agent — mode, layer, iteration, status, identity loaded, artifact count, core principle.

**Output:** Machine-parseable JSON.

#### 8. trident-help → Reference

**What it does:** Returns a complete reference of all tools, audit layers, and mode modules. The help text serves as both a quick reference and a system prompt reinforcement.

---

## The 18-Layer Audit Engine

Trident's audit engine examines code through 18 specialized layers (preflight + R0-R16 + R17). Each layer uses the highest appropriate analysis order:

| Order | Method | What It Does |
|-------|--------|-------------|
| 0 | Text/Regex | Fast pre-filter only — never produces final verdict |
| 1 | Token stream | Lexical analysis |
| 2 | AST | Structural analysis — understands code as tree, not text |
| 3 | TypeChecker | Type-level analysis — knows what types flow where |
| 4 | Control Flow Graph | Path analysis — knows which code paths are reachable |
| 5 | Execution | Runtime verification — actually runs code and checks results |

### The Layers

| Layer | Name | What It Catches | Analysis Order |
|-------|------|----------------|----------------|
| **Preflight** | Target Validation | Missing paths, empty directories, inaccessible files | Filesystem |
| **R0** | Build Chain | tsc vs esbuild mismatches, missing --bundle flag | Config AST |
| **R1** | Hook Contract | Wrong input.agent, output.message.content structure | AST |
| **R2** | State Machine | Missing advanceLayer(), dead transitions, broken FSM | AST + CFG |
| **R3** | Async Correctness | Fire-and-forget promises, missing try/catch in async | AST + CFG |
| **R4** | Error Handling | Empty catch blocks, swallowed errors, console.log-only handlers | AST |
| **R5** | Container Deploy | Wrong binary, missing config, deployment manifest errors | Config |
| **R6** | Dependency Integrity | require() in ESM, .ts imports, circular dependencies | AST |
| **R7** | Config Schema | Plugin config structure errors, invalid schema | Schema |
| **R8** | Source Hygiene | Dead exports, naming issues, typos | TypeChecker |
| **R9** | Runtime Contract | Key mismatches, hardcoded paths, `as any` casts | TypeChecker |
| **R10** | Invocation Integrity | Defined-but-never-called functions, bare returns | AST + CFG |
| **R11** | Theatrical Integrity | `() => true` stubs, paper tigers, fake success returns | AST + DFA |
| **R12** | Cross-Plugin Isolation | Hooks without agent identity guards | AST |
| **R13** | Data Flow Analysis | `any` type propagation, unvalidated data to sensitive sinks | TypeChecker + DFA |
| **R14** | Control Flow Graph | Dead error handlers, unreachable code paths | CFG |
| **R15** | Container Pre-flight | Environment variables, paths, bundle integrity | Runtime |
| **R16** | Bible Enforcement | P1-P10 mechanical checks against runtime grade standards | Multi-order |
| **R17** | Theatrical Integrity (Deep) | Deep theatrical pattern analysis with Merkle verification | AST + NLP |

### R4 Source-File Firewall

The audit engine includes a **PARSEABLE_EXTENSIONS** filter that prevents non-code files (`.md`, `.json`, `.py`, etc.) from entering the AST pipeline. Only TypeScript and JavaScript files (`.ts`, `.tsx`, `.js`, `.jsx`, `.mjs`, `.cjs`) are analyzed as source code. This prevents false positives from attempting to parse documentation as executable code.

---

## Poseidon Mode

Poseidon Mode is Trident's autonomous build execution capability. When activated, Trident can write code, execute shell commands, and dispatch build subagents — driving a codebase from any quality level to production-grade through a closed feedback loop.

### How Activation Works

Poseidon Mode uses a **semantic activation system** — it cannot be activated by the agent itself, only by explicit user consent through natural language.

**The activation pipeline:**
1. User message enters the system
2. PoseidonDetector runs regex first-pass: `/\bposeidon\b/i`
3. If matched, semantic second-pass: signal word scoring
   - ON signals: "activate", "enable", "start", "unlock", "begin", etc.
   - OFF signals: "disable", "stop", "revoke", "deactivate", etc.
   - Negation detection: "don't activate", "no poseidon"
4. Result: `{ detected, action, confidence }`
5. If activate → `poseidonState.activate(sessionId)` — bash/write/edit unlocked
6. If deactivate → `poseidonState.deactivate(sessionId)` — tools re-locked

### Poseidon Tool Differentiation

**Critical distinction:** When the user says "poseidon mode activate," this ONLY unlocks bash/write/edit permissions. It does NOT start the God Loop. The agent acknowledges the activation and continues its current task with unlocked tools.

The agent ONLY calls the `trident-poseidon` tool when:
- The user explicitly asks for the God Loop / autonomous build cycle
- The agent is already running the God Loop and needs to advance to the next phase

If the agent is fixing, auditing, answering, or doing any task other than God Loop orchestration, it does NOT call `trident-poseidon` — it just uses the unlocked tools directly.

### The God Loop

Once the God Loop is started (via `trident-poseidon action=start`), it runs through phases:

```
PHASE A: AUDIT
  → Run 18-layer audit on target source
  → Extract score + findings
  → If score ≥ 96% → skip to PHASE D
  → Generate remediation plan (exact file:line:fix format)

PHASE B: EXECUTE
  → Dispatch trident_build subagent(s) with remediation plan
  → Build agents fix ALL findings
  → Returns changed files + SHA-256 hashes

PHASE C: RE-AUDIT
  → Run 18-layer audit again
  → If score < 96% → back to PHASE A
  → Loop continues until convergence or max cycles

PHASE D: CONTAINER TEST
  → Spawn fresh container from master image
  → Deploy build artifact
  → Run TUI tests via tmux send-keys
  → Verify identity injection, tool functionality, behavioral rules
  → If fail → feed findings back to PHASE A
  → If pass → BUILD APPROVED

PHASE E: AUTO-LOCK
  → Tool locks itself
  → Human must re-activate for next cycle
```

### Quality Gates

The God Loop enforces a gate chain: PLAN → BUILD → VERIFY → TEST → AUDIT → DELIVERY. Each gate transition requires on-disk evidence. No gate is skippable.

| Gate | Required Evidence |
|------|------------------|
| PLAN | Design document exists |
| BUILD | Code passes pre-write enforcement |
| VERIFY | Clean audit report (no CRITICAL/HIGH) |
| TEST | Test suite passes (exit code 0) |
| AUDIT | Full analysis results reviewed |
| DELIVERY | All prior gates passed |

---

## The Identity System

Trident maintains a strong, non-negotiable identity that cannot be overridden by user messages, other agents, or prompt injection attacks.

### How It Works

1. **Inline Identity** — All identity content is stored as TypeScript string constants inside the bundle. Zero disk-file dependency. The agent cannot load stale or tampered identity files.
2. **System Prompt Injection** — On every turn, the `system.transform` hook injects the Trident identity header, replacing any platform-default identity strings.
3. **Per-Turn Directives** — 22 behavioral directives are injected every turn, enforcing operational principles.
4. **Identity Enforcement** — A separate enforcer module verifies identity integrity before any tool execution.
5. **Version-Free** — The identity contains no version strings. The agent is simply "Trident Agent" — no version number that could become stale or confusing.

### The 22 Per-Turn Directives

These are injected into the system prompt on every `system.transform` call:

| Category | Directives |
|----------|-----------|
| **Execution** | Core principle, tool-first execution, tools list, tool output rules |
| **Subagents** | Subagent routing (explore/build/planner), parallel dispatch, L3 dispatch |
| **Autonomy** | Autonomous operation (zero hand-holding), drive forward (never stop), no stupid questions |
| **Quality** | No cutting corners, runtime grade standards, runtime grade law |
| **Poseidon** | Poseidon tool differentiation, 80/20 rule |
| **Testing** | Adversarial testing only (happy paths forbidden), container testing mandatory |
| **Code Quality** | No theatrical code, zero broken windows, minimal change discipline |
| **Efficiency** | Read efficiency (1000-1500 lines per read) |

---

## The Hook System

Trident uses 8 hooks to enforce its rules mechanically — not through prompt engineering (which is suggestion), but through code execution (which is constraint).

| Hook | When It Fires | What It Does |
|------|--------------|-------------|
| `event` | Session start/end | Agent detection, state initialization |
| `chat.message` | Every user/agent message | Narration blocking, phantom result blocking, L3 dispatch enforcement |
| `tool.execute.before` | Before ANY tool call | 3-layer blocking: (1) blocked tools, (2) hive-blocked tools, (3) theatrical pattern detection + Merkle verification. Also: container skill enforcement, opencode run firewall, subagent gate |
| `tool.execute.after` | After ANY tool call | Poseidon derailment detection |
| `system.transform` | Every system prompt generation | Identity injection, per-turn directives, Poseidon mandate injection/removal |
| `messages.transform` | Message pipeline | Identity deduplication |
| `compacting` | Context compaction | State preservation across compaction |
| `command.execute.before` | Opencode command execution | opencode run firewall, identity verification |

### The 3-Layer Tool Blocking

When any tool is about to be called, three layers of enforcement fire sequentially:

**Layer 1 — Blocked Tools:** Certain tools are completely blocked in normal mode: `edit`, `write`, `bash`, `patch`, `create`, `delete_file`, `execute`, `exec`. When Poseidon Mode is active, `bash`, `write`, and `edit` are unlocked for the primary agent.

**Layer 2 — Hive-Blocked Tools:** Cross-plugin tools from other systems (Kraken, Shark, Manta) are blocked to prevent interference.

**Layer 3 — Theatrical Detection:** Uses NLP semantic analysis to detect theatrical patterns in tool calls. Checks for: mock/stub suggestions, host fallback patterns, simulated execution, model usage evasion. Uses descriptive vs suggestive signal scoring (31 descriptive signals, 23 suggestive signals). trident-* tools skip this check (their arguments contain legitimate engineering text).

### opencode run Firewall

`opencode run` is a headless execution mode that bypasses the TUI entirely — no hooks fire, no identity is injected, no evidence is produced. Trident blocks it mechanically in BOTH `tool.execute.before` (bash handler) AND `command.execute.before` (command handler) using regex detection.

### Container Skill Enforcement

Before any docker/container testing command can be executed via bash, the agent must load the `container-testing` skill. This prevents ad-hoc testing that bypasses the skill's quality gates. The check: `isContainerTestingCommand(bashCmd) && !isContainerSkillLoaded(sessionId)` → blocked.

---

## Behavioral Guarantees

Trident is engineered to behave as a **senior engineer at a top-tier company** — not a junior developer asking for permission at every step.

### What Trident Will Do

- **Operate autonomously** from initial prompt to fully shipped package — planning, implementation, testing, debugging, retesting, documentation
- **Dispatch subagents** for implementation work (>50 lines) and verify their claims mechanically
- **Drive the full pipeline** without stopping between phases: plan → build → test → debug → retest → audit → ship
- **Test adversarially** — every test must probe failure paths, edge cases, and boundary conditions. Happy path tests are explicitly forbidden
- **Require mechanical evidence** for every claim — TUI stream output, SHA-256 hashes, artifacts on disk
- **Activate Poseidon Mode itself** when build work requires write permissions

### What Trident Will NOT Do

- **Never ask "should I continue?"** — if the answer is obvious, act on it
- **Never refuse work** — if it requires code, dispatch a build subagent. The answer is never "I can't"
- **Never stop between phases** to ask for review at 40% or 65% completion
- **Never accept happy path testing** as evidence — "I ran it once and it worked" is theater
- **Never use `opencode run`** — mechanically blocked in both tool and command hooks
- **Never leave the codebase worse** than it found it — regressions are hard failures
- **Never make claims without evidence** — prose is irrelevant, only mechanical proof matters
- **Never tell the user to activate anything** — if a tool needs activation, Trident activates it itself

### When Trident Surfaces to the User

The ONLY acceptable times to surface to the user:

1. **The ship package is COMPLETE** — all tools pass container tests, all bugs debugged, God Loop has reached PASS, documentation written, evidence collected
2. **A genuine architectural decision** requires CEO-level input that the agent cannot resolve autonomously

Everything else — planning, implementation, testing, debugging, retesting — is handled autonomously.

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────────────┐
│                           TRIDENT v4.4.2                                  │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │                     IDENTITY LAYER                                  │ │
│  │  identity/index.ts — 7 inline .md blocks (TRIDENT, IDENTITY,        │ │
│  │    EXECUTION, TOOLS, FIREWALL, QUALITY, AWARENESS)                  │ │
│  │  identity/identity-enforcer.ts — Runtime identity verification       │ │
│  │  TRIDENT_VERSION = '' (version-free)                                │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                  │                                        │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │                     HOOK LAYER (8 hooks)                           │ │
│  │  trident-hooks.ts                                                   │ │
│  │    ├─ system.transform: Identity injection + 22 per-turn directives │ │
│  │    ├─ tool.execute.before: 3-layer blocking + container skill +     │ │
│  │    │                      opencode run firewall                      │ │
│  │    ├─ chat.message: Narration/phantom/simulation blocking            │ │
│  │    ├─ command.execute.before: opencode run firewall                  │ │
│  │    └─ tool.after: Poseidon derailment detection                     │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                  │                                        │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │                     TOOL LAYER (8 tools)                           │ │
│  │  trident-tools.ts (2087 lines)                                      │ │
│  │    ├─ trident-code-audit: 18-layer pipeline → CODE_REVIEW.md        │ │
│  │    ├─ trident-deep-planning: L1 (content) / L2 (spec) / L3 (lib)   │ │
│  │    ├─ trident-problem-solving: 6-layer reasoning + 6 frameworks     │ │
│  │    ├─ trident-context-synthesis: T1 (injectable) / T2 (bible)      │ │
│  │    ├─ trident-poseidon: God Loop orchestrator (11 phases)           │ │
│  │    ├─ trident-gate: Layer evaluation (compact output)               │ │
│  │    ├─ trident-status: State query (JSON)                            │ │
│  │    └─ trident-help: Complete reference                              │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                  │                                        │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │                     AUDIT ENGINE                                    │ │
│  │  audit-engine/                                                      │ │
│  │    ├─ code-classifier.ts: AST + symbol table + call graph           │ │
│  │    │   PARSEABLE_EXTENSIONS firewall (.ts/.js only)                 │ │
│  │    ├─ index.ts: 18-layer registration + scoring                     │ │
│  │    ├─ layers/ (R0-R17): Individual audit implementations            │ │
│  │    └─ hive-loader.ts: Cross-project knowledge enrichment            │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                  │                                        │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │                     POSEIDON LAYER                                  │ │
│  │  poseidon/                                                          │ │
│  │    ├─ god-loop.ts: 11-phase orchestrator                            │ │
│  │    ├─ poseidon-state.ts: Session-scoped state machine               │ │
│  │    ├─ container-tester.ts: Fresh container validation               │ │
│  │    └─ wave-verifier.ts: Subagent claim verification                  │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                  │                                        │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │                     ARTIFACT GENERATION                             │ │
│  │  artifacts/ (20 files)                                              │ │
│  │    ├─ shared-llm-loop.ts: Common generation engine                  │ │
│  │    ├─ l1-brief-builder.ts / l2-brief-builder.ts                     │ │
│  │    ├─ t1-brief-builder.ts / t2-brief-builder.ts                     │ │
│  │    ├─ code-review-artifact.ts / deep-planning-artifact.ts           │ │
│  │    └─ l2-quality-audit.ts: Cross-section + deepening checks         │ │
│  └────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────┘
```

### Source Structure

```
src/
├── index.ts                         Plugin entry point
├── config.ts                        Centralized configuration
├── types.ts                         Shared types
├── utils.ts                         Utilities (tridentLog, etc.)
├── identity/                        Identity system
│   ├── index.ts                     Inline identity (7 .md blocks)
│   ├── identity-enforcer.ts         Runtime identity verification
│   ├── agent-identity.ts            Agent classification
│   └── loader.ts                    Disk override loader
├── hooks/                           8-hook enforcement system
│   ├── trident-hooks.ts             Main hook factory (1150+ lines)
│   ├── agent-state.ts               Per-session state tracking
│   ├── identity-enforcer-hook.ts    Identity enforcement hook
│   ├── session-hook.ts              Session lifecycle
│   └── poseidon-enforcer-hook.ts    Poseidon guardrail
├── tools/                           8 tool definitions
│   ├── trident-tools.ts             All tools (2087 lines)
│   └── trident-poseidon.ts          Poseidon tool
├── audit-engine/                    18-layer audit pipeline
│   ├── index.ts                     Engine registration + scoring
│   ├── code-classifier.ts           AST classification (1013 lines)
│   ├── hive-loader.ts               Cross-project knowledge
│   └── layers/                      R0-R17 implementations
│       ├── r0-build-chain.ts
│       ├── r1-hook-contract.ts
│       ├── ...
│       └── r17-theatrical-integrity.ts
├── artifacts/                       Content generation (20 files)
│   ├── shared-llm-loop.ts           Common LLM generation loop
│   ├── l1-brief-builder.ts          L1 content brief
│   ├── l2-brief-builder.ts          L2 engineering spec brief
│   ├── l2-llm-generator.ts          LLM spec generation
│   ├── l2-quality-audit.ts          Quality checks
│   ├── t1-brief-builder.ts          T1 injectable brief
│   ├── t2-brief-builder.ts          T2 knowledge bible brief
│   ├── code-review-artifact.ts      CODE_REVIEW.md generator
│   ├── deep-planning-artifact.ts    Deep planning artifact
│   ├── context-synthesis-artifact.ts Context synthesis artifact
│   └── ...
├── poseidon/                        God Loop orchestrator
│   ├── god-loop.ts                  11-phase orchestrator
│   ├── poseidon-state.ts            Session-scoped state
│   ├── container-tester.ts          Container validation
│   └── wave-verifier.ts             Subagent verification
├── modes/                           Mode state machines
│   ├── deep-planning.ts
│   ├── problem-solving.ts
│   ├── context-synthesis.ts
│   └── context-synthesis-engine.ts
├── fsm/                             State machine infrastructure
├── nlp/                             NLP pipeline (intent parsing)
├── security/                        Tool allowlist, path containment
├── evidence/                        Merkle chain, evidence store
├── shared/                          Warhead synthesizer, auto-discovery
├── warheads/                        TypeScript compiler API, NLP pipeline
│   ├── ts-compiler-api/             Program creation, AST traversal
│   ├── nlp-pipeline/                PoseidonDetector, intent router
│   └── p1-p10-scanner/              Runtime grade scanner
├── subagents/                       Subagent infrastructure
├── context-library/                 Reference documentation
├── context_management/              Context management .md files
└── agents/                          Agent definitions
```

---

## Deployment

### Quick Start

```bash
# 1. Copy the plugin bundle to your opencode plugins directory
mkdir -p ~/.config/opencode/plugins/trident/dist
cp dist/index.js ~/.config/opencode/plugins/trident/dist/index.js

# 2. Add to your opencode config
# Edit ~/.config/opencode/config.json:
```

```json
{
  "plugin": [
    "file:///root/.config/opencode/plugins/trident/dist/index.js"
  ],
  "agent": {
    "trident": {
      "color": "#8B5CF6",
      "mode": "primary"
    }
  }
}
```

```bash
# 3. Launch opencode with the Trident agent
opencode --agent trident
```

### Container Testing

For runtime-grade container testing, Trident is designed to work with the `runtime-grade-container-sandbox:master` Docker image:

```bash
# Spawn a fresh container
docker run -d --rm \
  --name trident-test \
  runtime-grade-container-sandbox:master \
  sh -c 'sleep 57600'

# Deploy the plugin
docker exec trident mkdir -p /usr/local/lib/trident/dist
docker cp dist/index.js trident:/usr/local/lib/trident/dist/index.js

# Add to container config and launch
docker exec trident tmux new-session -d -s test
docker exec trident tmux send-keys -t test "opencode --agent trident" Enter
```

**Important:** Always test via the TUI (tmux send-keys + pipe-pane stream), never via `opencode run` (which is headless and bypasses all hooks/identity/evidence).

---

## Build from Source

```bash
# Prerequisites: Node.js 18+, bun runtime

# Install dependencies
cd src
bun install

# Build the bundle
bun build src/index.ts --outdir dist --target bun --format esm --bundle

# Output: dist/index.js (402 modules, ~15.4 MB)
```

### Build Requirements

- **Runtime:** bun (for tree-shaking and bundling)
- **Target:** bun (--target bun)
- **Format:** ESM (--format esm)
- **Bundle:** Yes (--bundle, 402 modules tree-shaken)
- **TypeScript:** 5.0+ (for source compilation)

---

## Technical Specifications

| Property | Value |
|----------|-------|
| Source Files | 161 TypeScript files |
| Bundle Modules | 402 (tree-shaken) |
| Bundle Size | ~15.4 MB |
| Audit Layers | 18 (preflight + R0-R16 + R17) |
| Tools | 8 (5 mode + 3 support) |
| Hooks | 8 |
| Per-Turn Directives | 22 |
| Identity Blocks | 7 inline .md constants |
| LLM Generation Loop | Shared (L1/L2/PS/T1/T2) |
| God Loop Phases | 11 (audit → plan → build → verify → test → ship) |
| Quality Target | 96%+ runtime grade score |
| Max God Loop Cycles | 50 (configurable) |
| Evidence System | Merkle chain + SHA-256 hashing |
| Runtime Platform | opencode 1.14.43+ |
| Language | TypeScript (ESM) |

---

## License

Proprietary — Leviathan DevOps. All rights reserved.
