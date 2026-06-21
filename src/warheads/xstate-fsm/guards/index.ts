import { existsSync } from 'node:fs';
import { tridentLog } from '../../../utils.js';

export interface GuardResult {
  passed: boolean;
  reason?: string;
}

/** Check that evidence gate pass rate is >= 0.96 */
export function checkEvidenceGate(passRate: number): GuardResult {
  if (passRate < 0.96) {
    return { passed: false, reason: `Evidence gate failed: pass rate ${passRate} < 0.96` };
  }
  return { passed: true };
}

/** Check that session is active */
export function checkSessionActive(sessionId: string | undefined): GuardResult {
  if (!sessionId) {
    return { passed: false, reason: 'No active session — cannot transition' };
  }
  return { passed: true };
}

/** Check that target path exists */
export function checkTargetPath(targetPath: string | undefined): GuardResult {
  if (!targetPath) {
    return { passed: false, reason: 'No target path specified' };
  }
  try {
    if (!existsSync(targetPath)) {
      return { passed: false, reason: `Target path does not exist: ${targetPath}` };
    }
  } catch { /* ignore fs errors */ }
  return { passed: true };
}

/** Check that layer transition is valid */
export function checkLayerTransition(currentLayer: number, maxLayers: number, targetLayer: number): GuardResult {
  if (targetLayer <= currentLayer) {
    return { passed: false, reason: `Cannot transition to layer ${targetLayer} — already at ${currentLayer}` };
  }
  if (targetLayer > maxLayers) {
    return { passed: false, reason: `Layer ${targetLayer} exceeds max ${maxLayers}` };
  }
  return { passed: true };
}
