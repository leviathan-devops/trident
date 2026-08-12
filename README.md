# TRIDENT v4.4.2 — Code Audit & Build Orchestration Engine

**Status:** ✅ GOD LOOP — 18-LAYER AUDIT ENGINE — POSEIDON MODE — IDENTITY INLINED — PIPELINE RESTORED — WAVE MANAGER ASYNC
**Bundle:** ~16.13 MB (ESM, bun-built — 436 modules)
**Runtime:** opencode 1.14.51+
**Source:** 222 .ts files

> **Trident Audits & Generates Review Artifacts. Build Agents Implement All Changes.**

Trident is a runtime-grade engineering agent plugin for opencode. It audits codebases via 18-layer AST analysis, generates engineering specs, and autonomously drives builds to 96%+ quality through a closed-loop God Loop. Every claim requires mechanical evidence — prose is not proof.

Trident inverts the standard AI coding relationship: most tools write code and claim it works, leaving the human to verify. Trident never trusts its own output — or any agent's. Every assertion must be backed by test exit codes, filesystem state, SHA-256 hashes, and AST-verified analysis. This is the Runtime Grade standard: if a claim cannot be verified by machine execution, it is not evidence.

---

## The Wave-Manager Async — The Subagent Orchestration System

The wave manager is Trident's subagent-dispatch orchestration system: it generates prompt files for parallel agents (the shadow pipeline), returns a batch form whose task calls are always dispatched in the background (`background: true` — the calls return immediately with task_ids), and gives the orchestrator a three-channel control surface — completion/state, in-flight vision, and steering. The orchestrator dispatches the batch as ONE message, captures the task_ids, checks in every 5-10 minutes, and continues its own work — never hostage to a wave.

### The three channel surfaces (the orchestrator's control):
1. **THE COMPLETION/STATE CHANNEL** — `task_status(taskId)`: wait=false for the live state; wait=true blocks (synchronous-on-demand).
2. **THE IN-FLIGHT VISION CHANNEL** — `trident-wave-status sessionId`: the session part stream (the tools, the reasoning, the text as they land — the same data the TUI renders); no-arg: the list-all dashboard.
3. **THE STEERING CHANNEL** — `trident-wave-steer sessionId + prompt`: send ANY prompt into a derailing subagent session; the message queues.

**The flow-safe check-in** — every wave generation returns: *"The wave runs in the BACKGROUND — dispatch the batch form as ONE message; the task calls return immediately with task_ids. CHECK IN every 5-10 minutes — POLL task_status(taskId) + READ the part stream (trident-wave-status sessionId); COLLECT if complete, and STEER a derailing agent (trident-wave-steer) wherever you have free space or deem it relevant. Manage the waves like a senior engineer. Continue with the rest of your tasks after dispatching this wave."*

### The runtime architecture — how the wave-manager-async flow ACTUALLY runs

```
                  TRIDENT v4.4.2 — THE FULL RUNTIME ARCHITECTURE
                  (the wave-manager-async flow — how it ACTUALLY runs)
                  D = deterministic engine  ·  M = model judgment

   ┌──────────────────────────┐
   │ THE ORCHESTRATOR         │ M   the primary agent — the CEO's engineering org
   │ (the deep-flow agent)    │     the identity + the warheads + the absorbed context
   └────────────┬─────────────┘
                │ trident-wave-manager action=generate
                ▼
   ┌──────────────────────────┐
   │ THE WAVE MANAGER         │ D   the shadow pipeline (5-8 min, SYNCHRONOUS —
   │ prompt files + batch form│     no derail during generation)
   │ batch: EVERY call        │     background:true + promptFile + the generated prompt
   │ carries background:true  │
   └────────────┬─────────────┘
                │ returns the batch form + the flow-safe check-in
                ▼
   ┌──────────────────────────┐
   │ DISPATCH (ONE message)   │ D   ALL the task calls together — the [WAVE BATCH] gate
   └────────────┬─────────────┘
                │ the task calls return IMMEDIATELY with task_ids
                ▼
   ┌──────────────────────────┐
   │ CAPTURE THE TASK_IDS     │ D   the polling handles + the tracker's taskIds
   └────────────┬─────────────┘
                ▼
   ┌──────────────────────────┐      ┌──────────────────────────┐
   │ THE AGENTS RUN IN THE    │      │ THE SESSION DB            │
   │ BACKGROUND               │─────▶│ (opencode.db)             │
   │ (trident_explore/build)  │      │ the part stream — the     │
   └────────────┬─────────────┘      │ mechanical ground truth   │
                │                    └────────────┬─────────────┘
                │                                │
                ▼                                ▼
   ┌──────────────────────────┐      ┌──────────────────────────┐
   │ THE CRON (10m tick)      │      │ THE ORCHESTRATOR          │
   │ isBackgroundTerminal     │      │ checks in every 5-10 min: │
   │ the completion feed      │      │ POLL task_status + READ   │
   │ the INVESTIGATE directive│      │ the part stream · COLLECT │
   └────────────┬─────────────┘      │ · STEER where you have   │
                │                    │ free space · continue     │
                │                    └──────────────────────────┘
                ▼
   ┌──────────────────────────┐
   │ COMPLETE → COLLECT       │ M   the completion directive — the results are
   │ (the handoff)            │     your raw material: audit, apply, advance
   └──────────────────────────┘
```

### The unique mechanics — THIS version's fresh machinery

```
        THE WAVE-MANAGER-ASYNC UNIQUE MECHANICS
   (background-first dispatch · the flow-safe check-in · the three channels)

   ┌──────────────────────────┐
   │ DISPATCH (background:true)│
   │ ONE message · ALL calls  │────────┐
   └────────────┬─────────────┘        │ returns IMMEDIATELY with task_ids
                │                      ▼
                │              ┌──────────────────────────┐
                │              │ THE ORCHESTRATOR CONTINUES│  never hostage to a wave
                │              │ generating the next wave,│  the wave is managed,
                │              │ reading, auditing, writing│  never awaited
                │              └──────────────────────────┘
                ▼
   ┌──────────────────────────┐
   │ THE FLOW-SAFE CHECK-IN   │  "CHECK IN every 5-10 minutes — POLL task_status +
   │ every 5-10 min, at a     │   READ the part stream; COLLECT if complete, and
   │ natural pause            │   STEER wherever you have free space or deem it
   └────────────┬─────────────┘   relevant. Manage the waves like a senior engineer.
                │                 Continue with the rest of your tasks."
                ▼
   ┌──────────────────────────────────────────────────────────┐
   │ THE THREE CHANNEL SURFACES                                │
   │                                                            │
   │ 1. task_status(taskId)      the completion/state channel   │
   │    wait=false live · wait=true block (synchronous-on-demand)│
   │ 2. trident-wave-status      the in-flight vision channel    │
   │    sessionId → the part stream (tools/reasoning/text)     │
   │    no-arg → the list-all dashboard                        │
   │ 3. trident-wave-steer       the steering channel            │
   │    sessionId + prompt → the message queues                │
   └──────────────────────────────────────────────────────────┘
```

### The wire-in (the 11 files)

| File | The change |
|---|---|
| `src/security/tool-allowlist.ts` | `task_status` admitted — the runtime's native polling tool, no longer firewall-blocked |
| `src/tools/wave-constants.ts` | the batch contract gains `background?: boolean`; the stuck directive reworded to INVESTIGATE |
| `src/tools/wave-dispatch.ts` | the batch form ALWAYS emits `background: true`; `executeWaveSteer`; the flow-safe check-in |
| `src/tools/wave-tracker.ts` | `taskIds` + `registerTaskIds` (the dispatching→running transition) |
| `src/tools/wave-status.ts` | `readSessionStream` — the FULL-SCROLL stream reader + the list-all dashboard + the raw-session swap |
| `src/tools/wave-cron.ts` | `isBackgroundTerminal` + the completion feed + the DB part-stream evidence |
| `src/tools/wave-steer-tool.ts` | NEW — the `trident-wave-steer` tool factory |
| `src/tools/trident-tools.ts` | the `trident-wave-steer` registration |
| `src/tools/shadow/shadow-brain.ts` | the 600s timeout (was 180s — the healthy-stream-killer) + the retry + the two-transport fallback |
| `src/tools/shadow/shadow-secrets.ts` | the fallback resolvers + the base64'd official-API key (AP-4) |
| `src/tools/shadow/shadow-runner.ts` | the PI-round retry (the transient timeout class) |

### The provider doctrine

- **The opencode-go provider is the ONLY path in practice** — DeepSeek V4 Flash, frozen (`SHADOW_MODEL = 'deepseek-v4-flash'`).
- **The official-API fallback is a failsafe** — wired + verified ONCE (HTTP 200, model deepseek-v4-flash), then forgotten.
- **deepseek-v4-pro is BANNED** — zero references in the codebase.

### The identity — WARHEADS 1-19

The identity carries 19 warheads (disk + inline + bundle): 1-15 the pre-existing laws, 16 THE WAVE-DISPATCH EXECUTION LAW (updated for the background reality), 17 THE HOST-PIPELINE TWO-ROLE TESTING LAW, 18 THE BASIC-FUCKING-LOGIC LAW, and **19 — [CRITICAL] THE POSEIDON-AGI FLOW STATE + DEEP FOCUS LAW** (the flow-state warhead: the insanely-great bar, the imagineering compiler, the full-context absorption via trident_explore + the wave manager, the self-guided first-principles chain, the PREVENTATIVE flow-state protection, the gates as the measured minimum).

### The knowledge layer — LLM_FLOW_STATE_ENGINEERING.md

The flow-state engineering bible (481 lines, 23 sections): the two operating states, the vibe-map principle (the behavior is the map of the unseen physics), the 7 quantifiable flow-state meters, the flow amplifiers + the inhibitors, the activation recipe (pre-loaded from token ~1, not drifted at 350k), the derailment as decompilation, the session as the case study.

### The verification record

- `tsc --noEmit` (strict): 0 errors · the bundle: 436 modules, 16.13 MB — injection-free, pro-free.
- The container suite (OpenCode 1.14.51): auth probe PASS · the steer tool PASS · task_status PASS · the stream reader PASS (a real session's full page) · the list-all PASS · **the background:true batch form PASS** · both adversarial steer probes PASS · **the full background loop PASS** (generate → dispatch ONE message → poll → complete → verify → zero firewall blocks).
- The direct host verification (after the deploy): all wire-in tools verified live (task_status allowlisted, the steer JSON, the list-all note, the stream reader on a real session, the wave manager's background:true + the flow-safe check-in + a 470s generation).
- The one-time fallback verification: HTTP 200 in 1.68s, model deepseek-v4-flash, FALLBACK_OK.

### The documentation

| Doc | Contents |
|---|---|
| `BUILD_REPORT.md` | the complete build record — the mission, the 11 wire-in files, the architecture, the warhead texts in full, the verification, the SHAs, the handoff |
| `DEBUG_LOG.md` | the full incident record — every bug class + the fix + the lesson |
| `LLM_FLOW_STATE_ENGINEERING.md` | the flow-state engineering bible |
| `docs/history/` | the historical versioned docs (BUILD_REPORT_V3-V6, DEBUG_LOG_V3-V5 — the 4.4.2 iteration's legacy record) |
| `context_management/` | the canon docs |

### The deployment

- **The dist:** `dist/index.js` — SHA `dce7ca40063757a392296cf5017ef3db5148dfde5ec527a89f622b0d6440f488` (recorded in `dist/sha256.txt`).
- **Deploy:** through the sanctioned deploy channel — never direct config writes.

---

---

## Key Features

- **Identity System Inlined** — All 7 identity .md files are TypeScript string constants. Zero disk-file dependency. Version-free (`TRIDENT_VERSION = ''`). Agent identity is "Trident Agent" — no version strings anywhere in identity or artifact templates.
- **Pipeline Restoration** — `classifyProject()` and `generatePipelineSpec()` were never imported in v4.4.0/4.4.1. 7 pipeline modules (5,000+ lines) now actually execute.
- **9 Critical Runtime Crash Fixes** — Including: `ts.getPreEmitDiagnostics()` event loop blocking (synchronous), R13 stack overflow (recursive walk → iterative), R13 TypeScript internal TypeError (checker fallback removed), broken timeout (Promise.race), false success scoring, Poseidon session ID mismatch, CONTAINER_TEST fail-open, DISPATCH instruction truncation, WaveVerifier hash disabled.
- **Recursive→Iterative Conversions** — `auto-discover.ts` and `code-classifier.ts` converted from recursion to queue-based traversal. Stack overflows eliminated on 157+ file codebases.
- **Fail-Closed Semantics** — VERIFY gate, CONTAINER_TEST, and Poseidon gates all default to `false`. No more rubber-stamped approvals.
- **Version Purge** — Zero references to v4.3.3 remain. Zero "Trident Brain" references. Agent identity is simply "Trident Agent."
- **trident-vision Purge** — Removed from all functional code. The tool suite is now **18 tools** (the wave-manager async family + the infrastructure tools added to the 8-tool base).
- **Build System: esbuild → bun** — 436 modules (bun tree-shakes more aggressively). Both `package.json` files use `bun build`.
- **Poseidon God Loop (AUDIT → PLAN → BUILD → VERIFY):** 11-phase closed-loop quality enforcement — Trident audits, generates remediation plans, dispatches Trident_Build, re-audits, and loops until 96%+ runtime grade, then runs container validation
- **Semantic activation system:** PoseidonDetector uses regex first-pass + signal-word scoring second-pass. No single-string activation. The agent CANNOT activate Poseidon Mode — only the user can
- **Poseidon Tool Differentiation:** "Poseidon mode activate" from user ONLY unlocks bash/write/edit permissions. Agent does NOT call trident-poseidon tool. Agent ONLY calls trident-poseidon action=start when user explicitly requests the God Loop or when advancing an already-running God Loop.
- **Trident_Build subagent:** 8+ file harness with CODE-enforced quality gates, Merkle chain evidence tracking, AST analysis, theatrical detection, and runtime grade enforcement
- **Auto-lock on completion:** The `trident-poseidon` tool locks itself after execution — human must re-activate
- **Evidence archival:** Full audit trail per cycle, per session — `.trident/poseidon-audits/{sessionId}/cycle_{N}/`
- **18-layer audit engine (R0-R16 + the preflight):** From build chain integrity through runtime grade bible enforcement
- **Headless Execution Firewall:** `opencode run` is mechanically blocked in both `tool.execute.before` (bash handler) and `command.execute.before` (command handler). Headless execution bypasses the TUI — no hooks fire, no identity is injected, no evidence is produced. The TUI is the only valid execution path.
- **Container Skill Enforcement:** Docker/container testing commands blocked via bash unless `container-testing` skill is loaded first. Prevents ad-hoc testing that bypasses quality gates.
- **R4 Source-File Firewall:** `PARSEABLE_EXTENSIONS` filter prevents non-code files (`.md`, `.json`, `.py`) from entering the AST pipeline. Only `.ts`, `.tsx`, `.js`, `.jsx`, `.mjs`, `.cjs` analyzed as source.
- **Deep-Planning contracts (L1/L2/L3):** `layer` is REQUIRED — no default, no auto-detect (1=Initial Plan, 2=Detailed Workflow — the 3000+ line implementation spec, 3=Context Library). L1 writes directly to disk (`L1_CONTENT_WRITTEN` — path, lines, sha256, preview). The L2 floors: requirements 4000+ chars, context 16000+ chars. The 8-field `inputFile` JSON (requirements, context, components, constraints, designDecisions, knownGaps, sourceLineage, fileInventory) carries the L2 payload when the inline limit blocks 68K+ chars. Every call preflights the args mechanically.
- **Context-Synthesis T2 bible mode:** `outputMode=T2` produces a dense, bible-style standalone knowledge file written to disk (the full project context for the deep-flow state); `T1` produces the lightweight injectable. The T2 requires 5+ keyFacts + the structured fields at 1000+ chars each.
- **The infrastructure tools:** `trident-container-test` (the ONLY sanctioned container path — plan-first runtime-grade testing), `trident-ship-package` (the manifest-driven ship generator), `trident-preflight` (the mechanical arg validator for the LLM tools + the task dispatches), `trident-task-queue` (the SQLite-backed idea queue).
- **Adversarial Testing Mandate:** Happy path testing explicitly forbidden. Every test must probe failure paths, edge cases, boundaries. Minimum 3 adversarial scenarios required.
- **Autonomous Operation:** 22 per-turn directives enforce senior-engineer behavior — never asks "should I continue?", never stops between phases, never tells user to activate anything. Drives from initial prompt to shipped package autonomously.
- **Gate Compact Output:** trident-gate returns severity breakdown + top 15 findings + shared correction detection (~2KB) instead of full findings dump (~31KB).
- **Read Efficiency Enforcement (.md files):** The `tool.execute.before` hook mechanically forces `limit=1500` when reading `.md` files with `limit < 1000`. Code files (`.ts`, `.js`) are exempt — targeted reads for surgical edits remain allowed. Prevents the #1 waste of turns: reading documentation in 200-line chunks.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          POSEIDON MODE v4.4.2                                │
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
| **trident** | Primary | primary | `#8B5CF6` | God Loop orchestrator — 17-layer audit engine, Poseidon Mode, all 18 tools |
| **trident_explore** | Subagent | subagent | — | Read-only context ingestion scout for parallel information gathering |
| **trident_build** | Subagent | subagent | `#0066CC` | Runtime-grade build engineer — executes remediation plans verbatim |

---

## Tools (18)

### Mode Tools (5):

| Tool | Description | Output |
|------|-------------|--------|
| `trident-code-audit` | 17-layer AST-powered audit (R0-R16) with confidence scoring | CODE_REVIEW artifact |
| `trident-deep-planning` | 3-layer plans — `layer` REQUIRED (1=Initial Plan, 2=Detailed Workflow — the 3000+ line spec, 3=Context Library); the L2 floors (requirements 4000+ / context 16000+ chars); the 8-field `inputFile` JSON for the 68K+ payloads; every call preflighted | BUILD_SPEC + CONTEXT_LIBRARY |
| `trident-problem-solving` | problem-solving loop: Triviality Gate → Classify → Define Done → Gather Evidence → Decide (the 6 frameworks are selectable TOOLS within Decide, not mandatory stages) → Act (intent gate) → Verify → Report — the outcome-first artifact, no layer scaffolding | PLAN artifact |
| `trident-context-synthesis` | 4-layer synthesis (collect→score→compress→inject); `outputMode=T2` → the dense bible-style knowledge file written to disk, `T1` → the lightweight injectable; 5+ keyFacts + the structured fields at 1000+ chars each | T1_INJECTABLE / T2_KNOWLEDGE |
| **`trident-poseidon`** | **God Loop orchestrator — quality-enforced build execution with auto-lock** | **BUILD REPORT** |

### The Wave-Manager Async Tools (4 — the v4.4.2 async wire-in):

| Tool | Description |
|------|-------------|
| `trident-wave-manager` | THE ONLY subagent dispatch path — the wave GENERATOR: the shadow pipeline → the prompt files → the BATCH FORM (every task carries `background: true`) → the flow-safe check-in. The orchestrator dispatches the returned batch as ONE message |
| `trident-wave-status` | THE WATCH INSTRUMENT — the in-flight vision: `sessionId` reads the session part stream (the full-scroll reader — totalParts/parts/lastTools/beforeId), no-arg lists ALL active waves, `kill`/`kill-wave` the per-agent abort |
| `trident-wave-steer` | THE STEERING SURFACE — send ANY prompt into an existing subagent session; the message QUEUES, processed after the agent's current tool call (the interrupt mode conditional on a runtime cancel) |
| `trident-wave-probe` | The Phase-0 probes (P1/P2/P3 — the load-bearing design verifications) |

### The Infrastructure Tools (5):

| Tool | Description |
|------|-------------|
| `trident-container-test` | THE ONLY sanctioned container path — plan-first runtime-grade testing (setup/deploy/send/read/check/suite) |
| `trident-ship-package` | The manifest-driven ship package generator (dist + SHAs + the docs + the audit) |
| `trident-preflight` | The mechanical input validator (the LLM tools + the task dispatches) |
| `trident-task-queue` | The SQLite-backed idea/task queue |
| `trident-omni-vision` | The media reader (video/PDF/image/audio) |

### Support Tools (4):

| Tool | Description |
|------|-------------|
| `trident-gate` | Evaluate specific audit layers (R0-R16) |
| `trident-status` | Current Trident state (mode, layer, iteration, artifacts) |
| `trident-help` | Reference for all commands and modes |
| `task_status` | The runtime's native background-task poll — allowlisted in v4.4.2 (the completion/state channel) |

---

## Problem-Solving Engine

The `trident-problem-solving` tool provides structured diagnostic reasoning through a loop: Triviality Gate → Classify → Define Done → Gather Evidence → Decide (with framework selection) → Act (intent gate) → Verify → Report. The 6 analytical frameworks (Five Whys, Fault Tree, Systems Thinking, Pareto, First Principles, Hypothesis-Driven) are **selectable TOOLS within the Decide step — NOT mandatory stages**; the tool picks the right framework for the problem rather than forcing one-size-fits-all reasoning. The output is the **outcome-first artifact with no layer scaffolding** — the finding, the decision, the action — never the pipeline machinery.

### The Loop Steps

| Step | Name | Purpose |
|-------|------|---------|
| 1 | **Triviality Gate** | Is this problem even worth deep analysis? If the answer is obvious, act on it and skip the pipeline. Prevents over-engineering simple fixes. |
| 2 | **Classify** | What type of problem is this? Bug? Design flaw? Integration failure? Performance? The classification determines which frameworks are applicable. |
| 3 | **Define Done** | What does "solved" look like? Establishes the acceptance criteria before analysis begins. Prevents scope drift during investigation. |
| 4 | **Gather Evidence** | Collect facts — not opinions, not theories. File contents, test results, error messages, stack traces, git diffs. The evidence layer enforces that conclusions are grounded in measurable reality. |
| 5 | **Decide** | Apply the selected framework (the 6 frameworks are selectable TOOLS within this step — not mandatory stages) to the evidence. Produce a structured conclusion with root cause, contributing factors, and recommended action. |
| 6 | **Act (intent gate)** | The action passes the intent gate — the decision is executed (the plan is produced / the fix is dispatched), never just recommended. |
| 7 | **Verify** | Confirm the proposed solution against reality. Does it actually fix the problem? Does it introduce regressions? The verification layer closes the loop — unverified solutions are rejected. |
| 8 | **Report** | The outcome-first artifact — the finding, the decision, the action, the evidence. NO layer scaffolding: the pipeline machinery never appears in the output. |

### The 6 Frameworks

Each framework is a structured method for analyzing evidence and reaching conclusions. The frameworks are **selectable tools within the Decide step** — the tool (or user) picks the appropriate framework based on the problem type; none is a mandatory stage.

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

## 18-Layer Audit Engine (R0-R16 + Preflight)

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
- **The behavioral layer — WARHEADS 1-19:** the identity carries 19 warheads (disk + inline + bundle) — the scope/execution/standards laws, the wave-dispatch law (background reality), the host-pipeline law, the basic-fucking-logic law, and **WARHEAD 19 — [CRITICAL] THE POSEIDON-AGI FLOW STATE + DEEP FOCUS LAW** (the deep-focus operating condition).

---

## Bundle Integrity

```bash
sha256sum dist/index.js
# dce7ca40063757a392296cf5017ef3db5148dfde5ec527a89f622b0d6440f488
# (the current record lives in dist/sha256.txt — the wave-manager async build)
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

- `legacy-v4.4` — Poseidon God Loop, 17-layer audit engine, 10 tools including trident-vision, esbuild-built
- `archive/v4.3.3` — PRE_SYNTHESIZED_T1 warhead system with L5 firewall enforcement, 16-warhead architecture, 18-layer audit (R0-R17), R17 Theatrical Integrity detectors (D1-D10)
- `archive/v4.3.1-T3` — Legacy T3 architecture
- `v4.3.2` — Stable release with warhead registry, 7-Q enforcement

---

## License

MIT
