// ═══ WAVE-AUDIT-GATE TESTS (2026-08-10 — the circularity fix's coverage). THE
// ZERO-HINT discipline: the REAL waveAuditGateVerdict pure function — the
// battery covers the FULL matrix: the shipping write BLOCKS, the remedy channel
// (the audit path + the /tmp intermediates) ALLOWS, no-dispatch ALLOWS,
// audit-exists ALLOWS. THE CLASS THIS KILLS: the gate whose remedy is blocked
// by itself (the live container catch — the gate demanded the audit write while
// the write tool was in its own blocked list → the remedy unexecutable →
// circular). A gate's remedy channel must ALWAYS be executable.

// @ts-ignore — bun:test ships the runtime, not TS declarations
import { afterEach, describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { waveAuditGateVerdict, hasWaveAuditArtifact } from '../hooks/trident-hooks.ts';

const SHIPPING_TARGETS = [
  '/root/OPENCODE_WORKSPACE/dist/index.js',
  '/root/OPENCODE_WORKSPACE/docs/architecture.md',
  '/root/OPENCODE_WORKSPACE/SHIP_PACKAGE/index.js',
  '/root/OPENCODE_WORKSPACE/src/hooks/trident-hooks.ts',
];

const REMEDY_CHANNELS = [
  '/root/OPENCODE_WORKSPACE/.trident/wave-audit/wave-123.md',
  '/root/OPENCODE_WORKSPACE/.trident/wave-audit/wave-1786323781863.md',
  '/tmp/opencode/cst2-wave-returns.md',
  '/tmp/stream.txt',
  '/root/OPENCODE_WORKSPACE/trident-tmp/agent-map-a.md',
  '/root/OPENCODE_WORKSPACE/trident-tmp/.wave-manifest-wave-123.json',
];

const GATED_TOOLS = ['write', 'write_file', 'edit', 'patch', 'trident-ship-package', 'trident-container-test'];

describe('waveAuditGateVerdict — the FULL matrix', () => {

  test('1. the shipping write BLOCKS after a dispatch with no audit (the gate core)', () => {
    for (const target of SHIPPING_TARGETS) {
      for (const tool of GATED_TOOLS) {
        expect(waveAuditGateVerdict(3, tool, target, false)).toBe('BLOCK');
      }
    }
  });

  test('2. THE REMEDY CHANNEL — the audit write + the /tmp intermediates ALLOW (the circularity fix)', () => {
    for (const target of REMEDY_CHANNELS) {
      for (const tool of ['write', 'write_file', 'edit']) {
        expect(waveAuditGateVerdict(3, tool, target, false)).toBe('ALLOW');
      }
    }
  });

  test('3. no dispatch → ALLOW (the gate never fires cold)', () => {
    for (const target of SHIPPING_TARGETS) {
      for (const tool of GATED_TOOLS) {
        expect(waveAuditGateVerdict(0, tool, target, false)).toBe('ALLOW');
      }
    }
  });

  test('4. the audit EXISTS → ALLOW (the gate is satisfied)', () => {
    for (const target of SHIPPING_TARGETS) {
      for (const tool of GATED_TOOLS) {
        expect(waveAuditGateVerdict(3, tool, target, true)).toBe('ALLOW');
      }
    }
  });

  test('5. non-gated tools → ALLOW (read/glob/grep/task/cst2 are never blocked)', () => {
    for (const tool of ['read', 'glob', 'grep', 'task', 'trident-context-synthesis', 'trident-wave-manager', 'bash']) {
      expect(waveAuditGateVerdict(3, tool, '/root/OPENCODE_WORKSPACE/dist/index.js', false)).toBe('ALLOW');
    }
  });

  test('6. THE ANTI-CIRCULARITY CONTRACT — a gate whose remedy is itself blocked is a deadlock', () => {
    // The exact live failure shape: the gate demanded the audit write while the
    // write tool was in its own blocked list. The verdict function must NEVER
    // produce BLOCK for the audit path itself — the remedy is always executable.
    for (const wave of ['wave-1', 'wave-1786323781863', 'wave-any']) {
      expect(waveAuditGateVerdict(5, 'write', '/root/OPENCODE_WORKSPACE/.trident/wave-audit/' + wave + '.md', false)).toBe('ALLOW');
      expect(waveAuditGateVerdict(5, 'edit', '/root/OPENCODE_WORKSPACE/.trident/wave-audit/' + wave + '.md', false)).toBe('ALLOW');
    }
    // The container-test tool's write-ish actions on the audit path: allowed.
    expect(waveAuditGateVerdict(5, 'trident-container-test', '/root/OPENCODE_WORKSPACE/.trident/wave-audit/wave-1.md', false)).toBe('ALLOW');
  });

  test('7. the empty target path (no args parsed) → BLOCK for a gated tool (fail-closed)', () => {
    expect(waveAuditGateVerdict(2, 'write', '', false)).toBe('BLOCK');
  });

  test('8. THE FRESHNESS PROBE — a stale audit does NOT satisfy the gate (the red-team catch)', () => {
    // The red-team finding: the OLD probe accepted ANY audit file with VERDICT +
    // coverage — a 6-day-old audit from a previous session satisfied the gate
    // and made it a no-op (the shipping write landed live). THE FIX: the probe
    // requires an audit whose mtime is >= the session's first dispatch
    // timestamp. This test crafts a stale + a fresh audit and asserts the probe
    // rejects the stale one.
    const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'wave-audit-fresh-test-'));
    try {
      const auditDir = path.join(sandbox, '.trident', 'wave-audit');
      fs.mkdirSync(auditDir, { recursive: true });
      const stale = path.join(auditDir, 'stale-audit.md');
      const fresh = path.join(auditDir, 'fresh-audit.md');
      const body = '# WAVE AUDIT\nVERDICT: CORRECT\ncoverage: 100\nWHAT: probe\n';
      fs.writeFileSync(stale, body, 'utf-8');
      fs.writeFileSync(fresh, body, 'utf-8');
      // The stale audit: mtime 6 days ago. The fresh audit: mtime now.
      const sixDaysAgo = Date.now() - 6 * 24 * 3600 * 1000;
      fs.utimesSync(stale, new Date(sixDaysAgo), new Date(sixDaysAgo));
      fs.utimesSync(fresh, new Date(), new Date());
      const cwd = process.cwd();
      process.chdir(sandbox);
      try {
        // since = 1 second ago (the "session's first dispatch" is this test's
        // now — everything real on this host (the Aug 4-8 audits) is far older
        // and must be rejected; only the fresh file qualifies.
        const since = Date.now() - 1000;
        const probeCwd = process.cwd();
        const probeDir = path.join(probeCwd, '.trident', 'wave-audit');
        const probeFiles = fs.existsSync(probeDir) ? fs.readdirSync(probeDir) : [];
        const probeMtimes = probeFiles.map((f: string) => [f, fs.statSync(path.join(probeDir, f)).mtimeMs]);
        console.log('DEBUG-FRESH', { since, freshMtime: fs.statSync(fresh).mtimeMs, probeCwd, probeDir, probeFiles, probeMtimes, probe: hasWaveAuditArtifact(since), probeAny: hasWaveAuditArtifact(0), freshContent: fs.readFileSync(fresh, 'utf-8') });
        expect(hasWaveAuditArtifact(since)).toBe(true); // the fresh file (mtime now) qualifies
        fs.unlinkSync(fresh);
        expect(hasWaveAuditArtifact(since)).toBe(false); // only the stale file remains → rejected
        expect(hasWaveAuditArtifact(0)).toBe(true); // the pre-dispatch usage (since=0) still accepts any
      } finally {
        process.chdir(cwd);
      }
    } finally {
      try { fs.rmSync(sandbox, { recursive: true, force: true }); } catch (e) { void e; }
    }
  });
});
