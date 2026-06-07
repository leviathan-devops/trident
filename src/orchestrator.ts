import { tridentLog } from './utils.js';

// Re-export for backward compatibility
export type TridentMode = 'CODE_REVIEW' | 'DEEP_PLANNING' | 'PROBLEM_SOLVING' | 'CONTEXT_SYNTHESIS' | 'IDLE';

// Backward-compatible orchestrator — provides the same API as the old orchestrator.ts
// but backed by the new XState orchestrator machine internally.
// This allows tools/trident-tools.ts and other modules to work without modification.

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
}

function defaultState(): OrchestratorState {
  return {
    mode: 'IDLE', currentLayer: 0, maxLayers: 17,
    iteration: 'V4.3.1', status: 'IDLE', initialized: true,
    identityLoaded: false, artifacts: new Map(), lastIntent: null,
  };
}

class Orchestrator {
  private states = new Map<string, OrchestratorState>();

  private machineRef: any | null = null;

  constructor() {
    tridentLog('INFO', 'orchestrator', 'Orchestrator initialized (XState deferred)');
  }

  private getStateFor(sessionId: string): OrchestratorState {
    if (!this.states.has(sessionId)) {
      this.states.set(sessionId, defaultState());
    }
    return this.states.get(sessionId)!;
  }

  private async getOrchestratorMachine(): Promise<any> {
    try {
      const { orchestratorMachine } = await import('./fsm/orchestrator-machine.js');
      const { interpret } = await import('xstate');
      if (!this.machineRef) {
        this.machineRef = interpret(orchestratorMachine).start();
      }
      return this.machineRef;
    } catch {
      tridentLog('WARN', 'orchestrator', 'XState machine not available, using manual state');
      return null;
    }
  }

  startAudit(sessionId?: string): void {
    var state = this.getStateFor(sessionId || 'default');
    state.mode = 'CODE_REVIEW';
    state.currentLayer = 0;
    state.status = 'RUNNING';
    this.getOrchestratorMachine().then(m => {
      m?.send({ type: 'START_SESSION', sessionId: 'audit' });
      m?.send({ type: 'SET_MODE', sessionId: 'audit', mode: 'code_review' });
    }).catch(() => {});
  }

  startPlanning(sessionId?: string): void {
    var state = this.getStateFor(sessionId || 'default');
    state.mode = 'DEEP_PLANNING';
    state.currentLayer = 0;
    state.status = 'RUNNING';
    this.getOrchestratorMachine().then(m => {
      m?.send({ type: 'START_SESSION', sessionId: 'planning' });
      m?.send({ type: 'SET_MODE', sessionId: 'planning', mode: 'deep_planning' });
    }).catch(() => {});
  }

  startProblemSolving(sessionId?: string): void {
    var state = this.getStateFor(sessionId || 'default');
    state.mode = 'PROBLEM_SOLVING';
    state.currentLayer = 0;
    state.status = 'RUNNING';
    this.getOrchestratorMachine().then(m => {
      m?.send({ type: 'START_SESSION', sessionId: 'problem-solving' });
      m?.send({ type: 'SET_MODE', sessionId: 'problem-solving', mode: 'problem_solving' });
    }).catch(() => {});
  }

  startContextSynthesis(sessionId?: string): void {
    var state = this.getStateFor(sessionId || 'default');
    state.mode = 'CONTEXT_SYNTHESIS';
    state.currentLayer = 0;
    state.status = 'RUNNING';
    this.getOrchestratorMachine().then(m => {
      m?.send({ type: 'START_SESSION', sessionId: 'context-synthesis' });
      m?.send({ type: 'SET_MODE', sessionId: 'context-synthesis', mode: 'context_synthesis' });
    }).catch(() => {});
  }

  completeLayer(sessionId?: string): void {
    var state = this.getStateFor(sessionId || 'default');
    state.currentLayer++;
    tridentLog('INFO', 'orchestrator', 'Layer ' + state.currentLayer + ' completed');
  }

  failLayer(reason: string, sessionId?: string): void {
    var state = this.getStateFor(sessionId || 'default');
    tridentLog('ERROR', 'orchestrator', 'Layer ' + (state.currentLayer + 1) + ' failed: ' + reason);
    state.status = 'ERROR';
  }

  addArtifact(key: string, value: string, sessionId?: string): void {
    var state = this.getStateFor(sessionId || 'default');
    state.artifacts.set(key, value);
  }

  getState(sessionId?: string): OrchestratorState {
    var state = this.getStateFor(sessionId || 'default');
    return { ...state, artifacts: new Map(state.artifacts) };
  }

  getMaxLayers(): number { return 17; }
  getCorePrinciple(): string { return 'Trident Audits & Generates Review Artifacts. Build Agents Implement All Changes.'; }

  // Compatibility methods for hooks
  setSession(sessionId: string): void {
    tridentLog('INFO', 'orchestrator', 'Session set: ' + sessionId);
    this.getStateFor(sessionId);
  }

  resetSession(sessionId?: string): void {
    var sid = sessionId || 'default';
    this.states.delete(sid);
    tridentLog('INFO', 'orchestrator', 'Session reset: ' + sid);
  }

  detectAndSwitch(text: string, sessionId?: string): void {
    tridentLog('INFO', 'orchestrator', 'Intent detect: ' + text.substring(0, 80));
  }

  setIdentityLoaded(v: boolean, sessionId?: string): void {
    var state = this.getStateFor(sessionId || 'default');
    state.identityLoaded = v;
  }

  reset(sessionId?: string): void {
    var sid = sessionId || 'default';
    this.states.delete(sid);
  }
}

export const orchestrator = new Orchestrator();
