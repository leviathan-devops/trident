// ============================================================================
// file: src/sidecar/fs-utils.ts
//
// E0-documented manifest addition to the V5 orchestrator spec's file list
// (§25.1 does not list this file): the spec's ledger.ts (§19.1) imports
// { appendJson } from './fs-utils.js', so the module is created here as the
// single home for the ledger's atomic-append, the env-driven acceptance
// parser, the protected-path loader, and the FsReadDeps implementation used
// by quality-gate.ts / signals.ts (fsDeps).
//
// No stdout/logging output — this module writes only to its callers' files.
// ============================================================================

import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  statSync,
  writeFileSync,
  type Stats,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import type { AcceptanceSpec, FsReadDeps } from './types.js';

/**
 * Filename-safe timestamp stamp: `YYYYMMDD-HHmmss`.
 * With no argument it stamps the current time; with an ISO string it parses
 * that instant (falling back to the current time on an unparseable input,
 * so a caller can never produce an invalid filename).
 */
export function ts(t?: string): string {
  const d = t ? new Date(t) : new Date();
  const src = Number.isNaN(d.getTime()) ? new Date() : d;
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${src.getFullYear()}${p(src.getMonth() + 1)}${p(src.getDate())}-` +
    `${p(src.getHours())}${p(src.getMinutes())}${p(src.getSeconds())}`;
}

/**
 * Atomic, never-overwrite JSON append used by the ledger (§19.1).
 *
 * The ledger's appendJson semantics: every call is written to a NEW file
 * whose name already carries a ts() stamp, so collisions are impossible.
 * This implementation stays append-safe regardless of caller discipline:
 *   - mkdir -p the target directory,
 *   - if the exact target already exists, disambiguate with a `.1`, `.2`, ...
 *     suffix so an existing file is NEVER overwritten,
 *   - write to `${target}.tmp` then rename into place (atomic publish).
 */
export function appendJson(file: string, obj: unknown): void {
  mkdirSync(dirname(file), { recursive: true });
  const payload = `${JSON.stringify(obj, null, 2)}\n`;
  let target = file;
  for (let n = 1; existsSync(target); n += 1) {
    target = `${file}.${n}`;
  }
  const tmp = `${target}.tmp`;
  writeFileSync(tmp, payload, 'utf8');
  renameSync(tmp, target);
}

/**
 * Load the operator-extensible firewall roots (§20 / §18.1).
 * Reads `{ blockedRoots: string[] }` from the given JSON path; returns the
 * array (empty on a missing/invalid file — index.ts passes its own built-in
 * roots as a second layer, so a missing file never weakens containment).
 */
export function loadProtectedPaths(p: string): string[] {
  const parsed = safeRead(p);
  if (parsed === null) return [];
  try {
    const obj = JSON.parse(parsed) as { blockedRoots?: unknown };
    if (Array.isArray(obj.blockedRoots)) {
      return obj.blockedRoots.filter((r): r is string => typeof r === 'string');
    }
  } catch {
    return [];
  }
  return [];
}

/**
 * Parse the acceptance spec from the SHADOW_ACCEPTANCE env var (JSON), or
 * fall back to the §9.2 default acceptance:
 *   requiredFiles: []
 *   markers:       [{ hive-map-canvas, /app }, { HIVE PILOT VERIFIED, /app }]
 *   dataJson:      { path: '/app/data.json', minEvents: 1 }
 *
 * NOTE (documented): the framework default floor is minEvents=1 (§9.2). The
 * osint-dashboard SPEC.md acceptance requires `data.json events >= 10`; that
 * stricter bound is enforced when the build sets SHADOW_ACCEPTANCE (or a
 * future SPEC.md acceptance parser) — quality-gate.ts consumes whichever
 * AcceptanceSpec it is handed.
 */
export function acceptanceFromEnv(env = process.env): AcceptanceSpec {
  const fallback: AcceptanceSpec = {
    requiredFiles: [],
    markers: [
      { pattern: 'hive-map-canvas', appDir: '/app' },
      { pattern: 'HIVE PILOT VERIFIED', appDir: '/app' },
    ],
    dataJson: { path: '/app/data.json', minEvents: 1 },
  };
  const raw = env.SHADOW_ACCEPTANCE;
  if (!raw) return fallback;
  try {
    // P2 guard: the parse is validated by the shape checks below (requiredFiles
    // + markers must be arrays) BEFORE the cast is consumed — a malformed
    // SHADOW_ACCEPTANCE falls back to the built-in spec, never a wrong shape.
    const parsed = JSON.parse(raw) as AcceptanceSpec;
    if (Array.isArray(parsed.requiredFiles) && Array.isArray(parsed.markers)) {
      return parsed;
    }
    return fallback;
  } catch {
    return fallback;
  }
}

/**
 * The FsReadDeps implementation shared by quality-gate.ts and signals.ts
 * (§9.3 contract, §34.10/§34.11 usage). Backed by node:fs; grep shells out to
 * `rg` and falls back to a manual line scan when rg is absent.
 */
export const fsDeps: FsReadDeps = {
  read: (p) => Promise.resolve(safeRead(p)),
  grep: (p, pattern) => grepLines(p, pattern),
  stat: (p) => Promise.resolve(safeStat(p)),
};

function safeRead(p: string): string | null {
  try {
    return readFileSync(p, 'utf8');
  } catch {
    return null;
  }
}

function safeStat(p: string): { mtime: number; size: number } | null {
  try {
    const st = statSync(p);
    return { mtime: st.mtimeMs, size: st.size };
  } catch {
    return null;
  }
}

/**
 * Grep a path (file or directory) for a pattern. Uses `rg -n --no-heading`
 * when available; on rg exit 1 (no matches) returns []; on rg missing or
 * error falls back to a manual recursive line scan (capped at 50 hits).
 */
function grepLines(path: string, pattern: string): Promise<string[]> {
  try {
    const out = execFileSync('rg', ['-n', '--no-heading', pattern, path], {
      maxBuffer: 40_000,
      timeout: 5_000,
      killSignal: 'SIGKILL',
    }).toString();
    return Promise.resolve(out.split('\n').filter(Boolean));
  } catch (err) {
    const e = err as { status?: number };
    if (e.status === 1) return Promise.resolve([]); // rg: no matches
    return grepManual(path, pattern);
  }
}

function grepManual(path: string, pattern: string): Promise<string[]> {
  let re: RegExp;
  try {
    re = new RegExp(pattern);
  } catch {
    return Promise.resolve([]); // unparseable pattern — no hits
  }
  const hits: string[] = [];
  scanForMatches(path, re, hits, 0);
  return Promise.resolve(hits);
}

function scanForMatches(
  path: string,
  re: RegExp,
  hits: string[],
  depth: number,
): void {
  if (depth > 3 || hits.length >= 50) return;
  const st = safeFullStat(path);
  if (st === null) return;
  if (st.isDirectory()) {
    const entries = safeReaddir(path);
    for (const e of entries) {
      if (e === 'node_modules' || e.startsWith('.')) continue;
      scanForMatches(join(path, e), re, hits, depth + 1);
      if (hits.length >= 50) return;
    }
    return;
  }
  if (!st.isFile()) return;
  const text = safeRead(path);
  if (text === null) return;
  const lines = text.split('\n');
  for (let i = 0; i < lines.length && hits.length < 50; i += 1) {
    if (re.test(lines[i])) hits.push(`${path}:${i + 1}:${lines[i]}`);
  }
}

function safeFullStat(p: string): Stats | null {
  try {
    return statSync(p);
  } catch {
    return null;
  }
}

function safeReaddir(p: string): string[] {
  try {
    return readdirSync(p);
  } catch {
    return [];
  }
}
