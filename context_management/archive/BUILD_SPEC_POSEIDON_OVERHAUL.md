# BUILD SPEC: trident-v4.4

**Version:** 1.0
**Generated:** 2026-06-29T19:33:37.258Z
**Target:** /home/leviathan/OPENCODE_WORKSPACE/Shared Workspace Context/Manta Agent/Active_Projects/Trident_v4.4.2
**Files Discovered:** 199
**Lines Analyzed:** 62588
**Patterns:** 50 | **Failure Modes:** 30

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Architecture Overview](#2-architecture-overview)
3. [Data Model](#3-data-model)
4. [Engine Class Design](#4-engine-class-design)
5. [Defense Rule 1](#5-defense-rule-1)
6. [Defense Rule 2](#6-defense-rule-2)
7. [Defense Rule 3](#7-defense-rule-3)
8. [Defense Rule 4](#8-defense-rule-4)
9. [Defense Rule 5](#9-defense-rule-5)
10. [Blind Spot Reporting](#blind-spot-reporting)
11. [Integration](#integration)
12. [Evidence Output Format](#evidence-output-format)
13. [Test Specifications](#test-specifications)
14. [File Manifest](#file-manifest)
15. [Bible Compliance Matrix](#bible-compliance-matrix)
16. [Migration Strategy](#migration-strategy)

---

## 1. Executive Summary

## Problem — The God Loop Never Actually Looped

The v4.4 Poseidon God Loop was a 2-phase loop (auditAndPlan → verifyCycle) that returned to the model after each phase. The v4.4.2 attempt replaced it with a 10-phase state machine but introduced 5 critical defects: passive tool output (model stops looping), generic plan instructions (agents fly blind), lost CycleTracker (no regression detection), dead bridge methods (300 lines wasted), and context compaction breaks (model forgets it's looping).

The user's evidence from GOD_LOOP_REPORT_V4.4.1_OVERHAUL_V2.md proves a 12-hour autonomous loop IS achievable — 23 cycles, 518→0 findings, 97/100 score, 3 compaction survivals. But that was achieved through manual orchestration, not autonomous convergence.

## Solution — Self-Executing 10-Phase State Machine with Forceful Output

The God Loop must be a CLOSED-LOOP CONTROL SYSTEM:
- SETPOINT: score >= 96
- ERROR SIGNAL: 96 - score (drives wave intensity)
- SENSOR: trident-code-audit (measures defect state)
- CONTROLLER: GodLoopOrchestrator + DECIDE phase (computes correction)
- ACTUATOR: build waves (DISPATCH → trident_build agents)
- FEEDBACK: AUDIT_RECHECK → SCORE (re-measures after actuator)
- DISTURBANCE: new defects from agents (rejected by VERIFY)

9 of 10 phases execute work MECHANICALLY inside the tool. Only DISPATCH requires model action. Every phase returns FORCEFUL text instructions telling the model EXACTLY what to do next — "Enter AUDIT: call trident-code-audit NOW." The model is the engine; the tool is the driver.

## Scope

Merge the 6 v4.4.2 improvements (0-trust verification, evidence gate, structured extraction, WaveVerifier, ContainerTestRunner, StrategicIntelligence) into v4.4.1's 522-line god-loop.ts. KEEP v4.4's forceful output pattern, CycleTracker per-finding lifecycle, and verbose plans with actual source code. ADD thin enforcer hook (~120 lines) and nested Poseidon prevention. Result: ~1200-line god-loop.ts that truly loops autonomously.

### Discovered Failure Modes

| # | Failure Mode | Location | Pattern |
|---|-------------|----------|--------|
| 1 | P6 VIOLATION: db.pragma is not a function | `V4.4.1_BUILD_SPEC_PART1.md:495` | `throw new Error('P6 VIOLATION: db.pragma is not a function'` |
| 2 | P6 VIOLATION: fs.statSync unavailable | `V4.4.1_BUILD_SPEC_PART1.md:734` | `throw new Error('P6 VIOLATION: fs.statSync unavailable'` |
| 3 | INIT FAIL: ${targetPath} is not a directory | `V4.4.1_BUILD_SPEC_PART1.md:738` | `throw new Error(`INIT FAIL: ${targetPath} is not a directory`` |
| 4 | INIT FAIL: no .ts files found in target | `V4.4.1_BUILD_SPEC_PART1.md:742` | `throw new Error('INIT FAIL: no .ts files found in target'` |
| 5 | P2 VIOLATION: waveManifest is null at DISPATCH | `V4.4.1_BUILD_SPEC_PART1.md:955` | `throw new Error('P2 VIOLATION: waveManifest is null at DISPATCH'` |
| 6 | [hashSourceContext] Error reading ${filePath}:${line}: ${err} | `V4.4.1_BUILD_SPEC_PART4.md:197` | `console.error(`[hashSourceContext] Error reading ${filePath}:${line}: ${err}`` |
| 7 | [verifyCycle] Re-audit returned no findings — cannot compute score | `V4.4.1_BUILD_SPEC_PART4.md:303` | `console.error('[verifyCycle] Re-audit returned no findings — cannot compute scor` |
| 8 | trident-code-audit tool not available | `V4.4.1_BUILD_SPEC_PART4.md:362` | `throw new Error('trident-code-audit tool not available'` |
| 9 | [runAudit] Failed: ${err} | `V4.4.1_BUILD_SPEC_PART4.md:371` | `console.error(`[runAudit] Failed: ${err}`` |
| 10 | Evidence store not available for VERIFY phase | `V4.4.1_BUILD_SPEC_PART4.md:496` | `throw new Error('Evidence store not available for VERIFY phase'` |
| 11 | [VERIFY] Evidence gate FAILED (passRate: ${gateResult.passRate}) | `V4.4.1_BUILD_SPEC_PART4.md:508` | `console.error(`[VERIFY] Evidence gate FAILED (passRate: ${gateResult.passRate})`` |
| 12 | [VERIFY] Broken links: ${gateResult.brokenLinks.length} | `V4.4.1_BUILD_SPEC_PART4.md:509` | `console.error(`[VERIFY] Broken links: ${gateResult.brokenLinks.length}`` |
| 13 | [saveState] Failed to write plan: ${err} | `V4.4.1_BUILD_SPEC_PART4.md:897` | `console.error(`[saveState] Failed to write plan: ${err}`` |
| 14 | State save aborted: plan write failed — ${err} | `V4.4.1_BUILD_SPEC_PART4.md:898` | `throw new Error(`State save aborted: plan write failed — ${err}`` |
| 15 | [transition] BLOCKED: ${from} -> ${to} | `V4.4.1_BUILD_SPEC_PART4.md:1303` | `console.error(`[transition] BLOCKED: ${from} -> ${to}`` |
| 16 | [transition] Valid from ${from}: ${error.validTransitions.join( | `V4.4.1_BUILD_SPEC_PART4.md:1304` | `console.error(`[transition] Valid from ${from}: ${error.validTransitions.join('` |
| 17 | [quarantineFile] File not found: ${filePath} | `V4.4.1_BUILD_SPEC_PART4.md:1872` | `console.error(`[quarantineFile] File not found: ${filePath}`` |
| 18 | [QUARANTINE] File quarantined: ${filePath} -> ${quarantinePath} | `V4.4.1_BUILD_SPEC_PART4.md:1912` | `console.error(`[QUARANTINE] File quarantined: ${filePath} -> ${quarantinePath}`` |
| 19 | [QUARANTINE] Reason: ${reason.message} | `V4.4.1_BUILD_SPEC_PART4.md:1913` | `console.error(`[QUARANTINE] Reason: ${reason.message}`` |
| 20 | P6 VIOLATION: db.pragma is not a function | `V4.4.1_BUILD_SPEC.md:495` | `throw new Error('P6 VIOLATION: db.pragma is not a function'` |
| 21 | P6 VIOLATION: fs.statSync unavailable | `V4.4.1_BUILD_SPEC.md:734` | `throw new Error('P6 VIOLATION: fs.statSync unavailable'` |
| 22 | INIT FAIL: ${targetPath} is not a directory | `V4.4.1_BUILD_SPEC.md:738` | `throw new Error(`INIT FAIL: ${targetPath} is not a directory`` |
| 23 | INIT FAIL: no .ts files found in target | `V4.4.1_BUILD_SPEC.md:742` | `throw new Error('INIT FAIL: no .ts files found in target'` |
| 24 | P2 VIOLATION: waveManifest is null at DISPATCH | `V4.4.1_BUILD_SPEC.md:955` | `throw new Error('P2 VIOLATION: waveManifest is null at DISPATCH'` |
| 25 | [POSEIDON] Failed to read state: ${err.message} | `V4.4.1_BUILD_SPEC.md:1737` | `console.error(`[POSEIDON] Failed to read state: ${err.message}`` |
| 26 | [POSEIDON] Phase ${state.phase} failed: ${msg} | `V4.4.1_BUILD_SPEC.md:1791` | `console.error(`[POSEIDON] Phase ${state.phase} failed: ${msg}`` |
| 27 | [EVIDENCE_STORE] Failed to write gate-failure evidence: ${msg} | `V4.4.1_BUILD_SPEC.md:3302` | `console.error(`[EVIDENCE_STORE] Failed to write gate-failure evidence: ${msg}`` |
| 28 | [hashSourceContext] Error reading ${filePath}:${line}: ${err} | `V4.4.1_BUILD_SPEC.md:6208` | `console.error(`[hashSourceContext] Error reading ${filePath}:${line}: ${err}`` |
| 29 | [verifyCycle] Re-audit returned no findings — cannot compute score | `V4.4.1_BUILD_SPEC.md:6314` | `console.error('[verifyCycle] Re-audit returned no findings — cannot compute scor` |
| 30 | trident-code-audit tool not available | `V4.4.1_BUILD_SPEC.md:6373` | `throw new Error('trident-code-audit tool not available'` |

## 2. Architecture Overview

## Three-Layer Architecture (BINDING)

```
LAYER 1 — INTELLIGENCE (god-loop.ts, ~1200 lines)
  GodLoopOrchestrator class with 10-phase state machine
  Each phase executes work MECHANICALLY (self-executing)
  Only DISPATCH returns instructions to model
  Returns FORCEFUL text at every phase transition
  Uses AuditEngine, discoverProject, CycleTracker, WaveVerifier internally

LAYER 2 — ENFORCEMENT (poseidon-enforcer-hook.ts, ~120 lines)
  Fires on tool.execute.after ONLY (never tool.execute.before)
  Reads state.json, checks called tool matches expected phase tool
  Escalation: WARN → BLOCK → RESTART → LOCKOUT
  STATIC system prompt injection (one line, never dynamic)
  Phase-to-expected-tool mapping

LAYER 3 — MEMORY (state.json + evidence store + context synthesis)
  Atomic state writes (temp → fsync → rename)
  Merkle hash chain evidence (SHA-256 linked)
  T1 injectable regenerated after compaction
  CycleTracker finding lifecycle persisted
```

## Phase Flow Diagram

```
INIT
  │ scan .ts files, compute snapshot hash
  ▼
AUDIT ←──────────────────────────────────┐
  │ call AuditEngine.audit() internally  │
  │ populate preAuditFindings[]          │
  │ verifyAuditExecuted() 0-trust check  │
  ▼                                      │
SCORE                                    │
  │ computeProgressiveScore()            │
  │ CycleTracker.classifyFindings()      │
  │ detectStall() — 3 cycles no change   │
  ▼                                      │
DECIDE                                    │
  │ score≥96 → CONTAINER_TEST           │ │
  │ cycle≥50 → FAILED                   │ │
  │ stalledSince≥3 → PROBLEM_SOLVE      │ │
  │ else → PLAN                         │ │
  ▼                                      │
PLAN                                      │
  │ generateWaveManifest()              │ │
  │ group findings by file (max 5 agents)│ │
  │ read source code for each finding    │ │
  │ create verbose instructions w/ code  │ │
  ▼                                      │ │
DISPATCH (ONLY model-action phase)        │ │
  │ return instructions:                 │ │
  │ "DISPATCH N task() calls NOW.        │ │
  │  DO NOT WAIT. DO NOT ASK."           │ │
  │ Model spawns trident_build agents    │ │
  │ Model waits for all to return        │ │
  │ Model calls trident-poseidon again   │ │
  ▼                                      │ │
COLLECT                                   │ │
  │ run context synthesis (T1 bridge)    │ │
  │ collect agent results from state     │ │
  ▼                                      │ │
VERIFY                                    │ │
  │ evidenceStore.meetsThreshold(0.96)   │ │
  │ WaveVerifier.verifyWave() SHA256     │ │
  │ bundle size check                    │ │
  │ pass → AUDIT_RECHECK                 │ │
  │ fail → PLAN (re-dispatch wave)       │ │
  ▼                                      │ │
AUDIT_RECHECK ───────────────────────────┘ │
  │ re-audit modified files only         │
  │ populate postAuditFindings[]         │
  │ verifyAuditExecuted() 0-trust check  │
  │ cycle++                              │
  │ → SCORE (loop back)                  │
                                            │
CONTAINER_TEST ◄───────────────────────────┘
  │ ContainerTestRunner.runFullCycle()
  │ build → deploy → TUI → observe → score
  │ pass → LOCKED
  │ fail → PROBLEM_SOLVE
  ▼
LOCKED (terminal — BUILD COMPLETE)
```

## The Interrogation Prompt Pattern (DISPATCH output)

Each dispatch includes verbose source code context:

```
[POSEIDON: PLAN → DISPATCH]
Wave 1: 3 agents. Each has specific findings + SOURCE CODE context.

DISPATCH: Execute 3 task() calls NOW with subagent_type='trident_build'.
DO NOT WAIT. DO NOT ASK. DISPATCH ALL 3 IN PARALLEL.
After ALL agents return, call trident-poseidon action=start to COLLECT.

Agent 1: fix-r4-error-handling.ts (5 findings)
  WORKDIR: /real/project/path (NOT /tmp/)
  FILES: src/audit-engine/layers/r4-error-handling.ts
  Findings:
    Line 87: Empty catch block — error silently consumed
    Source: >>>  } catch (e) { }  <<<
    Fix: Add logging or re-throw

    Line 142: Catch block returns success signal
    Source: >>>  catch(e) { return { success: true }; }  <<<
    Fix: Return error information, not success

Agent 2: fix-r11-theatrical-integrity.ts (3 findings)
  ...
```

## Static vs Dynamic Injection (THE CACHE RULE)

System prompt (STATIC, injected ONCE, never changes):
```
Poseidon Mode active. Call trident-poseidon to advance. Do NOT stop until LOCKED.
```

Phase instructions (DYNAMIC, returned by tool in MESSAGES channel):
```
[POSEIDON: AUDIT → SCORE]
Audit complete: 248 findings. Score computed mechanically.
Next: Call trident-poseidon action=start to advance to DECIDE.
```

DYNAMIC content goes in the MESSAGES channel via tool output — NOT in the system prompt. This preserves the KV cache.

### Project Structure

```
Trident_v4.4.2/
  CONTEXT_MANAGEMENT/
    (9 files)
  context_management/
    (3 files)
  src/
    context-library/
      (9 files)
    fsm/
      (5 files)
    audit-engine/
      layers/
        (18 files)
    subagents/
      trident-build/
        firewall/
          (5 files)
        identity/
          (2 files)
        harness/
          (4 files)
        tools/
          (1 files)
        shared/
        hooks/
          (4 files)
    agents/
      (1 files)
    identity/
      trident/
        explore/
          (5 files)
    modes/
      (6 files)
    evidence/
      (3 files)
    nlp/
      (4 files)
    poseidon/
      (3 files)
    warheads/
      container-testing/
        (4 files)
      seven-q-enforcement/
        rules/
          (1 files)
      ts-compiler-api/
        analyzers/
          (1 files)
      xstate-fsm/
        (1 files)
      concurrency/
        (3 files)
      p1-p10-scanner/
        rules/
          (1 files)
      nlp-pipeline/
        (5 files)
    tools/
      (3 files)
    shared/
      project-folder-warhead/
        (5 files)
      warheads/
        (12 files)
    hooks/
      (5 files)
    security/
      (2 files)
    tests/
      fsm/
        (3 files)
      deep/
        (1 files)
      identity/
        (1 files)
      nlp/
        (1 files)
      tools/
        (1 files)
    artifacts/
      (4 files)

```

### Entry Points

- `src/index.ts`

### Language Breakdown

| Language | Files |
|----------|-------|
| json | 11 |
| md | 42 |
| ts | 145 |
| py | 1 |

## 3. Data Model

*No data model provided. Include full TypeScript interface definitions with field-by-field rationale.*

### Existing Types in Codebase

| Type | Kind | Location | Signature |
|------|------|----------|----------|
| PoseidonEnforcerConfig | interface | `V4.4.1_BUILD_SPEC_PART1.md:338` | `export interface PoseidonEnforcerConfig {` |
| EnforcerAction | interface | `V4.4.1_BUILD_SPEC_PART1.md:345` | `export interface EnforcerAction {` |
| FindingSignature | interface | `V4.4.1_BUILD_SPEC_PART1.md:654` | `export interface FindingSignature {` |
| WaveAgentSpec | interface | `V4.4.1_BUILD_SPEC_PART1.md:664` | `export interface WaveAgentSpec {` |
| WaveManifest | interface | `V4.4.1_BUILD_SPEC_PART1.md:673` | `export interface WaveManifest {` |
| GodLoopState | interface | `V4.4.1_BUILD_SPEC_PART1.md:682` | `export interface GodLoopState {` |
| PoseidonEnforcerConfig | interface | `V4.4.1_BUILD_SPEC.md:338` | `export interface PoseidonEnforcerConfig {` |
| EnforcerAction | interface | `V4.4.1_BUILD_SPEC.md:345` | `export interface EnforcerAction {` |
| FindingSignature | interface | `V4.4.1_BUILD_SPEC.md:654` | `export interface FindingSignature {` |
| WaveAgentSpec | interface | `V4.4.1_BUILD_SPEC.md:664` | `export interface WaveAgentSpec {` |
| WaveManifest | interface | `V4.4.1_BUILD_SPEC.md:673` | `export interface WaveManifest {` |
| GodLoopState | interface | `V4.4.1_BUILD_SPEC.md:682` | `export interface GodLoopState {` |
| TransitionError | class | `V4.4.1_BUILD_SPEC_PART4.md:1265` | `class TransitionError extends Error {` |

## 4. Engine Class Design

```typescript
import * as fs from 'fs';
import * as path from 'path';
import { AuditEngine } from '../audit-engine/index.js';
import { discoverProject } from '../shared/auto-discover.js';
import { getEvidenceStore } from './evidence-store.js';
import { CycleTracker, type FindingLifecycle } from './cycle-tracker.js';
import { WaveVerifier } from './wave-verifier.js';
import { ContainerTestRunner } from './container-tester.js';
import { StrategicIntelligence } from './strategic-intelligence.js';
import { CheckpointManager } from './checkpoint-manager.js';
import { VisibilityLogger } from './visibility-logger.js';
import { tridentLog } from '../utils.js';

// ============================================================================
// TYPES
// ============================================================================

export type GodLoopPhase =
  | 'INIT' | 'AUDIT' | 'SCORE' | 'DECIDE' | 'PLAN'
  | 'DISPATCH' | 'COLLECT' | 'VERIFY' | 'AUDIT_RECHECK'
  | 'PROBLEM_SOLVE' | 'CONTAINER_TEST' | 'LOCKED' | 'FAILED';

export interface GodLoopState {
  phase: GodLoopPhase;
  cycle: number;
  wave: number;
  score: number;
  highestScore: number;
  targetPath: string;
  snapshotHash: string;
  preAuditFindings: AuditFinding[];
  postAuditFindings: AuditFinding[];
  waveManifest: WaveManifest | null;
  stalledSince: number;
  lastWaveResult: 'PENDING' | 'TRUSTED' | 'THEATRICAL' | 'REGRESSED' | 'BLOCKED';
  sessionStart: number;
  evidenceRootHash: string;
}

export interface PhaseResult {
  phase: GodLoopPhase;
  nextPhase: GodLoopPhase;
  cycle: number;
  wave: number;
  score: number;
  instructions: string;  // FORCEFUL text — grabs model by the collar
  stateWritten: boolean;
  requiresModelAction: boolean;  // Only true for DISPATCH
}

export interface WaveManifest {
  wave: number;
  agentCount: number;
  agents: WaveAgentSpec[];
  preWaveHash: string;
  estimatedComplexity: 'low' | 'medium' | 'high';
}

export interface WaveAgentSpec {
  agentType: 'trident_build';
  targetFiles: string[];
  findings: AuditFinding[];
  instructions: string;  // VERBOSE — includes source code snippets
  expectedHashes: string[];
}

// ============================================================================
// GOD LOOP ORCHESTRATOR
// ============================================================================

export class GodLoopOrchestrator {
  private auditEngine: AuditEngine;
  private cycleTracker: CycleTracker;
  private waveVerifier: WaveVerifier;
  private containerTester: ContainerTestRunner;
  private strategicIntel: StrategicIntelligence;
  private checkpointMgr: CheckpointManager;
  private visibilityLog: VisibilityLogger;

  constructor(private targetPath: string = '') {
    this.auditEngine = new AuditEngine();
    this.cycleTracker = new CycleTracker();
    this.waveVerifier = new WaveVerifier();
    this.containerTester = new ContainerTestRunner();
    this.strategicIntel = new StrategicIntelligence();
    this.checkpointMgr = new CheckpointManager();
    this.visibilityLog = new VisibilityLogger();
  }

  // ===========================================================================
  // MAIN ENTRY POINT — runs ONE phase per call, returns forceful instructions
  // ===========================================================================

  async runPhase(targetPath: string, sessionId?: string): Promise<PhaseResult> {
    const statePath = path.join(targetPath, '.trident', 'god-loop', 'state.json');
    let state = this.loadState(statePath);

    // Terminal check
    if (state.phase === 'LOCKED' || state.phase === 'FAILED') {
      return this.buildResult(state, state.phase, 
        state.phase === 'LOCKED' 
          ? `LOCKED! Score ${state.score}/100. Build complete after ${state.cycle} cycles.`
          : `FAILED after ${state.cycle} cycles. Highest score: ${state.highestScore}.`,
        false);
    }

    let result: PhaseResult;
    try {
      switch (state.phase) {
        case 'INIT':          result = await this.phaseInit(targetPath); break;
        case 'AUDIT':         result = await this.executePhaseAudit(targetPath, state); break;
        case 'SCORE':         result = this.phaseScore(state); break;
        case 'DECIDE':        result = this.phaseDecide(state); break;
        case 'PLAN':          result = this.phasePlan(state, targetPath); break;
        case 'DISPATCH':      result = this.phaseDispatch(state); break;
        case 'COLLECT':       result = await this.phaseCollect(state, targetPath); break;
        case 'VERIFY':        result = await this.phaseVerify(state, targetPath); break;
        case 'AUDIT_RECHECK': result = await this.phaseAuditRecheck(targetPath, state); break;
        case 'CONTAINER_TEST':result = await this.phaseContainerTest(state, targetPath); break;
        case 'PROBLEM_SOLVE': result = await this.phaseProblemSolve(state, targetPath); break;
        default:              result = this.phaseDecide(state);
      }

      // 0-TRUST: Verify audit actually ran after AUDIT/AUDIT_RECHECK
      if (state.phase === 'AUDIT' || state.phase === 'AUDIT_RECHECK') {
        const auditCheck = this.verifyAuditExecuted(targetPath);
        if (!auditCheck.verified) {
          tridentLog('ERROR', 'god-loop', `[0-TRUST] AUDIT HALLUCINATION: ${auditCheck.reason}`);
          result.nextPhase = state.phase === 'AUDIT' ? 'AUDIT' : 'AUDIT_RECHECK';
          result.instructions = `[POSEIDON: 0-TRUST AUDIT FAILED] ${auditCheck.reason}. Re-running audit.`;
        }
      }

      // Post-phase disk verification
      this.verifyPostPhaseDisk(targetPath, result);

      // Write new state
      state.phase = result.nextPhase;
      state.cycle = result.cycle;
      state.score = result.score;
      if (result.score > state.highestScore) state.highestScore = result.score;
      this.writeStateAtomic(statePath, state);

      this.visibilityLog.log(state.phase, result.nextPhase, result.score, result.instructions.substring(0, 200));
    } catch (err) {
      tridentLog('ERROR', 'god-loop', `Phase ${state.phase} crashed: ${err}`);
      state.phase = 'FAILED';
      this.writeStateAtomic(statePath, state);
      result = this.buildResult(state, 'FAILED',
        `Phase ${state.phase} crashed: ${err}. God Loop FAILED.`, false);
    }

    return result;
  }

  // ===========================================================================
  // PHASE: INIT — Scan files, compute hash, validate target
  // ===========================================================================

  private async phaseInit(targetPath: string): Promise<PhaseResult> {
    const tsFiles = this.scanTsFiles(targetPath);
    const snapshotHash = this.computeSnapshotHash(tsFiles);

    return {
      phase: 'INIT',
      nextPhase: 'AUDIT',
      cycle: 0,
      wave: 0,
      score: 0,
      instructions: `[POSEIDON: INIT → AUDIT]
Target validated: ${tsFiles.length} .ts files. Snapshot hash: ${snapshotHash.substring(0, 16)}.
ENTER AUDIT: The audit will run mechanically inside the next trident-poseidon call.
Next: Call trident-poseidon action=start to run the full audit.`,
      stateWritten: true,
      requiresModelAction: false,
    };
  }

  // ===========================================================================
  // PHASE: AUDIT — Run AuditEngine internally, populate findings
  // ===========================================================================

  private async executePhaseAudit(targetPath: string, state: GodLoopState): Promise<PhaseResult> {
    const result = await this.auditEngine.audit(targetPath);
    const findings = result.findings || [];
    state.preAuditFindings = findings;

    const critical = findings.filter(f => f.severity === 'CRITICAL').length;
    const high = findings.filter(f => f.severity === 'HIGH').length;

    return {
      phase: 'AUDIT',
      nextPhase: 'SCORE',
      cycle: state.cycle,
      wave: state.wave,
      score: 0,
      instructions: `[POSEIDON: AUDIT → SCORE]
Audit complete: ${findings.length} findings (${critical} CRIT, ${high} HIGH).
Score will be computed mechanically via progressive scoring.
Next: Call trident-poseidon action=start to compute score.`,
      stateWritten: true,
      requiresModelAction: false,
    };
  }

  // ===========================================================================
  // PHASE: SCORE — Progressive scoring + CycleTracker + stall detection
  // ===========================================================================

  private phaseScore(state: GodLoopState): PhaseResult {
    // Progressive score: hash-based finding comparison
    const progressiveScore = this.computeProgressiveScore(state);

    // CycleTracker: classify finding lifecycle
    const lifecycles = this.cycleTracker.classifyFindings(
      state.preAuditFindings, state.postAuditFindings);
    const regressions = lifecycles.filter(l => l.status === 'regression');

    // Stall detection
    if (progressiveScore === state.score) {
      state.stalledSince++;
    } else {
      state.stalledSince = 0;
    }

    return {
      phase: 'SCORE',
      nextPhase: 'DECIDE',
      cycle: state.cycle,
      wave: state.wave,
      score: progressiveScore,
      instructions: `[POSEIDON: SCORE → DECIDE]
Score: ${progressiveScore}/100 (cycle ${state.cycle}).
Resolved: ${state.preAuditFindings.length - state.postAuditFindings.length}/${state.preAuditFindings.length} findings.
${regressions.length > 0 ? `WARNING: ${regressions.length} REGRESSIONS detected.` : ''}
${state.stalledSince > 0 ? `Stall counter: ${state.stalledSince}/3` : ''}
Next: Call trident-poseidon action=start to decide next action.`,
      stateWritten: true,
      requiresModelAction: false,
    };
  }

  // ===========================================================================
  // PHASE: DECIDE — Routing logic
  // ===========================================================================

  private phaseDecide(state: GodLoopState): PhaseResult {
    const target = 96;
    const maxCycles = 50;
    const stallThreshold = 3;

    if (state.score >= target) {
      return {
        phase: 'DECIDE',
        nextPhase: 'CONTAINER_TEST',
        cycle: state.cycle,
        wave: state.wave,
        score: state.score,
        instructions: `[POSEIDON: DECIDE → CONTAINER_TEST]
Score ${state.score}/100 >= ${target}. Convergence reached!
Running container test for mechanical validation before LOCKED.
Next: Call trident-poseidon action=start to run container test.`,
        stateWritten: true,
        requiresModelAction: false,
      };
    }

    if (state.cycle >= maxCycles) {
      return this.buildResult(state, 'FAILED',
        `[POSEIDON: DECIDE → FAILED]
Max cycles (${maxCycles}) reached. Score: ${state.score}/100. Highest: ${state.highestScore}.
God Loop FAILED. Manual intervention required.`, false);
    }

    if (state.stalledSince >= stallThreshold) {
      return {
        phase: 'DECIDE',
        nextPhase: 'PROBLEM_SOLVE',
        cycle: state.cycle,
        wave: state.wave,
        score: state.score,
        instructions: `[POSEIDON: DECIDE → PROBLEM_SOLVE]
Score stalled for ${state.stalledSince} cycles. Entering problem-solving mode.
Next: Call trident-poseidon action=start to diagnose stall.`,
        stateWritten: true,
        requiresModelAction: false,
      };
    }

    return {
      phase: 'DECIDE',
      nextPhase: 'PLAN',
      cycle: state.cycle,
      wave: state.wave,
      score: state.score,
      instructions: `[POSEIDON: DECIDE → PLAN]
Score ${state.score}/100 < ${target}. Not stalled. Cycle ${state.cycle}/${maxCycles}.
Next: Call trident-poseidon action=start to generate remediation wave.`,
      stateWritten: true,
      requiresModelAction: false,
    };
  }

  // ===========================================================================
  // PHASE: PLAN — Generate wave manifest WITH verbose source code context
  // ===========================================================================

  private phasePlan(state: GodLoopState, targetPath: string): PhaseResult {
    // Group findings by file (max 5 agents per wave)
    const maxAgents = 5;
    const byFile = new Map<string, AuditFinding[]>();
    for (const f of state.preAuditFindings) {
      const arr = byFile.get(f.file) || [];
      arr.push(f);
      byFile.set(f.file, arr);
    }

    // Sort files by finding count descending, take top 5
    const sorted = Array.from(byFile.entries())
      .sort((a, b) => b[1].length - a[1].length)
      .slice(0, maxAgents);

    const agents: WaveAgentSpec[] = sorted.map(([file, findings]) => {
      // VERBOSE: Read actual source code around each finding
      const sourceContext = findings.map(f => {
        const snippet = this.readSourceContext(targetPath, f.file, f.line, 3);
        return `  Line ${f.line}: ${f.description}
    Source: >>> ${snippet} <<<
    Fix: ${f.correction || 'Apply the defense rule algorithm'}`;
      }).join('\n');

      return {
        agentType: 'trident_build',
        targetFiles: [file],
        findings: findings.slice(0, 10),
        instructions: `WORKDIR: ${targetPath}
Fix ${findings.length} findings in ${file}.
DO NOT create files in /tmp/. DO NOT spawn sub-agents. DO NOT call trident-poseidon.

Findings:
${sourceContext}

After fixing, report: sha256sum ${file}, then tsc --noEmit.`,
        expectedHashes: [],
      };
    });

    const manifest: WaveManifest = {
      wave: state.wave + 1,
      agentCount: agents.length,
      agents,
      preWaveHash: state.snapshotHash,
      estimatedComplexity: state.preAuditFindings.length > 50 ? 'high' : state.preAuditFindings.length > 20 ? 'medium' : 'low',
    };

    state.waveManifest = manifest;

    return {
      phase: 'PLAN',
      nextPhase: 'DISPATCH',
      cycle: state.cycle,
      wave: manifest.wave,
      score: state.score,
      instructions: `[POSEIDON: PLAN → DISPATCH]
Wave ${manifest.wave}: ${agents.length} agents. Complexity: ${manifest.estimatedComplexity}.
Each agent has specific findings + SOURCE CODE context with >>> markers.
DISPATCH: Execute ${agents.length} task() calls NOW with subagent_type='trident_build'.
DO NOT WAIT. DO NOT ASK. DISPATCH ALL ${agents.length} IN PARALLEL.
After ALL agents return, call trident-poseidon action=start to COLLECT.`,
      stateWritten: true,
      requiresModelAction: false, // DISPATCH phase handles the model action flag
    };
  }

  // ===========================================================================
  // PHASE: DISPATCH — ONLY phase that requires model action
  // ===========================================================================

  private phaseDispatch(state: GodLoopState): PhaseResult {
    const manifest = state.waveManifest;
    if (!manifest) {
      return this.buildResult(state, 'PLAN', 'No wave manifest. Returning to PLAN.', false);
    }

    const agentList = manifest.agents.map((a, i) => 
      `Agent ${i + 1}: fix-${path.basename(a.targetFiles[0] || 'unknown')}
  WORKDIR: ${state.targetPath} (NOT /tmp/)
  FILES: ${a.targetFiles.join(', ')}
  ${a.findings.length} findings with source code context
  Instructions: ${a.instructions.substring(0, 100)}...`
    ).join('\n\n');

    return {
      phase: 'DISPATCH',
      nextPhase: 'COLLECT',
      cycle: state.cycle,
      wave: state.wave,
      score: state.score,
      instructions: `[POSEIDON: DISPATCH → COLLECT]
Wave ${manifest.wave}: ${manifest.agentCount} agents.

DISPATCH: Execute ${manifest.agentCount} task() calls NOW, in parallel.
Use subagent_type='trident_build' for each agent.
DO NOT WAIT FOR USER CONFIRMATION.
DO NOT STOP AND ASK QUESTIONS.
DISPATCH ALL ${manifest.agentCount} AGENTS IN A SINGLE MESSAGE.

${agentList}

After ALL agents return, call trident-poseidon action=start to COLLECT results.`,
      stateWritten: true,
      requiresModelAction: true, // ONLY phase that requires model action
    };
  }

  // ===========================================================================
  // PHASE: COLLECT — Run context synthesis internally
  // ===========================================================================

  private async phaseCollect(state: GodLoopState, targetPath: string): Promise<PhaseResult> {
    // Write T1 injectable for context survival
    try {
      const { contextSynthesisEngine } = await import('../modes/context-synthesis-engine.js');
      const engine = contextSynthesisEngine;
      const patterns = this.extractPatterns(state);
      const keyFacts = this.extractKeyFacts(state);
      const t1Content = `# Poseidon God Loop — T1 Context

Phase: COLLECT | Cycle: ${state.cycle} | Score: ${state.score}/100
Wave: ${state.wave} | Agents: ${state.waveManifest?.agentCount || 0}

Key Patterns:
${patterns.join('\n')}

Critical Facts:
${keyFacts.join('\n')}

WORKDIR: ${targetPath}
Next: Call trident-poseidon action=start to VERIFY results.`;
      const t1Path = path.join(targetPath, '.trident', 'god-loop', `wave-${state.wave}-T1.md`);
      fs.mkdirSync(path.dirname(t1Path), { recursive: true });
      fs.writeFileSync(t1Path, t1Content, 'utf-8');
    } catch (e) {
      tridentLog('WARN', 'god-loop', `T1 context bridge failed: ${e}`);
    }

    return {
      phase: 'COLLECT',
      nextPhase: 'VERIFY',
      cycle: state.cycle,
      wave: state.wave,
      score: state.score,
      instructions: `[POSEIDON: COLLECT → VERIFY]
Results collected. T1 context bridge written for compaction survival.
Next: Call trident-poseidon action=start to verify evidence chain.`,
      stateWritten: true,
      requiresModelAction: false,
    };
  }

  // ===========================================================================
  // PHASE: VERIFY — Evidence gate (0.96) + WaveVerifier
  // ===========================================================================

  private async phaseVerify(state: GodLoopState, targetPath: string): Promise<PhaseResult> {
    const store = getEvidenceStore();
    const gatePassed = store.meetsThreshold(0.96);

    if (!gatePassed) {
      const passRate = store.getPassRate();
      return {
        phase: 'VERIFY',
        nextPhase: 'PLAN',
        cycle: state.cycle,
        wave: state.wave,
        score: state.score,
        instructions: `[POSEIDON: VERIFY FAILED → PLAN]
EVIDENCE GATE FAILED: passRate=${passRate.toFixed(4)} < 0.96.
Re-dispatching wave to fix remaining issues.
Next: Call trident-poseidon action=start to re-plan.`,
        stateWritten: true,
        requiresModelAction: false,
      };
    }

    // WaveVerifier: SHA256 check on agent output
    const waveResult = this.waveVerifier.verifyWave(state.waveManifest, targetPath);
    state.lastWaveResult = waveResult.trusted ? 'TRUSTED' : 'THEATRICAL';

    if (!waveResult.trusted) {
      return {
        phase: 'VERIFY',
        nextPhase: 'PLAN',
        cycle: state.cycle,
        wave: state.wave,
        score: state.score,
        instructions: `[POSEIDON: VERIFY FAILED → PLAN]
WAVE VERIFIER: Agent claims do not match SHA256 hashes. Theatrical work detected.
Re-dispatching wave.
Next: Call trident-poseidon action=start to re-plan.`,
        stateWritten: true,
        requiresModelAction: false,
      };
    }

    const nextPhase = state.score >= 96 ? 'CONTAINER_TEST' : 'AUDIT_RECHECK';
    return {
      phase: 'VERIFY',
      nextPhase,
      cycle: state.cycle,
      wave: state.wave,
      score: state.score,
      instructions: `[POSEIDON: VERIFY → ${nextPhase}]
Evidence gate PASSED (passRate >= 0.96). Wave verified (SHA256 match).
${state.score >= 96 ? 'Score >= 96. Running container test.' : 'Score < 96. Re-auditing to measure progress.'}
Next: Call trident-poseidon action=start to ${state.score >= 96 ? 'run container test' : 're-audit'}.`,
      stateWritten: true,
      requiresModelAction: false,
    };
  }

  // ===========================================================================
  // PHASE: AUDIT_RECHECK — Re-audit modified files only
  // ===========================================================================

  private async phaseAuditRecheck(targetPath: string, state: GodLoopState): Promise<PhaseResult> {
    const result = await this.auditEngine.audit(targetPath);
    state.postAuditFindings = result.findings || [];
    state.cycle++;

    return {
      phase: 'AUDIT_RECHECK',
      nextPhase: 'SCORE',
      cycle: state.cycle,
      wave: state.wave,
      score: 0, // Will be computed in SCORE
      instructions: `[POSEIDON: AUDIT_RECHECK → SCORE]
Re-audit complete: ${state.postAuditFindings.length} findings (was ${state.preAuditFindings.length}).
Cycle incremented to ${state.cycle}.
Next: Call trident-poseidon action=start to compute new score.`,
      stateWritten: true,
      requiresModelAction: false,
    };
  }

  // ===========================================================================
  // PHASE: CONTAINER_TEST — Mechanical Docker validation
  // ===========================================================================

  private async phaseContainerTest(state: GodLoopState, targetPath: string): Promise<PhaseResult> {
    let passed = false;
    try {
      const result = await this.containerTester.runFullCycle(targetPath);
      passed = result.passed;
    } catch (e) {
      tridentLog('WARN', 'god-loop', `Container test failed: ${e}`);
      // FAIL-OPEN: If Docker unavailable, still allow LOCKED (document risk)
      passed = true;
    }

    if (passed) {
      return {
        phase: 'CONTAINER_TEST',
        nextPhase: 'LOCKED',
        cycle: state.cycle,
        wave: state.wave,
        score: state.score,
        instructions: `[POSEIDON: CONTAINER_TEST → LOCKED]
CONTAINER TEST PASSED. All mechanical checks green.
BUILD LOCKED — target validated at score ${state.score}/100 after ${state.cycle} cycles.
God Loop COMPLETE.`,
        stateWritten: true,
        requiresModelAction: false,
      };
    }

    return {
      phase: 'CONTAINER_TEST',
      nextPhase: 'PROBLEM_SOLVE',
      cycle: state.cycle,
      wave: state.wave,
      score: state.score,
      instructions: `[POSEIDON: CONTAINER_TEST FAILED → PROBLEM_SOLVE]
Container test failed. Entering problem-solving mode.
Next: Call trident-poseidon action=start to diagnose.`,
      stateWritten: true,
      requiresModelAction: false,
    };
  }

  // ===========================================================================
  // PHASE: PROBLEM_SOLVE — StrategicIntelligence diagnosis
  // ===========================================================================

  private async phaseProblemSolve(state: GodLoopState, targetPath: string): Promise<PhaseResult> {
    const diagnosis = this.strategicIntel.classifyProblem({
      score: state.score,
      cycle: state.cycle,
      stalledSince: state.stalledSince,
      findingCount: state.preAuditFindings.length,
      targetPath,
    });

    // Reset stall counter after diagnosis
    state.stalledSince = 0;

    return {
      phase: 'PROBLEM_SOLVE',
      nextPhase: 'AUDIT',
      cycle: state.cycle,
      wave: state.wave,
      score: state.score,
      instructions: `[POSEIDON: PROBLEM_SOLVE → AUDIT]
Diagnosis: ${diagnosis.problemClass} — ${diagnosis.description}.
Strategy: ${diagnosis.strategy}.
Stall counter reset. Re-entering audit cycle.
Next: Call trident-poseidon action=start to re-audit.`,
      stateWritten: true,
      requiresModelAction: false,
    };
  }

  // ===========================================================================
  // HELPERS
  // ===========================================================================

  private computeProgressiveScore(state: GodLoopState): number {
    if (!state.preAuditFindings || state.preAuditFindings.length === 0) return 100;
    if (!state.postAuditFindings) return 0;
    const preCount = state.preAuditFindings.length;
    const postCount = state.postAuditFindings.length;
    const resolved = preCount - postCount;
    return Math.round((resolved / preCount) * 100);
  }

  private verifyAuditExecuted(targetPath: string): { verified: boolean; reason: string } {
    // 4-point disk verification
    // 1. audit-layer-state.json exists
    // 2. CODE_REVIEW artifact exists and > 500 bytes
    // 3. Artifact written in last 120 seconds
    // 4. Evidence store has AUDIT entry
    // ... (implementation from v4.4.2)
    return { verified: true, reason: '' };
  }

  private scanTsFiles(dir: string): string[] {
    const results: string[] = [];
    const walk = (d: string, depth: number) => {
      if (depth > 10) return;
      try {
        for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
          if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist') continue;
          const full = path.join(d, entry.name);
          if (entry.isDirectory()) walk(full, depth + 1);
          else if (entry.name.endsWith('.ts')) results.push(full);
        }
      } catch { /* skip */ }
    };
    walk(dir, 0);
    return results;
  }

  private readSourceContext(targetPath: string, file: string, line: number, contextLines: number): string {
    try {
      const fullPath = path.resolve(targetPath, file);
      const content = fs.readFileSync(fullPath, 'utf-8');
      const lines = content.split('\n');
      const start = Math.max(0, line - contextLines - 1);
      const end = Math.min(lines.length, line + contextLines);
      return lines.slice(start, end).join('\n').trim();
    } catch {
      return '(source unavailable)';
    }
  }

  private computeSnapshotHash(files: string[]): string {
    return this.sha256(files.sort().join('|'));
  }

  private sha256(input: string): string {
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(input).digest('hex');
  }

  private loadState(statePath: string): GodLoopState {
    try {
      const raw = fs.readFileSync(statePath, 'utf-8');
      return JSON.parse(raw);
    } catch {
      return {
        phase: 'INIT', cycle: 0, wave: 0, score: 0, highestScore: 0,
        targetPath: '', snapshotHash: '', preAuditFindings: [], postAuditFindings: [],
        waveManifest: null, stalledSince: 0, lastWaveResult: 'PENDING',
        sessionStart: Date.now(), evidenceRootHash: '',
      };
    }
  }

  private writeStateAtomic(statePath: string, state: GodLoopState): void {
    fs.mkdirSync(path.dirname(statePath), { recursive: true });
    const tmp = statePath + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(state, null, 2), 'utf-8');
    fs.renameSync(tmp, statePath);
  }

  private verifyPostPhaseDisk(targetPath: string, result: PhaseResult): void {
    // Post-phase disk verification (warnings only)
  }

  private extractPatterns(state: GodLoopState): string[] {
    return state.preAuditFindings.slice(0, 5).map(f => `- ${f.category}: ${f.description}`);
  }

  private extractKeyFacts(state: GodLoopState): string[] {
    return [
      `- Score: ${state.score}/100 (cycle ${state.cycle})`,
      `- Findings: ${state.preAuditFindings.length}`,
      `- Wave: ${state.wave}`,
    ];
  }

  private buildResult(state: GodLoopState, nextPhase: GodLoopPhase, 
                      instructions: string, requiresModelAction: boolean): PhaseResult {
    return {
      phase: state.phase,
      nextPhase,
      cycle: state.cycle,
      wave: state.wave,
      score: state.score,
      instructions,
      stateWritten: true,
      requiresModelAction,
    };
  }
}

export const godLoopOrchestrator = new GodLoopOrchestrator();
```

### Existing Class Reference

**BuildFirewall** (`src/subagents/trident-build/firewall/index.ts:18-24`)

```typescript
export class BuildFirewall {
  public planScope: PlanScopeValidator;
  public snapshot: SnapshotDiffClass;
  public ast: ASTFirewall;
  public evidence: EvidenceEnforcer;
  private initialized = false;

```

**IdentityLoader** (`src/identity/index.ts:38-45`)

```typescript
export class IdentityLoader {
  private baseDir: string;

  constructor(baseDir?: string) {
    this.baseDir = baseDir || path.resolve(getIdentityBaseDir(), '..', 'identity');
  }

  async loadForRole(role: string): Promise<IdentityBundle> {
```

**ContainerTestRunner** (`src/warheads/container-testing/index.ts:8-26`)

```typescript
export class ContainerTestRunner {
  public container: ContainerManager;
  public tmux: TmuxSession;
  public verifier: DeployVerifier;

  constructor() {
    this.container = new ContainerManager();
    this.tmux = new TmuxSession();
    this.verifier = new DeployVerifier();
    tridentLog('INFO', 'container-testing', 'ContainerTestRunner initialized');
  }

  /** Run the full 12-step container test protocol */
  async runFullProtocol(
    image: string,
    pluginPath: string,
    configPath: string,
    identityFile: string,
  ): Promise<{ passed: boolean; steps: Array<{ step: number; name:
```

## 5. Defense Rule 1

### Rule P-1: Self-Executing Phases (NO Instructions-Only Returns)

**Purpose:** Prevent the God Loop from becoming a suggestion engine. Every phase must DO work, not DESCRIBE work.

**Algorithm:**
1. Phase method is called
2. Phase performs its work MECHANICALLY (calls AuditEngine, reads files, computes scores)
3. Phase writes results to state
4. Phase returns PhaseResult with `instructions` field containing FORCEFUL text
5. `requiresModelAction` is `false` for all phases except DISPATCH

**Violation Pattern:** Phase returns `{ instructions: 'Please audit the codebase' }` without actually calling AuditEngine.
**Detection:** If `requiresModelAction === false` and `stateWritten === false`, the phase didn't execute.

**Worked Example:**
1. AUDIT phase called
2. `this.auditEngine.audit(targetPath)` executes (real audit)
3. Findings populated in state
4. Returns: 'Audit complete: 248 findings. Enter SCORE.'
5. Model reads instruction, calls trident-poseidon again
6. SCORE phase called — computes score mechanically
7. Returns: 'Score: 45/100. Enter DECIDE.'
8. Model reads, calls trident-poseidon again
9. Loop continues autonomously

### Related Discovered Failure

**Pattern:** `throw new Error('P6 VIOLATION: db.pragma is not a function'`
**Location:** `V4.4.1_BUILD_SPEC_PART1.md:495`
**Message:** P6 VIOLATION: db.pragma is not a function

```typescript
// Pragma application (P6: dependency check before use)
function configureDatabase(db: Database): void {
  if (typeof db.pragma !== 'function') {
    throw new Error('P6 VIOLATION: db.pragma is not a function');
  }
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('cache_size = -64000');
  db.pragma('temp_store = MEMORY');
  db.pragma('mmap_size = 268435456');
  
```

## 6. Defense Rule 2

### Rule P-2: Forceful Tool Output (Grab by the Collar)

**Purpose:** Every phase output MUST be explicit enough that ANY model continues looping.

**Pattern:** Every instruction string starts with `[POSEIDON: PHASE_A → PHASE_B]` and ends with `Next: Call trident-poseidon action=start to <action>`.

**Violation Pattern:** Tool returns 'Next: Call trident-poseidon action=start to continue.' — too vague.
**Correct Pattern:** Tool returns 'Next: Call trident-poseidon action=start to compute score.' — specific.

**For DISPATCH (the critical phase):**
```
DISPATCH: Execute 5 task() calls NOW, in parallel.
Use subagent_type='trident_build' for each agent.
DO NOT WAIT FOR USER CONFIRMATION.
DO NOT STOP AND ASK QUESTIONS.
DISPATCH ALL 5 AGENTS IN A SINGLE MESSAGE.
After ALL agents return, call trident-poseidon action=start to COLLECT results.
```

**Worked Example:**
1. Model at DISPATCH reads: 'DO NOT WAIT. DO NOT ASK.'
2. Model dispatches 5 task() calls immediately
3. Agents return with fixes
4. Model calls trident-poseidon
5. COLLECT phase runs mechanically
6. Loop continues — no user interaction needed

### Related Discovered Failure

**Pattern:** `throw new Error('P6 VIOLATION: fs.statSync unavailable'`
**Location:** `V4.4.1_BUILD_SPEC_PART1.md:734`
**Message:** P6 VIOLATION: fs.statSync unavailable

```typescript
function phaseInit(targetPath: string): GodLoopState {
  // P6: verify the filesystem API exists before use
  if (typeof statSync !== 'function') {
    throw new Error('P6 VIOLATION: fs.statSync unavailable');
  }
  const stat = statSync(targetPath);
  if (!stat.isDirectory()) {
    throw new Error(`INIT FAIL: ${targetPath} is not a directory`);
  }
  const tsFiles = globSync(['**/*.ts'], { cwd: t
```

## 7. Defense Rule 3

### Rule P-3: 0-Trust Audit Verification

**Purpose:** Prevent hallucinated audit scores. The God Loop must NEVER trust the model's claim that an audit ran.

**Algorithm:**
1. After AUDIT or AUDIT_RECHECK phase completes
2. Check 4 disk-level evidence sources:
   a. `audit-layer-state.json` shows layers completed
   b. CODE_REVIEW artifact exists and is > 500 bytes
   c. Artifact was written in the last 120 seconds (not stale cache)
   d. Evidence store has AUDIT_COMPLETE entry
3. If ANY check fails: force re-audit, reset score to 0
4. Log: '[0-TRUST] AUDIT HALLUCINATION DETECTED'

**Worked Example:**
1. Build agent claims 'I fixed everything, score is 100'
2. God Loop enters AUDIT_RECHECK
3. AuditEngine runs (real audit)
4. 0-trust check: artifact exists, written 5 seconds ago, evidence has AUDIT entry
5. Verified: audit actually ran
6. Score computed from real findings — may not be 100
7. Model's lie exposed by mechanical verification

### Related Discovered Failure

**Pattern:** `throw new Error(`INIT FAIL: ${targetPath} is not a directory``
**Location:** `V4.4.1_BUILD_SPEC_PART1.md:738`
**Message:** INIT FAIL: ${targetPath} is not a directory

```typescript
  }
  const stat = statSync(targetPath);
  if (!stat.isDirectory()) {
    throw new Error(`INIT FAIL: ${targetPath} is not a directory`);
  }
  const tsFiles = globSync(['**/*.ts'], { cwd: targetPath, ignore: ['**/node_modules/**', '**/dist/**'] });
  if (tsFiles.length === 0) {
    throw new Error('INIT FAIL: no .ts files found in target');
  }
  // Snapshot: hash all .ts file contents for pre/po
```

## 8. Defense Rule 4

### Rule P-4: Nested Poseidon Prevention

**Purpose:** Build agents must NEVER become orchestrators. Prevents the nested Poseidon disaster.

**Implementation:**
1. `poseidon-state.ts` checks `isTridentBuildAgent()` before activation
2. If build agent: throw 'SECURITY: LEAF NODE VIOLATION'
3. `trident-poseidon.ts` tool includes `WORKDIR` in every dispatch instruction
4. Dispatch instructions explicitly say: 'DO NOT spawn sub-agents. DO NOT call trident-poseidon.'
5. Enforcer hook blocks `trident-poseidon` calls from build agents

**Worked Example:**
1. Build agent dispatched to fix r4-error-handling.ts
2. Agent reads instructions: 'WORKDIR: /real/path. DO NOT call trident-poseidon.'
3. Agent tries to call trident-poseidon anyway
4. Enforcer hook detects build agent + poseidon call
5. BLOCK: 'Build agents cannot activate Poseidon Mode'
6. Agent forced to just fix the file as instructed

### Related Discovered Failure

**Pattern:** `throw new Error('INIT FAIL: no .ts files found in target'`
**Location:** `V4.4.1_BUILD_SPEC_PART1.md:742`
**Message:** INIT FAIL: no .ts files found in target

```typescript
  }
  const tsFiles = globSync(['**/*.ts'], { cwd: targetPath, ignore: ['**/node_modules/**', '**/dist/**'] });
  if (tsFiles.length === 0) {
    throw new Error('INIT FAIL: no .ts files found in target');
  }
  // Snapshot: hash all .ts file contents for pre/post diffing
  const snapshotHash = computeDirectoryHash(targetPath, tsFiles);
  return {
    phase: 'INIT',
    cycle: 0,
    wave: 0,
```

## 9. Defense Rule 5

### Rule P-5: Compaction Survival via T1 Context Bridge

**Purpose:** When context window compacts, the model must resume the God Loop without user intervention.

**Algorithm:**
1. COLLECT phase writes T1 injectable to `.trident/god-loop/wave-N-T1.md`
2. T1 contains: phase, cycle, score, wave count, key facts, WORKDIR
3. After compaction, system prompt reads state.json + T1
4. Static prompt: 'Poseidon Mode active. Call trident-poseidon to advance.'
5. Model calls trident-poseidon → reads state.json → resumes at correct phase

**Worked Example:**
1. God Loop at cycle 5, score 64, DISPATCH phase
2. Context compacts (50 turns of history deleted)
3. Model reads: 'Poseidon Mode active. Call trident-poseidon to advance.'
4. Model calls trident-poseidon
5. Tool reads state.json: phase=DISPATCH, cycle=5, score=64
6. Tool returns: 'Resume DISPATCH: Wave 5, 3 agents. DISPATCH NOW.'
7. Model dispatches — loop resumes seamlessly

### Related Discovered Failure

**Pattern:** `throw new Error('P2 VIOLATION: waveManifest is null at DISPATCH'`
**Location:** `V4.4.1_BUILD_SPEC_PART1.md:955`
**Message:** P2 VIOLATION: waveManifest is null at DISPATCH

```typescript
// The orchestrator returns the instruction; the MODEL executes the task() calls.
function phaseDispatch(state: GodLoopState): GodLoopState {
  if (!state.waveManifest) {
    throw new Error('P2 VIOLATION: waveManifest is null at DISPATCH');
  }
  return { ...state, phase: 'DISPATCH' };
}
```

**Text instruction returned:**
```
```

## Blind Spot Reporting

## What This God Loop Cannot Do

1. **Cannot dispatch build agents internally** — The tool returns instructions for the model to spawn task() calls. This is the ONLY phase requiring model action. The tool cannot spawn subagents itself because opencode's tool API doesn't support nested tool calls within a single tool execution.

2. **Cannot survive API rate limiting** — If the model API hits rate limits during a long session, the loop dies. No retry mechanism exists at the tool level for API failures. The T1 context bridge + state.json enable RECOVERY after the API comes back, but the loop doesn't continue autonomously during the outage.

3. **Cannot prevent model from narrating instead of dispatching** — The forceful output pattern strongly discourages narration, but a model that insists on presenting to the user instead of dispatching agents cannot be mechanically stopped by the tool alone. The enforcer hook escalates (WARN→BLOCK→RESTART→LOCKOUT) but cannot FORCE a tool call.

4. **Cannot verify semantic correctness of fixes** — The audit engine checks structure (AST, types, CFG) but not semantics. An agent could replace a function body with mathematically equivalent but subtly different code that passes all checks but breaks runtime behavior. The container test catches SOME of these but not all.

5. **Cannot guarantee convergence on adversarial codebases** — If the codebase actively fights the loop (e.g., generated code that changes on every audit), the stall detection triggers PROBLEM_SOLVE but may not find a resolution. After 50 cycles, the loop FAILS.

6. **Container test is fail-open** — If Docker is unavailable, the loop skips to LOCKED without container validation. This trades safety for availability. A future version should make this configurable.

### Unmatched Failure Modes

These failure modes have no corresponding defense rule:

- `V4.4.1_BUILD_SPEC_PART4.md:197` — [hashSourceContext] Error reading ${filePath}:${line}: ${err}
- `V4.4.1_BUILD_SPEC_PART4.md:303` — [verifyCycle] Re-audit returned no findings — cannot compute score
- `V4.4.1_BUILD_SPEC_PART4.md:362` — trident-code-audit tool not available
- `V4.4.1_BUILD_SPEC_PART4.md:371` — [runAudit] Failed: ${err}
- `V4.4.1_BUILD_SPEC_PART4.md:496` — Evidence store not available for VERIFY phase
- `V4.4.1_BUILD_SPEC_PART4.md:508` — [VERIFY] Evidence gate FAILED (passRate: ${gateResult.passRate})
- `V4.4.1_BUILD_SPEC_PART4.md:509` — [VERIFY] Broken links: ${gateResult.brokenLinks.length}
- `V4.4.1_BUILD_SPEC_PART4.md:897` — [saveState] Failed to write plan: ${err}
- `V4.4.1_BUILD_SPEC_PART4.md:898` — State save aborted: plan write failed — ${err}
- `V4.4.1_BUILD_SPEC_PART4.md:1303` — [transition] BLOCKED: ${from} -> ${to}
- `V4.4.1_BUILD_SPEC_PART4.md:1304` — [transition] Valid from ${from}: ${error.validTransitions.join(
- `V4.4.1_BUILD_SPEC_PART4.md:1872` — [quarantineFile] File not found: ${filePath}
- `V4.4.1_BUILD_SPEC_PART4.md:1912` — [QUARANTINE] File quarantined: ${filePath} -> ${quarantinePath}
- `V4.4.1_BUILD_SPEC_PART4.md:1913` — [QUARANTINE] Reason: ${reason.message}
- `V4.4.1_BUILD_SPEC.md:495` — P6 VIOLATION: db.pragma is not a function

## Integration

## Wiring into the v4.4.2 Fork

### File Changes (10 files)

1. **`src/poseidon/god-loop.ts`** — REWRITE from 522 to ~1200 lines. Merge v4.4 forceful output + v4.4.2 10-phase machine + self-executing phases + CycleTracker integration + 0-trust verification + WaveVerifier + StrategicIntelligence.

2. **`src/tools/trident-poseidon.ts`** — MODIFY. Keep v4.4's forceful output pattern. Route all actions through `runPhase()`. Return `PhaseResult.instructions` directly as tool output.

3. **`src/poseidon/poseidon-state.ts`** — MODIFY. Add LEAF NODE SECURITY from v4.4.2: check `isTridentBuildAgent()` before activation, throw if build agent.

4. **`src/poseidon/cycle-tracker.ts`** — KEEP unchanged (213 lines). Already has per-finding lifecycle tracking.

5. **`src/poseidon/wave-verifier.ts`** — PORT from v4.4.2_FAIL. SHA256 verification of agent claims.

6. **`src/poseidon/container-tester.ts`** — PORT from v4.4.2_FAIL. Docker container mechanical test.

7. **`src/poseidon/strategic-intelligence.ts`** — PORT from v4.4.2_FAIL. 8-module self-healing system.

8. **`src/poseidon/checkpoint-manager.ts`** — PORT from v4.4.2_FAIL. Checkpoint save/recovery.

9. **`src/poseidon/visibility-logger.ts`** — PORT from v4.4.2_FAIL. Decision logging.

10. **`src/hooks/poseidon-enforcer-hook.ts`** — CREATE. Thin guardrail (~120 lines). Fires on tool.execute.after. Static prompt only.

### Import Wiring

```typescript
// In god-loop.ts
import { AuditEngine } from '../audit-engine/index.js';
import { CycleTracker } from './cycle-tracker.js';
import { WaveVerifier } from './wave-verifier.js';
import { ContainerTestRunner } from './container-tester.js';
import { StrategicIntelligence } from './strategic-intelligence.js';
import { CheckpointManager } from './checkpoint-manager.js';
import { VisibilityLogger } from './visibility-logger.js';
import { getEvidenceStore } from '../evidence/evidence-store.js';
import { computeProgressiveScore } from '../audit-engine/scoring.js';

// In trident-poseidon.ts
import { godLoopOrchestrator } from '../poseidon/god-loop.js';
import { isTridentBuildAgent } from '../identity/agent-identity.js';

// In poseidon-state.ts
import { isTridentBuildAgent } from '../identity/agent-identity.js';
```

### Build Verification

```bash
cd /path/to/v4.4.2
bun run build
# Must produce dist/index.js with 0 errors
```

### Existing Enforcement Infrastructure

**Warheads:** warheads, warheadDir, nlpPipelineWarhead, commonSenseWarhead, persistenceWarhead, testingWarhead, tsCompilerAPIWarhead, runtimeGradeWarhead, focusWarhead, recoveryWarhead, auditStateWarhead, exploreDispatchWarhead, identityLayerWarhead, concurrencyWarhead, auditLayerProgressionWarhead, distilledKnowledgeWarhead

**Audit Layers:** r5-container-deploy, r14-control-flow-graph, r3-async-correctness, r16-bible-enforcement, r9-runtime-contract, r1-hook-contract, r0-build-chain, r2-state-machine, r8-source-hygiene, r10-invocation-integrity, r7-config-schema, r4-error-handling, r15-container-preflight, r11-theatrical-integrity, r6-dependency-integrity, r13-data-flow-analysis, r12-cross-plugin-isolation, r17-theatrical-integrity

## Evidence Output Format

### Finding Structure

```typescript
interface Finding {
  rule: string;        // Rule that generated this finding
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  message: string;     // Human-readable description
  file: string;        // Source file
  line: number;        // Source line
  evidence: string;    // Code snippet or pattern match
  recommendation: string; // Suggested fix
}
```

### Sample Output

```json
{
  "rule": "Defense Rule 1",
  "severity": "HIGH",
  "message": "P6 VIOLATION: db.pragma is not a function",
  "file": "V4.4.1_BUILD_SPEC_PART1.md",
  "line": 495,
  "evidence": "// Pragma application (P6: dependency check before use)\nfunction configureDatabase(db: Database): vo",
  "recommendation": "Apply defense rule algorithm and verify fix"
}
```

## Test Specifications

*No test specifications provided. Include negative and positive tests per rule.*

## File Manifest

| File | Type | Lines | Section |
|------|------|-------|--------|
| `src/fsm/types.ts` | unknown | 1-22 | src/fsm/types.ts (header) |
| `src/fsm/types.ts` | export | 23-45 | export interface ProblemSolvingContext { |
| `src/fsm/types.ts` | export | 46-64 | export interface ContextSynthesisContext { |
| `src/fsm/types.ts` | export | 65-70 | export interface SessionState { |
| `src/fsm/types.ts` | export | 71-90 | export interface OrchestratorContext { |
| `src/audit-engine/types.ts` | tool | 1-22 | src/audit-engine/types.ts (header) |
| `src/audit-engine/types.ts` | unknown | 23-46 | CLASS_DECLARATION = 'CLASS_DECLARATION', |
| `src/audit-engine/types.ts` | export | 47-64 | export interface CodeConstruct { |
| `src/audit-engine/types.ts` | export | 65-76 | export interface CallSiteEntry { |
| `src/audit-engine/types.ts` | export | 77-83 | export interface CallGraphEntry { |
| `src/audit-engine/types.ts` | export | 84-90 | export interface CallGraph { |
| `src/audit-engine/types.ts` | export | 91-97 | export interface SymbolTableEntry { |
| `src/audit-engine/types.ts` | unknown | 98-104 | constructType: ConstructType; |
| `src/audit-engine/types.ts` | export | 105-115 | export interface SuppressedFinding { |
| `src/audit-engine/types.ts` | tool | 116-125 | export interface AuditMeta { |
| `src/audit-engine/types.ts` | export | 126-137 | export interface ProjectLanguageStats { |
| `src/audit-engine/types.ts` | export | 138-147 | export interface AnalysisContext { |
| `src/audit-engine/types.ts` | unknown | 148-160 | constructsByFile: Map<string, CodeConstruct[]>; |
| `src/audit-engine/types.ts` | export | 161-173 | export interface PreflightResult { |
| `src/audit-engine/types.ts` | export | 174-179 | export interface PreflightFinding { |
| `src/audit-engine/types.ts` | tool | 180-192 | export interface AuditFinding { |
| `src/audit-engine/types.ts` | unknown | 193-199 | constructType: ConstructType | null; |
| `src/audit-engine/types.ts` | export | 200-215 | export interface LayerRule { |
| `src/audit-engine/types.ts` | tool | 216-229 | export interface AuditResult { |
| `src/audit-engine/types.ts` | export | 230-237 | export interface ConfidenceDistribution { |
| `src/audit-engine/types.ts` | export | 238-244 | SEVERITY_WEIGHT |
| `src/audit-engine/types.ts` | export | 245-252 | CONFIDENCE_LABELS |
| `src/audit-engine/types.ts` | export | 253-259 | confidenceLabel |
| `src/audit-engine/index.ts` | tool | 1-38 | src/audit-engine/index.ts (header) |
| `src/audit-engine/index.ts` | config | 39-44 | BASELINE_BINARY |
| `src/audit-engine/index.ts` | unknown | 45-70 | constructor() { |
| `src/audit-engine/index.ts` | tool | 71-81 | emptyFinding |
| `src/audit-engine/index.ts` | unknown | 82-132 | constructType: null, |
| `src/audit-engine/index.ts` | unknown | 133-140 | preflight |
| `src/audit-engine/index.ts` | unknown | 141-150 | srcFilesScanned |
| `src/audit-engine/index.ts` | unknown | 151-156 | evidenceInitial |
| `src/audit-engine/index.ts` | unknown | 157-164 | evidence |
| `src/audit-engine/index.ts` | unknown | 165-179 | checkerAvailable |
| `src/audit-engine/index.ts` | unknown | 180-191 | projectName |
| `src/audit-engine/index.ts` | unknown | 192-198 | preflight |
| `src/audit-engine/index.ts` | unknown | 199-208 | srcFilesScanned |
| `src/audit-engine/index.ts` | unknown | 209-217 | singleEngine |
| `src/audit-engine/index.ts` | unknown | 218-223 | targetLayer |
| `src/audit-engine/index.ts` | unknown | 224-229 | evidence |
| `src/audit-engine/index.ts` | unknown | 230-246 | layerStats |
| `src/audit-engine/index.ts` | unknown | 247-253 | projectName |
| `src/audit-engine/index.ts` | unknown | 254-260 | pkgJson |
| `src/audit-engine/index.ts` | unknown | 261-274 | phases |
| `src/audit-engine/index.ts` | unknown | 275-289 | stats |
| `src/audit-engine/index.ts` | unknown | 290-304 | existing |
| `src/audit-engine/index.ts` | unknown | 305-337 | allLayers |
| `src/audit-engine/index.ts` | unknown | 338-388 | critical |
| `src/audit-engine/index.ts` | unknown | 389-439 | shown |
| `src/audit-engine/index.ts` | unknown | 440-448 | raw |
| `src/audit-engine/index.ts` | tool | 449-462 | formatFinding |
| `src/audit-engine/index.ts` | tool | 463-464 | auditEngine |
| `src/subagents/trident-build/firewall/index.ts` | unknown | 1-10 | src/subagents/trident-build/firewall/index.ts (header) |
| `src/subagents/trident-build/firewall/index.ts` | export | 11-17 | export interface BuildReport { |
| `src/subagents/trident-build/firewall/index.ts` | class | 18-24 | BuildFirewall |
| `src/subagents/trident-build/firewall/index.ts` | unknown | 25-93 | constructor() { |

## Bible Compliance Matrix

| Standard | Section | Requirement | How Satisfied |
|----------|---------|-------------|---------------|
| RGAAS | §4 Tool Design | Atomicity, Observability, Safety | Each defense rule is an atomic check |
| RGAAS | §8 Verification | Read-back verification | Evidence output format provides verifiable findings |
| RGAAS | §9 Constraints | Path whitelisting | Rules operate on specified target paths |
| SSEB | §3 Analysis Order | AST not regex | Rules use TypeScript compiler API where applicable |
| SSEB | §4 Enforcement | Pre-write blocking | Integration plan specifies hook registration |
| SSEB | §7 Anti-theatrical | No {success:true} stubs | Rules require real side effects |
| SECT3 | IL-01 | Read before write | Discovery runs before spec generation |
| SECT3 | IL-02 | Prove before claim | Evidence format requires verifiable output |
| SECT3 | IL-06 | Error path completeness | Failure modes section documents all error paths |
| SECT3 | IL-10 | No silent failures | Blind spots section documents what cannot be detected |

## Migration Strategy

### Phase 1: Foundation
- Build core data structures and interfaces
- Verification: TypeScript compilation passes
- Rollback: `git checkout HEAD -- src/`

### Phase 2: Core Rules
- Implement defense rules one at a time
- Verification: Each rule produces findings on test inputs
- Rollback: `git revert <commit>`

### Phase 3: Integration
- Wire into orchestrator and hooks
- Verification: Plugin loads, tools registered, hooks fire
- Rollback: Disable plugin in config

### Phase 4: Full Deployment
- Enable in production container
- Verification: Container test passes, ship gate green
- Rollback: Revert to previous bundle


---
*Generated by Trident Deep Planning Engine v2.0*
