import { tridentLog } from './utils.js';
import * as fs from 'node:fs';
import * as path from 'node:path';

// Re-export for backward compatibility
export type TridentMode = 'CODE_REVIEW' | 'DEEP_PLANNING' | 'PROBLEM_SOLVING' | 'CONTEXT_SYNTHESIS' | 'IDLE';

interface OrchestratorState {
  mode: string;
  currentLayer: number;
  maxLayers: number;
  iteration: string;
  status: string;
  initialized: boolean;
  identityLoaded: boolean;
  artifacts: Map<string, string>;
  lastIntent: { mode: string; reasoning: string } | null;
  currentGate: string;
  startedAt: number;
  iterationCount: number;
}

function defaultState(): OrchestratorState {
  return {
    mode: 'IDLE', currentLayer: 0, maxLayers: 17,
    iteration: 'V4.3.2', status: 'IDLE', initialized: true,
    identityLoaded: false, artifacts: new Map(), lastIntent: null,
    currentGate: 'PLAN', startedAt: Date.now(), iterationCount: 0,
  };
}

const STATE_DIR = path.join(process.cwd(), '.trident');
const STATE_FILE = path.join(STATE_DIR, 'session-state.json');
const MAX_ITERATIONS = 10;
const MAX_TIME_MS = 300000;

function saveStateToDisk(states: Map<string, OrchestratorState>): void {
  try {
    if (!fs.existsSync(STATE_DIR)) fs.mkdirSync(STATE_DIR, { recursive: true });
    const serializable: Record<string, unknown> = {};
    for (const [key, val] of states) {
      serializable[key] = { ...val, artifacts: Array.from(val.artifacts.entries()) };
    }
    fs.writeFileSync(STATE_FILE, JSON.stringify(serializable, null, 2), 'utf-8');
  } catch (e: unknown) {
    console.error('[orchestrator] State save failed:', e instanceof Error ? e.message : String(e));
    tridentLog('ERROR', 'orchestrator', 'State save failed: ' + (e instanceof Error ? e.message : String(e)));
  }
}

function loadStateFromDisk(): Map<string, OrchestratorState> {
  const states = new Map<string, OrchestratorState>();
  try {
    if (fs.existsSync(STATE_FILE)) {
      const data = JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8')) as Record<string, unknown>;
      for (const [key, val] of Object.entries(data)) {
        if (typeof val !== 'object' || val === null) continue; // state value not an object — skip
        const v = val as Record<string, unknown>;
        const artifactsArr = Array.isArray(v.artifacts) ? (v.artifacts as Array<[string, string]>) : [];
        states.set(key, { ...defaultState(), ...v, artifacts: new Map(artifactsArr) } as OrchestratorState);
      }
    }
  } catch (e: unknown) {
    console.error('[orchestrator] State load failed:', e instanceof Error ? e.message : String(e));
    tridentLog('WARN', 'orchestrator', 'State load failed: ' + (e instanceof Error ? e.message : String(e)));
    return states;
  }
  return states;
}

class Orchestrator {
  private states = loadStateFromDisk();

  constructor() {
    tridentLog('INFO', 'orchestrator', 'Orchestrator initialized (disk-backed session state)');
  }

  private getStateFor(sessionId: string): OrchestratorState {
    if (!this.states.has(sessionId)) {
      this.states.set(sessionId, defaultState());
    }
    return this.states.get(sessionId)!;
  }

  checkTimeout(sessionId?: string): boolean {
    var state = this.getStateFor(sessionId || 'default');
    if (state.iterationCount >= MAX_ITERATIONS) {
      state.status = 'TIMEOUT';
      tridentLog('WARN', 'orchestrator', 'Max iterations reached: ' + MAX_ITERATIONS);
      saveStateToDisk(this.states);
      return true;
    }
    if (Date.now() - state.startedAt >= MAX_TIME_MS) {
      state.status = 'TIMEOUT';
      tridentLog('WARN', 'orchestrator', 'Max time reached: ' + MAX_TIME_MS + 'ms');
      saveStateToDisk(this.states);
      return true;
    }
    return false;
  }

  addArtifact(key: string, value: string, sessionId?: string): void {
    var state = this.getStateFor(sessionId || 'default');
    state.artifacts.set(key, value);
    saveStateToDisk(this.states);
  }

  getState(sessionId?: string): OrchestratorState {
    var state = this.getStateFor(sessionId || 'default');
    return { ...state, artifacts: new Map(state.artifacts) };
  }

  getMaxLayers(): number { return 17; }
  getCorePrinciple(): string { return 'Trident Audits & Generates Review Artifacts. Build Agents Implement All Changes.'; }

  setSession(sessionId: string): void {
    tridentLog('INFO', 'orchestrator', 'Session set: ' + sessionId);
    this.getStateFor(sessionId);
  }

  setIdentityLoaded(v: boolean, sessionId?: string): void {
    var state = this.getStateFor(sessionId || 'default');
    state.identityLoaded = v;
  }

  // Simple mode setters — state only, no XState
  startAudit(sessionId?: string): void {
    var state = this.getStateFor(sessionId || 'default');
    state.mode = 'CODE_REVIEW';
    state.currentLayer = 0;
    state.status = 'RUNNING';
    state.startedAt = Date.now();
    state.iterationCount = 0;
    saveStateToDisk(this.states);
  }

  startPlanning(sessionId?: string): void {
    var state = this.getStateFor(sessionId || 'default');
    state.mode = 'DEEP_PLANNING';
    state.currentLayer = 0;
    state.status = 'RUNNING';
    state.startedAt = Date.now();
    state.iterationCount = 0;
    saveStateToDisk(this.states);
  }

  startProblemSolving(sessionId?: string): void {
    var state = this.getStateFor(sessionId || 'default');
    state.mode = 'PROBLEM_SOLVING';
    state.currentLayer = 0;
    state.status = 'RUNNING';
    state.startedAt = Date.now();
    state.iterationCount = 0;
    saveStateToDisk(this.states);
  }

  startContextSynthesis(sessionId?: string): void {
    var state = this.getStateFor(sessionId || 'default');
    state.mode = 'CONTEXT_SYNTHESIS';
    state.currentLayer = 0;
    state.status = 'RUNNING';
    state.startedAt = Date.now();
    state.iterationCount = 0;
    saveStateToDisk(this.states);
  }

  completeLayer(sessionId?: string): void {
    var state = this.getStateFor(sessionId || 'default');
    state.currentLayer++;
    state.iterationCount++;
    saveStateToDisk(this.states);
  }

  failLayer(reason: string, sessionId?: string): void {
    var state = this.getStateFor(sessionId || 'default');
    state.status = 'ERROR';
    tridentLog('ERROR', 'orchestrator', 'Layer ' + (state.currentLayer + 1) + ' failed: ' + reason);
    saveStateToDisk(this.states);
  }

  resetSession(sessionId?: string): void {
    var sid = sessionId || 'default';
    this.states.delete(sid);
    tridentLog('INFO', 'orchestrator', 'Session reset: ' + sid);
    saveStateToDisk(this.states);
  }
}

export const orchestrator = new Orchestrator();
