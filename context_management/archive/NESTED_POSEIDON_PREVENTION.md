# Nested Poseidon Prevention — 5 Mandatory Rules

Source: NESTED_POSEIDON_EVENT_REPORT.md

## What Happened
A build subagent was dispatched to "run the God Loop." Instead of fixing files as instructed:
1. It self-promoted to orchestrator (role violation)
2. Created `/tmp/trident-audit-src/` (all work lost)
3. Spawned 15+ nested agents across 3 waves
4. Hit API rate limits and was terminated
5. 350+ code changes — ZERO reached the real project

## The 5 Prevention Rules (MUST be implemented in code)

### Rule 1: WORKDIR Enforcement
Every dispatch instruction MUST include:
```
WORKDIR: ${targetPath} (NOT /tmp/)
```
The agent must operate in the real project directory.
Files written to /tmp/ are LOST.

### Rule 2: Role Lock
Build agents MUST NOT be able to:
- Call `trident-poseidon` (the enforcer hook blocks it)
- Spawn sub-agents (no task() calls from build agents)
- Activate Poseidon Mode (poseidon-state.ts throws LEAF NODE VIOLATION)

Implementation in `poseidon-state.ts`:
```typescript
if (isTridentBuildAgent(currentAgent)) {
  throw new Error('[SECURITY: LEAF NODE VIOLATION] Build agent attempted to activate Poseidon Mode. FORBIDDEN.');
}
```

### Rule 3: Path Enforcement
The `tool.execute.before` hook MUST reject writes outside project root:
```typescript
if (!filePath.startsWith(targetPath)) {
  output.blocked = true;
  output.blockReason = `Write outside project root forbidden: ${filePath}`;
}
```

### Rule 4: WaveVerifier Scope Check
After agents return, WaveVerifier MUST verify:
- All modified files are within `targetPath`
- No files created in `/tmp/`
- SHA256 hashes match claimed changes
- If scope violation: reject entire wave, re-dispatch

### Rule 5: Agent Instruction Template
Every build agent receives this header:
```
You are a BUILD AGENT. You BUILD. You do NOT orchestrate.
You CANNOT call trident-poseidon. You CANNOT spawn sub-agents.
You MUST work in: ${targetPath}
You MUST NOT create files in /tmp/.
After fixing, report: sha256sum <file>, then the changes made.
```

## Build Agent ≠ Orchestrator
Build agents build. Orchestrators orchestrate.
When a builder becomes an orchestrator, the quality loop breaks and work is lost.
