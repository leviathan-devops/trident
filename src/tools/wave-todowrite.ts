// src/tools/wave-todowrite.ts — the T1 row operations (Part 13.6 + Part 17).
// THE WRITE PATH DECIDED BY THE PROBE P2: the mechanical POST when the probe
// passed; the tier-1 output-append fallback when it did not. THE VERIFICATION
// LAYER IS MECHANICAL EITHER WAY (the GET + the events — the tracker's ground
// truth). The [TTQ] promotion (Part 7.5 — the <3-active opening + the rate
// limit) + the stale sweeper (Part 7.6 — the 2h-untouched flag) are the cron's
// secondary checks.

import { ReminderQueue } from './wave-reminder-queue.ts';
import { tridentLog } from '../utils.js';
import type { WaveTrack } from './wave-tracker.ts';

export interface TodoRow {
  content: string;
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  priority: 'high' | 'medium' | 'low';
  id: string;
}

// THE OPERATOR'S THRESHOLD (Part 7.5 — "the active T1 tasks < 3"):
export const TTQ_ACTIVE_THRESHOLD = 3;
// THE STALE WINDOW (Part 7.6 — "a todowrite task untouched for 2h+"):
export const STALE_TASK_WINDOW_MS = 2 * 60 * 60 * 1000;
// THE RATE LIMIT (Part 7.5 — "one [TTQ] reminder per cycle"):
export const TTQ_REMINDER_LIMIT_PER_CYCLE = 1;

// THE MECHANICAL-WRITE FLAG — set by the probe P2's verdict (Part 17: the
// untyped POST accepted → the direct mechanical write; else the fallback).
export let MECHANICAL_WRITE = false;
export function setMechanicalWrite(v: boolean): void {
  MECHANICAL_WRITE = !!v;
}

/** The current main session ID — set by the dispatch/hook context; used by the
 *  fallback path's reminder (the row instructions ride the tier-1 channel). */
export let currentTodoSessionId: string | null = null;
export function setCurrentTodoSessionId(sid: string | null): void {
  currentTodoSessionId = sid;
}

// THE ROW BUILDERS (Part 17 — the exact texts):
export function buildWaveRowContent(wave: WaveTrack): string {
  const n = Object.keys(wave.agents).length;
  const t = new Date(wave.dispatchedAt).toTimeString().slice(0, 5);
  const m = Math.round(wave.etaMs / 60000);
  return 'WAVE ' + wave.wave + ' — ' + n + ' agents — running since ' + t +
    ' — ETA ~' + m + 'm';
}

export function buildCompletedRowContent(wave: WaveTrack): string {
  return 'WAVE ' + wave.wave + ' — COMPLETE';
}

export function buildTTQRowContent(item: { content: string; priority: string }): string {
  return '[TTQ] ' + item.content;   // the operator's labelling — forever
}

// THE ROW-ID HASH (the deterministic id from the content — the tracker's row
// matching needs a stable id across the writes):
export function todoRowId(content: string): string {
  let h = 5381;
  for (let i = 0; i < content.length; i++) {
    h = ((h << 5) + h + content.charCodeAt(i)) | 0;
  }
  return 'todo-' + Math.abs(h).toString(36);
}

// THE WRITE PATH (Part 7.3 STEP 1): the mechanical POST when the probe passed;
// the fallback enqueues the row-change instruction to the tier-1 channel (the
// exact row text + the status ride the next tool result — the agent executes
// them; the tracker VERIFIES via the GET + the events).
export interface TodoWriteTarget {
  sessionId: string | null;
  request(url: string, opts: unknown): Promise<{ status?: number }>;
}

export async function writeTodoRows(
  sessionId: string | null,
  rows: TodoRow[],
  target: TodoWriteTarget | null = null,
): Promise<void> {
  if (MECHANICAL_WRITE && target) {
    try {
      await target.request('/session/' + (sessionId ?? currentTodoSessionId) + '/todo', {
        method: 'POST',
        body: JSON.stringify({ todos: rows }),
      });
      return;
    } catch (wErr) {
      // THE FALLBACK ON THROW (the probe-pass path failed at runtime — the
      // reminder channel still delivers the rows; the tracker's verification
      // layer never depends on the write path):
      tridentLog('WARN', 'wave-todowrite', 'the mechanical todo write failed — falling back to the tier-1 channel: ' + (wErr instanceof Error ? wErr.message : String(wErr)));
    }
  }
  // THE FALLBACK: the row-change instruction rides the tier-1 output-append.
  const rowsText = rows.map((r) =>
    r.status + ' ' + r.priority + ' "' + r.content + '"').join(' | ');
  ReminderQueue.enqueue('TODOWRITE: ' + rowsText);
}

// THE READ (the GET — always; the tracker's mechanical ground truth):
export interface TodoReadTarget {
  get(url: string): Promise<{ data?: TodoRow[] | null }>;
}

export async function readTodoRows(
  sessionId: string | null,
  target: TodoReadTarget | null = null,
): Promise<TodoRow[]> {
  if (!target) return [];
  try {
    const res = await target.get('/session/' + (sessionId ?? currentTodoSessionId) + '/todo');
    return Array.isArray(res.data) ? res.data : [];
  } catch (rErr) {
    tridentLog('WARN', 'wave-todowrite', 'the todo GET failed: ' + (rErr instanceof Error ? rErr.message : String(rErr)));
    return [];
  }
}

// THE EVENT REGISTRY (Part 13.7 + Part 17 — the tool.after hooks mapping the
// events to the plan tasks). The registry's entries are populated when the plan
// lands; the advancePlanOnEvent closes the matching rows on the closing tools.
export interface PlanTaskRef {
  content: string;                       // the plan task's todowrite content
  closeOnTools: string[];                // the tools whose completion closes it
  reopenOnFailure: boolean;
}

const EVENT_REGISTRY: PlanTaskRef[] = [];

export function registerPlanTask(ref: PlanTaskRef): void {
  if (EVENT_REGISTRY.some((r) => r.content === ref.content)) return;
  EVENT_REGISTRY.push(ref);
}

export function getPlanTasks(): PlanTaskRef[] {
  return [...EVENT_REGISTRY];
}

export function clearPlanTasks(): void {
  EVENT_REGISTRY.length = 0;
}

/** The plan-task advance — closes the matching tasks on the closing tool's
 *  completion (via the write path + the fallback reminder). Returns the rows
 *  to write (the caller owns the write). */
export function advancePlanOnEvent(toolName: string): TodoRow[] {
  const out: TodoRow[] = [];
  for (const ref of EVENT_REGISTRY) {
    if (ref.closeOnTools.includes(toolName)) {
      out.push({
        content: ref.content,
        status: 'completed',
        priority: 'high',
        id: todoRowId(ref.content),
      });
    }
  }
  if (out.length > 0) {
    void writeTodoRows(currentTodoSessionId, out);
  }
  return out;
}

// THE [TTQ] OPENING (Part 7.5 — the pure decision: the active T1 < 3 AND the
// queue has open items → the tier-1 reminder, rate-limited to one per cycle):
export function evaluateTTQOpening(
  activeT1Count: number,
  openQueueCount: number,
): boolean {
  return activeT1Count < TTQ_ACTIVE_THRESHOLD && openQueueCount > 0;
}

export function buildTTQReminder(openQueueCount: number): string {
  return '[TTQ] the task queue has ' + openQueueCount + ' open items and the plan has ' +
    'room — promote the highest-priority one (trident-task-queue update → ' +
    'active) or leave it for later. A promoted item is marked [TTQ] in the ' +
    'todowrite so it is never mistaken for a primary build task.';
}

/** The cron's [TTQ] check — rate-limited (one reminder per cycle). The wave
 *  rows are EXCLUDED from the active-T1 count (Part 7.5). */
export async function checkTTQOpening(
  rows: TodoRow[],
  openQueueCount: number,
  alreadyRemindedThisCycle = false,
): Promise<boolean> {
  const active = rows.filter((r) =>
    (r.status === 'pending' || r.status === 'in_progress')
    && !r.content.startsWith('WAVE '));       // the wave rows excluded
  if (alreadyRemindedThisCycle) return false;
  if (evaluateTTQOpening(active.length, openQueueCount)) {
    ReminderQueue.enqueue(buildTTQReminder(openQueueCount));
    return true;
  }
  return false;
}

// THE STALE SWEEPER (Part 7.6 — the 2h-untouched flag, once per window):
export function evaluateStaleness(
  row: TodoRow,
  lastTouchAt: number,
  now: number,
): boolean {
  if (row.status === 'completed' || row.status === 'cancelled') return false;
  return now - lastTouchAt > STALE_TASK_WINDOW_MS;
}

export function buildStaleReminder(content: string): string {
  return '[TODOWRITE] the task "' + content + '" has been untouched for 2h — it is ' +
    'either complete (mark it), in progress (update it), or dead (prune it). The ' +
    'todowrite is the build\'s state — a stale entry is a lie.';
}

/** The cron's stale sweep — the per-row touch history (the map the event
 *  registry updates). One reminder per staleness window. */
export const todoTouchHistory = new Map<string, number>();

export async function checkTodowriteStaleness(
  rows: TodoRow[],
  now = Date.now(),
): Promise<number> {
  let flagged = 0;
  for (const row of rows) {
    const lastTouch = todoTouchHistory.get(row.id) ?? now;
    if (evaluateStaleness(row, lastTouch, now)) {
      ReminderQueue.enqueue(buildStaleReminder(row.content));
      todoTouchHistory.set(row.id, now);        // one reminder per staleness window
      flagged++;
    }
  }
  return flagged;
}

export function touchTodoRow(id: string, at = Date.now()): void {
  todoTouchHistory.set(id, at);
}
