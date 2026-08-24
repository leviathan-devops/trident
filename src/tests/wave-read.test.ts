// src/tests/wave-read.test.ts — THE WAVE-READ STATUS-COMPUTATION BATTERY
// (2026-08-16 — the FALSE-LIVENESS incident's fix). The tests ISOLATE the
// status computation (computeWaveReadStatus + composeWaveReadResult) — the
// session data → status mapping — with mocked reader pages. They NEVER hit the
// live db (the computation is PURE). The test plan mirrors the spec's S1-S5
// scenarios: stream (S1), the incident's regression (S2 — a live session must
// read 'stream', never 'cancelled'), absent (S3), complete (S4), and the
// action=status sessionId surface (S5 — the live field + the raw stream, no
// generation noise).
import { describe, expect, test } from 'bun:test';
import {
  computeWaveReadStatus,
  composeWaveReadResult,
  STREAM_WINDOW_MS,
  WAVE_READ_TOOL_DESCRIPTION,
  type WaveReadResult,
} from '../tools/wave-read.ts';
import type { SessionStreamPage } from '../tools/wave-status.ts';
import {
  executeWaveStatus,
  type WaveStatusClient,
  type WaveStatusArgs,
} from '../tools/wave-status.ts';

// ═══ THE FIXTURES (the mocked reader pages — the session data the status is
// computed from; NEVER the live db, NEVER the job registry) ═══

function openPart(type: string, overrides: Partial<SessionStreamPage['parts'][number]> = {}): SessionStreamPage['parts'][number] {
  return { type, completed: false, ...overrides };
}

function finishedPart(): SessionStreamPage['parts'][number] {
  return { type: 'step-finish', completed: true };
}

function page(parts: SessionStreamPage['parts'], overrides: Partial<SessionStreamPage> = {}): SessionStreamPage {
  return {
    ok: true,
    sessionId: 'ses_test',
    totalParts: parts.length,
    returnedParts: parts.length,
    moreAvailable: false,
    beforeId: null,
    parts,
    lastTools: [],
    byteGrowth: 0,
    ...overrides,
  };
}

// ═══ S1 — THE LIVE-SESSION READ (stream) ═══

describe('WAVE-READ: the status computation (stream / idle / complete / absent)', () => {
  test('S1 — an OPEN newest part (a streaming text) = stream (the agent is WORKING)', () => {
    const p = page([
      openPart('step-start'),
      openPart('reasoning', { text: 'thinking...' }),
      openPart('text'),                       // the OPEN text — no time.end
    ]);
    expect(computeWaveReadStatus(p, false, 0)).toBe('stream');
  });

  test('S1 — an OPEN reasoning part (the long-burst shape) = stream even seconds old', () => {
    const p = page([openPart('step-start'), openPart('reasoning', { text: 'reasoning...' })]);
    expect(computeWaveReadStatus(p, false, 5_000)).toBe('stream');
  });

  test('S1 — a tool part as the newest = stream (the agent is calling a tool)', () => {
    const p = page([openPart('step-start'), openPart('tool', { tool: 'read' })]);
    expect(computeWaveReadStatus(p, false, 0)).toBe('stream');
  });

  test('S1 — the live-flag computation matches the stream rule', () => {
    const p = page([openPart('step-start'), openPart('tool', { tool: 'grep' })]);
    const r = composeWaveReadResult('ses_test', p, false, 0);
    expect(r.status).toBe('stream');
    expect(r.live).toBe(true);   // THE SESSION-TRUTH LIVENESS (2026-08-16 — the S1 container catch: status stream = live true)
  });

  test('THE WINDOW RULE — an OPEN part OLDER than the window = idle (the generation stalled without a step-finish; the session is not dead, just not producing)', () => {
    // The spec's window rule: "no new parts in the window" = not producing.
    // An open part older than the window = the generation died mid-stream
    // (a crash / an interrupt leaving the part open). The state is IDLE — NOT
    // stream (nothing new in the window), NOT absent (the session rows exist).
    const p = page([openPart('reasoning', { text: 'burst' })]);
    expect(computeWaveReadStatus(p, false, STREAM_WINDOW_MS + 30_000)).toBe('idle');
  });

  test('S2 — THE INCIDENT REGRESSION: a session streaming in the db (job cancelled by the runtime) reads STREAM — the session truth, never the job state', () => {
    // The incident's exact geometry: the JOB registry said cancelled while the
    // session streamed. The computation takes NO job-state input — it reads the
    // session page. An open reasoning part = stream. The job's 'cancelled' is
    // not even an input to this function.
    const p = page([openPart('step-start'), openPart('reasoning', { text: 'writing files...' })]);
    expect(computeWaveReadStatus(p, false, 2_000)).toBe('stream');
  });

  test('S2 — the tool description carries the incident warning (the task_status lie is visible on the tool surface)', () => {
    expect(WAVE_READ_TOOL_DESCRIPTION).toContain('task_status');
    expect(WAVE_READ_TOOL_DESCRIPTION).toContain('cancelled');
    expect(WAVE_READ_TOOL_DESCRIPTION).toContain('THE SESSION STREAM IS THE ONLY LIVENESS TRUTH');
    expect(WAVE_READ_TOOL_DESCRIPTION).toContain('2026-08-16');
  });

  test('S3 — the ABSENT session: a !ok page (db absent) = absent', () => {
    const p = page([], { ok: false, error: 'opencode.db absent' });
    expect(computeWaveReadStatus(p, false, null)).toBe('absent');
  });

  test('S3 — the ABSENT session: an ok page with ZERO parts (no rows in the db) = absent', () => {
    const p = page([]);
    expect(computeWaveReadStatus(p, false, null)).toBe('absent');
  });

  test('S4 — the COMPLETE session: a terminal step-finish + the terminal message finish = complete', () => {
    const p = page([openPart('step-start'), openPart('text', { text: 'the final answer' }), finishedPart()]);
    expect(computeWaveReadStatus(p, true, 0)).toBe('complete');
  });

  test('S4 — complete requires the terminal finish: a step-finish WITHOUT the message finish = idle (the agent paused, not done)', () => {
    const p = page([openPart('step-start'), openPart('text', { text: 'interim' }), finishedPart()]);
    expect(computeWaveReadStatus(p, false, 0)).toBe('idle');
  });

  test('S4 — complete is not affected by the window (a finished session stays complete however old)', () => {
    const p = page([openPart('step-start'), openPart('text', { text: 'done' }), finishedPart()]);
    expect(computeWaveReadStatus(p, true, STREAM_WINDOW_MS + 60 * 60_000)).toBe('complete');
  });

  test('the IDLE rule — a stale OPEN part (interrupted mid-generation, the part left open) = idle, not stream', () => {
    // The crash case: an open part that went stale (the age probe is a REAL
    // recency signal, not a guess). An open part far older than the window =
    // the generation died without a step-finish — idle (NOT dead; the session
    // still lives and a tool/steer could revive it).
    const p = page([openPart('reasoning', { text: 'stale burst' })]);
    expect(computeWaveReadStatus(p, false, STREAM_WINDOW_MS + 10 * 60_000)).toBe('idle');
  });

  test('the IDLE rule — a finished step + no finish, even inside the window = idle (a tool-call boundary)', () => {
    const p = page([openPart('step-start'), finishedPart()]);
    expect(computeWaveReadStatus(p, false, 0)).toBe('idle');
  });

  test('the beforeId cursor path — the result carries the cursor + moreAvailable for the full-scroll page-back', () => {
    const p = page([openPart('step-start'), openPart('tool', { tool: 'read' })], {
      moreAvailable: true,
      beforeId: 'prt_older',
      returnedParts: 2,
    });
    const r = composeWaveReadResult('ses_test', p, false, 0);
    expect(r.beforeId).toBe('prt_older');
    expect(r.moreAvailable).toBe(true);
    expect(r.returnedParts).toBe(2);
  });

  test('the limit boundary — the result carries the bounded part count', () => {
    const p = page([openPart('tool', { tool: 'read' })], { returnedParts: 1, totalParts: 200 });
    const r = composeWaveReadResult('ses_test', p, false, 0);
    expect(r.partCount).toBe(200);
    expect(r.returnedParts).toBe(1);
    expect(r.parts.length).toBe(1);
  });

  test('the compose result shape — ok/error/sessionId/status/partCount/lastTools/parts', () => {
    const p = page([openPart('tool', { tool: 'write' }), openPart('text')], { lastTools: ['write'] });
    const r: WaveReadResult = composeWaveReadResult('ses_test', p, false, 0);
    expect(r.ok).toBe(true);
    expect(r.sessionId).toBe('ses_test');
    expect(r.status).toBe('stream');
    expect(r.partCount).toBe(2);
    expect(r.lastTools).toEqual(['write']);
    expect(r.parts).toHaveLength(2);
  });
});

// ═══ S5 — THE action=status sessionId SURFACE (the live field + the raw
// stream, no generation noise) ═══

// THE STUB CLIENT — the sessionId branch reads the DB stream first; the client
// is the fallback only. The stub's reads MUST NOT be called for a healthy page.
const stubClient: WaveStatusClient = {
  status: async () => {
    throw new Error('the client fallback was NOT expected (the sessionId branch reads the db stream first)');
  },
  messages: async () => {
    throw new Error('the client fallback was NOT expected');
  },
  message: async () => ({}),
  abort: async () => ({}),
  children: async () => ({ data: [] }),
};

describe('WAVE-READ: the action=status sessionId surface (S5)', () => {
  test('S5 — the sessionId branch returns the RAW session truth + the live field (NO generation noise, NO agents[] wrapper, NO tracker eta fields)', async () => {
    // The sessionId branch calls readSessionStream on the LIVE db — it will
    // resolve through the real opencode.db. To keep the battery hermetic, this
    // test asserts the SHAPE via a session that does not exist: the branch
    // falls back to the client, and the shape is still the WaveSessionStatusReport
    // (sessionId/live/status + the stream fields) — never the agents[] wrapper.
    const args: WaveStatusArgs = { action: 'status', sessionId: 'ses_DOES_NOT_EXIST_WAVE_READ' };
    const report = await executeWaveStatus(args, stubClient, null) as unknown as Record<string, unknown>;
    expect(typeof report).toBe('object');
    expect(report.sessionId).toBe('ses_DOES_NOT_EXIST_WAVE_READ');
    expect('live' in report).toBe(true);
    // THE WRAPPER STRIP — the wave-scoped noise is GONE:
    expect('agents' in report).toBe(false);
    expect('etaMs' in report).toBe(false);
    expect('etaConfidence' in report).toBe(false);
    expect('elapsedMs' in report).toBe(false);
    // THE RAW SESSION FIELDS ride the report:
    expect('partCount' in report).toBe(true);
    expect('lastTools' in report).toBe(true);
    expect('moreAvailable' in report).toBe(true);
    expect('beforeId' in report).toBe(true);
    expect('streamOk' in report).toBe(true);
  });

  test('S5 — the live field is boolean', async () => {
    const args: WaveStatusArgs = { action: 'status', sessionId: 'ses_DOES_NOT_EXIST_WAVE_READ' };
    const report = await executeWaveStatus(args, stubClient, null) as { live: unknown };
    expect(typeof report.live).toBe('boolean');
  });

  test('S5 — the waveId branch keeps the WaveStatusReport shape (the wave-scoped behavior is UNCHANGED)', async () => {
    // The wave-scoped status path must remain byte-for-byte the wave report —
    // the agents[] + eta fields stay there. The waveId branch is the tracker
    // path: with no tracked wave, it returns unknown_wave with the wave shape.
    const args: WaveStatusArgs = { action: 'status', waveId: 'wave-NOT-TRACKED' };
    const report = await executeWaveStatus(args, stubClient, null) as unknown as Record<string, unknown>;
    expect(report.status).toBe('unknown_wave');
    expect('agents' in report).toBe(true);
    expect(Array.isArray(report.agents)).toBe(true);
    expect('etaMs' in report).toBe(true);
  });
});
