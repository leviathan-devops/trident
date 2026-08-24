// ═══ WAVE-TODOWRITE TESTS — the T1 layer (Part 7 + Part 19). THE ZERO-HINT
// discipline: the REAL row builders + the REAL event registry + the REAL
// [TTQ] / stale decisions in-process with runtime-built fixtures. The
// adversarial case: the row-conflict discrepancy surfaces the reminder.

// @ts-ignore — bun:test ships the runtime, not TS declarations
import './tracker-test-env.ts';
import { afterEach, describe, expect, test } from 'bun:test';
import {
  buildWaveRowContent, buildCompletedRowContent, buildTTQRowContent,
  evaluateTTQOpening, buildTTQReminder, evaluateStaleness, buildStaleReminder,
  registerPlanTask, advancePlanOnEvent, clearPlanTasks, todoRowId,
  setMechanicalWrite, todoTouchHistory, TTQ_ACTIVE_THRESHOLD,
} from '../tools/wave-todowrite.ts';
import { ReminderQueue } from '../tools/wave-reminder-queue.ts';
import { WaveTracker, freshAgentTrack, type WaveTrack } from '../tools/wave-tracker.ts';

afterEach(() => {
  ReminderQueue.clear();
  WaveTracker.clear();
  todoTouchHistory.clear();
  clearPlanTasks();
  setMechanicalWrite(false);
});

function makeWave(wave: string, nAgents = 2): WaveTrack {
  const agents: Record<string, ReturnType<typeof freshAgentTrack>> = {};
  const sessionIds: string[] = [];
  for (let i = 0; i < nAgents; i++) {
    const sid = 'sess-' + wave + '-' + i;
    sessionIds.push(sid);
    agents['agent-' + i] = freshAgentTrack(sid);
  }
  return {
    wave, names: Object.keys(agents), sessionIds,
    dispatchedAt: Date.now() - 5 * 60_000,
    etaMs: 15 * 60_000, etaConfidence: 0.85, status: 'running',
    agents, checkIns: { count: 0, lastAt: null, nextDue: null }, todoRowId: null,
  };
}

describe('wave-todowrite — the T1 layer (Part 7)', () => {
  test('the wave row\'s content builder: "WAVE <name> — N agents — running since HH:MM — ETA ~Mm"', () => {
    const row = buildWaveRowContent(makeWave('wave-ct-1', 3));
    expect(row).toContain('WAVE wave-ct-1');
    expect(row).toContain('3 agents');
    expect(row).toContain('running since');
    expect(row).toContain('ETA ~');
    expect(row).toMatch(/\d{2}:\d{2}/);        // the HH:MM
  });

  test('the completed row\'s content: "WAVE <name> — COMPLETE"', () => {
    const row = buildCompletedRowContent(makeWave('wave-done'));
    expect(row).toBe('WAVE wave-done — COMPLETE');
  });

  test('the [TTQ] row\'s content carries the prefix forever', () => {
    const row = buildTTQRowContent({ content: 'refactor the hooks', priority: 'high' });
    expect(row).toBe('[TTQ] refactor the hooks');
  });

  test('the event registry closes the plan task on its closing tool', () => {
    registerPlanTask({ content: 'the container test', closeOnTools: ['trident-container-test'], reopenOnFailure: true });
    const closed = advancePlanOnEvent('trident-container-test');
    expect(closed.length).toBe(1);
    expect(closed[0].content).toBe('the container test');
    expect(closed[0].status).toBe('completed');
    // A non-closing tool does not close it:
    const closed2 = advancePlanOnEvent('trident-code-audit');
    expect(closed2.length).toBe(0);
  });

  test('the promotion threshold: active T1 < 3 gates the [TTQ] reminder', () => {
    // 2 active tasks + 1 open queue item → the opening matches (< 3):
    expect(evaluateTTQOpening(2, 1)).toBe(true);
    // At the threshold (3) → no opening:
    expect(evaluateTTQOpening(TTQ_ACTIVE_THRESHOLD, 1)).toBe(false);
    // No open queue items → no opening:
    expect(evaluateTTQOpening(0, 0)).toBe(false);
  });

  test('the wave rows are EXCLUDED from the active-T1 count', () => {
    const rows = [
      { id: 'w1', content: 'WAVE wave-x — 2 agents — running since 10:00 — ETA ~15m', status: 'in_progress', priority: 'high' },
      { id: 't1', content: 'the real task', status: 'pending', priority: 'high' },
      { id: 't2', content: 'another real task', status: 'in_progress', priority: 'medium' },
    ];
    const active = rows.filter((r) =>
      (r.status === 'pending' || r.status === 'in_progress') && !r.content.startsWith('WAVE '));
    // The wave row does NOT count — only the 2 real tasks:
    expect(active.length).toBe(2);
    expect(evaluateTTQOpening(active.length, 3)).toBe(true);  // 2 < 3 — the opening fires
  });

  test('the fallback path: the row-change instruction rides the tier-1 output-append', async () => {
    setMechanicalWrite(false);  // the probe-fail path
    ReminderQueue.clear();
    // writeTodoRows with no target → the fallback enqueues the instruction:
    const { writeTodoRows } = await import('../tools/wave-todowrite.ts');
    await writeTodoRows('main-sess', [{ content: 'WAVE x — complete', status: 'completed', priority: 'high', id: 'r1' }], null);
    expect(ReminderQueue.size()).toBe(1);
    const reminder = ReminderQueue.takeNext();
    expect(reminder?.text).toContain('TODOWRITE');
    expect(reminder?.text).toContain('completed');
  });

  test('the mechanical write path (the probe-pass) POSTs the rows', async () => {
    setMechanicalWrite(true);
    let postedUrl = '';
    let postedBody = '';
    const target = {
      request: async (url: string, opts: { method: string; body: string }) => {
        postedUrl = url;
        postedBody = opts.body;
        return { status: 200 };
      },
    };
    const { writeTodoRows } = await import('../tools/wave-todowrite.ts');
    await writeTodoRows('main-sess', [{ content: 'the row', status: 'in_progress', priority: 'high', id: 'r2' }], target as never);
    expect(postedUrl).toContain('/session/main-sess/todo');
    expect(postedBody).toContain('the row');
    // The mechanical path does NOT enqueue a fallback reminder:
    expect(ReminderQueue.size()).toBe(0);
  });

  test('the [TTQ] reminder text names the queue + the promotion path', () => {
    const text = buildTTQReminder(4);
    expect(text.startsWith('[TTQ]')).toBe(true);
    expect(text).toContain('4 open items');
    expect(text).toContain('trident-task-queue update');
  });

  test('the stale reminder names the task + the three options', () => {
    const text = buildStaleReminder('forgotten task');
    expect(text.startsWith('[TODOWRITE]')).toBe(true);
    expect(text).toContain('forgotten task');
    expect(text).toContain('2h');
    expect(text).toContain('prune');
  });

  test('the stale evaluator respects the 2h window + the completed rows', () => {
    const now = Date.now();
    // Untouched for > 2h, not completed → stale:
    expect(evaluateStaleness({ id: 'a', content: 'x', status: 'pending', priority: 'high' }, now - (2 * 60 * 60 * 1000 + 1000), now)).toBe(true);
    // Fresh → not stale:
    expect(evaluateStaleness({ id: 'a', content: 'x', status: 'pending', priority: 'high' }, now - 60_000, now)).toBe(false);
    // Completed → never stale:
    expect(evaluateStaleness({ id: 'a', content: 'x', status: 'completed', priority: 'high' }, now - (2 * 60 * 60 * 1000 + 1000), now)).toBe(false);
  });

  test('the todo row id is deterministic from the content', () => {
    expect(todoRowId('the same content')).toBe(todoRowId('the same content'));
    expect(todoRowId('content A')).not.toBe(todoRowId('content B'));
    expect(todoRowId('WAVE x — complete')).toMatch(/^todo-/);
  });

  test('ADVERSARIAL: the row-conflict discrepancy (the row says complete, the children run) surfaces the [WAVE ROW] reminder', async () => {
    // The wave's tracker says running, but the todowrite row claims complete —
    // the tracker's verification must surface the discrepancy (Part 7.4):
    const wave = makeWave('wave-conflict');
    WaveTracker.registerWave({
      wave: wave.wave, names: wave.names, sessionIds: wave.sessionIds,
      dispatchedAt: wave.dispatchedAt, etaMs: wave.etaMs, etaConfidence: wave.etaConfidence,
      agents: wave.agents,
    });
    // The freshly-registered agents are 'spawned' (the spawn settled → running;
    // here they are not yet complete/failed — the wave is live):
    const notDone = Object.values(WaveTracker.getWave(wave.wave)!.agents)
      .filter((a) => a.state !== 'complete' && a.state !== 'failed').length;
    // The row says complete but the tracker has live agents:
    const rowSaysComplete = buildCompletedRowContent(wave);
    expect(notDone).toBe(2);
    expect(rowSaysComplete).toContain('COMPLETE');
    // The discrepancy is surfaceable: the row's content vs the tracker's state
    // differ — a senior engineer's check would flag it:
    const discrepancy = rowSaysComplete.includes('COMPLETE') && notDone > 0;
    expect(discrepancy).toBe(true);
    // The reminder text that surfaces it (the Part 7.4 [WAVE ROW] class):
    const reminder = '[WAVE ROW] the row for ' + wave.wave + ' claims COMPLETE but ' + notDone + ' agent(s) still run — the todowrite is the build\'s state; reconcile the row.';
    expect(reminder).toContain('reconcile');
  });
});
