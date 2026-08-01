# TRIDENT v4.4.3 — POSEIDON GOD LOOP OVERHAUL

> **Trident Audits & Generates Review Artifacts. Build Agents Implement All Changes.**

Trident is a runtime-grade autonomous engineering agent plugin for opencode. It audits codebases via 18-layer AST analysis, generates engineering specs, and autonomously drives builds to 96%+ quality through a 13-phase closed-loop God Loop — the Poseidon orchestrator. Every claim requires mechanical evidence — prose is not proof.

Trident inverts the standard AI coding relationship: most tools write code and claim it works, leaving the human to verify. Trident never trusts its own output — or any agent's. Every assertion must be backed by test exit codes, filesystem state, SHA-256 hashes, AST-verified analysis, and container-tested runtime behavior. This is the Runtime Grade standard: if a claim cannot be verified by machine execution, it is not evidence.

The v4.4.3 overhaul (Phase 1 complete) transformed the God Loop from 1 model-required phase (DISPATCH) to 6: DECIDE, PLAN, DISPATCH, VERIFY, CONTAINER_TEST, and PROBLEM_SOLVE each require the model to make real engineering judgments with phase-specific actions. There are NO mechanical fallbacks — calling `action=start` at a model-required phase is rejected. Container testing is FULLY MANUAL and primary-agent-owned, enforced by adversarial quality gates: test the expected post-ship behavior in production runtime environments from 5+ different angles.
---

## What Is Trident?

Trident is a **closed-loop autonomous build orchestration system** that runs as an OpenCode plugin. It takes a project with defects and drives it to runtime-grade quality without a human in the loop — by auditing mechanically, deciding intelligently, fixing via dispatched subagents, verifying with zero trust, and validating in real containers.

It is built around one operating principle: **the agent never declares success — the machine does.** Trident's 18-layer AST audit engine finds defects deterministically. Its 13-phase Poseidon God Loop decides how to fix them, dispatches build agents to do the work, re-audits to measure progress, and refuses to declare completion until a container test proves the post-ship behavior works as intended.

## What Does It Do?

| Capability | What it actually does |
|-----------|----------------------|
| **Audits** | Scans a TypeScript codebase with 18 AST-based analysis layers — catches empty catch blocks, theatrical stubs, dead enforcement functions, unguarded env vars, `as any` casts, floating promises, and 100+ more defect classes. Every finding carries a confidence score and mechanical evidence. |
| **Plans** | Groups findings by file (one agent per file), reads source context, and requires the model to design a fix strategy per file — root cause, approach, blast radius, depth level. |
| **Fixes** | Dispatches `trident_build` subagents — each owns exactly one file, applies the strategy, and returns SHA256-verified changes. |
| **Verifies** | Mechanically checks every agent's claim (did the file actually change? does it compile? did findings actually resolve?) then requires the model to issue per-agent trust verdicts. |
| **Validates** | The primary agent designs and runs 5+ adversarial container tests against the actual deployed bundle — identity injection, firewall enforcement, tool availability, error propagation, boundary conditions. Nothing passes without mechanical evidence. |
| **Loops** | Re-audits, rescoring, and re-planning until either the score hits 96/100 with container evidence (PASS) or the approach is exhausted and the loop resets with learned diagnosis (LOOP). |

## How Does It Do It?

**The 13-phase God Loop is the engine.** Each phase is either *deterministic* (mechanical — a formula or an engine runs, no judgment needed) or *model-based* (the LLM must make a real engineering judgment). The flow:

```
INIT → AUDIT → SCORE → DECIDE → PLAN → DISPATCH → COLLECT → VERIFY
                    ↑                    ↓                      ↓
              AUDIT_RECHECK ←←←←←←←←←←←←←←←←←←←← ←                     │
                    ↓                                                      │
                 SCORE → DECIDE                                            │
                                                              PASS (terminal)
                                                              LOOP (reset→INIT)
```

- **Deterministic phases** (INIT, AUDIT, SCORE, COLLECT, AUDIT_RECHECK): run engines and formulas. The 18-layer audit engine runs `ts.createProgram` and walks the AST. Scoring is `max(0, 100−15·CRITICAL−8·HIGH−3·MEDIUM−1·LOW)`. No model involvement, no judgment, no ambiguity.
- **Model-based phases** (DECIDE, PLAN, DISPATCH, VERIFY, CONTAINER_TEST, PROBLEM_SOLVE): the God Loop generates an intelligence context — findings by file, source snippets, previous wave results, consequence analysis — and REQUIRES the model to respond with a phase-specific action. Wrong actions are rejected (no fallbacks).
- **Snapshot hash detection:** the God Loop hashes all source at INIT and re-checks every phase. If files changed outside the loop (a manual fix, a direct edit), it re-audits automatically — it is never blind to changes.

## Why Does It Do It This Way?

**Because the default AI workflow is broken.** The standard pattern — model writes code, model claims it works, human verifies — fails because:
1. **The model is a terrible verifier of its own work.** It will rationalize a stub as a fix and a smoke test as validation.
2. **Prose is not evidence.** "The tests pass" without test output is a hallucination, not a result.
3. **Compiling is not working.** Code that builds can still be theatrically wrong — returning hardcoded success, swallowing errors, never enforcing what it claims to enforce.

So Trident inverts the trust model:
- **Deterministic phases exist because machines don't lie.** An AST walk that finds an empty catch block is ground truth. A score formula is a score formula.
- **Model-based phases exist because engineering is judgment.** Deciding whether a stalled score means "different approach" or "escalate to deep diagnosis" is a reasoning task — the model is good at it, as long as its inputs are mechanical facts and its outputs are structured decisions.
- **The 96% + container evidence gate exists because "good enough" isn't runtime grade.** A static audit can't prove the plugin loads in a real environment, that the identity injection survives, that the firewall actually blocks. Only a container test can.
- **No fallbacks exist because fallbacks become excuses.** If the model could skip DECIDE by calling `action=start`, it would. The rejection is the enforcement.

---

- **L1 Direct-to-Disk:** Deep planning L1 writes directly to `outputPath/fileName.md`, returns `L1_CONTENT_WRITTEN` JSON confirmation (path, lines, sha256, preview) — NOT full content. Prevents agent truncation/summarization of generated output.
- **Adversarial Testing Mandate:** Happy path testing explicitly forbidden. Every test must probe failure paths, edge cases, boundaries. Minimum 3 adversarial scenarios required.
- **Autonomous Operation:** 22 per-turn directives enforce senior-engineer behavior — never asks "should I continue?", never stops between phases, never tells user to activate anything. Drives from initial prompt to shipped package autonomously.
- **Gate Compact Output:** trident-gate returns severity breakdown + top 15 findings + shared correction detection (~2KB) instead of full findings dump (~31KB).
- **Read Efficiency Enforcement (.md files):** The `tool.execute.before` hook mechanically forces `limit=1500` when reading `.md` files with `limit < 1000`. Code files (`.ts`, `.js`) are exempt — targeted reads for surgical edits remain allowed. Prevents the #1 waste of turns: reading documentation in 200-line chunks.

---

## Architecture

Trident runs as an OpenCode plugin. One primary agent (trident) orchestrates the
God Loop; two subagent types do the work under strict mechanical verification.

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                              OPENCODE RUNTIME                                │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │                         TRIDENT PRIMARY AGENT                           │  │
│  │  Identity (SCAN+REPLACE) │ 10 Hooks │ 13 Tools │ 3-Layer Firewall      │  │
│  └───────────────────────────────┬────────────────────────────────────────┘  │
│                                  │ poseidonState.isActive()                  │
│  ┌───────────────────────────────▼────────────────────────────────────────┐  │
│  │                    POSEIDON GOD LOOP — 13 PHASES                        │  │
│  │                                                                         │  │
│  │  ┌──────────────────────────────┐        ┌───────────────────────────┐  │  │
│  │  │  DETERMINISTIC PHASES        │        │  MODEL-BASED PHASES        │  │  │
│  │  │  (machines don't lie)        │        │  (engineering is judgment) │  │  │
│  │  │                              │        │                           │  │  │
│  │  │  INIT ──► AUDIT ──► SCORE    │        │  DECIDE ──► PLAN ──►      │  │  │
│  │  │    │          │       │      │        │  DISPATCH ──► VERIFY      │  │  │
│  │  │    │          │       ▼      │        │    │           │          │  │  │
│  │  │    │          │    DECIDE    │        │    ▼           ▼          │  │  │
│  │  │    │          │       │      │        │  COLLECT     AUDIT_RECHECK│  │  │
│  │  │    │          └───────┘      │        │    │           │          │  │  │
│  │  │    └─────────────────────────┘        └────┼───────────┼──────────┘  │  │
│  │  │                                           ▼           ▼              │  │
│  │  │  CONTAINER_TEST (FULLY MANUAL — 5+ adversarial angles)               │  │
│  │  │       │  evidence gate: no container evidence = REJECTED            │  │
│  │  │       ▼                                                              │  │
│  │  │  PASS (score≥96 + container evidence)  /  LOOP (reset with learning)│  │
│  │  └─────────────────────────────────────────────────────────────────────┘  │
│  │          ▲ snapshot hash check: external file change → AUDIT_RECHECK     │
│  └──────────┼───────────────────────────────────────────────────────────────┘
│             │ task(subagent_type="trident_build") — ONE AGENT PER FILE
│  ┌──────────▼───────────────────────────────────────────────────────────────┐
│  │                         TRIDENT_BUILD SUBAGENTS                          │
│  │  Read source ──► Apply fix strategy ──► Self-verify ──► SHA256 evidence  │
│  │  CODE-enforced quality gates │ Merkle chain tracking │ theatrical block  │
│  └───────────────────────────────────────────────────────────────────────────┘
└──────────────────────────────────────────────────────────────────────────────┘
```

### The Macro Flow

1. **Activation** — user enables Poseidon Mode (natural language; Phase 2 moves to a `/poseidon` slash command). This unlocks bash/write/edit on the primary agent.
2. **Audit** — the God Loop runs the 18-layer AST engine deterministically. Findings + score come back with zero model involvement.
3. **Decide** — the model receives the intelligence context (findings by file, previous wave results, stall analysis) and chooses: PLAN a new wave, escalate to PROBLEM_SOLVE, or ACCEPT_RISK. `action=start` is rejected here — no fallback.
4. **Plan** — the model designs a per-file fix strategy (root cause, approach, blast radius, depth). Agent specs are built from the strategy.
5. **Dispatch** — trident_build subagents are dispatched — one per file, never colliding. Each reads source, applies the strategy, self-verifies, and returns SHA256 hashes.
6. **Collect + Verify** — outputs are collected; the evidence gate (≥0.96 pass rate) and WaveVerifier (SHA256, tsc, audit, regression, freshness) run mechanically. Then the model issues per-agent trust verdicts (TRUSTED / QUARANTINED / REJECTED).
7. **Re-audit + Score** — deterministic re-run; cycle increments. If progress stalls for 2 cycles, the model is routed to PROBLEM_SOLVE.
8. **Container Test** — FULLY MANUAL. The primary agent designs and runs 5+ adversarial scenarios against the deployed bundle. The evidence gate rejects pass declarations with no container execution evidence.
9. **PASS / LOOP** — PASS requires score ≥96 AND container evidence. LOOP resets to INIT with accumulated diagnosis for the next round.

### Deterministic vs Model-Based (the core filter)

| Dimension | Deterministic phases | Model-based phases |
|-----------|---------------------|--------------------|
| Phases | INIT, AUDIT, SCORE, COLLECT, AUDIT_RECHECK | DECIDE, PLAN, DISPATCH, VERIFY, CONTAINER_TEST, PROBLEM_SOLVE |
| What runs | Engines + formulas (AST walk, score math, evidence gate, snapshot hash) | The LLM, given a mechanical context and a structured action contract |
| Why | Machines don't lie — an AST walk finding an empty catch is ground truth | Engineering is judgment — approach selection, root-cause analysis, trust assessment |
| Failure mode | None (deterministic) | The model can be wrong — caught by the next deterministic phase (re-audit rescoring) |
| Enforcement | `action=start` advances them | Phase-specific actions (`decide`, `plan`, `verify`, `solve`, `diagnose`); wrong action = PHASE ACTION ERROR, no fallback |

### Subagent Architecture

| Agent | Role | Scope | Enforcement |
|-------|------|-------|-------------|
| **trident** (primary) | Orchestrates the God Loop — audits, decides, plans, verifies, container-tests | Everything | 3-layer firewall, phase-action enforcement, identity, evidence chain |
| **trident_build** (subagent) | Executes fix strategies — reads source, applies the strategy verbatim, self-verifies, returns SHA256 | ONE file per agent (file-based wave dispatch — no collisions) | CODE-enforced quality gates, Merkle chain evidence, theatrical detection, runtime-grade enforcement (P1-P10) |
| **trident_explore** (subagent) | Read-only context ingestion for parallel information gathering | Read-only | Bypasses write blocking; cannot call trident-poseidon (leaf node) |

---

## Agents (3)

| Agent | Type | Mode | Color | Description |
|-------|------|------|-------|-------------|
| **trident** | Primary | primary | `#8B5CF6` | God Loop orchestrator — 18-layer audit engine, Poseidon Mode, all 13 tools |
| **trident_explore** | Subagent | subagent | — | Read-only context ingestion scout for parallel information gathering |
| **trident_build** | Subagent | subagent | `#0066CC` | Runtime-grade build engineer — executes remediation plans verbatim |

---

## Tools (13)
### Mode Tools (5):
| Tool | Description | Output |
|------|-------------|--------|
| `trident-code-audit` | 18-layer AST-powered audit (R0-R17) with confidence scoring + evidence gating | CODE_REVIEW artifact |
| `trident-deep-planning` | 3-layer plans (L1 first-principles, L2 workflow, L3 context-lib) | BUILD_SPEC + CONTEXT_LIBRARY |
| `trident-problem-solving` | 6-layer reasoning with 6 frameworks (Five Whys, Fault Tree, Systems Thinking, Pareto, First Principles, Hypothesis-Driven) — [see below](#problem-solving-engine) | PLAN artifact |
| `trident-context-synthesis` | 4-layer synthesis (collect→score→compress→inject) | T1_INJECTABLE / T2_KNOWLEDGE |
| **`trident-poseidon`** | **God Loop orchestrator — 13-phase quality-enforced build execution with 11 actions (start/status/abort/decide/plan/verify/diagnose/solve/phase/deactivate/revoke), phase-action enforcement, NO fallbacks** | **BUILD REPORT** |
### Infrastructure Tools (5):
| Tool | Description |
|------|-------------|
| `trident-container-test` | Military-grade container testing — 24 actions (setup/deploy/send/read/check/switch-model/switch-agent/verify-model/verify-agent/...) with test-plan enforcement |
| `trident-ship-package` | Ship Package Generator — validates build, generates SHIP_MANIFEST/DEPLOY.sh/README/BUILD_REPORT |
| `trident-preflight` | Mechanical input validation before expensive LLM calls — zero wasted tokens on rejected calls |
| `trident-omni-vision` | Dual-mode multimodal perception (direct frame loading / MiMo API summary) |
| `build-status` | Build agent status reporting |
### Support Tools (3):
| Tool | Description |
|------|-------------|
| `trident-gate` | Evaluate specific audit layers (R0-R17) |
| `trident-status` | Current Trident state (mode, layer, iteration, artifacts) |
| `trident-help` | Reference for all commands and modes |

---

## Problem-Solving Engine

The `trident-problem-solving` tool provides structured diagnostic reasoning through a 6-layer pipeline with 6 selectable analytical frameworks. Different problems require different analytical approaches — the tool selects the right framework rather than applying one-size-fits-all reasoning.

### The 6 Layers

| Layer | Name | Purpose |
|-------|------|---------|
| 1 | **Triviality Gate** | Is this problem even worth deep analysis? If the answer is obvious, act on it and skip the pipeline. Prevents over-engineering simple fixes. |
| 2 | **Classify** | What type of problem is this? Bug? Design flaw? Integration failure? Performance? The classification determines which frameworks are applicable. |
| 3 | **Define Done** | What does "solved" look like? Establishes the acceptance criteria before analysis begins. Prevents scope drift during investigation. |
| 4 | **Gather Evidence** | Collect facts — not opinions, not theories. File contents, test results, error messages, stack traces, git diffs. The evidence layer enforces that conclusions are grounded in measurable reality. |
| 5 | **Decide** | Apply the selected framework (see below) to the evidence. Produce a structured conclusion with root cause, contributing factors, and recommended action. |
| 6 | **Verify** | Confirm the proposed solution against reality. Does it actually fix the problem? Does it introduce regressions? The verification layer closes the loop — unverified solutions are rejected. |

### The 6 Frameworks

Each framework is a structured method for analyzing evidence and reaching conclusions. The tool (or user) selects the appropriate framework based on problem type.

#### Five Whys

**What it is:** Iterative root cause analysis. Ask "why did this happen?" five times, drilling from symptom to root cause.

**How it works:**
```
Problem: Tests fail intermittently
Why 1: The test runner hits a race condition
Why 2: Two tests modify shared state without synchronization
Why 3: The state cleanup runs in afterEach, not afterEach with await
Why 4: The cleanup function was written before async support was added
Why 5 (ROOT): State management predates async/await — needs migration to async cleanup hooks
```

**When to use:** When you need to drill past symptoms to find the underlying cause. Best for bugs where the visible symptom is far removed from the actual defect.

**Why not always:** Five Whys assumes a single linear causal chain. Some problems have multiple interacting causes or feedback loops — use Fault Tree or Systems Thinking for those.

---

#### Fault Tree Analysis

**What it is:** Top-down deductive analysis. Start with the failure event and trace all possible paths that could lead to it.

**How it works:**
```
TOP EVENT: Production deploy failed
├─ Build failed
│   ├─ TypeScript error (CHECKED: No — build succeeds locally)
│   ├─ Missing dependency (CHECKED: Yes — new package not in lockfile)
│   └─ Wrong Node version (CHECKED: No — CI uses correct version)
├─ Deploy script failed
│   ├─ Missing env var (CHECKED: No — all vars present)
│   └─ Permission denied (CHECKED: No — deploy key valid)
└─ Tests failed in CI
    └─ (Eliminated — CI logs show build failure before test stage)
CONCLUSION: Missing dependency in lockfile — `npm install` ran without `--save`
```

**When to use:** When the failure could have multiple causes and you need to systematically eliminate possibilities. Best for deployment failures, integration issues, and "it works on my machine" problems.

---

#### Systems Thinking

**What it is:** Holistic analysis that examines how components interact, rather than analyzing components in isolation. Identifies feedback loops, emergent behaviors, and systemic patterns.

**How it works:**
```
SYSTEM: API rate limiting
COMPONENTS: Gateway, Redis cache, User service, Alert system
INTERACTIONS:
  - Gateway → Redis: Check rate limit (READ)
  - Gateway → Redis: Increment counter (WRITE)
  - User service → Gateway: Forward request
  - Alert system ← Gateway: Fire on limit exceeded
FEEDBACK LOOP DETECTED: When Redis is slow → Gateway timeout → 
  retry storm → Redis gets slower → more timeouts → cascade failure
EMERGENT BEHAVIOR: Rate limiting causes MORE load under stress, not less
ROOT CAUSE: Retry logic lacks exponential backoff — system amplifies load
```

**When to use:** When the problem involves multiple interacting systems, feedback loops, or emergent behavior that can't be understood by examining any single component. Best for performance degradation, cascading failures, and architecture-level issues.

---

#### Pareto Analysis (80/20 Rule)

**What it is:** Prioritization framework. Identifies the 20% of causes responsible for 80% of effects.

**How it works:**
```
PROBLEM: 47 audit findings across 12 files
FREQUENCY ANALYSIS:
  - Empty catch blocks: 18 findings (38%)
  - `as any` casts: 14 findings (30%)
  - Dead exports: 8 findings (17%)
  - Missing return types: 4 findings (9%)
  - Other: 3 findings (6%)
CUMULATIVE: Top 2 categories = 68% of all findings
ACTION: Fix empty catch blocks + unsafe casts first → eliminates majority
        of audit failures with minimal effort
```

**When to use:** When you have many issues and need to prioritize. Best for audit remediation planning, bug triage, and deciding what to fix first in a legacy codebase.

---

#### First Principles Thinking

**What it is:** Break a problem down to its most fundamental truths, then build up from there. Rejects analogies and convention in favor of basic physics/logic.

**How it works:**
```
PROBLEM: Audit engine hangs on large codebases
CONVENTIONAL APPROACH: "Add a timeout" (treats symptom)
FIRST PRINCIPLES:
  Q: What does the audit engine fundamentally DO?
  A: Parses files into ASTs, walks the tree, collects findings
  Q: What is the minimum work required?
  A: Visit each node exactly once, check properties, record violations
  Q: Why does it hang?
  A: ts.getPreEmitDiagnostics() runs the FULL type checker synchronously
  Q: Is type checking needed for every layer?
  A: No — R4 (error handling) only needs AST structure, not types
SOLUTION: Split layers into AST-only (fast) and TypeChecker-required (deferred).
         Never call getPreEmitDiagnostics() — use targeted getTypeAtLocation() instead.
```

**When to use:** When conventional solutions don't work or when you suspect the current approach is fundamentally wrong. Best for architecture redesign, performance problems, and "we've always done it this way" situations.

---

#### Hypothesis-Driven Debugging

**What it is:** Scientific method applied to debugging. Form a hypothesis, design an experiment to test it, observe the result, and iterate.

**How it works:**
```
PROBLEM: Identity injection fails intermittently
HYPOTHESIS 1: Race condition between session creation and system.transform
EXPERIMENT: Add timestamp logging to both hooks
RESULT: Timestamps show 200ms gap — no race condition
VERDICT: Hypothesis REJECTED

HYPOTHESIS 2: Session ID mismatch between chat.message and system.transform
EXPERIMENT: Log session IDs from both hooks
RESULT: chat.message uses 'ses_abc', system.transform uses 'default'
VERDICT: Hypothesis CONFIRMED — session ID mismatch causes identity to load
         on wrong session
FIX: Propagate session ID through all hook calls
```

**When to use:** When the problem is poorly understood and you need to systematically narrow down causes. Best for intermittent bugs, mysterious failures, and problems where you don't even know where to start.

### Framework Selection Guide

| Problem Type | Recommended Framework |
|-------------|----------------------|
| Single bug with clear symptom | Five Whys |
| Multiple possible causes | Fault Tree |
| Cross-system / architectural | Systems Thinking |
| Too many issues, need prioritization | Pareto |
| Conventional solutions failing | First Principles |
| Unknown cause, need to experiment | Hypothesis-Driven |

---

## 18-Layer Audit Engine (R0-R17 + Preflight)

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

### GodLoopOrchestrator.runPhase() — 13-Phase State Machine (Phase 1 Overhaul)

The God Loop advances ONE phase per `trident-poseidon` call. Mechanical phases
advance with `action=start`; model-required phases demand their specific action
and REJECT wrong actions (no fallbacks). A snapshot hash comparison detects
external file modifications and triggers an unscheduled AUDIT_RECHECK — the God
Loop is never blind to changes, regardless of who made them.

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

### Phase Classification

| Phase | Type | Action | Detail |
|-------|------|--------|--------|
| INIT | Mechanical | `start` | Scan .ts files, compute content snapshot hash, write 10 canon docs |
| AUDIT | Mechanical | `start` | 18-layer AST engine runs internally, findings to evidence store |
| SCORE | Mechanical | `start` | Progressive score: max(0, 100−15·CRITICAL−8·HIGH−3·MEDIUM−1·LOW) + CycleTracker + stall counter |
| **DECIDE** | **Model** | **`decide`** | Intelligence context (findings by file, previous waves, stall analysis) → model chooses PLAN / PROBLEM_SOLVE / ACCEPT_RISK with reasoning. Hard limits (score≥96, cycle≥50, no findings) still mechanical. ACCEPT_RISK clears findings + stores justification. |
| **PLAN** | **Model** | **`plan`** | Model provides fix strategy per file (root cause, approach, blast radius, depth) via fileStrategies payload. Agent specs built from the strategy. |
| **DISPATCH** | **Model** | `start` → `task()` | One trident_build subagent per file (file-based wave dispatch, no collisions). L3 dispatch enforcement forces task() calls. |
| COLLECT | Mechanical | `start` | Read wave agent outputs, write T1 bridge for compaction survival. Missing outputs after 3 attempts → PROBLEM_SOLVE. |
| **VERIFY** | **Model** | **`verify`** | Evidence gate (≥0.96 pass rate) + WaveVerifier (SHA256/tsc/audit/regression/freshness) mechanical FIRST, then model per-agent verdicts: TRUSTED/QUARANTINED/REJECTED. REJECTED → THEATRICAL → AUDIT_RECHECK. |
| AUDIT_RECHECK | Mechanical | `start` | Re-audit, refresh snapshot hash, increment cycle. |
| **CONTAINER_TEST** | **Model (FULLY MANUAL)** | `start`/`diagnose` | Agent designs + runs 5+ adversarial scenarios via trident-container-test. Evidence gate rejects no-evidence passes (phaseRepeatCount>0 + container entries). Failure → `diagnose` → PLAN/PROBLEM_SOLVE. |
| **PROBLEM_SOLVE** | **Model** | **`solve`** | Model reads source, proposes root cause + proposal + nextPhase. Diagnosis stored to PROBLEM_SOLVING_PLANS/model_diagnosis/. |
| PASS | Terminal | — | Score ≥96 AND container evidence. |
| LOOP | Terminal→Reset | — | Round++ reset to INIT with accumulated learning. |

### Phase Action Enforcement (no fallbacks)

```
PHASE_ACTIONS:
  INIT/AUDIT/SCORE/COLLECT/AUDIT_RECHECK → ['start']
  DECIDE → ['decide']
  PLAN → ['plan']
  DISPATCH → ['start']          (model dispatches agents via task())
  VERIFY → ['verify']
  PROBLEM_SOLVE → ['solve']
  CONTAINER_TEST → ['start', 'diagnose']
```

Wrong action at the wrong phase → `[POSEIDON: PHASE ACTION ERROR]` listing the
valid actions. There is NO mechanical fallback routing — the model engages with
the intelligence or the loop stalls, and the stall detector escalates to
PROBLEM_SOLVE.

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
│   ├── AUDIT_RAW.md              Full 18-layer audit output
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
# 8c3522b3c2de5ae97795f9c5ee3936ac
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
│   ├── index.ts                          # 18 layers registered
│   ├── layers/                           # R0-R17 implementations
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

- `legacy-v4.4` — Poseidon God Loop, 17-layer audit engine, 10 tools including trident-vision, esbuild-built
- `archive/v4.3.3` — PRE_SYNTHESIZED_T1 warhead system with L5 firewall enforcement, 16-warhead architecture, 18-layer audit (R0-R17), R17 Theatrical Integrity detectors (D1-D10)
- `archive/v4.3.1-T3` — Legacy T3 architecture
- `v4.3.2` — Stable release with warhead registry, 7-Q enforcement

---

## License

MIT
