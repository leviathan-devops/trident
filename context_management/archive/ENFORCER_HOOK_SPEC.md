# Poseidon Enforcer Hook — Full Implementation Spec

## Location
`src/hooks/poseidon-enforcer-hook.ts` (~120 lines)

## Purpose
Thin guardrail. Fires on `tool.execute.after` ONLY. Never `tool.execute.before`.
Checks if the called tool matches the expected phase tool. Escalates if wrong.

## Phase-to-Expected-Tool Mapping

| Phase | Expected Tool | Rationale |
|-------|---------------|-----------|
| INIT | trident-poseidon | Model calls poseidon to advance |
| AUDIT | trident-poseidon | Audit runs mechanically inside poseidon |
| SCORE | trident-poseidon | Score computed mechanically |
| DECIDE | trident-poseidon | Routing decision computed mechanically |
| PLAN | trident-poseidon | Wave manifest generated mechanically |
| DISPATCH | task | Model MUST spawn subagents (only model-action phase) |
| COLLECT | trident-poseidon | Results collected mechanically |
| VERIFY | trident-poseidon | Evidence gate checked mechanically |
| AUDIT_RECHECK | trident-poseidon | Re-audit runs mechanically |
| CONTAINER_TEST | trident-poseidon | Container test runs mechanically |
| PROBLEM_SOLVE | trident-poseidon | Diagnosis runs mechanically |

## System Prompt Injection (STATIC — ONE LINE)

```typescript
const STATIC_POSEIDON_PROMPT = 'Poseidon Mode active. Call trident-poseidon to advance. Do NOT stop until LOCKED or FAILED.';
```

This is injected ONCE via `experimental.chat.system.transform` at session start.
It NEVER changes. It NEVER contains dynamic phase data.
Dynamic phase data goes in the MESSAGES channel via trident-poseidon tool output.
VIOLATION OF THIS RULE = prompt cache destruction = v4.4.2 regression.

## Escalation Ladder

```
First derailment   → WARN
  "Off-track. Current phase is <PHASE>. Call <EXPECTED_TOOL>. (warn #1)"

Second derailment  → BLOCK  
  "Repeated off-track. You MUST call <EXPECTED_TOOL> now. (block #2)"

Third derailment   → RESTART
  Request orchestrator to reset to last CHECKPOINT phase.
  "Phase reset to <CHECKPOINT_PHASE>. Resume from there. (restart #3)"

Fourth+ derailment → LOCKOUT
  "LOCKOUT. Derailment threshold exceeded. Pausing."
  No further tool calls accepted until human issues resume command.
```

## Decay Rule
Every 5 consecutive successful (on-track) actions decrements derailment counter by 1, floor 0.

## Model-Independent
The hook keys off tool names (objective telemetry), not narrative content.
A genius model and a dumb model that both call the wrong tool both get the same escalation.

## Bash/Write Wall Control (POSEIDON FEATURE)

When Poseidon is ACTIVE: bash, write, edit tools are ENABLED for trident agent.
When Poseidon is OFF or revoked: walls go back up (read-only mode restored).

```typescript
// In poseidon-enforcer-hook.ts — tool.execute.after handler
if (poseidonActive && agentIsTrident) {
  // Enable write/bash for trident when poseidon active
  config.tool_permissions.bash = 'allow';
  config.tool_permissions.write = 'allow';
  config.tool_permissions.edit = 'allow';
}
// When poseidon OFF:
config.tool_permissions.bash = 'deny';
config.tool_permissions.write = 'deny';
config.tool_permissions.edit = 'deny';
```

The toggle is semantically intelligent — it checks the ACTUAL poseidon state.json,
not a flag. If state.json says phase=LOCKED or phase=FAILED or doesn't exist,
poseidon is OFF. If state.json says active phase (INIT through CONTAINER_TEST),
poseidon is ON and walls are down.
