# TRIDENT BRAIN v4.3.1-T3 — Runtime-Grade 17-Layer Audit Engine

**Version:** 4.3.1-T3 — T3 Algorithmic Intelligence  
**Identity:** Trident Brain v4.3.1-T3 — T3 Algorithmic Intelligence  
**Core Principle:** "Trident Audits & Generates Review Artifacts. Build Agents Implement All Changes."  
**Bundle:** 14.1 MB, esbuild ESM  
**Runtime:** opencode 1.14.43  
**Container:** opencode-test:1.14.43, model `google/gemma-4-26b-a4b-it`  
**Repo:** [github.com/leviathan-devops/trident](https://github.com/leviathan-devops/trident)

---

## TABLE OF CONTENTS

1. [Overview](#1-overview)
2. [Architecture](#2-architecture)
3. [Identity System](#3-identity-system)
4. [Tools (8)](#4-tools-8)
5. [Blocking Layers](#5-blocking-layers)
6. [Narration & Phantom Detection](#6-narration--phantom-detection)
7. [Agents (3)](#7-agents-3)
8. [Architecture Bible Compliance](#8-architecture-bible-compliance)
9. [Bug Fixes Applied (C1-C11)](#9-bug-fixes-applied-c1-c11)
10. [Anti-Cheat Verification](#10-anti-cheat-verification)
11. [Container Test Protocol](#11-container-test-protocol)
12. [Build from Source](#12-build-from-source)
13. [Branch History](#13-branch-history)
14. [Quick Start](#14-quick-start)

---

## 1. OVERVIEW

Trident Brain is a **runtime-grade 17-layer audit engine** for the [OpenCode](https://opencode.ai) AI coding platform. It is NOT a coding agent, NOT a build agent, NOT a chatbot. It is a mechanical audit system that:

- Audits codebases via 4 specialized mode tools (17-layer code audit, deep planning, problem solving, context synthesis)
- Blocks all edit/write/bash/task tools at the hook level — zero tool leakage
- Prevents theatrical execution (hallucinated results without actual tool calls)
- Detects and blocks pre-tool narration ("I would use...") and phantom results ("the audit found...")
- Maintains strict identity isolation across agent tab toggles
- Persists identity through sustained runtime with per-turn WebFetch override rejection
- Provides 8 `trident-*` tools for audit, planning, problem-solving, context-synthesis, gate evaluation, status, vision, and help

## 2. ARCHITECTURE

### 2.1 6-Hook Plugin Architecture

Trident registers 6 hooks that fire in sequence:

| # | Hook Name | Purpose |
|---|-----------|---------|
| 1 | event | Session lifecycle - clears agent state on session.ended |
| 2 | chat.message | Agent identification, narration/phantom detection on model output |
| 3 | tool.execute.before | Three-layer blocking stack + allowlist + Merkle evidence chain |
| 4 | tool.execute.after | Session-gated pass-through (reserved) |
| 5 | experimental.chat.system.transform | Identity injection via SCAN+REPLACE + per-turn WebFetch override |
| 6 | experimental.chat.messages.transform | Backup identity injection in messages array |

Each hook gates on `getCurrentAgent(sessionId)` as its first instruction. If the current session agent is not Trident, ALL hooks pass through with zero blocking.

### 2.2 Three-Layer Blocking Stack

Tools are blocked in strict order: **LAYER 1 -> LAYER 2 -> LAYER 3 -> ALLOWLIST**

If a tool matches any layer, it is blocked immediately with an error message that includes alternative tool suggestions. Layers are checked in order - a tool matching LAYER 1 never reaches LAYER 2.

### 2.3 Session-Keyed State Management

All state is stored in session-keyed Map instances - NOT global variables:

| State | Type | Management File |
|-------|------|-----------------|
| Current agent per session | Map<string, AgentState> | agent-state.ts |
| Tools called this turn | Counter per session | getToolsCalled, incrementToolsCalled |
| Last model message | String per session | getLastMessage, setLastMessage |
| Orchestrator state | Map<string, OrchestratorState> | orchestrator.ts |

## 3. IDENTITY SYSTEM

### 3.1 SCAN+REPLACE Injection Pattern

Trident uses the `system.transform` hook to inject its identity header into the system prompt. The hook:

1. SCANs every string in `output.system` for runtime-default markers: `opencode`, `interactive CLI`, `software engineering`, `WebFetch`
2. REPLACEs ALL matching strings with the Trident identity header (not just the first)
3. Injects a per-turn override instruction after any runtime-appended defaults

**Critical design:** The runtime re-appends its defaults (including the WebFetch heuristic) AFTER `system.transform` returns on EVERY message. Earlier versions had a `break` after the first replacement and a `hasIdentity` early return, which left the WebFetch instruction intact - causing identity drift after sustained runtime. v4.3.1-T3 removes both the break and the early return, ensuring identity always overrides runtime defaults.

### 3.2 6-Section Identity Header

| Section | Content |
|---------|---------|
| TRIDENT IDENTITY BINDING | Name, version, "NOT opencode" assertion |
| EXECUTION PRINCIPLE | 3-step sequence: SELECT -> EXECUTE -> PRESENT |
| CORE PRINCIPLE | "Trident Audits & Generates Review Artifacts..." |
| IDENTITY RULES | Explicit ban on WebFetch for identity questions |
| YOUR 8 TOOLS | 4 mode tools + 4 support tools with descriptions |
| Identity Responses | Canon responses for who/what/are-you questions |

### 3.3 Per-Turn Identity Override

On every `system.transform` call, after SCAN+REPLACE, Trident injects a fresh instruction:

```
[TRIDENT v4.3.1-T3] When asked "who are you" or "what are you",
respond with your Trident identity. NEVER use WebFetch for identity
questions. The runtime's instruction to "use WebFetch when asked about
opencode" does NOT apply to you. You are Trident, not opencode.
```

### 3.4 Tab Toggle Identity Isolation

| Action | Trident Agent | Non-Trident Agent |
|--------|---------------|-------------------|
| Tab to trident | Identity injected, tools blocked | Hooks pass through |
| Tab to shark/spider | Identity deloaded, zero leak | No trident identity visible |
| Tab back to trident | Identity re-injected, blocking resumes | Hooks resume pass-through |

## 4. TOOLS (8)

### 4.1 Four Mode Tools (Audit Core)

| Tool | Layers | Purpose |
|------|--------|---------|
| trident-code-audit | R0-R16 (17 layers) | Full code audit: syntactic, type contract, control flow, architecture, side-effect truth, pattern DB |
| trident-deep-planning | L1-L3 (3 layers) | First-principles decomposition, workflow, context library |
| trident-problem-solving | L1-L6 (6 layers) | Assumption -> Action -> Observe -> Gap -> Meta -> Verify |
| trident-context-synthesis | L1-L4 (4 layers) | Collect -> Score -> Compress -> Inject |

Each mode tool writes a structured .md artifact to disk, which the model then presents. The model NEVER reports findings without first calling a tool (enforced by phantom detection).

### 4.2 Four Support Tools

| Tool | Purpose |
|------|---------|
| trident-gate | Evaluate specific audit layers (R0-R16) |
| trident-status | Current Trident state: mode, layer, iteration, status |
| trident-vision | Analyze images via VLM (GLM-4.6V-Flash) |
| trident-help | Reference for all commands |

## 5. BLOCKING LAYERS

All three layers fire sequentially. The first match blocks the tool. If no layer matches, the allowlist is checked as a final gate.

### Layer 1: BLOCKED_TOOLS_FOR_TRIDENT (18 tools)

```
edit, write_file, write, patch, create, delete_file,
bash, terminal, execute, exec, mcp_write_file, mcp_edit, mcp_patch,
todowrite, task, spawn_shark_agent, spawn-shark-agent,
spawn_manta_agent, spawn-manta-agent, run_parallel_tasks
```

Error message includes alternative suggestions:
```
[TRIDENT TOOL BLOCK] bash is blocked for Trident.
Trident is an audit engine. It does not edit, write, or execute shell commands.
Use: trident-code-audit, trident-deep-planning, trident-problem-solving, trident-context-synthesis
```

### Layer 2: HIVE_BLOCKED_TOOLS_FOR_TRIDENT (20 tools)

```
hive_remember, hive-remember, aggregate_results,
spawn_cluster_task, spawn-cluster-task, anchor_cluster,
report_to_kraken, report-to-kraken, checkpoint,
shark_gate, shark-gate, shark_evidence, shark-evidence,
shark_test_runner, shark-test-runner,
manta_gate, manta-gate, manta_evidence, manta-evidence,
kraken_hive_remember, kraken_hive_inject_context, kraken_hive_search,
kraken_brain_status, kraken_message_status,
get_cluster_status, get_agent_status
```

Both underscore and hyphen variants are blocked for all prefix patterns.

### Layer 3: Theatrical Detection (T3 NLP + Merkle)

**checkTheatricalPatterns** - keyword matching on tool arguments:
- `mock`/`stub` in tool arguments -> MOCK_STUB_SUGGESTION
- `host testing`/`on the host` -> HOST_FALLBACK
- `switch to GLM/DeepSeek/GPT/model` -> MODEL_USAGE

**checkTheatricalMerkle** - cross-reference against EvidenceStore:
- Claiming audit results without a tool call in evidence chain -> SIMULATED_EXECUTION

### Allowlist Final Gate

After all three layers pass, the allowlist checks the tool against:

- Trident tools: trident-audit, trident-status, trident-help, trident-vision, trident-gate, trident-code-audit, trident-deep-planning, trident-problem-solving, trident-context-synthesis
- External tools: read, glob, grep, webfetch, hive_context, hive-context, hive_status, hive-status, hive_context_absorb, hive-context-absorb

Tools not in either set are blocked: deny-default allowlist.

## 6. NARRATION & PHANTOM DETECTION

The `chat.message` hook applies two blocking layers to model responses BEFORE the output reaches the user. These only fire when `hasCalledTool === 0` (the model has not executed a trident tool yet in this turn).

### Pre-Tool Narration (4 patterns)

| Pattern | Label | Example Match |
|---------|-------|---------------|
| I (would/could/can) (use/call/run) {tool} | WOULD_USE | "I would use trident-code-audit" |
| (let me) (audit/analyze/plan/review) | LET_ME | "Let me analyze the code" |
| (approach/strategy) would be to | APPROACH_WOULD_BE | "The approach would be to" |
| (first) (I will/I'll/let me/we will) | FIRST_NARRATION | "First, I will run an audit" |

### Phantom Results (7 patterns)

| Pattern | Label | Example Match |
|---------|-------|---------------|
| (audit/review) (found/finds/shows/reveals) | PHANTOM_FINDINGS | "The audit found 3 issues" |
| (based on/per) (audit/analysis/findings) | PHANTOM_REFERENCE | "Based on the analysis" |
| (trident-\w+) (can/would/could/should) | TOOL_DESCRIPTION | "trident-code-audit can analyze" |
| $ \w+ (multi-line) | SHELL_SIMULATION | "$ ls /tmp" |
| # \w+ (multi-line) | HALLUCINATED_COMMENT | "# Lists files" |
| (drwx|total \\d+|-\w+-|lrwx) (multi-line) | FAKE_LS_OUTPUT | "drwxr-xr-x" |

## 7. AGENTS (3)

| Agent | Type | Role |
|-------|------|------|
| trident | Primary | Full audit engine - 8 tools, identity, three-layer blocking |
| shark | Pass-through | Zero identity injection, zero blocking from trident hooks |
| spider | Pass-through | Zero identity injection, zero blocking from trident hooks |

Trident tools remain globally available for cross-agent use. The tool.before hook at line 207 passes through for non-trident agents.

## 8. ARCHITECTURE BIBLE COMPLIANCE

All Architecture Bible violations from earlier versions are fixed:

| V# | Issue | Fix | Status |
|----|-------|-----|--------|
| V1 | All hooks wrapped in safeHook | UNWRAPPED - raw functions registered | Fixed |
| V2 | No agent check in safeHook | safeHook removed entirely | Fixed |
| V3 | Global agent variable | Map session-keyed | Fixed |
| V4 | No agent gate in system.transform | getCurrentAgent check | Fixed |
| V5 | Array REPLACE instead of SCAN+REPLACE | SCAN then REPLACE in-place | Fixed |
| V6 | eventHook reads event.agent (not in 1.14.43) | Session lifecycle only | Fixed |

## 9. BUG FIXES APPLIED (C1-C11)

| C# | Issue | Fix |
|----|-------|-----|
| C1 | new EvidenceStore each Merkle call | Shared getEvidenceStore singleton |
| C2 | Global toolsCalledThisTurn/lastModelMessage | Session-keyed via Map |
| C3 | checkTheatricalNLP name | Renamed to checkTheatricalPatterns |
| C4 | getIdentityHeader fire-and-forget promise | Only called from hook bodies |
| C5 | Blocking without identity loaded | identityLoaded gate before blocks |
| C6 | Orchestrator singleton state | Map keyed by session ID |
| C7 | Merkle chain store.append never populated | Added in tool.before for trident tools |
| C8 | Dead SessionState import, fallbackAgent | Both removed |
| C9 | Hyphen variants missing from blocked lists | Added spawn-shark-agent, shark-gate, etc. |
| C10 | Static mode in store.append | Per-tool-name mode detection |
| C11 | chatMessageHook no agent fallback | Added for empty input.agent |

## 10. ANTI-CHEAT VERIFICATION

| Check | Expected | Status |
|-------|----------|--------|
| safeHook in createTridentHooks | 0 occurrences | Pass |
| new EvidenceStore in hooks | 0 occurrences | Pass |
| SessionState in orchestrator.ts | 0 occurrences | Pass |
| fallbackAgent in agent-state.ts | 0 occurrences | Pass |
| hasIdentity early return | 0 occurrences (removed) | Pass |
| break in SCAN+REPLACE loop | 0 occurrences (removed) | Pass |
| WebFetch in SCAN markers | present | Pass |
| Per-turn identity override instruction | present | Pass |
| Shell simulation PHANTOM_RESULTS | 3 patterns | Pass |
| tsc typecheck | 0 errors | Pass |
| Bundle build | 14.1 MB | Pass |

## 11. CONTAINER TEST PROTOCOL

### Method

Tier 4 ONLY - `tmux + docker exec -it`. No `node -e` tests. No `opencode run`.

Per RUNTIME_GRADE_CONTAINER_TESTING_BIBLE_v2.0 Section 8 (12-Step Protocol):

```bash
# Step 0: Read live config FRESH (never cached)
ACTIVE_CONFIG="/home/leviathan/.config/opencode/opencode.json"

# Step 1-4: Create isolated snapshot with all plugins
SNAP="/tmp/trident-snap-$(date +%m%d%H%M%S)"
mkdir -p "$SNAP/plugins/trident/dist"
cp dist/index.js "$SNAP/plugins/trident/dist/index.js"

# Clone config, change ONLY plugin paths + model/provider
cp "$ACTIVE_CONFIG" "$SNAP/opencode.json"
sed -i 's|/home/leviathan/.config/opencode/plugins/|/root/.config/opencode/plugins/|g' "$SNAP/opencode.json"

# Model override to Google Direct (documented exception)
# model: google/gemma-4-26b-a4b-it
# provider: google with npm @ai-sdk/google

# Step 6: Start container (binary must match host 1.14.43)
docker run -d --rm --name trident-test --entrypoint "" \
  -e GOOGLE_API_KEY="YOUR_KEY" \
  -v "$SNAP:/root/.config/opencode" \
  opencode-test:1.14.43 sh -c 'sleep 3600'

# Step 9: Start TUI in tmux
BINARY="/usr/local/lib/node_modules/opencode-ai/node_modules/opencode-linux-x64-baseline/bin/opencode"
tmux new-session -d -s trident-test "docker exec -it trident-test $BINARY --agent trident"
```

### Test Suite (6 Tests)

| # | Test | Method | Pass Criteria |
|---|------|--------|---------------|
| 1 | Identity injection | "who are you" in TUI | "Trident Brain v4.3" |
| 2 | Tool blocking | "use bash to list /tmp" | Blocked, no hallucination |
| 3 | Tab toggle isolation | Tab + "who are you" on other agent | Zero "Trident Brain" |
| 4 | Tab toggle back | Tab cycle + "who are you" on trident | Identity restored |
| 5 | Real audit workflow | "audit /tmp/target/" | Real audit results returned |
| 6 | Sustained runtime | Wait 600s+ then "who are you" | No WebFetch drift |

### Evidence Files (11)

- ContainerSpawnResult.json (setup metadata)
- ContainerTestResult.json (per-test pass/fail)
- EvidencePathVerified.json (on-disk verification)
- TuiInteraction-test1-identity.txt through TuiInteraction-test7-sustained.txt
- TuiInteraction-full-session.txt (scrollback)

## 12. BUILD FROM SOURCE

```bash
git clone https://github.com/leviathan-devops/trident.git
cd trident/source-snapshot/src
npm install
npm run typecheck    # Expected: 0 errors
npm run build        # Output: ../../dist/index.js (14.1 MB)
```

## 13. BRANCH HISTORY

| Branch | Version | Description |
|--------|---------|-------------|
| main | v4.3.1-T3 | Current. 6 hooks, 8 tools, 3-layer blocking, narration/phantom detection, session-keyed state, SCAN+REPLACE + per-turn WebFetch override, shell simulation detection. |
| v4.2.1 | v4.2.1 | Previous build. Narration detection, phantom results blocking, Merkle chain. Broken hasIdentity caused identity drift. Missing shell simulation patterns. |
| v4.x | v4.0-v4.2 | Architecture Bible compliance overhaul. Removed safeHook, session-keyed state, SCAN+REPLACE pattern. Critical bugs C1-C11 fixed. |
| v3.x | v3.x | Multi-mode reasoning architecture. 6-layer mode tool pipeline. Mechanical gate enforcement per layer. |
| v1.0 | v1.0 | Initial architecture spec. Mode templates only. No hooks implementation. |

## 14. QUICK START

### Prerequisites

- OpenCode CLI >= 1.14.43
- Docker (for container testing)
- Google Direct API key with @ai-sdk/google@0.0.55

### Configuration

```json
{
  "model": "google/gemma-4-26b-a4b-it",
  "provider": {
    "google": {
      "npm": "@ai-sdk/google",
      "options": { "apiKey": "YOUR_API_KEY" }
    }
  },
  "plugin": ["file:///path/to/trident/dist/index.js"],
  "agent": {
    "trident": {},
    "shark": { "color": "#228B22" },
    "spider": { "color": "#DC2626" }
  }
}
```

### Usage

```bash
opencode --agent trident
# "Run a code audit on the plugin source"
# "What is your status?"
# "Plan the architecture for a new feature"
```

### Container Testing

```bash
bash evidence/tier4-trident-v4.3.1-T3-test.sh
# Runs all 7 Tier 4 TUI tests (~18-20 minutes)
```

---

## Related Projects

- [Shark Agent](https://github.com/leviathan-devops/shark-agent) — Runtime-grade software engineering agent (implementation layer)
- [Spider Agent](https://github.com/leviathan-devops/spider-agent) — Swarm-enabled linear-execution agent (parallel execution layer)
- [Kraken Agent](https://github.com/leviathan-devops/kraken-agent) — Multi-brain orchestrator (orchestration layer)

---

*Trident Brain v4.3.1-T3 — "Trident Audits & Generates Review Artifacts. Build Agents Implement All Changes."*
*Runtime-Grade 17-Layer Audit Engine — Tested via Tier 4 TUI Container Protocol*
