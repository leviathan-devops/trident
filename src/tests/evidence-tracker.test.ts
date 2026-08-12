// src/tests/evidence-tracker.test.ts — THE EVIDENCE MACHINE'S BATTERY
// (the spec's C-1.8 :823-896 + the adversarial corpus). THE TESTS ARE THE
// CONTRACT: the DD-5 setup-only-not-legit, the BC-6 smoke orthogonality, the
// FR-1.2 dist-scope reset, the ring cap, the persistence round-trip, the
// FR-16.1 fail-closed load, the missing-session NO_EVIDENCE. The adversarial
// FIRST (the WARHEAD 13): the malformed events, the re-entry, the stale-LEGIT
// cache leak. The pure core (ingestEvent / queryVerdict) AND the exported
// surface (ingestEvidenceEvent / queryEvidenceVerdict) are both exercised.

import { describe, expect, test } from 'bun:test';
import {
  freshRecord,
  ingestEvent,
  queryVerdict,
  loadEvidenceRecord,
  saveEvidenceRecord,
  ingestEvidenceEvent,
  queryEvidenceVerdict,
  getEvidenceState,
  archivedCount,
  EVIDENCE_RING_CAP,
} from '../firewalls/evidence-tracker.js';
import type { EvidenceState, EvidenceEvent, EvidenceRecord } from '../firewalls/evidence-tracker.js';
import { __clearEvidenceSession, __setEvidenceDbFault } from '../hooks/agent-state.js';

// ── THE C-1.8 TRANSITION BATTERY ──

describe('the evidence machine — the transitions (the spec C-1.8)', () => {
  test('NO_EVIDENCE + E_UNIT(exitOk, distMatch) -> UNIT_EVIDENCED', () => {
    const rec = freshRecord('s1', 'shaA');
    const next = ingestEvent(rec, { kind: 'unit', at: 1000, distSha: 'shaA', exitOk: true });
    expect(next.state).toBe('UNIT_EVIDENCED');
    expect(next.lastUnitAt).toBe(1000);
    expect(next.distSha).toBe('shaA');
  });

  test('UNIT_EVIDENCED + E_CONTAINER(artifact, distMatch) -> CONTAINER_EVIDENCED', () => {
    const rec: EvidenceRecord = { ...freshRecord('s1', 'shaA'), state: 'UNIT_EVIDENCED' as EvidenceState, lastUnitAt: 1000 };
    const next = ingestEvent(rec, { kind: 'container', at: 2000, distSha: 'shaA', hasEvidenceArtifact: true, artifact: '.trident/container-test-results.json' });
    expect(next.state).toBe('CONTAINER_EVIDENCED');
    expect(next.lastContainerAt).toBe(2000);
  });

  test('THE SETUP-ONLY IS NOT LEGIT (DD-5): E_CONTAINER WITHOUT the artifact -> NO transition', () => {
    const rec: EvidenceRecord = { ...freshRecord('s1', 'shaA'), state: 'UNIT_EVIDENCED' as EvidenceState, lastUnitAt: 1000 };
    const next = ingestEvent(rec, { kind: 'container', at: 1500, distSha: 'shaA', hasEvidenceArtifact: false });
    expect(next.state).toBe('UNIT_EVIDENCED');
    expect(next.lastContainerAt).toBeNull();
    const v = queryVerdict(next);
    expect(v.verdict).toBe('UNIT_ONLY'); // the setup alone never satisfies
  });

  test('THE SMOKE FLAG IS ORTHOGONAL (BC-6): E_SMOKE NEVER transitions toward the container evidence', () => {
    let rec = freshRecord('s1', 'shaA');
    rec = ingestEvent(rec, { kind: 'smoke', at: 500, distSha: 'shaA' });
    expect(rec.smokeOnly).toBe(true);
    expect(rec.state).toBe('NO_EVIDENCE'); // the state unchanged
    const v = queryVerdict(rec);
    expect(v.verdict).toBe('SMOKE');       // the smoke-only verdict
  });

  test('THE DIST-CHANGE RESET (FR-1.2): E_DIST_CHANGE -> NO_EVIDENCE + the old evidence archived', () => {
    const rec: EvidenceRecord = { ...freshRecord('s1', 'shaA'), state: 'CONTAINER_EVIDENCED' as EvidenceState, lastContainerAt: 2000 };
    const next = ingestEvent(rec, { kind: 'dist_change', at: 3000, distSha: 'shaB' });
    expect(next.distSha).toBe('shaB');
    expect(next.state).toBe('NO_EVIDENCE');
    expect(next.smokeOnly).toBe(false);
    expect(next.lastContainerAt).toBeNull();
    expect(next.lastUnitAt).toBeNull();
    expect(archivedCount('s1', 'shaA')).toBe(1);
  });

  test('THE STALE-DIST UNIT EVENT IS REJECTED (the guard)', () => {
    const rec: EvidenceRecord = { ...freshRecord('s1', 'shaB'), distSha: 'shaB' };
    const next = ingestEvent(rec, { kind: 'unit', at: 3100, distSha: 'shaA', exitOk: true });
    expect(next.lastUnitAt).toBeNull();
    expect(next.state).toBe('NO_EVIDENCE');
  });

  test('THE VERDICT MATRIX (the subject variants + the reasons)', () => {
    let rec = freshRecord('s1', 'shaA');
    expect(queryVerdict(rec).verdict).toBe('UNEVIDENCED');
    rec = ingestEvent(rec, { kind: 'unit', at: 1000, distSha: 'shaA', exitOk: true });
    expect(queryVerdict(rec, 'battery').verdict).toBe('UNIT_ONLY');
    rec = ingestEvent(rec, { kind: 'container', at: 2000, distSha: 'shaA', hasEvidenceArtifact: true, artifact: 'x' });
    expect(queryVerdict(rec, 'registry').verdict).toBe('LEGIT');  // the dist-level default (DD-6)
    expect(queryVerdict(rec).reason).toContain('container-evidenced');
    expect(queryVerdict(rec).smokeCount).toBe(0);
  });

  test('THE RING CAP (the last EVIDENCE_RING_CAP = 50 events)', () => {
    let rec = freshRecord('s1', 'shaA');
    for (let i = 0; i < 60; i++) rec = ingestEvent(rec, { kind: 'unit', at: i, distSha: 'shaA', exitOk: true });
    expect(rec.events.length).toBe(EVIDENCE_RING_CAP);
    expect(rec.events[0].at).toBe(10); // the oldest evicted
  });

  test('THE PERSISTENCE ROUND-TRIP (the save + the reload)', () => {
    __clearEvidenceSession('s-roundtrip');
    const rec: EvidenceRecord = { ...freshRecord('s-roundtrip', 'shaA'), state: 'CONTAINER_EVIDENCED' as EvidenceState, lastContainerAt: 2000 };
    saveEvidenceRecord(rec);
    const loaded = loadEvidenceRecord('s-roundtrip');
    expect(loaded.state).toBe('CONTAINER_EVIDENCED');
    expect(loaded.lastContainerAt).toBe(2000);
    expect(loaded.sessionId).toBe('s-roundtrip');
  });

  test('THE MISSING SESSION -> NO_EVIDENCE (the fresh record shape)', () => {
    __clearEvidenceSession('missing-session');
    const rec = loadEvidenceRecord('missing-session');
    expect(rec.state).toBe('NO_EVIDENCE');
    expect(rec.distSha).toBeNull();
    expect(rec.smokeOnly).toBe(false);
    expect(rec.events.length).toBe(0);
  });
});

// ── THE ADVERSARIAL CORPUS (the WARHEAD 13 — the failures FIRST) ──

describe('the evidence machine — the adversarial', () => {
  test('THE MALFORMED KIND: an unknown event kind is rejected — the record unchanged', () => {
    const rec = freshRecord('s1', 'shaA');
    const bad = { kind: 'bogus', at: 1, distSha: 'shaA' } as unknown as EvidenceEvent;
    const next = ingestEvent(rec, bad);
    expect(next).toBe(rec); // the no-op — the same record object
    expect(next.events.length).toBe(0);
  });

  test('THE MALFORMED DIST-SHA: a unit event with an empty distSha cannot adopt the dist', () => {
    const rec = freshRecord('s1');
    const next = ingestEvent(rec, { kind: 'unit', at: 1, distSha: '', exitOk: true });
    expect(next.state).toBe('NO_EVIDENCE');
    expect(next.distSha).toBeNull(); // the malformed dist never adopted
    expect(next.lastUnitAt).toBeNull();
  });

  test('THE RE-ENTRY: a repeated same-SHA dist_change is a no-op (the rebuild does not reset)', () => {
    let rec = freshRecord('s1', 'shaA');
    rec = ingestEvent(rec, { kind: 'dist_change', at: 1000, distSha: 'shaB' });
    expect(rec.state).toBe('NO_EVIDENCE');
    const after = rec;
    rec = ingestEvent(rec, { kind: 'dist_change', at: 2000, distSha: 'shaB' });
    expect(rec).toBe(after); // the same-SHA rebuild rejected
    expect(rec.lastDistChangeAt).toBe(1000);
  });

  test('THE RE-ENTRY: the smoke AFTER the container evidence NEVER demotes the container state', () => {
    let rec = freshRecord('s1', 'shaA');
    rec = ingestEvent(rec, { kind: 'container', at: 1000, distSha: 'shaA', hasEvidenceArtifact: true, artifact: 'x' });
    expect(rec.state).toBe('CONTAINER_EVIDENCED');
    rec = ingestEvent(rec, { kind: 'smoke', at: 2000, distSha: 'shaA' });
    expect(rec.state).toBe('CONTAINER_EVIDENCED'); // the smoke never demotes
    expect(rec.smokeOnly).toBe(true);              // the flag is the warning, not the veto
    expect(queryVerdict(rec).verdict).toBe('LEGIT');
  });

  test('THE FAIL-CLOSED LOAD (FR-16.1): a db-error stub -> the fresh UNEVIDENCED record, never a silent LEGIT', () => {
    __clearEvidenceSession('faulty-session');
    __setEvidenceDbFault('load');
    try {
      const rec = loadEvidenceRecord('faulty-session');
      expect(rec.state).toBe('NO_EVIDENCE');
      expect(rec.distSha).toBeNull();
      expect(rec.smokeOnly).toBe(false);
    } finally {
      __setEvidenceDbFault(null);
    }
  });

  test('THE SAVE FAILURE PROPAGATES (the loud-fail: the caller sees the error, no false success)', () => {
    __clearEvidenceSession('faulty-save');
    __setEvidenceDbFault('save');
    try {
      expect(() => ingestEvidenceEvent('faulty-save', { kind: 'unit', at: 1, distSha: 'shaA', exitOk: true })).toThrow();
    } finally {
      __setEvidenceDbFault(null);
    }
  });

  test('THE REJECTED EVENT NEVER POLLUTES THE AUDIT TRAIL: the no-op logs, the ring stays consistent', () => {
    __clearEvidenceSession('reject1');
    const t = Date.now();
    // a container event WITHOUT the artifact is rejected (DD-5) — no transition
    ingestEvidenceEvent('reject1', { kind: 'container', at: t, distSha: 'shaA', hasEvidenceArtifact: false });
    const rec = getEvidenceState('reject1');
    expect(rec.state).toBe('NO_EVIDENCE');
    expect(rec.events.length).toBe(0); // the rejected event was not consumed, no duplicate row
    // a genuine unit event then lands normally
    ingestEvidenceEvent('reject1', { kind: 'unit', at: t + 1000, distSha: 'shaA', exitOk: true });
    const rec2 = getEvidenceState('reject1');
    expect(rec2.state).toBe('UNIT_EVIDENCED');
    expect(rec2.events.length).toBe(1); // exactly the consumed event
  });

  test('THE DB RECOVERS AFTER THE FAULT: the fail-closed is the load, not the disable', () => {
    __clearEvidenceSession('recover-session');
    __setEvidenceDbFault('load');
    let failed = false;
    try {
      loadEvidenceRecord('recover-session');
    } catch (e) {
      failed = true; // the machine never throws — the fail-closed returns the fresh record
    }
    __setEvidenceDbFault(null);
    expect(failed).toBe(false);
    const t = Date.now();
    const rec = ingestEvidenceEvent('recover-session', { kind: 'unit', at: t, distSha: 'shaA', exitOk: true });
    expect(rec.state).toBe('UNIT_EVIDENCED');
  });
});

// ── THE EXPORTED SURFACE (the C-2/C-4/C-5 consumers' path) ──
// The db-backed tests use now-based timestamps (the 24h pruning on save rejects
// the epoch-millis fixtures — the machine's event times are Date.now() in the
// real flow).

describe('the evidence machine — the exported surface', () => {
  test('ingestEvidenceEvent -> getEvidenceState -> queryEvidenceVerdict (the full round-trip)', () => {
    __clearEvidenceSession('surf1');
    const t = Date.now();
    const rec = ingestEvidenceEvent('surf1', { kind: 'unit', at: t, distSha: 'shaA', exitOk: true });
    expect(rec.state).toBe('UNIT_EVIDENCED');
    expect(getEvidenceState('surf1').state).toBe('UNIT_EVIDENCED');
    const v = queryEvidenceVerdict('surf1');
    expect(v.verdict).toBe('UNIT_ONLY');
    expect(v.distSha).toBe('shaA');
  });

  test('THE CONTAINER EVIDENCE THROUGH THE SURFACE -> LEGIT', () => {
    __clearEvidenceSession('surf2');
    const t = Date.now();
    ingestEvidenceEvent('surf2', { kind: 'container', at: t, distSha: 'shaA', hasEvidenceArtifact: true, artifact: '.trident/container-test-results.json' });
    expect(queryEvidenceVerdict('surf2').verdict).toBe('LEGIT');
  });

  test('THE CACHE INVALIDATION: a dist_change after a cached LEGIT never leaks a stale LEGIT', () => {
    __clearEvidenceSession('cache1');
    const t = Date.now();
    ingestEvidenceEvent('cache1', { kind: 'unit', at: t, distSha: 'shaA', exitOk: true });
    ingestEvidenceEvent('cache1', { kind: 'container', at: t + 1000, distSha: 'shaA', hasEvidenceArtifact: true, artifact: 'x' });
    expect(queryEvidenceVerdict('cache1').verdict).toBe('LEGIT'); // cached
    ingestEvidenceEvent('cache1', { kind: 'dist_change', at: t + 2000, distSha: 'shaB' });
    expect(queryEvidenceVerdict('cache1').verdict).toBe('UNEVIDENCED'); // the invalidation cleared the stale LEGIT
  });

  test('THE DIST-LEVEL DEFAULT (DD-6): the subject-tagged query satisfies via the dist evidence', () => {
    __clearEvidenceSession('dd6');
    const t = Date.now();
    ingestEvidenceEvent('dd6', { kind: 'container', at: t, distSha: 'shaA', hasEvidenceArtifact: true, artifact: 'x', subject: 'ship' });
    const v = queryEvidenceVerdict('dd6', 'registry'); // an un-subject-tagged claim
    expect(v.verdict).toBe('LEGIT'); // the dist-level default satisfies any subject
  });

  test('THE VERDICT REASONS NAME THE STATE (the C-3 warhead selector input)', () => {
    __clearEvidenceSession('reason1');
    const t = Date.now();
    ingestEvidenceEvent('reason1', { kind: 'smoke', at: t, distSha: 'shaA' });
    const v = queryEvidenceVerdict('reason1');
    expect(v.verdict).toBe('SMOKE');
    expect(v.reason).toContain('smoke-only');
    expect(v.smokeCount).toBe(1);
  });
});
