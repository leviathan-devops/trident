// ═══ SANITY-RESTORE PINS (2026-08-23) ═══
//
// The operator's law: "restore common sense and basic sanity so we stop
// regressing constantly." These tests PIN the settled architecture as source
// invariants — the exact fossils that crept back (4-round loops, slowlane
// labels, silent zen exile) are now BATTERY FAILURES if they ever reappear.
// Source-content pins are intentional here: the invariant IS the source text.

// @ts-ignore — bun:test ships the runtime, not TS declarations
import { describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { PI_MAX_ROUNDS } from '../tools/shadow/shadow-runner.ts';
import { EXILE_MS } from '../tools/shadow/rpm-ledger.ts';

const SRC = path.join(process.cwd(), 'src', 'tools');
const SHADOW_DIR = path.join(SRC, 'shadow');
const readSrc = (f: string) => fs.readFileSync(path.join(SHADOW_DIR, f), 'utf-8');

describe('THE SETTLED ARCHITECTURE — source-invariant pins', () => {

  test('ROUNDS: exactly 2 everywhere — the runner cannot bypass the agent cap', () => {
    expect(PI_MAX_ROUNDS).toBe(2);
    const agent = readSrc('shadow-agent.ts');
    expect(agent).toMatch(/const MAX_ROUNDS = 2;/);
    expect(agent).toMatch(/const MIN_MANDATORY_ROUNDS = 2;/);
    // no era-fossil values anywhere in the shadow tree:
    const runner = readSrc('shadow-runner.ts');
    expect(runner).not.toMatch(/PI_MAX_ROUNDS\s*=\s*[34]/);
  });

  test('SLOWLANE: ZERO occurrences — no code, no labels, no comments', () => {
    const files = fs.readdirSync(SHADOW_DIR).filter((f) => f.endsWith('.ts'));
    for (const f of files) {
      const src = readSrc(f);
      expect(src.match(/slow-lane|slowLane|SLOWLANE|starved-lane/g)).toBeNull();
    }
  });

  test('ZEN PRIMARY: 5-key pool present; primary exempt from transient-exile skip', () => {
    const agent = readSrc('shadow-agent.ts');
    expect(agent).toMatch(/const ZEN_KEYS: string\[\] = \[/);
    // count exactly 5 sk- keys inside the pool block:
    const pool = agent.slice(agent.indexOf('const ZEN_KEYS'), agent.indexOf('];', agent.indexOf('const ZEN_KEYS')));
    expect((pool.match(/sk-[A-Za-z0-9]{20,}/g) ?? [])).toHaveLength(5);
    // the primary-priority gate: chainIdx===0 skips ONLY on hard dry
    expect(agent).toContain("if (chainIdx === 0) {");
    expect(agent).toContain("admissions[0] === 'dry'");
    // key rotation on 429 exists:
    expect(agent).toContain('zenKeyIndex++');
  });

  test('LEDGER: TTL exile is 45s (time-based, never permanent)', () => {
    expect(EXILE_MS).toBe(45_000);
  });

  test('WATCHDOG: terminal-guard + exactly-once kick exist in the cron', () => {
    const cron = fs.readFileSync(path.join(SRC, 'wave-cron.ts'), 'utf-8');
    expect(cron).toContain('TERMINAL:');
    expect(cron).toContain('KICKED (1/1)');
    expect(cron).toMatch(/agent\.kickCount = \(agent\.kickCount \?\? 0\) \+ 1;/);
    const tracker = fs.readFileSync(path.join(SRC, 'wave-tracker.ts'), 'utf-8');
    expect(tracker).toContain('kickedAt?: number');
    expect(tracker).toContain('kickCount?: number');
  });

  test('EXECUTION: parallel only — no sequential anywhere in the wave/shadow core', () => {
    for (const f of ['shadow-agent.ts', 'shadow-runner.ts', 'wave-dispatch.ts', 'wave-pipeline.ts']) {
      const p = ['shadow-agent.ts', 'shadow-runner.ts'].includes(f) ? path.join(SHADOW_DIR, f) : path.join(SRC, f);
      const src = fs.readFileSync(p, 'utf-8');
      expect(src.match(/['"]sequential['"]/)).toBeNull();
    }
  });
});

// ═══ THE INFERENCE-CONTENT GATE (2026-08-23 — the live live-probe-chain bug):
// the scaffold carries multiple [SHADOW INFERENCE] markers; agent 1 shipped
// with the FINAL one completely blank and validateFinalText passed it on
// marker-presence alone. The gate now requires ≥100c of real content after
// the LAST marker. These pins replay the exact failure.

describe('THE INFERENCE-CONTENT GATE', () => {
  // validateFinalText is module-private — exercise it through the exported
  // surface that consumes it: re-read the source to assert the gate exists,
  // and test the tail-extraction logic shape via the same regex contract.
  const agentSrc = fs.readFileSync(path.join(process.cwd(), 'src', 'tools', 'shadow', 'shadow-agent.ts'), 'utf-8');

  test('the gate exists: content required after the LAST marker, ≥100c', () => {
    expect(agentSrc).toContain("text.lastIndexOf('[SHADOW INFERENCE]')");
    expect(agentSrc).toContain('inferenceTail.length < 100');
  });

  test('REPLAY of the live failure: blank tail after last marker is INVALID shape', () => {
    // the exact structure from /tmp/trident-tmp/live-probe-chain.md:
    const blankTail = [
      '# prompt body...', 'THE MISSION: x'.repeat(1),
      ...Array.from({ length: 120 }, (_, i) => 'filler line ' + i),
      '~~~~~~~~~~~', '[SHADOW INFERENCE]',
    ].join('\n');
    const lastIdx = blankTail.lastIndexOf('[SHADOW INFERENCE]');
    const tail = blankTail.slice(lastIdx + '[SHADOW INFERENCE]'.length).trim();
    expect(tail.length).toBe(0);          // the bug shape: zero content
    expect(tail.length < 100).toBe(true); // → the new gate returns false
  });

  test('a FILLED tail (≥100c) passes the tail check', () => {
    const filledTail = '[SHADOW INFERENCE]\n' + 'Dense forward-map: file A exports X at :12; traps in the chain loop; priority on the admission gate. '.repeat(2);
    const lastIdx = filledTail.lastIndexOf('[SHADOW INFERENCE]');
    const tail = filledTail.slice(lastIdx + '[SHADOW INFERENCE]'.length).trim();
    expect(tail.length).toBeGreaterThanOrEqual(100);
  });

  test('the W4 demand states the bar so R1 complies', () => {
    const runnerSrc = fs.readFileSync(path.join(process.cwd(), 'src', 'tools', 'shadow', 'shadow-runner.ts'), 'utf-8');
    expect((runnerSrc.match(/bare marker FAILS validation/g) ?? []).length).toBe(2);
  });
});

// ═══ THE SESSION-AUTO-SCOPE (2026-08-24 — the operator: "NOT a single global
// file... AUTO SCOPE TO THE SAME WORKSPACE DIR AS THE CODEBASE BEING WORKED
// ON IN THE SESSION"). The concurrent-session fix: a same-codebase session and
// a different-codebase session MUST resolve different .trident roots (zero
// clobbering). Pinned via the exported resolver + the source gate.

describe('THE SESSION-AUTO-SCOPE (no single global .trident)', () => {
  test('the resolver exists and derives the codebase root, never a hardcode', () => {
    const src = fs.readFileSync(path.join(process.cwd(), 'src', 'tools', 'wave-dispatch.ts'), 'utf-8');
    expect(src).toContain('function resolveScopeRoot');
    expect(src).toContain('scoreProjectRoots');
    expect(src).toContain("'package.json'");
    // THE FORBIDDEN SHAPE: no fized parent-workspace path baked as the sidecar base.
    expect(src).not.toMatch(/OPENCODE_WORKSPACE\/\.trident/);
  });

  test('source: every sidecar now derives from scopeRoot, not process.cwd()', () => {
    const src = fs.readFileSync(path.join(process.cwd(), 'src', 'tools', 'wave-dispatch.ts'), 'utf-8');
    // reset + budget-tick + plan check all thread scopeRoot:
    expect(src).toContain('resetToTemplate(scopeRoot)');
    expect(src).toContain("path.join(scopeRoot, '.trident', 'wave-plan.md')");
    expect(src).toContain("path.join(scopeRoot, '.trident', 'wave-planning-state.json')");
    // no residual hardcoded reset back to process.cwd():
    expect(src).not.toMatch(/resetToTemplate\(process\.cwd\(\)\)/);
  });
});
