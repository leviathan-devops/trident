// src/tools/doc-density-state.ts — THE V4 DOC-DENSITY STATE MACHINE (2026-08-14)
//
// THE OPERATOR'S DIRECTIVES (verbatim):
//   "finalize on the FILE's accumulated state at/over the floor, not the single
//    write's content"
//   "an intelligent state machine scoped to the file... support the lifecycle of
//    batch file execution across long horizons without polluting or derailing
//    anything... enforce the line count per file and not misfire or slop out"
//   "proper filters per doc type — specs, ship package docs, context canon docs,
//    tmp files, etc. — all different thresholds the gate needs to track w/ intelligence"
//
// THE ISE LAW: the filter registry is the LEXICON (the detection layer — the
// path/name patterns + the weighted content markers DETECT the type); the
// DECISION is the ordered resolution (path → name → content) + the per-file
// STATE MACHINE (the decision layer) — the regex never decides alone.
// THE STATES: UNTRACKED → DRAFTING → BUILDING → COMPLETE → VERIFIED; the
// fail-state INCONCLUSIVE (the WARN-skip, NEVER a wrong throw).
// THE ACCUMULATED-STATE RULE: the floor binds on the FILE's total content
// (on disk + the edit's effect), NEVER the single write. The DRAFTING/BUILDING
// transitions NEVER throw (the chunked protocol unbroken BY CONSTRUCTION).
// THE STORE: trident-doc-state.sqlite (WAL + busy_timeout + row-keyed upserts
// keyed by the ABSOLUTE PATH + the stale prune + the verified archive).

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
// @ts-ignore — bun:sqlite ships no type package under tsc (the same convention as wave-tracker.ts)
import { Database } from 'bun:sqlite';
import { tridentLog } from '../utils.js';

// ═══ THE FILTER TYPES ═══

export type DocStateName = 'UNTRACKED' | 'DRAFTING' | 'BUILDING' | 'COMPLETE' | 'VERIFIED' | 'INCONCLUSIVE';
export type DocVerdict = 'allow' | 'throw' | 'warn-skip';

export interface DocFilter {
  id: string;
  floor: number;
  structural: RegExp[];
  pathPattern?: RegExp;    // the L1 domain match
  namePattern?: RegExp;    // the L2 type match
  contentMarkers?: Array<{ re: RegExp; weight: number }>; // the L3 content lexicon
  exempt?: boolean;        // the tool-generated domains (TMP) — never gated
}

// ═══ THE FILTER REGISTRY (Part 7 of the v4 plan — the ordered resolution) ═══
// THE ORDER IS THE RESOLUTION: the L1 path domains first (the longest-prefix
// intent — the CANON/AUDIT/SHIP/BIBLE/IDENTITY/TMP domains override the generic
// types), then the L2 name types, then the L3 content scoring. The FIRST match
// wins; the resolution is deterministic.
// THE ISE LAW (why the regexes are here): the path/name/content patterns are the
// MECHANICAL DETECTORS ONLY (the detection layer — they flag CANDIDATE types,
// never the decision). THE DECISION is the ordered resolution + the per-file
// STATE MACHINE (evaluateDocWrite — the decision layer) + the accumulated-state
// enforcement. A pattern match alone never throws; the state transition + the
// floor verification decide. THE FLOOR CALIBRATION (the named source): every
// floor (20/200/300/500/1000/2000/3000) is the warhead-7 DOC-DENSITY LAW's
// documented table (SPEC 3000 / COMPLETION 2000 / ARCHITECTURE 1000 / REPORT
// 500 / OVERVIEW 300 / AUDIT 100 / LOG 100 / GENERIC 200 + the 20-line draft
// sanity) — the floors are the calibrated bands, never magic numbers.

export const DOC_FILTER_REGISTRY: DocFilter[] = [
  // ── L1 THE PATH-BASED DOMAINS ──
  { id: 'TMP', floor: 0, structural: [], pathPattern: /(?:trident-tmp|\/tmp\/opencode|wave-tmp)/i, exempt: true },
  { id: 'AUDIT', floor: 100, structural: [/VERDICT/i, /coverage/i], pathPattern: /\.trident\/wave-audit\//i },
  { id: 'SHIP', floor: 500, structural: [], pathPattern: /Ship_Packages/i },
  { id: 'BIBLE', floor: 3000, structural: [], pathPattern: /KNOWLEDGE_LIBRARY/i },
  { id: 'IDENTITY', floor: 1000, structural: [], pathPattern: /src\/identity/i },
  { id: 'CHECKPOINTS', floor: 200, structural: [], pathPattern: /\/Checkpoints\//i },
  { id: 'CANON', floor: 200, structural: [], pathPattern: /\/context_management\//i },
  // ── L2 THE NAME-BASED TYPES ──
  { id: 'SPEC', floor: 3000, structural: [/FR-|acceptance|pass criteria|verification/i], namePattern: /SPEC|PLAN|POST-COMPACTION/i },
  { id: 'COMPLETION', floor: 2000, structural: [/definition of done|the build is complete/i], namePattern: /BUILD_REPORT|COMPLETION/i },
  { id: 'ARCHITECTURE', floor: 1000, structural: [/purpose|mission|contract|interface|data flow|wiring|failure|replication/i], namePattern: /ARCHITECTURE|OVERHAUL|BREAKDOWN/i },
  { id: 'REPORT', floor: 500, structural: [], namePattern: /REPORT|REVIEW|FINDINGS/i },
  { id: 'OVERVIEW', floor: 300, structural: [], namePattern: /README|INDEX|OVERVIEW/i },
  { id: 'LOG', floor: 100, structural: [], namePattern: /DEBUG_LOG|CHANGELOG|LOG/i },
  // ── L3 THE CONTENT LEXICON (the v3's weighted markers — the fallback) ──
  { id: 'SPEC', floor: 3000, structural: [/FR-|acceptance|pass criteria|verification/i], contentMarkers: [
    { re: /FR-\d/, weight: 5 }, { re: /functional requirement/i, weight: 5 }, { re: /acceptance criteria/i, weight: 4 },
    { re: /pass criteria/i, weight: 4 }, { re: /specification/i, weight: 3 }, { re: /verification protocol/i, weight: 2 },
  ] },
  { id: 'ARCHITECTURE', floor: 1000, structural: [/purpose|mission|contract|interface|data flow|wiring|failure|replication/i], contentMarkers: [
    { re: /data flow/i, weight: 4 }, { re: /failure mode/i, weight: 4 }, { re: /interface/i, weight: 3 },
    { re: /wiring/i, weight: 3 }, { re: /replication/i, weight: 3 }, { re: /contract/i, weight: 2 },
    { re: /\bmission\b/i, weight: 1 }, { re: /\bpurpose\b/i, weight: 1 },
  ] },
  { id: 'COMPLETION', floor: 2000, structural: [/definition of done|the build is complete/i], contentMarkers: [
    { re: /definition of done/i, weight: 4 }, { re: /the build is complete/i, weight: 4 }, { re: /completion summary/i, weight: 3 }, { re: /\bcompleted\b/i, weight: 1 },
  ] },
  { id: 'AUDIT', floor: 100, structural: [/VERDICT/i, /coverage/i], contentMarkers: [
    { re: /VERDICT/i, weight: 4 }, { re: /claims table/i, weight: 3 }, { re: /frauds found/i, weight: 3 }, { re: /coverage/i, weight: 2 },
  ] },
  { id: 'REPORT', floor: 500, structural: [], contentMarkers: [
    { re: /findings/i, weight: 3 }, { re: /results/i, weight: 2 }, { re: /review/i, weight: 2 }, { re: /recommendation/i, weight: 2 },
  ] },
  { id: 'OVERVIEW', floor: 300, structural: [], contentMarkers: [
    { re: /^# .*(index|overview|readme)/m, weight: 3 }, { re: /table of contents/i, weight: 2 },
  ] },
  { id: 'LOG', floor: 100, structural: [], contentMarkers: [
    { re: /^\s*\d{4}-\d{2}-\d{2}.*(INFO|WARN|ERROR|DEBUG)/m, weight: 5 }, { re: /(INFO|WARN|ERROR|DEBUG)\s+\d{4}-\d{2}-\d{2}/, weight: 5 },
  ] },
];

// THE CANON PER-DOC OVERRIDES (the context_management/ docs' own floors — the
// operator's config surface): the CANON domain resolves the per-doc type, but
// the high-value canon docs get their SPEC-class floors by name.
export const CANON_FLOOR_OVERRIDES: Array<{ re: RegExp; floor: number; type: string }> = [
  { re: /POST-COMPACTION_PROMPT|SPEC|PLAN/i, floor: 3000, type: 'SPEC' },
];

// THE SHIP PER-DOC OVERRIDES (the generated package docs' floors):
export const SHIP_FLOOR_OVERRIDES: Array<{ re: RegExp; floor: number; type: string }> = [
  { re: /BUILD_REPORT/i, floor: 2000, type: 'COMPLETION' },
  { re: /FULL_BUILD_CONTEXT/i, floor: 2000, type: 'COMPLETION' },
  { re: /DEBUG_LOG/i, floor: 100, type: 'LOG' },
  { re: /SHIP_MANIFEST|README|MASTER_INDEX/i, floor: 300, type: 'OVERVIEW' },
  { re: /PACKAGE_AUDIT/i, floor: 100, type: 'AUDIT' },
];

// ═══ THE ORDERED RESOLUTION (the filter decision) ═══

export function resolveDocFilter(filePath: string, accumulatedContent: string): DocFilter {
  const lower = filePath.toLowerCase();
  const base = path.basename(lower);
  // L1 the path domains (the first pathPattern match wins — the order is the priority)
  for (const f of DOC_FILTER_REGISTRY) {
    if (f.pathPattern && f.pathPattern.test(lower)) {
      // the domain overrides (CANON/SHIP per-doc floors)
      if (f.id === 'CANON') {
        for (const o of CANON_FLOOR_OVERRIDES) { if (o.re.test(lower)) return { ...f, floor: o.floor, id: o.type }; }
      }
      if (f.id === 'SHIP') {
        for (const o of SHIP_FLOOR_OVERRIDES) { if (o.re.test(lower)) return { ...f, floor: o.floor, id: o.type }; }
      }
      return f;
    }
  }
  // L2 the name types (the first namePattern match)
  for (const f of DOC_FILTER_REGISTRY) {
    if (f.namePattern && f.namePattern.test(base)) return f;
  }
  // L3 the content lexicon (the weighted presence-scoring — the highest score wins)
  let best: DocFilter | null = null;
  let bestScore = 0;
  for (const f of DOC_FILTER_REGISTRY) {
    if (!f.contentMarkers) continue;
    let score = 0;
    for (const m of f.contentMarkers) { if (m.re.test(accumulatedContent)) score += m.weight; }
    if (score > bestScore) { bestScore = score; best = f; }
  }
  if (best) return best;
  // the GENERIC fallback
  return { id: 'GENERIC', floor: 200, structural: [] };
}

// ═══ THE ACCUMULATED-STATE COMPUTATION ═══

export const DOC_COMPLETE_MARKER = '<!-- DOC-COMPLETE -->';
const DANGLING_CONTINUATION = /(?:\.\.\.|\u2026|TODO:?\s*(?:continue|finish)|to be continued|\[FILL\])/i;

export interface DocAccumulation {
  accumulatedContent: string;   // the file on disk + the edit's effect (the ground truth)
  accumulatedLines: number;
  isEdit: boolean;
  ambiguous: boolean;           // the multi-occurrence anchor → the INCONCLUSIVE candidate
}

export function computeAccumulation(input: {
  filePath: string; content: string; isEdit: boolean; oldString?: string;
}): DocAccumulation {
  const { filePath, content, isEdit, oldString } = input;
  if (!isEdit) {
    return { accumulatedContent: content, accumulatedLines: content.split('\n').length, isEdit, ambiguous: false };
  }
  // the edit: read the file's current content + apply the replace (the accumulated state)
  try {
    const cur = fs.readFileSync(filePath, 'utf-8');
    if (oldString && cur.indexOf(oldString) !== -1) {
      const occurrences = cur.split(oldString).length - 1;
      if (occurrences > 1) {
        // the multi-occurrence anchor: the post-state is undeterminable from the
        // replace — the ESTIMATE (the file + the edit's added lines) with the
        // ambiguous flag (the INCONCLUSIVE candidate — never a wrong throw).
        const addedLines = content.split('\n').length;
        return {
          accumulatedContent: cur,
          accumulatedLines: cur.split('\n').length + addedLines,
          isEdit, ambiguous: true,
        };
      }
      return { accumulatedContent: cur.replace(oldString, content), accumulatedLines: cur.replace(oldString, content).split('\n').length, isEdit, ambiguous: false };
    }
    return { accumulatedContent: cur, accumulatedLines: cur.split('\n').length, isEdit, ambiguous: false };
  } catch {
    return { accumulatedContent: content, accumulatedLines: content.split('\n').length, isEdit, ambiguous: false };
  }
}

// ═══ THE COMPLETION DETECTION (the intelligence) ═══

export interface CompletionCheck {
  completed: boolean;
  signal: string | null;   // 'marker' | 'accumulated-floor' | 'closing-structure' | null
}

export function detectCompletion(acc: DocAccumulation, filter: DocFilter): CompletionCheck {
  // 1. THE EXPLICIT MARKER (the override)
  if (acc.accumulatedContent.indexOf(DOC_COMPLETE_MARKER) !== -1) {
    return { completed: true, signal: 'marker' };
  }
  // 2. THE ACCUMULATED-STATE RULE (the operator's directive): the file's total
  //    content at/over the floor → the doc is DONE.
  if (acc.accumulatedLines >= filter.floor) {
    return { completed: true, signal: 'accumulated-floor' };
  }
  // 3. THE CLOSING-STRUCTURE RULE: the structural set complete + no dangling
  //    continuation → the doc reads as DONE even under the floor (a small but
  //    complete doc).
  if (filter.structural.length > 0 && filter.structural.every((re) => re.test(acc.accumulatedContent))
      && !DANGLING_CONTINUATION.test(acc.accumulatedContent)) {
    return { completed: true, signal: 'closing-structure' };
  }
  return { completed: false, signal: null };
}

// ═══ THE STATE MACHINE + THE DECISION ═══

export interface DocRow {
  file_path: string;
  doc_type: string;
  floor: number;
  state: DocStateName;
  accumulated_lines: number;
  completion_signal: number;
  project_token: string | null;
  last_write_at: number;
  transition_count: number;
}

export interface DocWriteEval {
  verdict: DocVerdict;
  reason: string;
  docType: string;
  floor: number;
  state: DocStateName;
  accumulatedLines: number;
  message?: string;   // the throw message (the named shortfall)
}

export function evaluateDocWrite(input: {
  filePath: string; content: string; isEdit: boolean; oldString?: string;
}): DocWriteEval {
  const { filePath, content } = input;
  const acc = computeAccumulation(input);
  const filter = resolveDocFilter(filePath, acc.accumulatedContent);
  // THE TMP/EXEMPT DOMAINS (the tool-generated — never gated)
  if (filter.exempt) {
    return { verdict: 'allow', reason: 'exempt', docType: filter.id, floor: filter.floor, state: 'UNTRACKED', accumulatedLines: acc.accumulatedLines };
  }
  // THE AMBIGUITY → the INCONCLUSIVE fail-state (the WARN-skip — never a wrong throw)
  if (acc.ambiguous) {
    return { verdict: 'warn-skip', reason: 'ambiguous', docType: filter.id, floor: filter.floor, state: 'INCONCLUSIVE', accumulatedLines: acc.accumulatedLines };
  }
  const completion = detectCompletion(acc, filter);
  // THE DRAFT/BUILD PATH (not completed): the accumulated state under the floor —
  // the chunked protocol is UNBROKEN; ONLY the 20-line sanity floor binds on the
  // first write (even a draft carries real content).
  if (!completion.completed) {
    if (acc.accumulatedLines < 20 && !input.isEdit) {
      return {
        verdict: 'throw',
        reason: 'draft-min',
        docType: filter.id, floor: filter.floor, state: 'DRAFTING', accumulatedLines: acc.accumulatedLines,
        message: '[DOC DENSITY GATE] document under-specified: only ' + acc.accumulatedLines + ' lines (min 20 — even a DRAFT carries real content). write the skeleton as a draft (allowed), then chunk-edit to the type floor, then finalize with the <!-- DOC-COMPLETE --> marker.',
      };
    }
    return { verdict: 'allow', reason: completion.completed ? 'complete' : 'draft', docType: filter.id, floor: filter.floor, state: acc.accumulatedLines >= filter.floor ? 'COMPLETE' : (input.isEdit ? 'BUILDING' : 'DRAFTING'), accumulatedLines: acc.accumulatedLines };
  }
  // THE COMPLETE PATH: the per-type floor + the structural markers VERIFY against
  // the accumulated state → PASS or THROW (the named shortfall + the remedy).
  const missingMarkers: string[] = [];
  if (filter.structural.length > 0 && !filter.structural.every((re) => re.test(acc.accumulatedContent))) {
    missingMarkers.push('the ' + filter.id + ' sections (the structural markers)');
  }
  if (acc.accumulatedLines < filter.floor || missingMarkers.length > 0) {
    const remedy = 'build to the ' + filter.id + ' standard via the CHUNKED PROTOCOL — ' + filter.floor +
      '+ lines of REAL engineering content (the interfaces, the file:line anchors, the data flows, the failure modes, the evidence, the replication detail — a fact appears ONCE, the density is the DATA, never reflow or pad). The skeleton draft is already allowed: edit-append the sections in rounds (5-8 edits per round, each ~150-250 lines, anchored to the previous content), then the FINAL edit adds the <!-- DOC-COMPLETE --> marker. The floor is judged on the FILE\'s accumulated state, not on every intermediate write.';
    return {
      verdict: 'throw',
      reason: 'floor',
      docType: filter.id, floor: filter.floor, state: 'COMPLETE', accumulatedLines: acc.accumulatedLines,
      message: '[DOC DENSITY GATE] ' + filter.id + ' document under-specified: ' +
        (acc.accumulatedLines < filter.floor ? 'only ' + acc.accumulatedLines + ' lines (min ' + filter.floor + ' — the ' + filter.id + ' floor)' : '') +
        (missingMarkers.length > 0 ? ' MISSING: ' + missingMarkers.join('; ') : '') +
        '. ' + remedy,
    };
  }
  return { verdict: 'allow', reason: 'verified', docType: filter.id, floor: filter.floor, state: 'VERIFIED', accumulatedLines: acc.accumulatedLines };
}

// ═══ THE STORE (the per-file lifecycle — the sqlite) ═══

const STATE_DB_PATH = path.join(os.homedir(), 'OPENCODE_WORKSPACE', 'trident-tmp', 'trident-doc-state.sqlite');
const STALE_PRUNE_MS = 7 * 24 * 60 * 60 * 1000; // the 7-day TTL

let stateDb: Database | null = null;

function getStateDb(): Database {
  if (stateDb === null) {
    try { fs.mkdirSync(path.dirname(STATE_DB_PATH), { recursive: true }); } catch { /* non-fatal */ }
    const db = new Database(STATE_DB_PATH) as unknown as Database;
    db.exec('PRAGMA journal_mode = WAL;');
    db.exec('PRAGMA busy_timeout = 5000;');
    db.exec(`CREATE TABLE IF NOT EXISTS doc_state (
      file_path TEXT PRIMARY KEY,
      doc_type TEXT,
      floor INTEGER,
      state TEXT,
      accumulated_lines INTEGER,
      completion_signal INTEGER,
      project_token TEXT,
      last_write_at INTEGER,
      transition_count INTEGER,
      updated_at INTEGER
    )`);
    stateDb = db;
  }
  return stateDb;
}

export function loadDocRow(filePath: string): DocRow | null {
  try {
    const row = getStateDb().query('SELECT * FROM doc_state WHERE file_path = ?').get(filePath) as DocRow | null;
    return row ?? null;
  } catch { return null; }
}

export function upsertDocRow(row: DocRow): void {
  try {
    getStateDb().run(
      `INSERT INTO doc_state (file_path, doc_type, floor, state, accumulated_lines, completion_signal, project_token, last_write_at, transition_count, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(file_path) DO UPDATE SET
         doc_type = excluded.doc_type, floor = excluded.floor, state = excluded.state,
         accumulated_lines = excluded.accumulated_lines, completion_signal = excluded.completion_signal,
         project_token = excluded.project_token, last_write_at = excluded.last_write_at,
         transition_count = excluded.transition_count, updated_at = excluded.updated_at`,
      [row.file_path, row.doc_type, row.floor, row.state, row.accumulated_lines, row.completion_signal, row.project_token, row.last_write_at, row.transition_count, Date.now()],
    );
  } catch { /* non-fatal — the in-memory decision still guards */ }
}

export function pruneStaleDocRows(): number {
  try {
    const cutoff = Date.now() - STALE_PRUNE_MS;
    const res = getStateDb().run('DELETE FROM doc_state WHERE last_write_at < ?', [cutoff]);
    return Number(res.changes ?? 0);
  } catch { return 0; }
}

export function __resetDocStore(): void {
  try { getStateDb().run('DELETE FROM doc_state'); } catch { /* test seam */ }
}

// ═══ THE GATE'S ENTRY (the hook calls this) ═══

export function runDocDensityGate(input: {
  filePath: string; content: string; isEdit: boolean; oldString?: string; projectToken?: string | null;
}): DocWriteEval {
  const evalResult = evaluateDocWrite(input);
  // the lifecycle persist: the row keyed by the absolute path (the isolation)
  if (evalResult.verdict !== 'warn-skip') {
    upsertDocRow({
      file_path: input.filePath,
      doc_type: evalResult.docType,
      floor: evalResult.floor,
      state: evalResult.state,
      accumulated_lines: evalResult.accumulatedLines,
      completion_signal: evalResult.state === 'VERIFIED' || evalResult.state === 'COMPLETE' ? 1 : 0,
      project_token: input.projectToken ?? null,
      last_write_at: Date.now(),
      transition_count: (loadDocRow(input.filePath)?.transition_count ?? 0) + 1,
    });
  }
  if (evalResult.verdict === 'throw' && evalResult.message) {
    tridentLog('WARN', 'doc-density', evalResult.message.substring(0, 200));
  }
  return evalResult;
}
