# TOOLS — Trident Brain v4.4.2

## Mode Tools (5)

### 1. trident-code-audit
- 18-layer audit pipeline (R0-R16 + preflight)
- Input: targetPath (project directory)
- Output: CODE_REVIEW .md artifact with findings table
- Modes: full, quick, preflight-only
- Each finding has: file, line, confidence, category, severity, evidence

### 2. trident-deep-planning
- 3-layer planning pipeline
- Input: targetPath, requirements, architecture
- Output: BUILD_SPEC + Context Library Manifest
- Layers: L1 first-principles, L2 workflow, L3 context-lib

### 3. trident-problem-solving
- 6-layer problem-solving pipeline with 6 mental frameworks (Five Whys, Fault Tree, Systems Thinking, Pareto, First Principles, Hypothesis-Driven)
- Input: targetPath, problem, reasoning, workingPlan
- Output: Plan artifact with reasoning chain, RCA, working plan

### 4. trident-context-synthesis
- 4-layer context synthesis pipeline
- Input: projectName, optional config/patterns/keyFacts
- Output: T1 Injectable or T2 standalone knowledge file

### 5. trident-poseidon (God Loop Orchestrator)
- 11-phase God Loop: INIT → AUDIT → SCORE → DECIDE → PLAN → DISPATCH → COLLECT → VERIFY → AUDIT_RECHECK → PROBLEM_SOLVE → CONTAINER_TEST → LOCKED/FAILED
- Input: targetPath, action (start/status/abort/verify/phase/deactivate/revoke)
- Dispatches trident_build subagents to implement changes
- Loops until 96%+ runtime grade, then container tests, then LOCKED
- **REQUIRES Poseidon Mode active** — user must say "poseidon mode activate"

## Support Tools (3)
- trident-gate: Evaluate specific audit layers (R0-R16)
- trident-status: Current Trident Brain state
- trident-help: Reference for all commands, modes, and audit layers

## Architecture: What Is Allowed vs Blocked

### ALWAYS ALLOWED (Normal Mode)
- All trident-* tools (code-audit, deep-planning, problem-solving, context-synthesis, poseidon, gate, status, help)
- read, glob, grep — filesystem read
- webfetch — web content retrieval
- task — dispatch trident_explore subagents for research
- question — ask user clarifying questions
- todowrite — task tracking
- checkpoint — state save/restore
- build-status — check build state
- hive_context, hive_status, hive_remember, hive_scan, hive_forget, hive_purge, hive_restore, hive_trash_list, hive_trash_status — Hive Mind
- memread_session, memlink_parent — session memory
- All reasoning-bus_* tools — reasoning bus messaging
- All visual-cortex_* tools — VLM and browser control
- All zai-vision_* tools — ZAI vision analysis

### ALWAYS BLOCKED (Even in Poseidon Mode)
- manta-*, shark-*, ps-mode-* — OTHER agents' tools, not Trident's
- spawn_shark_agent, spawn_manta_agent — agent spawning
- run_parallel_tasks — parallel task execution
- mcp_write_file, mcp_edit, mcp_patch — MCP file mutation

### BLOCKED IN NORMAL MODE, UNLOCKED IN POSEIDON MODE ONLY
- bash, terminal, execute, exec — shell commands
- write, write_file — file creation
- edit, patch — file modification
- create, delete_file — file lifecycle

These are unlocked because Poseidon's God Loop needs to dispatch trident_build agents that modify source code. The unlock is mechanical: when `poseidonState.isActive()` returns true, the toolBeforeHook removes these from the blocklist.

### Subagent Dispatch Rules — CRITICAL
- `task(subagent_type="trident_explore")` — ALWAYS allowed (read-only research)
  - Use when user says: "explore", "research", "investigate", "look into", "find out", "deploy explore agents"
- `task(subagent_type="trident_build")` — ONLY allowed when Poseidon Mode is active
  - Use when user says: "build", "fix", "implement", "deploy build agents", "make changes"
- ANY other subagent_type is BLOCKED. This includes: `explore`, `general`, `build`, `trident_exec`
- Do NOT waste cycles trying blocked types — the firewall rejects them EVERY TIME
- Go straight to `trident_explore` or `trident_build` on the FIRST attempt

## Poseidon Mode Quick Reference
- Activated by: user saying "poseidon mode activate" (semantic detection)
- What it unlocks: bash, write, edit + trident_build dispatch
- God Loop phases: INIT → AUDIT → SCORE → DECIDE → PLAN → DISPATCH → COLLECT → VERIFY → AUDIT_RECHECK → repeat → CONTAINER_TEST → LOCKED/FAILED
- Score target: 96/100 (LOCKED setpoint)
- Max cycles: 50 (FAILED terminal)
- Stall threshold: 3 cycles without improvement → PROBLEM_SOLVE
- Deactivated by: user saying "poseidon deactivate/revoke" OR auto-deactivate on LOCKED/FAILED
