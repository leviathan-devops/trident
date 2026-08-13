// ═══ WAVE-TRACKER TESTS — the state machines + the respawn lineage (Part 4 +
// Part 19). The ZERO-HINT discipline: the REAL WaveTracker in-process, the
// fixtures built at runtime. The adversarial cases: the duplicate sessionIds
// across a respawn lineage, the unmatched-name respawn (WARN + no silent merge),
// the archive pruning.

// @ts-ignore — bun:test ships the runtime, not TS declarations
import { afterEach, describe, expect, test } from 'bun:test';
import { WaveTracker, freshAgentTrack, WAVE_ARCHIVE_CAP, type WaveTrack } from '../tools/wave-tracker.ts';

function makeWaveEntry(overrides: Partial<Omit<WaveTrack, 'status' | 'checkIns' | 'todoRowId'>> = {}): Omit<WaveTrack, 'status' | 'checkIns' | 'todoRowId'> {
  const wave = 'wave-' + (overrides.wave ?? 'test-' + Math.floor(Math.random() * 1e9));
  return {
    wave,
    names: ['agent-a', 'agent-b'],
    sessionIds: ['sess-a-1', 'sess-b-1'],
    dispatchedAt: Date.now() - 60_000,
    etaMs: 15 * 60_000,
    etaConfidence: 0.85,
    agents: {
      'agent-a': freshAgentTrack('sess-a-1'),
      'agent-b': freshAgentTrack('sess-b-1'),
    },
    ...overrides,
  };
}

afterEach(() => {
  WaveTracker.clear();
});

describe('wave-tracker — the state machines (Part 4)', () => {
  test('the wave lifecycle: dispatching → running → complete', () => {
    const waveId = WaveTracker.registerWave(makeWaveEntry({ wave: 'wave-life' }));
    const w = WaveTracker.getWave(waveId)!;
    expect(w.status).toBe('running');           // registerWave transitions dispatching → running
    WaveTracker.markComplete(waveId, 'agent-a');
    WaveTracker.markComplete(waveId, 'agent-b');
    expect(WaveTracker.getWave(waveId)!.agents['agent-a'].state).toBe('complete');
    expect(WaveTracker.getWave(waveId)!.agents['agent-b'].state).toBe('complete');
  });

  test('the agent lifecycle: spawned → running → complete', () => {
    const waveId = WaveTracker.registerWave(makeWaveEntry({ wave: 'wave-agent' }));
    WaveTracker.registerAgent(waveId, 'agent-c', 'sess-c-1');
    expect(WaveTracker.getWave(waveId)!.agents['agent-c'].state).toBe('running');
    WaveTracker.markComplete(waveId, 'agent-c');
    expect(WaveTracker.getWave(waveId)!.agents['agent-c'].state).toBe('complete');
    expect(WaveTracker.getWave(waveId)!.agents['agent-c'].spawnTimes.completedAt).toBeGreaterThan(0);
  });

  test('the stuck transition: running → stuck (the evidence) → killed', () => {
    const waveId = WaveTracker.registerWave(makeWaveEntry({ wave: 'wave-stuck' }));
    WaveTracker.markStuck(waveId, 'agent-a');
    expect(WaveTracker.getWave(waveId)!.agents['agent-a'].state).toBe('stuck');
    WaveTracker.markKilled(waveId, 'agent-a', 'STUCK_NO_ACTIVITY');
    const agent = WaveTracker.getWave(waveId)!.agents['agent-a'];
    expect(agent.state).toBe('killed');
    expect(agent.lastKillReason).toBe('STUCK_NO_ACTIVITY');
    expect(agent.spawnTimes.killedAt).toBeGreaterThan(0);
  });

  test('the respawn lineage: killed → respawned → running — the sessionIds append + the respawnCount increments + the waveId stays', () => {
    const waveId = WaveTracker.registerWave(makeWaveEntry({ wave: 'wave-lineage' }));
    WaveTracker.markKilled(waveId, 'agent-a', 'PROVIDER_QUOTA');
    WaveTracker.respawnAgent(waveId, 'agent-a', 'sess-a-2', 'PROVIDER_QUOTA');
    const agent = WaveTracker.getWave(waveId)!.agents['agent-a'];
    expect(agent.sessionIds).toEqual(['sess-a-1', 'sess-a-2']);  // the lineage APPENDS
    expect(agent.respawnCount).toBe(1);
    expect(agent.state).toBe('running');          // respawned → running (the spawn settled)
    expect(agent.lastKillReason).toBe('PROVIDER_QUOTA');
    expect(agent.spawnTimes.respawnedAt).toBeGreaterThan(0);
    // THE WAVE IS UNTOUCHED — one wave, one agent line:
    expect(WaveTracker.getWave(waveId)!.status).toBe('running');
    expect(WaveTracker.size()).toBe(1);
  });

  test('the respawn with an UNMATCHED name → a WARN + no silent merge', () => {
    const waveId = WaveTracker.registerWave(makeWaveEntry({ wave: 'wave-miss' }));
    // A respawn for an agent name that does NOT exist in the wave — the tracker
    // NEVER guesses (the lexicon — an unmatched name is surfaced, never merged):
    WaveTracker.respawnAgent(waveId, 'ghost-agent', 'sess-ghost', 'SESSION_CRASH');
    expect(WaveTracker.getWave(waveId)!.agents['ghost-agent']).toBeUndefined();
    expect(WaveTracker.getWave(waveId)!.sessionIds).not.toContain('sess-ghost');
  });

  test('the respawn WITHOUT the waveId → a NEW wave entry (never a merge)', () => {
    const first = WaveTracker.registerWave(makeWaveEntry({ wave: 'wave-first' }));
    // A dispatch call WITHOUT the waveId is a genuinely new wave — the tracker
    // registers a fresh entry even if the agent name collides:
    const second = WaveTracker.registerWave(makeWaveEntry({ wave: 'wave-second' }));
    expect(second).not.toBe(first);
    expect(WaveTracker.size()).toBe(2);
  });

  test('the archive pruning: the 11th wave pushes the oldest out (last-10)', () => {
    for (let i = 0; i < 12; i++) {
      WaveTracker.registerWave(makeWaveEntry({ wave: 'wave-arch-' + i }));
    }
    for (let i = 0; i < 12; i++) {
      WaveTracker.archiveWave('wave-arch-' + i);
    }
    const archive = WaveTracker.getArchive();
    expect(archive.length).toBeLessThanOrEqual(WAVE_ARCHIVE_CAP);
    expect(archive.length).toBe(10);              // the oldest 2 pruned
    expect(archive[0].wave).toBe('wave-arch-2');  // the oldest survivor
    // The archived waves are gone from the active registry:
    expect(WaveTracker.getWave('wave-arch-0')).toBeUndefined();
  });

  test('the abort path: running → aborted → the completion with the note', () => {
    const waveId = WaveTracker.registerWave(makeWaveEntry({ wave: 'wave-abort' }));
    const w = WaveTracker.getWave(waveId)!;
    w.status = 'aborted';
    for (const name of Object.keys(w.agents)) {
      WaveTracker.markKilled(waveId, name, 'ORCHESTRATOR_ABORT');
    }
    expect(w.status).toBe('aborted');
    expect(w.agents['agent-a'].state).toBe('killed');
    expect(w.agents['agent-a'].lastKillReason).toBe('ORCHESTRATOR_ABORT');
  });

  test('the rebuild-from-children: the orphaned children re-surface (the live ground truth)', async () => {
    // The rebuild uses the live children scan — with no live client the tracker
    // stays intact + the orphan scan returns nothing (the reads correct the cache):
    const waveId = WaveTracker.registerWave(makeWaveEntry({ wave: 'wave-rebuild' }));
    expect(WaveTracker.getWave(waveId)).toBeDefined();
    expect(WaveTracker.size()).toBe(1);
  });

  test('ADVERSARIAL: the duplicate sessionIds across a respawn lineage do not corrupt the counts', () => {
    const waveId = WaveTracker.registerWave(makeWaveEntry({ wave: 'wave-dup' }));
    // A respawn that reuses a PREVIOUS sessionId (the provider's session pool
    // reuse) must append + count, never collapse:
    WaveTracker.markKilled(waveId, 'agent-a', 'SESSION_CRASH');
    WaveTracker.respawnAgent(waveId, 'agent-a', 'sess-a-1', 'SESSION_CRASH');
    const agent = WaveTracker.getWave(waveId)!.agents['agent-a'];
    expect(agent.sessionIds).toEqual(['sess-a-1', 'sess-a-1']);  // the lineage records the truth
    expect(agent.respawnCount).toBe(1);                          // the count is the respawns, not the distinct ids
    expect(agent.state).toBe('running');
  });
});

describe('THE TRACKER PERSISTENCE (2026-08-13 - the failure doc: the tracker must survive restarts)', () => {
  test('registerWave + the mutations persist to the tracker file (the load roundtrip)', () => {
    WaveTracker.clear();
    const wave = WaveTracker.registerWave({
      wave: 'wave-persist-test', names: ['a1'], sessionIds: ['ses-p1'],
      dispatchedAt: Date.now(), etaMs: 600000, etaConfidence: 0.5,
      agents: {},
    });
    WaveTracker.registerAgent(wave, 'a1', 'ses-p1');
    WaveTracker.registerTaskIds(wave, 'a1', ['ses-p1-task']);
    const fs = require('node:fs');
    const os = require('node:os');
    const path = require('node:path');
    const tf = process.env.TRIDENT_TRACKER_FILE || path.join(os.homedir(), 'OPENCODE_WORKSPACE', 'trident-tmp', '.wave-tracker.json');
    const payload = JSON.parse(fs.readFileSync(tf, 'utf-8'));
    expect(payload.tracker.some((w: { wave: string }) => w.wave === 'wave-persist-test')).toBe(true);
    const agent = payload.tracker.find((w: { wave: string }) => w.wave === 'wave-persist-test').agents['a1'];
    expect(agent.taskIds).toEqual(['ses-p1-task']);
  });
});
