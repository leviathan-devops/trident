# GOD LOOP ENGINEERING SPEC — Trident v4.4.2

## THE INVARIANT

```
THE MODEL IS THE ENGINE.
THE TOOL IS THE DRIVER.
THE STATE FILE IS THE MEMORY.
THE HOOK IS A GUARDRAIL, NOT A DRIVER.
```

## WHAT WE'RE BUILDING

Merge the v4.4.1 baseline (forceful tool output + CycleTracker + verbose plans) with v4.4.2 improvements (10-phase state machine, 0-trust verification, evidence gates, structured extraction, WaveVerifier, ContainerTestRunner, StrategicIntelligence) into a TRUE autonomous God Loop.

## BASELINE: v4.4.1 (forked from GLOBAL NUKE RELOAD/Trident/v4.4-POSEIDON)

- 145 .ts files, 26,693 lines
- 3 tools at peak quality: CR (L2 AST+TypeChecker), DP (assembler), CS (baseline+guards)
- 14 warheads registered
- 18 audit layers (R0-R17)
- Poseidon: v4.4 2-phase loop (522 lines) with forceful output

## v4.4.2_FAIL CODE TO PORT FROM

Location: `/home/leviathan/OPENCODE_WORKSPACE/Shared Workspace Context/Manta Agent/Active_Projects/Trident_v4.4.2_FAIL/`

Files to PORT (genuine improvements):
1. `src/poseidon/god-loop.ts` — 10-phase state machine structure (1417 lines — extract the GOOD parts, reject passive output)
2. `src/poseidon/wave-verifier.ts` — SHA256 verification of agent claims
3. `src/poseidon/container-tester.ts` — Docker container mechanical test
4. `src/poseidon/strategic-intelligence.ts` — 8-module self-healing system
5. `src/poseidon/checkpoint-manager.ts` — Checkpoint save/recovery
6. `src/poseidon/visibility-logger.ts` — Decision logging
7. `src/poseidon/container-intelligence-probe.ts` — Diagnostic question generation
8. `src/poseidon/poseidon-state.ts` — LEAF NODE SECURITY (nested Poseidon prevention)
9. `src/hooks/poseidon-enforcer-hook.ts` — Thin guardrail pattern (strip to ~120 lines)

Files to KEEP from v4.4.1 (reject v4.4.2 regressions):
1. `src/poseidon/god-loop.ts` — v4.4's `generateVerbosePlan()` (reads actual source code, shows lines to fix)
2. `src/poseidon/cycle-tracker.ts` — Per-finding lifecycle tracking (new→persistent→regression→fixed)
3. `src/tools/trident-poseidon.ts` — v4.4's FORCEFUL tool output pattern ("DISPATCH NOW. DO NOT STOP.")

## THE 10-PHASE STATE MACHINE

```
INIT → AUDIT → SCORE → DECIDE → PLAN → DISPATCH → COLLECT → VERIFY → AUDIT_RECHECK → repeat → CONTAINER_TEST → LOCKED/FAILED
```

### Self-Executing Rule (CRITICAL)

Only DISPATCH requires model action. All other phases execute mechanically:
- INIT: Scan files, compute hash → return text
- AUDIT: Call AuditEngine internally → populate findings → return text
- SCORE: Compute progressive score + CycleTracker lifecycle → return text
- DECIDE: Pure logic routing (score≥96→LOCKED, stall→PROBLEM_SOLVE, else→PLAN) → return text
- PLAN: Generate wave manifest WITH verbose source code context → return text
- DISPATCH: Return instructions for model to spawn agents (ONLY model-action phase)
- COLLECT: Run context synthesis internally → return text
- VERIFY: Check evidence gate (0.96) + WaveVerifier → return text
- AUDIT_RECHECK: Re-audit modified files only → return text
- CONTAINER_TEST: Run container test internally → return text

## FORCEFUL TOOL OUTPUT PATTERN (v4.4 — must be preserved)

Every phase returns explicit, actionable text:

```
[POSEIDON: PLAN → DISPATCH]
Wave 1: 5 agents. Each agent has specific findings + source code context.
DISPATCH: Execute 5 task() calls NOW with subagent_type='trident_build'.
DO NOT WAIT. DO NOT ASK. DISPATCH ALL 5 IN PARALLEL.
After ALL agents return, call trident-poseidon action=start to COLLECT.
```

## NESTED POSEIDON PREVENTION

- Build agents CANNOT call trident-poseidon (LEAF NODE SECURITY in poseidon-state.ts)
- Build agents CANNOT spawn sub-agents
- Build agents receive explicit WORKDIR pointing to real project
- Path enforcement in tool.before hook rejects writes outside project root
- WaveVerifier checks all work happened in project directory

## THE 6 BANNED PATTERNS

1. NO god-loop-hook.ts replacing GodLoopOrchestrator (hook is guardrail only)
2. NO dynamic system prompt injection (one static line, never changes)
3. NO filesystem-diff heuristic scoring (score compares finding signatures via hash)
4. NO mechanical gates replacing tool-based instructions (every phase returns explicit text)
5. NO Shark v4.9.9 cargo-cult patterns
6. NO fragmented helper files (logic stays in god-loop.ts + thin modules)

## SCORING

- Progressive score: hash-based finding signature comparison (pre vs post)
- Evidence gate: passRate >= 0.96 before LOCKED
- Cycle cap: 50 cycles max
- Stall detection: score unchanged for 3 cycles → PROBLEM_SOLVE
- Regression detection: finding "fixed" then came back → flag + count

## ENFORCER HOOK SPEC (~120 lines)

- Fires on `tool.execute.after` ONLY
- Reads state.json from disk
- Checks called tool matches expected phase tool
- Escalation: WARN → BLOCK → RESTART → LOCKOUT
- STATIC system prompt: "Poseidon Mode active. Call trident-poseidon to advance."
- NEVER dynamic content in system prompt (kills prompt cache)
