// Hook factory for Trident_Build subagent
// Delegates to specialized hook modules

import { createGuardianHook as createGuardianHooks } from './guardian-hook.js';
import { createGateHook } from './gate-hook.js';
import { createSystemTransformHook } from './system-transform-hook.js';

export function createTridentBuildHooks() {
  var guardianHooks = createGuardianHooks();
  var gateHook = createGateHook();
  var systemTransformHook = createSystemTransformHook();

  // Compose: tool.execute.after runs guardian's after hook, then gate's hook
  var composedAfter = async function(input: Record<string, unknown>, output: Record<string, unknown>) {
    await guardianHooks.afterHook(input, output);
    await gateHook(input, output);
  };

  // compacting hook — preserves Trident_Build identity across compaction cycles
  // Compaction can strip injected system messages. Re-inject if identity was lost.
  var compactingHook = async function(input: Record<string, unknown>, output: Record<string, unknown>) {
    try {
      var systemOut = output as { system?: string[] };
      if (systemOut?.system && Array.isArray(systemOut.system)) {
        const hasIdentity = systemOut.system.some((s: string) =>
          typeof s === 'string' && s.indexOf('Trident_Build') !== -1
        );
        if (!hasIdentity) {
          systemOut.system.unshift(
            '\n[TRIDENT_BUILD v4.4] You are Trident_Build, a runtime-grade build engineer.\n' +
            'Execute ONLY the remediation plan provided. Do NOT think. Do NOT deviate.\n'
          );
        }
      }
    } catch {
      // Non-fatal — identity re-injection is best-effort on compaction
    }
  };

  return {
    'tool.execute.before': guardianHooks.beforeHook,
    'tool.execute.after': composedAfter,
    'experimental.chat.system.transform': systemTransformHook,
    'experimental.session.compacting': compactingHook,
  };
}
