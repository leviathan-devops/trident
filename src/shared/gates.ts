import * as path from 'node:path';
import * as fs from 'node:fs';
import { tridentLog } from '../utils.js';

export const GATE_ORDER = ['PLAN', 'BUILD', 'TEST', 'VERIFY', 'AUDIT', 'DELIVERY'] as const;
export type Gate = typeof GATE_ORDER[number];

export interface GateState {
  currentGate: Gate;
  gateStates: Record<Gate, 'pending' | 'in_progress' | 'passed' | 'failed'>;
}

export class GateManager {
  private state: GateState;
  private readonly statePath: string;

  constructor(basePath?: string) {
    const dir = basePath || process.cwd();
    this.statePath = path.join(dir, '.trident', 'gate-state.json');
    this.state = this.load();
  }

  getState(): GateState {
    return this.state;
  }

  getCurrentGate(): Gate {
    return this.state.currentGate;
  }

  advanceGate(): boolean {
    const idx = GATE_ORDER.indexOf(this.state.currentGate);
    if (idx < 0 || idx >= GATE_ORDER.length - 1) return false;
    if (this.state.gateStates[this.state.currentGate] !== 'passed') return false;
    this.state.currentGate = GATE_ORDER[idx + 1];
    this.state.gateStates[this.state.currentGate] = 'in_progress';
    this.save();
    return true;
  }

  canAdvance(): boolean {
    return this.state.gateStates[this.state.currentGate] === 'passed';
  }

  setGateState(gate: Gate, state: 'pending' | 'in_progress' | 'passed' | 'failed'): void {
    this.state.gateStates[gate] = state;
    this.save();
  }

  private save(): void {
    try {
      const dir = path.dirname(this.statePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(this.statePath, JSON.stringify(this.state, null, 2), 'utf-8');
    } catch (e) {
      tridentLog('ERROR', 'gates', `GateManager save failed: ${(e as Error).message || e}`);
    }
  }

  private load(): GateState {
    try {
      if (fs.existsSync(this.statePath)) {
        return JSON.parse(fs.readFileSync(this.statePath, 'utf-8')) as GateState;
      }
    } catch (e) {
      tridentLog('ERROR', 'gates', `GateManager load failed: ${(e as Error).message || e}`);
      return { currentGate: 'PLAN', gateStates: { PLAN: 'in_progress', BUILD: 'pending', TEST: 'pending', VERIFY: 'pending', AUDIT: 'pending', DELIVERY: 'pending' } };
    }
    return {
      currentGate: 'PLAN',
      gateStates: {
        PLAN: 'in_progress',
        BUILD: 'pending',
        TEST: 'pending',
        VERIFY: 'pending',
        AUDIT: 'pending',
        DELIVERY: 'pending',
      },
    };
  }
}

/** Singleton instance — import this everywhere */
export const gateManager = new GateManager();
