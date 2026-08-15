// ============================================================
// FILE: src/hooks/poseidon-enforcer-hook.ts
// VERSION: v4.4.2 — Thin guardrail for Poseidon God Loop
// PURPOSE: Fires on tool.execute.after ONLY. Checks tool matches
//          expected phase. Escalates if model goes off-track.
//
// INVARIANT: This is a GUARDRAIL, not a driver. It NEVER injects
//            dynamic system prompts. It uses ONE static line.
// ============================================================

import { tridentLog } from '../utils.js';
import { poseidonState } from '../poseidon/poseidon-state.js';
import { getGodLoopPhase } from '../poseidon/poseidon-state.js';

// STATIC — ONE LINE, NEVER CHANGES. No dynamic phase data.
export const STATIC_POSEIDON_PROMPT =
  'Poseidon Mode active. Call trident-poseidon to advance. Do NOT stop until LOCKED or FAILED.';

// Phase-to-expected-tool mapping (objective telemetry, not narrative)
const PHASE_TOOL_MAP: Record<string, string[]> = {
  'INIT':           ['trident-poseidon'],
  'AUDIT':          ['trident-poseidon'],
  'SCORE':          ['trident-poseidon'],
  'DECIDE':         ['trident-poseidon'],
  'PLAN':           ['trident-poseidon'],
  'DISPATCH':       ['task'],
  'COLLECT':        ['trident-poseidon'],
  'VERIFY':         ['trident-poseidon'],
  'AUDIT_RECHECK':  ['trident-poseidon'],
  'CONTAINER_TEST': ['trident-poseidon'],
  'PROBLEM_SOLVE':  ['trident-poseidon'],
};

interface DerailmentTracker {
  count: number;
  lastTool: string;
  consecutiveOnTrack: number;
}

const trackers: Map<string, DerailmentTracker> = new Map();

function getTracker(sessionId: string): DerailmentTracker {
  let t = trackers.get(sessionId);
  if (!t) {
    t = { count: 0, lastTool: '', consecutiveOnTrack: 0 };
    trackers.set(sessionId, t);
  }
  return t;
}

/**
 * Check if the called tool matches the expected phase tool.
 * Called from tool.execute.after hook.
 * Returns an escalation message or null if on-track.
 */
export function checkPoseidonDerailment(
  sessionId: string,
  toolName: string,
  targetPath?: string,
): string | null {
  // Only enforce if Poseidon is active
  if (!poseidonState.isActive(sessionId)) {
    return null;
  }

  // Get current phase from God Loop state file
  // Try targetPath first, then fall back to poseidonState targetPath, then state.json on disk
  let phase: string | null = null;
  if (targetPath) {
    phase = getGodLoopPhase(targetPath);
  }
  if (!phase) {
    // Fall back: check poseidonState for targetPath
    const metrics = poseidonState.getMetrics(sessionId);
    if (metrics?.targetPath) {
      phase = getGodLoopPhase(metrics.targetPath);
    }
  }
  if (!phase) {
    // Last resort: check 'default' session
    const defaultMetrics = poseidonState.getMetrics('default');
    if (defaultMetrics?.targetPath) {
      phase = getGodLoopPhase(defaultMetrics.targetPath);
    }
  }
  if (!phase) {
    return null; // No phase detectable — can't enforce
  }

  const expectedTools = PHASE_TOOL_MAP[phase];
  if (!expectedTools) {
    return null;
  }

  // Check if the called tool is on-track — EXACT match only, no substring
  const isOnTrack = expectedTools.some(t => toolName === t);

  const tracker = getTracker(sessionId);

  if (isOnTrack) {
    tracker.consecutiveOnTrack++;
    // Decay rule: every 5 on-track actions decrements derailment counter
    if (tracker.consecutiveOnTrack >= 5 && tracker.count > 0) {
      tracker.count--;
      tracker.consecutiveOnTrack = 0;
    }
    tracker.lastTool = toolName;
    return null;
  }

  // OFF-TRACK — escalate
  tracker.consecutiveOnTrack = 0;
  tracker.count++;
  tracker.lastTool = toolName;

  const expectedToolList = expectedTools.join(' or ');

  if (tracker.count === 1) {
    tridentLog('WARN', 'poseidon-enforcer', 'Off-track (warn #1): called ' + toolName + ', expected ' + expectedToolList + ' for phase ' + phase);
    return 'Off-track. Current phase is ' + phase + '. Call ' + expectedToolList + '. (warn #1)';
  }

  if (tracker.count === 2) {
    tridentLog('WARN', 'poseidon-enforcer', 'Repeated off-track (block #2): called ' + toolName);
    return 'Repeated off-track. You MUST call ' + expectedToolList + ' now. (block #2)';
  }

  if (tracker.count === 3) {
    tridentLog('ERROR', 'poseidon-enforcer', 'Phase reset (restart #3): called ' + toolName);
    return 'Phase reset to last checkpoint. Resume from there. (restart #3)';
  }

  // 4+ derailments
  tridentLog('ERROR', 'poseidon-enforcer', 'LOCKOUT: derailment threshold exceeded (#' + tracker.count + ')');
  return 'LOCKOUT. Derailment threshold exceeded. Pausing. No further tool calls accepted until human issues resume command.';
}

/**
 * Reset derailment counter for a session (used when God Loop resets).
 */
export function resetDerailmentTracker(sessionId: string): void {
  trackers.delete(sessionId);
}

/**
 * Get current derailment count (for diagnostics).
 */
export function getDerailmentCount(sessionId: string): number {
  const t = trackers.get(sessionId);
  return t ? t.count : 0;
}
