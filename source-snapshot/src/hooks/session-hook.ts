import type { Hooks } from '@opencode-ai/plugin';
import { isTridentAgent, isVanillaAgent, isOtherPluginAgent } from '../identity/agent-identity.js';
import { setCurrentAgent, clearCurrentAgent } from './agent-state.js';
import { tridentLog } from '../utils.js';
import { orchestrator } from '../orchestrator.js';
import { hookRegistry } from '../shared/warhead-registry.js';

export function createSessionHook(): Hooks['event'] {
  return async (input) => {
    if (!input) return;
    const event = input.event as { type?: string; sessionId?: string; agent?: string };
    if (!event?.type) return;
    const sessionId = event.sessionId || '';
    if (isTridentAgent(event.agent)) {
      setCurrentAgent(event.agent, sessionId);
    } else if (isVanillaAgent(event.agent)) {
      setCurrentAgent(undefined, sessionId);
      tridentLog('INFO', 'session', 'Vanilla agent detected: ' + event.agent + ' — cleared Trident state');
      return;
    } else if (isOtherPluginAgent(event.agent)) {
      setCurrentAgent(undefined, sessionId);
      tridentLog('INFO', 'session', 'Other plugin agent detected: ' + event.agent + ' — cleared Trident state');
      return;
    } else {
      setCurrentAgent(undefined, sessionId);
      return;
    }
    if (event.type === 'session.created') {
      if (typeof input !== 'object' || input === null) return; // input not an object — skip
      await handleSessionCreated(input as Record<string, unknown>);
    } else if (event.type === 'session.ended') {
      handleSessionEnded(sessionId);
    }
  };
}

async function handleSessionCreated(input?: Record<string, unknown>): Promise<void> {
  // ── Fire session.created event to project folder warhead (Finding #7) ──
  // P9 FIX: hookRegistry.fire() returns Promise<void> — MUST be awaited.
  // Previous code discarded the promise (fire-and-forget), silently swallowing
  // errors from project folder initialization.
  try {
    const data = input || {};
    await hookRegistry.fire('session.created', data, {});
  } catch (e: unknown) {
    console.error('[session] session.created hook fire failed:', e instanceof Error ? e.message : String(e));
    await tridentLog('WARN', 'session', 'session.created hook fire failed: ' + (e instanceof Error ? e.message : String(e)));
    return;
  }
}

function handleSessionEnded(sessionId?: string): void {
  clearCurrentAgent(sessionId);
  orchestrator.resetSession(sessionId);
}
