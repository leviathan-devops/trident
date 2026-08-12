// ═══ SHADOW-MEMORY TESTS — the session-scoped sqlite memory (the shadow spec §3.3) ═══
// The zero-hint discipline's evidence surface: EVERY test asserts against the MEMORY TABLE
// (the rows, the mirror files, the seq, the state.json) — never against prose. Adversarial
// cases included: the corrupted state.json, the schema-drifted rows (skipped, never a crash),
// the session isolation, the same-key resume, the idempotent close.
// The memory root is sandboxed to a tmp dir via TRIDENT_PREFLIGHT_MEMORY_ROOT — the module
// resolves the root DYNAMICALLY per open(), so the env override applies. The PRODUCTION
// default stays ~/.trident-preflight-memory (the spec F-4: NEVER /tmp).

// @ts-ignore — bun:test ships the runtime, not TS declarations (bun test resolves it natively)
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  READY_FLOOR_LINES,
  ShadowMemory,
  promptMirrorFileName,
  type PromptRecord,
} from '../tools/shadow/shadow-memory.ts';

const MEM_ENV = 'TRIDENT_PREFLIGHT_MEMORY_ROOT';
let sandbox = '';

function makeRecord(seq: number, overrides: Partial<PromptRecord> = {}): PromptRecord {
  return {
    seq,
    name: 'agent-' + seq,
    prompt_text: 'EXECUTE THE FOLLOWING BUILD PLAN VERBATIM.\n' +
      'THE MISSION: the extraction of module ' + seq + '.\n' +
      'THE EXPECTED: the exports enumerated.\n'.repeat(8),
    sha256: 'sha256-of-seq-' + seq,
    template: 'E2',
    validated: true,
    lines: 125,
    created_at: '2026-08-06T00:00:0' + (seq % 10) + '.000Z',
    ...overrides,
  };
}

describe('shadow-memory', () => {
  beforeAll(() => {
    sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'shadow-mem-test-'));
    process.env[MEM_ENV] = sandbox;
  });

  afterAll(() => {
    delete process.env[MEM_ENV];
    try {
      fs.rmSync(sandbox, { recursive: true, force: true });
    } catch (e) {
      // the sandbox cleanup is best-effort — a leftover tmp dir is not a test failure
      void e;
    }
  });

  test('open() creates the session root, the sqlite (WAL), the prompts table, and state.json', () => {
    const m = ShadowMemory.open('projA', 'sess1');
    expect(fs.existsSync(m.sessionDir)).toBe(true);
    expect(fs.existsSync(path.join(m.sessionDir, 'preflight.sqlite'))).toBe(true);
    expect(fs.existsSync(path.join(m.sessionDir, 'state.json'))).toBe(true);
    expect(fs.existsSync(path.join(m.sessionDir, 'prompts'))).toBe(true);
    // the DDL (the spec §3.3) — the prompts table exists with the exact columns
    const table = m.db.query(`SELECT name FROM sqlite_master WHERE type='table' AND name='prompts'`).get();
    expect(table).toBeDefined();
    const col = m.db.query(`PRAGMA table_info('prompts')`).all() as Array<{ name: string }>;
    const cols = col.map((c) => c.name);
    for (const expected of ['id', 'seq', 'name', 'prompt_text', 'sha256', 'template', 'validated', 'lines', 'created_at']) {
      expect(cols).toContain(expected);
    }
    // WAL mode
    const pragma = m.db.query('PRAGMA journal_mode').get() as { journal_mode: string } | undefined;
    expect(pragma?.journal_mode).toBe('wal');
    // state.json — the spec §3.3 shape
    const st = m.readState();
    expect(st.sessionKey).toBe('sess1');
    expect(st.projectId).toBe('projA');
    expect(st.parentSessionId).toBeNull();
    expect(st.lastSeq).toBe(0);
    expect(st.episode.count).toBe(0);
    m.close();
  });

  test('appendPrompt: the DUAL WRITE — the sqlite row + the JSON mirror + state.lastSeq + nextSeq', () => {
    const m = ShadowMemory.open('projA', 'sess2');
    const rec = makeRecord(1);
    m.appendPrompt(rec);
    // the sqlite row (the evidence surface — the table, never the prose)
    const rows = m.db.query('SELECT seq, name, validated, lines FROM prompts').all() as Array<Record<string, unknown>>;
    expect(rows.length).toBe(1);
    expect(rows[0].seq).toBe(1);
    expect(rows[0].name).toBe('agent-1');
    expect(rows[0].validated).toBe(1);
    expect(rows[0].lines).toBe(125);
    // the append-only JSON mirror
    const mirrorPath = path.join(m.sessionDir, 'prompts', promptMirrorFileName(1, 'agent-1'));
    expect(fs.existsSync(mirrorPath)).toBe(true);
    const mirror = JSON.parse(fs.readFileSync(mirrorPath, 'utf8')) as PromptRecord;
    expect(mirror.seq).toBe(1);
    expect(mirror.prompt_text).toBe(rec.prompt_text);
    expect(mirror.sha256).toBe(rec.sha256);
    // state.lastSeq + the monotonic nextSeq
    expect(m.readState().lastSeq).toBe(1);
    expect(m.nextSeq()).toBe(2);
    m.close();
  });

  test('nextSeq is monotonic: a fresh memory = 1, then max(seq)+1 — THE ATOMIC SEQ (2026-08-07: the caller seq is ALWAYS ignored — the INSERT computes MAX(seq)+1 internally; the parallel-race fix)', () => {
    const m = ShadowMemory.open('projA', 'sess3');
    expect(m.nextSeq()).toBe(1);
    // the caller may pass ANY seq — the atomic INSERT ignores it and stores MAX+1
    // (the parallel-race fix: N concurrent pipelines all passed seq=1 → the UNIQUE
    // constraint killed all but one → the batch shipped EMPTY prompts)
    const s1 = m.appendPrompt(makeRecord(1));
    const s2 = m.appendPrompt(makeRecord(2));
    const s7 = m.appendPrompt(makeRecord(7)); // the caller seq 7 is IGNORED
    expect(s1).toBe(1);
    expect(s2).toBe(2);
    expect(s7).toBe(3); // NOT 7 — the table is the seq authority
    expect(m.nextSeq()).toBe(4); // NOT 8 — the caller's 7 never landed
    // the mirror files carry the ACTUAL seqs (1, 2, 3) + the record's OWN name
    // (the fixture names records 'agent-<seq>' — the third is 'agent-7' stored at seq 3)
    expect(fs.existsSync(path.join(m.sessionDir, 'prompts', promptMirrorFileName(3, 'agent-7')))).toBe(true);
    m.close();
  });

  test('the property: lastPrompts(n) returns min(n, count) records in ASCENDING seq order', () => {
    const m = ShadowMemory.open('projA', 'sess4');
    for (let s = 1; s <= 5; s++) m.appendPrompt(makeRecord(s));
    expect(m.lastPrompts(3).map((r) => r.seq)).toEqual([3, 4, 5]);
    expect(m.lastPrompts(2).map((r) => r.seq)).toEqual([4, 5]);
    expect(m.lastPrompts(99).length).toBe(5);
    expect(m.lastPrompts(0)).toEqual([]);
    m.close();
  });

  test('epochSummary: count + avgLines + readyRate (the tool\'s ready = validated ∧ lines >= 125)', () => {
    const m = ShadowMemory.open('projA', 'sess5');
    expect(m.epochSummary()).toEqual({ count: 0, avgLines: 0, readyRate: 0 });
    m.appendPrompt(makeRecord(1, { validated: true, lines: 200 }));
    m.appendPrompt(makeRecord(2, { validated: true, lines: 100 })); // under the 125 floor → NOT ready
    m.appendPrompt(makeRecord(3, { validated: false, lines: 300 })); // unvalidated → NOT ready
    const s = m.epochSummary();
    expect(s.count).toBe(3);
    expect(s.avgLines).toBe(200);
    expect(s.readyRate).toBeCloseTo(1 / 3, 5);
    expect(READY_FLOOR_LINES).toBe(125); // the named floor cannot drift from the tool's §7.7 bar
    m.close();
  });

  test('the resume property: the SAME session key re-opens the SAME memory (open is idempotent)', () => {
    const first = ShadowMemory.open('projA', 'sess6');
    first.appendPrompt(makeRecord(1));
    first.close();
    const second = ShadowMemory.open('projA', 'sess6'); // a fresh instance, the same root
    expect(second.lastPrompts(10).length).toBe(1);
    expect(second.nextSeq()).toBe(2); // the seq CONTINUES — the coherence battery's anchor
    second.close();
  });

  test('the session scope (L5): two sessions on one project NEVER mix', () => {
    const a = ShadowMemory.open('projA', 'sessA');
    const b = ShadowMemory.open('projA', 'sessB');
    a.appendPrompt(makeRecord(1));
    expect(a.lastPrompts(10).length).toBe(1);
    expect(b.lastPrompts(10)).toEqual([]); // B sees ZERO of A's prompts
    expect(b.nextSeq()).toBe(1); // B's seq starts fresh
    expect(a.sessionDir).not.toBe(b.sessionDir); // the roots are physically distinct
    a.close();
    b.close();
  });

  test('adversarial: the CORRUPTED state.json — readState recovers with the defaults, never crashes', () => {
    const m = ShadowMemory.open('projA', 'sess7');
    m.appendPrompt(makeRecord(1));
    fs.writeFileSync(path.join(m.sessionDir, 'state.json'), '{not-json!!', 'utf8');
    const st = m.readState(); // MUST NOT throw — the runtime-validated read
    expect(st.sessionKey).toBe('sess7');
    expect(st.projectId).toBe('projA');
    expect(st.lastSeq).toBe(0); // the recovered default
    expect(m.nextSeq()).toBe(2); // the TABLE stays the seq authority, immune to the corruption
    m.close();
  });

  test('adversarial: the schema drift — wrong-typed rows are SKIPPED, never a crash', () => {
    const m = ShadowMemory.open('projA', 'sess8');
    m.appendPrompt(makeRecord(1));
    // the drift #1: seq stored as TEXT (allowed — the schema constrains only NOT NULL) —
    // the runtime cast check (typeof r.seq === 'number') rejects it at read time
    m.db.query(
      `INSERT INTO prompts (seq, name, prompt_text, sha256, template, validated, lines, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run('drifted', 'ghost', 'a drifted prompt body', 'sha', 'E1', 1, 10, '2026-08-06T00:00:00.000Z');
    // the drift #2: validated stored as TEXT — rejected by (typeof r.validated === 'number')
    m.db.query(
      `INSERT INTO prompts (seq, name, prompt_text, sha256, template, validated, lines, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(99, 'valid-seq-bad-flag', 'another drifted body', 'sha2', 'B1', 'yes', 300, '2026-08-06T00:00:01.000Z');
    const rows = m.lastPrompts(10);
    expect(rows.length).toBe(1); // ONLY the valid row survives the cast checks
    expect(rows[0].seq).toBe(1);
    expect(rows[0].name).toBe('agent-1');
    m.close();
  });

  test('adversarial: close() is idempotent — the second close never throws', () => {
    const m = ShadowMemory.open('projA', 'sess9');
    m.close();
    m.close(); // must not throw — the catch logs + recovers
  });

  test('promptMirrorFileName: the zero-padded seq + the sanitized name', () => {
    expect(promptMirrorFileName(1, 'wave-1/src extract')).toBe('000001_wave-1-src-extract.json');
    expect(promptMirrorFileName(123, 'a/b:c')).toBe('000123_a-b-c.json');
    expect(promptMirrorFileName(42, '')).toBe('000042_prompt.json');
  });

  test('advanceEpisode: the episode counter advances + the trigger is recorded in state.json', () => {
    const m = ShadowMemory.open('projA', 'sess10');
    const ep = m.advanceEpisode('SESSION_SWITCH');
    expect(ep.count).toBe(1);
    expect(ep.trigger).toBe('SESSION_SWITCH');
    expect(m.readState().episode.count).toBe(1);
    const ep2 = m.advanceEpisode(null);
    expect(ep2.count).toBe(2);
    expect(ep2.trigger).toBeNull();
    m.close();
  });
});
