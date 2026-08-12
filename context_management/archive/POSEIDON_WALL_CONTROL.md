# Poseidon Wall Control — Semantic Tool Toggle

## Feature
When Poseidon is ACTIVE: bash, write, edit, write_file are ENABLED for trident agent.
When Poseidon is OFF (LOCKED, FAILED, or not started): walls go back up (read-only mode restored).
Build agents NEVER get these tools — they are leaf nodes.

## Source Code (from v4.4.2_FAIL trident-hooks.ts lines 561-614)

```typescript
// In toolBeforeHook (trident-hooks.ts)

// v4.4.2 POSEIDON OVERRIDE: When Poseidon Mode is active, primary agent gets bash/write/edit
const POSEIDON_UNLOCKED = ['bash', 'write', 'edit', 'write_file'];
const poseidonActiveNow = poseidonState.isActive(sessionId || 'default');

// Evidence logging for unlock verification (grepped by container tests)
if (poseidonActiveNow && POSEIDON_UNLOCKED.includes(toolName)) {
  tridentLog('INFO', 'poseidon-unlock', 
    `POSEIDON_UNLOCK_ACTIVE: session=${sessionId} tool=${toolName} isBuildAgent=${isBuildAgent}`);
}

// Filter blocklist: when poseidon active AND NOT build agent, remove unlocked tools from blocklist
const effectiveBlocked = (poseidonActiveNow && !isBuildAgent)
  ? BLOCKED_TOOLS_FOR_TRIDENT.filter(t => !POSEIDON_UNLOCKED.includes(t))
  : BLOCKED_TOOLS_FOR_TRIDENT;

if (!isExploreTask && effectiveBlocked.includes(toolName)) {
  throw new Error('[TRIDENT TOOL BLOCK] ' + toolName + ' blocked');
}

// Allowlist bypass: same condition for the allowlist check
const poseidonAllowlisted = poseidonActiveNow && !isBuildAgent &&
  POSEIDON_UNLOCKED.includes(toolName);

if (poseidonAllowlisted) {
  tridentLog('INFO', 'poseidon-unlock',
    `POSEIDON_ALLOWLIST_BYPASS: tool=${toolName} session=${sessionId} — allowed via Poseidon override`);
}
```

## Semantic Intelligence (isActive check)

`poseidonState.isActive(sessionId)` checks the ACTUAL state.json, not a flag:

```typescript
isActive(sessionId: string): boolean {
  const state = this.readState(sessionId);
  if (!state) return false;
  // Active phases = the loop is running
  const activePhases = ['INIT', 'AUDIT', 'SCORE', 'DECIDE', 'PLAN', 
                        'DISPATCH', 'COLLECT', 'VERIFY', 'AUDIT_RECHECK',
                        'CONTAINER_TEST', 'PROBLEM_SOLVE'];
  return activePhases.includes(state.phase);
  // LOCKED and FAILED are NOT active → walls go back up
}
```

This is semantically intelligent: it reads the actual God Loop state from disk.
If state.json doesn't exist → poseidon is OFF → walls up.
If state.json says phase=LOCKED → poseidon completed → walls up.
If state.json says phase=DISPATCH → poseidon running → walls down.
No flag to forget. No manual toggle. The state IS the toggle.

## Build Agent Exclusion
The `!isBuildAgent` check ensures build agents NEVER get bash/write/edit through Poseidon.
Build agents are leaf nodes — they can only use read/edit/write for specific files,
not orchestration tools. The Poseidon unlock is for the ORCHESTRATOR (trident agent), not workers.
