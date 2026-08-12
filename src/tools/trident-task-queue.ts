// src/tools/trident-task-queue.ts
// TRIDENT TASK-QUEUE TOOL — the idea message board (SQLite-backed).
//
// The operator's use case: "store X task for later" → fire off ideas mid-build →
// never lose them → "what ideas did I fire off?" → access idea X at time Y with:
//   Z = build_context  (the build state at storage time: project + dist sha + in-flight task)
//   A = hive_context   (relevant hive-mind context — queried LIVE at retrieval)
//   B = target_context (the operator's target context for the build)
//
// Driver: bun:sqlite — NATIVE to the bun runtime the plugin runs on
// (`import { Database } from 'bun:sqlite'`). No native npm modules to bundle.
//
// FALLBACK (documented per build plan): if bun:sqlite is unavailable at runtime
// (e.g. a non-bun host), the store degrades to a JSONL file at
// <root>/.trident/task-queue.db.jsonl with the SAME schema, SAME actions and
// SAME exports (listOpenIdeas / getDbPath) — the contract holds either way.
//
// CONTRACT for the parallel hook agent (src/hooks/trident-hooks.ts — NOT touched here):
//   listOpenIdeas(): Promise<Array<{ id: number; content: string; created_at: string; tags: string }>>
//   getDbPath(): string
// The compaction hook (experimental.session.compacting) imports these to re-surface
// open ideas after compaction — the "never lose the idea" guarantee.

// Ambient types for bun:sqlite — bun ships the runtime, not the type package.
// @ts-ignore — bun:sqlite ships the runtime, not TS declarations (bun build resolves it natively)
import { Database } from 'bun:sqlite';

// Minimal local typings for the bun:sqlite surface we use (bun ships no type package).
interface SqliteStatement<T = unknown> {
  run(...params: unknown[]): { changes: number | bigint; lastInsertRowid: number | bigint };
  all(...params: unknown[]): T[];
  get(...params: unknown[]): T | undefined;
}
interface SqliteDatabase {
  exec(sql: string): void;
  query<T = unknown>(sql: string): SqliteStatement<T>;
}

import { tool } from '../shared/tool-schema.js';
import { z } from 'zod';
import * as fs from 'fs';
import * as path from 'path';
import { appendFileSync } from 'node:fs';
import { tridentLog } from '../utils.js';
import { getClient } from '../artifacts/llm-generator.ts';

// ═══ ROW MODEL (matches the spec's task_queue.db schema exactly) ═══

interface IdeaRecord {
  id: number;
  content: string;
  created_at: string;
  status: string;
  source_session: string | null;
  project: string | null;
  dist_sha: string | null;
  build_context: string | null;
  hive_context: string | null;
  target_context: string | null;
  tags: string | null;
  notes: string | null;
  updated_at: string | null;
}

interface NewIdeaRow {
  content: string;
  created_at: string;
  source_session: string;
  project: string;
  dist_sha: string;
  build_context: string;
  target_context: string;
  tags: string;
  updated_at: string;
}

interface ListFilters {
  status?: string;
  project?: string;
  since?: string;
}

// Storage adapter — implemented by BOTH the SQLite store and the JSONL fallback.
interface TaskQueueStore {
  insert(row: NewIdeaRow): { id: number; created_at: string };
  list(filters: ListFilters): IdeaRecord[];
  get(id: number): IdeaRecord | null;
  update(id: number, patch: { status: string; note: string; updated_at: string }): boolean;
  search(query: string): IdeaRecord[];
  recent(n: number): IdeaRecord[];
  listOpen(): IdeaRecord[];
  persistHive(id: number, hive: string): void;
}

// ═══ WORKSPACE / SHA RESOLUTION ═══

function hasTridentDir(dir: string): boolean {
  try {
    return fs.statSync(path.join(dir, '.trident')).isDirectory();
  } catch {
    return false;
  }
}

// The DB lives at <workspace-root>/.trident/task-queue.db. Resolve the root by
// walking up from process.cwd() to the nearest directory containing a .trident
// folder; fall back to cwd (the active project) if none is found.
function resolveWorkspaceRoot(): string {
  let dir = process.cwd();
  for (;;) {
    if (hasTridentDir(dir)) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}

// Z anchor: the build state at storage time. dist/sha256.txt is "<sha>  <path>".
function getDistSha(project: string): string {
  try {
    const shaPath = path.join(project, 'dist', 'sha256.txt');
    const content = fs.readFileSync(shaPath, 'utf-8');
    const firstLine = content.split('\n')[0] || '';
    return (firstLine.split(/\s+/)[0] || '').trim();
  } catch {
    return '';
  }
}

function truncateContent(content: string, max = 120): string {
  return content.length > max ? content.substring(0, max) + '…' : content;
}

// ═══ SQLITE STORE (primary) ═══

const _stmtCache = new Map<string, SqliteStatement<unknown>>();

function prep(db: SqliteDatabase, sql: string): SqliteStatement<unknown> {
  let st = _stmtCache.get(sql);
  if (!st) {
    st = db.query(sql);
    _stmtCache.set(sql, st);
  }
  return st;
}

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS ideas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL,
  status TEXT DEFAULT 'open',
  source_session TEXT,
  project TEXT,
  dist_sha TEXT,
  build_context TEXT,
  hive_context TEXT,
  target_context TEXT,
  tags TEXT,
  notes TEXT,
  updated_at TEXT
)`;

const FULL_SELECT = 'SELECT id, content, created_at, status, source_session, project, dist_sha, build_context, hive_context, target_context, tags, notes, updated_at FROM ideas';

function mapRow(row: Record<string, unknown> | undefined): IdeaRecord | null {
  if (!row) return null;
  return {
    id: Number(row.id),
    content: String(row.content ?? ''),
    created_at: String(row.created_at ?? ''),
    status: String(row.status ?? 'open'),
    source_session: row.source_session == null ? null : String(row.source_session),
    project: row.project == null ? null : String(row.project),
    dist_sha: row.dist_sha == null ? null : String(row.dist_sha),
    build_context: row.build_context == null ? null : String(row.build_context),
    hive_context: row.hive_context == null ? null : String(row.hive_context),
    target_context: row.target_context == null ? null : String(row.target_context),
    tags: row.tags == null ? null : String(row.tags),
    notes: row.notes == null ? null : String(row.notes),
    updated_at: row.updated_at == null ? null : String(row.updated_at),
  };
}

class SqliteTaskQueue {
  constructor(private db: SqliteDatabase) {}

  insert(row: NewIdeaRow): { id: number; created_at: string } {
    const res = prep(this.db, `
      INSERT INTO ideas (content, created_at, status, source_session, project, dist_sha, build_context, hive_context, target_context, tags, notes, updated_at)
      VALUES (?, ?, 'open', ?, ?, ?, ?, NULL, ?, ?, NULL, ?)
    `).run(row.content, row.created_at, row.source_session, row.project, row.dist_sha, row.build_context, row.target_context, row.tags, row.updated_at);
    return { id: Number(res.lastInsertRowid), created_at: row.created_at };
  }

  list(filters: ListFilters): IdeaRecord[] {
    const where: string[] = [];
    const params: unknown[] = [];
    if (filters.status) { where.push('status = ?'); params.push(filters.status); }
    if (filters.project) { where.push('project = ?'); params.push(filters.project); }
    if (filters.since) { where.push('created_at >= ?'); params.push(filters.since); }
    const sql = FULL_SELECT
      + (where.length ? ' WHERE ' + where.join(' AND ') : '')
      + ' ORDER BY created_at DESC, id DESC';
    return (prep(this.db, sql).all(...params) as Record<string, unknown>[]).map(mapRow).filter((r): r is IdeaRecord => r !== null);
  }

  get(id: number): IdeaRecord | null {
    return mapRow(prep(this.db, `${FULL_SELECT} WHERE id = ?`).get(id) as Record<string, unknown> | undefined);
  }

  update(id: number, patch: { status: string; note: string; updated_at: string }): boolean {
    let res;
    if (patch.note) {
      res = prep(this.db, `
        UPDATE ideas SET status = ?, notes = CASE WHEN notes IS NULL OR notes = '' THEN ? ELSE notes || char(10) || ? END, updated_at = ? WHERE id = ?
      `).run(patch.status, patch.note, patch.note, patch.updated_at, id);
    } else {
      res = prep(this.db, 'UPDATE ideas SET status = ?, updated_at = ? WHERE id = ?')
        .run(patch.status, patch.updated_at, id);
    }
    return Number(res.changes) > 0;
  }

  search(query: string): IdeaRecord[] {
    const like = `%${query}%`;
    return (prep(this.db, `
      SELECT id, content, created_at, status, source_session, project, dist_sha, build_context, hive_context, target_context, tags, notes, updated_at FROM ideas
      WHERE content LIKE ? OR tags LIKE ? OR build_context LIKE ?
      ORDER BY created_at DESC, id DESC
    `).all(like, like, like) as Record<string, unknown>[]).map(mapRow).filter((r): r is IdeaRecord => r !== null);
  }

  recent(n: number): IdeaRecord[] {
    return (prep(this.db, `${FULL_SELECT} ORDER BY created_at DESC, id DESC LIMIT ?`).all(n) as Record<string, unknown>[]).map(mapRow).filter((r): r is IdeaRecord => r !== null);
  }

  listOpen(): IdeaRecord[] {
    return (prep(this.db, `${FULL_SELECT} WHERE status = 'open' ORDER BY created_at DESC, id DESC`).all() as Record<string, unknown>[]).map(mapRow).filter((r): r is IdeaRecord => r !== null);
  }

  persistHive(id: number, hive: string): void {
    prep(this.db, 'UPDATE ideas SET hive_context = ? WHERE id = ?').run(hive, id);
  }
}

// ═══ JSONL FALLBACK STORE (same schema, same contract) ═══
// Used only when bun:sqlite cannot open a Database at runtime.

class JsonlTaskQueue {
  private rows: IdeaRecord[] = [];
  private loaded = false;
  private nextId = 1;

  constructor(private file: string) {}

  private load(): void {
    if (this.loaded) return;
    this.loaded = true;
    let skipped = 0;
    try {
      if (fs.existsSync(this.file)) {
        const lines = fs.readFileSync(this.file, 'utf-8').split('\n');
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const parsed = JSON.parse(line) as IdeaRecord;
            if (typeof parsed?.id === 'number') this.rows.push(parsed);
          } catch {
            skipped++;
          }
        }
      }
    } catch (e) {
      tridentLog('WARN', 'trident-task-queue', `JSONL load failed: ${e instanceof Error ? e.message : String(e)}`);
    }
    if (skipped > 0) {
      tridentLog('WARN', 'trident-task-queue', `JSONL load: skipped ${skipped} corrupt line(s)`);
    }
    let max = 0;
    for (const r of this.rows) if (r.id > max) max = r.id;
    this.nextId = max + 1;
  }

  private persist(): void {
    try {
      const dir = path.dirname(this.file);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(this.file, this.rows.map(r => JSON.stringify(r)).join('\n') + '\n', 'utf-8');
    } catch (e) {
      tridentLog('ERROR', 'trident-task-queue', `JSONL persist failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  insert(row: NewIdeaRow): { id: number; created_at: string } {
    this.load();
    const id = this.nextId++;
    this.rows.push({ ...row, id, status: 'open', hive_context: null, notes: null });
    this.persist();
    return { id, created_at: row.created_at };
  }

  list(filters: ListFilters): IdeaRecord[] {
    this.load();
    return this.rows
      .filter(r =>
        (!filters.status || r.status === filters.status) &&
        (!filters.project || r.project === filters.project) &&
        (!filters.since || r.created_at >= filters.since))
      .sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id - a.id);
  }

  get(id: number): IdeaRecord | null {
    this.load();
    return this.rows.find(r => r.id === id) ?? null;
  }

  update(id: number, patch: { status: string; note: string; updated_at: string }): boolean {
    this.load();
    const row = this.rows.find(r => r.id === id);
    if (!row) return false;
    row.status = patch.status;
    row.updated_at = patch.updated_at;
    if (patch.note) row.notes = row.notes ? row.notes + '\n' + patch.note : patch.note;
    this.persist();
    return true;
  }

  search(query: string): IdeaRecord[] {
    this.load();
    const q = query.toLowerCase();
    return this.rows
      .filter(r =>
        r.content.toLowerCase().includes(q) ||
        (r.tags ?? '').toLowerCase().includes(q) ||
        (r.build_context ?? '').toLowerCase().includes(q))
      .sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id - a.id);
  }

  recent(n: number): IdeaRecord[] {
    this.load();
    return [...this.rows].sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id - a.id).slice(0, n);
  }

  listOpen(): IdeaRecord[] {
    this.load();
    return this.rows
      .filter(r => r.status === 'open')
      .sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id - a.id);
  }

  persistHive(id: number, hive: string): void {
    this.load();
    const row = this.rows.find(r => r.id === id);
    if (row) { row.hive_context = hive; this.persist(); }
  }
}

// ═══ LAZY STORE SELECTION ═══

let _store: TaskQueueStore | null = null;

export function getDbPath(): string {
  return path.join(resolveWorkspaceRoot(), '.trident', 'task-queue.db');
}

function getStore(): TaskQueueStore {
  if (_store) return _store;
  const dbPath = getDbPath();
  try {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    const db = new Database(dbPath) as SqliteDatabase;
    db.exec('PRAGMA journal_mode=WAL');
    db.exec(SCHEMA_SQL);
    _store = new SqliteTaskQueue(db);
    tridentLog('INFO', 'trident-task-queue', `SQLite store ready: ${dbPath}`);
  } catch (e) {
    tridentLog('WARN', 'trident-task-queue', `bun:sqlite unavailable — falling back to JSONL store: ${e instanceof Error ? e.message : String(e)}`);
    _store = new JsonlTaskQueue(dbPath + '.jsonl');
  }
  return _store;
}

// ═══ LIVE HIVE-MIND CONTEXT (A) AT RETRIEVAL ═══
// Same client mechanism as the LLM tools (setClientGetter/getClient in
// llm-generator.ts). 60s timeout + full try/catch — a hive query failure never
// breaks retrieval, it degrades to the documented sentinel.

async function queryHiveContext(content: string): Promise<string> {
  let client: any = null;
  try {
    const getter = getClient();
    if (getter) client = getter();
  } catch {
    return 'hive query unavailable at retrieval';
  }
  if (!client || typeof client?.session?.prompt !== 'function') {
    return 'hive query unavailable at retrieval';
  }

  const prompt = 'return the top 2 most relevant hive knowledge entries for: ' + content;

  const timeout = new Promise<string>(resolve => {
    const t = setTimeout(() => resolve('hive query timed out'), 60000);
    if (typeof t.unref === 'function') t.unref();
  });

  const run = (async (): Promise<string> => {
    let sid: string | null = null;
    try {
      const sessionResult = await client.session.create({ body: { title: 'TaskQueue hive ctx' } });
      sid = sessionResult?.data?.id ?? null;
      if (!sid) return 'hive query unavailable at retrieval';
      const response = await client.session.prompt({
        // THE TOKEN CAP (2026-08-07 — the operator's ruling: the 8K slop is
        // purged; the session model decides — deepseek → 384000, else 128000.
        // This call runs the session model, so the cap follows it).
        body: { parts: [{ type: 'text', text: prompt }], max_tokens: 128000 },
        path: { id: sid },
      });
      const parts = response?.data?.parts || response?.parts || [];
      const text = (Array.isArray(parts) ? parts : [])
        .filter((p: any) => p?.type === 'text' && p?.text)
        .map((p: any) => p.text)
        .join('\n')
        .trim();
      return text || 'hive query returned no entries';
    } catch {
      return 'hive query unavailable at retrieval';
    } finally {
      if (sid) {
        try {
          await client.session.delete({ path: { id: sid } });
        } catch (e) {
          tridentLog('WARN', 'trident-task-queue', `hive session cleanup failed (non-fatal): ${e instanceof Error ? e.message : String(e)}`);
        }
      }
    }
  })();

  return await Promise.race([run, timeout]);
}

// ═══ DEBUG LOG CHANNEL (store + debug=true) — M3 live-log fix ═══
// Appends the stored idea to DEBUG_LOG_V3.md at the workspace root, carrying the
// current dist SHA so every stored idea keeps the debug log live.

function appendDebugLog(project: string, sha: string, id: number, content: string, created_at: string): void {
  try {
    const logPath = path.join(project, 'DEBUG_LOG_V3.md');
    const entry = [
      '',
      `### TASK-QUEUE STORE (idea #${id}) — ${created_at}`,
      `- content: ${truncateContent(content, 200)}`,
      `- dist_sha: ${sha || 'none'}`,
      '',
    ].join('\n');
    appendFileSync(logPath, entry, 'utf-8');
    tridentLog('INFO', 'trident-task-queue', `DEBUG_LOG_V3.md appended for idea #${id}`);
  } catch (e) {
    tridentLog('WARN', 'trident-task-queue', `DEBUG_LOG_V3 append failed (non-fatal): ${e instanceof Error ? e.message : String(e)}`);
  }
}

// ═══ ACTION HANDLERS ═══

function toBoard(r: IdeaRecord) {
  return { id: r.id, created_at: r.created_at, content: truncateContent(r.content, 120), status: r.status, tags: r.tags ?? '' };
}

function toId(params: Record<string, unknown>): number | null {
  const raw = typeof params.id === 'number' ? params.id : typeof params.id === 'string' ? Number(params.id) : NaN;
  return Number.isFinite(raw) ? Math.floor(raw) : null;
}

async function doStore(params: Record<string, unknown>): Promise<string> {
  const content = typeof params.content === 'string' ? params.content : '';
  if (content.length < 20) {
    return `VALIDATION ERROR: content is required and must be >= 20 characters (got ${content.length}). Field: content. A stub idea is rejected — describe the idea fully.`;
  }
  const now = new Date().toISOString();
  const project = resolveWorkspaceRoot();
  const row: NewIdeaRow = {
    content,
    created_at: now,
    source_session: typeof params.sessionID === 'string' && params.sessionID ? params.sessionID : 'unknown',
    project,
    dist_sha: getDistSha(project),
    build_context: typeof params.buildContext === 'string' && params.buildContext ? params.buildContext : 'in-flight',
    target_context: typeof params.targetContext === 'string' ? params.targetContext : '',
    tags: typeof params.tags === 'string' ? params.tags : '',
    updated_at: now,
  };
  const { id, created_at } = getStore().insert(row);
  if (params.debug === true) appendDebugLog(project, row.dist_sha, id, content, created_at);
  await tridentLog('INFO', 'trident-task-queue', `store ok id=${id} sha=${row.dist_sha || 'none'}`);
  return JSON.stringify({ id, created_at }, null, 2);
}

async function doList(params: Record<string, unknown>): Promise<string> {
  const filters: ListFilters = {};
  if (typeof params.status === 'string' && params.status) filters.status = params.status;
  if (typeof params.project === 'string' && params.project) filters.project = params.project;
  if (typeof params.since === 'string' && params.since) filters.since = params.since;
  const board = getStore().list(filters).map(toBoard);
  await tridentLog('INFO', 'trident-task-queue', `list ok count=${board.length}`);
  return JSON.stringify({ ok: true, count: board.length, ideas: board }, null, 2);
}

async function doGet(params: Record<string, unknown>): Promise<string> {
  const id = toId(params);
  if (id === null) return 'VALIDATION ERROR: id is required for action=get — pass the idea number (e.g. id=17). Field: id.';
  const store = getStore();
  const row = store.get(id);
  if (!row) {
    await tridentLog('INFO', 'trident-task-queue', `get id=${id} — not found`);
    return JSON.stringify({ ok: false, error: `No idea found with id=${id}`, id }, null, 2);
  }
  const hive = await queryHiveContext(row.content);
  row.hive_context = hive;
  store.persistHive(id, hive);
  await tridentLog('INFO', 'trident-task-queue', `get id=${id} hive=${truncateContent(hive, 40)}`);
  return JSON.stringify({
    ok: true,
    id: row.id,
    content: row.content,
    created_at: row.created_at,
    status: row.status,
    project: row.project,
    dist_sha: row.dist_sha,
    build_context: row.build_context,
    target_context: row.target_context,
    tags: row.tags ?? '',
    notes: row.notes ?? '',
    hive_context: hive,
  }, null, 2);
}

async function doUpdate(params: Record<string, unknown>): Promise<string> {
  const id = toId(params);
  if (id === null) return 'VALIDATION ERROR: id is required for action=update. Field: id.';
  const status = typeof params.status === 'string' ? params.status : '';
  if (!status) return 'VALIDATION ERROR: status is required for action=update (open|active|done|cancelled). Field: status.';
  if (!['open', 'active', 'done', 'cancelled'].includes(status)) {
    return `VALIDATION ERROR: status must be one of open|active|done|cancelled (got "${status}"). Field: status.`;
  }
  const note = typeof params.note === 'string' ? params.note : '';
  const updated_at = new Date().toISOString();
  const ok = getStore().update(id, { status, note, updated_at });
  if (!ok) {
    await tridentLog('INFO', 'trident-task-queue', `update id=${id} status=${status} — not found`);
    return JSON.stringify({ ok: false, error: `No idea found with id=${id}`, id }, null, 2);
  }
  await tridentLog('INFO', 'trident-task-queue', `update id=${id} status=${status}`);
  return JSON.stringify({ ok: true, id, status, updated_at, note: note || '' }, null, 2);
}

async function doSearch(params: Record<string, unknown>): Promise<string> {
  const query = typeof params.query === 'string' ? params.query.trim() : '';
  if (!query) return 'VALIDATION ERROR: query is required for action=search. Field: query.';
  const results = getStore().search(query).map(toBoard);
  await tridentLog('INFO', 'trident-task-queue', `search q="${query}" hits=${results.length}`);
  return JSON.stringify({ ok: true, query, count: results.length, results }, null, 2);
}

async function doRecent(params: Record<string, unknown>): Promise<string> {
  let n = typeof params.n === 'number' && Number.isFinite(params.n) ? Math.floor(params.n) : 10;
  if (n < 1) n = 1;
  if (n > 100) n = 100;
  const ideas = getStore().recent(n).map(toBoard);
  await tridentLog('INFO', 'trident-task-queue', `recent n=${n} count=${ideas.length}`);
  return JSON.stringify({ ok: true, n, count: ideas.length, ideas }, null, 2);
}

async function runQueue(action: string, params: Record<string, unknown>): Promise<string> {
  try {
    switch (action) {
      case 'store': return await doStore(params);
      case 'list': return await doList(params);
      case 'get': return await doGet(params);
      case 'update': return await doUpdate(params);
      case 'search': return await doSearch(params);
      case 'recent': return await doRecent(params);
      default:
        return `ERROR: unknown action "${String(action)}" — valid actions: store, list, get, update, search, recent.`;
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await tridentLog('ERROR', 'trident-task-queue', `action=${action} failed: ${msg}`);
    return `ERROR: trident-task-queue ${action} failed: ${msg}`;
  }
}

// ═══ CONTRACT EXPORTS (consumed by the parallel hook agent) ═══

export async function listOpenIdeas(): Promise<Array<{ id: number; content: string; created_at: string; tags: string }>> {
  try {
    return getStore().listOpen().map(r => ({ id: r.id, content: r.content, created_at: r.created_at, tags: r.tags ?? '' }));
  } catch (e) {
    await tridentLog('ERROR', 'trident-task-queue', `listOpenIdeas failed: ${e instanceof Error ? e.message : String(e)}`);
    return [];
  }
}

// ═══ TOOL REGISTRATION ═══

export function createTaskQueueTool() {
  return tool({
    description: 'Task-queue message board (SQLite-backed): store ideas mid-build, list/get/update/search them later. Fire-and-forget: store X task for later. Manual retrieval: what ideas did I fire off. Never loses an idea — compaction re-surfaces open ones.',
    args: {
      action: z.enum(['store', 'list', 'get', 'update', 'search', 'recent']).describe('The queue action: store=fire off an idea (fire-and-forget), list=the message board, get=full record + live hive context, update=status lifecycle, search=text search over content/tags/build_context, recent=last N regardless of status'),
      content: z.string().optional().describe('The idea, verbatim. REQUIRED for store — min 20 chars; a stub idea is rejected.'),
      id: z.number().optional().describe('The stable idea handle ("idea #17"). REQUIRED for get and update.'),
      status: z.enum(['open', 'active', 'done', 'cancelled']).optional().describe('Lifecycle status. REQUIRED for update; optional filter for list.'),
      project: z.string().optional().describe('Filter: list only ideas from this project.'),
      since: z.string().optional().describe('Filter: list only ideas created at or after this ISO timestamp.'),
      query: z.string().optional().describe('Search text — LIKE over content/tags/build_context. REQUIRED for search.'),
      tags: z.string().optional().describe('Comma-separated tags for the idea (store).'),
      targetContext: z.string().optional().describe('B — the operator target context for the build (store).'),
      buildContext: z.string().optional().describe('Z — the storage-time build context / what was in flight (store; defaults to "in-flight").'),
      sessionID: z.string().optional().describe('The session that fired the idea (auto-captured as "unknown" if omitted).'),
      note: z.string().optional().describe('Lifecycle/resolution note appended to the idea (update).'),
      n: z.number().optional().describe('How many recent ideas to return (default 10, max 100).'),
      debug: z.boolean().optional().describe('store with debug=true also appends the entry to DEBUG_LOG_V3.md with the current dist SHA (M3 live-log fix).'),
    },
    execute: async (args: {
      action?: string;
      content?: string;
      id?: number;
      status?: string;
      project?: string;
      since?: string;
      query?: string;
      tags?: string;
      targetContext?: string;
      buildContext?: string;
      sessionID?: string;
      note?: string;
      n?: number;
      debug?: boolean;
    }) => {
      const action = args.action || '';
      const params: Record<string, unknown> = { ...args };
      return await runQueue(action, params);
    },
  });
}
