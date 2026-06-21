import { HookRegistry } from '../warhead-registry.js';
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

  register(hooks: HookRegistry): void {
    // Update state from orchestrator
    hooks.on('tool.execute.before', async (input) => {
      try {
        if (typeof input !== 'object' || input === null) return;
        const inputR = input as Record<string, unknown>;
        const agentName = inputR.agent as string;
        if (agentName && !isTridentAgent(agentName)) return;

        const sessionId = inputR.sessionID as string;
        if (!sessionId) return;

        const state = orchestrator.getState(sessionId);
        if (state) {
          this.mode = state.mode || 'IDLE';
          this.layer = typeof state.currentLayer === 'number' ? state.currentLayer : 0;
          this.gate = gateManager.getCurrentGate();
          this.task = state.status || 'idle';
        }
      } catch (e: unknown) {
        await tridentLog('WARN', 'warhead-focus', `State update failed: ${e instanceof Error ? e.message : String(e)}`);
        return;
      }
    });
  }

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

  register(hooks: HookRegistry): void {
    hooks.on('tool.execute.after', async (input) => {
      try {
        if (typeof input !== 'object' || input === null) return;
        const inputR = input as Record<string, unknown>;
        const agentName = inputR.agent as string;
        if (agentName && !isTridentAgent(agentName)) return;
        const toolName = inputR.tool;
        if (typeof toolName === 'string' && toolName.startsWith('trident-')) {
          this.lastCheckpoint = `${toolName} at ${new Date().toISOString()}`;
        }
      } catch (e: unknown) {
        await tridentLog('WARN', 'warhead-recovery', `Recovery tracking: ${e instanceof Error ? e.message : String(e)}`);
        return;
      }
    });
  }

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

  register(hooks: HookRegistry): void {
    hooks.on('tool.execute.after', async (input, output) => {
      try {
        if (typeof input !== 'object' || input === null) return;
        const inputR = input as Record<string, unknown>;
        const agentName = inputR.agent as string;
        if (agentName && !isTridentAgent(agentName)) return;
        const toolName = inputR.tool;
        if (typeof toolName === 'string' && toolName === 'trident-code-audit') {
          if (typeof output === 'object' && output !== null) {
            const outputR = output as Record<string, unknown>;
            const layers = outputR.layers;
            if (Array.isArray(layers)) {
              let completed = 0;
              let totalFindings = 0;
              for (const layer of layers) {
                if (typeof layer !== 'object' || layer === null) continue;
                const l = layer as Record<string, unknown>;
                const fc = typeof l.findingCount === 'number' ? l.findingCount : 0;
                totalFindings += fc;
                if (fc === 0) completed++;
              }
              this.layersCompleted = completed;
              this.totalFindings = totalFindings;
              this.passRate = layers.length > 0 ? (completed / layers.length) : 0;
            }
          }
          await tridentLog('INFO', 'warhead-audit-state',
            `Audit: ${this.layersCompleted} layers passed, ${this.totalFindings} findings, ${(this.passRate * 100).toFixed(0)}% pass rate`);
        }
      } catch (e: unknown) {
        await tridentLog('ERROR', 'warhead-audit-state',
          `Update failed: ${e instanceof Error ? e.message : String(e)}`);
        return;
      }
    });
  }

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
