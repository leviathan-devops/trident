// src/tests/wave-resume.test.ts — THE RESUME HANDLER BATTERY (2026-08-11 —
// the subagent-resume hotfix). THE SANCTIONED SMOKE SECTION: the ONE scenario
// the operator authorized (the resume live mechanics against the real db —
// the interrupted sessions probe) — the container test alternative (the
// sessions live in the HOST opencode.db, unreachable from the container).
import { describe, expect, test } from 'bun:test';
import { executeWaveResume, resumeSessionInfo } from '../tools/wave-dispatch.ts';
import * as os from 'node:os';
import * as fs from 'node:fs';
// @ts-ignore — bun:sqlite ships no type package under tsc (the bun runtime provides it)
import { Database } from 'bun:sqlite';

const REAL_SESSIONS = [
  'ses_0104b61c3ffe1i7s4jiOKtH3ld',   // the wave-2 smoke lexicon (interrupted)
  'ses_0104b5f94ffeJqKXcFIFfXdiWC',   // the wave-4 gate (interrupted)
  'ses_0104b5d51ffeSAVbZlP6cHCPpe',   // the clk-wB families (interrupted)
  'ses_0104b5ab9ffeZ4PHNmJ1MD0jve',   // the clk-wC completion (interrupted)
  'ses_0104b63d1ffeRVoVUjSUvJghMN',   // the wave-1 evidence machine (COMPLETED)
];

describe('WAVE-RESUME: the handler edge cases', () => {
  test('the empty taskIds -> the loud error (never a silent empty batch)', async () => {
    let threw = '';
    try { await executeWaveResume([], []); } catch (e) { threw = e instanceof Error ? e.message : String(e); }
    expect(threw).toContain('requires at least one task_id');
  });

  test('the invalid ids -> the verified:false + the EXCLUSION from the steered (the resume never fabricates)', async () => {
    const r = await executeWaveResume(['ses_INVALID_NOPE', ''], []);
    expect(r.resumed.length).toBe(1);
    expect(r.resumed[0].verified).toBe(false);
    expect(r.steered.length).toBe(1);
    expect(r.steered[0].verified).toBe(false);
  });

  test('the duplicate ids -> deduped (the same session never resumed twice)', async () => {
    const r = await executeWaveResume(['x', 'x', 'y'], ['a', 'b', 'c']);
    const ids = r.resumed.map((x) => x.taskId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test('the name-token sanitation (the resume descriptions are safe labels — the runs collapsed, the edges trimmed)', async () => {
    const r = await executeWaveResume(['ses_INVALID_NOPE'], ['weird name with spaces!!']);
    expect(r.resumed[0].name).toBe('weird-name-with-spaces');
  });

  test('the steered shape (the resume steers the continue into the session — no batch form)', async () => {
    // The verified path needs a real session — the SANCTIONED SMOKE section below
    // covers it against the real db. This test asserts the shape with the invalid
    // path's steered entry.
    const r = await executeWaveResume(['ses_INVALID_NOPE'], []);
    expect(r.action).toBe('resume');
    expect(r.steered.length).toBe(1);
    expect(r.steered[0].verified).toBe(false);
    expect(r.checkIn).toContain('RESUME CHECK-IN');
    expect(r.checkIn).toContain('STEERED');
  });
});

describe('WAVE-RESUME: THE SANCTIONED SMOKE (the operator ONE authorized scenario - the interrupted sessions probe against the real host db)', () => {
  const dbPath = os.homedir() + '/.local/share/opencode/opencode.db';

  test('the real db exists (the host opencode.db)', () => {
    expect(fs.existsSync(dbPath)).toBe(true);
  });

  test('the 4 interrupted sessions EXIST in the db (the resume anchors are real)', () => {
    const db = new Database(dbPath, { readonly: true });
    try {
      for (const sid of REAL_SESSIONS.slice(0, 4)) {
        const row = db.query('SELECT id FROM session WHERE id = ?').get(sid);
        expect(!!row).toBe(true);
      }
    } finally { db.close(); }
  });

  test('the resumeSessionInfo probe returns the titles (the name tokens)', () => {
    const info = resumeSessionInfo(REAL_SESSIONS[0]);
    expect(info).not.toBeNull();
    expect((info as { title: string }).title.length).toBeGreaterThan(0);
    const invalid = resumeSessionInfo('ses_INVALID_NOPE');
    expect(invalid).toBeNull();
  });

  test('the full resume form composes for the 4 real sessions (the verified:true + the 4 steered continues)', async () => {
    const r = await executeWaveResume(REAL_SESSIONS.slice(0, 4), ['w2-smoke-lexicon', 'w4-gate-hook', 'clk-wB-families', 'clk-wC-completion']);
    expect(r.resumed.every((x) => x.verified)).toBe(true);
    expect(r.steered.length).toBe(4);
    for (const s of r.steered) {
      expect(s.verified).toBe(true);
      expect(s.call?.tool).toBe('task');
      const p = s.call?.parameters as { task_id?: string; prompt?: string; subagent_type?: string; description?: string };
      expect((p.task_id || '').length).toBeGreaterThan(10);
      expect(p.prompt).toBe('continue');
      // THE DERIVED TYPE (2026-08-24 — the live build-agent catch closed): the
      // RAW titles are `... (@trident_build subagent)` — the paren format the
      // old suffix-only regex MISSED (defaulting to explore). The token
      // detector now derives from the actual title: these 4 real sessions are
      // trident_build, so the correct derived value is trident_build.
      expect(p.subagent_type).toBe('trident_build');
      expect(String(p.description).length).toBeGreaterThan(5);
    }
  });
});
