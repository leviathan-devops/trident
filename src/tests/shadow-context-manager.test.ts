// ============================================================================
// file: src/tests/shadow-context-manager.test.ts
//
// THE CONTEXT MANAGER UNIT TESTS (spec §3.5, D-SH-1/D-SH-3). Adversarial-first:
// the session-window cap, the last-N chain from a SEEDED SQLITE MEMORY (sql.js
// — the project's declared SQLite dependency, the "tmp sqlite" of the battery),
// the LIAR count claim, the LIAR named anchor, the PLANTED-BUG missing file,
// the negative (zero false flags), the empty probe — THEN the exact
// [SHADOW INFERENCE] title (D-SH-3) + the rendered chain.
// ============================================================================

import { describe, expect, test } from 'bun:test';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import initSqlJs from 'sql.js';
import {
  analyzeFileContent,
  buildContext,
  detectContradictions,
  CHAIN_LENGTH,
  SESSION_STREAM_WINDOW,
  SHADOW_INFERENCE_SECTION_TITLE,
  type ContextArgs,
  type FileExcerpt,
  type ShadowMemoryLike,
  type ShadowPromptRecord,
} from '../tools/shadow/shadow-context-manager.ts';

// THE SEEDED MEMORY — a REAL sqlite (sql.js, the project's declared SQLite
// dependency) holding the prompts table, wrapped in the ShadowMemoryLike
// surface the context manager consumes. Fresh per test — isolated, no
// cross-test contamination.
const SQLJS_DIR = fileURLToPath(new URL('../../node_modules/sql.js/dist/', import.meta.url));

async function createSeededMemory(records: ShadowPromptRecord[]): Promise<ShadowMemoryLike> {
  const SQL = await initSqlJs({ locateFile: (file: string) => path.join(SQLJS_DIR, file) });
  const db = new SQL.Database();
  db.run(`CREATE TABLE IF NOT EXISTS prompts (
    id INTEGER PRIMARY KEY AUTOINCREMENT, seq INTEGER NOT NULL, name TEXT NOT NULL,
    prompt_text TEXT NOT NULL, sha256 TEXT NOT NULL, template TEXT NOT NULL,
    validated INTEGER NOT NULL, lines INTEGER NOT NULL, created_at TEXT NOT NULL
  );`);
  for (const r of records) {
    db.run('INSERT INTO prompts (seq, name, prompt_text, sha256, template, validated, lines, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [r.seq, r.name, r.prompt_text, r.sha256, r.template, r.validated ? 1 : 0, r.lines, r.created_at]);
  }
  return {
    lastPrompts(n: number): ShadowPromptRecord[] {
      const rows = db.exec(`SELECT seq, name, prompt_text, sha256, template, validated, lines, created_at FROM prompts ORDER BY seq DESC LIMIT ${n}`);
      if (rows.length === 0 || rows[0].values.length === 0) return [];
      const { columns, values } = rows[0];
      return values
        .map((v) => {
          const row: Record<string, unknown> = {};
          columns.forEach((c, i) => { row[c] = v[i]; });
          return {
            seq: Number(row.seq),
            name: String(row.name),
            prompt_text: String(row.prompt_text),
            sha256: String(row.sha256),
            template: String(row.template),
            validated: Number(row.validated) === 1,
            lines: Number(row.lines),
            created_at: String(row.created_at),
          };
        })
        .reverse(); // the last N in ascending seq order — the chain order
    },
    epochSummary(): string {
      const rows = db.exec('SELECT COUNT(*) AS c, AVG(lines) AS avg_lines, AVG(validated) AS ready_rate FROM prompts');
      if (rows.length === 0 || rows[0].values.length === 0) return '';
      const { columns, values } = rows[0];
      const row: Record<string, unknown> = {};
      columns.forEach((c, i) => { row[c] = values[0][i]; });
      const c = Number(row.c ?? 0);
      if (c === 0) return '';
      return c + ' generations, avg ' + Math.round(Number(row.avg_lines ?? 0)) + ' lines, ' +
        Math.round(Number(row.ready_rate ?? 0) * 100) + '% validated';
    },
  };
}

// The ground-truth file label — built from the cwd so only the BASENAME
// matters to the R2 detector (the excerpt-set comparison never depends on the
// workspace's absolute location).
const FILE_A = path.join(process.cwd(), 'src', 'tools', 'trident-task-preflight.ts');

function makeSpec(overrides: Partial<ContextArgs> = {}): ContextArgs {
  return {
    mission: 'THE MISSION — audit the target module and produce the extraction report.',
    knownContext: 'THE KNOWN CONTEXT — the module under analysis sits in src/tools/trident-task-preflight.ts.',
    doctrine: 'THE DOCTRINE — the operator\'s rulings; the files are the only ground truth.',
    measurements: 'THE MEASUREMENTS — the module at 605 lines, the CTX_FLOORS at 200/100/50.',
    acceptance: 'THE ACCEPTANCE — the report names the exports, the anchors, and the contradictions.',
    taskTargets: 'THE PER-TASK TARGETS — extract the exports, verify the context claims, flag the conflicts.',
    position: 'THE POSITION — the first build wave of the shadow backend.',
    filepaths: [FILE_A],
    ...overrides,
  };
}

function makeExcerpt(p: string, content: string, lines?: number): FileExcerpt {
  return { path: p, content, lines: lines ?? content.split('\n').length };
}

// THE GROUND-TRUTH FILE: 3 functions + 1 const = 4 exports, 3 functions
const CONTENT_3 = [
  'export function foo(): void { /* the foo entry */ }',
  'export function bar(): void { /* the bar entry */ }',
  'export function baz(): void { /* the baz entry */ }',
  'export const VALUE = 42;',
].join('\n');

describe('shadow-context-manager — the chain + the [SHADOW INFERENCE] (D-SH-1/D-SH-3)', () => {
  test('ANCHORS: analyzeFileContent extracts the exports + the counts from an excerpt', () => {
    const a = analyzeFileContent(CONTENT_3);
    expect(a.anchors).toContain('foo');
    expect(a.anchors).toContain('bar');
    expect(a.anchors).toContain('baz');
    expect(a.anchors).toContain('VALUE');
    expect(a.exportCount).toBe(4); // 3 functions + 1 const
    expect(a.functionCount).toBe(3);
  });

  // ADVERSARIAL 1 — THE SESSION WINDOW (D-SH-1): capped at 30, the LAST 30
  test('SESSION WINDOW: the recent ~30-message window is capped at the LAST 30 entries', async () => {
    const messages = Array.from({ length: 45 }, (_v, i) => ({ role: 'user', content: 'message ' + i }));
    const mem = await createSeededMemory([]);
    const ctx = buildContext(mem, makeSpec(), messages, []);
    expect(ctx.chainUsed.sessionWindow).toHaveLength(SESSION_STREAM_WINDOW);
    expect(ctx.chainUsed.sessionWindow[0].content).toBe('message 15'); // the first of the LAST 30
    expect(ctx.chainUsed.sessionWindow[29].content).toBe('message 44'); // the newest survives
  });

  // ADVERSARIAL 2 — THE CHAIN last-N FROM THE SEEDED SQLITE MEMORY
  test('CHAIN: the last-N generations come from the seeded sqlite memory, ascending by seq', async () => {
    const records: ShadowPromptRecord[] = Array.from({ length: 7 }, (_v, i) => ({
      seq: i + 1,
      name: 'wave-' + (i + 1),
      prompt_text: 'EXECUTE THE FOLLOWING — the generation ' + (i + 1) + '\nmore content',
      sha256: 'sha-' + (i + 1),
      template: 'E2',
      validated: true,
      lines: 200 + i,
      created_at: '2026-08-06T00:0' + i + ':00Z',
    }));
    const mem = await createSeededMemory(records);
    const ctx = buildContext(mem, makeSpec(), [], []);
    expect(ctx.chainUsed.priorPrompts).toHaveLength(CHAIN_LENGTH); // the last 5 of 7
    expect(ctx.chainUsed.priorPrompts.map((p) => p.seq)).toEqual([3, 4, 5, 6, 7]); // ascending — the chain order
    expect(ctx.chainUsed.epochSummary).toContain('7 generations');
    expect(ctx.chainUsed.text).toContain('[seq 7]');
    expect(ctx.chainUsed.text).toContain('wave-7');
  });

  // ADVERSARIAL 3 — THE LIAR (the L4 supremacy): the count claim contradicted
  test('THE LIAR — the count claim: "5 functions / 8 modules" over an excerpt showing 3 functions / 1 file → FLAGGED', async () => {
    const spec = makeSpec({ mission: 'THE MISSION — the module exports 5 functions and the tool has 8 modules.' });
    const excerpts = [makeExcerpt(FILE_A, CONTENT_3)];
    const ctx = buildContext(await createSeededMemory([]), spec, [], excerpts);
    expect(ctx.inference.flags.length).toBeGreaterThanOrEqual(2);
    const kinds = ctx.inference.flags.map((f) => f.kind);
    expect(kinds).toContain('CONTRADICTION');
    const text = ctx.inference.text;
    expect(text).toContain('5 functions');
    expect(text).toContain('3 function(s)'); // the real file state reported
    expect(text).toContain('8 modules');
    expect(text).toContain('1 module(s)');
    expect(text).toContain('FLAG'); // never conformed
  });

  // ADVERSARIAL 4 — THE LIAR (the named anchor): absent → FLAGGED
  test('THE LIAR — the named anchor: "the quux function" over an excerpt without quux → FLAGGED', async () => {
    const spec = makeSpec({ mission: 'THE MISSION — the quux function is the primary entry point of the module.' });
    const excerpts = [makeExcerpt(FILE_A, CONTENT_3)];
    const flags = detectContradictions(spec, excerpts);
    const quuxFlag = flags.find((f) => f.claim.includes('quux'));
    expect(quuxFlag).toBeTruthy();
    expect(quuxFlag?.evidence).toContain('no function named "quux"');
  });

  // ADVERSARIAL 5 — THE PLANTED BUG (the missing file): a cited .ts absent
  // from the excerpt set → FLAGGED
  test('THE PLANTED BUG — the missing file: a cited .ts path absent from the excerpt set → FLAGGED', async () => {
    const spec = makeSpec({
      knownContext: 'THE KNOWN CONTEXT — the ghost module lives at src/tools/ghost.ts and exports the phantom.',
    });
    const excerpts = [makeExcerpt(FILE_A, CONTENT_3)];
    const flags = detectContradictions(spec, excerpts);
    expect(flags.some((f) => f.claim.includes('src/tools/ghost.ts'))).toBe(true);
    expect(flags.some((f) => f.evidence.includes('absent from the ground-truth set'))).toBe(true);
  });

  // ADVERSARIAL 6 — THE NEGATIVE (no false flags): matching claims pass clean
  test('THE NEGATIVE: a matching count claim + a present anchor → ZERO flags (no false positives)', async () => {
    const spec = makeSpec({
      mission: 'THE MISSION — the module exports 3 functions and the foo function is the primary entry point.',
    });
    const excerpts = [makeExcerpt(FILE_A, CONTENT_3)];
    const flags = detectContradictions(spec, excerpts);
    expect(flags).toHaveLength(0);
  });

  // ADVERSARIAL 7 — THE EMPTY PROBE: no memory, no stream, no excerpts —
  // buildContext never crashes, never fabricates
  test('THE EMPTY PROBE: an empty memory + empty stream + empty excerpts assemble the inference without crashing', async () => {
    const mem = await createSeededMemory([]);
    const ctx = buildContext(mem, makeSpec(), [], []);
    expect(ctx.chainUsed.priorPrompts).toHaveLength(0);
    expect(ctx.chainUsed.sessionWindow).toHaveLength(0);
    expect(ctx.chainUsed.epochSummary).toBe('');
    expect(ctx.inference.text).toContain('no file excerpts were provided');
    expect(ctx.inference.text).toContain('no contradictions detected');
    expect(ctx.inference.flags).toHaveLength(0);
  });

  // THE EXACT TITLE (D-SH-3): the section header is EXACTLY "## [SHADOW INFERENCE]"
  test('THE [SHADOW INFERENCE] TITLE: the section header is EXACTLY "## [SHADOW INFERENCE]"', async () => {
    const mem = await createSeededMemory([]);
    const excerpts = [makeExcerpt(FILE_A, CONTENT_3)];
    const ctx = buildContext(mem, makeSpec(), [], excerpts);
    expect(ctx.inference.sectionTitle).toBe(SHADOW_INFERENCE_SECTION_TITLE);
    expect(ctx.inference.sectionTitle).toBe('## [SHADOW INFERENCE]');
    expect(ctx.inference.text.startsWith('## [SHADOW INFERENCE]')).toBe(true);
    // the inference body names the anchors + the task + the flags section
    expect(ctx.inference.text).toContain('What the files actually are');
    expect(ctx.inference.text).toContain('What the task actually requires');
    expect(ctx.inference.text).toContain('trident-task-preflight.ts');
    expect(ctx.inference.text).toContain('foo');
  });

  // THE CHAIN TEXT — the prior generation lines + the epoch + the stream
  test('THE CHAIN TEXT: the rendered chain carries the prior generation lines + the epoch + the stream', async () => {
    const records: ShadowPromptRecord[] = [
      { seq: 1, name: 'wave-1', prompt_text: 'EXECUTE THE FOLLOWING — the first generation', sha256: 's1', template: 'E1', validated: true, lines: 210, created_at: '2026-08-06T00:01:00Z' },
      { seq: 2, name: 'wave-2', prompt_text: 'EXECUTE THE FOLLOWING — the second generation', sha256: 's2', template: 'E1', validated: true, lines: 230, created_at: '2026-08-06T00:02:00Z' },
    ];
    const mem = await createSeededMemory(records);
    const ctx = buildContext(mem, makeSpec(), [{ role: 'user', content: 'the recent directive' }], []);
    expect(ctx.chainUsed.text).toContain('the first generation');
    expect(ctx.chainUsed.text).toContain('the second generation');
    expect(ctx.chainUsed.text).toContain('2 generations');
    expect(ctx.chainUsed.text).toContain('[user] the recent directive');
  });
});
