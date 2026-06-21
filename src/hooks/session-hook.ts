import { appendFileSync } from 'node:fs';
import type { Hooks } from '@opencode-ai/plugin';
import { isTridentAgent } from '../identity/agent-identity.js';
import { setCurrentAgent, clearCurrentAgent } from './agent-state.js';
import { orchestrator } from '../orchestrator.js';

export function createSessionHook(): Hooks['event'] {
  return async (input: Record<string, unknown>) => {
    if (!input) return;
    // DEBUG: session event trace
    try { appendFileSync('/tmp/trident-hook-debug.log', `[${Date.now()}] SESSION_EVENT: fired | type=${(input.event as { type?: string })?.type}\n`); } catch { /* Debug logging non-fatal — plugin loading continues regardless */ }
    const event = input.event as { type?: string; sessionId?: string; agent?: string };
    if (!event?.type) return;
    const sessionId = event.sessionId || '';
    // FIXED: Add fallback chain — opencode may pass agent via different paths
    const agent = event.agent || (input as { agent?: string })?.agent || (input as { session?: { agent?: string } })?.session?.agent || '';
    if (!isTridentAgent(agent)) {
      setCurrentAgent(undefined, sessionId);
      return;
    }
    setCurrentAgent(agent, sessionId);
    if (event.type === 'session.created') {
      handleSessionCreated();
    } else if (event.type === 'session.ended') {
      handleSessionEnded(sessionId);
    }
  };
}

function handleSessionCreated(): void {
}

function handleSessionEnded(sessionId?: string): void {
  clearCurrentAgent(sessionId);
  orchestrator.resetSession(sessionId);
}
