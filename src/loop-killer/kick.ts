// src/loop-killer/kick.ts — THE DEGENERACY-LOOP KILLER — THE KICK
// (2026-08-16 — the operator's directive + POSEIDON_CHAT_KICK_MECHANICS: the
// session.prompt REAL-turn is the ONLY sanctioned kick channel. The operator's
// bans, VERBATIM: "chat.message assistant injection NEVER fires
// (trident-hooks.ts:1243-1252) + text.complete stream mutation is banned
// (2558-2568) — the session.prompt REAL-turn is the ONLY sanctioned kick".
//
// THE KICK OWNS THE SIDE EFFECT — the engine decides (shouldKick), the
// adapter triggers, the kick module FIRES the session.prompt REAL-turn
// carrying the [DEGENERACY LOOP - STOP] message into the session. The kick
// NEVER classifies, NEVER counts, NEVER reads the actor — it takes the
// message + the session id + the client and fires.
//
// THE PROVEN CHANNEL (poseidon-kick.ts:74-117 — the god-loop's wake layer):
//   client.session.prompt({
//     body: { parts: [{ type: 'text', text: message }], system: ..., tools: {} },
//     path: { id: sessionId },
//   })
//   — the EXACT mechanism the PROBLEM_SOLVE phase uses to inject a turn. The
//   kick's REAL-turn injection is the ONLY sanctioned wake path.
//
// THE CLIENT — resolved via the plugin's getter (getClient from
// src/artifacts/llm-generator.ts / getOpencodeClient from
// src/tools/trident-tools.ts — both set at plugin load from input.client).
// The kick RECEIVES the client getter (injected for the tests) — never
// imports the tools module directly (the import-cycle: trident-tools imports
// the LLM generator which imports agent-state — the loop-killer must stay
// dependency-thin).
//
// THE ERROR PATHS (FIRST): the kick's failure path LOGS + PROPAGATES — the
// kick is the side effect, and the side effect precedes the success claim.
// A kick that silently swallows its own failure is theater: the ladder's
// rung 3 promised a behavior change, and a dead kick is a lie. The kick
// returns the LOUD result — the caller decides what the failure means.
//
// THE SYSTEM PROMPT (the kick's injected turn context): the message is a
// system enforcement, not a user prompt — the injected turn's system prompt
// tells the model to ACKNOWLEDGE + ACT (the poseidon-kick pattern).

import { tridentLog } from '../utils.js';
import { LOOP_STOP_MESSAGE } from './config.ts';

/** The injected client — session.prompt must exist on it. */
export interface KickClientLike {
  session?: {
    prompt: (opts: {
      body: {
        parts: Array<{ type: string; text: string }>;
        system: string;
        tools: Record<string, unknown>;
      };
      path: { id: string };
    }) => Promise<unknown>;
  };
}

export interface KickOptions {
  /** The session the kick fires into (the session.prompt target). */
  sessionId: string;
  /** The [DEGENERACY LOOP - STOP] message (the operator's rename — verbatim). */
  message?: string;
  /** The client getter — injected for the tests, the live getter in runtime. */
  getClient: () => KickClientLike | null;
}

export interface KickResult {
  kicked: boolean;
  sessionId: string;
  detail: string;
  /** The message that was (or would have been) fired. */
  message: string;
}

// THE KICK'S SYSTEM PROMPT — the injected turn's frame: the message is a
// system enforcement from the loop-killer state machine, not a user prompt.
// The model MUST acknowledge + change its behavior (the poseidon-kick
// pattern — the model's next turn sees the kick as the newest instruction).
const KICK_SYSTEM_PROMPT =
  'You are the Trident engineering machine. A system enforcement message ' +
  'from the DEGENERACY-LOOP KILLER follows — it is NOT a user prompt. ' +
  'Read it, acknowledge it, and CHANGE YOUR BEHAVIOR accordingly: the ' +
  'identical dispatch input that keeps re-firing is the degeneracy loop, ' +
  'and the loop is being stopped. Do not re-fire the identical input. ' +
  'Change the input, the approach, or the target.';

/**
 * Fires the [DEGENERACY LOOP - STOP] kick into the session via the
 * session.prompt REAL-turn — the ONLY sanctioned kick channel
 * (POSEIDON_CHAT_KICK_MECHANICS). THE BANS RESPECTED: NO chat.message
 * assistant injection, NO text.complete stream mutation.
 *
 * ERROR PATH FIRST: a missing client or a failed session.prompt is a LOUD
 * result (kicked:false + the named detail) — the kick's failure is never
 * silently swallowed into a pass. The kick is the side effect; the side
 * effect precedes the success claim.
 */
export async function fireKick(opts: KickOptions): Promise<KickResult> {
  const sessionId = typeof opts?.sessionId === 'string' && opts.sessionId.trim()
    ? opts.sessionId.trim()
    : 'default';
  const message = typeof opts?.message === 'string' && opts.message.trim()
    ? opts.message
    : LOOP_STOP_MESSAGE + ' the dispatch has re-fired with the identical input — the degeneracy loop is STOPPED. Change the input, the approach, or the target.';

  const client = typeof opts?.getClient === 'function' ? opts.getClient() : null;
  if (!client || !client.session || typeof client.session.prompt !== 'function') {
    const detail = 'NO_CLIENT_OR_PROMPT: the session.prompt channel is unavailable — the kick cannot fire';
    tridentLog('ERROR', 'loop-killer', 'Kick failed for session ' + sessionId + ': ' + detail);
    return { kicked: false, sessionId, detail, message };
  }

  try {
    await client.session.prompt({
      body: {
        parts: [{ type: 'text', text: message }],
        system: KICK_SYSTEM_PROMPT,
        tools: {},
      },
      path: { id: sessionId },
    });
    tridentLog('INFO', 'loop-killer', 'Kick fired into session ' + sessionId + ': ' + message.substring(0, 60));
    return { kicked: true, sessionId, detail: 'KICK_POSTED', message };
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e);
    tridentLog('ERROR', 'loop-killer', 'Kick failed for session ' + sessionId + ': ' + errMsg.slice(0, 300));
    return { kicked: false, sessionId, detail: errMsg.slice(0, 300), message };
  }
}
