import { Warhead } from '../warhead-interface.js';
import { isTridentAgent } from '../../identity/agent-identity.js';
import { orchestrator } from '../../orchestrator.js';
import { tridentLog } from '../../utils.js';
import { gateManager } from '../gates.js';

// ── Focus Warhead — tracks current task execution state ──
// Restored from elimination during Phase 6 refactor (Finding #9 fix)
// Provides runtime-aware T0 context: mode, layer, gate, task
class FocusWarhead implements Warhead {
  id = 'focus-tracker';
  priority = 9;
  type = 'dynamic' as const;

  private task = 'idle';
  private mode = 'IDLE';
  private layer = 0;
  private gate = 'R0';


  getT0(): string {
    return `[FOCUS] Mode: ${this.mode} | Layer: ${this.layer}/17 | Gate: ${this.gate} | Task: ${this.task}`;
  }

  getStatus(): Record<string, number | string> {
    return { mode: this.mode, layer: this.layer, gate: this.gate, task: this.task };
  }
}

// ── Recovery Warhead — tracks checkpoint and recovery state ──
class RecoveryWarhead implements Warhead {
  id = 'recovery-tracker';
  priority = 10;
  type = 'dynamic' as const;

  private lastCheckpoint = '';


  getT0(): string {
    return `[RECOVERY] Last: ${this.lastCheckpoint || 'no checkpoint yet'}`;
  }

  getStatus(): Record<string, number | string> {
    return { lastCheckpoint: this.lastCheckpoint };
  }
}

// ── Audit State Warhead — tracks audit layer progress ──
class AuditStateWarhead implements Warhead {
  id = 'audit-state-tracker';
  priority = 11;
  type = 'dynamic' as const;

  private layersCompleted = 0;
  private totalFindings = 0;
  private passRate = 0;


  getT0(): string {
    return `[AUDIT STATE] Layers: ${this.layersCompleted}/17 | Findings: ${this.totalFindings} | Pass rate: ${(this.passRate * 100).toFixed(0)}%`;
  }

  getStatus(): Record<string, number | string> {
    return { layersCompleted: this.layersCompleted, totalFindings: this.totalFindings, passRate: this.passRate };
  }
}

export const focusWarhead = new FocusWarhead();
export const recoveryWarhead = new RecoveryWarhead();
export const auditStateWarhead = new AuditStateWarhead();
