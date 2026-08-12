# Semantic Intelligence Requirements — No Generic Garbage

## The Problem
15+ builds reported that Poseidon's corrections are "generic garbage."
The PLAN phase produced: "Fix 7 findings in file.ts. Use the Edit tool."
The PROBLEM_SOLVE phase produced: "Score stalled. Try again."
These are USELESS to build agents. They need SPECIFIC, SOURCE-AWARE, SEMANTICALLY INTELLIGENT guidance.

## Root Cause
1. PLAN used generic WaveManifest strings instead of reading actual source code
2. PROBLEM_SOLVE used a classifier (problem class label) instead of a reasoner
3. Neither phase analyzed WHAT the findings actually mean

## Requirements for PLAN Phase (Semantically Intelligent)

The PLAN phase MUST:

### 1. Read Actual Source Code for Every Finding
```typescript
for (const finding of findings) {
  const sourceLines = this.readSourceContext(targetPath, finding.file, finding.line, 5);
  // Show actual code around the finding with >>> markers
}
```

### 2. Group Findings by ROOT CAUSE, Not Just by File
Don't just group "all findings in file.ts." Group by semantic pattern:
- "3 empty catch blocks in spider-hooks.ts" → one fix: add error handling pattern
- "5 any-type parameters in data-flow.ts" → one fix: add type annotations
- "2 unreachable code blocks in compiler-host.ts" → one fix: remove dead code

### 3. Generate Specific Fix Instructions
WRONG: "Fix 7 findings in file.ts. Use the Edit tool."
RIGHT: 
```
Finding 1: Empty catch block at spider-hooks.ts:693
  Source: >>>  } catch (e) { }  <<<
  Root cause: Error caught and silently discarded
  Fix: Replace with: catch(e) { tridentLog('ERROR', 'hooks', e.message); throw e; }

Finding 2: Catch block returns success at coordinator.ts:118
  Source: >>>  catch(e) { return { success: true }; }  <<<
  Root cause: Error handler claims success without performing work
  Fix: Replace with: catch(e) { return { success: false, error: e.message }; }
```

### 4. Include Before/After Code Snippets
Every finding instruction must include:
- BEFORE: the actual broken code (read from disk)
- AFTER: the suggested fix (generated from the finding's correction field)
- VERIFICATION: how to verify the fix (sha256, tsc, re-audit)

## Requirements for PROBLEM_SOLVE Phase (Semantically Intelligent)

The PROBLEM_SOLVE phase MUST:

### 1. Analyze Finding PATTERNS, Not Just Count
WRONG: "Score stalled at 45. 150 findings remaining."
RIGHT: "Score stalled at 45 for 3 cycles. Analysis of 150 remaining findings:
  - 80 are any-type parameters in cfg-builder.ts and dominator-tree.ts (R13)
  - 40 are unreachable code blocks (R14) — agents keep adding code after returns
  - 20 are theatrical code patterns (R11) — agents claim success without work
  - 10 are other issues
  
  Root cause: Build agents are adding type annotations but NOT removing dead code after returns.
  The R14 findings keep regenerating because agents add new returns without removing trailing code.
  
  Strategy: Next wave should focus EXCLUSIVELY on R14 (unreachable code).
  Instruct agents to delete all code after return/throw statements, not just add type annotations."

### 2. Use CycleTracker Regression Data
```typescript
const regressions = cycleTracker.getRegressions();
if (regressions.length > 0) {
  // "Finding at file:line was FIXED in cycle 3 but REAPPEARED in cycle 5.
  //  The build agent is undoing previous fixes. Investigate the agent's edit pattern."
}
```

### 3. Analyze Agent Performance History
```typescript
const agentResults = state.waveHistory;
// "Agent 3 (fix-r4) resolved 0 of 5 findings in 3 waves.
//  Agent 3 is either producing theatrical fixes or corrupting the file.
//  Strategy: Replace agent 3's instructions with more specific source context.
//  Or: Skip agent 3's file for one cycle and focus on other files."
```

### 4. Provide Actionable Strategy, Not Classification
WRONG: { problemClass: 'STALL_DETECTED', description: 'Score not improving' }
RIGHT:
```
Diagnosis: AGENT_THEATRICAL_PATTERN
  - Wave 3 Agent 2 claimed to fix r4-error-handling.ts but SHA256 unchanged
  - Wave 3 Agent 4 added type annotations but didn't remove dead code (R14 increased)
  - 15 of 25 agent claims failed WaveVerifier SHA256 check

Strategy:
  1. Next wave: reduce to 3 agents (remove theatrical agents)
  2. Add explicit source code context to each finding (>>> markers)
  3. Require agents to report sha256sum AFTER edit (not before)
  4. Focus on R14 (unreachable code) which is the highest-count unfixed category
```

## Requirements for Audit Findings in PLAN

Every AuditFinding passed to PLAN must have:
- `file:line` — exact location (already exists)
- `description` — what's wrong (already exists)
- `correction` — how to fix (may be empty — must be populated)
- `evidence` — actual code snippet (already exists)
- `category` — semantic type (already exists)

If `correction` is empty, the PLAN phase must GENERATE a correction from the evidence:
```typescript
if (!finding.correction || finding.correction.length < 10) {
  const suggestedFix = this.generateCorrectionFromEvidence(finding);
  finding.correction = suggestedFix;
}
```

This is what makes the difference between "generic garbage" and "semantically intelligent."
