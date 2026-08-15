// src/tools/shadow/shadow-health.ts — THE MEASURED SHADOW-HEALTH STORE
// (2026-08-14 — the SHADOW-BRAIN 3-FIX PLAN, F1: the measured stall window).
//
// THE ROOT CAUSE IT FIXES: SHADOW_FETCH_STALL_MS = 45s (shadow-brain.ts:58)
// was calibrated to a 1s small-input probe, while the REAL 384K wave prompts
// document a 35-50s first-event latency (shadow-brain.ts:160-161) — a
// 5-second knife-edge that aborts HEALTHY-but-slow generations under load
// (the live SHADOW_BRAIN_TIMEOUT "no event within 45000ms" in the container +
// the other session's Critical Failure Log, same class).
//
// THE FIX: the stall window is NEVER a constant — it's a function of the
// MEASURED first-event latency of the recent shadow calls. Every shadow call
// records its first-event latency on completion; the NEXT call's stall window
// = the rolling average × 3, bounded [45s, 5m]. A genuinely-dead provider
// still fails fast (the 45s floor); a slow-but-alive provider gets the
// measured margin (no more aborting healthy generations).
//
// THE OPERATOR'S CONSTRAINT (2026-08-14): "no model switching ever. provider
// as well only backup is direct deepseek api but this should NEVER BE USED
// unless there is a legit server failure of opencode go". THIS STORE ONLY
// MEASURES + ADAPTS THE WINDOW — it never switches the provider or the model.

// @ts-ignore — bun:sqlite ships no type package under tsc (the same convention as wave-tracker.ts:103)
import { Database } from 'bun:sqlite';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { tridentLog } from '../../utils.ts';

// THE BOUNDS (the named calibration — the ISE law: named, never magic):
// - THE FLOOR (45s): a genuinely-dead provider must still fail fast — the
//   floor is the pre-fix behavior, never relaxed.
// - THE CEILING (5m): the measured average can climb under sustained load,
//   but the window must never approach the total-call ceiling (15m) — a
//   stalled provider is detected in minutes, not a quarter-hour.
// - THE MULTIPLIER (×3): the rolling average × 3 gives the slow-but-alive
//   case the margin it needs (the documented 35-50s first-event → a 105-150s
//   window) while the dead case (avg → large from a stuck stream) is capped
//   by the ceiling.
export const SHADOW_HEALTH_FLOOR_MS = 45_000;
export const SHADOW_HEALTH_CEILING_MS = 300_000;      // 5m
export const SHADOW_HEALTH_MULTIPLIER = 3;
export const SHADOW_HEALTH_WINDOW_N = 8;              // the rolling window (the last 8 calls)

// THE STORE PATH — the shared trident-tmp sqlite (the SAME dir the wave
// tracker uses — no new infra, the multi-process WAL hardening applies):
const HEALTH_DB = process.env.TRIDENT_SHADOW_HEALTH_DB
  || path.join(os.homedir(), 'OPENCODE_WORKSPACE', 'trident-tmp', 'trident-shadow-health.sqlite');

// THE CACHED HANDLE (the same pattern as the wave tracker — one open
// connection per process, the WAL + the busy timeout, the health-checked
// reopen on a stale handle):
let healthDb: Database | null = null;

function getHealthDb(): Database | null {
  if (healthDb) {
    try {
      healthDb.query('SELECT 1').get();
      return healthDb;
    } catch (healthErr) {
      try { healthDb.close(); } catch (cErr) { /* already closed */ }
      healthDb = null;
    }
  }
  try {
    fs.mkdirSync(path.dirname(HEALTH_DB), { recursive: true });
    const db = new Database(HEALTH_DB);
    try {
      db.exec('PRAGMA journal_mode = WAL;');
      db.exec('PRAGMA busy_timeout = 5000;');
    } catch (e) { /* non-fatal — the pragmas are a hardening */ }
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        db.exec(`CREATE TABLE IF NOT EXISTS shadow_health (
          provider TEXT PRIMARY KEY,
          first_event_avg REAL NOT NULL,
          n INT NOT NULL,
          last_updated INT NOT NULL
        )`);
        break;
      } catch (e) {
        if (attempt === 2) {
          tridentLog('WARN', 'shadow-health', 'the health schema setup failed after 3 attempts: ' + (e instanceof Error ? e.message : String(e)));
        } else {
          try { db.exec('PRAGMA busy_timeout = 5000;'); } catch (rErr) { /* non-fatal */ }
        }
      }
    }
    healthDb = db;
    return db;
  } catch (e) {
    tridentLog('WARN', 'shadow-health', 'the health store could not open (the measured window falls back to the floor): ' + (e instanceof Error ? e.message : String(e)));
    return null;
  }
}

// THE ROLLING AVERAGE (a bounded exponential-ish window: the row stores the
// current average + the count; each new sample nudges the average by 1/N —
// the last N calls dominate, the old history decays):
function nudgeAverage(current: number, count: number, sample: number): number {
  if (count <= 0) return sample;
  const w = Math.min(count, SHADOW_HEALTH_WINDOW_N);
  return current + (sample - current) / (w + 1);
}

/** RECORD a shadow call's first-event latency (call on the FIRST event +
 *  on completion — the latest sample wins for the window computation). */
export function recordShadowLatency(firstEventMs: number, provider: string = 'opencode-go'): void {
  if (!(firstEventMs > 0)) return;
  const db = getHealthDb();
  if (!db) return;
  try {
    const row = db.query<{ first_event_avg: number; n: number }>('SELECT first_event_avg, n FROM shadow_health WHERE provider = ?').get(provider);
    const avg = row ? nudgeAverage(row.first_event_avg, row.n, firstEventMs) : firstEventMs;
    const n = (row?.n ?? 0) + 1;
    db.run(
      'INSERT INTO shadow_health (provider, first_event_avg, n, last_updated) VALUES (?, ?, ?, ?) ON CONFLICT(provider) DO UPDATE SET first_event_avg = excluded.first_event_avg, n = excluded.n, last_updated = excluded.last_updated',
      [provider, avg, n, Date.now()],
    );
    tridentLog('DEBUG', 'shadow-health', 'recorded first-event ' + firstEventMs + 'ms → avg ' + Math.round(avg) + 'ms (n=' + n + ') for ' + provider);
  } catch (e) {
    tridentLog('WARN', 'shadow-health', 'the latency record failed (non-fatal): ' + (e instanceof Error ? e.message : String(e)));
  }
}

/** THE MEASURED STALL WINDOW (the F1 core): the rolling first-event avg × 3,
 *  bounded [45s, 5m]. Returns the FLOOR when no measurement exists (the first
 *  call / the store unavailable — the pre-fix behavior as the default). */
export function measuredShadowWindowMs(provider: string = 'opencode-go'): number {
  const db = getHealthDb();
  if (db) {
    try {
      const row = db.query<{ first_event_avg: number }>('SELECT first_event_avg FROM shadow_health WHERE provider = ?').get(provider);
      if (row && row.first_event_avg > 0) {
        const window = Math.round(row.first_event_avg * SHADOW_HEALTH_MULTIPLIER);
        const clamped = Math.max(SHADOW_HEALTH_FLOOR_MS, Math.min(SHADOW_HEALTH_CEILING_MS, window));
        tridentLog('DEBUG', 'shadow-health', 'measured window: avg ' + Math.round(row.first_event_avg) + 'ms × ' + SHADOW_HEALTH_MULTIPLIER + ' → ' + clamped + 'ms (floor ' + SHADOW_HEALTH_FLOOR_MS + ', ceiling ' + SHADOW_HEALTH_CEILING_MS + ')');
        return clamped;
      }
    } catch (e) {
      tridentLog('WARN', 'shadow-health', 'the window read failed (the floor falls back): ' + (e instanceof Error ? e.message : String(e)));
    }
  }
  return SHADOW_HEALTH_FLOOR_MS;
}

/** THE TEST-INJECTABLE RESET (the unit pins need a clean store). */
export function resetShadowHealth(provider: string = 'opencode-go'): void {
  const db = getHealthDb();
  if (!db) return;
  try {
    db.run('DELETE FROM shadow_health WHERE provider = ?', [provider]);
  } catch (e) { /* non-fatal */ }
}
