import { appendFileSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { Hooks } from '@opencode-ai/plugin';
import { isTridentAgent } from '../identity/agent-identity.js';
import { setCurrentAgent, clearCurrentAgent } from './agent-state.js';
import { orchestrator } from '../orchestrator.js';

export function createSessionHook(): Hooks['event'] {
  return async (input: { event: import('@opencode-ai/sdk').Event }) => {
    if (!input) return;
    // DEBUG: session event trace
    try { appendFileSync(path.join(os.tmpdir(), 'trident-hook-debug.log'), `[${Date.now()}] SESSION_EVENT: fired | type=${String((input.event as { type?: string })?.type ?? '')}\n`); } catch (e) { console.error('[SessionHook] error:', e); return; }
    const event = input.event as { type?: string; sessionId?: string; agent?: string };
    if (!event?.type) return;
    const sessionId = event.sessionId || '';
    // FIXED: Add fallback chain — opencode may pass agent via different paths
    const agent = event.agent || (input as { agent?: string })?.agent || (input as { session?: { agent?: string } })?.session?.agent || '';
    // Events with NO agent info must NOT touch state — session.updated/diff/message
    // events fire constantly without agent data, and writing undefined with an empty
    // sessionId lands on the shared 'default' key, nulling the trident identity that
    // hooks without sessionID (messages.transform) depend on.
    if (!agent) return;
    if (!isTridentAgent(agent)) {
      // Only clear the SPECIFIC session — never the shared 'default' fallback key.
      if (sessionId && sessionId !== 'default') setCurrentAgent(undefined, sessionId);
      return;
    }
    setCurrentAgent(agent, sessionId || 'default');
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
  // Only clear the SPECIFIC session — never the shared 'default' fallback key.
  if (sessionId && sessionId !== 'default') {
    clearCurrentAgent(sessionId);
    orchestrator.resetSession(sessionId);
  }
}
