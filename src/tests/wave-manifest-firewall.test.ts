// ═══ THE WAVE-MANIFEST FIREWALL TESTS (2026-08-20 — the UNTRACKED_WAVE FAILURE
//    the operator handed over) ═══
// THE CLASS: a hand-written manifest (.wave-manifest-<waveId>.json) that bypasses
// the generate action — the manifest is the CONTENT check (the sha match) but the
// TRACKER is the CONTROL state, and they were decoupled. A wave that was never
// generated is never registered → the dispatch finds the manifest but the tracker
// has no row → the wave is UNTRACKED (the pause/kill/status could not resolve it).
// THE INVARIANT (the fix): the generate action registers the wave in the tracker
// (WaveTracker.registerWave); the dispatch REFUSES a manifest whose wave is NOT
// registered. THE LAW: the wave is generated-and-tracked-or-dead — never a
// hand-fabricated manifest.
// THE ADVERSARIAL-FIRST DISCIPLINE: the fabricated manifest is the PRIMARY test;
// the legit generate→dispatch path is the SECONDARY (the firewall must ALLOW it).

import './tracker-test-env.ts';
import { describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { executeDispatch } from '../tools/wave-pipeline.ts';
import { WaveTracker } from '../tools/wave-tracker.ts';
import { createHash } from 'node:crypto';

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'wave-fw-test-'));
}

function writeManifest(tmpDir: string, waveId: string, promptText: string): void {
  const sha = createHash('sha256').update(promptText).digest('hex');
  const manifest = {
    wave: waveId,
    agents: [{ name: 'fw-a', type: 'trident_explore', lines: promptText.split('\n').length, sha256: sha, status: 'ready' }],
  };
  fs.writeFileSync(path.join(tmpDir, '.wave-manifest-' + waveId + '.json'), JSON.stringify(manifest), 'utf-8');
  fs.writeFileSync(path.join(tmpDir, 'fw-a.md'), promptText, 'utf-8');
}

// A prompt that passes the DPL1 floor (150+ lines with the markers) — the content
// validation passes so the firewall is the ONLY thing under test.
function dpl1Prompt(): string {
  const L: string[] = [];
  L.push('EXECUTE THE FOLLOWING CONTEXT SYNTHESIS VERBATIM. You are a trident_explore agent.');
  L.push('THE MISSION: the mission to analyze the shadow module — the what + the why + the framing + the stakes, padded to pass the floor.');
  L.push('');
  L.push('THE ACCEPTANCE CRITERIA: the per-file WHAT/HOW/WHY/EXPECTED blocks are present; the reading order lists every filepath once.');
  L.push('THE READING ORDER: 1. /tmp/real-proj/liar-module.ts');
  L.push('THE KNOWN CONTEXT: the measured state with the anchors.');
  L.push("THE OPERATOR'S DOCTRINE: the files are the only ground truth.");
  L.push('THE PER-TASK EXPANSIONS: the per-task targets.');
  L.push('THE KNOWN MEASUREMENTS TABLE: the numbers.');
  L.push('THE CONSTRAINTS: READ-ONLY.');
  L.push('THE TASKS:');
  for (let t = 1; t <= 3; t++) {
    L.push('Task ' + t + ' — the task ' + t + ' extraction.');
    L.push('  WHAT: the task ' + t + ' deliverable — the exact output the subagent produces.');
    L.push('  HOW: read the file ' + t + ' fully (the 2500-line pass) and extract the surface.');
    L.push('  WHY: the orchestrator needs the task ' + t + ' output for the wave\'s report.');
    L.push('  EXPECTED: the per-file block: path, role, exports, key functions, line anchors.');
  }
  L.push('THE VERIFICATION: read /tmp/real-proj/liar-module.ts; grep -c "export" /tmp/real-proj/liar-module.ts');
  L.push('THE RETURN FORMAT: 1. the synthesis.');
  L.push('');
  for (let i = 0; i < 130; i++) L.push('- the anchor-register entry ' + i + ' for the file — read in the loop, never a stale summary.');
  return L.join('\n');
}

const mockDispatch = async (params: { description?: string }) => ({
  title: 't', metadata: {}, output: 'o', partID: 'p', callID: 'c',
  sessionId: 'ses-' + (params.description || 'x'),
});

describe('wave-manifest-firewall — the hand-fabricated manifest is BLOCKED (the UNTRACKED_WAVE class)', () => {
  test('ADVERSARIAL: a hand-written manifest (NO generate, NO tracker registration) → the dispatch REFUSES with [WAVE TRACKED-OR-DEAD]', async () => {
    const tmpDir = makeTmpDir();
    const waveId = 'wave-fab-' + Date.now();
    writeManifest(tmpDir, waveId, dpl1Prompt());
    // the wave is NEVER registered — the generate never ran (the fabrication)
    let threw: string | null = null;
    try {
      await executeDispatch({ waveId }, { sessionID: 'test', extra: { taskDispatch: mockDispatch } }, { tmpDir });
    } catch (e) {
      threw = e instanceof Error ? e.message : String(e);
    }
    expect(threw).not.toBeNull();
    expect(threw).toContain('WAVE TRACKED-OR-DEAD');
    expect(threw).toContain('generate action is the ONLY path');
  });

  test('the legit path: a REGISTERED wave (the generate auto-registers) → the dispatch WORKS', async () => {
    const tmpDir = makeTmpDir();
    const waveId = 'wave-legit-' + Date.now();
    writeManifest(tmpDir, waveId, dpl1Prompt());
    // the generate's registration — the auto-register the generate action calls
    WaveTracker.registerWave({
      wave: waveId, names: ['fw-a'], sessionIds: [], dispatchedAt: Date.now(),
      etaMs: 0, etaConfidence: 0,
      agents: { 'fw-a': { sessionIds: [], state: 'running', respawnCount: 0, lastKillReason: null, spawnTimes: { spawnedAt: Date.now() }, lastActivityAt: Date.now(), lastBytes: 0, errorCodes: [] } },
    });
    const r = await executeDispatch({ waveId }, { sessionID: 'test', extra: { taskDispatch: mockDispatch } }, { tmpDir });
    expect(r.dispatched.length).toBe(1);
    expect(r.failed.length).toBe(0);
    WaveTracker.clear();
  });
});
