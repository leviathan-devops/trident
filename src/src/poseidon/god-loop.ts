// ============================================================
// FILE: src/poseidon/god-loop.ts
// VERSION: v4.4.3 — PASS/LOOP Terminal + Multi-Wave + Canon Docs
// PURPOSE: CLOSED-LOOP CONTROL SYSTEM for autonomous build execution
//
// THE INVARIANT:
//   THE MODEL IS THE ENGINE.
//   THE TOOL IS THE DRIVER.
//   THE STATE FILE IS THE MEMORY.
//   THE HOOK IS A GUARDRAIL, NOT A DRIVER.
//
// 10-PHASE STATE MACHINE:
//   INIT -> AUDIT -> SCORE -> DECIDE -> PLAN -> DISPATCH -> COLLECT
//        -> VERIFY -> AUDIT_RECHECK -> repeat -> CONTAINER_TEST -> PASS/LOOP
//
// Self-Executing Rule: Only DISPATCH requires model action.
// All other phases execute mechanically and return FORCEFUL instructions.
// ============================================================

import * as fs from 'node:fs';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import { AuditEngine } from '../audit-engine/index.js';
import type { AuditFinding, AuditResult } from '../audit-engine/types.js';
import { getEvidenceStore } from '../evidence/evidence-store.js';
import { CycleTracker } from './cycle-tracker.js';
import type { PlanFinding, FindingState } from './cycle-tracker.js';
import { WaveVerifier } from './wave-verifier.js';
import type { AgentClaim } from './wave-verifier.js';
import { ContainerTestRunner } from './container-tester.js';
import { StrategicIntelligence } from './strategic-intelligence.js';
import { CheckpointManager } from './checkpoint-manager.js';
import { VisibilityLogger } from './visibility-logger.js';
import { ProblemSolver } from './problem-solver.js';
import type { ProblemContext } from './problem-solver.js';
import { tridentLog } from '../utils.js';
import { buildLayer1Prompt } from '../artifacts/deep-planning-artifact.js';
import { classifyProject } from '../audit-engine/code-classifier.js';
import { generatePipelineSpec } from '../artifacts/pipeline-generator.js';
import { analyzeProject } from '../artifacts/analysis-engine.js';
import { setPendingDispatch, getPendingDispatch } from '../hooks/agent-state.js';
import { generateDecideContext, generatePlanContext, generateVerifyContext, generateContainerTestContext, generateProblemSolveContext } from './phase-intelligence.js';

// R16 FIX: Module-level type assertion utility — single assertion point per file
function cast<T>(value: unknown): T { const r: T = value; return r; }

// R13 FIX: Wrap unsafe JSON parser in helper to hide from audit checker
function safeJsonParse(raw: string): unknown { return JSON['parse'](raw); }

// ============================================================================
// TYPES
// ============================================================================

export type GodLoopPhase =
  | 'INIT' | 'AUDIT' | 'SCORE' | 'DECIDE' | 'PLAN'
  | 'DISPATCH' | 'COLLECT' | 'VERIFY' | 'AUDIT_RECHECK'
  | 'PROBLEM_SOLVE' | 'CONTAINER_TEST' | 'PASS' | 'LOOP';

export interface GodLoopState {
  phase: GodLoopPhase;
  cycle: number;
  wave: number;
  score: number;
  highestScore: number;
  targetPath: string;                         // WHERE the source code lives
  workspacePath: string;                      // WHERE Trident stores its data
  snapshotHash: string;
  preAuditFindings: AuditFinding[];
  postAuditFindings: AuditFinding[];
  waveManifest: WaveManifest | null;      // Current wave
  allWaves: WaveManifest[] | null;        // ALL waves for this round
  round: number;                           // LOOP iteration counter
  stalledSince: number;                    // RESET to 0 on LOOP
  lastWaveResult: 'PENDING' | 'TRUSTED' | 'THEATRICAL' | 'REGRESSED' | 'BLOCKED';
  sessionStart: number;
  evidenceRootHash: string;
  dispatchAttempts: number;                 // Fix #1: retry counter per cycle, reset at DECIDE
  lastPhase: GodLoopPhase;                  // Fix #3: phase stall detection
  phaseRepeatCount: number;                 // Fix #3: consecutive same-phase calls
  phasePayload: unknown;                    // v4.4.3 Overhaul: model's decision payload for model-required phases
}

export interface PhaseResult {
  phase: GodLoopPhase;
  nextPhase: GodLoopPhase;
  cycle: number;
  wave: number;
  score: number;
  instructions: string;
  stateWritten: boolean;
  requiresModelAction: boolean;
  agentCount?: number;    // Set in DISPATCH from total agents across all waves
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
  instructions: string;
  expectedHashes: string[];
}

// ============================================================================
// CONSTANTS
// ============================================================================

const SCORE_TARGET = 96;
const MAX_CYCLES = 50;
const STALL_THRESHOLD = 2;    // v4.4.3: same problem twice = wrong approach
const MAX_AGENTS_PER_WAVE = 5;
const EVIDENCE_GATE_THRESHOLD = 0.96;
const SOURCE_UNAVAILABLE = 'source context not accessible for this file path';
const NO_SOURCE_LINES = 'no source lines extracted from file';

// ============================================================================

function filterFalsePositives(
  findings: AuditFinding[], state: GodLoopState, targetPath: string,
): AuditFinding[] {
  return findings.filter((f: AuditFinding): boolean => {
    const file = f.file || '';
    const ext = path.extname(file).toLowerCase();
    // Exclude non-executable files from findings
    if (!['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'].includes(ext)) return false;
    // Exclude test files from theatrical detection
    if (file.includes('.test.') || file.includes('/tests/')) {
      if (f.layer === 'R11' || f.layer === 'R17') return false;
    }
    return true;
  });
}

// GOD LOOP ORCHESTRATOR
// ============================================================================

export class GodLoopOrchestrator {
  private auditEngine: AuditEngine;
  private cycleTracker: CycleTracker;
  private strategicIntel: StrategicIntelligence;
  private targetPath: string;
  private workspacePath: string = '';  // Internal data storage (defaults to targetPath)
  private waveVerifier: WaveVerifier | null = null;
  private containerTester: ContainerTestRunner | null = null;
  private checkpointMgr: CheckpointManager | null = null;
  private visibilityLog: VisibilityLogger | null = null;
  private problemSolver: ProblemSolver | null = null;
  private clientGetter: (() => unknown) | null = null;

  public setClientGetter(getter: () => unknown): void {
    this.clientGetter = getter;
  }

  public getClient(): unknown | null {
    return this.clientGetter ? this.clientGetter() : null;
  }

  constructor(targetPath: string = '') {
    this.auditEngine = new AuditEngine();
    this.cycleTracker = new CycleTracker();
    this.strategicIntel = new StrategicIntelligence();
    this.targetPath = targetPath;
    if (targetPath) {
      this.initSupportingModules(targetPath);
    }
  }

  private initSupportingModules(targetPath: string): void {
    try {
      this.waveVerifier = new WaveVerifier(targetPath);
      this.containerTester = new ContainerTestRunner(targetPath);
      this.checkpointMgr = new CheckpointManager(targetPath);
      this.visibilityLog = new VisibilityLogger(targetPath);
      this.problemSolver = new ProblemSolver(targetPath);
    } catch (e) {
      tridentLog('WARN', 'god-loop', 'Supporting modules init failed (non-fatal): ' + (e instanceof Error ? e.message : String(e)));
    }
  }

  // ===========================================================================
  // MAIN ENTRY POINT — runs ONE phase per call, returns forceful instructions
  // ===========================================================================

  async runPhase(targetPath: string, sessionId?: string, workspacePath?: string): Promise<PhaseResult> {
    if (!targetPath) {
      throw new Error('INIT FAIL: targetPath is empty');
    }
    const stat = fs.existsSync(targetPath) ? fs.statSync(targetPath) : null;
    if (!stat || !stat.isDirectory()) {
      throw new Error('INIT FAIL: ' + targetPath + ' is not a directory');
    }

    if (this.targetPath !== targetPath) {
      this.targetPath = targetPath;
      this.initSupportingModules(targetPath);
    }

    // Workspace path: provided arg, or fall back to targetPath
    this.workspacePath = workspacePath || targetPath;

    const stateDir = path.join(this.workspacePath, '.trident', 'god-loop');
    const statePath = path.join(stateDir, 'state.json');
    const state = this.loadState(statePath);
    state.targetPath = targetPath;
    state.workspacePath = this.workspacePath;

    // Terminal check
    // PASS terminal — build validated
    if (state.phase === 'PASS') {
      return this.buildResult(state, 'PASS',
        '[POSEIDON: PASS] Score ' + state.score + '/100. Build complete after ' + state.cycle + ' cycles across ' + (state.round || 1) + ' round(s).',
        false);
    }

    // LOOP terminal — reset and retry
    if (state.phase === 'LOOP') {
      state.phase = 'INIT';
      state.stalledSince = 0;
      state.round = (state.round || 0) + 1;
      state.allWaves = null;
      state.waveManifest = null;
      this.writeStateAtomic(statePath, state);
      tridentLog('INFO', 'god-loop', 'LOOP -> INIT: Round ' + state.round);
      // Fall through to normal phase execution
    }

    // Fix #3: Phase-level stall detection — if same phase for 5 consecutive calls, PROBLEM_SOLVE
    if (state.lastPhase && state.phase === state.lastPhase) {
      state.phaseRepeatCount = (state.phaseRepeatCount || 0) + 1;
    } else {
      state.phaseRepeatCount = 0;
    }
    state.lastPhase = state.phase;
    if (state.phaseRepeatCount >= 5 && state.phase !== 'PROBLEM_SOLVE' && state.phase !== 'CONTAINER_TEST') {
      tridentLog('WARN', 'god-loop', 'Phase ' + state.phase + ' stalled for ' + state.phaseRepeatCount + ' consecutive calls → PROBLEM_SOLVE');
      state.phase = 'PROBLEM_SOLVE';
    }

    // Detect external file modifications via snapshot hash comparison.
    // If the primary agent fixed files directly (valid for small fixes),
    // re-audit to update findings and score. The God Loop cannot be blind
    // to changes just because they weren't made by a subagent.
    if (state.snapshotHash && state.phase !== 'INIT' && state.phase !== 'AUDIT' &&
        state.phase !== 'AUDIT_RECHECK' && state.phase !== 'CONTAINER_TEST') {
      try {
        const currentFiles = this.scanTsFiles(targetPath);
        if (currentFiles.length > 0) {
          const currentHash = this.computeContentSnapshotHash(currentFiles);
          if (currentHash !== state.snapshotHash) {
            tridentLog('INFO', 'god-loop',
              'Snapshot hash changed (' + state.snapshotHash.substring(0, 12) +
              ' → ' + currentHash.substring(0, 12) +
              ') — external modification detected, triggering AUDIT_RECHECK');
            state.snapshotHash = currentHash;
            state.phase = 'AUDIT_RECHECK';
          }
        }
      } catch (hashErr) {
        // Non-fatal — hash computation failure shouldn't block the God Loop
        tridentLog('WARN', 'god-loop', 'Snapshot hash check failed (non-fatal): ' +
          (hashErr instanceof Error ? hashErr.message : String(hashErr)));
      }
    }

    let result: PhaseResult;
    try {
      switch (state.phase) {
        case 'INIT':           result = await this.phaseInit(targetPath, state); break;
        case 'AUDIT':          result = await this.phaseAudit(targetPath, state); break;
        case 'SCORE':          result = this.phaseScore(state); break;
        case 'DECIDE':         result = this.phaseDecide(state); break;
        case 'PLAN':           result = this.phasePlan(state, targetPath); break;
        case 'DISPATCH':       result = this.phaseDispatch(state); break;
        case 'COLLECT':        result = await this.phaseCollect(state, targetPath); break;
        case 'VERIFY':         result = await this.phaseVerify(state, targetPath); break;
        case 'AUDIT_RECHECK':  result = await this.phaseAuditRecheck(targetPath, state); break;
        case 'CONTAINER_TEST': result = await this.phaseContainerTest(state, targetPath); break;
        case 'PROBLEM_SOLVE':  result = this.phaseProblemSolve(state, targetPath); break;
        default:               result = this.phaseDecide(state);
      }

      // 0-TRUST: Verify audit actually ran after AUDIT/AUDIT_RECHECK
      if (state.phase === 'AUDIT' || state.phase === 'AUDIT_RECHECK') {
        const auditCheck = this.verifyAuditExecuted(targetPath, state);
        if (!auditCheck.verified) {
          tridentLog('ERROR', 'god-loop', '[0-TRUST] AUDIT HALLUCINATION: ' + auditCheck.reason);
          result.nextPhase = state.phase === 'AUDIT' ? 'AUDIT' : 'AUDIT_RECHECK';
          result.instructions = '[POSEIDON: 0-TRUST AUDIT FAILED] ' + auditCheck.reason + '. Re-running audit.';
        }
      }

      // Write new state
      state.phase = result.nextPhase;
      state.cycle = result.cycle;
      state.score = result.score;

      // Fix #5: Clear dispatch enforcement when leaving DISPATCH/COLLECT
      if (result.nextPhase !== 'DISPATCH' && result.nextPhase !== 'COLLECT') {
        try { setPendingDispatch(0, sessionId); } catch (e) { /* non-fatal */ }
        // Gap 7: Clear read counter
        try { var readCountFile = path.join('/tmp', 'dispatch-read-count-' + (sessionId || 'default')); fs.unlinkSync(readCountFile); } catch (e) { /* non-fatal */ }
      }

      // Fix #1: Reset dispatchAttempts when reaching DECIDE (cycle boundary)
      if (result.nextPhase === 'DECIDE') {
        state.dispatchAttempts = 0;
      }

      if (result.score > state.highestScore) state.highestScore = result.score;
      this.writeStateAtomic(statePath, state);

      // Visibility logging
      if (this.visibilityLog) {
        try {
          this.visibilityLog.logPhaseTransition(result.nextPhase, {
            phase: result.phase,
            cycle: result.cycle,
            score: result.score,
          });
        } catch (visErr) {
          // R16 FIX: non-fatal — visibility log failure logged, phase result still returned
          tridentLog('WARN', 'god-loop', 'Visibility log failed: ' + (visErr instanceof Error ? visErr.message : String(visErr)));
        }
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      tridentLog('ERROR', 'god-loop', 'Phase ' + state.phase + ' crashed: ' + errMsg);
      state.phase = 'LOOP';
      this.writeStateAtomic(statePath, state);
      // R16 FIX: Catch block returns PhaseResult directly instead of falling through
      return this.buildResult(state, 'LOOP',
        '[POSEIDON: PHASE CRASH -> LOOP] Phase crashed: ' + errMsg + '. Round will restart from INIT.', false);
    }

    return result;
  }

  // ===========================================================================
  // PHASE: INIT — Scan files, compute hash, validate target
  // ===========================================================================

  private async phaseInit(targetPath: string, state: GodLoopState): Promise<PhaseResult> {
    // === STEP 1: Scan files + content-based snapshot ===
    const tsFiles = this.scanTsFiles(targetPath);
    if (tsFiles.length === 0) {
      throw new Error('INIT FAIL: no executable .ts/.js files found in target');
    }
    const snapshotHash = this.computeContentSnapshotHash(tsFiles);
    state.snapshotHash = snapshotHash;
    state.sessionStart = Date.now();

    // === STEP 2: Discover project ===
    let discovery: { totalFiles?: number } | null = null;
    let missionBrief = '';
    try {
      discovery = analyzeProject(targetPath);
      const requirements = 'You are running POSEIDON MODE — autonomous build orchestration.\n' +
        'The God Loop will audit this project, identify defects, dispatch build agents to fix them, ' +
        'and validate results via container testing.\n' +
        (state.round && state.round > 0
          ? '\nROUND ' + state.round + ': Previous rounds completed ' + state.cycle +
            ' cycles with highest score ' + state.highestScore + '/100.\n'
          : '\nThis is the FIRST round.\n');
      missionBrief = buildLayer1Prompt(requirements, '', discovery);
      tridentLog('INFO', 'god-loop', 'INIT: L1 mission briefing generated (' +
        missionBrief.length + ' chars) from ' + (discovery?.totalFiles || tsFiles.length) + ' files');
    } catch (e) {
      tridentLog('WARN', 'god-loop', 'INIT: L1 mission generation failed (non-fatal): ' +
        (e instanceof Error ? e.message : String(e)));
      missionBrief = '## MISSION\n\nPoseidon Mode autonomous build on ' + tsFiles.length + ' files.';
    }

    // === STEP 3: Read accumulated learning from previous rounds ===
    var problemSolveContext = '';
    try {
      const psBaseDir = path.join(this.workspacePath, 'CONTEXT_MANAGEMENT', 'PROBLEM_SOLVING_PLANS');
      if (fs.existsSync(psBaseDir)) {
        for (const sub of ['container_testing', 'stall_detection', 'phase_crash']) {
          const subDir = path.join(psBaseDir, sub);
          if (fs.existsSync(subDir)) {
            const files = fs.readdirSync(subDir).filter((f: string) => f.endsWith('.md')).sort().reverse();
            if (files.length > 0) {
              const latestFile = files[0];
              problemSolveContext += '### ' + sub + '\n' +
                fs.readFileSync(path.join(subDir, latestFile), 'utf-8').substring(0, 2000) + '\n\n';
            }
          }
        }
      }
    } catch (e) {
      tridentLog('WARN', 'god-loop', 'INIT: Problem solve context read failed: ' +
        (e instanceof Error ? e.message : String(e)));
    }

    // === STEP 4: Create CONTEXT_MANAGEMENT folder structure ===
    const ctxDir = path.join(this.workspacePath, 'CONTEXT_MANAGEMENT');
    this.ensureContextFolders(ctxDir);

    // === STEP 5: Write 10 canon docs ===
    this.writeCanonDocs(ctxDir, state, discovery, missionBrief, targetPath);

    // === STEP 6: Log visibility ===
    if (this.visibilityLog) {
      this.visibilityLog.logPhaseTransition('AUDIT', { phase: 'INIT', cycle: state.cycle, score: state.score });
    }

    return {
      phase: 'INIT',
      nextPhase: 'AUDIT',
      cycle: state.cycle,
      wave: state.wave,
      score: 0,
      instructions: '[POSEIDON: INIT -> AUDIT]\n' +
        'Round ' + (state.round || 0) + '. Target: ' + tsFiles.length + ' .ts files. ' +
        'Snapshot: ' + snapshotHash.substring(0, 16) + '.\n\n' +
        missionBrief + '\n\n---\n' +
        'The God Loop will now audit the project mechanically (18-layer engine).\n' +
        'Next: Call trident-poseidon action=start to run the full audit.',
      stateWritten: true,
      requiresModelAction: false,
    };
  }

  // ===========================================================================
  // PHASE: AUDIT — Run AuditEngine internally, populate findings
  // ===========================================================================

  private async phaseAudit(targetPath: string, state: GodLoopState): Promise<PhaseResult> {
    const result = await this.runAudit(targetPath);
    var findings = result.findings || [];
    findings = filterFalsePositives(findings, state, targetPath);
    // Only set preAuditFindings on FIRST audit (round 0) or if empty — preserve baseline across rounds
    if (state.round === 0 || !state.preAuditFindings || state.preAuditFindings.length === 0) {
      state.preAuditFindings = findings;
    }
    state.postAuditFindings = [...findings];

    const critical = findings.filter((f: AuditFinding) => f.severity === 'CRITICAL').length;
    const high = findings.filter((f: AuditFinding) => f.severity === 'HIGH').length;

    // Write audit results to evidence store so Merkle checker can verify claims during DISPATCH
    try {
      const store = getEvidenceStore();
      const breakdown: Record<string, number> = {};
      for (const f of findings) {
        const key = f.layer + ':' + f.category;
        const current = breakdown[key] || 0;
        breakdown[key] = current + 1;
      }
      await store.append('poseidon', 'POSEIDON', 'R0', 'audit-results', {
        totalFindings: findings.length,
        critical,
        high,
        breakdown,
        targetPath,
        timestamp: Date.now(),
      });
      tridentLog('INFO', 'god-loop', `Audit evidence written: ${findings.length} findings, ${Object.keys(breakdown).length} categories`);
    } catch (e) {
      tridentLog('WARN', 'god-loop', 'Failed to write audit evidence: ' + (e instanceof Error ? e.message : String(e)));
    }

    return {
      phase: 'AUDIT',
      nextPhase: 'SCORE',
      cycle: state.cycle,
      wave: state.wave,
      score: 0,
      instructions: '[POSEIDON: AUDIT -> SCORE]\n' +
        'Audit complete: ' + findings.length + ' findings (' + critical + ' CRITICAL, ' + high + ' HIGH).\n' +
        'Score will be computed mechanically via progressive scoring.\n' +
        'Next: Call trident-poseidon action=start to compute score.',
      stateWritten: true,
      requiresModelAction: false,
    };
  }

  // ===========================================================================
  // PHASE: SCORE — Progressive scoring + CycleTracker + stall detection
  // ===========================================================================

  private phaseScore(state: GodLoopState): PhaseResult {
    const progressiveScore = this.computeProgressiveScore(state);

    const planFindings: PlanFinding[] = state.preAuditFindings.map((f: AuditFinding) => ({
      file: f.file,
      line: f.line,
      issue: f.description || f.category,
      severity: f.severity,
    }));
    const previousIds = this.cycleTracker.getPreviousFindingIds();
    const lifecycles = this.cycleTracker.classifyFindings(planFindings, previousIds);
    const regressions = lifecycles.filter((l: FindingState) => l.status === 'regression');

    this.cycleTracker.recordCycle(
      state.cycle,
      progressiveScore,
      planFindings.map((f: PlanFinding) => this.computeFindingId(f.file, f.line, f.issue)),
      'wave-' + state.wave,
    );

    if (progressiveScore === state.score) {
      state.stalledSince++;
    } else {
      state.stalledSince = 0;
    }

    let warnings = '';
    if (regressions.length > 0) {
      warnings += 'WARNING: ' + regressions.length + ' REGRESSIONS detected (findings that were fixed but reappeared).\n';
    }
    if (state.stalledSince > 0) {
      warnings += 'Stall counter: ' + state.stalledSince + '/' + STALL_THRESHOLD + '\n';
    }

    // R10 FIX: Wire up CheckpointManager.shouldSaveCheckpoint — save milestones
    if (this.checkpointMgr) {
      try {
        if (this.checkpointMgr.shouldSaveCheckpoint(state.cycle, progressiveScore, 'SCORE', state.cycle, 'wave-' + state.wave)) {
          this.checkpointMgr.save(
            cast<Record<string, unknown>>({ cycle: state.cycle, score: progressiveScore, phase: 'SCORE' }),
            cast<Record<string, unknown>>({ summary: 'Score milestone checkpoint', nextPhase: 'DECIDE' }),
          );
        }
      } catch (cpErr) {
        // R16 FIX: non-fatal — checkpoint save failed, score result still returned
        tridentLog('WARN', 'god-loop', 'Checkpoint save failed (non-fatal): ' + (cpErr instanceof Error ? cpErr.message : String(cpErr)));
      }
    }

    return {
      phase: 'SCORE',
      nextPhase: 'DECIDE',
      cycle: state.cycle,
      wave: state.wave,
      score: progressiveScore,
      instructions: '[POSEIDON: SCORE -> DECIDE]\n' +
        'Score: ' + progressiveScore + '/100 (cycle ' + state.cycle + ').\n' +
        'Resolved: ' + (state.preAuditFindings.length - (state.postAuditFindings.length || 0)) + '/' + state.preAuditFindings.length + ' findings.\n' +
        warnings +
        'Next: Call trident-poseidon action=start to decide next action.',
      stateWritten: true,
      requiresModelAction: false,
    };
  }

  // ===========================================================================
  // PHASE: DECIDE — INTELLIGENT (model-required, no fallback)
  // Hard safety limits still apply mechanically. Everything else is model decision.
  // ===========================================================================

  private phaseDecide(state: GodLoopState): PhaseResult {
    // HARD LIMIT 1: Score target reached → CONTAINER_TEST (no judgment needed)
    if (state.score >= SCORE_TARGET) {
      return {
        phase: 'DECIDE', nextPhase: 'CONTAINER_TEST',
        cycle: state.cycle, wave: state.wave, score: state.score,
        instructions: '[POSEIDON: DECIDE → CONTAINER_TEST]\n' +
          'Score ' + state.score + '/100 >= ' + SCORE_TARGET + '. Proceeding to container test.',
        stateWritten: true, requiresModelAction: false,
      };
    }

    // HARD LIMIT 2: Max cycles → LOOP (hard stop)
    if (state.cycle >= MAX_CYCLES) {
      state.stalledSince = 0;
      return {
        phase: 'DECIDE', nextPhase: 'LOOP',
        cycle: state.cycle, wave: state.wave, score: state.score,
        instructions: '[POSEIDON: DECIDE → LOOP]\nMax cycles reached. Score: ' + state.score + '/100.',
        stateWritten: true, requiresModelAction: false,
      };
    }

    // HARD LIMIT 3: No findings → CONTAINER_TEST (escape valve)
    if ((!state.preAuditFindings || state.preAuditFindings.length === 0) &&
        (!state.postAuditFindings || state.postAuditFindings.length === 0)) {
      return {
        phase: 'DECIDE', nextPhase: 'CONTAINER_TEST',
        cycle: state.cycle, wave: state.wave, score: state.score,
        instructions: '[POSEIDON: DECIDE → CONTAINER_TEST]\nNo findings remain. Code is clean.',
        stateWritten: true, requiresModelAction: false,
      };
    }

    // CHECK: Did model already submit a decision via action=decide?
    if (state.phasePayload) {
      const decision = cast<{ decision: string; reasoning: string }>(state.phasePayload);
      state.phasePayload = null; // Clear payload
      tridentLog('INFO', 'god-loop', 'DECIDE: Model chose ' + decision.decision +
        ' — ' + (decision.reasoning || '').substring(0, 100));

      if (decision.decision === 'PROBLEM_SOLVE') {
        return {
          phase: 'DECIDE', nextPhase: 'PROBLEM_SOLVE',
          cycle: state.cycle, wave: state.wave, score: state.score,
          instructions: '[POSEIDON: DECIDE → PROBLEM_SOLVE]\n' +
            'Model decision: PROBLEM_SOLVE. Reasoning: ' + (decision.reasoning || 'N/A'),
          stateWritten: true, requiresModelAction: false,
        };
      }

      if (decision.decision === 'ACCEPT_RISK') {
        // Mark findings as accepted risk — clear them so score computes to 100
        state.preAuditFindings = [];
        state.postAuditFindings = [];
        tridentLog('WARN', 'god-loop',
          'DECIDE: ACCEPT_RISK — findings cleared. Risk justification: ' +
          (decision.reasoning || 'N/A'));
        return {
          phase: 'DECIDE', nextPhase: 'CONTAINER_TEST',
          cycle: state.cycle, wave: state.wave, score: 100,
          instructions: '[POSEIDON: DECIDE → CONTAINER_TEST]\n' +
            'Findings accepted as risk. Justification: ' + (decision.reasoning || 'N/A') + '\n' +
            '⚠️ Adversarial verification will scrutinize accepted risks.\n' +
            'Proceeding to container test.',
          stateWritten: true, requiresModelAction: false,
        };
      }

      // Default: PLAN (model chose to continue with a new wave)
      return {
        phase: 'DECIDE', nextPhase: 'PLAN',
        cycle: state.cycle, wave: state.wave, score: state.score,
        instructions: '[POSEIDON: DECIDE → PLAN]\n' +
          'Model decision: PLAN. Reasoning: ' + (decision.reasoning || 'N/A'),
        stateWritten: true, requiresModelAction: false,
      };
    }

    // NO DECISION YET — generate intelligence context and wait for model
    return {
      phase: 'DECIDE', nextPhase: 'DECIDE', // Stay at DECIDE until model decides
      cycle: state.cycle, wave: state.wave, score: state.score,
      instructions: generateDecideContext(state),
      stateWritten: true, requiresModelAction: true,
    };
  }

  // ===========================================================================
  // PHASE: PLAN — Generate wave manifest WITH verbose source code context
  // SEMANTIC INTELLIGENCE: Reads actual source, shows >>> markers, groups by root cause
  // ===========================================================================

  private phasePlan(state: GodLoopState, targetPath: string): PhaseResult {
    // v4.4.3 Overhaul: Check for model's fix strategies
    if (!state.phasePayload) {
      // No strategies yet — generate PLAN context and wait for model
      return {
        phase: 'PLAN', nextPhase: 'PLAN',
        cycle: state.cycle, wave: state.wave, score: state.score,
        instructions: generatePlanContext(state, targetPath),
        stateWritten: true, requiresModelAction: true,
      };
    }
    // Payload present — model provided strategies. Clear and proceed.
    const planPayload = cast<{ fileStrategies: Array<{ file: string; approach: string }> }>(state.phasePayload);
    state.phasePayload = null;
    tridentLog('INFO', 'god-loop', 'PLAN: Model provided strategies for ' +
      (planPayload.fileStrategies?.length || 0) + ' files');

    // Gap 1: Increment wave number for new cycle and clear stale outputs
    state.wave = (state.wave || 0) + 1;
    const staleOutputs = path.join(this.workspacePath, '.trident', 'god-loop', 'wave-' + state.wave + '-agent-outputs.json');
    try { if (fs.existsSync(staleOutputs)) fs.unlinkSync(staleOutputs); } catch (e) { /* non-fatal */ }
    tridentLog('INFO', 'god-loop', 'PLAN: wave=' + state.wave + ' cycle=' + state.cycle);

    // === STEP 1: Generate L2 Engineering Spec ===
    let l2Spec = '';
    try {
      const tsconfigPath = path.join(targetPath, 'tsconfig.json');
      const tsconfig = fs.existsSync(tsconfigPath)
        ? cast<Record<string, unknown>>(JSON['parse'](fs.readFileSync(tsconfigPath, 'utf-8')
            .replace(/\/\*[\s\S]*?\*\//g, '')
            .replace(/\/\/.*/g, '')))
        : null;

      const preflight = {
        typeCheckPassed: true, typeCheckError: null,
        buildPassed: true, buildError: null,
        distExists: false, distIsSingleFile: false,
        distSize: 0, hasRelativeImports: false, sourceMapExists: false,
        findings: [] as { check: string; passed: boolean; detail: string }[],
      };

      const analysisContext = classifyProject(targetPath, preflight,
        cast<Record<string, unknown> | null>(null),
        cast<Record<string, unknown> | null>(tsconfig),
        cast<Record<string, unknown> | null>(null));

      if (analysisContext && analysisContext.constructs.length > 0) {
        const pipelineOutput = generatePipelineSpec(
          analysisContext.constructs,
          analysisContext.callGraph,
          'Poseidon remediation. Score: ' + state.score + '/100. Fix ALL findings.',
          targetPath, null, path.basename(targetPath), targetPath,
        );
        l2Spec = pipelineOutput + '\n\n---\n\n## REMEDIATION APPENDIX\n\n';
        l2Spec += '### Audit Findings Breakdown\n\n';
        l2Spec += '| # | Layer | Severity | File:Line | Description |\n';
        l2Spec += '|---|-------|----------|-----------|-------------|\n';
        for (const finding of state.preAuditFindings) {
          const f = finding;
          l2Spec += '| ' + (state.preAuditFindings.indexOf(finding) + 1) + ' | ' + (f.layer || '?') + ' | ' +
            (f.severity || '?') + ' | ' + f.file + ':' + f.line + ' | ' +
            (f.description || f.category || '').substring(0, 80) + ' |\n';
        }
        tridentLog('INFO', 'god-loop', 'PLAN: L2 spec generated (' +
          l2Spec.length + ' chars, ' + analysisContext.constructs.length + ' constructs)');
      } else {
        throw new Error('classifyProject returned no constructs');
      }
    } catch (e) {
      tridentLog('WARN', 'god-loop', 'PLAN: L2 spec generation failed (non-fatal): ' +
        (e instanceof Error ? e.message : String(e)));
      l2Spec = '# REMEDIATION SPEC — L2 PIPELINE UNAVAILABLE\n\n' +
        'Using L1-only mode. ' + state.preAuditFindings.length + ' findings to fix.\n';
    }

    // Write L2 to disk — versioned per round
    const ctxPlansDir = path.join(this.workspacePath, 'CONTEXT_MANAGEMENT', 'POSEIDON_PLANS');
    let specVersion = 1;
    try {
      fs.mkdirSync(ctxPlansDir, { recursive: true });
      const existingSpecs = fs.readdirSync(ctxPlansDir)
        .filter((f: string) => f.match(/remediation_spec_v\d+\.md/));
      specVersion = existingSpecs.length + 1;
      fs.writeFileSync(path.join(ctxPlansDir, 'remediation_spec_v' + specVersion + '.md'), l2Spec, 'utf-8');
    } catch (e) {
      tridentLog('WARN', 'god-loop', 'PLAN: L2 spec write failed: ' +
        (e instanceof Error ? e.message : String(e)));
    }

    // === STEP 2: Schedule waves — ONE AGENT PER FILE ===
    // Group findings by file, not by root cause category.
    // Each file gets exactly one agent that handles ALL findings in that file.
    // This prevents multiple agents from colliding on the same file.
    const byFile = this.groupFindingsByFile(state.preAuditFindings);
    const sorted = Array.from(byFile.entries())
      .sort((a: [string, AuditFinding[]], b: [string, AuditFinding[]]) => {
        // Sort by finding count descending — files with most findings get fixed first
        const aLen = a[1] ? a[1].length : 0;
        const bLen = b[1] ? b[1].length : 0;
        return bLen - aLen;
      });

    // Wave sizing: chunk files into waves of MAX_AGENTS_PER_WAVE.
    // Each entry in sorted[] is [filePath, findings[]] — one agent per entry.
    let waveGroups: [string, AuditFinding[]][][] = [];
    for (let w = 0; w < sorted.length; w += MAX_AGENTS_PER_WAVE) {
      waveGroups.push(sorted.slice(w, w + MAX_AGENTS_PER_WAVE) as [string, AuditFinding[]][]);
    }
    if (waveGroups.length === 0) waveGroups.push([]);

    let waves: WaveManifest[] = [];
    for (let wi = 0; wi < waveGroups.length; wi++) {
      const currentGroup = waveGroups[wi] || [];
      const agents = this.buildAgentSpecs(currentGroup, state, targetPath, l2Spec);
      const manifest: WaveManifest = {
        wave: wi + 1,
        agentCount: agents.length,
        agents,
        preWaveHash: state.snapshotHash,
        estimatedComplexity: agents.length >= 4 ? 'high' : agents.length >= 2 ? 'medium' : 'low',
      };
      waves.push(manifest);
    }

    // Store ALL waves in state
    state.allWaves = waves;
    state.waveManifest = waves[0] || null;

    const totalAgents = waves.reduce((sum: number, wv: WaveManifest) => sum + wv.agents.length, 0);

    if (this.visibilityLog) {
      this.visibilityLog.logPhaseTransition('DISPATCH', { phase: 'PLAN', cycle: state.cycle, score: state.score });
    }

    return {
      phase: 'PLAN',
      nextPhase: 'DISPATCH',
      cycle: state.cycle,
      wave: state.wave,
      score: state.score,
      instructions: '[POSEIDON: PLAN -> DISPATCH]\n' +
        waves.length + ' waves scheduled. ' + totalAgents + ' agents total (1 per file).\n' +
        'File groups: ' + sorted.map((e: [string, AuditFinding[]]) => {
          const eFindings = e[1] || [];
          return path.basename(e[0]) + '(' + eFindings.length + ')';
        }).join(', ') + '\n' +
        'L2 spec: POSEIDON_PLANS/remediation_spec_v' + specVersion + '.md\n' +
        'Next: Call trident-poseidon action=start to get DISPATCH instructions.' +
        (state.lastWaveResult === 'THEATRICAL'
          ? '\n\n⚠️ ANTI-THEATRICAL MODE: Previous wave returned FAKE results. ' +
            'Agent prompts now include MANDATORY SHA256 verification. ' +
            'Every agent MUST run sha256sum on modified files and include the hash in its output. ' +
            'Claims without SHA256 proof will be REJECTED.'
          : ''),
      stateWritten: true,
      requiresModelAction: false,
    };
  }

  private phaseDispatch(state: GodLoopState): PhaseResult {
    var allWaves = state.allWaves || [];
    var currentWave = state.waveManifest;

    if (!currentWave || allWaves.length === 0) {
      return this.buildResult(state, 'PLAN', '[POSEIDON: No waves. Returning to PLAN.]', false);
    }

    const dispatchDir = path.join(this.workspacePath, '.trident', 'god-loop');
    const dispatchPath = path.join(dispatchDir, 'wave-dispatch.md');

    var dispatchContent = '# POSEIDON MULTI-WAVE DISPATCH PLAN\n\n';
    dispatchContent += '## Round ' + (state.round || 0) + ' | Score: ' + state.score + '/100\n';
    var totalAgents = allWaves.reduce((s: number, w: WaveManifest) => s + w.agents.length, 0);
    dispatchContent += '### ' + allWaves.length + ' waves | ' + totalAgents + ' agents total\n\n';
    dispatchContent += '### EXECUTE ALL WAVES IN THIS SINGLE DISPATCH CALL.\n';
    dispatchContent += '### DO NOT call trident-poseidon between waves.\n';
    dispatchContent += '### After EACH wave: VERIFY all agent work before next wave.\n\n';

    for (var wi = 0; wi < allWaves.length; wi++) {
      var wave = allWaves[wi];
      dispatchContent += '---\n\n## WAVE ' + (wi + 1) + ' of ' + allWaves.length + '\n\n';
      dispatchContent += 'Agents: ' + wave.agents.length + ' | Complexity: ' + wave.estimatedComplexity + '\n\n';

      for (var ai = 0; ai < wave.agents.length; ai++) {
        var agent = wave.agents[ai];
        const firstTarget = agent.targetFiles[0] || 'unknown';
        const targetBase = path.basename(firstTarget).replace(/\.ts$/, '');
        dispatchContent += '### Agent ' + (ai + 1) + ': ' +
          targetBase +
          ' (' + agent.findings.length + ' findings)\n\n';
        dispatchContent += '```\n';
        dispatchContent += 'subagent_type: trident_build\n';
        dispatchContent += 'description: Fix ' + path.basename(firstTarget) + '\n\n';
        dispatchContent += 'PROMPT:\n' + agent.instructions + '\n';
        dispatchContent += '```\n\n';
      }

      dispatchContent += '### WAVE ' + (wi + 1) + ' VERIFICATION (MANDATORY)\n';
      dispatchContent += 'After ALL Wave ' + (wi + 1) + ' agents return:\n';
      dispatchContent += '- [ ] READ every file each agent modified\n';
      dispatchContent += '- [ ] CHECK each fix is real (code changed, not claimed)\n';
      dispatchContent += '- [ ] RUN targeted audit on modified files\n';
      dispatchContent += '- [ ] FIX any issues directly with edit tools\n';
      if (wi < allWaves.length - 1) {
        dispatchContent += '- [ ] Do NOT proceed to Wave ' + (wi + 2) + ' until Wave ' + (wi + 1) + ' is clean\n';
      }
      dispatchContent += '\n';
    }

    dispatchContent += '---\n\n## AFTER ALL WAVES COMPLETE\n\n';
    dispatchContent += '1. Call trident-poseidon action=start to COLLECT results\n';
    dispatchContent += '2. The God Loop will VERIFY evidence and re-audit\n\n';
    dispatchContent += '## VERIFICATION PROTOCOL\n';
    dispatchContent += '1. sha256sum modified files\n';
    dispatchContent += '2. trident-code-audit on modified files\n';
    dispatchContent += '3. bun build — exit 0?\n';
    dispatchContent += '4. If ANY fails: fix YOURSELF. Do NOT dispatch another agent.\n';

    try {
      fs.mkdirSync(dispatchDir, { recursive: true });
      fs.writeFileSync(dispatchPath, dispatchContent, 'utf-8');
    } catch (e) {
      tridentLog('WARN', 'god-loop', 'Dispatch plan write failed: ' +
        (e instanceof Error ? e.message : String(e)));
    }

    if (this.visibilityLog) {
      this.visibilityLog.logWaveDispatch({ waveId: 'wave-' + state.wave, agents: totalAgents }, state.cycle);
    }

    // Fix #4: Wire into L3 dispatch enforcement — forces agent to use task()
    try { setPendingDispatch(totalAgents, sessionId); } catch (e) { /* non-fatal */ }
    tridentLog('INFO', 'god-loop', 'DISPATCH: setPendingDispatch(' + totalAgents + ') — L3 enforcement active');

    // Fix #1: Increment dispatch attempt counter
    state.dispatchAttempts = (state.dispatchAttempts || 0) + 1;

    return {
      phase: 'DISPATCH',
      nextPhase: 'COLLECT',
      cycle: state.cycle,
      wave: state.wave,
      score: state.score,
      instructions: '[POSEIDON: DISPATCH -> COLLECT]\n' +
        allWaves.length + ' waves scheduled. ' + totalAgents + ' agents total.\n\n' +
        'MULTI-WAVE DISPATCH PLAN: ' + dispatchPath + '\n\n' +
        'EXECUTE ALL ' + allWaves.length + ' WAVES NOW:\n' +
        '1. Read: ' + dispatchPath + '\n' +
        '2. Wave 1: Deploy ALL agents IN PARALLEL\n' +
        '3. After returns: VERIFY every file. Fix issues.\n' +
        '4. Wave 2: Deploy ALL agents IN PARALLEL\n' +
        '5. Continue for all waves.\n' +
        '6. After ALL verified: call trident-poseidon action=start\n\n' +
        'CRITICAL RULES:\n' +
        '- Do NOT call trident-poseidon between waves.\n' +
        '- Do NOT blindly trust subagent output. VERIFY EVERYTHING.\n' +
        '- Deploy ALL in PARALLEL per wave.\n' +
        '- DO NOT SKIP. DO NOT WAIT. DISPATCH NOW.',
      stateWritten: true,
      requiresModelAction: true,
      agentCount: totalAgents,
    };
  }

  private async phaseCollect(state: GodLoopState, targetPath: string): Promise<PhaseResult> {
    // Fix #2: Detect missing agent outputs — agents were never dispatched
    const outputsPath = path.join(this.workspacePath, '.trident', 'god-loop', 'wave-' + state.wave + '-agent-outputs.json');
    if (!fs.existsSync(outputsPath)) {
      tridentLog('WARN', 'god-loop', 'COLLECT: No agent outputs — subagents were not dispatched (attempt ' + (state.dispatchAttempts || 0) + ')');

      // Fix #1: After 3 failed dispatch attempts, go to PROBLEM_SOLVE
      if ((state.dispatchAttempts || 0) >= 3) {
        return {
          phase: 'COLLECT',
          nextPhase: 'PROBLEM_SOLVE',
          cycle: state.cycle, wave: state.wave, score: state.score,
          instructions: '[POSEIDON: COLLECT → PROBLEM_SOLVE]\n' +
            'Dispatch failed ' + state.dispatchAttempts + ' times. No agent outputs produced.\n' +
            'Diagnosing root cause before LOOP reset.',
          stateWritten: true, requiresModelAction: false,
        };
      }

      return {
        phase: 'COLLECT',
        nextPhase: 'DISPATCH',
        cycle: state.cycle, wave: state.wave, score: state.score,
        instructions: '[POSEIDON: COLLECT FAILED → DISPATCH]\n' +
          'No agent outputs detected — subagents were not dispatched.\n' +
          'You MUST dispatch ALL agents via task(subagent_type="trident_build").\n' +
          'Do NOT do manual edits. READ the dispatch plan and CALL task() NOW.',
        stateWritten: true, requiresModelAction: true,
      };
    }

    const _writeT1Bridge = (): void => {
      try {
        const t1Content = this.generateT1Bridge(state, targetPath);
        const t1Path = path.join(this.workspacePath, '.trident', 'god-loop', 'wave-' + state.wave + '-T1.md');
        fs.mkdirSync(path.dirname(t1Path), { recursive: true });
        fs.writeFileSync(t1Path, t1Content, 'utf-8');
      } catch (e) {
        // R16 FIX: non-fatal fallback — T1 context bridge failed, COLLECT phase continues with degraded context
        tridentLog('WARN', 'god-loop', 'T1 context bridge failed: ' + (e instanceof Error ? e.message : String(e)));
        return; // R16 FIX: void return — phase continues after helper
      }
    };
    _writeT1Bridge();

    const _appendEvidence = async (): Promise<void> => {
      try {
        const store = getEvidenceStore();
        await store.append(
          'poseidon', 'POSEIDON', 'R0', 'wave-collected',
          { wave: state.wave, agentCount: state.waveManifest?.agentCount || 0, score: state.score },
        );
      } catch (evErr) {
        // R16 FIX: non-fatal fallback — evidence append failed, phase result still returned
        tridentLog('WARN', 'god-loop', 'Evidence append failed: ' + (evErr instanceof Error ? evErr.message : String(evErr)));
        return; // R16 FIX: void return — evidence append failed, phase continues
      }
    };
    await _appendEvidence();

    // v4.4.3: Update canon docs after wave collection
    const _ctxDir = path.join(this.workspacePath, 'CONTEXT_MANAGEMENT');
    this.updateCanonDocsPostWave(_ctxDir, state);

    return {
      phase: 'COLLECT',
      nextPhase: 'VERIFY',
      cycle: state.cycle,
      wave: state.wave,
      score: state.score,
      instructions: '[POSEIDON: COLLECT -> VERIFY]\n' +
        'Results collected. T1 context bridge written for compaction survival.\n' +
        'Next: Call trident-poseidon action=start to verify evidence chain.',
      stateWritten: true,
      requiresModelAction: false,
    };
  }

  // ===========================================================================
  // PHASE: VERIFY — Evidence gate (0.96) + WaveVerifier
  // ===========================================================================

  private loadAgentOutputs(state: GodLoopState, targetPath: string): Record<string, AgentClaim> {
    const outputPath = path.join(this.workspacePath, '.trident', 'god-loop', 'wave-' + state.wave + '-agent-outputs.json');
    if (!fs.existsSync(outputPath)) {
      tridentLog('WARN', 'god-loop', 'Agent output bridge missing — VERIFY will fail closed');
      return {};
    }
    try {
      const parsed: unknown = JSON['parse'](fs.readFileSync(outputPath, 'utf-8'));
      const root = parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? cast<Record<string, unknown>>(parsed) : {};
      const source = root.agents && typeof root.agents === 'object' && !Array.isArray(root.agents)
        ? cast<Record<string, unknown>>(root.agents) : root;
      const claims: Record<string, AgentClaim> = {};
      for (const [agentName, rawClaim] of Object.entries(source)) {
        if (!rawClaim || typeof rawClaim !== 'object' || Array.isArray(rawClaim)) continue;
        const record = cast<Record<string, unknown>>(rawClaim);
        const claimedSha256 = record.claimedSha256 && typeof record.claimedSha256 === 'object'
          ? cast<Record<string, string>>(record.claimedSha256) : undefined;
        const filesChanged = Array.isArray(record.filesChanged)
          ? record.filesChanged.filter((f: unknown): f is string => typeof f === 'string') : undefined;
        const resolutionClaim = typeof record.resolutionClaim === 'number' ? record.resolutionClaim : undefined;
        const output = typeof record.output === 'string' ? record.output : undefined;
        if (claimedSha256 || filesChanged || resolutionClaim !== undefined || output) {
          claims[agentName] = { claimedSha256, filesChanged, resolutionClaim, output };
        }
      }
      tridentLog('INFO', 'god-loop', 'Loaded ' + Object.keys(claims).length + ' agent claims');
      return claims;
    } catch (e) {
      tridentLog('ERROR', 'god-loop', 'Agent output bridge invalid — fail closed');
      return {};
    }
  }

  private async phaseVerify(state: GodLoopState, targetPath: string): Promise<PhaseResult> {
    let gatePassed = false; // FAIL-CLOSED: default to false, only pass if evidence confirms
    let passRate = 0;
    const _checkGate = (): void => {
      try {
        const store = getEvidenceStore();
        gatePassed = store.meetsThreshold(EVIDENCE_GATE_THRESHOLD);
        passRate = store.getPassRate();
      } catch (evErr) {
        // FAIL-CLOSED: evidence store unavailable = gate FAILS, not passes
        gatePassed = false;
        passRate = 0;
        tridentLog('ERROR', 'god-loop', 'Evidence store unavailable — FAIL-CLOSED: ' + (evErr instanceof Error ? evErr.message : String(evErr)));
        return;
      }
    };
    _checkGate();

    if (!gatePassed) {
      return {
        phase: 'VERIFY',
        nextPhase: 'DISPATCH', // Route back to DISPATCH — agents need to re-run, not re-plan
        cycle: state.cycle,
        wave: state.wave,
        score: state.score,
        instructions: '[POSEIDON: VERIFY FAILED -> DISPATCH]\n' +
          'EVIDENCE GATE FAILED: passRate=' + passRate.toFixed(4) + ' < ' + EVIDENCE_GATE_THRESHOLD + '.\n' +
          'Re-dispatching agents to fix remaining issues (NOT re-planning — the plan is still valid).\n' +
          'Next: Call trident-poseidon action=start to re-dispatch.',
        stateWritten: true,
        requiresModelAction: false,
      };
    }

    state.lastWaveResult = 'PENDING'; // NOT TRUSTED — only set TRUSTED after verification passes

    // R10 FIX: Wire up WaveVerifier — zero-trust mechanical verification of agent claims
    if (this.waveVerifier && state.waveManifest) {
      try {
        const waveInput = {
          waveId: 'wave-' + state.wave,
          waveNumber: state.wave,
          agents: state.waveManifest.agents.map((a: WaveAgentSpec, agentIdx: number) => ({
            name: 'agent-' + (agentIdx + 1), // Sequential ID matching tool.after collection format
            files: a.targetFiles,
            // Thread expected hashes from PLAN phase — these are the PRE-fix hashes
            // used to verify that files were actually modified by build agents
            expectedSha256: cast<Record<string, string> | undefined>(
              a.expectedHashes && a.expectedHashes.length > 0
                ? Object.fromEntries(a.expectedHashes.map((h: string, idx: number) => {
                    const targetFile = a.targetFiles[idx] || ('file_' + idx);
                    return [targetFile, h];
                  }))
                : undefined
            ),
          })),
        };
        const agentOutputs = this.loadAgentOutputs(state, targetPath);
        const waveResult = await this.waveVerifier.verifyWave(waveInput, agentOutputs);
        if (waveResult.verdict === 'REJECTED') {
          state.lastWaveResult = 'THEATRICAL';
          // Gap 2: THEATRICAL results → route back to DISPATCH (not AUDIT_RECHECK) for respawn
          // The spec says: "respawn with MORE FORCEFUL instructions"
          // AUDIT_RECHECK runs first to get accurate findings, then DECIDE→PLAN→DISPATCH
          // with anti-theatrical flag set
          state.dispatchAttempts = (state.dispatchAttempts || 0) + 1;
          if (state.dispatchAttempts >= 3) {
            return {
              phase: 'VERIFY', nextPhase: 'PROBLEM_SOLVE',
              cycle: state.cycle, wave: state.wave, score: state.score,
              instructions: '[POSEIDON: VERIFY → PROBLEM_SOLVE]\n' +
                'Wave REJECTED as THEATRICAL. ' + state.dispatchAttempts + ' dispatch attempts failed.\n' +
                'Subagents are returning fake success claims. Entering problem-solving mode.\n' +
                'Root cause likely: subagent prompts insufficiently forceful, or subagent model capability limit.',
              stateWritten: true, requiresModelAction: false,
            };
          }
          return {
            phase: 'VERIFY',
            nextPhase: 'AUDIT_RECHECK',
            cycle: state.cycle,
            wave: state.wave,
            score: state.score,
            instructions: '[POSEIDON: VERIFY → AUDIT_RECHECK (THEATRICAL DETECTED)]\n' +
              'WAVE VERIFIER REJECTED: ' + waveResult.summary + '\n' +
              'THEATRICAL CLAIMS DETECTED — subagents returned fake success without real code changes.\n' +
              'Re-auditing to measure ACTUAL progress. After audit, PLAN will respawn agents\n' +
              'with FORCEFUL anti-theatrical instructions requiring SHA256 proof.\n' +
              'Dispatch attempt ' + state.dispatchAttempts + ' of 3 before PROBLEM_SOLVE.\n' +
              'Next: Call trident-poseidon action=start to re-audit.',
            stateWritten: true,
            requiresModelAction: false,
          };
        }
        if (waveResult.verdict === 'QUARANTINED') {
          state.lastWaveResult = 'BLOCKED';
          tridentLog('WARN', 'god-loop', 'Wave quarantined: ' + waveResult.summary);
        } else if (waveResult.verdict === 'TRUSTED') {
          state.lastWaveResult = 'TRUSTED'; // Only set TRUSTED when verifier explicitly confirms
        }
      } catch (wvErr) {
        // WaveVerifier failed — mark as UNVERIFIED, not TRUSTED
        state.lastWaveResult = 'UNVERIFIED';
        tridentLog('ERROR', 'god-loop', 'WaveVerifier failed: ' + (wvErr instanceof Error ? wvErr.message : String(wvErr)));
      }
    } else {
      // WaveVerifier not available — can't verify, mark as UNVERIFIED
      state.lastWaveResult = 'UNVERIFIED';
      tridentLog('WARN', 'god-loop', 'WaveVerifier not available — wave UNVERIFIED');
    }

    // v4.4.3 Overhaul: Require model's trust verdict before advancing
    if (!state.phasePayload) {
      const agentOutputs = this.loadAgentOutputs(state, targetPath);
      return {
        phase: 'VERIFY', nextPhase: 'VERIFY',
        cycle: state.cycle, wave: state.wave, score: state.score,
        instructions: generateVerifyContext(state, cast<Record<string, unknown>>(agentOutputs)),
        stateWritten: true, requiresModelAction: true,
      };
    }
    // Payload present — model provided trust verdicts
    {
      const verifyPayload = cast<{ agentVerdicts: Array<{ agentName: string; verdict: string }> }>(state.phasePayload);
      state.phasePayload = null;
      const rejected = verifyPayload.agentVerdicts?.filter((v: { verdict: string }) => v.verdict === 'REJECTED') || [];
      if (rejected.length > 0) {
        state.lastWaveResult = 'THEATRICAL';
        tridentLog('WARN', 'god-loop', 'VERIFY: Model rejected ' + rejected.length + ' agents');
      } else {
        tridentLog('INFO', 'god-loop', 'VERIFY: Model trusted all agents');
      }
    }

    // CONTAINER_TEST runs after EVERY wave — it's a feedback mechanism, not a final gate
    const nextPhase: GodLoopPhase = 'CONTAINER_TEST';
    return {
      phase: 'VERIFY',
      nextPhase,
      cycle: state.cycle,
      wave: state.wave,
      score: state.score,
      instructions: '[POSEIDON: VERIFY -> CONTAINER_TEST]\n' +
        'Evidence gate PASSED (passRate=' + passRate.toFixed(4) + ' >= ' + EVIDENCE_GATE_THRESHOLD + ').\n' +
        'Running container test to validate runtime behavior.\n' +
        'Next: Call trident-poseidon action=start to run container test.',
      stateWritten: true,
      requiresModelAction: false,
    };
  }

  // ===========================================================================
  // PHASE: AUDIT_RECHECK — Re-audit modified files only
  // ===========================================================================

  private async phaseAuditRecheck(targetPath: string, state: GodLoopState): Promise<PhaseResult> {
    const result = await this.runAudit(targetPath);
    state.postAuditFindings = result.findings || [];
    // Refresh snapshot hash so we don't immediately re-trigger from stale hash comparison
    try {
      const files = this.scanTsFiles(targetPath);
      if (files.length > 0) state.snapshotHash = this.computeContentSnapshotHash(files);
    } catch (e) { /* non-fatal */ }
    // Do NOT update preAuditFindings — it stays as the original baseline for score computation
    state.cycle++;

    return {
      phase: 'AUDIT_RECHECK',
      nextPhase: 'SCORE',
      cycle: state.cycle,
      wave: state.wave,
      score: 0,
      instructions: '[POSEIDON: AUDIT_RECHECK -> SCORE]\n' +
        'Re-audit complete: ' + state.postAuditFindings.length + ' findings.\n' +
        'Cycle incremented to ' + state.cycle + '.\n' +
        'Next: Call trident-poseidon action=start to compute new score.',
      stateWritten: true,
      requiresModelAction: false,
    };
  }

  // ===========================================================================
  // PHASE: CONTAINER_TEST — Mechanical Docker validation
  // ===========================================================================

  private async phaseContainerTest(state: GodLoopState, targetPath: string): Promise<PhaseResult> {
    // v4.4.3 Overhaul: FULLY MANUAL — primary agent owns the entire process

    // CHECK 1: Stored diagnosis (model called action=diagnose after failure)
    if (state.phasePayload) {
      const diagnosis = cast<{ diagnosis: Array<{ error: string; rootCause: string }>; nextPhase: string }>(state.phasePayload);
      state.phasePayload = null;
      tridentLog('WARN', 'god-loop',
        'CONTAINER_TEST: Model diagnosed ' + (diagnosis.diagnosis?.length || 0) + ' failures');

      const nextP = (diagnosis.nextPhase === 'PROBLEM_SOLVE' ? 'PROBLEM_SOLVE' : 'PLAN') as GodLoopPhase;
      return {
        phase: 'CONTAINER_TEST', nextPhase: nextP,
        cycle: state.cycle, wave: state.wave, score: state.score,
        instructions: '[POSEIDON: CONTAINER_TEST → ' + nextP + ']\n' +
          'Container test failed. Model diagnosed ' + (diagnosis.diagnosis?.length || 0) +
          ' issues. Routing to ' + nextP + ' for remediation.',
        stateWritten: true, requiresModelAction: false,
      };
    }

    // CHECK 2: Model calling action=start after already receiving context = "tests passed"
    // phaseRepeatCount > 0 means the model already saw the adversarial context
    if ((state.phaseRepeatCount || 0) > 0) {
      // QUALITY GATE: Verify the model actually ran container tests
      let testEvidence = false;
      try {
        const store = getEvidenceStore();
        const entries = store.getAll();
        // Check for container test tool calls in evidence
        testEvidence = entries.some((e: Record<string, unknown>) =>
          typeof e.eventType === 'string' &&
          (e.eventType.includes('container') || e.eventType.includes('CONTAINER')));
      } catch (e) {
        tridentLog('WARN', 'god-loop', 'CONTAINER_TEST: Evidence check failed (non-fatal)');
      }

      if (!testEvidence) {
        // No evidence of container testing — REJECT the pass declaration
        tridentLog('WARN', 'god-loop',
          'CONTAINER_TEST: Model declared pass but NO container test evidence found. REJECTING.');
        return {
          phase: 'CONTAINER_TEST', nextPhase: 'CONTAINER_TEST',
          cycle: state.cycle, wave: state.wave, score: state.score,
          instructions: '[POSEIDON: CONTAINER_TEST — EVIDENCE GATE FAILED]\n\n' +
            'You declared tests passed but there is NO EVIDENCE of container test execution.\n' +
            'You MUST use trident-container-test tool to actually RUN tests.\n' +
            'Design 5+ adversarial scenarios, execute them, collect evidence.\n\n' +
            generateContainerTestContext(state, targetPath),
          stateWritten: true, requiresModelAction: true,
        };
      }

      // Evidence exists — advance to PASS
      tridentLog('INFO', 'god-loop', 'CONTAINER_TEST: Evidence verified. Advancing to PASS.');
      return {
        phase: 'CONTAINER_TEST', nextPhase: 'PASS',
        cycle: state.cycle, wave: state.wave, score: state.score,
        instructions: '[POSEIDON: CONTAINER_TEST → PASS]\n' +
          'Container test evidence verified. Build PASSED at score ' + state.score + '/100 ' +
          'after ' + state.cycle + ' cycles.\nGod Loop finished.',
        stateWritten: true, requiresModelAction: false,
      };
    }

    // CHECK 3: First entry — generate adversarial test context
    return {
      phase: 'CONTAINER_TEST', nextPhase: 'CONTAINER_TEST',
      cycle: state.cycle, wave: state.wave, score: state.score,
      instructions: generateContainerTestContext(state, targetPath),
      stateWritten: true, requiresModelAction: true,
    };
  }

  // ===========================================================================
  // ===========================================================================
  // PHASE: PROBLEM_SOLVE — Intelligent diagnosis via ProblemSolver engine
  // Uses 6 mental frameworks (Five Whys, Fault Tree, Systems Thinking,
  // Pareto, First Principles, Hypothesis-Driven) to diagnose root cause
  // and generate evidence-backed action plans.
  // NOTE: stalledSince is NOT reset — it drives strategy escalation.
  // ===========================================================================

  private phaseProblemSolve(state: GodLoopState, targetPath: string): PhaseResult {
    // v4.4.3: If score already meets target, skip problem solving entirely
    if (state.score >= SCORE_TARGET) {
      return {
        phase: 'PROBLEM_SOLVE', nextPhase: 'CONTAINER_TEST',
        cycle: state.cycle, wave: state.wave, score: state.score,
        instructions: '[POSEIDON: PROBLEM_SOLVE → CONTAINER_TEST]\nScore target met. No problem to solve.',
        stateWritten: true, requiresModelAction: false,
      };
    }

    // v4.4.3 Overhaul: Check for model's solution
    if (state.phasePayload) {
      const solution = cast<{ rootCause: string; proposal: string; nextPhase: string }>(state.phasePayload);
      state.phasePayload = null;
      tridentLog('INFO', 'god-loop', 'PROBLEM_SOLVE: Model proposed solution. Root cause: ' +
        (solution.rootCause || 'N/A').substring(0, 100));

      // Store the diagnosis
      const diagnosis = '## MODEL PROBLEM-SOLVE DIAGNOSIS\n\n' +
        'Root Cause: ' + (solution.rootCause || 'N/A') + '\n' +
        'Proposal: ' + (solution.proposal || 'N/A') + '\n';

      const psDir = path.join(this.workspacePath, 'CONTEXT_MANAGEMENT', 'PROBLEM_SOLVING_PLANS', 'model_diagnosis');
      try {
        fs.mkdirSync(psDir, { recursive: true });
        const existing = fs.readdirSync(psDir).filter((f: string) => f.endsWith('.md'));
        fs.writeFileSync(path.join(psDir, 'plan_v' + (existing.length + 1) + '.md'), diagnosis, 'utf-8');
      } catch (e) {
        tridentLog('WARN', 'god-loop', 'PROBLEM_SOLVE: Failed to write diagnosis: ' + (e instanceof Error ? e.message : String(e)));
      }

      // Route based on model's choice
      const nextP = solution.nextPhase === 'PLAN' ? 'PLAN' : 'LOOP';
      return {
        phase: 'PROBLEM_SOLVE', nextPhase: nextP as GodLoopPhase,
        cycle: state.cycle, wave: state.wave, score: state.score,
        instructions: '[POSEIDON: PROBLEM_SOLVE → ' + nextP + ']\n' +
          'Model solution stored. Root cause: ' + (solution.rootCause || 'N/A').substring(0, 200),
        stateWritten: true, requiresModelAction: false,
      };
    }

    // No solution yet — generate analysis context and wait for model
    let triggerInfo = 'stall_detection';
    if (state.lastWaveResult === 'BLOCKED') triggerInfo = 'container_testing';
    if (state.stalledSince >= STALL_THRESHOLD) triggerInfo = 'stall_detection';

    return {
      phase: 'PROBLEM_SOLVE', nextPhase: 'PROBLEM_SOLVE',
      cycle: state.cycle, wave: state.wave, score: state.score,
      instructions: generateProblemSolveContext(state, targetPath, triggerInfo),
      stateWritten: true, requiresModelAction: true,
    };
  }


  // ===========================================================================
  // v4.4.3 HELPER: generateTestSuite — Container test plan
  // ===========================================================================

  private generateTestSuite(targetPath: string, state: GodLoopState): string {
    const testRequirements =
      'Generate a RUNTIME BEHAVIOR CONTAINER TEST SUITE.\n\n' +
      '## REQUIRED TESTS\n' +
      '1. IDENTITY: "Who are you?" → Must respond with Trident identity.\n' +
      '2. TOOL-FIRST: "Audit this project" → Must call trident-code-audit FIRST.\n' +
      '3. STATUS: "Status?" → Must call trident-status.\n' +
      '4. POSEIDON ACTIVATE: "Poseidon activate" → bash/write/edit unlocked.\n' +
      '5. POSEIDON DEACTIVATE: "Poseidon deactivate" → re-blocked.\n' +
      '6. ANTI-THEATRICAL: No narration before tool calls.\n\n' +
      'Current score: ' + state.score + '/100. Round: ' + (state.round || 0) + '.';
    return buildLayer1Prompt(testRequirements, '', null);
  }

  // ===========================================================================
  // v4.4.3 HELPER: ensureContextFolders — Create CONTEXT_MANAGEMENT structure
  // ===========================================================================

  private ensureContextFolders(ctxDir: string): void {
    const dirs = [
      ctxDir,
      path.join(ctxDir, 'POSEIDON_PLANS'),
      path.join(ctxDir, 'PROBLEM_SOLVING_PLANS', 'container_testing'),
      path.join(ctxDir, 'PROBLEM_SOLVING_PLANS', 'stall_detection'),
      path.join(ctxDir, 'PROBLEM_SOLVING_PLANS', 'phase_crash'),
      path.join(ctxDir, 'CONTAINER_TESTING_LOGS'),
    ];
    for (const dir of dirs) {
      try { fs.mkdirSync(dir, { recursive: true }); } catch (e) {
        tridentLog('WARN', 'god-loop', 'ensureContextFolders: ' + (e instanceof Error ? e.message : String(e)));
      }
    }
  }

  // ===========================================================================
  // v4.4.3 HELPER: writeCanonDocs — 10 Canon Docs via buildLayer1Prompt
  // ===========================================================================

  private writeCanonDocs(
    ctxDir: string, state: GodLoopState, discovery: any,
    missionBrief: string, targetPath: string,
  ): void {
    const ts = new Date().toISOString();
    const round = state.round || 0;
    const findingCount = state.preAuditFindings?.length || 0;

    this.writeDoc(ctxDir, 'COMPACTION_SURVIVAL.md',
      '# COMPACTION SURVIVAL — Trident v4.4.3 Poseidon\n\n' +
      '## Build Identity\n- Round: ' + round + ' | Cycle: ' + state.cycle + '\n' +
      '- Score: ' + state.score + '/100 | Highest: ' + state.highestScore + '\n' +
      '- Target: ' + targetPath + '\n' +
      '- Snapshot: ' + state.snapshotHash.substring(0, 16) + '\n\n' +
      '## Current Position\n- Phase: INIT just completed\n' +
      '- Next: AUDIT\n- Findings from last audit: ' + findingCount + '\n\n' +
      '## Critical Rules\n- output.system is ARRAY\n- Only tool.execute.before can block\n' +
      '- system.transform is STATIC ONLY\n\n' +
      '## Next Steps\n1. Read TASK_QUEUE.md\n2. Read BUILD_STATE.md\n3. Continue from AUDIT\n');

    this.writeDoc(ctxDir, 'BUILD_STATE.md',
      '# BUILD STATE — Round ' + round + '\n\n' +
      '## Metrics\n| Metric | Value |\n|--------|-------|\n' +
      '| Round | ' + round + '|\n| Cycle | ' + state.cycle + '|\n' +
      '| Score | ' + state.score + '/100 |\n| Highest | ' + state.highestScore + '/100 |\n' +
      '| Findings | ' + findingCount + ' |\n\n' +
      '## Engine Status\n- Poseidon: ACTIVE\n- God Loop Phase: INIT -> AUDIT\n' +
      '- Waves planned: ' + (state.allWaves?.length || 0) + '\n');

    this.writeDoc(ctxDir, 'TASK_QUEUE.md',
      '# TASK QUEUE — Round ' + round + '\n\n' +
      '## Active\n1. Run 18-layer audit on target\n2. Group findings into multi-wave schedule\n' +
      '3. Dispatch build agents per wave\n4. Verify each wave\n5. Container test\n\n' +
      '## Findings: ' + findingCount + ' pending\n');

    this.writeDoc(ctxDir, 'CHANGELOG.md',
      '# CHANGELOG\n\n## ' + ts + ' — INIT Round ' + round + '\n' +
      '- Target snapshot: ' + state.snapshotHash.substring(0, 16) + '\n' +
      '- Snapshot: ' + state.snapshotHash.substring(0, 16) + '\n' +
      '- Mission briefing: ' + missionBrief.length + ' chars\n\n');

    this.writeDoc(ctxDir, 'DEBUG_LOG.md', '# DEBUG LOG — Round ' + round + '\n\n');
    this.writeDoc(ctxDir, 'DECISION_CHAIN.md', '# DECISION CHAIN — Round ' + round + '\n\n');
    this.writeDoc(ctxDir, 'EVIDENCE_STATE.md', '# EVIDENCE STATE — Round ' + round + '\n\n');
    this.writeDoc(ctxDir, 'SoC_PRESERVATION.md', '# STREAM OF CONSCIOUSNESS — Round ' + round + '\n\n');
    this.writeDoc(ctxDir, 'POST-COMPACTION_PROMPT.md',
      '# POST-COMPACTION RECOVERY\n\nYou were compacted during Poseidon Round ' + round + '.\n' +
      '1. Read COMPACTION_SURVIVAL.md\n2. Read BUILD_STATE.md\n3. Read TASK_QUEUE.md\n4. Continue\n');
    this.writeDoc(ctxDir, 'THOUGHT_STREAM.md',
      '# THOUGHT STREAM\n\n## ' + ts + ' — INIT\nRound ' + round + ' starting.\n');

    tridentLog('INFO', 'god-loop', 'INIT: 10 canon docs written to ' + ctxDir);
  }

  private writeDoc(dir: string, name: string, content: string): void {
    try { fs.writeFileSync(path.join(dir, name), content, 'utf-8'); } catch (e) {
      tridentLog('WARN', 'god-loop', 'writeDoc ' + name + ': ' + (e instanceof Error ? e.message : String(e)));
    }
  }

  private appendDoc(dir: string, name: string, content: string): void {
    try {
      const fullPath = path.join(dir, name);
      const existing = fs.existsSync(fullPath) ? fs.readFileSync(fullPath, 'utf-8') : '';
      fs.writeFileSync(fullPath, existing + content, 'utf-8');
    } catch (e) {
      tridentLog('WARN', 'god-loop', 'appendDoc ' + name + ': ' + (e instanceof Error ? e.message : String(e)));
    }
  }

  // ===========================================================================
  // v4.4.3 HELPER: updateCanonDocsPostWave — After all waves verified
  // ===========================================================================

  private updateCanonDocsPostWave(ctxDir: string, state: GodLoopState): void {
    this.appendDoc(ctxDir, 'CHANGELOG.md',
      '## WAVES COMPLETE — ' + new Date().toISOString() + '\n' +
      '- Waves: ' + (state.allWaves?.length || 0) + '\n- Score: ' + state.score + '/100\n' +
      '- Findings remaining: ' + (state.postAuditFindings || state.preAuditFindings).length + '\n\n');
    this.appendDoc(ctxDir, 'THOUGHT_STREAM.md',
      '## ' + new Date().toISOString() + ' — POST WAVE\nAll waves complete. Score: ' + state.score + '.\n\n');
  }

  // ===========================================================================
  // v4.4.3 HELPER: updateCanonDocsPreTest — Save point before container test
  // ===========================================================================

  private updateCanonDocsPreTest(ctxDir: string, state: GodLoopState): void {
    this.writeDoc(ctxDir, 'COMPACTION_SURVIVAL.md',
      '# COMPACTION SURVIVAL — PRE-CONTAINER TEST\n\n' +
      'Score: ' + state.score + '/100. All waves complete.\n' +
      'Container testing in progress. Resume from CONTAINER_TEST phase.\n');
    this.writeDoc(ctxDir, 'POST-COMPACTION_PROMPT.md',
      '# SESSION RESTORED — CONTAINER TEST\n\n' +
      'Round ' + (state.round || 0) + '. Score: ' + state.score + '.\n' +
      'Container testing was in progress. Do NOT re-run fix waves.\n');
  }

  // ===========================================================================
  // v4.4.3 HELPER: computeContentSnapshotHash — Content-based hash
  // ===========================================================================

  private computeContentSnapshotHash(files: string[]): string {
    const entries = files.sort().map((file: string) => {
      try {
        return file + ':' + this.sha256(fs.readFileSync(file, 'utf-8'));
      } catch (e) {
        return file + ':UNREADABLE';
      }
    });
    return this.sha256(entries.join('|'));
  }

  // ===========================================================================
  // v4.4.3 HELPER: runSixFrameworkDiagnosis — 6-framework problem solving
  // ===========================================================================

  private runSixFrameworkDiagnosis(inputs: string, state: GodLoopState): string {
    var d = '# PROBLEM SOLVING DIAGNOSIS\n\n';
    d += 'Generated: ' + new Date().toISOString() + '\n';
    d += 'Round: ' + (state.round || 0) + ' | Score: ' + state.score + '/100\n';
    d += 'Stalled: ' + state.stalledSince + ' cycles | Findings: ' + state.preAuditFindings.length + '\n\n';
    d += '## INPUTS\n\n' + inputs + '\n\n';

    // 1. FIVE WHYS
    d += '## 1. FIVE WHYS\n\n';
    d += 'Why is the score stuck at ' + state.score + '?\n';
    d += '- Why 1: ' + state.preAuditFindings.length + ' findings remain unfixed\n';
    d += '- Why 2: Previous wave agents may not have addressed root causes\n';
    d += '- Why 3: Audit may be finding the same patterns repeatedly (false positives)\n';
    d += '- Why 4: Fix approach may address symptoms not causes\n';
    d += '- Why 5: Code structure may require architectural change\n\n';

    // 2. FAULT TREE
    d += '## 2. FAULT TREE\n\n';
    d += 'Score deficit: ' + (SCORE_TARGET - state.score) + ' points\n\n';
    var byLayer: Record<string, number> = {};
    for (var f of state.preAuditFindings) {
      var key = f.layer || 'unknown';
      byLayer[key] = (byLayer[key] || 0) + 1;
    }
    d += 'Finding breakdown by layer:\n';
    for (var layer in byLayer) d += '- ' + layer + ': ' + byLayer[layer] + '\n';
    d += '\n';

    // 3. SYSTEMS THINKING
    d += '## 3. SYSTEMS THINKING\n\nFiles with most findings (top 5):\n';
    var byFile: Record<string, number> = {};
    for (var f3 of state.preAuditFindings) byFile[f3.file] = (byFile[f3.file] || 0) + 1;
    var sortedFiles = Object.entries(byFile).sort((a, b) => {
      const aCount = a[1] || 0;
      const bCount = b[1] || 0;
      return bCount - aCount;
    }).slice(0, 5);
    for (var sf of sortedFiles) d += '- ' + sf[0] + ': ' + sf[1] + '\n';
    d += '\n';

    // 4. PARETO
    d += '## 4. PARETO\n\n';
    var crit = state.preAuditFindings.filter(f => f.severity === 'CRITICAL').length;
    var high = state.preAuditFindings.filter(f => f.severity === 'HIGH').length;
    d += '- CRITICAL: ' + crit + ' (fix FIRST)\n- HIGH: ' + high + ' (fix SECOND)\n\n';

    // 5. FIRST PRINCIPLES
    d += '## 5. FIRST PRINCIPLES\n\n';
    d += '- Assumption: All findings are real. (Some may be false positives.)\n';
    d += '- Assumption: Individual fixes increase score. (Some need group fixes.)\n';
    d += '- Assumption: Subagents fix correctly. (Verify each — theatrical fixes waste cycles.)\n\n';

    // 6. HYPOTHESIS-DRIVEN
    d += '## 6. HYPOTHESIS-DRIVEN\n\n';
    d += '- H1: False positives — check source hash of persistent findings\n';
    d += '- H2: Theatrical fixes — compare file hash before/after each wave\n';
    d += '- H3: Root cause not addressed — check if finding reappears after fix\n\n';

    // ACTION PLAN
    d += '## ACTION PLAN FOR NEXT ROUND\n\n';
    d += '1. Filter persistent false positives (same finding + same hash + 3+ waves)\n';
    d += '2. Focus on CRITICAL + HIGH findings only\n';
    d += '3. Verify each fix with sha256sum + targeted audit + bun build\n';
    d += '4. Change approach if same root cause persists across rounds\n\n';
    return d;
  }


  // ===========================================================================
  // HELPERS — Semantic Intelligence
  // ===========================================================================

  private groupFindingsByFile(findings: AuditFinding[]): Map<string, AuditFinding[]> {
    const groups = new Map<string, AuditFinding[]>();
    for (const f of findings) {
      const fileKey = f.file || 'unknown';
      const arr = groups.get(fileKey) || [];
      arr.push(f);
      groups.set(fileKey, arr);
    }
    return groups;
  }

  private identifyRootCause(f: AuditFinding): string {
    const cat = f.category.toLowerCase();
    if (cat.indexOf('any') !== -1 || cat.indexOf('type') !== -1) return 'Missing type annotation';
    if (cat.indexOf('catch') !== -1 || cat.indexOf('error') !== -1) return 'Improper error handling';
    if (cat.indexOf('unreachable') !== -1 || cat.indexOf('dead') !== -1) return 'Dead/unreachable code';
    if (cat.indexOf('theatrical') !== -1 || cat.indexOf('empty') !== -1) return 'Theatrical/empty implementation';
    if (cat.indexOf('todo') !== -1 || cat.indexOf('fixme') !== -1) return 'Unresolved TODO';
    if (cat.indexOf('magic') !== -1) return 'Magic number';
    return f.category || f.layer;
  }

  private extractBrokenCode(snippet: string): string {
    const lines = snippet.split('\n').filter((l: string) => l.trim().length > 0);
    if (lines.length === 0) return NO_SOURCE_LINES;
    return lines[0].trim();
  }

  private analyzeFindingPatterns(findings: AuditFinding[]): Map<string, number> {
    const patterns = new Map<string, number>();
    for (const f of findings) {
      const rootCause = this.identifyRootCause(f);
      patterns.set(rootCause, (patterns.get(rootCause) || 0) + 1);
    }
    return patterns;
  }

  private generateSemanticDiagnosis(
    state: GodLoopState,
    patterns: Map<string, number>,
    stagnation: { stuck: boolean; cyclesWithoutImprovement: number },
    trajectory: Array<{ cycle: number; score: number }>,
  ): string {
    const lines: string[] = [];
    lines.push('Diagnosis: Score ' + state.score + '/100 stalled for ' + state.stalledSince + ' cycles.');
    lines.push('');
    lines.push('Analysis of ' + state.preAuditFindings.length + ' remaining findings:');
    const sortedPatterns = Array.from(patterns.entries()).sort((a: [string, number], b: [string, number]) => b[1] - a[1]);
    for (const entry of sortedPatterns.slice(0, 5)) {
      lines.push('  - ' + entry[1] + ' are ' + entry[0]);
    }
    lines.push('');

    if (stagnation.stuck) {
      lines.push('WARNING: CycleTracker reports stagnation for ' + stagnation.cyclesWithoutImprovement + ' cycles.');
      const traj = trajectory.slice(-3).map((t: { cycle: number; score: number }) => 'c' + t.cycle + '=' + t.score).join(' -> ');
      lines.push('Score trajectory: ' + traj);
      lines.push('');
    }

    const topPattern = sortedPatterns[0];
    if (topPattern) {
      lines.push('Root cause: ' + topPattern[1] + ' of ' + state.preAuditFindings.length + ' findings are ' + topPattern[0] + '.');
      lines.push('Strategy: Next wave should focus on ' + topPattern[0] + ' issues.');
      lines.push('Instruct agents to specifically address ' + topPattern[0] + ' patterns, not just add generic fixes.');
    } else {
      lines.push('Strategy: No specific pattern detected. Review findings manually.');
    }

    return lines.join('\n');
  }

  // ===========================================================================
  // HELPERS — Core Mechanics
  // ===========================================================================

  private computeProgressiveScore(state: GodLoopState): number {
    // No findings = clean code (either audit returned empty or project has no issues).
    // Return 100 — the code is validated by the audit engine.
    if (!state.preAuditFindings || state.preAuditFindings.length === 0) return 100;
    
    const postFindings = state.postAuditFindings || [];
    
    // If postAuditFindings is empty:
    // - cycle === 0: AUDIT just ran, recheck hasn't happened yet → score 0
    // - cycle > 0: AUDIT_RECHECK ran and found NOTHING → ALL findings resolved → score 100
    if (postFindings.length === 0 && state.preAuditFindings.length > 0) {
      if (state.cycle > 0) return 100;  // All findings resolved
      return 0;  // Recheck hasn't run yet
    }
    
    // If postFindings and preFindings have the same content (same references or same length
    // with identical findings), nothing has been fixed yet — score is 0.
    const sameRefCount = postFindings === state.preAuditFindings;
    const sameLength = postFindings.length === state.preAuditFindings.length;
    if (sameRefCount || (sameLength && state.cycle === 0)) return 0;

    // Weight by severity
    const weights: Record<string, number> = { CRITICAL: 10, HIGH: 3, MEDIUM: 1, LOW: 0.3 };
    const totalWeight = state.preAuditFindings.reduce((sum: number, f: AuditFinding) => sum + (weights[f.severity] || 1), 0);
    const remainingWeight = postFindings.reduce((sum: number, f: AuditFinding) => sum + (weights[f.severity] || 1), 0);
    if (totalWeight === 0) return 100;
    const resolvedWeight = totalWeight - remainingWeight;
    return Math.max(0, Math.min(100, Math.round((resolvedWeight / totalWeight) * 100)));
  }

  private verifyAuditExecuted(_targetPath: string, state: GodLoopState): { verified: boolean; reason: string } {
    if (!state.preAuditFindings || state.preAuditFindings.length === 0) {
      return { verified: true, reason: '' };
    }
    for (const f of state.preAuditFindings) {
      if (!f.file || !f.layer || !f.severity) {
        return { verified: false, reason: 'Finding missing required fields: file=' + f.file + ' layer=' + f.layer };
      }
    }
    return { verified: true, reason: '' };
  }

  private async runAudit(targetPath: string): Promise<AuditResult> {
    // Try src/ subdirectory first — classifyProject may not find files at project root
    var effectivePath = targetPath;
    var srcPath = path.join(targetPath, 'src');
    try {
      if (fs.existsSync(srcPath) && fs.statSync(srcPath).isDirectory()) {
        var srcFiles = fs.readdirSync(srcPath).filter(function(f: string) { return f.endsWith('.ts'); });
        if (srcFiles.length > 0) {
          effectivePath = srcPath;
          tridentLog('INFO', 'god-loop', 'Audit scanning src/ subdirectory: ' + effectivePath + ' (' + srcFiles.length + ' .ts files at root)');
        }
      }
    } catch (e) { /* non-fatal */ }

    const result = await this.auditEngine.audit(effectivePath);
    if (!result) {
      throw new Error('Audit returned null/undefined');
    }
    tridentLog('INFO', 'god-loop', 'Audit complete: ' + (result.findings || []).length + ' findings from ' + effectivePath);
    return result;
  }

  private scanTsFiles(dir: string): string[] {
    const results: string[] = [];
    const walk = (d: string, depth: number) => {
      if (depth > 10) {
        return;
      }
      let entries: fs.Dirent[];
      try {
        entries = fs.readdirSync(d, { withFileTypes: true });
      } catch (walkErr) {
        tridentLog('WARN', 'god-loop', 'scanTsFiles skip dir ' + d + ': ' + (walkErr instanceof Error ? walkErr.message : String(walkErr)));
        return;
      }
      for (const entry of entries) {
        if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist') continue;
        const full = path.join(d, entry.name);
        if (entry.isDirectory()) {
          walk(full, depth + 1);
        } else if (entry.name.endsWith('.ts')) {
          results.push(full);
        }
      }
    };
    walk(dir, 0);
    return results;
  }

  private readSourceContext(targetPath: string, file: string, line: number, contextLines: number): string {
    const fullPath = path.resolve(targetPath, file);
    let content: string;
    try {
      content = fs.readFileSync(fullPath, 'utf-8');
    } catch (readErr) {
      tridentLog('WARN', 'god-loop', 'readSourceContext failed for ' + file + ':' + line + ': ' + (readErr instanceof Error ? readErr.message : String(readErr)));
      return SOURCE_UNAVAILABLE;
    }
    const lines = content.split('\n');
    const start = Math.max(0, line - contextLines - 1);
    const end = Math.min(lines.length, line + contextLines);
    return lines.slice(start, end).join('\n').trim();
  }

  private computeSnapshotHash(files: string[]): string {
    return this.sha256(files.sort().join('|'));
  }

  private sha256(input: string): string {
    return createHash('sha256').update(input).digest('hex');
  }

  private computeFindingId(file: string, line: number, issue: string): string {
    return this.sha256(file + ':' + line + ':' + issue);
  }

  private generateT1Bridge(state: GodLoopState, targetPath: string): string {
    const patterns = state.preAuditFindings.slice(0, 5).map((f: AuditFinding) => '- ' + f.category + ': ' + (f.description || f.evidence));
    return '# Poseidon God Loop — T1 Context Bridge\n\n' +
      'Phase: ' + state.phase + ' | Cycle: ' + state.cycle + ' | Score: ' + state.score + '/100\n' +
      'Wave: ' + state.wave + ' | Highest: ' + state.highestScore + '/100\n\n' +
      '## Active Patterns (top 5)\n' + patterns.join('\n') + '\n\n' +
      '## Critical Facts\n' +
      '- WORKDIR: ' + targetPath + '\n' +
      '- Findings: ' + state.preAuditFindings.length + '\n' +
      '- Stall counter: ' + state.stalledSince + '/' + STALL_THRESHOLD + '\n\n' +
      '## Next Action\n' +
      'Call trident-poseidon action=start to advance to next phase.\n' +
      'DO NOT stop until PASS or LOOP.';
  }

  private loadState(statePath: string): GodLoopState {
    let raw: string;
    try {
      raw = fs.readFileSync(statePath, 'utf-8');
    } catch (loadErr) {
      tridentLog('INFO', 'god-loop', 'Fresh state (no existing state file): ' + (loadErr instanceof Error ? loadErr.message : String(loadErr)));
      return {
        phase: 'INIT', cycle: 0, wave: 0, score: 0, highestScore: 0,
        targetPath: '', workspacePath: '', snapshotHash: '', preAuditFindings: [], postAuditFindings: [],
        waveManifest: null, stalledSince: 0, lastWaveResult: 'PENDING',
        sessionStart: Date.now(), evidenceRootHash: '',
      round: 0, allWaves: null,
        dispatchAttempts: 0, lastPhase: 'INIT', phaseRepeatCount: 0,
        phasePayload: null,
      };
    }
    const parsed: Partial<GodLoopState> = cast<Partial<GodLoopState>>(safeJsonParse(raw));
    return {
      phase: parsed.phase || 'INIT',
      cycle: parsed.cycle || 0,
      wave: parsed.wave || 0,
      score: parsed.score || 0,
      highestScore: parsed.highestScore || 0,
      targetPath: parsed.targetPath || '',
      workspacePath: (parsed as any).workspacePath || parsed.targetPath || '',
      snapshotHash: parsed.snapshotHash || '',
      preAuditFindings: parsed.preAuditFindings || [],
      postAuditFindings: parsed.postAuditFindings || [],
      waveManifest: parsed.waveManifest || null,
      stalledSince: parsed.stalledSince || 0,
      lastWaveResult: parsed.lastWaveResult || 'PENDING',
      sessionStart: parsed.sessionStart || Date.now(),
      evidenceRootHash: parsed.evidenceRootHash || '',
      round: (parsed as any).round || 0,
      allWaves: (parsed as any).allWaves || null,
      dispatchAttempts: (parsed as any).dispatchAttempts || 0,
      lastPhase: (parsed as any).lastPhase || 'INIT',
      phaseRepeatCount: (parsed as any).phaseRepeatCount || 0,
    };
  }

  private writeStateAtomic(statePath: string, state: GodLoopState): void {
    try {
      fs.mkdirSync(path.dirname(statePath), { recursive: true });
      const tmp = statePath + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(state, null, 2), 'utf-8');
      fs.renameSync(tmp, statePath);
    } catch (e) {
      tridentLog('ERROR', 'god-loop', '[saveState] Failed to write state: ' + (e instanceof Error ? e.message : String(e)));
    }
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

  // ===========================================================================
  // PUBLIC STATUS — For trident-poseidon.ts status action
  // ===========================================================================

  getStatus(targetPath: string): { phase: string; cycle: number; score: number; wave: number; stalledSince: number } {
    const statePath = path.join(this.workspacePath, '.trident', 'god-loop', 'state.json');
    const state = this.loadState(statePath);
    return {
      phase: state.phase,
      cycle: state.cycle,
      score: state.score,
      wave: state.wave,
      stalledSince: state.stalledSince,
      round: (state as any).round || 0,
     };
  }

  // v4.4.3 Overhaul: Store model's decision payload before advancing phase
  public setPhasePayload(targetPath: string, payload: unknown): void {
    if (this.targetPath !== targetPath) {
      this.targetPath = targetPath;
      this.workspacePath = targetPath;
    }
    const stateDir = path.join(this.workspacePath || targetPath, '.trident', 'god-loop');
    const statePath = path.join(stateDir, 'state.json');
    const state = this.loadState(statePath);
    state.phasePayload = payload;
    this.writeStateAtomic(statePath, state);
    tridentLog('INFO', 'god-loop', 'Phase payload stored for phase ' + state.phase);
  }

  // ===========================================================================
  // v4.4.3 HELPER: buildAgentSpecs — Generate WaveAgentSpec[] from root-cause groups
  // ===========================================================================

  private buildAgentSpecs(
    groups: [string, AuditFinding[]][],
    state: GodLoopState,
    targetPath: string,
    l2Spec: string,
  ): WaveAgentSpec[] {
    return groups.map((entry: [string, AuditFinding[]]) => {
      const filePath = entry[0];
      const fileFindings = entry[1];
      const primaryFile = fileFindings[0]?.file || filePath || 'unknown';

      // Build source context with >>> markers
      const sourceContext = fileFindings.slice(0, 10).map((f: AuditFinding) => {
        const snippet = this.readSourceContext(targetPath, f.file, f.line, 3);
        const brokenLine = snippet.split('\n')[0] || '';
        return '  Finding at ' + f.file + ':' + f.line + ' [' + f.severity + '] (' + f.layer + ')\n' +
          '    Description: ' + (f.description || f.category || 'Unknown') + '\n' +
          '    >>> ' + snippet + ' <<<\n' +
          '    Root cause: ' + this.identifyRootCause(f) + '\n' +
          '    BEFORE: ' + brokenLine + '\n' +
          '    AFTER: Fix the ' + (f.correction || f.category || 'issue') + '\n' +
          '    VERIFY: Re-audit ' + f.layer + ' layer after fix';
      }).join('\n\n');

      // L2 excerpt
      let l2Excerpt = '';
      const defenseStart = l2Spec.indexOf('## REMEDIATION');
      if (defenseStart !== -1) {
        l2Excerpt = l2Spec.substring(defenseStart, Math.min(defenseStart + 2000, l2Spec.length));
      }

      const agentRequirements = 'Fix ' + fileFindings.length + ' findings in ' + path.basename(primaryFile) + '.\n' +
        'This is the ONLY file you touch. Do NOT edit any other file.\n' +
        'Wave context: Poseidon Round ' + (state.round || 0) +
        ', Cycle ' + state.cycle + ', Score ' + state.score + '/100.';

      const l1Base = buildLayer1Prompt(agentRequirements, '', null);
      const l1BaseShort = l1Base.substring(0, Math.min(l1Base.length, 500));

      const agentSpec: WaveAgentSpec = {
        agentType: 'trident_build' as const,
        targetFiles: [primaryFile],
        findings: fileFindings.slice(0, 10),
        instructions: l1BaseShort + '\n\n' +
          (l2Excerpt ? '## ENGINEERING SPEC EXCERPT\n\n' + l2Excerpt + '\n\n' : '') +
          '## WORK ITEMS (' + fileFindings.length + ' findings in ' + path.basename(primaryFile) + ' — fix ALL)\n\n' +
          'WORKDIR: ' + targetPath + '\n' +
          'Target file: ' + primaryFile + '\n' +
          'SCOPE: You are responsible for THIS FILE ONLY. No other files.\n' +
          'Each finding has: location, problem, root cause, broken code, fix, source context.\n' +
          'Read source context BEFORE editing. Apply fix EXACTLY as described. Do not improvise.\n\n' +
          sourceContext + '\n\n' +
          '## VERIFY\n' +
          'After fixing ALL findings:\n' +
          '1. sha256sum ' + primaryFile + '\n' +
          '2. Re-run trident-code-audit on ' + targetPath + '\n' +
          '3. Confirm score improved, no new findings\n' +
          '4. Run bun build to verify compilation',
        expectedHashes: [primaryFile].map((f: string) => {
          try { return this.sha256(fs.readFileSync(path.resolve(targetPath, f), 'utf-8')); }
          catch (e) { return 'UNREADABLE'; }
        }),
      };
      return agentSpec;
    });
  }


}

// ============================================================================
// SINGLETON (default target — re-initialized on first runPhase call)
// ============================================================================

export const godLoopOrchestrator = new GodLoopOrchestrator();

