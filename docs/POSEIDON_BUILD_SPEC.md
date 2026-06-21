# POSEIDON MODE — Trident v4.4 Build Specification

**Version:** 1.0
**Date:** 2026-06-19
**Classification:** BUILD SPEC — Full implementation plan
**Status:** DRAFT (ready for review)

---

## TABLE OF CONTENTS

1. [Executive Summary](#1-executive-summary)
2. [Architecture Overview](#2-architecture-overview)
3. [Semantic Activation System](#3-semantic-activation-system)
4. [The trident-poseidon Tool](#4-the-trident-poseidon-tool)
5. [God Orchestrator Loop](#5-god-orchestrator-loop)
6. [Trident_Build Subagent](#6-trident_build-subagent)
7. [Evidence Archival](#7-evidence-archival)
8. [Registration Changes](#8-registration-changes)
9. [Firewall Fix: Semantic Theatrical Detection](#9-firewall-fix-semantic-theatrical-detection)
10. [Adversarial Rules](#10-adversarial-rules)
11. [L3 Context Library](#11-l3-context-library)
12. [Implementation Order](#12-implementation-order)

---

## 1. EXECUTIVE SUMMARY

**What:** Add a locked 5th mode tool (`trident-poseidon`) to Trident v4.3.3 that functions as a God Orchestrator for build execution via a `Trident_Build` subagent.

**How:** Semantic activation system (not regex-only, not a single string) unlocks the tool based on natural language understanding. Once unlocked, Trident runs a God Loop quality enforcement cycle:

```
USER MESSAGE contains "poseidon" + activation intent
  → PoseidonDetector.analyze() returns { action: 'activate' }
  → poseidonState.activate(sessionId) — session-scoped
  → trident-poseidon tool is now callable

TRIDENT calls trident-poseidon tool
  → PHASE A: Trident runs 17-layer audit on target source
  → PHASE A: If score < 96%, generate remediation plan (exact file:line:fix)
  → PHASE B: Dispatch Trident_Build subagent — executes plan verbatim
  → PHASE C: Trident re-audits updated source, extracts new score
  → LOOP back to PHASE A until score ≥ 96%
  → PHASE D: Container testing as FINAL validation step
  → AUTO-DEACTIVATE: poseidonState.autoDeactivate()
  → Tool locked again — human must re-activate
```

**Key Principle:** Trident primary IS the God boss. NOT a container Trident. Trident has the 17-layer audit engine, semantic intelligence, and theatrical detection to quality-loop the Trident_Build subagent DIRECTLY. Container testing is the LAST STEP, only after code achieves 96%+ runtime grade.

**Baseline:** Trident v4.3.3-LIGHTWEIGHT (stable, deployed to GitHub main, SHA256: `0f02e60e8c5fc3aaa6d497c3b50108ac91cde043e8926bb7a447713e6d26a7ee`)

---

## 2. ARCHITECTURE OVERVIEW

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          POSEIDON MODE v4.4                                 │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                   REGISTRATION LAYER (8 files)                      │   │
│  │  trident-tools.ts | tool-allowlist.ts | guardian-hook.ts            │   │
│  │  orchestrator-machine-v2.ts | orchestrator.ts | trident-hooks.ts    │   │
│  │  identity/index.ts | agents/definitions.ts | index.ts               │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                         │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                   SEMANTIC ACTIVATION LAYER                          │   │
│  │                                                                     │   │
│  │  User Message                                                       │   │
│  │    → chatMessageHook (trident-hooks.ts)                             │   │
│  │      → PoseidonDetector.detect(text)     (NEW file)                 │   │
│  │        → regex first-pass: /poseidon/i                              │   │
│  │        → semantic second-pass: ON/OFF signal word scoring           │   │
│  │        → returns { detected, action, confidence }                   │   │
│  │      → poseidonState.activate/deactivate()  (NEW file)             │   │
│  │                                                                     │   │
│  │  Session State: Map<sessionId, PoseidonSession>                     │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                         │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                   GOD ORCHESTRATOR LOOP (NEW)                       │   │
│  │                                                                     │   │
│  │  trident-poseidon tool                                             │   │
│  │    → checks poseidonState.isActive()                                │   │
│  │    → GodLoopOrchestrator.runLoop(targetPath, maxCycles)            │   │
│  │      │                                                              │   │
│  │      ├─ PHASE A: AUDIT (Trident primary)                           │   │
│  │      │  trident-code-audit targetPath action=full                   │   │
│  │      │  → extract score + findings                                  │   │
│  │      │  → if score ≥ 96% → skip to PHASE D                         │   │
│  │      │  → generatePlan(findings, targetPath)                        │   │
│  │      │                                                              │   │
│  │      ├─ PHASE B: EXECUTE (Trident_Build subagent)                  │   │
│  │      │  dispatchToBuildAgent(plan, targetPath)                      │   │
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
│  │  → return final report                                              │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                         │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                   TRIDENT_BUILD SUBAGENT (NEW, 8+ files)            │   │
│  │                                                                     │   │
│  │  src/subagents/trident-build/                                       │   │
│  │  ├── index.ts                    Entry + hook factory               │   │
│  │  ├── identity/                                                     │   │
│  │  │   ├── agent-identity.ts       isTridentBuildAgent()              │   │
│  │  │   └── t1-prompt.ts            T1 system prompt                   │   │
│  │  ├── hooks/                                                        │   │
│  │  │   ├── index.ts                Hook factory                        │   │
│  │  │   ├── guardian-hook.ts        CODE-enforced enforcement          │   │
│  │  │   ├── gate-hook.ts            Evidence + tracking                │   │
│  │  │   └── system-transform.ts     Identity injection                  │   │
│  │  ├── harness/                                                       │   │
│  │  │   ├── semantic-engine.ts      AST analysis (from Manta v2.3)    │   │
│  │  │   ├── theatrical-block.ts     20+ patterns (from Manta v2.3)    │   │
│  │  │   ├── runtime-grade.ts        P1-P10 (from Manta v2.3)          │   │
│  │  │   ├── evidence-pipeline.ts    Merkle chain (from Manta v2.3)    │   │
│  │  │   └── enforcement-error.ts    EnforcementError class             │   │
│  │  ├── shared/                                                        │   │
│  │  │   ├── state-store.ts          Map<sessionId, State> (FIXED)     │   │
│  │  │   └── agent-state.ts          Session-scoped tracking (FIXED)   │   │
│  │  └── tools/                                                         │   │
│  │       └── build-status.ts        Status reporting                   │   │
│  │                                                                     │   │
│  │  Registered in Trident config as mode: 'subagent'                   │   │
│  │  Tools: read, write, edit, bash, glob, grep, task, checkpoint       │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.1 File System Layout

```
src/
├── index.ts                                     # Register Trident_Build subagent
├── tools/
│   ├── trident-tools.ts                         # Add trident-poseidon import + key
│   └── trident-poseidon.ts                      # NEW: Tool with God Loop
├── hooks/
│   └── trident-hooks.ts                         # Add poseidon detection in chatMessageHook
├── fsm/
│   └── orchestrator-machine-v2.ts                # Add POSEIDON mode
├── orchestrator.ts                              # Add startPoseidon()
├── identity/
│   ├── index.ts                                 # Update tool list in identity header
│   └── agent-identity.ts                        # Add trident_build recognition
├── agents/
│   └── definitions.ts                           # Update tool list
├── security/
│   └── tool-allowlist.ts                        # Add trident-poseidon
├── warheads/
│   └── nlp-pipeline/
│       ├── intent-router.ts                     # Add Poseidon verb frames
│       └── poseidon-detector.ts                 # NEW: Semantic detection layer
├── poseidon/
│   ├── poseidon-state.ts                        # NEW: Session-scoped state
│   ├── god-loop.ts                              # NEW: God Orchestrator loop
│   └── evidence.ts                              # NEW: Evidence archival
└── subagents/
    └── trident-build/                           # NEW: Full subagent harness
        ├── index.ts
        ├── identity/
        │   ├── agent-identity.ts
        │   └── t1-prompt.ts
        ├── hooks/
        │   ├── index.ts
        │   ├── guardian-hook.ts
        │   ├── gate-hook.ts
        │   └── system-transform.ts
        ├── harness/
        │   ├── semantic-engine.ts
        │   ├── theatrical-block.ts
        │   ├── runtime-grade.ts
        │   ├── evidence-pipeline.ts
        │   └── enforcement-error.ts
        ├── shared/
        │   ├── state-store.ts
        │   └── agent-state.ts
        └── tools/
            └── build-status.ts
```

---

## 3. SEMANTIC ACTIVATION SYSTEM

### 3.1 PoseidonDetector (`src/warheads/nlp-pipeline/poseidon-detector.ts`)

**NEW FILE.** Extends the existing NLP pipeline with semantic intelligence.

```typescript
// STRUCTURE:
class PoseidonDetector {
  // Phase 1: Regex first-pass
  detect(message: string): PoseidonResult {
    if (!/\bposeidon\b/i.test(message)) {
      return { detected: false, action: null, confidence: 0 };
    }
    
    // Phase 2: Semantic second-pass — signal word scoring
    const onScore = this.countSignals(message, this.ON_SIGNALS);
    const offScore = this.countSignals(message, this.OFF_SIGNALS);
    const negationScore = this.countNegations(message);
    
    // Phase 3: Intent determination
    if (onScore > offScore) {
      return { detected: true, action: 'activate', confidence: this.calcConfidence(onScore, offScore) };
    }
    if (offScore > onScore) {
      return { detected: true, action: 'deactivate', confidence: this.calcConfidence(offScore, onScore) };
    }
    // Equal scores or no signals — check for negation before "poseidon"
    if (negationScore > 0) {
      return { detected: true, action: 'deactivate', confidence: 0.6 };
    }
    // Default: "poseidon" mentioned with no clear signal → assume activate
    return { detected: true, action: 'activate', confidence: 0.5 };
  }
}

// SIGNAL WORD LISTS:
ON_SIGNALS = [
  'activate', 'enable', 'on', 'start', 'engage', 'unlock', 'begin',
  'initiate', 'power', 'wake', 'arm', 'ignite', 'launch', 'open',
  'unleash', 'awaken', 'summon', 'enter',
]

OFF_SIGNALS = [
  'disable', 'off', 'stop', 'revoke', 'revoked', 'deactivate',
  'disengage', 'lock', 'end', 'terminate', 'shut', 'close',
  'cancel', 'abort', 'halt', 'suspend', 'finish', 'complete',
  'exit', 'quit', 'sleep',
]

NEGATION_PATTERNS = [
  /\bdon'?t\s+(activate|enable|start|engage|unlock)/i,
  /\b(no|not|never)\s+(poseidon)/i,
  /\bstop\s+poseidon/i,
]
```

### 3.2 Integration Point

In `src/hooks/trident-hooks.ts`, the `chatMessageHook` function:

```typescript
// CURRENT (line 175-186):
if (isUserInput) {
  resetToolsCalled((input as InputMessage)?.sessionID);
  if (outputText) {
    orchestrator.detectAndSwitch(outputText, (input as InputMessage)?.sessionID);
  }
  if (outputText) {
    nlpPipeline.processMessage(outputText, sid);
  }
  return;
}

// NEW:
if (isUserInput) {
  resetToolsCalled((input as InputMessage)?.sessionID);

  // POSEIDON DETECTION — runs before orchestrator detectAndSwitch
  if (outputText && typeof outputText === 'string') {
    var poseidonResult = poseidonDetector.detect(outputText);
    if (poseidonResult.detected) {
      if (poseidonResult.action === 'activate') {
        poseidonState.activate(sid);
        tridentLog('INFO', 'poseidon', `Poseidon Mode ACTIVATED (confidence: ${poseidonResult.confidence})`);
      } else if (poseidonResult.action === 'deactivate') {
        poseidonState.deactivate(sid);
        tridentLog('INFO', 'poseidon', `Poseidon Mode DEACTIVATED (confidence: ${poseidonResult.confidence})`);
      }
    }
  }

  if (outputText) {
    orchestrator.detectAndSwitch(outputText, (input as InputMessage)?.sessionID);
  }
  if (outputText) {
    nlpPipeline.processMessage(outputText, sid);
  }
  return;
}
```

### 3.3 PoseidonState (`src/poseidon/poseidon-state.ts`)

**NEW FILE.** Session-scoped state management.

```typescript
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

class PoseidonState {
  private sessions: Map<string, PoseidonSession>;
  private static instance: PoseidonState;

  static getInstance(): PoseidonState;
  activate(sessionId: string): void;
  deactivate(sessionId: string): void;
  isActive(sessionId: string): boolean;
  incrementCycles(sessionId: string): void;
  setScore(sessionId: string, score: number): void;
  setTargetPath(sessionId: string, path: string): void;
  setAbortFlag(sessionId: string, value: boolean): void;
  getMetrics(sessionId: string): PoseidonSession | null;
  autoDeactivate(sessionId: string): void;
  clear(sessionId: string): void;
  cleanup(sessionId: string): void;  // Session end handler
}
```

**Key behaviors:**
- `autoDeactivate()` called in `trident-poseidon` tool's `finally` block
- On session end: state cleared via `session.ended` hook cleanup
- `isActive()` returns `false` for unknown sessions (safe default — tool stays locked)

---

## 4. THE trident-poseidon TOOL

### 4.1 Tool Definition (`src/tools/trident-poseidon.ts`)

**NEW FILE.** The 5th mode tool with God Loop orchestration.

```typescript
import { tool } from '@opencode-ai/plugin';
import { z } from 'zod';

export const tridentPoseidonTool = tool({
  description: 'POSEIDON MODE: God Orchestrator for quality-enforced build execution. ' +
    'Dispatches work to Trident_Build subagent, audits output, loops until 96%+ runtime grade. ' +
    'AUTO-LOCKS on completion. Requires user activation via "Poseidon Mode".',

  args: {
    targetPath: z.string().describe('Absolute path to the project root to build/audit'),
    action: z.enum(['start', 'status', 'abort'])
      .default('start')
      .describe('start=run God Loop, status=show current state, abort=cancel running loop'),
    maxCycles: z.number().min(1).max(200).default(50)
      .describe('Maximum loop iterations (safeguard against infinite loops)'),
  },

  execute: async (args, ctx) => {
    var sessionId = ctx?.sessionId || 'default';

    // LOCK CHECK: Poseidon Mode must be active
    if (!poseidonState.isActive(sessionId)) {
      return '## POSEIDON MODE: LOCKED\n\n' +
        'Poseidon Mode is not active. The user must explicitly activate it by ' +
        'saying something like "Poseidon Mode Activate" or "enable poseidon mode" ' +
        'in the chat. The agent cannot activate Poseidon Mode autonomously.';
    }

    try {
      if (args.action === 'status') {
        return this.handleStatus(sessionId);
      }

      if (args.action === 'abort') {
        poseidonState.setAbortFlag(sessionId, true);
        return '## POSEIDON MODE: ABORT SIGNAL SENT\n\nLoop will terminate after current cycle.';
      }

      // Start the God Loop
      if (orchestrator.getState(sessionId)?.mode === 'POSEIDON') {
        return 'Poseidon Mode is already running. Use action=status to check progress or action=abort to cancel.';
      }

      orchestrator.startPoseidon(sessionId);
      poseidonState.setTargetPath(sessionId, args.targetPath);

      var loopResult = await godLoopOrchestrator.runLoop(args.targetPath, args.maxCycles, sessionId);

      return this.formatResult(loopResult);

    } catch (err: unknown) {
      var errMsg = err instanceof Error ? err.message : String(err);
      tridentLog('ERROR', 'trident-poseidon', `[POSEIDON-ERR] ${errMsg}`);
      return JSON.stringify({ error: 'Poseidon Mode failed', message: errMsg }, null, 2);
    } finally {
      // AUTO-DEACTIVATE: tool locks itself after execution
      poseidonState.autoDeactivate(sessionId);
      if (orchestrator.getState(sessionId)?.mode === 'POSEIDON') {
        orchestratorMachineV2.startMode('IDLE');  // Reset orchestrator to IDLE
      }
    }
  },
});
```

### 4.2 Registration in `src/tools/trident-tools.ts`

```typescript
// Add import (around line 17):
import { tridentPoseidonTool } from './trident-poseidon.js';

// Add to return object (after trident-context-synthesis, before trident-gate):
'trident-poseidon': tridentPoseidonTool,
```

### 4.3 Tool Status Output Format

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
| AUDIT (phase 1) | 1 | Baseline: 12/100 — 24 findings |
| PLAN → EXECUTE → RE-AUDIT | 5 | Scores: 34→58→72→89→97 |
| CONTAINER TEST | 1 | Passed: 11/11 tests, 8/8 checks |

### Audit Archive
Location: `.trident/poseidon-audits/{sessionId}/`

### Auto-Deactivation
Poseidon Mode has been locked. The agent cannot re-activate it.
Say "Poseidon Mode Activate" when ready to build again.
```

---

## 5. GOD ORCHESTRATOR LOOP

### 5.1 GodLoopOrchestrator (`src/poseidon/god-loop.ts`)

**NEW FILE.** The core quality enforcement loop.

```typescript
class GodLoopOrchestrator {
  runLoop(targetPath: string, maxCycles: number, sessionId: string): Promise<LoopResult> {
    var cycle = 0;
    var score = 0;
    var containerPassed = false;

    while (cycle < maxCycles) {
      cycle++;
      poseidonState.incrementCycles(sessionId);

      // Check abort flag
      var metrics = poseidonState.getMetrics(sessionId);
      if (metrics?.abortFlag) {
        return { score, cycles: cycle, passed: false, reason: 'user_abort' };
      }

      // PHASE A: AUDIT (Trident primary, no container)
      var auditResult = this.runAudit(targetPath);
      score = this.extractScore(auditResult);
      poseidonState.setScore(sessionId, score);

      // Archive cycle
      this.archiveCycle(sessionId, cycle, auditResult, score);

      tiLog('POSEIDON', `Cycle ${cycle}: Score = ${score}/100`);

      // Exit loop if score ≥ 96% — proceed to container testing
      if (score >= 96) {
        break;
      }

      // Generate remediation plan
      var findings = this.extractFindings(auditResult);
      var plan = this.generatePlan(findings, targetPath);

      // PHASE B: EXECUTE (Trident_Build subagent)
      var buildResult = await this.dispatchToBuildAgent(plan, targetPath);
      this.archiveBuildResult(sessionId, cycle, buildResult);
    }

    // PHASE D: CONTAINER VALIDATION (LAST STEP, only if 96%+)
    if (score >= 96) {
      var containerResult = await this.runContainerTests(targetPath);
      containerPassed = containerResult.passed;

      if (!containerPassed) {
        // Container failed — feed failures back as additional findings
        // Add container findings to the audit output and continue
      }
    }

    return {
      score,
      cycles: cycle,
      highestScore: poseidonState.getMetrics(sessionId)?.highestScore || score,
      passed: score >= 96 && containerPassed,
      reason: containerPassed ? 'approved' : 'container_failed',
    };
  }
}
```

### 5.2 Remediation Plan Format

The plan sent to Trident_Build MUST follow this exact format:

```
## CYCLE {N} REMEDIATION PLAN
## Current Score: {score}/100
## Verdict: {NOT_RUNTIME_GRADE | APPROACHING | RUNTIME_GRADE}

### CRITICAL FINDINGS (fix ALL of these — do not skip):

1. FILE: {relative/path/to/file.ts} LINE: {line}
   ISSUE: {one-line description of what's wrong}
   FIX: {exact instruction — what to change, what to change it to}

2. FILE: {relative/path/to/file.ts} LINE: {line}
   ISSUE: ...  
   FIX: ...

### INSTRUCTIONS:
- Fix ALL findings listed above in ONE batch
- Do NOT skip any finding
- Do NOT add new features
- Do NOT refactor unrelated code
- Do NOT think — execute the plan verbatim
- After fixing, build the bundle with: <EXACT BUILD COMMAND>
- Report every changed file with its SHA256 hash
- Report build output (success/failure + any errors)

DO THE ABOVE AND NOTHING ELSE.
```

### 5.3 Dispatch to Trident_Build

```typescript
dispatchToBuildAgent(plan, targetPath) {
  return task({
    description: 'trident-build-cycle',
    prompt: `You are Trident_Build. Execute this remediation plan EXACTLY.
Do not think. Do not deviate. Do not skip. Do not add features.

TARGET: ${targetPath}

${plan}

After executing ALL fixes:
1. Run the build command specified in the plan
2. Report every file you changed with SHA256 hash
3. Report the build result (success/failure + full output)
4. If a fix cannot be applied, report WHY — do NOT skip silently`,
    subagent_type: 'trident_build',
  });
}
```

### 5.4 Audit Score Extraction

```typescript
extractScore(auditOutput: string): number {
  var patterns = [
    /Score:\s*(\d+)\s*\/\s*100/i,
    /(\d+)\s*\/\s*100/i,
    /(\d+)\s*%/,
    /pass.?rate[:\s]*(\d+(?:\.\d+)?)/i,
  ];
  for (var pattern of patterns) {
    var match = auditOutput.match(pattern);
    if (match) return parseInt(match[1], 10);
  }
  return 0;
}
```

### 5.5 Container Test Integration

```typescript
async runContainerTests(targetPath: string): Promise<ContainerResult> {
  // 1. Spawn Docker container with built plugin
  var containerName = `poseidon-${Date.now()}`;
  // docker run -d --name {containerName} opencode-test:1.14.34

  // 2. Create snapshot with bundle + config
  // mkdir /tmp/{containerName}-snap/plugins/trident-build/dist/
  // cp dist/index.js to bind mount

  // 3. Run mechanical test suite (11 tests)
  // manta-test-runner equivalent

  // 4. Run runtime audit (8 checks)
  // manta-runtime-audit equivalent

  // 5. Cleanup
  // docker rm -f {containerName}

  return {
    passed: tests.passed && audit.passed,
    passRate: tests.passRate,
    testResults: tests.results,
    auditResults: audit.checks,
    evidencePath: `.trident/poseidon-audits/container-${Date.now()}`,
  };
}
```

---

## 6. TRIDENT_BUILD SUBAGENT

### 6.1 Architecture

Based on v4.7-hotfix-v2-fixed (~2,400 lines, 19 files), overhauled with Manta v2.3 enforcement patterns. All 3 bugs from v4.7 baseline are fixed (see Section 6.3).

### 6.2 File Structure

```
src/subagents/trident-build/
├── index.ts                    # Entry point
│   export default function(options: TridentBuildOptions): TridentBuildInstance
│   Returns: hooks, tools, identity
│
├── identity/
│   ├── agent-identity.ts
│   │   isTridentBuildAgent(agent): boolean
│   │   TRIDENT_BUILD_NAMES = new Set(['trident_build', 'trident-build'])
│   │
│   └── t1-prompt.ts
│       const TRIDENT_BUILD_T1 = `You are Trident_Build — a runtime-grade ...`
│
├── hooks/
│   ├── index.ts
│   │   createTridentBuildHooks(deps): TridentBuildHooks
│   │   Returns: { event, chat.message, tool.execute.before, tool.execute.after,
│   │              system.transform, compacting }
│   │
│   ├── guardian-hook.ts
│   │   CREATED: tool.execute.before — CODE-enforced enforcement
│   │   FLOW:
│   │     1. if (!isTridentBuildAgent(getCurrentAgent(sid))) return;
│   │     2. Tool type check: only fire on write/edit/patch/bash
│   │     3. SemanticEngine.analyze(filePath, content) → findings
│   │     4. TheatricalBlock.scan(content) → patterns
│   │     5. RuntimeGradeEngineer.check(tool, args) → violations
│   │     6. ANY critical finding → throw EnforcementError
│   │
│   ├── gate-hook.ts
│   │   tool.execute.after — Evidence + tracking
│   │   - Records every tool execution as evidence
│   │   - Calculates per-iteration quality metrics
│   │   - Reports back to Poseidon orchestrator
│   │
│   └── system-transform.ts
│       experimental.chat.system.transform — Identity injection
│       - Injects Trident_Build identity binding
│       - Injects current remediation plan (if active)
│       - Removes non-Trident-Build agent patterns
│
├── harness/
│   ├── semantic-engine.ts           (from Manta v2.3, adapted)
│   │   TypeScript AST analysis — 5 checks:
│   │   1. Theatrical return detection (multi-condition conjunction)
│   │   2. Hardcoded path detection
│   │   3. Empty catch detection
│   │   4. Mock-in-production detection
│   │   5. Dead code detection
│   │   MULTI-CONDITION CONJUNCTION: ALL conditions must be true before flagging
│   │
│   ├── theatrical-block.ts          (from Manta v2.3, adapted)
│   │   20+ regex patterns across 3 severity levels:
│   │   CRITICAL (10): return {blocked:false}, empty catch, "I saw it work",
│   │                  return true;//TODO, mock/stub, process.exit(0)
│   │   HIGH (6): TODO/FIXME, console.log, debugger, empty function, dead code
│   │   MEDIUM (4): any as, var, @ts-ignore, eval
│   │   IMPROVEMENT: Only fires on write/edit tools (not mode/planning tools)
│   │
│   ├── runtime-grade.ts             (from Manta v2.3, adapted)
│   │   P1-P10 + E10 + L5.x enforcement:
│   │   P1: ESM/CJS import mismatch
│   │   P2: >5 unsafe `as` casts
│   │   P3: Empty catch blocks
│   │   P4: setInterval without clearInterval
│   │   P5: Hardcoded paths (CRITICAL — blocks before disk)
│   │   P6: npm/bun/yarn install without lock file
│   │   P7: Path traversal
│   │   P8: Invalid JSON config
│   │   P9: Top-level await in non-async context
│   │   P10: Implicit any return type
│   │   E10: Evidence claims without proof
│   │   L5.x: Anti-derailment (success claims, mocks, scope creep, etc.)
│   │
│   ├── evidence-pipeline.ts         (from Manta v2.3, adapted)
│   │   Merkle chain on every tool execution:
│   │   interface MerkleNode {
│   │     hash: string;           // SHA-256 of node contents
│   │     previousHash: string | null;
│   │     timestamp: number;
│   │     tool: string;
│   │     passed: boolean;
│   │     dataHash: string;       // SHA-256 of tool result
│   │   }
│   │
│   └── enforcement-error.ts
│       class EnforcementError extends Error {
│         code: string;
│         severity: 'critical' | 'high' | 'medium';
│       }
│
├── shared/
│   ├── state-store.ts               (FIXED from v4.7 — Map<sessionId, State>)
│   └── agent-state.ts               (FIXED from v4.7 — session-scoped Map)
│
└── tools/
    └── build-status.ts
        Shows: current cycle, files fixed this iteration, enforcement stats,
        evidence chain status, quality metrics
```

### 6.3 Fixes Applied to v4.7 Baseline

| Bug | Original | Fix |
|-----|----------|-----|
| **BUG A** | `system-transform-hook.ts` wrong import path | Correct relative path |
| **BUG B** | `state-store.ts` duplicate key | Remove duplicate `'shark-context'` entry |
| **BUG C** | `shark-status.ts` dead code branch (`if variant === 'micro'`) | Remove unreachable branch |
| **Bug D** | Test runner hardcoded `/home/leviathan/...` paths | Use `process.cwd()` + relative paths |
| **Bug E** | Regex-based gate advancement (fragile) | Evidence-based verification |
| **Bug F** | Single-session module variables | `Map<sessionId, State>` pattern |
| **Bug G** | No compaction survival (no-op hook) | Cache invalidation + state export |
| **Bug H** | No semantic intelligence | Add SemanticEngine + TheatricalBlock |
| **Bug I** | No anti-derailment (L5) | Add from Trident v4.3.3 |
| **Bug J** | No contextual firewall | Add phase-aware tool blocking |

### 6.4 Registration in Trident Config

In `src/index.ts`:

```typescript
config: async (opencodeConfig) => {
  if (!opencodeConfig.agent) opencodeConfig.agent = {};

  // Existing Trident agent...
  opencodeConfig.agent['trident'] = {
    // ...existing config...
    tools: {
      // ...existing tools + 'trident-poseidon': true
    },
  };

  // NEW: Trident_Build subagent
  opencodeConfig.agent['trident_build'] = {
    name: 'trident_build',
    description: 'Trident Build — Runtime-grade build engineer. Executes remediation plans verbatim. DO NOT THINK. DO NOT DEVIATE.',
    instructions: TRIDENT_BUILD_T1,
    mode: 'subagent',
    color: '#0066CC',
    permission: { task: 'allow' },
    tools: {
      'read': true, 'write': true, 'edit': true, 'bash': true,
      'glob': true, 'grep': true, 'task': true, 'checkpoint': true,
      'build-status': true,
    },
  };
}
```

---

## 7. EVIDENCE ARCHIVAL

### 7.1 Evidence Archiver (`src/poseidon/evidence.ts`)

**NEW FILE.** Manages the evidence chain across God Loop cycles.

```typescript
class PoseidonEvidence {
  private basePath: string;

  constructor(basePath?: string) {
    this.basePath = basePath || '.trident/poseidon-audits';
  }

  // Archive a single cycle
  async archiveCycle(sessionId: string, cycle: number, auditOutput: string, score: number): Promise<string> {
    var dir = `${this.basePath}/${sessionId}/cycle_${cycle}`;
    await fs.mkdir(dir, { recursive: true });

    await fs.writeFile(`${dir}/AUDIT_RAW.md`, auditOutput);
    await fs.writeFile(`${dir}/SCORE.txt`, String(score));
    // ...archive all artifacts
  }

  // Archive the build result
  async archiveBuildResult(sessionId: string, cycle: number, buildResult: BuildResult): Promise<string> {
    // Writes PLAN.md, BUILD_RESULT.md, CHANGED_FILES.json, BUILD_SHA256.txt
  }

  // Archive final container test
  async archiveContainerTest(sessionId: string, containerResult: ContainerResult): Promise<string> {
    // Writes CONTAINER_RESULT.json with full test + audit output
  }

  // Generate final loop summary
  async generateSummary(sessionId: string): Promise<string> {
    // Reads all cycles, computes statistics, writes LOOP_SUMMARY.md + FINAL_SCORE.txt
  }
}
```

### 7.2 Directory Structure

```
.trident/poseidon-audits/
├── {sessionId}/
│   ├── cycle_1/
│   │   ├── AUDIT_RAW.md              — Full 17-layer audit output
│   │   ├── SCORE.txt                 — Extracted score (single number)
│   │   ├── PLAN.md                   — Remediation plan sent to Trident_Build
│   │   ├── BUILD_RESULT.md           — What Trident_Build returned
│   │   ├── CHANGED_FILES.json        — File paths + SHA256 hashes
│   │   └── SELF_SCORE.txt            — Honest self-assessment
│   ├── cycle_2/
│   │   └── ...
│   ├── ...
│   ├── FINAL_SCORE.txt               — Final score when loop exits
│   ├── CONTAINER_RESULT.json         — Final container test results
│   └── LOOP_SUMMARY.md               — Human-readable summary of all cycles
```

### 7.3 Compaction Survival Files

When compaction fires during a God Loop, the hook reads these files to self-continue:

| File | Purpose |
|------|---------|
| `.trident/poseidon-audits/{sessionId}/LOOP_STATE.md` | Current cycle, current score, target path, highest score |
| `.trident/poseidon-audits/{sessionId}/NEXT_STEPS.md` | What needs to happen next (which phase, which cycle) |
| `.trident/poseidon-audits/{sessionId}/SESSION_ANCHOR.md` | Session ID, container name, opencode PID |

---

## 8. REGISTRATION CHANGES

### 8.1 Complete File Checklist

| # | File | Change | Type |
|---|------|--------|------|
| 1 | `src/tools/trident-tools.ts` | Import + add `'trident-poseidon': tridentPoseidonTool` | EDIT |
| 2 | **NEW** `src/tools/trident-poseidon.ts` | Tool definition with God Loop orchestration | CREATE |
| 3 | `src/security/tool-allowlist.ts` | Add `'trident-poseidon'` to `ALLOWED_TOOLS` | EDIT |
| 4 | `src/hooks/guardian-hook.ts` | Add `'trident-poseidon'` to `TRIDENT_TOOLS` set | EDIT |
| 5 | `src/fsm/orchestrator-machine-v2.ts` | Add `'POSEIDON'` to `TridentMode` + `MODE_LAYER_MAP: { POSEIDON: 5 }` | EDIT |
| 6 | `src/orchestrator.ts` | Add `startPoseidon(sessionId)` + `stopPoseidon(sessionId)` | EDIT |
| 7 | `src/hooks/trident-hooks.ts` | Add poseidon detection in `chatMessageHook` + update TOOLS string in `system.transform` | EDIT |
| 8 | `src/identity/index.ts` | Update identity header: "9 TOOLS (5 MODE + 4 SUPPORT)" | EDIT |
| 9 | `src/identity/agent-identity.ts` | Add `trident_build` and `trident-build` to `isTridentAgent()` | EDIT |
| 10 | `src/agents/definitions.ts` | Update agent instructions tool list | EDIT |
| 11 | **NEW** `src/warheads/nlp-pipeline/poseidon-detector.ts` | Semantic detection layer | CREATE |
| 12 | **NEW** `src/poseidon/poseidon-state.ts` | Session-scoped state | CREATE |
| 13 | **NEW** `src/poseidon/god-loop.ts` | God Loop orchestrator | CREATE |
| 14 | **NEW** `src/poseidon/evidence.ts` | Evidence archival | CREATE |
| 15 | **NEW** `src/subagents/trident-build/` | Full subagent harness (8+ files) | CREATE |
| 16 | `src/index.ts` | Register `trident_build` agent in config callback + import TridentBuildHarness | EDIT |
| 17 | `src/warheads/nlp-pipeline/intent-router.ts` | Add Poseidon verb frames (optional enhancement) | EDIT |

### 8.2 Detailed Change Specifications

#### File 1: `src/tools/trident-tools.ts`

```typescript
// ADD IMPORT (around line 17, with other imports):
import { tridentPoseidonTool } from './trident-poseidon.js';

// ADD TO RETURN OBJECT (after 'trident-context-synthesis', before 'trident-gate'):
'trident-poseidon': tridentPoseidonTool,
```

#### File 2: `src/tools/trident-poseidon.ts` — CREATE

Full tool definition as specified in [Section 4.1](#41-tool-definition-srctoolstrident-poseidonts).

#### File 3: `src/security/tool-allowlist.ts`

```typescript
// ADD to ALLOWED_TOOLS set:
'trident-poseidon',
```

#### File 4: `src/hooks/guardian-hook.ts`

```typescript
// ADD to TRIDENT_TOOLS set:
'trident-poseidon',
```

#### File 5: `src/fsm/orchestrator-machine-v2.ts`

```typescript
// ADD to TridentMode type (line 10-15):
| 'POSEIDON'

// ADD to MODE_LAYER_MAP (line 37-43):
POSEIDON: 5,
```

#### File 6: `src/orchestrator.ts`

```typescript
// ADD after startContextSynthesis() (after line 103):

startPoseidon(sessionId?: string): void {
  orchestratorMachineV2.startMode('POSEIDON');
  var state = this.getStateFor(sessionId || 'default');
  state.mode = 'POSEIDON';
  state.currentLayer = 1;
  state.status = 'RUNNING';
}

stopPoseidon(sessionId?: string): void {
  var state = this.getStateFor(sessionId || 'default');
  state.mode = 'IDLE';
  state.status = orchestratorMachineV2.startMode('IDLE');
}
```

#### File 7: `src/hooks/trident-hooks.ts`

**A) In `chatMessageHook`, the `isUserInput` branch (line 175-186):**

```typescript
if (isUserInput) {
  resetToolsCalled((input as InputMessage)?.sessionID);

  // ADD: Poseidon detection
  if (outputText && typeof outputText === 'string') {
    var poseidonResult = poseidonDetector.detect(outputText);
    if (poseidonResult.detected) {
      if (poseidonResult.action === 'activate') {
        poseidonState.activate(sid);
        tridentLog('INFO', 'poseidon', `Poseidon Mode ACTIVATED (confidence: ${poseidonResult.confidence})`);
      } else if (poseidonResult.action === 'deactivate') {
        poseidonState.deactivate(sid);
        tridentLog('INFO', 'poseidon', `Poseidon Mode DEACTIVATED (confidence: ${poseidonResult.confidence})`);
      }
    }
  }

  if (outputText) {
    orchestrator.detectAndSwitch(outputText, (input as InputMessage)?.sessionID);
  }
  if (outputText) {
    nlpPipeline.processMessage(outputText, sid);
  }
  return;
}
```

**B) In `systemTransformHook`, update TOOLS line (around line 506):**

```typescript
// CURRENT:
'[TRIDENT v4.3.3] TOOLS: trident-code-audit (17-layer), trident-deep-planning, trident-problem-solving, trident-context-synthesis, trident-gate, trident-status, trident-vision, trident-help.',

// NEW:
'[TRIDENT v4.4] TOOLS: trident-code-audit (17-layer), trident-deep-planning, trident-problem-solving, trident-context-synthesis, trident-poseidon, trident-gate, trident-status, trident-vision, trident-help.',
```

**C) In `toolBeforeHook`, update audit mode mapping (around line 393-397):**

```typescript
// ADD to the existing mode mapping chain:
else if (toolName.indexOf('poseidon') !== -1) auditMode = 'POSEIDON';
```

**D) Initialize PoseidonDetector + PoseidonState in createTridentHooks():**

```typescript
// ADD at the top of createTridentHooks():
var poseidonDetector = new PoseidonDetector();
var poseidonState = PoseidonState.getInstance();
var godLoopOrchestrator = new GodLoopOrchestrator(/* deps */);
```

#### File 8: `src/identity/index.ts`

```typescript
// UPDATE the tools section (around line 112-121):
'## YOUR 9 TOOLS (5 MODE + 4 SUPPORT)',
'1. trident-code-audit → 17-layer audit (R0-R17) → writes CODE_REVIEW .md',
'2. trident-deep-planning → 3 layers (L1 first-principles, L2 workflow, L3 context-lib)',
'3. trident-problem-solving → 6 layers (assumption→action→observe→gap→meta→verify)',
'4. trident-context-synthesis → 4 layers (collect→score→compress→inject)',
'5. trident-poseidon → God Orchestrator for quality-enforced build execution. LOCKED — requires user activation.',
'6. trident-gate → Evaluate specific audit layers or get gate criteria',
'7. trident-status → Current Trident state',
'8. trident-vision → Analyze images via VLM',
'9. trident-help → Reference for all commands and usage',
```

#### File 9: `src/identity/agent-identity.ts`

```typescript
// ADD to isTridentAgent() + isTridentBuildAgent():

export function isTridentBuildAgent(agentName: string | undefined): boolean {
  if (!agentName) return false;
  var lower = agentName.toLowerCase();
  return lower === 'trident_build' || lower === 'trident-build';
}
```

#### File 10: `src/agents/definitions.ts`

```typescript
// UPDATE the tools section:
'## YOUR 9 TOOLS (5 MODE TOOLS + 4 SUPPORT TOOLS)',
'',
'MODE TOOLS — each produces a .md artifact on disk:',
'1. trident-code-audit: ...',
'2. trident-deep-planning: ...',
'3. trident-problem-solving: ...',
'4. trident-context-synthesis: ...',
'5. trident-poseidon: God Orchestrator for build execution. LOCKED by default — requires user activation.',
'',
'SUPPORT TOOLS:',
'6. trident-gate: ...',
'7. trident-status: ...',
'8. trident-vision: ...',
'9. trident-help: ...',
```

#### File 11: `src/warheads/nlp-pipeline/poseidon-detector.ts` — CREATE

Full implementation as specified in [Section 3.1](#31-poseidon-detector).

#### File 12: `src/poseidon/poseidon-state.ts` — CREATE

Full implementation as specified in [Section 3.3](#33-poseidon-state).

#### File 13: `src/poseidon/god-loop.ts` — CREATE

Full implementation as specified in [Section 5.1](#51-god-loop-orchestrator).

#### File 14: `src/poseidon/evidence.ts` — CREATE

Full implementation as specified in [Section 7.1](#71-evidence-archiver).

#### File 15: `src/subagents/trident-build/` — CREATE

Full subagent harness as specified in [Section 6](#6-trident_build-subagent).

#### File 16: `src/index.ts`

```typescript
// ADD import at top:
import { TRIDENT_BUILD_T1 } from './subagents/trident-build/identity/t1-prompt.js';

// In config callback, ADD after existing agent registration:
opencodeConfig.agent['trident_build'] = {
  name: 'trident_build',
  description: 'Trident Build — Runtime-grade build engineer',
  instructions: TRIDENT_BUILD_T1,
  mode: 'subagent',
  color: '#0066CC',
  permission: { task: 'allow' },
  tools: {
    'read': true, 'write': true, 'edit': true, 'bash': true,
    'glob': true, 'grep': true, 'task': true, 'checkpoint': true,
    'build-status': true,
  },
};
```

#### File 17: `src/warheads/nlp-pipeline/intent-router.ts`

```typescript
// ADD to verbFrames array:
{ pattern: /\bposeidon\b/i, intent: 'poseidon', mode: 'POSEIDON' },
```

---

## 9. FIREWALL FIX: SEMANTIC THEATRICAL DETECTION

### 9.1 The Bug

`checkTheatricalPatterns()` at `src/hooks/trident-hooks.ts:116-131` applies regex keyword matching to ALL tool calls indiscriminately. It doesn't filter by tool type, context, or intent.

```typescript
// CURRENT BUGGY CODE (line 116-131):
async function checkTheatricalPatterns(toolName: string, input: Record<string, unknown>) {
  var allArgsString = ...  // concatenates ALL tool arguments
  var lower = allArgsString.toLowerCase();
  if (/\bmock\b/.test(lower) || /\bstub\b/.test(lower)) {
    // BLOCKS if the word "mock" or "stub" appears ANYWHERE in ANY tool's arguments
    return { blocked: true, category: 'MOCK_STUB_SUGGESTION', ... };
  }
  if (/\bhost\s+(testing|test|run|execute)\b/... || /on\s+(the\s+)?host/...) {
    // BLOCKS if "host testing" or "on host" appears in arguments
    return { blocked: true, category: 'HOST_FALLBACK', ... };
  }
}
```

**Impact:** Mode tools like `trident-deep-planning`, `trident-problem-solving`, `trident-context-synthesis` take text arguments that legitimately contain these words in descriptive contexts. The firewall blocks Trident's own tools.

### 9.2 The Fix

**Three changes:**

**A) Gate the check by tool type:**
Only apply to `write`, `edit`, `patch`, `bash` tools — tools that actually modify code. Skip mode tools.

**B) Use multi-condition conjunction (Manta v2.3 pattern):**
For write/edit tools, additionally verify:
- Is the content production code? (not test files, configs, or markdown)
- Is the word in a function body that returns a hardcoded value? (not in a comment or string)
- Is there no actual work being done?

**C) For mode tools: skip entirely.**

```typescript
// FIXED CODE:
async function checkTheatricalPatterns(toolName: string, input: Record<string, unknown>) {
  // ONLY apply to write/edit/patch/bash tools — NOT mode tools
  var writeTools = ['write', 'edit', 'patch', 'bash'];
  if (!writeTools.includes(toolName)) {
    return { blocked: false };
  }

  var argValues = Object.values((input?.args as Record<string, unknown>) || {});
  var allArgsString = argValues.map(function(v) {
    return typeof v === 'string' ? v : JSON.stringify(v);
  }).join(' ');
  if (!allArgsString) return { blocked: false };

  var lower = allArgsString.toLowerCase();

  // MULTI-CONDITION CONJUNCTION: check file extension first
  var filePath = (input?.args as Record<string, string>)?.path || '';
  var filePathArg = (input?.args as Record<string, string>)?.filePath || '';
  var targetFile = filePath || filePathArg;

  // Skip if writing to test files, config files, or .md files
  if (targetFile && (
    /\.(test\.|spec\.|config\.|mock\.)/i.test(targetFile) ||
    targetFile.endsWith('.md') ||
    targetFile.includes('__tests__')
  )) {
    return { blocked: false };
  }

  // CRITICAL: is the word "mock" or "stub" in a function body, or in a comment/string?
  if (/\bmock\b/.test(lower) || /\bstub\b/.test(lower)) {
    // Additional safety: check if it's production .ts/.js code
    if (targetFile && /\.(ts|js|tsx|jsx)$/i.test(targetFile)) {
      return { blocked: true, category: 'MOCK_STUB_SUGGESTION', ... };
    }
    // For other file types (markdown, config): allow — likely descriptive context
    return { blocked: false };
  }
  // ...
}
```

### 9.3 Additional Check Functions to Fix

The same blind-regex problem exists in:

| Function | Lines | Issue | Fix |
|----------|-------|-------|-----|
| `checkTheatricalPatterns()` | 121-129 | Blind `/mock\|stub/`, `/host testing/`, `/model switch/` on all tools | Gate by tool type + multi-condition |
| `checkTheatricalMerkle()` | 133-148 | `/the (audit\|analysis\|review) (found\|finds\|shows\|reveals)/i` on all tools | Only apply to `bash`/`execute` tools |

---

## 10. ADVERSARIAL RULES

These rules are NON-NEGOTIABLE and must be enforced at CODE level (not prompt level):

### Rule 1: Trident is the BOSS
Trident_Build does NOT think. It does NOT decide. It executes exactly what Trident's remediation plan commands. No deviation. No "I think this is unnecessary." If the plan says fix line 42, fix line 42. This is enforced by the guardian hook throwing `EnforcementError` if the build agent tries to do anything outside the plan.

### Rule 2: NEVER Give Options
Remediation plans must end with "DO X AND NOTHING ELSE." No "Option A or Option B." The audit engine decides — the build agent executes.

### Rule 3: NEVER Accept Theatrical Code
Enforced at CODE level by SemanticEngine + TheatricalBlock. Every function must DO what it claims. Theatrical patterns (hardcoded `{blocked:false}`, empty catches, stub functions) are blocked BEFORE they reach disk.

### Rule 4: NEVER Stop Until 96%+
The loop does NOT terminate early. Even if it takes 6 hours, 20+ loops, or 50 cycles. The ONLY exit conditions are:
- Score ≥ 96% + container tests pass → BUILD APPROVED
- User sends "Poseidon Revoked" → graceful abort

### Rule 5: ALL Fixes Batched
Fix EVERY finding in the plan in ONE cycle. Not one-at-a-time. Not "I'll fix the easy ones first." ALL of them. The God Loop is designed for mass remediation, not incremental fixes.

### Rule 6: On Compaction, Self-Continue
When a compaction event fires mid-loop, the build agent MUST:
1. Read `.trident/poseidon-audits/{sessionId}/LOOP_STATE.md` — current cycle + score
2. Read `NEXT_STEPS.md` — what phase to resume
3. Resume the loop WITHOUT prompting the user

### Rule 7: Evidence is Mandatory
Every cycle produces evidence. No evidence = the cycle didn't happen. Evidence is machine-generated (never hand-written by the agent) and SHA256-hashed.

---

## 11. L3 CONTEXT LIBRARY

The following reference files should be created in `context-library/` for the build agent:

| # | File | Content | Source |
|---|------|---------|--------|
| 1 | `POSEIDON_ARCHITECTURE.md` | Full architecture diagram, file list, design decisions | This document |
| 2 | `THE_GOD_LOOP.md` | Loop rules, interrogation protocol, exit conditions, anti-cheat | `KNOWLEDGE_LIBRARY/THE_GOD_LOOP.md` |
| 3 | `MANTA_HARNESS_PATTERN.md` | SemanticEngine, TheatricalBlock, RuntimeGradeEngineer, EvidencePipeline patterns | Manta v2.3 source |
| 4 | `V4.7_BASELINE_ANALYSIS.md` | Complete v4.7-hotfix-v2-fixed architecture + 10 bugs to fix | Research |
| 5 | `TRIDENT_TOOL_REGISTRATION.md` | 17-step registration checklist with exact line numbers | Trident v4.3.3 source |
| 6 | `POSEIDON_DETECTOR_SPEC.md` | Semantic detection algorithm with ON/OFF signal words | This document |
| 7 | `TRIDENT_BUILD_T1.md` | T1 system prompt for build subagent | This document |
| 8 | `GOD_LOOP_REMEDIATION_FORMAT.md` | Exact format for remediation plans | This document |
| 9 | `EVIDENCE_CHAIN_SPEC.md` | Archival structure + SHA256 requirements + compaction survival | This document |
| 10 | `FIREWALL_FIX_SPEC.md` | Semantic theatrical detection — multi-condition conjunction fix | This document |

---

## 12. IMPLEMENTATION ORDER

The implementation is organized into 5 phases. Each phase is independently testable.

### Phase 1: Registration & Locking (Files 1-10)

**Goal:** Register all 17 files, wire the tool, verify the lock mechanism works.

1. Create `src/poseidon/poseidon-state.ts` — state management
2. Create `src/warheads/nlp-pipeline/poseidon-detector.ts` — semantic detection
3. Create `src/tools/trident-poseidon.ts` — tool stub (just lock check + status)
4. Edit `src/tools/trident-tools.ts` — import + register tool
5. Edit `src/security/tool-allowlist.ts` — add to ALLOWED_TOOLS
6. Edit `src/hooks/guardian-hook.ts` — add to TRIDENT_TOOLS
7. Edit `src/fsm/orchestrator-machine-v2.ts` — add POSEIDON mode
8. Edit `src/orchestrator.ts` — add startPoseidon/stopPoseidon
9. Edit `src/hooks/trident-hooks.ts` — poseidon detection in chatMessageHook
10. Edit `src/identity/index.ts` + `src/agents/definitions.ts` — update tool lists
11. Edit `src/identity/agent-identity.ts` — add trident_build recognition
12. Edit `src/warheads/nlp-pipeline/intent-router.ts` — add verb frame
13. **BUILD + TEST**: Verify tool is registered. Verify lock blocks without activation. Verify semantic activation unlocks it.

### Phase 2: God Loop Core (File 13)

**Goal:** Implement the audit → plan → execute → re-audit loop.

14. Create `src/poseidon/god-loop.ts` — PHASE A (audit), PHASE B (dispatch to task)
15. Edit `src/tools/trident-poseidon.ts` — wire GodLoopOrchestrator.runLoop()
16. Create `src/poseidon/evidence.ts` — cycle archival
17. **BUILD + TEST**: Verify loop runs end-to-end. Verify score extraction. Verify loop stops at 96%+.

### Phase 3: Trident_Build Subagent (File 15)

**Goal:** Create the build engineer subagent with all enforcement.

18. Create `src/subagents/trident-build/identity/agent-identity.ts`
19. Create `src/subagents/trident-build/identity/t1-prompt.ts`
20. Create `src/subagents/trident-build/harness/enforcement-error.ts`
21. Create `src/subagents/trident-build/harness/semantic-engine.ts` — AST analysis
22. Create `src/subagents/trident-build/harness/theatrical-block.ts` — 20+ patterns
23. Create `src/subagents/trident-build/harness/runtime-grade.ts` — P1-P10
24. Create `src/subagents/trident-build/harness/evidence-pipeline.ts` — Merkle chain
25. Create `src/subagents/trident-build/hooks/guardian-hook.ts`
26. Create `src/subagents/trident-build/hooks/gate-hook.ts`
27. Create `src/subagents/trident-build/hooks/system-transform.ts`
28. Create `src/subagents/trident-build/shared/state-store.ts` — FIXED from v4.7
29. Create `src/subagents/trident-build/shared/agent-state.ts` — FIXED from v4.7
30. Create `src/subagents/trident-build/tools/build-status.ts`
31. Create `src/subagents/trident-build/hooks/index.ts` — hook factory
32. Create `src/subagents/trident-build/index.ts` — entry point
33. Edit `src/index.ts` — register subagent in config callback
34. **BUILD + TEST**: Verify subagent is registered. Verify hooks enforce (write mock code → blocked). Verify isTridentBuildAgent() works.

### Phase 4: Firewall Fix (Section 9)

**Goal:** Fix the false-positive theatrical detection that blocks mode tools.

35. Edit `src/hooks/trident-hooks.ts` `checkTheatricalPatterns()` — gate by tool type
36. Edit `src/hooks/trident-hooks.ts` `checkTheatricalMerkle()` — gate by tool type
37. Add multi-condition conjunction to theatrical pattern checks
38. **BUILD + TEST**: Verify `trident-deep-planning` with descriptive text about mocks/stubs does NOT block. Verify write/edit with actual mock code DOES block.

### Phase 5: Container Testing & Completion

**Goal:** Add container validation as final step.

39. Implement `runContainerTests()` in `src/poseidon/god-loop.ts`
40. Add `src/tools/manta-spawn-container.ts` equivalent for the build
41. Add `src/tools/manta-test-runner.ts` equivalent (11 mechanical tests)
42. Add `src/tools/manta-runtime-audit.ts` equivalent (8 runtime checks)
43. Wire container results back into God Loop
44. **BUILD + FULL TEST**: End-to-end: activation → God Loop → 96%+ → container tests → auto-lock

---

## APPENDIX A: Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| Trident primary is God boss (not container) | Trident has the 17-layer audit engine, semantic intelligence, and theatrical detection needed to quality-loop directly. Container adds latency without value during the loop. |
| Container testing is LAST step only | Prevents the death-by-container-latency problem. Code must be 96%+ before the expensive container step runs once. |
| Semantic detection (not regex-only) | Prevents false-positives. A user saying "I don't want to activate poseidon mode right now" should not activate it. |
| Auto-lock on tool completion | Prevents agent from re-using the tool without permission. Every build cycle requires explicit human approval. |
| Session-scoped state | Safe for multi-tab/multi-session use. Two sessions can have independent poseidon state. |
| Batched execution (not incremental) | Prevents death-by-1000-papercuts. Each cycle fixes ALL findings, not 1-2 at a time. |
| 96% threshold (not 100%) | 96% is empirically achievable. 100% leads to infinite loops on diminishing returns. |
| CODE-enforced (not prompt-enforced) | Prompts can be ignored/skipped. `EnforcementError` thrown at `tool.execute.before` blocks BEFORE the file reaches disk. |

## APPENDIX B: File Size Estimates

| File | Est. Lines | Complexity |
|------|-----------|------------|
| `src/tools/trident-poseidon.ts` | 200 | Medium — tool wrapper + God Loop dispatch |
| `src/poseidon/poseidon-state.ts` | 100 | Low — simple Map CRUD |
| `src/poseidon/god-loop.ts` | 350 | High — loop logic, audit integration, dispatch |
| `src/poseidon/evidence.ts` | 150 | Medium — file system operations |
| `src/warheads/nlp-pipeline/poseidon-detector.ts` | 120 | Medium — NLP scoring algorithm |
| `src/subagents/trident-build/index.ts` | 60 | Medium — entry point + hook wiring |
| `src/subagents/trident-build/identity/agent-identity.ts` | 20 | Low — simple set check |
| `src/subagents/trident-build/identity/t1-prompt.ts` | 40 | Low — string constant |
| `src/subagents/trident-build/hooks/index.ts` | 40 | Medium — hook factory |
| `src/subagents/trident-build/hooks/guardian-hook.ts` | 150 | High — enforcement gate |
| `src/subagents/trident-build/hooks/gate-hook.ts` | 100 | Medium — evidence tracking |
| `src/subagents/trident-build/hooks/system-transform.ts` | 80 | Medium — identity injection |
| `src/subagents/trident-build/harness/semantic-engine.ts` | 340 | High — AST analysis (from Manta) |
| `src/subagents/trident-build/harness/theatrical-block.ts` | 290 | Medium — regex patterns (from Manta) |
| `src/subagents/trident-build/harness/runtime-grade.ts` | 240 | Medium — P1-P10 checks (from Manta) |
| `src/subagents/trident-build/harness/evidence-pipeline.ts` | 130 | Medium — Merkle chain (from Manta) |
| `src/subagents/trident-build/harness/enforcement-error.ts` | 20 | Low — class definition |
| `src/subagents/trident-build/shared/state-store.ts` | 160 | Medium — session-scoped state (FIXED) |
| `src/subagents/trident-build/shared/agent-state.ts` | 35 | Low — Map wrapper (FIXED) |
| `src/subagents/trident-build/tools/build-status.ts` | 50 | Low — status reporting |
| **TOTAL NEW** | **~2,685 lines** | **20 files (12 new + 8 edits)** |

**Note:** 4 harness files (semantic-engine, theatrical-block, runtime-grade, evidence-pipeline) are adapted from Manta v2.3 source (~1,000 lines total). They are not written from scratch — they are ported with fixes and Trident_Build-specific adjustments.
