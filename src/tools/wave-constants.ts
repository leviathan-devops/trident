// src/tools/wave-constants.ts — the shared constants + the manifest contracts.
// THE WAVE DISPATCH OVERHAUL SPEC — Part 13.2 (the tmp-folder constants + the
// manifest shapes). NO dependencies — the foundation every wave module imports.

import * as path from 'node:path';
import * as os from 'node:os';

// THE SHARED TMP — the operator's naming (the conflict-free: NOT /tmp, NOT the
// project dir — the shared workspace tmp):
export const TRIDENT_TMP_DIR = path.join(
  os.homedir(), 'OPENCODE_WORKSPACE', 'trident-tmp',
);

// THE TMP-FOLDER OVERRIDE (the tests sandbox the writes; the container test
// points it at the container's workspace). An empty string falls back to the
// shared constant.
export function resolveTmpDir(override?: string | null): string {
  if (typeof override === 'string' && override.trim().length > 0) {
    return override.trim();
  }
  return TRIDENT_TMP_DIR;
}

// THE WAVE MANIFEST (the machine-readable record — the audit trail + the
// re-dispatch source):
export interface WaveManifest {
  wave: string;                          // "wave-<epoch-ms>"
  dispatchedAt: string;                  // the ISO timestamp
  agents: Array<{
    name: string;
    type: 'trident_explore' | 'trident_build';
    lines: number;
    sha256: string;
    sessionId?: string;                  // set by the spawn
    status: 'running' | 'spawn_failed';
    // THE GENERATION TELEMETRY (2026-08-09 — the forensics' fix #1: the
    // per-agent startedAt/finishedAt/durationMs make the async-parallel
    // generation PROVABLE in the output, not just claimed).
    startedAt?: string;                  // the ISO generation start
    finishedAt?: string;                 // the ISO generation end
    durationMs?: number;                 // the wall-clock generation time
  }>;
}

// THE DISPATCH RESULT (the immediate return shape):
export interface WaveDispatchResult {
  wave: string;
  dispatched: Array<{
    name: string;
    sessionId: string;
    type: 'trident_explore' | 'trident_build';
    status: 'running' | 'ready';       // 'ready' until the orchestrator's batch dispatch
  }>;
  failed: Array<{ name: string; error: string }>;
  tmpDir: string;
  checkIn: string;                       // the wave-row instruction (Part 3.5)
  // THE GENERATION TELEMETRY (2026-08-09 — the forensics' fix #1: the
  // per-agent startedAt/finishedAt/durationMs/status in the returned output
  // make the async-parallel generation mechanically provable).
  telemetry: Record<string, { startedAt: string; finishedAt?: string; durationMs?: number; status: 'ok' | 'failed' }>;
  // THE BATCH FORM (the generator-only contract — the orchestrator dispatches
  // this via the batch tool; the tool NEVER spawns). THE PROMPTFILE CHANNEL
  // (2026-08-09): the promptFile references the generated prompt's FILE — the
  // task tool loads the EXACT content (no reproduction, no condensation — the
  // [WAVE VERBATIM] SHA verification enforces it):
  batch: {
    tool: 'batch';
    parameters: {
      tools: Array<{
        tool: 'task';
        parameters: {
          description: string;
          prompt: string;
          subagent_type: string;
          promptFile?: string;
          background?: boolean;   // NEW (2026-08-12): always true — the background-only ruling
        };
      }>;
    };
  };
}

// THE WAVE-STATUS REPORT (Part 23.2 — the orchestrator's view):
export interface WaveStatusReport {
  wave: string;
  status: string;
  etaMs: number;
  etaConfidence: number;
  elapsedMs: number;
  agents: Array<Record<string, unknown>>;
  note?: string;
}

// THE TIER-1 SELF-INJECTION GUARD (Part 24): the reminders NEVER ride a shadow
// tool's result — a reminder on a shadow tool's output would pollute the
// pipeline's own data flow (the injection loop prevention).
export const SHADOW_TOOLS: ReadonlySet<string> = new Set([
  'trident-wave-manager', 'trident-wave-status',
  'trident-container-test', 'trident-ship-package', 'trident-code-audit',
  'trident-deep-planning', 'trident-context-synthesis', 'trident-problem-solving',
  'trident-poseidon', 'trident-gate', 'trident-status', 'trident-help',
  'trident-task-queue', 'trident-wave-probe',
]);

// THE COMPLETION DIRECTIVE (Part 5.4 + 11.1 — the identity's voice — the
// Steve Jobs / Poseidon energy — the handoff, never a summary-reader).
export function buildCompletionDirective(wave: string, count: number): string {
  return 'WAVE ' + wave + ' COMPLETE — all ' + count + ' agents returned. THE RESULTS ARE YOUR RAW MATERIAL.\n' +
    '1. COLLECT the final messages from the child sessions NOW — evidence first, claims never. Every result carries its acceptance criteria.\n' +
    '2. AUDIT each result against the wave\'s criteria — a failing result is a BROKEN AGENT, flagged with the evidence structure, never a partial success. COMPLETION IS THE ONLY ACCEPTABLE STATE.\n' +
    '3. APPLY the results to the build — the integration is YOUR work. NO APPROVAL GATES FOR REQUIRED WORK. The build advances NOW.\n' +
    '4. ADVANCE the plan — close the wave row, open the next task. A senior engineer does not negotiate with scope.\n' +
    'THE FILES ARE THE ONLY GROUND TRUTH. The wave was the STEP — the build is the mission. MOVE.';
}

// THE KILL-RESPAWN DIRECTIVE (Part 5.3 + 11.1 — the tier-2 text).
// THE INVESTIGATE REWORD (2026-08-12 — the operator: 'just say investigate the
// agent is smart enough to know what to do'): the directive names the evidence
// and hands the DECISION to the orchestrator — kill + respawn, steer, or wait.
// The cron is the DETECTOR; the orchestrator OWNS the decision (never auto-kill).
export function buildKillDirectiveText(
  wave: string, patternId: string, agent: string, evidence: string, sessionId: string,
): string {
  return 'WAVE ' + wave + ' — ' + patternId + ' for ' + agent + ': ' + evidence +
    '. INVESTIGATE — the wave is BLOCKED until this agent is terminal. Decide: ' +
    'kill + respawn (wave-status kill → wave manager waveId respawn), steer ' +
    '(trident-wave-steer — session ' + sessionId + '), or wait. The evidence: ' +
    'the stream tail + the reasoning trace (wave-status sessionId=' + sessionId + ').';
}

// THE ORCHESTRATOR-ABORT DIRECTIVE (Part 23.1 — the wave-status kill path):
export function buildOrchestratorAbortDirective(wave: string, agent: string, sessionId: string): string {
  return 'WAVE ' + wave + ' — ORCHESTRATOR_ABORT for ' + agent + '. KILLED per the ' +
    'orchestrator. RESPAWN via trident-wave-manager (the same agent entry + waveId ' +
    wave + ') — the memory rows carry the prompt.';
}

// THE WAVE-ABORTED DIRECTIVE (Part 23.1 — the kill-wave path):
export function buildWaveAbortedDirective(wave: string, count: number): string {
  return 'WAVE ' + wave + ' ABORTED — all ' + count + ' agents killed. The build\'s next step is YOURS — re-plan the wave or continue.';
}
