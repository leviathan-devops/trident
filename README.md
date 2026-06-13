# TRIDENT v4.3.2 — Algorithmic Audit Engine

**Status:** ✅ RUNTIME GRADE — SHIP GATE ENGINE CERTIFIED — 7/7 container tests (100.0%), 10/10 anti-cheat, 600s sustained runtime
**Bundle:** 14,564,011 bytes (14.6 MB)
**Runtime:** opencode 1.14.43+

---

## Overview

Trident v4.3.2 is a runtime-grade algorithmic audit engine plugin for opencode. It provides a 17-layer audit pipeline (R0-R16), 3-layer blocking architecture, XState-powered orchestration, NLP-driven intent parsing, and Merkle-verified artifact generation — enforcing code quality without modifying code itself.

### Architecture

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

### Identity

When asked "who are you":

> **"I am TRIDENT v4.3.2 — Algorithmic intelligence, the audit engine of the opencode ecosystem."**

Identity scoping via SCAN+REPLACE system.transform markers:
- **Trident** — Full TRIDENT identity via `experimental.chat.system.transform` REPLACE pattern with SCAN markers
- **Build agents** — TASK CONTEXT only (no identity leak)
- **Plan agents** — TASK CONTEXT only
- **Shark/Spider agents** — Their own identity markers, isolated from Trident

---

## Tools (8)

| Tool | Parameters | Description |
|------|------------|-------------|
| `trident-code-audit` | targetPath, depth?, layers? | Run 17-layer algorithmic audit on a project, file, or snippet |
| `trident-deep-planning` | goal, constraints?, context? | Generate deep planning artifact with dependency analysis |
| `trident-problem-solving` | problem, constraints? | 6-layer problem solving mode: Assumption → Action → Observation → Gap → Meta → Verify |
| `trident-context-synthesis` | sources, goal | Synthesize context from multiple sources into structured artifact |
| `trident-gate` | action, gate? | Gate management: status, advance, evidence |
| `trident-status` | (none) | Get current Trident state, mode, layer, iteration |
| `trident-vision` | imageUrl, question | Visual AI analysis of screenshots and images |
| `trident-help` | topic? | Display Trident usage guide and tool documentation |

BLOCKED tools: `edit`, `write`, `bash`, `task` (non-Trident), `glob`, `grep`, `read`, `todowrite`, `hive write`, `spawn` — all return carrier-verified identity-gated error.

---

## Agents (2)

| Agent | Type | Role |
|-------|------|------|
| trident | Primary | Algorithmic audit engine — all audit tools available |
| trident_explore | Subagent | Exploration agent |

---

## 17-Layer Audit Engine (R0-R16)

| Layer | Name | Purpose |
|-------|------|---------|
| R0 | Preflight | Input validation, path resolution, capability check |
| R1 | Boundary | File/module boundary analysis |
| R2 | Type | TypeScript type safety, assertion correctness |
| R3 | Control Flow | Control flow analysis, branch coverage |
| R4 | Resource | Resource lifecycle, cleanup in all paths |
| R5 | Error | Error path completeness, no empty catches |
| R6 | Async | Promise handling, async discipline |
| R7 | Output | Output contract verification |
| R8 | Contract | Interface/type contract enforcement |
| R9 | Side-Effect | Side-effect truth analysis, theatrical return detection |
| R10 | Hallucination | Hallucination detection — claims without tool evidence |
| R11 | Theatrical | Theatrical code detection — `echo`, `simulate`, `mock`, `fake`, `placeholder` |
| R12 | Security | Security audit — injection, path traversal, secret exposure |
| R13 | Identity | Cross-agent identity leak detection |
| R14 | Cross-Agent | Cross-agent tool call isolation |
| R15 | Persistence | State persistence correctness |
| R16 | Summary | Aggregated verdict with per-layer scores |

---

## 3-Blocking-Layer Architecture

| Layer | What It Blocks | Method |
|-------|---------------|--------|
| BLOCKED_TOOLS | edit, write, bash, task (non-Trident), glob, grep, read, todowrite, hive write, spawn | Agent-gated — carrier identity verified before execution |
| HIVE_TOOLS | hive-read, hive-write | Cross-agent hive access gated by carrier identity |
| THEATRICAL | echo simulate, mock, fake, placeholder, TODO, FIXME | Regex pattern scan — theatrical code gateway |

---

## Bundle Integrity

```bash
sha256sum dist/index.js
```

---

## Source Structure

```
dist/
├── index.js              # Plugin bundle
├── sql-wasm.wasm         # SQL WebAssembly engine
├── package.json
source-snapshot/          # Full TypeScript source tree
identity/                 # Identity markers and verification
```

---

## Deployment

### Plugin Installation

```bash
# 1. Copy the plugin bundle
mkdir -p ~/.config/opencode/plugins/trident/dist
cp dist/index.js ~/.config/opencode/plugins/trident/dist/index.js

# 2. Add to opencode.json
```

---

## Remaining Issues

| ID | Severity | Description |
|----|----------|-------------|
