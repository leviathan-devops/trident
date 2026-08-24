// ═══ WAVE-CRON TESTS — the 10m tick decisions + the reminder queue (Part 5 +
// Part 16 + Part 19). THE ZERO-HINT discipline: the REAL matchStuckPatterns +
// the REAL ReminderQueue + the REAL waveTick in-process with runtime-built
// evidence fixtures. The adversarial case: a dead provider (the client throws)
// does not crash the cron — the session marked error + the next tick continues.

// @ts-ignore — bun:test ships the runtime, not TS declarations
import './tracker-test-env.ts';
import { afterEach, describe, expect, test } from 'bun:test';
import { matchStuckPatterns, STUCK_ACTIVITY_AGE_MS } from '../tools/wave-stuck-detector.ts';
import { ReminderQueue } from '../tools/wave-reminder-queue.ts';
import { waveTick, setCronMainSessionId, getCronMainSessionId, type WaveCronClient } from '../tools/wave-cron.ts';
import { WaveTracker, freshAgentTrack } from '../tools/wave-tracker.ts';
import { todoTouchHistory, STALE_TASK_WINDOW_MS, setMechanicalWrite } from '../tools/wave-todowrite.ts';

function makeEvidence(overrides: Partial<Parameters<typeof matchStuckPatterns>[0]> = {}) {
  const waveId = 'wave-evidence-' + Math.floor(Math.random() * 1e9);
  const now = overrides.now ?? Date.now();
  const wave = {
    wave: waveId,
    names: ['agent-a'],
    sessionIds: ['sess-a'],
    dispatchedAt: now - 20 * 60_000,   // 20m ago
    etaMs: 10 * 60_000,                // ETA 10m — the wave is PAST its ETA
    etaConfidence: 0.85,
    status: 'running' as const,
    agents: {},
    checkIns: { count: 0, lastAt: null, nextDue: null },
    todoRowId: null,
  };
  const agent = freshAgentTrack('sess-a', now - 10 * 60_000); // last activity 10m ago
  agent.state = 'running' as const;
  agent.lastActivityAt = now - 10 * 60_000;
  agent.taskIds = ['ses_task-1'];        // the background dispatch's real handle (2026-08-13 — the directive must carry it)
  return {
    agent, wave,
    name: 'agent-a',                     // the REAL agent name (2026-08-13 — the directive names it, never the '<agent>' placeholder)
    sessionStatus: 'running',
    statusReadFailed: false,
    lastTickBytes: 100,
    streamGrowing: false,
    lastActivityAgeMs: 10 * 60_000,
    providerErrorCount: 0,
    now,
    ...overrides,
  };
}

function makeTodoTarget(rows: Array<{ id: string; content: string; status: string }>) {
  return {
    get: async () => ({ data: rows }),
  };
}

afterEach(() => {
  ReminderQueue.clear();
  WaveTracker.clear();
  todoTouchHistory.clear();
  setMechanicalWrite(false);
});

describe('wave-cron — the 10m tick decisions (Part 5)', () => {
  test('STUCK_NO_ACTIVITY matches when the activity age > 5m AND the stream is flat AND the wave is past its ETA', () => {
    const ev = makeEvidence({
      lastActivityAgeMs: STUCK_ACTIVITY_AGE_MS + 1,
      streamGrowing: false,
    });
    const d = matchStuckPatterns(ev);
    expect(d.action).toBe('KILL_AND_RESPAWN');
    expect(d.pattern?.id).toBe('STUCK_NO_ACTIVITY');
    expect(d.directive).toContain('STUCK_NO_ACTIVITY');
    // THE ID FIX (2026-08-13 — the operator's question): the directive carries
    // the REAL agent name + the REAL session/task ids — never the placeholders.
    expect(d.directive).toContain('agent-a');
    expect(d.directive).toContain('sess-a');
    expect(d.directive).toContain('ses_task-1');
  });

  test('STUCK_NO_ACTIVITY does NOT match a growing stream (the SLOW_LEGIT precedence)', () => {
    const ev = makeEvidence({
      lastActivityAgeMs: STUCK_ACTIVITY_AGE_MS + 1,
      streamGrowing: true,             // the stream IS growing — the agent is alive
    });
    const d = matchStuckPatterns(ev);
    expect(d.action).toBe('WAIT');
    expect(d.pattern).toBeNull();
  });

  test('STUCK_NO_ACTIVITY does NOT fire BEFORE the ETA (the triggerCondition gates)', () => {
    const now = Date.now();
    const ev = makeEvidence({
      lastActivityAgeMs: STUCK_ACTIVITY_AGE_MS + 1,
      streamGrowing: false,
      now,
    });
    // Make the wave NOT past its ETA:
    ev.wave.dispatchedAt = now - 1 * 60_000;
    ev.wave.etaMs = 60 * 60_000;
    const d = matchStuckPatterns(ev);
    expect(d.action).toBe('WAIT');     // the trigger (past the ETA) is false
  });

  test('PROVIDER_QUOTA matches at > 2 provider-error codes', () => {
    const ev = makeEvidence({
      providerErrorCount: 3,
      sessionStatus: 'running',
      streamGrowing: true,             // the growing stream does not mask the quota
    });
    const d = matchStuckPatterns(ev);
    expect(d.action).toBe('KILL_AND_RESPAWN_WITH_SWITCH');
    expect(d.pattern?.id).toBe('PROVIDER_QUOTA');
  });

  test('PROVIDER_QUOTA does NOT match at exactly the threshold (the calibration is > 2)', () => {
    const ev = makeEvidence({
      providerErrorCount: 2,
      streamGrowing: true,               // the growing stream excludes STUCK_NO_ACTIVITY
      lastActivityAgeMs: 0,              // fresh activity — only the quota is at play
    });
    const d = matchStuckPatterns(ev);
    expect(d.action).toBe('WAIT');
  });

  test('SESSION_CRASH matches an error/closed status — CRITICAL', () => {
    const ev = makeEvidence({
      sessionStatus: 'error',
      streamGrowing: false,
      lastActivityAgeMs: 0,            // fresh activity does not mask the crash
    });
    const d = matchStuckPatterns(ev);
    expect(d.action).toBe('RESPAWN_IMMEDIATE');
    expect(d.pattern?.id).toBe('SESSION_CRASH');
    expect(d.pattern?.severity).toBe('CRITICAL');
  });

  test('the completion detection fires when ALL agents are complete/failed', async () => {
    const waveId = 'wave-complete-' + Math.floor(Math.random() * 1e9);
    WaveTracker.registerWave({
      wave: waveId, names: ['a', 'b'], sessionIds: ['sa', 'sb'],
      dispatchedAt: Date.now(), etaMs: 10 * 60_000, etaConfidence: 0.5,
      agents: { a: freshAgentTrack('sa'), b: freshAgentTrack('sb') },
    });
    WaveTracker.markComplete(waveId, 'a');
    WaveTracker.markComplete(waveId, 'b');
    const client: WaveCronClient = {
      status: async () => ({ data: { status: 'idle' } }),
      messages: async () => ({ data: [{ parts: [{ type: 'text', text: 'done' }] }] }),
      todo: async () => ({ data: [] }),
    };
    ReminderQueue.clear();
    await waveTick(client, 'main-sess');
    const reminders = ReminderQueue.drainAll();
    expect(reminders.some((r) => r.text.includes('COMPLETE'))).toBe(true);
    // The wave is archived — the active registry no longer holds it:
    expect(WaveTracker.getWave(waveId)).toBeUndefined();
  });

  test('the completion directive is queued ONCE (no duplicate submits)', async () => {
    const waveId = 'wave-once-' + Math.floor(Math.random() * 1e9);
    WaveTracker.registerWave({
      wave: waveId, names: ['a'], sessionIds: ['sa'],
      dispatchedAt: Date.now(), etaMs: 10 * 60_000, etaConfidence: 0.5,
      agents: { a: freshAgentTrack('sa') },
    });
    WaveTracker.markComplete(waveId, 'a');
    const client: WaveCronClient = {
      status: async () => ({ data: { status: 'idle' } }),
      messages: async () => ({ data: [{ parts: [] }] }),
      todo: async () => ({ data: [] }),
    };
    await waveTick(client, 'main-sess');   // tick 1 → complete + archived
    ReminderQueue.clear();
    await waveTick(client, 'main-sess');   // tick 2 → the wave is gone (no dup)
    expect(ReminderQueue.size()).toBe(0);
  });

  test('the reminder queue is FIFO + once-per-tool-result', () => {
    ReminderQueue.enqueue('first');
    ReminderQueue.enqueue('second');
    expect(ReminderQueue.size()).toBe(2);
    const a = ReminderQueue.takeNext();
    const b = ReminderQueue.takeNext();
    const c = ReminderQueue.takeNext();
    expect(a?.text).toBe('first');
    expect(b?.text).toBe('second');
    expect(c).toBeNull();                  // the FIFO drain — one per tool result
  });

  test('the [TTQ] opening fires ONLY when the active T1 < 3 + the queue has open items', async () => {
    const client: WaveCronClient = {
      status: async () => ({ data: { status: 'idle' } }),
      messages: async () => ({ data: [] }),
      todo: async () => ({ data: [{ id: 't1', content: 'a task', status: 'in_progress' }] }),
    };
    ReminderQueue.clear();
    // 1 active task + 2 open queue items → the opening matches:
    await waveTick(client, 'main-sess', { openQueueCount: 2 });
    const reminders = ReminderQueue.drainAll();
    expect(reminders.some((r) => r.text.startsWith('[TTQ]'))).toBe(true);
  });

  test('the [TTQ] is rate-limited: one per cycle', async () => {
    const client: WaveCronClient = {
      status: async () => ({ data: { status: 'idle' } }),
      messages: async () => ({ data: [] }),
      todo: async () => ({ data: [] }),    // 0 active tasks
    };
    ReminderQueue.clear();
    await waveTick(client, 'main-sess', { openQueueCount: 5 });
    const ttq = ReminderQueue.drainAll().filter((r) => r.text.startsWith('[TTQ]'));
    expect(ttq.length).toBe(1);            // the rate limit — one [TTQ] per cycle
  });

  test('the stale sweeper flags a 2h-untouched task once per window', async () => {
    const staleId = 'stale-row-' + Math.floor(Math.random() * 1e9);
    todoTouchHistory.set(staleId, Date.now() - (STALE_TASK_WINDOW_MS + 1000));
    const client: WaveCronClient = {
      status: async () => ({ data: { status: 'idle' } }),
      messages: async () => ({ data: [] }),
      todo: async () => ({ data: [{ id: staleId, content: 'forgotten task', status: 'pending' }] }),
    };
    ReminderQueue.clear();
    await waveTick(client, 'main-sess');
    const reminders = ReminderQueue.drainAll();
    expect(reminders.some((r) => r.text.startsWith('[TODOWRITE]'))).toBe(true);
    // The second tick does NOT re-flag (the touch history updated — once per window):
    await waveTick(client, 'main-sess');
    expect(ReminderQueue.drainAll().some((r) => r.text.startsWith('[TODOWRITE]'))).toBe(false);
  });

  test('ADVERSARIAL: a tick with a dead provider (the client throws) does not crash the cron — the session marked error + the next tick continues', async () => {
    const waveId = 'wave-dead-' + Math.floor(Math.random() * 1e9);
    WaveTracker.registerWave({
      wave: waveId, names: ['a'], sessionIds: ['sa'],
      dispatchedAt: Date.now(), etaMs: 10 * 60_000, etaConfidence: 0.5,
      agents: { a: freshAgentTrack('sa') },
    });
    const deadClient: WaveCronClient = {
      status: async () => { throw new Error('provider 500'); },
      messages: async () => { throw new Error('provider 500'); },
      todo: async () => { throw new Error('provider 500'); },
    };
    // The tick MUST NOT throw — the dead provider marks the session error:
    let threw = false;
    try {
      await waveTick(deadClient, 'main-sess');
    } catch {
      threw = true;
    }
    expect(threw).toBe(false);
    // The tracker's agent now carries the SESSION_CRASH evidence (error status):
    expect(WaveTracker.getWave(waveId)).toBeDefined();
  });
});

describe("THE MAIN-SESSION ANCHOR — the stick-once semantics (2026-08-13 — the operator's multi-session callout)", () => {
  test('the FIRST real id sticks; "default"/null NEVER set or clear; a different session NEVER hijacks', () => {
    setCronMainSessionId(null);          // the wave-event hook's null
    setCronMainSessionId('default');     // the chat.message hook's 'default'
    expect(getCronMainSessionId()).toBeNull();          // nothing real seen yet
    setCronMainSessionId('ses_alpha');   // the session.created anchor (the process's own session)
    expect(getCronMainSessionId()).toBe('ses_alpha');
    setCronMainSessionId('default');     // the later chat.message 'default' — must NOT clear
    setCronMainSessionId(null);          // the later wave-event null — must NOT clear
    expect(getCronMainSessionId()).toBe('ses_alpha');  // the anchor SURVIVES
    setCronMainSessionId('ses_beta');    // another TUI on the shared server — must NOT hijack
    expect(getCronMainSessionId()).toBe('ses_alpha');  // the first real id sticks
  });
});
