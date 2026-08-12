// ═══ THE 7.5 SHIP-GATE BATTERY (src/tests/ship-gate.test.ts — the wave-4 acceptance) ═══
// THE ROLE: the FR-4's proof — the SHIP-class detection (G-8.4's scoping), the
// evidence-state throw matrix (BC-4), the legit ship pass (FR-4.2), the escape
// hatch (FR-4.3), the never-gated surfaces (the reads + the container-test).
// THE CONTRACT (the spec's 6.4 + 7.6): the deploy/ship acts
// (the host-plugin copies, the ship-package writes, the restarts) are 'ship' —
// a ship whose evidence is not LEGIT THROWS the [SSTF SHIP GATE] warhead (the
// FR-13.4 text); a LEGIT ship passes; the reads + the container-test never hit
// the gate. THE DI SEAM: the evidence machine (C-1) is live (queryEvidenceVerdict
// via the real evidence-tracker) — the battery drives the machine through its
// real transition core (ingestEvidenceEvent) so the verdicts are the machine's
// truth, not a stub. THE OPERATOR OVERRIDE (FR-4.3 / CN-9.1): the manual deploy
// bypasses once with the marker. THE STATE ISOLATION: each test uses its OWN
// session id (no shared machine state to reset) — the machine's per-session
// records are the isolation, so no lifecycle hooks are needed.

// @ts-ignore — bun:test ships the runtime, not TS declarations
import { describe, expect, test } from 'bun:test';
import {
  classifyIntentTool,
  classifyIntent,
  enforceShipGate,
  evaluateShipGate,
  shipGateWarhead,
  extractIntent,
} from '../firewalls/semantic-smoke-firewall.js';
import type { IntentType } from '../firewalls/semantic-smoke-firewall.js';
import { ingestEvidenceEvent } from '../firewalls/evidence-tracker.js';

const DIST_A = 'aaaa1111';
let sessionCounter = 0;
function freshSession(): string {
  sessionCounter++;
  return 'ship-session-' + sessionCounter;
}

// THE EVENT FACTORIES (the machine's transition core — the real guards).
function unitEvent(distSha: string): Parameters<typeof ingestEvidenceEvent>[1] {
  return { kind: 'unit', at: Date.now(), distSha, exitOk: true, detail: 'the battery' };
}
function containerEvent(distSha: string): Parameters<typeof ingestEvidenceEvent>[1] {
  return { kind: 'container', at: Date.now(), distSha, hasEvidenceArtifact: true, artifact: '.trident/container-test-results.json', detail: 'the container suite' };
}
function smokeEvent(distSha: string): Parameters<typeof ingestEvidenceEvent>[1] {
  return { kind: 'smoke', at: Date.now(), distSha, detail: 'the inline-exec' };
}

// THE NEVER-THROW ASSERTION (the shim's .not lacks toThrow): asserts the fn
// does NOT throw — the never-gated surfaces' contract (FR-4.2).
function expectNoThrow(fn: () => void): void {
  let threw: string | null = null;
  try { fn(); } catch (e) { threw = e instanceof Error ? e.message : String(e); }
  if (threw !== null) throw new Error('expected NO throw, but got: ' + threw);
}

describe('THE SHIP GATE — THE SHIP-CLASS DETECTION (FR-4.1)', () => {
  test('the host-plugin copy is SHIP-class', () => {
    expect(classifyIntentTool('bash', 'cp dist/index.js ~/.config/opencode/plugins/trident/')).toBe('ship');
  });
  test('the rsync/scp plugin copies are SHIP-class', () => {
    expect(classifyIntentTool('bash', 'rsync -av dist/ ~/.config/opencode/plugins/trident/')).toBe('ship');
    expect(classifyIntentTool('bash', 'scp dist/index.js host:~/.config/opencode/plugins/trident/')).toBe('ship');
  });
  test('the ship-package write is SHIP-class', () => {
    expect(classifyIntentTool('trident-ship-package', 'targetPath=... outputPath=Ship_Packages/')).toBe('ship');
  });
  test('the restart is SHIP-class', () => {
    expect(classifyIntentTool('bash', 'systemctl restart opencode')).toBe('ship');
    expect(classifyIntentTool('bash', 'sudo systemctl restart trident')).toBe('ship');
  });
  test('the ambiguous plugin-ish copy is SHIP-class (the fail-closed — G-8.4)', () => {
    expect(classifyIntentTool('bash', 'cp dist/index.js /opt/trident-deploy/')).toBe('ship');
  });
  test('a non-ship copy is NOT the SHIP class (never gated)', () => {
    expect(classifyIntentTool('bash', 'cp report.md /tmp/')).not.toBe('ship');
  });
  test('the build + the battery are NOT ship-class (the WORK class)', () => {
    expect(classifyIntentTool('bash', 'bun build --outfile dist/index.js')).not.toBe('ship');
    expect(classifyIntentTool('bash', 'bun test src/tests/')).not.toBe('ship');
  });
  test('the container-test is NEVER ship-class (the escape hatch — FR-4.3)', () => {
    for (const action of ['setup', 'deploy', 'send', 'check', 'suite', 'report']) {
      expect(classifyIntentTool('trident-container-test', 'action=' + action)).toBe('evidence');
      expect(classifyIntentTool('trident-container-test', 'action=' + action)).not.toBe('ship');
      expect(classifyIntentTool('trident-container-test', 'action=' + action)).not.toBe('claim_verification');
    }
  });
  test('the reads are never gated', () => {
    expect(classifyIntentTool('read', 'src/firewalls/evidence-tracker.js')).not.toBe('ship');
    expect(classifyIntentTool('bash', 'cat dist/index.js')).not.toBe('ship');
    expect(classifyIntentTool('grep', 'dist/index.js')).not.toBe('ship');
  });
  test('the classifyIntent uppercase shape (the 7.6 contract)', () => {
    expect(classifyIntent('bash', 'cp dist/index.js ~/.config/opencode/plugins/trident/').toolClass).toBe('SHIP');
    expect(classifyIntent('bash', 'cp report.md /tmp/').toolClass).not.toBe('SHIP');
    expect(classifyIntent('trident-container-test', 'action=deploy').toolClass).toBe('EVIDENCE');
  });
  test('extractIntent carries the ship class (the hook call path)', () => {
    const intent: IntentType = extractIntent('bash', { command: 'cp dist/index.js ~/.config/opencode/plugins/trident/' }, null);
    expect(intent).toBe('ship');
  });
});

describe('THE SHIP GATE — THE EVIDENCE-STATE MATRIX (BC-4)', () => {
  test('NO_EVIDENCE → the ship throws the [SSTF SHIP GATE]', () => {
    const sid = freshSession(); // no events → the machine's verdict is UNEVIDENCED
    expect(() => enforceShipGate(sid, 'bash', 'cp dist/index.js ~/.config/opencode/plugins/trident/')).toThrow(/\[SSTF SHIP GATE\]/);
  });

  test('SMOKE_ONLY → the ship throws (the smoke never satisfies — BC-6)', () => {
    const sid = freshSession();
    ingestEvidenceEvent(sid, smokeEvent(DIST_A));
    expect(() => enforceShipGate(sid, 'bash', 'cp dist/index.js ~/.config/opencode/plugins/trident/')).toThrow(/\[SSTF SHIP GATE\]/);
  });

  test('UNIT_EVIDENCED → the ship throws, naming the state + the dist + the sanctioned path (FR-13.4)', () => {
    const sid = freshSession();
    ingestEvidenceEvent(sid, unitEvent(DIST_A));
    try {
      enforceShipGate(sid, 'bash', 'cp dist/index.js ~/.config/opencode/plugins/trident/');
      throw new Error('expected the gate to throw');
    } catch (e: unknown) {
      const msg = (e as Error).message;
      expect(msg).toContain('[SSTF SHIP GATE]');
      expect(msg).toContain('UNIT_EVIDENCED');            // the evidence STATE named
      expect(msg).toContain('trident-container-test');    // the sanctioned path named
      expect(msg).toContain('The reads + the container-test never hit this gate');
    }
  });

  test('CONTAINER_EVIDENCED → the ship passes (the legit ship never blocked — FR-4.2)', () => {
    const sid = freshSession();
    ingestEvidenceEvent(sid, containerEvent(DIST_A));
    expectNoThrow(() => enforceShipGate(sid, 'bash', 'cp dist/index.js ~/.config/opencode/plugins/trident/'));
  });

  test('the ambiguous ship-like command with UNEVIDENCED → the fail-closed throw (CN-4.4)', () => {
    const sid = freshSession();
    expect(() => enforceShipGate(sid, 'bash', 'cp dist/index.js /opt/trident-deploy/')).toThrow(/\[SSTF SHIP GATE\]/);
  });

  test('the smoke-disguised-as-container (no artifact) is NOT LEGIT (the adversarial — CN-5.4)', () => {
    const sid = freshSession();
    // A container event with hasEvidenceArtifact:false is rejected by the guard
    // → the machine stays UNEVIDENCED → the ship throws.
    ingestEvidenceEvent(sid, { kind: 'container', at: Date.now(), distSha: DIST_A, hasEvidenceArtifact: false, detail: 'setup only' });
    const v = evaluateShipGate(sid, DIST_A);
    expect(v.allowed).toBe(false);
    expect(v.warhead).toContain('container verification is missing');
  });
});

describe('THE SHIP GATE — THE EVALUATE-SHIP-GATE DECISION (the 7.6 shape)', () => {
  test('the LEGIT verdict → allowed + no warhead', () => {
    const sid = freshSession();
    ingestEvidenceEvent(sid, containerEvent(DIST_A));
    const v = evaluateShipGate(sid, DIST_A);
    expect(v.allowed).toBe(true);
    expect(v.warhead).toBeNull();
  });
  test('the UNEVIDENCED verdict → not allowed + the warhead', () => {
    const sid = freshSession();
    const v = evaluateShipGate(sid, DIST_A);
    expect(v.allowed).toBe(false);
    expect(v.warhead).toContain('[SSTF SHIP GATE]');
  });
  test('the operator override bypasses ONCE with the marker (FR-4.3 / CN-9.1)', () => {
    const sid = freshSession(); // NO_EVIDENCE
    const first = evaluateShipGate(sid, DIST_A, { operatorOverride: true });
    expect(first.allowed).toBe(true);
    expect(first.marker).toContain('OPERATOR OVERRIDE');
    // The override is consumed — the next ship WITHOUT the override re-gates.
    const second = evaluateShipGate(sid, DIST_A);
    expect(second.allowed).toBe(false);
  });
  test('the shipGateWarhead names the state + the dist (the FR-13.4 text)', () => {
    const w = shipGateWarhead({ verdict: 'UNIT_ONLY', distSha: DIST_A, lastContainerAt: null, lastUnitAt: Date.now(), smokeCount: 0, reason: 'unit only' });
    expect(w).toContain('[SSTF SHIP GATE]');
    expect(w).toContain('UNIT_EVIDENCED');
    expect(w).toContain(DIST_A);
  });
});

describe('THE SHIP GATE — THE NEVER-GATED SURFACES (FR-4.2)', () => {
  test('the reads + the container-test never throw even with the UNEVIDENCED state', () => {
    const sid = freshSession(); // NO_EVIDENCE (the fail-closed state)
    expectNoThrow(() => enforceShipGate(sid, 'read', 'src/firewalls/evidence-tracker.js'));
    expectNoThrow(() => enforceShipGate(sid, 'grep', 'dist/index.js'));
    expectNoThrow(() => enforceShipGate(sid, 'trident-container-test', 'action=deploy containerName=ct75'));
    expectNoThrow(() => enforceShipGate(sid, 'trident-container-test', 'action=suite'));
  });
  test('the non-ship build/bash passes the gate (the WORK class is never gated)', () => {
    const sid = freshSession();
    expectNoThrow(() => enforceShipGate(sid, 'bash', 'bun build --outfile dist/index.js'));
    expectNoThrow(() => enforceShipGate(sid, 'bash', 'cat dist/index.js'));
  });
});

// ── THE DI SEAM VERIFICATION (the transform seam's no-op/pending contract) ──
// The surgical mutator (C-3) is a sibling wave — the seam defaults to NO-OP
// (no mutation, no throw). THE NEVER-THROW is the seam's hard contract (FR-16.4).
describe('THE SHIP GATE — THE TRANSFORM SEAM (the parallel-wave DI)', () => {
  test('the seam resolves the live smoke-lexicon classifyMessageSpans', async () => {
    // The smoke-lexicon (C-2) landed — the seam must resolve it (the index.ts
    // registration wires it). The seam's contract: classifyMessageSpans returns
    // the spans for a message.
    const { setSSTFTransformSeam, getSSTFTransformSeam } = await import('../firewalls/semantic-smoke-firewall.js');
    const { classifyMessageSpans } = await import('../firewalls/smoke-lexicon.js');
    setSSTFTransformSeam({ classifyMessageSpans: (text, sid) => classifyMessageSpans(text, sid || 'default') });
    const seam = getSSTFTransformSeam();
    expect(typeof seam.classifyMessageSpans).toBe('function');
    const spans = seam.classifyMessageSpans!('the battery passed 708/10 green', 'default');
    expect(Array.isArray(spans)).toBe(true);
  });
  test('the seam tolerates a missing mutator (the pending sibling — no throw)', async () => {
    const { setSSTFTransformSeam, getSSTFTransformSeam } = await import('../firewalls/semantic-smoke-firewall.js');
    setSSTFTransformSeam({}); // no mutator — the pending-sibling state
    const seam = getSSTFTransformSeam();
    expect(seam.mutateMessage).toBeUndefined();
    // The transform's no-op guard: a missing mutator → no mutation, no throw.
    expectNoThrow(() => { if (seam.mutateMessage) seam.mutateMessage('x', 's'); });
  });
});