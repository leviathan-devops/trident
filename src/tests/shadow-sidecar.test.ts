// ═══ SHADOW-SIDECAR TESTS — the tether + the session keeper + the REATTACH GATE (the shadow
// spec §3.6) ═══
// The M4 lesson, tested: the re-attach is a GATE (3 mechanical checks, ANY FAIL → the reason
// string, never a log line). Adversarial cases: the wrong key (the record mismatch AND the
// state.json mismatch), the deleted root, the EMPTY pool that claims history (the wiped
// memory), the unreadable pool, the missing sidecar record, the corrupted record file, the
// fresh root (the legitimate new session — PASS), and the SESSION_SWITCH reset (the old
// session FAILS after the switch, the new session is fresh by construction).
// The sidecar dir + the memory root are sandboxed to tmp dirs via env — the production
// defaults stay: the sidecar records in the tmp (ephemeral heartbeats), the MEMORY in the
// home root (the spec F-4).

// @ts-ignore — bun:test ships the runtime, not TS declarations (bun test resolves it natively)
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  handleSessionSwitch,
  readSidecar,
  registerSidecar,
  resolveSidecarDir,
  tetherSession,
  touchSidecar,
  verifyMemoryReattach,
} from '../tools/shadow/shadow-sidecar.ts';
import { ShadowMemory, type PromptRecord } from '../tools/shadow/shadow-memory.ts';

const MEM_ENV = 'TRIDENT_PREFLIGHT_MEMORY_ROOT';
const SIDECAR_ENV = 'TRIDENT_PREFLIGHT_SIDECAR_DIR';
let sandbox = '';
let sidecarSandbox = '';

function makeRecord(seq: number): PromptRecord {
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
  };
}

describe('shadow-sidecar', () => {
  beforeAll(() => {
    sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'shadow-sidecar-mem-'));
    sidecarSandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'shadow-sidecar-reg-'));
    process.env[MEM_ENV] = sandbox;
    process.env[SIDECAR_ENV] = sidecarSandbox;
    // the tether's env fallback tiers must start CLEAN (each tether test sets its own)
    delete process.env.TRIDENT_PREFLIGHT_SESSION_KEY;
    delete process.env.TRIDENT_PREFLIGHT_PROJECT_ID;
    delete process.env.TRIDENT_PREFLIGHT_PARENT_SESSION_ID;
    const g = globalThis as Record<string, unknown>;
    delete g.__trident_session_key;
    delete g.__trident_project_id;
    delete g.__trident_parent_session_id;
    delete g.__trident_opencode_pid;
  });

  afterAll(() => {
    delete process.env[MEM_ENV];
    delete process.env[SIDECAR_ENV];
    try {
      fs.rmSync(sandbox, { recursive: true, force: true });
      fs.rmSync(sidecarSandbox, { recursive: true, force: true });
    } catch (e) {
      void e; // best-effort cleanup
    }
  });

  // ── THE TETHER (Stage 1 — the three-tier fallback) ──

  test('the tether: the defaults — no hook, no env → default-session/default-project/process.pid', () => {
    const t = tetherSession();
    expect(t.sessionKey).toBe('default-session');
    expect(t.projectId).toBe('default-project');
    expect(t.parentSessionId).toBeNull();
    expect(typeof t.pid).toBe('number');
    expect(t.pid).toBe(process.pid);
  });

  test('the tether: the env fallback tier', () => {
    process.env.TRIDENT_PREFLIGHT_SESSION_KEY = 'env-session';
    process.env.TRIDENT_PREFLIGHT_PROJECT_ID = 'env-project';
    process.env.TRIDENT_PREFLIGHT_PARENT_SESSION_ID = 'env-parent';
    const t = tetherSession();
    expect(t.sessionKey).toBe('env-session');
    expect(t.projectId).toBe('env-project');
    expect(t.parentSessionId).toBe('env-parent');
    delete process.env.TRIDENT_PREFLIGHT_SESSION_KEY;
    delete process.env.TRIDENT_PREFLIGHT_PROJECT_ID;
    delete process.env.TRIDENT_PREFLIGHT_PARENT_SESSION_ID;
  });

  test('the tether: the globalThis hook tier WINS over env', () => {
    process.env.TRIDENT_PREFLIGHT_SESSION_KEY = 'env-session';
    const g = globalThis as Record<string, unknown>;
    g.__trident_session_key = 'hook-session';
    g.__trident_opencode_pid = 4242;
    const t = tetherSession();
    expect(t.sessionKey).toBe('hook-session'); // the hook beats the env
    expect(t.pid).toBe(4242);
    delete g.__trident_session_key;
    delete g.__trident_opencode_pid;
    delete process.env.TRIDENT_PREFLIGHT_SESSION_KEY;
  });

  // ── THE SESSION KEEPER (register → touch → switch) ──

  test('registerSidecar: the per-PID record lands on disk + round-trips', () => {
    const pid = 9001;
    const rec = registerSidecar(pid, 'sess1', 'projA', 'parent-1');
    expect(rec.sessionKey).toBe('sess1');
    expect(rec.projectId).toBe('projA');
    expect(rec.parentSessionId).toBe('parent-1');
    expect(rec.state).toBe('ACTIVE');
    const reread = readSidecar(pid);
    expect(reread).not.toBeNull();
    expect(reread!.sessionKey).toBe('sess1');
    expect(reread!.pid).toBe(pid);
    expect(fs.existsSync(path.join(resolveSidecarDir(), `sidecar-${pid}.json`))).toBe(true);
  });

  test('the property: registerSidecar is idempotent — the re-register keeps spawnedAt + parentSessionId', () => {
    const pid = 9109;
    const first = registerSidecar(pid, 'sessA', 'projA', 'parent-orig');
    const second = registerSidecar(pid, 'sessA', 'projA'); // no parent passed this time
    expect(second.spawnedAt).toBe(first.spawnedAt); // the resume case — the origin survives
    expect(second.parentSessionId).toBe('parent-orig');
  });

  test('touchSidecar: the heartbeat refreshes lastActivityAt + keeps ACTIVE', async () => {
    const pid = 9002;
    registerSidecar(pid, 'sess1', 'projA');
    const before = readSidecar(pid)!.lastActivityAt;
    await new Promise((r) => setTimeout(r, 5));
    touchSidecar(pid);
    const after = readSidecar(pid)!;
    expect(new Date(after.lastActivityAt).getTime()).toBeGreaterThanOrEqual(new Date(before).getTime());
    expect(after.state).toBe('ACTIVE');
  });

  test('handleSessionSwitch: re-binds the record to the new session (the SESSION_SWITCH reset)', () => {
    const pid = 9003;
    registerSidecar(pid, 'sessA', 'projA');
    const switched = handleSessionSwitch(pid, 'sessB');
    expect(switched).not.toBeNull();
    expect(switched!.sessionKey).toBe('sessB');
    expect(readSidecar(pid)!.sessionKey).toBe('sessB');
    handleSessionSwitch(pid, 'sessB'); // idempotent — the same key leaves it untouched
    expect(readSidecar(pid)!.sessionKey).toBe('sessB');
    expect(handleSessionSwitch(999998, 'x')).toBeNull(); // unregistered PID → null
  });

  // ── THE REATTACH GATE (3 checks — ANY FAIL → the reason, never a log line) ──

  test('the gate: the correct key PASSES when the context pool hydrates', () => {
    const pid = 9101;
    registerSidecar(pid, 'sess-hydrated', 'projA');
    const m = ShadowMemory.open('projA', 'sess-hydrated');
    m.appendPrompt(makeRecord(1));
    m.appendPrompt(makeRecord(2));
    m.close(); // a fresh process reattaching — the gate's real scenario
    const r = verifyMemoryReattach(pid, 'sess-hydrated', m.sessionDir);
    expect(r.ok).toBe(true);
  });

  test('the gate: the WRONG key FAILS with the reason (the sidecar record mismatch)', () => {
    const pid = 9102;
    registerSidecar(pid, 'sess-record-mismatch', 'projA');
    const m = ShadowMemory.open('projA', 'sess-record-mismatch');
    m.appendPrompt(makeRecord(1));
    m.close();
    const r = verifyMemoryReattach(pid, 'sessY', m.sessionDir); // the call claims the WRONG session
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('MEMORY_REATTACH_FAILED');
    expect(r.reason).toContain('sessY');
  });

  test('the gate: the state.json sessionKey mismatch FAILS (the root belongs to another session)', () => {
    const pid = 9103;
    registerSidecar(pid, 'sess-state-corrupt', 'projA');
    const m = ShadowMemory.open('projA', 'sess-state-corrupt');
    m.appendPrompt(makeRecord(1));
    m.close();
    // corrupt the state: rewrite sessionKey to a DIFFERENT session
    const st = JSON.parse(fs.readFileSync(path.join(m.sessionDir, 'state.json'), 'utf8')) as Record<string, unknown>;
    st.sessionKey = 'sessZ';
    fs.writeFileSync(path.join(m.sessionDir, 'state.json'), JSON.stringify(st, null, 2), 'utf8');
    const r = verifyMemoryReattach(pid, 'sess-state-corrupt', m.sessionDir);
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('sessZ');
  });

  test('the gate: the DELETED root FAILS (the memory root missing)', () => {
    const pid = 9104;
    registerSidecar(pid, 'sess-deleted-root', 'projA');
    const r = verifyMemoryReattach(pid, 'sess-deleted-root', path.join(os.tmpdir(), 'definitely-missing-root', 'sess-deleted-root'));
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('missing');
  });

  test('the gate: the EMPTY pool that CLAIMS history FAILS (the memory was wiped or corrupted)', () => {
    const pid = 9105;
    registerSidecar(pid, 'sess-empty-claim', 'projA');
    const m = ShadowMemory.open('projA', 'sess-empty-claim');
    m.appendPrompt(makeRecord(1)); // state.json now claims lastSeq 1
    m.close();
    // empty the pool but KEEP the file — the state still claims the history
    const reopen = ShadowMemory.open('projA', 'sess-empty-claim');
    reopen.db.query('DELETE FROM prompts').run();
    reopen.close();
    const r = verifyMemoryReattach(pid, 'sess-empty-claim', m.sessionDir);
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('hydrate');
    expect(r.reason).toContain('lastSeq 1');
  });

  test('the gate: the UNREADABLE pool FAILS (the sqlite file missing)', () => {
    const pid = 9108;
    registerSidecar(pid, 'sess-unreadable', 'projA');
    const m = ShadowMemory.open('projA', 'sess-unreadable');
    m.appendPrompt(makeRecord(1));
    m.close();
    fs.rmSync(path.join(m.sessionDir, 'preflight.sqlite'), { force: true }); // the pool is gone
    const r = verifyMemoryReattach(pid, 'sess-unreadable', m.sessionDir);
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('hydrate');
    expect(r.reason).toContain('preflight.sqlite');
  });

  test('the gate: the FRESH root PASSES (a new session — nothing to reattach, the first call proceeds)', () => {
    const pid = 9106;
    registerSidecar(pid, 'sessFresh', 'projA');
    const m = ShadowMemory.open('projA', 'sessFresh');
    m.close(); // 0 rows, lastSeq 0 — the legitimate new-session state
    const r = verifyMemoryReattach(pid, 'sessFresh', m.sessionDir);
    expect(r.ok).toBe(true);
  });

  test('the gate: NO sidecar record FAILS (registerSidecar first)', () => {
    const m = ShadowMemory.open('projA', 'sessX');
    m.appendPrompt(makeRecord(1));
    m.close();
    const r = verifyMemoryReattach(999999, 'sessX', m.sessionDir); // never registered
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('no sidecar record');
  });

  test('the SESSION_SWITCH reset: after the switch the OLD session FAILS and the NEW session is fresh', () => {
    const pid = 9107;
    registerSidecar(pid, 'sessA', 'projA');
    const memA = ShadowMemory.open('projA', 'sessA');
    memA.appendPrompt(makeRecord(1));
    memA.close();
    handleSessionSwitch(pid, 'sessB'); // the SESSION_SWITCH reset
    // the NEW session's memory is a FRESH root (isolation by construction — key-derived)
    const memB = ShadowMemory.open('projA', 'sessB');
    expect(memB.lastPrompts(10)).toEqual([]);
    memB.close();
    // the gate: the new session passes (fresh); the OLD session FAILS — never restore A into B
    expect(verifyMemoryReattach(pid, 'sessB', memB.sessionDir).ok).toBe(true);
    const old = verifyMemoryReattach(pid, 'sessA', memA.sessionDir);
    expect(old.ok).toBe(false);
    expect(old.reason).toContain('SESSION_SWITCH');
  });

  test('adversarial: the CORRUPTED sidecar record file → null, never a crash', () => {
    const pid = 9099;
    fs.mkdirSync(resolveSidecarDir(), { recursive: true });
    fs.writeFileSync(path.join(resolveSidecarDir(), `sidecar-${pid}.json`), '{{broken', 'utf8');
    expect(readSidecar(pid)).toBeNull();
  });
});
