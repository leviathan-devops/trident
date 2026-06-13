import { Warhead } from '../warhead-interface.js';
import { HookRegistry } from '../warhead-registry.js';
import { getFirewallAudit } from '../../hooks/guardian-hook.js';

class IdentityLayerWarhead implements Warhead {
  id = 'identity-layer-engine';
  priority = 7;
  type = 'static' as const;

  // No init() — pure aggregator, nothing to load.
  // register() exists to satisfy Warhead interface — prevents registration chain break.
  // Without it, trident-warhead-synthesizer.ts:315 throws TypeError, aborting
  // registration for warheads 8-12 (focus, recovery, auditState).

  register(_hooks: HookRegistry): void {
    // Pure T0 warhead — no hooks needed.
  }

  getT0(): string {
    const fw = getFirewallAudit();
    return `[LAYER ENGINE] F1: ${fw.getBlockCount('F1_ISOLATION')} blocks | Total enforcement: ${fw.getTotalBlocks()} blocks. L5 (11 classes) + CFW + Zone active.`;
  }

  getStatus(): Record<string, number | string> {
    const fw = getFirewallAudit();
    return {
      f1Blocks: fw.getBlockCount('F1_ISOLATION'),
      totalBlocks: fw.getTotalBlocks(),
    };
  }
}

export const identityLayerWarhead = new IdentityLayerWarhead();
