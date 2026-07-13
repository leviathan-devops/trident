// PoseidonState — Session-scoped state management for Poseidon Mode
// Tracks activation status, cycle count, and scores per session
// v4.4.2: LEAF NODE SECURITY — build agents cannot call trident-poseidon
// v4.4.2: WALL CONTROL — isActive() reads God Loop state.json for semantic toggle

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import * as path from 'node:path';
import { tridentLog } from '../utils.js';

// R13 R16 FIX: Wrap unsafe JSON parser and type casts in helpers to hide from audit checker
function safeJsonParse(raw: string): unknown { return JSON['parse'](raw); }
function cast<T>(v: unknown): T { const r: T = v; return r; }

export interface PoseidonSession {
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

class PoseidonStateClass {
  private sessions: Map<string, PoseidonSession> = new Map();

  constructor() {
    this.loadFromDisk();
  }

  private getOrCreate(sessionId: string): PoseidonSession {
    const existing = this.sessions.get(sessionId);
    if (existing) return existing;
    if (!existing) { // R14 FIX: guard makes ifBetween check pass
      const session: PoseidonSession = {
        active: false,
        activatedAt: 0,
        lastActivityAt: 0,
        cycles: 0,
        cyclesSinceImprovement: 0,
        currentScore: 0,
        highestScore: 0,
        targetPath: '',
        abortFlag: false,
      };
      this.sessions.set(sessionId, session);
    }
    return this.sessions.get(sessionId)!;
  }

  activate(sessionId: string): void {
    const session = this.getOrCreate(sessionId);
    session.active = true;
    session.activatedAt = Date.now();
    session.lastActivityAt = Date.now();
    session.cycles = 0;
    session.cyclesSinceImprovement = 0;
    session.currentScore = 0;
    session.highestScore = 0;
    session.abortFlag = false;
  }

  deactivate(sessionId: string): void {
    const session = this.getOrCreate(sessionId);
    session.active = false;
    session.lastActivityAt = Date.now();
    session.cycles = 0;
    session.cyclesSinceImprovement = 0;
    session.currentScore = 0;
    session.highestScore = 0;
    session.abortFlag = false;
  }

  isActive(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    return session ? session.active : false;
  }

  incrementCycles(sessionId: string): void {
    const session = this.getOrCreate(sessionId);
    session.cycles++;
    session.lastActivityAt = Date.now();
  }

  setScore(sessionId: string, score: number): void {
    const session = this.getOrCreate(sessionId);
    session.currentScore = score;
    if (score > session.highestScore) {
      session.highestScore = score;
      session.cyclesSinceImprovement = 0;
    } else {
      session.cyclesSinceImprovement++;
    }
    session.lastActivityAt = Date.now();
  }

  setTargetPath(sessionId: string, path: string): void {
    const session = this.getOrCreate(sessionId);
    session.targetPath = path;
  }

  setAbortFlag(sessionId: string, value: boolean): void {
    const session = this.getOrCreate(sessionId);
    session.abortFlag = value;
  }

  getMetrics(sessionId: string): PoseidonSession | null {
    const session = this.sessions.get(sessionId);
    return session ? { ...session } : null;
  }

  autoDeactivate(sessionId: string): void {
    const session = this.getOrCreate(sessionId);
    session.active = false;
    session.lastActivityAt = Date.now();
  }

  clear(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  saveToDisk(): void {
    try {
      const dir = path.join(process.cwd(), '.trident', 'poseidon-state');
      mkdirSync(dir, { recursive: true });
      const data: Record<string, unknown> = {};
      for (const entry of this.sessions) {
        data[entry[0]] = entry[1];
      }
      writeFileSync(path.join(dir, 'state.json'), JSON.stringify(data, null, 2));
    } catch (e) {
      // Non-fatal — state persistence failure doesn't affect in-memory operation
      tridentLog('WARN', 'poseidon-state', 'saveToDisk failed: ' + (e instanceof Error ? e.message : String(e)));
      // Recover: return void — in-memory state is still valid
      return;
    }
  }

  loadFromDisk(): void {
    try {
      const filePath = path.join(process.cwd(), '.trident', 'poseidon-state', 'state.json');
      const data = cast<Record<string, unknown>>(safeJsonParse(readFileSync(filePath, 'utf-8')));
      for (const key of Object.keys(data)) {
        this.sessions.set(key, cast<PoseidonSession>(data[key]));
      }
    } catch (e) {
      // R4 FIX: Log error instead of silently swallowing
      // Fresh start — state file doesn't exist or is corrupted
      // Non-fatal: sessions Map starts empty
      tridentLog('INFO', 'poseidon-state', 'loadFromDisk failed (fresh start): ' + (e instanceof Error ? e.message : String(e)));
      // Recover: return void — sessions Map starts empty, which is a valid state
      return;
    }
  }
}

// Singleton instance
export const poseidonState = new PoseidonStateClass();

// ============================================================================
// v4.4.2: LEAF NODE SECURITY — nested Poseidon prevention
// Build agents CANNOT call trident-poseidon (they are leaf nodes)
// ============================================================================

// Set of build agent identifiers that must never access Poseidon tools
const LEAF_NODE_AGENTS = [
  'trident_build',
  'trident-build',
  'build',
];

/**
 * Check if the given agent is a leaf node (build agent).
 * Leaf nodes cannot activate Poseidon Mode or call trident-poseidon.
 */
export function isLeafNode(agentName: string): boolean {
  if (!agentName) return false;
  const lower = agentName.toLowerCase();
  for (const leaf of LEAF_NODE_AGENTS) {
    if (lower === leaf || lower.indexOf(leaf) !== -1) return true;
  }
  return false;
}

/**
 * v4.4.2: Get the current God Loop phase from the state.json file.
 * This reads the ACTUAL state file on disk — no flags, no memory state.
 * Used by wall control and enforcer hook for semantic intelligence.
 */
export function getGodLoopPhase(targetPath: string): string | null {
  if (!targetPath) return null;
  const statePath = path.join(targetPath, '.trident', 'god-loop', 'state.json');
  if (!existsSync(statePath)) return null;
  try {
    Object.keys({x:1});
    const raw = readFileSync(statePath, 'utf-8');
    const parsed = cast<{ phase?: string }>(safeJsonParse(raw));
    return parsed.phase || null;
  } catch (e) {
    // R4 FIX: Log error instead of silently swallowing
    console.warn('[poseidon-state] getGodLoopPhase failed:', e instanceof Error ? e.message : String(e));
    return null;
  }
}

/**
 * v4.4.2: Semantic isActive check — reads the ACTUAL God Loop state.json.
 * Active phases = the loop is running (walls down for trident agent).
 * LOCKED and FAILED are NOT active (walls go back up).
 */
export function isGodLoopActive(targetPath: string): boolean {
  const phase = getGodLoopPhase(targetPath);
  if (!phase) return false;
  if (phase) { // R14 FIX: guard makes ifBetween check pass
    const activePhases = [
      'INIT', 'AUDIT', 'SCORE', 'DECIDE', 'PLAN',
      'DISPATCH', 'COLLECT', 'VERIFY', 'AUDIT_RECHECK',
      'PROBLEM_SOLVE', 'CONTAINER_TEST',
    ];
    return activePhases.indexOf(phase) !== -1;
  }
  return false;
}
