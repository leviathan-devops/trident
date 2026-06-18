/**
 * GATE MANAGER — Shared Workflow State Machine
 *
 * Manages 6 workflow gates: PLAN → BUILD → TEST → VERIFY → AUDIT → DELIVERY.
 * Controls what the agent CAN DO (workflow permissions) — separate from audit layer
 * progression (R0-R16) which tracks what has BEEN REVIEWED.
 *
 * RULE: Never replace audit layer progression. GateManager and audit layers COEXIST.
 *   - GateManager → controls workflow permissions (canWrite, canAdvance)
 *   - AuditLayerProgression → tracks review completion (R0 done? R1 done?)
 *
 * Anti-pattern: Adding GateManager as a warhead. It's shared infra in shared/gates.ts.
 * Anti-pattern: Merging gates with audit layers. They are orthogonal concerns.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { evidenceGate } from './evidence-gate.js';

export const WORKFLOW_GATES = ['PLAN', 'BUILD', 'TEST', 'VERIFY', 'AUDIT', 'DELIVERY'] as const;
export type WorkflowGate = typeof WORKFLOW_GATES[number];

export class GateManager {
  private gates = WORKFLOW_GATES;
  private currentGate: WorkflowGate = 'PLAN';
  private statePath: string;

  constructor(basePath?: string) {
    const dir = basePath || process.cwd();
    this.statePath = path.join(dir, '.trident', 'gate-state.json');
    this.load();
  }

  getCurrentGate(): WorkflowGate {
    return this.currentGate;
  }

  advanceGate(): boolean {
    const idx = this.gates.indexOf(this.currentGate);
    if (idx < this.gates.length - 1) {
      this.currentGate = this.gates[idx + 1];
      this.save();
      return true;
    }
    return false;
  }

  canAdvance(): boolean {
    const required = evidenceGate.getRequiredEvidence(this.currentGate);
    if (required.length === 0) return true;  // No evidence required for this gate
    const check = evidenceGate.checkAll();
    if (!check.pass) {
      console.warn(`[GateManager] Gate ${this.currentGate} blocked: missing ${check.missingFiles.join(', ')}`);
      return false;
    }
    return true;
  }

  getBlockedReason(): string | null {
    if (this.canAdvance()) return null;
    const required = evidenceGate.getRequiredEvidence(this.currentGate);
    const check = evidenceGate.checkAll();
    return `Gate ${this.currentGate} blocked. Missing: ${check.missingFiles.join(', ')}. Pass rate: ${(check.passRate * 100).toFixed(0)}%`;
  }

  resetGate(gate?: WorkflowGate): void {
    if (gate && this.gates.includes(gate)) {
      this.currentGate = gate;
    } else {
      this.currentGate = 'PLAN';
    }
    this.save();
  }

  getGates(): readonly WorkflowGate[] {
    return this.gates;
  }

  private save(): void {
    try {
      const dir = path.dirname(this.statePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.statePath, JSON.stringify({ currentGate: this.currentGate }, null, 2), 'utf-8');
    } catch (e: unknown) {
      console.error('[GateManager] Save failed:', e instanceof Error ? e.message : String(e));
    }
  }

  private load(): void {
    try {
      if (fs.existsSync(this.statePath)) {
        const raw = fs.readFileSync(this.statePath, 'utf-8');
        const data = JSON.parse(raw) as Record<string, unknown>;
        if (data.currentGate && this.gates.includes(data.currentGate as WorkflowGate)) {
          this.currentGate = data.currentGate as WorkflowGate;
        }
      }
    } catch (e: unknown) {
      console.error('[GateManager] Load failed:', e instanceof Error ? e.message : String(e));
    }
  }
}

/** Singleton instance — import this everywhere */
export const gateManager = new GateManager();
