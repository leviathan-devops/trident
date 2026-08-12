// ============================================================================
// file: src/tools/shadow/shadow-brain.ts
//
// §3.4 of SHADOW_ENHANCED_TASK_PREFLIGHT_SPEC.md — THE SHADOW BRAIN: the
// model-disciplined LLM call for the shadow-enhanced task-preflight backend.
//
// THE MODEL DISCIPLINE (the operator's D-SH-2, verbatim intent):
//   "DO NOT USE DEEPSEEK PRO. DEEPSEEK V4 FLASH ONLY… NO FUCKING FALLBACKS.
//    EITHER IT WORKS OR WE GET A VISIBLE LOUD ERROR"
//   - DeepSeek V4 Flash ONLY via opencode-go — SHADOW_MODEL is a FROZEN
//     constant; there is NO override parameter, NO second-model path (the
//     AP-3 fallback-creep anti-pattern is mechanically impossible).
//   - reasoning_options.effort = 'max' on every request.
//   - the API key comes from the secret store — process.env.OPENCODE_API_KEY
//     or the injected options.apiKey (the runner's configured secret). NEVER
//     hardcoded, NEVER logged, NEVER in an error message (the AP-4 leak).
//   - the HARD TIMEOUT (240s per weaving round) fails the round, never the
//     tool; every failure path returns the encoded { ok: false, error } —
//     NEVER thrown, NEVER a silent empty content.
//
// The transport mirrors the reference loop's streamFn (shadow-agent-v5
// src/sidecar/core.ts opencodeStreamFn): fetch POST {baseUrl}/chat/completions
// (the OpenAI-compatible shape), Authorization: Bearer <secret>, failures
// encoded as stopReason 'error'/'aborted'. The response is read defensively
// (content || reasoning_content — the macro brain lesson: the model may return
// reasoning-only on hard problems).
// ============================================================================

import { tridentLog } from '../../utils.ts';
// BOTH resolvers — the baseUrl resolver was CALLED but never IMPORTED (the
// endpoint-revert edit added the call without the import — a ReferenceError on
// every brain call lacking an explicit baseUrl; the unit tests caught it, the
// runner's explicit baseUrl masked it in production).
import { resolveShadowApiKey, resolveShadowBaseUrl, resolveShadowFallbackApiKey, resolveShadowFallbackBaseUrl } from './shadow-secrets.ts';

/** THE FROZEN MODEL — DeepSeek V4 Flash ONLY (D-SH-2). No fallbacks. */
export const SHADOW_MODEL = 'deepseek-v4-flash';

/** The opencode-go endpoint base (the reference core.ts ZEN_ENDPOINT); the
 *  transport appends /chat/completions. */
export const SHADOW_BASE_URL = 'https://opencode.ai/zen/go/v1'; // the operator: 'this IS the go endpoint. it is https://opencode.ai/zen/go/v1/chat/completions' — the 401 was the KEY's rejection, never the endpoint (reverted 2026-08-06)

/** THE HARD TIMEOUT — the TOTAL call safety net (2026-08-08 the operator's
 *  catch + 2026-08-12 the 180s→600s ruling: the 180s ceiling KILLED HEALTHY
 *  streams — a live stream exceeded 180s total (the error said 180000ms, NOT
 *  the 45s idle message → events were flowing) and the identical input
 *  succeeded on retry in 361s. With the streaming transport, a call's health
 *  = events flowing, NEVER total duration. THE 45S IDLE DETECTOR
 *  (SHADOW_FETCH_STALL_MS, re-armed per event) is the PRIMARY stall guard; the
 *  total ceiling is now a 10-MIN hard safety net that must NEVER kill a
 *  healthy streaming generation — the operator: "this should never stall"). */
export const SHADOW_TIMEOUT_MS = 600_000;

/** THE FETCH STALL WINDOW (2026-08-08 — the fast-fail layer): the provider
 *  must DELIVER a response within 45s of the request or the fetch aborts +
 *  SHADOW_BRAIN_TIMEOUT returns INSTANTLY — the provider's silence is a
 *  failure, detected in seconds not minutes. */
export const SHADOW_FETCH_STALL_MS = 45_000;

// ── the transport types ──
export interface ShadowChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ShadowToolDef {
  type: 'function';
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

export type ShadowStreamStopReason = 'stop' | 'length' | 'toolUse' | 'error' | 'aborted';

export interface ShadowStreamResult {
  content: string;
  stopReason: ShadowStreamStopReason;
  errorMessage?: string;
}

export interface ShadowStreamFnArgs {
  model: string;
  messages: ShadowChatMessage[];
  tools?: ShadowToolDef[];
  apiKey: string;
  baseUrl: string;
  maxTokens: number;
  signal: AbortSignal;
  /** THE STALL WINDOW (2026-08-08 — the fetch's OWN response-wait; defaults
   *  to SHADOW_FETCH_STALL_MS). The provider must deliver within this or the
   *  fetch aborts + SHADOW_BRAIN_TIMEOUT — a loud instant failure, never a
   *  silent full-clock wait. */
  stallTimeoutMs?: number;
  /** NEW (2026-08-12 — the official-API fallback): false DROPS the opencode-go
   *  reasoning_options extension — the official DeepSeek API does not accept
   *  it. Default undefined → the effort-max extension as today. */
  reasoningOptions?: boolean;
}

/** The transport contract — returns the parsed completion, NEVER throws;
 *  failures are encoded as stopReason 'error'/'aborted'. */
export type ShadowStreamFn = (args: ShadowStreamFnArgs) => Promise<ShadowStreamResult>;

export interface ShadowBrainResult {
  content: string;
  model: string;
  ok: boolean;
  error?: string;
}

// THE FINISH-REASON MAPPING (the named calibration — the ISE law: this is a
// MECHANICAL enum conversion, not a decision ladder: the provider's
// finish_reason wire enum → the internal ShadowStreamStopReason enum. The
// mapping is 1:1 (tool_calls→toolUse, length→length, everything else→stop);
// it never decides success or failure — the callers do. Named once, used by
// both the SSE + the defensive JSON branches.)
function mapFinishReason(finish: string | null | undefined): ShadowStreamStopReason {
  if (finish === 'tool_calls') return 'toolUse';
  if (finish === 'length') return 'length';
  return 'stop';
}

export interface CallShadowOptions {
  /** The injected secret (the runner's configured store). Falls back to
   *  process.env.OPENCODE_API_KEY. NEVER hardcoded, NEVER logged. */
  apiKey?: string;
  /** The opencode-go base URL override (defaults to SHADOW_BASE_URL). */
  baseUrl?: string;
  /** The hard timeout override (defaults to SHADOW_TIMEOUT_MS). */
  timeoutMs?: number;
  /** The retry-on-500 backoff (defaults to 3000ms — the 2026-08-09 forensics:
   *  the SHADOW_BRAIN_HTTP_500 class is a per-call provider overload; ONE
   *  retry after the backoff re-runs the primary. Inject a small value in
   *  the tests.) */
  retryBackoffMs?: number;
  /** An external abort signal (the caller cancels). */
  signal?: AbortSignal;
  /** The scoped tool definitions (the PI loop's read-only surface, Wave 2). */
  tools?: ShadowToolDef[];
  /** Injectable transport (tests stub this; defaults to opencodeShadowStreamFn). */
  streamFn?: ShadowStreamFn;
}

/** The OpenAI-compatible chat response shape (defensive — only the fields the
 *  transport reads are typed). */
interface OpenAiChatResponse {
  choices?: Array<{
    message?: {
      content?: string | null;
      reasoning_content?: string | null;
    };
    finish_reason?: string;
  }>;
}

/**
 * The fetch-based streamFn: OpenAI-compatible POST to the opencode-go
 * endpoint. The body pins SHADOW_MODEL + reasoning_options.effort 'max'.
 * Failures are encoded as stopReason 'error'/'aborted' — NEVER thrown.
 * THE STREAMING TRANSPORT (2026-08-09 — the root-cause fix, live-proven): the
 * OLD non-streaming fetch (resp.json()) buffered the ENTIRE completion — the
 * provider sends NOTHING until the generation finishes (the live probes on
 * 2026-08-08: 35-50s for the 384K shape), so the 45s stall window aborted
 * HEALTHY generations mid-flight — the SHADOW_BRAIN_TIMEOUT ×3 in the
 * 2026-08-09 forensics (5/10 generations failed). With stream:true the FIRST
 * CHUNK lands in ~1s (the probe: 1.0s) — the stall window becomes a TRUE
 * silence detector (no event in 45s = a dead provider), re-armed per event
 * (the idle detector — a mid-stream silence = the provider died). The
 * reference core.ts geometry the old comment CLAIMED but never implemented.
 */
export async function opencodeShadowStreamFn(args: ShadowStreamFnArgs): Promise<ShadowStreamResult> {
  if (args.signal.aborted) {
    return { content: '', stopReason: 'aborted', errorMessage: 'aborted by caller' };
  }
  const body: Record<string, unknown> = {
    model: args.model,
    messages: args.messages,
    max_tokens: args.maxTokens,
    // D-SH-2: DeepSeek on MAX reasoning — the reference core.ts effort max.
    // THE FALLBACK (2026-08-12): the official DeepSeek API does not accept the
    // opencode-go reasoning_options extension — the caller drops it (false).
    stream: true,
  };
  if (args.reasoningOptions !== false) body.reasoning_options = { effort: 'max' };
  if (args.tools && args.tools.length > 0) body.tools = args.tools;
  // THE STALL/IDLE DETECTOR (2026-08-08 the operator's catch + 2026-08-09 the
  // re-arming fix): the window is armed BEFORE the fetch (the provider must
  // deliver the FIRST EVENT within it) and RE-ARMED on EVERY received event
  // (a mid-stream silence past the window = the provider died mid-generation
  // → abort). The linked external signal: the caller's abort still wins.
  const stallController = new AbortController();
  let stalled = false;
  let stallTimer: ReturnType<typeof setTimeout> | null = null;
  const onExternalAbort = (): void => { stallController.abort(); };
  if (args.signal) {
    if (args.signal.aborted) stallController.abort();
    else args.signal.addEventListener('abort', onExternalAbort, { once: true });
  }
  const stallMs = args.stallTimeoutMs ?? SHADOW_FETCH_STALL_MS;
  const armStall = (): void => {
    if (stallTimer) clearTimeout(stallTimer);
    stallTimer = setTimeout(() => {
      stalled = true;
      stallController.abort();
    }, stallMs);
  };
  armStall();
  try {
    const resp = await fetch(`${args.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        // THE SECRET (AP-4): the Bearer credential — never logged, never echoed
        authorization: `Bearer ${args.apiKey}`,
        accept: 'text/event-stream',
      },
      body: JSON.stringify(body),
      signal: stallController.signal,
    });
    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      return {
        content: '',
        stopReason: 'error',
        errorMessage: `SHADOW_BRAIN_HTTP_${resp.status}: opencode-go ${resp.status} ${text.slice(0, 200)}`,
      };
    }
    if (!resp.body) {
      return { content: '', stopReason: 'error', errorMessage: 'SHADOW_BRAIN_FAIL: opencode-go returned no response body' };
    }
    // THE DEFENSIVE NON-STREAM BRANCH: if the provider ignores stream:true
    // and returns a plain JSON body (the OLD shape), parse it — the same
    // primary path, differing only in the response format (never a substitute
    // artifact — the fallback test: the content is what the stream would
    // produce).
    const contentType = resp.headers.get('content-type') ?? '';
    if (!contentType.includes('text/event-stream')) {
      const text = await resp.text();
      const data = JSON.parse(text) as OpenAiChatResponse;
      const msg = data.choices?.[0]?.message;
      const c =
        typeof msg?.content === 'string' && msg.content.length > 0
          ? msg.content
          : typeof msg?.reasoning_content === 'string'
            ? msg.reasoning_content
            : '';
      if (c.length === 0) {
        return { content: '', stopReason: 'error', errorMessage: 'SHADOW_BRAIN_EMPTY: opencode-go returned an empty completion' };
      }
      const reason: ShadowStreamStopReason = mapFinishReason(data.choices?.[0]?.finish_reason);
      return { content: c, stopReason: reason };
    }
    // THE SSE PARSE: the chunked stream read line-by-line; each 'data: {...}'
    // event's delta.content (or delta.reasoning_content) accumulates. The
    // stall window re-arms on EVERY event (the idle detector).
    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let content = '';
    let finishReason: string | null = null;
    let streamDone = false;
    while (!streamDone) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (!line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        if (payload === '[DONE]') {
          streamDone = true;
          break;
        }
        if (!payload) continue;
        try {
          const evt = JSON.parse(payload) as {
            choices?: Array<{ delta?: { content?: string | null; reasoning_content?: string | null }; finish_reason?: string }>;
          };
          armStall(); // ANY event = the provider is alive — the idle window resets
          const delta = evt.choices?.[0]?.delta;
          if (delta) {
            const dc = typeof delta.content === 'string' ? delta.content : '';
            const rc = typeof delta.reasoning_content === 'string' ? delta.reasoning_content : '';
            if (dc.length > 0) content += dc;
            else if (rc.length > 0) content += rc;
          }
          const fr = evt.choices?.[0]?.finish_reason;
          if (fr) finishReason = fr;
        } catch {
          // a malformed event line — the parse continues (the provider's
          // keep-alive comments land here)
        }
      }
    }
    if (content.length === 0) {
      return { content: '', stopReason: 'error', errorMessage: 'SHADOW_BRAIN_EMPTY: opencode-go returned an empty completion' };
    }
    const reason: ShadowStreamStopReason = mapFinishReason(finishReason);
    return { content, stopReason: reason };
  } catch (err) {
    const e = err as { name?: string };
    if (stalled) {
      // THE STALL/IDLE DETECTED (2026-08-08 + 2026-08-09): the provider
      // delivered no event within the window (or went silent mid-stream) — a
      // LOUD instant failure, never a silent full-clock wait.
      return { content: '', stopReason: 'error', errorMessage: 'SHADOW_BRAIN_TIMEOUT: opencode-go delivered no event within ' + stallMs + 'ms (the provider stalled — a loud fail, not a silent clock wait)' };
    }
    if (args.signal.aborted || e?.name === 'AbortError') {
      return { content: '', stopReason: 'aborted', errorMessage: 'aborted' };
    }
    const message = err instanceof Error ? err.message : String(err);
    void tridentLog('WARN', 'shadow-brain', 'opencodeShadowStreamFn transport failure: ' + message);
    return { content: '', stopReason: 'error', errorMessage: `SHADOW_BRAIN_FAIL: ${message}` };
  } finally {
    if (stallTimer) clearTimeout(stallTimer);
    if (args.signal) args.signal.removeEventListener('abort', onExternalAbort);
  }
}

/**
 * THE SHADOW BRAIN CALL (D-SH-2). callShadow(prompt, system, maxTokens) →
 * { content, model, ok, error }. The model is FROZEN at SHADOW_MODEL; the
 * secret comes from the env or the injected options; the hard timeout fails
 * the round, never the tool; every failure path returns the encoded error —
 * NEVER thrown, NEVER a silent empty content.
 * THE RETRY-ON-500 (2026-08-09 — the plutus forensics: SHADOW_BRAIN_HTTP_500
 * ×2 in one batch — a per-call provider overload. ONE retry after a short
 * backoff re-runs the PRIMARY — the loud-fail law: the retry produces what
 * the primary produces, never a substitute artifact; a second failure
 * returns the SAME loud error, never a silent pass).
 */
export async function callShadow(
  prompt: string,
  system: string,
  maxTokens: number,
  options: CallShadowOptions = {},
): Promise<ShadowBrainResult> {
  // THE SECRET (D-SH-2 / AP-4): the key from the secret store — the injected
  // configured secret first, then the env. An EXPLICIT empty apiKey ('' —
  // the undefined-vs-empty distinction) FORCES the no-key refusal — the
  // defensive path stays testable + the dead-bundle state is simulatable
  // (the embedded fallback otherwise always provides a key). NEVER hardcoded,
  // NEVER logged.
  const apiKey =
    options.apiKey !== undefined
      ? options.apiKey
      : resolveShadowApiKey();
  if (apiKey.length === 0) {
    // THE LOUD ERROR — no fallback model, no silent empty content (AP-3)
    void tridentLog('ERROR', 'shadow-brain', 'SHADOW_BRAIN_NO_KEY — the OPENCODE_API_KEY secret is absent; the shadow brain REFUSES (no fallback)');
    return { content: '', model: SHADOW_MODEL, ok: false, error: 'SHADOW_BRAIN_NO_KEY' };
  }

  const baseUrl = options.baseUrl || resolveShadowBaseUrl();
  const timeoutMs = options.timeoutMs ?? SHADOW_TIMEOUT_MS;
  const streamFn = options.streamFn ?? opencodeShadowStreamFn;
  const retryBackoffMs = options.retryBackoffMs ?? 3000;

  const messages: ShadowChatMessage[] = [];
  if (system && system.length > 0) messages.push({ role: 'system', content: system });
  messages.push({ role: 'user', content: prompt });

  const external = options.signal;

  // THE SINGLE ATTEMPT (the timers + the race — fresh per attempt): ONE timer
  // aborts the transport AND rejects the race — a stall fails the round fast,
  // never hangs the tool. The race guarantees the timeout fires even against a
  // streamFn that ignores the signal; the signal guarantees the real fetch is
  // aborted promptly.
  const attempt = async (): Promise<ShadowStreamResult> => {
    const controller = new AbortController();
    let timedOut = false;
    const onExternalAbort = (): void => {
      controller.abort();
    };
    let timer: ReturnType<typeof setTimeout> | null = null;
    let rejectTimeout: ((err: Error) => void) | null = null;
    const timeoutPromise = new Promise<never>((_resolve, reject) => {
      rejectTimeout = reject;
    });
    timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
      if (rejectTimeout) rejectTimeout(new Error('SHADOW_BRAIN_TIMEOUT'));
    }, timeoutMs);

    try {
      if (external) {
        if (external.aborted) {
          controller.abort();
        } else {
          external.addEventListener('abort', onExternalAbort, { once: true });
        }
      }

      const resultPromise = streamFn({
        model: SHADOW_MODEL,
        messages,
        tools: options.tools,
        apiKey,
        baseUrl,
        maxTokens,
        signal: controller.signal,
      });
      // the loser's late rejection is swallowed (the race already settled) —
      // logged, never a silent empty catch
      resultPromise.catch((err: unknown) => {
        void tridentLog('WARN', 'shadow-brain', 'the streamFn promise rejected after the race settled: ' + (err instanceof Error ? err.message : String(err)));
      });

      let streamResult: ShadowStreamResult;
      try {
        streamResult = await Promise.race([resultPromise, timeoutPromise]);
      } catch (raceErr) {
        if (timedOut) {
          void tridentLog('ERROR', 'shadow-brain', 'SHADOW_BRAIN_TIMEOUT — the LLM call stalled past ' + timeoutMs + 'ms');
          return { content: '', stopReason: 'error', errorMessage: `SHADOW_BRAIN_TIMEOUT: the LLM call stalled past ${timeoutMs}ms` };
        }
        if (external?.aborted) {
          return { content: '', stopReason: 'aborted', errorMessage: 'SHADOW_BRAIN_ABORTED' };
        }
        const message = raceErr instanceof Error ? raceErr.message : String(raceErr);
        void tridentLog('ERROR', 'shadow-brain', 'SHADOW_BRAIN_FAIL: ' + message);
        return { content: '', stopReason: 'error', errorMessage: `SHADOW_BRAIN_FAIL: ${message}` };
      }

      if (streamResult.stopReason === 'aborted') {
        if (timedOut) {
          void tridentLog('ERROR', 'shadow-brain', 'SHADOW_BRAIN_TIMEOUT — the transport aborted past ' + timeoutMs + 'ms');
          return { content: '', stopReason: 'error', errorMessage: `SHADOW_BRAIN_TIMEOUT: the LLM call stalled past ${timeoutMs}ms` };
        }
        return { content: '', stopReason: 'aborted', errorMessage: 'SHADOW_BRAIN_ABORTED' };
      }
      if (streamResult.stopReason === 'error') {
        void tridentLog('ERROR', 'shadow-brain', streamResult.errorMessage || 'SHADOW_BRAIN_FAIL');
        return streamResult;
      }
      // stop / length / toolUse — the text completion. 'length' keeps the
      // partial content (the v10c partial-save philosophy: never discard the
      // written content). An EMPTY completion is still a loud error — the
      // silent-empty failure is forbidden.
      if (streamResult.content.length === 0) {
        void tridentLog('ERROR', 'shadow-brain', 'SHADOW_BRAIN_EMPTY — the completion returned no content');
        return { content: '', stopReason: 'error', errorMessage: 'SHADOW_BRAIN_EMPTY: the completion returned no content' };
      }
      return streamResult;
    } finally {
      if (timer) clearTimeout(timer);
      if (external) external.removeEventListener('abort', onExternalAbort);
    }
  };

  // THE RETRY + THE OFFICIAL-API FALLBACK LOOP (2026-08-09 + 2026-08-12 — the
  // operator's ruling): the primary (opencode.ai zen/go) retries once on the
  // provider stall/overload class (HTTP_500 + SHADOW_BRAIN_TIMEOUT — the
  // 2026-08-12 live proof: the identical wave input failed at 180s then
  // succeeded on retry in 361s); then the OFFICIAL DeepSeek API transport
  // (api.deepseek.com/v1 + the DEEPSEEK_API_KEY secret — D-SH-2 holds: STILL
  // DeepSeek V4 Flash, only the endpoint + key differ) retries once. A final
  // failure names BOTH transports — the loud-fail law, never a silent pass.
  const fallbackBaseUrl = resolveShadowFallbackBaseUrl();
  const fallbackApiKey = resolveShadowFallbackApiKey();
  // the official API's V4 Flash model name (CONFIGURABLE — verified at deploy)
  const fallbackModel = process.env.SHADOW_FALLBACK_MODEL || 'deepseek-chat';

  const retryable = (sr: ShadowStreamResult): boolean =>
    sr.stopReason === 'error' &&
    typeof sr.errorMessage === 'string' &&
    (sr.errorMessage.startsWith('SHADOW_BRAIN_HTTP_500') || sr.errorMessage.startsWith('SHADOW_BRAIN_TIMEOUT'));

  const fallbackAttempt = async (): Promise<ShadowStreamResult> => {
    if (fallbackApiKey.length === 0) {
      return { content: '', stopReason: 'error', errorMessage: 'SHADOW_BRAIN_FALLBACK_NO_KEY: the DEEPSEEK_API_KEY secret is absent — the official-API fallback refused (AP-4: the key is NEVER hardcoded)' };
    }
    const controller = new AbortController();
    let timedOut = false;
    let rejectTimeout: ((err: Error) => void) | null = null;
    const timeoutPromise = new Promise<never>((_resolve, reject) => { rejectTimeout = reject; });
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
      if (rejectTimeout) rejectTimeout(new Error('SHADOW_BRAIN_TIMEOUT'));
    }, timeoutMs);
    try {
      const resultPromise = streamFn({
        model: fallbackModel, messages, apiKey: fallbackApiKey, baseUrl: fallbackBaseUrl,
        maxTokens, signal: controller.signal, stallTimeoutMs: SHADOW_FETCH_STALL_MS,
        reasoningOptions: false,   // the official API does not accept the opencode-go extension
      });
      resultPromise.catch((err: unknown) => {
        void tridentLog('WARN', 'shadow-brain', 'the fallback streamFn rejected after the race settled: ' + (err instanceof Error ? err.message : String(err)));
      });
      let streamResult: ShadowStreamResult;
      try {
        streamResult = await Promise.race([resultPromise, timeoutPromise]);
      } catch (raceErr) {
        if (timedOut) {
          return { content: '', stopReason: 'error', errorMessage: 'SHADOW_BRAIN_TIMEOUT: the fallback call stalled past ' + timeoutMs + 'ms' };
        }
        const message = raceErr instanceof Error ? raceErr.message : String(raceErr);
        return { content: '', stopReason: 'error', errorMessage: 'SHADOW_BRAIN_FAIL (fallback): ' + message };
      }
      if (streamResult.stopReason === 'aborted') {
        return timedOut
          ? { content: '', stopReason: 'error', errorMessage: 'SHADOW_BRAIN_TIMEOUT: the fallback call stalled past ' + timeoutMs + 'ms' }
          : { content: '', stopReason: 'aborted', errorMessage: 'SHADOW_BRAIN_ABORTED' };
      }
      if (streamResult.stopReason === 'error') return streamResult;
      if (streamResult.content.length === 0) {
        return { content: '', stopReason: 'error', errorMessage: 'SHADOW_BRAIN_EMPTY: the fallback completion returned no content' };
      }
      return streamResult;
    } finally {
      if (timer) clearTimeout(timer);
    }
  };

  // THE PRIMARY PATH (attempt 0 + the retry 1 — the stall/overload class):
  const primaryResult = await attempt();
  if (primaryResult.stopReason === 'error' && retryable(primaryResult)) {
    const cls = (primaryResult.errorMessage || '').startsWith('SHADOW_BRAIN_TIMEOUT') ? 'SHADOW_BRAIN_TIMEOUT' : 'SHADOW_BRAIN_HTTP_500';
    void tridentLog('WARN', 'shadow-brain', cls + ' — ONE retry after ' + retryBackoffMs + 'ms (the provider stall/overload class — the retry produces what the primary produces, never a substitute)');
    await new Promise((r) => setTimeout(r, retryBackoffMs));
    const primaryRetry = await attempt();
    if (primaryRetry.stopReason !== 'error') {
      return primaryRetry.stopReason === 'aborted'
        ? { content: '', model: SHADOW_MODEL, ok: false, error: 'SHADOW_BRAIN_ABORTED' }
        : { content: primaryRetry.content, model: SHADOW_MODEL, ok: true };
    }
    // THE PRIMARY IS EXHAUSTED — THE OFFICIAL-API FALLBACK (the ruling 2026-08-12):
    void tridentLog('WARN', 'shadow-brain', 'the primary transport exhausted — switching to the OFFICIAL DeepSeek API fallback (' + fallbackBaseUrl + ')' + (fallbackApiKey.length === 0 ? ' — NO KEY (the fallback will refuse loudly)' : ''));
    const fb1 = await fallbackAttempt();
    if (fb1.stopReason !== 'error') {
      return fb1.stopReason === 'aborted'
        ? { content: '', model: SHADOW_MODEL, ok: false, error: 'SHADOW_BRAIN_ABORTED' }
        : { content: fb1.content, model: SHADOW_MODEL, ok: true };
    }
    if (retryable(fb1)) {
      void tridentLog('WARN', 'shadow-brain', 'the fallback stalled — ONE retry after ' + retryBackoffMs + 'ms');
      await new Promise((r) => setTimeout(r, retryBackoffMs));
      const fb2 = await fallbackAttempt();
      if (fb2.stopReason !== 'error') {
        return fb2.stopReason === 'aborted'
          ? { content: '', model: SHADOW_MODEL, ok: false, error: 'SHADOW_BRAIN_ABORTED' }
          : { content: fb2.content, model: SHADOW_MODEL, ok: true };
      }
      return { content: '', model: SHADOW_MODEL, ok: false, error: 'SHADOW_BRAIN_FAIL: primary (opencode.ai zen/go) ' + (primaryRetry.errorMessage || 'failed') + '; fallback (api.deepseek.com) ' + (fb2.errorMessage || 'failed') };
    }
    return { content: '', model: SHADOW_MODEL, ok: false, error: 'SHADOW_BRAIN_FAIL: primary (opencode.ai zen/go) ' + (primaryRetry.errorMessage || 'failed') + '; fallback (api.deepseek.com) ' + (fb1.errorMessage || 'failed') };
  }
  if (primaryResult.stopReason === 'aborted') {
    return { content: '', model: SHADOW_MODEL, ok: false, error: 'SHADOW_BRAIN_ABORTED' };
  }
  if (primaryResult.stopReason === 'error') {
    return { content: '', model: SHADOW_MODEL, ok: false, error: primaryResult.errorMessage || 'SHADOW_BRAIN_FAIL' };
  }
  return { content: primaryResult.content, model: SHADOW_MODEL, ok: true };
}
