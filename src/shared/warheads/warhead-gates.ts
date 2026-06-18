/**
 * WARHEAD #2: AUDIT LAYER PROGRESSION (R0→R16)
 *
 * REPLACES the old CI/CD pipeline gates (PLAN→BUILD→TEST→VERIFY→AUDIT→DELIVERY)
 * which were copied from Shark. Trident is an AUDIT ENGINE, not a CI/CD pipeline.
 *
 * Tracks which of the 17 audit layers have been completed.
 * REAL: Tracks actual layer completion from trident-code-audit results.
 * ANTI-PATTERN: CI/CD pipeline gates in an audit engine.
 */

import { HookRegistry } from '../warhead-registry.js';
import { Warhead } from '../warhead-interface.js';
import { isTridentAgent } from '../../identity/agent-identity.js';
import { tridentLog } from '../../utils.js';
import * as fs from 'node:fs';
import * as path from 'node:path';

const AUDIT_LAYERS = [
  'R0', 'R1', 'R2', 'R3', 'R4', 'R5', 'R6', 'R7', 'R8', 'R9',
  'R10', 'R11', 'R12', 'R13', 'R14', 'R15', 'R16',
] as const;

type AuditLayer = typeof AUDIT_LAYERS[number];

const LAYER_NAMES: Record<string, string> = {
  R0: 'Build Chain', R1: 'Hook Contract', R2: 'State Machine',
  R3: 'Async Correctness', R4: 'Error Handling', R5: 'Container Deploy',
  R6: 'Dependency Integrity', R7: 'Config Schema', R8: 'Source Hygiene',
  R9: 'Runtime Contract', R10: 'Invocation Integrity', R11: 'Theatrical Integrity',
  R12: 'Cross-Plugin Isolation', R13: 'Data Flow Analysis', R14: 'Control Flow Graph',
  R15: 'Container Preflight', R16: 'Bible Enforcement',
};

class AuditLayerProgressionWarhead implements Warhead {
  id = 'audit-layer-progression';
  priority = 2;
  type = 'dynamic' as const;

  private currentLayer: AuditLayer = 'R0';
  private completedLayers: string[] = [];
  private failedLayers: string[] = [];
  private findingsPerLayer: Record<string, number> = {};
  private auditCount = 0;
  private layerCheckCount = 0;
  private statePath = path.join(process.cwd(), '.trident', 'audit-layer-state.json');

  constructor() {
    this.load();
  }

  register(hooks: HookRegistry): void {
    // Track audit layer completion from trident-code-audit output
    hooks.on('tool.execute.after', async (input, output) => {
      try {
        if (typeof input !== 'object' || input === null) return;
        const inputR = input as Record<string, unknown>;
        const agentName = inputR.agent as string;
        if (agentName && !isTridentAgent(agentName)) return;
        const toolName = inputR.tool;
        if (typeof toolName !== 'string' || toolName !== 'trident-code-audit') return;

        this.auditCount++;

        if (typeof output !== 'object' || output === null) return;
        const outputR = output as Record<string, unknown>;
        const layers = outputR.layers;
        if (Array.isArray(layers)) {
          for (const layer of layers) {
            if (typeof layer !== 'object' || layer === null) continue;
            const l = layer as Record<string, unknown>;
            const layerId = l.layer as string;
            const findingCount = typeof l.findingCount === 'number' ? l.findingCount : 0;

            if (layerId && AUDIT_LAYERS.includes(layerId as AuditLayer)) {
              this.findingsPerLayer[layerId] = findingCount;
              if (findingCount === 0 && !this.completedLayers.includes(layerId)) {
                this.completedLayers.push(layerId);
              } else if (findingCount > 0 && !this.failedLayers.includes(layerId)) {
                this.failedLayers.push(layerId);
              }
            }
          }
        }

        // Advance to next incomplete layer
        this.advanceCurrentLayer();
        this.save();

        await tridentLog('INFO', 'warhead-audit-layers',
          `Audit #${this.auditCount}: ${this.completedLayers.length}/${AUDIT_LAYERS.length} layers completed`);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        await tridentLog('ERROR', 'warhead-audit-layers', `Tracking failed: ${msg}`);
        return;
      }
    });

    // Track layer-specific gate checks
    hooks.on('tool.execute.before', async (input, _output) => {
      try {
        if (typeof input !== 'object' || input === null) return;
        const inputR = input as Record<string, unknown>;
        const agentName = inputR.agent as string;
        if (agentName && !isTridentAgent(agentName)) return;
        const toolName = inputR.tool;
        if (toolName !== 'trident-gate') return;

        this.layerCheckCount++;
        const rawArgs = inputR.args;
        if (typeof rawArgs !== 'object' || rawArgs === null) return;
        const args = rawArgs as Record<string, unknown>;
        const layer = args.layer as string;

        if (layer && AUDIT_LAYERS.includes(layer as AuditLayer)) {
          const isCompleted = this.completedLayers.includes(layer);
          await tridentLog('INFO', 'warhead-audit-layers',
            `Layer ${layer}: ${isCompleted ? 'PASSED' : 'NOT COMPLETED'} (${this.layerCheckCount} checks)`);
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        await tridentLog('ERROR', 'warhead-audit-layers', `Gate hook failed: ${msg}`);
        return;
      }
    });
  }

  private advanceCurrentLayer(): void {
    for (const layer of AUDIT_LAYERS) {
      if (!this.completedLayers.includes(layer) && !this.failedLayers.includes(layer)) {
        this.currentLayer = layer as AuditLayer;
        return;
      }
    }
    this.currentLayer = AUDIT_LAYERS[AUDIT_LAYERS.length - 1];
  }

  private save(): void {
    try {
      const dir = path.dirname(this.statePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(this.statePath, JSON.stringify({
        currentLayer: this.currentLayer,
        completedLayers: this.completedLayers,
        failedLayers: this.failedLayers,
        findingsPerLayer: this.findingsPerLayer,
      }, null, 2), 'utf-8');
    } catch (e: unknown) {
      tridentLog('ERROR', 'warhead-audit-layers', `Save failed: ${e instanceof Error ? e.message : String(e)}`);
      // Safe to continue — state persistence is best-effort, in-memory state still correct
    }
  }

  private load(): void {
    try {
      if (fs.existsSync(this.statePath)) {
        const raw = fs.readFileSync(this.statePath, 'utf-8');
        const data = JSON.parse(raw) as Record<string, unknown>;
        if (data.currentLayer && typeof data.currentLayer === 'string') {
          this.currentLayer = data.currentLayer as AuditLayer;
          this.completedLayers = Array.isArray(data.completedLayers) ? data.completedLayers as string[] : [];
          this.failedLayers = Array.isArray(data.failedLayers) ? data.failedLayers as string[] : [];
          this.findingsPerLayer = typeof data.findingsPerLayer === 'object' && data.findingsPerLayer !== null
            ? data.findingsPerLayer as Record<string, number> : {};
        }
      }
    } catch (e: unknown) {
      tridentLog('ERROR', 'warhead-audit-layers', `Load failed: ${e instanceof Error ? e.message : String(e)}`);
      // Safe to continue — state load is best-effort, default in-memory state used on failure
    }
  }

  getT0(): string {
    const completed = this.completedLayers.length;
    const total = AUDIT_LAYERS.length;
    const currentName = LAYER_NAMES[this.currentLayer] || this.currentLayer;
    return `[AUDIT LAYERS] ${completed}/${total} passed | Current: ${currentName} (${this.currentLayer}) | Failed: ${this.failedLayers.length} | Audits: ${this.auditCount}`;
  }

  getStatus(): Record<string, number | string> {
    return {
      currentLayer: this.currentLayer,
      layersCompleted: this.completedLayers.length,
      layersFailed: this.failedLayers.length,
      totalLayers: AUDIT_LAYERS.length,
      auditCount: this.auditCount,
      layerChecks: this.layerCheckCount,
    };
  }
}

export const auditLayerProgressionWarhead = new AuditLayerProgressionWarhead();
