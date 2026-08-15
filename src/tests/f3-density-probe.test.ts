// THE F3 DENSITY-MEMORY PROBE (host-level — the container test args were under
// the floors; this proves the density check fires on floors-passing-but-thinner)
// @ts-ignore — bun:test ships the runtime, not TS declarations
import { describe, expect, test, afterEach } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { executeWaveDispatch } from '../tools/wave-dispatch.ts';
import { WaveTracker } from '../tools/wave-tracker.ts';

let sandbox = '';
afterEach(() => { WaveTracker.clear(); try { fs.rmSync(sandbox, { recursive: true, force: true }); } catch { } });

function denseAgent(name: string) {
  const mk = (n: number) => 'X'.repeat(n);
  return { name, template: 'E1', filepaths: [__filename],
    mission: mk(2500), knownContext: mk(2500), doctrine: mk(1200),
    measurements: mk(1200), acceptance: mk(1200), taskTargets: mk(1200), position: mk(600) };
}
function thinnerButPassing(name: string) {
  const mk = (n: number) => 'Y'.repeat(n);
  return { name, template: 'E1', filepaths: [__filename],
    mission: mk(220), knownContext: mk(220), doctrine: mk(120),
    measurements: mk(120), acceptance: mk(120), taskTargets: mk(120), position: mk(60) };
}

describe('F3 THE DENSITY MEMORY', () => {
  test('a floors-passing-but-thinner re-gen fires the DENSITY WARNING', async () => {
    sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'density-probe-'));
    // wave A: the dense baseline
    const a = await executeWaveDispatch({ agents: [denseAgent('tt-dense-a1')], dispatchDir: sandbox }, 'main', { generator: async () => ({ prompt: 'P'.repeat(5000), notes: [] }) });
    expect(a.failed).toHaveLength(0);
    // wave B: same name, floors-passing but ~1/6 the density
    const b = await executeWaveDispatch({ agents: [thinnerButPassing('tt-dense-a1')], dispatchDir: sandbox }, 'main', { generator: async () => ({ prompt: 'P'.repeat(5000), notes: [] }) });
    expect(b.checkIn).toContain('DENSITY WARNING (tt-dense-a1)');
    expect(b.checkIn).toContain('% of the prior generation');
  });
  test('a fresh name (no prior snapshot) has NO density warning', async () => {
    sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'density-probe-'));
    const r = await executeWaveDispatch({ agents: [denseAgent('tt-fresh-a1')], dispatchDir: sandbox }, 'main', { generator: async () => ({ prompt: 'P'.repeat(5000), notes: [] }) });
    expect(r.checkIn).not.toContain('DENSITY WARNING');
  });
});
