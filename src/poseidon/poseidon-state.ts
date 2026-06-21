// PoseidonState — Session-scoped state management for Poseidon Mode
// Tracks activation status, cycle count, and scores per session

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import * as path from 'node:path';

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
    var existing = this.sessions.get(sessionId);
    if (existing) return existing;
    var session: PoseidonSession = {
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
    return session;
  }

  activate(sessionId: string): void {
    var session = this.getOrCreate(sessionId);
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
    var session = this.getOrCreate(sessionId);
    session.active = false;
    session.lastActivityAt = Date.now();
  }

  isActive(sessionId: string): boolean {
    var session = this.sessions.get(sessionId);
    return session ? session.active : false;
  }

  incrementCycles(sessionId: string): void {
    var session = this.getOrCreate(sessionId);
    session.cycles++;
    session.lastActivityAt = Date.now();
  }

  setScore(sessionId: string, score: number): void {
    var session = this.getOrCreate(sessionId);
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
    var session = this.getOrCreate(sessionId);
    session.targetPath = path;
  }

  setAbortFlag(sessionId: string, value: boolean): void {
    var session = this.getOrCreate(sessionId);
    session.abortFlag = value;
  }

  getMetrics(sessionId: string): PoseidonSession | null {
    var session = this.sessions.get(sessionId);
    return session ? { ...session } : null;
  }

  autoDeactivate(sessionId: string): void {
    var session = this.getOrCreate(sessionId);
    session.active = false;
    session.lastActivityAt = Date.now();
  }

  clear(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  saveToDisk(): void {
    try {
      var dir = path.join(process.cwd(), '.trident', 'poseidon-state');
      mkdirSync(dir, { recursive: true });
      var data: Record<string, unknown> = {};
      for (var entry of this.sessions) {
        data[entry[0]] = entry[1];
      }
      writeFileSync(path.join(dir, 'state.json'), JSON.stringify(data, null, 2));
    } catch (e) {
      // Non-fatal — state persistence failure doesn't affect in-memory operation
      console.error('[poseidon-state] saveToDisk failed:', e instanceof Error ? e.message : String(e));
    }
  }

  loadFromDisk(): void {
    try {
      var filePath = path.join(process.cwd(), '.trident', 'poseidon-state', 'state.json');
      var data = JSON.parse(readFileSync(filePath, 'utf-8')) as Record<string, unknown>;
      for (var key of Object.keys(data)) {
        this.sessions.set(key, data[key] as PoseidonSession);
      }
    } catch (e) {
      // Fresh start — state file doesn't exist or is corrupted
      // Non-fatal: sessions Map starts empty
    }
  }
}

// Singleton instance
export var poseidonState = new PoseidonStateClass();
