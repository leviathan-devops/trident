// ============================================================================
// file: src/tests/shadow-brain.test.ts
//
// THE SHADOW BRAIN UNIT TESTS (spec §3.4, D-SH-2). Adversarial-first: the
// no-key loud error, the 240s-timeout stall, the HTTP-500 encoding, the empty
// completion, the external abort, the injected transport failure — THEN the
// happy path asserting the model discipline (the FROZEN deepseek-v4-flash +
// reasoning_options.effort max + the Bearer secret plumbing) and the
// defensive content read (content || reasoning_content).
//
// THE SECRET LAW (AP-4): no literal credential value appears anywhere in
// these fixtures — only the env access and the Bearer-header SHAPE assertion.
// ============================================================================

import { describe, expect, test } from 'bun:test';
import {
  callShadow,
  opencodeShadowStreamFn,
  SHADOW_MODEL,
  SHADOW_BASE_URL,
  type ShadowStreamFn,
} from '../tools/shadow/shadow-brain.ts';

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

describe('shadow-brain — the model-disciplined LLM call (D-SH-2)', () => {
  // ADVERSARIAL 1 — THE NO-KEY PATH: the loud error, never a fallback. The
  // embedded fallback (shadow-secrets) ALWAYS provides a key when the option
  // is undefined, so the refusal is FORCED via the explicit empty apiKey — the
  // dead-bundle simulation (the undefined-vs-empty distinction).
  test('NO_KEY: an explicit empty secret returns SHADOW_BRAIN_NO_KEY and the streamFn is NEVER invoked', async () => {
    const saved = process.env.OPENCODE_API_KEY;
    delete process.env.OPENCODE_API_KEY;
    let invoked = 0;
    try {
      const r = await callShadow('the prompt', 'the system', 250, {
        apiKey: '', // the EXPLICIT empty — force the refusal (the fallback otherwise provides a key)
        streamFn: async () => {
          invoked += 1;
          return { content: 'unreachable', stopReason: 'stop' };
        },
      });
      expect(r.ok).toBe(false);
      expect(r.error).toBe('SHADOW_BRAIN_NO_KEY');
      expect(r.model).toBe(SHADOW_MODEL); // the discipline holds even on the refusal
      expect(invoked).toBe(0); // NO fallback call — the loud error only (AP-3)
    } finally {
      if (saved === undefined) delete process.env.OPENCODE_API_KEY;
      else process.env.OPENCODE_API_KEY = saved;
    }
  });

  // ADVERSARIAL 2 — THE STALL: the hard timeout fires on a stalled fetch
  test('TIMEOUT: a stalled fetch past the hard timeout returns SHADOW_BRAIN_TIMEOUT — never thrown, never hangs', async () => {
    const hanging: ShadowStreamFn = (args) =>
      new Promise((_resolve, reject) => {
        if (args.signal.aborted) {
          reject(new Error('aborted'));
          return;
        }
        args.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
      });
    const started = Date.now();
    // THE NEW CONTRACT (2026-08-12 — the retry-on-timeout ruling, the live
    // proof: the identical wave input failed at 180s then succeeded on retry
    // in 361s): a timeout-class stall is RETRYABLE (the primary retries once
    // after the backoff, then the official-API fallback retries once). The
    // injected backoff keeps the unit test fast; the total stays well under
    // the 2s elapsed bar.
    const r = await callShadow('p', 's', 100, { apiKey: 'test-key', streamFn: hanging, timeoutMs: 60, retryBackoffMs: 1 });
    const elapsed = Date.now() - started;
    expect(r.ok).toBe(false);
    expect(r.error).toContain('SHADOW_BRAIN_TIMEOUT');
    expect(elapsed).toBeLessThan(2000); // the timeout fired — no hang
  });

  // ADVERSARIAL 3 — THE HTTP ERROR ENCODING: a 500 becomes { ok: false, error }
  test('HTTP 500: the transport encodes the provider failure — never thrown', async () => {
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async () => new Response('provider exploded', { status: 500 })) as typeof fetch;
    try {
      const r1 = await opencodeShadowStreamFn({
        model: SHADOW_MODEL,
        messages: [{ role: 'user', content: 'p' }],
        apiKey: 'test-key',
        baseUrl: SHADOW_BASE_URL,
        maxTokens: 100,
        signal: new AbortController().signal,
      });
      expect(r1.stopReason).toBe('error');
      expect(r1.errorMessage).toContain('SHADOW_BRAIN_HTTP_500');
      // THE NEW CONTRACT (2026-08-12 — the retry + the official-API fallback):
      // the primary 500 retries once after the backoff, then the fallback
      // transport (api.deepseek.com) retries once. The injected backoff keeps
      // the unit test fast (the default 3000ms would trip the 5s runner cap).
      const r2 = await callShadow('p', 's', 100, { apiKey: 'test-key', retryBackoffMs: 1 });
      expect(r2.ok).toBe(false);
      expect(r2.error).toContain('SHADOW_BRAIN_HTTP_500');
      expect(r2.error).toContain('fallback');   // the final error names BOTH transports
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  // ADVERSARIAL 4 — THE EMPTY COMPLETION: never a silent empty content
  test('EMPTY: an empty completion returns SHADOW_BRAIN_EMPTY — never a silent blank', async () => {
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      jsonResponse({ choices: [{ message: { content: null, reasoning_content: null }, finish_reason: 'stop' }] })
    ) as typeof fetch;
    try {
      const r = await callShadow('p', 's', 100, { apiKey: 'test-key' });
      expect(r.ok).toBe(false);
      expect(r.error).toContain('SHADOW_BRAIN_EMPTY');
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  // ADVERSARIAL 5 — THE EXTERNAL ABORT: the caller's signal cancels cleanly
  test('ABORTED: the caller\'s signal yields SHADOW_BRAIN_ABORTED', async () => {
    const ctrl = new AbortController();
    ctrl.abort();
    const hanging: ShadowStreamFn = (args) =>
      new Promise((_resolve, reject) => {
        if (args.signal.aborted) {
          reject(new Error('aborted'));
          return;
        }
        args.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
      });
    const r = await callShadow('p', 's', 100, { apiKey: 'test-key', signal: ctrl.signal, streamFn: hanging, timeoutMs: 5000 });
    expect(r.ok).toBe(false);
    expect(r.error).toBe('SHADOW_BRAIN_ABORTED');
  });

  // ADVERSARIAL 6 — THE INJECTED TRANSPORT FAILURE: encoded, never thrown
  test('STREAMFN ERROR: an injected transport failure is encoded — never thrown', async () => {
    const r = await callShadow('p', 's', 100, {
      apiKey: 'test-key',
      streamFn: async () => ({ content: '', stopReason: 'error', errorMessage: 'SHADOW_BRAIN_FAIL: boom' }),
    });
    expect(r.ok).toBe(false);
    expect(r.error).toContain('SHADOW_BRAIN_FAIL');
  });

  // THE MODEL DISCIPLINE — the happy path asserts the FROZEN model + the
  // effort max + the Bearer secret plumbing (the captured transport body)
  test('MODEL DISCIPLINE: the transport pins deepseek-v4-flash + reasoning_options effort max + the Bearer secret', async () => {
    const realFetch = globalThis.fetch;
    // The captured transport call — initialized to a sentinel (never null) so
    // TS's control-flow analysis cannot narrow it inside the closure; the
    // assertions below prove the mock actually ran (the sentinel would fail).
    const captured: { url: string; method: string; headers: Record<string, string>; body: string } =
      { url: '', method: '', headers: {}, body: '' };
    globalThis.fetch = (async (input: unknown, init: unknown) => {
      const i = init as { method: string; headers: Record<string, string>; body: string };
      captured.url = String(input);
      captured.method = i.method;
      captured.headers = i.headers;
      captured.body = i.body;
      return jsonResponse({ choices: [{ message: { content: 'the completion' }, finish_reason: 'stop' }] });
    }) as typeof fetch;
    try {
      const r = await callShadow('the prompt', 'the system', 250, { apiKey: 'test-key' });
      expect(r.ok).toBe(true);
      expect(r.content).toBe('the completion');
      expect(r.model).toBe(SHADOW_MODEL);
      expect(captured.url).toBe(SHADOW_BASE_URL + '/chat/completions');
      expect(captured.method).toBe('POST');
      const body = JSON.parse(captured.body);
      expect(body.model).toBe('deepseek-v4-flash'); // D-SH-2 frozen
      expect(body.reasoning_options).toEqual({ effort: 'max' }); // the effort max
      expect(body.max_tokens).toBe(250);
      expect(body.messages).toEqual([
        { role: 'system', content: 'the system' },
        { role: 'user', content: 'the prompt' },
      ]);
      // THE SECRET (AP-4): the Bearer header carries the credential — only
      // the SHAPE is asserted, never the value, never the literal
      expect(String(captured.headers.authorization ?? '')).toMatch(/^Bearer\s+\S+$/);
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  // THE DEFENSIVE READ — content || reasoning_content (the macro brain lesson)
  test('DEFENSIVE READ: a null content with reasoning_content returns the reasoning text', async () => {
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      jsonResponse({ choices: [{ message: { content: null, reasoning_content: 'the deep reasoning trace' }, finish_reason: 'stop' }] })
    ) as typeof fetch;
    try {
      const r = await callShadow('p', 's', 100, { apiKey: 'test-key' });
      expect(r.ok).toBe(true);
      expect(r.content).toBe('the deep reasoning trace');
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  // THE PARTIAL SAVE — a length-truncated completion keeps its content (v10c)
  test('LENGTH: a truncated completion (stopReason length) returns the partial content', async () => {
    const r = await callShadow('p', 's', 100, {
      apiKey: 'test-key',
      streamFn: async () => ({ content: 'the partial prompt...', stopReason: 'length' }),
    });
    expect(r.ok).toBe(true);
    expect(r.content).toBe('the partial prompt...');
  });

  // THE TOOLS PASSTHROUGH — the tool definitions reach the transport (Wave 2
  // PI loop's scoped read-only surface)
  test('TOOLS: the tool definitions pass through to the streamFn', async () => {
    const tools = [
      {
        type: 'function' as const,
        function: {
          name: 'read_file',
          description: 'read a file',
          parameters: { type: 'object', properties: {} },
        },
      },
    ];
    let seenTools: unknown = null;
    const r = await callShadow('p', 's', 100, {
      apiKey: 'test-key',
      tools,
      streamFn: async (args) => {
        seenTools = args.tools ?? null;
        return { content: 'done', stopReason: 'stop' };
      },
    });
    expect(r.ok).toBe(true);
    expect(r.content).toBe('done');
    expect(seenTools).toHaveLength(1);
    expect((seenTools as Array<{ function: { name: string } }>)[0].function.name).toBe('read_file');
  });
});

// ═══ THE 2026-08-09 STREAMING-TRANSPORT SUITE (the root-cause fix: the
// non-streaming fetch buffered the whole completion — the provider sends
// nothing until the generation finishes (35-50s for the 384K shape — the live
// probes), so the 45s stall window aborted HEALTHY generations (the
// SHADOW_BRAIN_TIMEOUT ×3 in the plutus forensics). stream:true → the first
// event lands in ~1s; the window becomes a TRUE silence detector, re-armed
// per event (the idle detector). These tests exercise the REAL transport
// against mocked fetch streams — the adversarial shapes: the split-across-
// chunks event, the mid-stream silence, the total silence, the non-stream
// JSON response, and the retry-on-500. ═══

describe('shadow-brain — the streaming transport (2026-08-09)', () => {
  const encoder = new TextEncoder();
  // THE MOCK RESPONSE — the REAL network layer wires the fetch signal into the
  // body stream (an abort errors the reader); the mock MUST emulate that
  // wiring or the stall timer's abort never reaches the never-closing stream
  // and the test hangs (the observed 5s timeout).
  const sseResponse = (chunks: Uint8Array[], neverClose = false, signal?: AbortSignal): Response =>
    new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          if (signal) {
            signal.addEventListener('abort', () => {
              controller.error(new DOMException('aborted', 'AbortError'));
            }, { once: true });
          }
          for (const c of chunks) controller.enqueue(c);
          if (!neverClose) controller.close();
        },
      }),
      { status: 200, headers: { 'content-type': 'text/event-stream' } },
    );
  // THE MOCK FETCH — captures the init.signal so the abort reaches the stream.
  const mockFetch = (chunks: Uint8Array[], neverClose = false) =>
    (async (_url: unknown, init?: { signal?: AbortSignal }) =>
      sseResponse(chunks, neverClose, init?.signal)) as typeof fetch;

  test('SSE: the delta content accumulates across the events + the finish_reason maps to stop', async () => {
    const realFetch = globalThis.fetch;
    const sse = [
      'data: {"choices":[{"delta":{"content":"Hello "}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"world"}}]}\n\n',
      'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n',
      'data: [DONE]\n\n',
    ].join('');
    globalThis.fetch = mockFetch([encoder.encode(sse)]);
    try {
      const r = await opencodeShadowStreamFn({
        model: SHADOW_MODEL,
        messages: [{ role: 'user', content: 'p' }],
        apiKey: 'test-key',
        baseUrl: SHADOW_BASE_URL,
        maxTokens: 100,
        signal: new AbortController().signal,
      });
      expect(r.stopReason).toBe('stop');
      expect(r.content).toBe('Hello world');
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  test('SSE: the length finish_reason maps to the length stopReason (the partial-save path)', async () => {
    const realFetch = globalThis.fetch;
    const sse = [
      'data: {"choices":[{"delta":{"content":"partial"}}]}\n\n',
      'data: {"choices":[{"delta":{},"finish_reason":"length"}]}\n\n',
      'data: [DONE]\n\n',
    ].join('');
    globalThis.fetch = mockFetch([encoder.encode(sse)]);
    try {
      const r = await opencodeShadowStreamFn({
        model: SHADOW_MODEL,
        messages: [{ role: 'user', content: 'p' }],
        apiKey: 'test-key',
        baseUrl: SHADOW_BASE_URL,
        maxTokens: 100,
        signal: new AbortController().signal,
      });
      expect(r.stopReason).toBe('length');
      expect(r.content).toBe('partial');
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  test('SSE: an event SPLIT ACROSS CHUNK BOUNDARIES still parses (the adversarial chunking)', async () => {
    const realFetch = globalThis.fetch;
    globalThis.fetch = mockFetch([
      encoder.encode('data: {"choices":[{"delta":{"con'),
      encoder.encode('tent":"split"}}]}\n\ndata: [DONE]\n\n'),
    ]);
    try {
      const r = await opencodeShadowStreamFn({
        model: SHADOW_MODEL,
        messages: [{ role: 'user', content: 'p' }],
        apiKey: 'test-key',
        baseUrl: SHADOW_BASE_URL,
        maxTokens: 100,
        signal: new AbortController().signal,
      });
      expect(r.stopReason).toBe('stop');
      expect(r.content).toBe('split');
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  test('IDLE: a stream that delivers one event then goes silent aborts at the stall window (the mid-stream death)', async () => {
    const realFetch = globalThis.fetch;
    globalThis.fetch = mockFetch(
      [encoder.encode('data: {"choices":[{"delta":{"content":"x"}}]}\n\n')],
      true, // never closes, never sends more — the idle window must fire
    );
    try {
      const r = await opencodeShadowStreamFn({
        model: SHADOW_MODEL,
        messages: [{ role: 'user', content: 'p' }],
        apiKey: 'test-key',
        baseUrl: SHADOW_BASE_URL,
        maxTokens: 100,
        signal: new AbortController().signal,
        stallTimeoutMs: 60,
      });
      expect(r.stopReason).toBe('error');
      expect(r.errorMessage).toContain('SHADOW_BRAIN_TIMEOUT');
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  test('SILENCE: a stream that never delivers a single event aborts at the first-byte window (the dead provider)', async () => {
    const realFetch = globalThis.fetch;
    globalThis.fetch = mockFetch([], true);
    try {
      const r = await opencodeShadowStreamFn({
        model: SHADOW_MODEL,
        messages: [{ role: 'user', content: 'p' }],
        apiKey: 'test-key',
        baseUrl: SHADOW_BASE_URL,
        maxTokens: 100,
        signal: new AbortController().signal,
        stallTimeoutMs: 60,
      });
      expect(r.stopReason).toBe('error');
      expect(r.errorMessage).toContain('SHADOW_BRAIN_TIMEOUT');
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  test('JSON-BRANCH: a provider that ignores stream:true and returns the plain JSON body is parsed (the same primary path)', async () => {
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async () => new Response(
      JSON.stringify({ choices: [{ message: { content: 'the json content' }, finish_reason: 'stop' }] }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    )) as typeof fetch;
    try {
      const r = await opencodeShadowStreamFn({
        model: SHADOW_MODEL,
        messages: [{ role: 'user', content: 'p' }],
        apiKey: 'test-key',
        baseUrl: SHADOW_BASE_URL,
        maxTokens: 100,
        signal: new AbortController().signal,
      });
      expect(r.stopReason).toBe('stop');
      expect(r.content).toBe('the json content');
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  test('RETRY: a SHADOW_BRAIN_HTTP_500 followed by success — ONE retry re-runs the primary and recovers', async () => {
    let calls = 0;
    const flaky: ShadowStreamFn = async () => {
      calls++;
      if (calls === 1) return { content: '', stopReason: 'error', errorMessage: 'SHADOW_BRAIN_HTTP_500: opencode-go 500 boom' };
      return { content: 'the recovered prompt', stopReason: 'stop' };
    };
    const r = await callShadow('p', 's', 100, { apiKey: 'test-key', streamFn: flaky, retryBackoffMs: 1 });
    expect(calls).toBe(2); // exactly ONE retry — never more
    expect(r.ok).toBe(true);
    expect(r.content).toBe('the recovered prompt');
  });

  test('RETRY: a double 500 exhausts the primary (ONE retry) + the official-API fallback (ONE retry) then fails LOUDLY naming both transports — never a silent pass', async () => {
    let primaryCalls = 0;
    let fallbackCalls = 0;
    const doubleFlaky: ShadowStreamFn = async (args) => {
      if (args.model === SHADOW_MODEL) primaryCalls++;
      else fallbackCalls++;   // the fallback runs with the fallback model (deepseek-chat)
      return { content: '', stopReason: 'error', errorMessage: 'SHADOW_BRAIN_HTTP_500: opencode-go 500 boom' };
    };
    const r = await callShadow('p', 's', 100, { apiKey: 'test-key', streamFn: doubleFlaky, retryBackoffMs: 1 });
    expect(primaryCalls).toBe(2);    // THE PRIMARY RETRIES EXACTLY ONCE — never more
    expect(fallbackCalls).toBe(2);   // the official-API fallback also retries exactly once
    expect(r.ok).toBe(false);
    expect(r.error).toContain('SHADOW_BRAIN_HTTP_500');
    expect(r.error).toContain('primary');
    expect(r.error).toContain('fallback');
  });

  test('RETRY: the timeout class IS retryable (the 2026-08-12 live ruling) — ONE primary retry + ONE fallback retry, then the loud timeout', async () => {
    let primaryCalls = 0;
    let fallbackCalls = 0;
    const timeoutClass: ShadowStreamFn = async (args) => {
      if (args.model === SHADOW_MODEL) primaryCalls++;
      else fallbackCalls++;
      return { content: '', stopReason: 'error', errorMessage: 'SHADOW_BRAIN_TIMEOUT: the LLM call stalled' };
    };
    const r = await callShadow('p', 's', 100, { apiKey: 'test-key', streamFn: timeoutClass, retryBackoffMs: 1 });
    expect(primaryCalls).toBe(2);    // the timeout retries ONCE (the live proof: 180s fail → 361s success)
    expect(fallbackCalls).toBe(2);
    expect(r.ok).toBe(false);
    expect(r.error).toContain('SHADOW_BRAIN_TIMEOUT');
  });
});
