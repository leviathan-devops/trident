// System transform hook — the FULL Trident identity + warheads injection for Trident_Build
// (2026-08-20 — the operator's ruling: "same inline constants for identity + init spawn/boot
// payload delivery for warheads... LITERALLY copy paste it and then in the subagents codebase
// section start niching it down"). The build agent's system-transform hook delivers the FULL
// TRIDENT_BUILD_T1 (the full identity + the 21 warheads, niched for build execution) at the
// session start — the boot payload. NOT the 3-line stub (the old "Do NOT think. Do NOT
// deviate." — the RETIRED mindless-bot identity).

import { isTridentBuildAgent } from '../identity/agent-identity.js';
import { getCurrentAgent } from '../../../hooks/agent-state.js';
import { TRIDENT_BUILD_T1 } from '../identity/t1-prompt.js';

export function createSystemTransformHook() {
  return async function(input: Record<string, unknown>, output: Record<string, unknown>): Promise<void> {
    var agent = getCurrentAgent(input.sessionID as string);
    if (!isTridentBuildAgent(agent)) return;

    // The system.transform hook uses output.system: string[], not output.content
    var content = output.system as string[] | undefined;
    if (!content || !Array.isArray(content)) return;

    // Check if the FULL identity is already injected (the boot payload is idempotent)
    if (content.some(function(s: string) { return s.indexOf('You are Trident Build — a specialized Trident') !== -1; })) return;

    // Inject the FULL T1 prompt (the full identity + the warheads — the boot payload,
    // prepend to the beginning of the system array so it's the first thing the model reads)
    content.unshift('\n' + TRIDENT_BUILD_T1 + '\n');
  };
}
