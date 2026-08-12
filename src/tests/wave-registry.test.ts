// ═══ THE WAVE-REGISTRY STATE MACHINE — THE RED-TEAM BATTERY ═══
// (2026-08-12 — BUGREPORT_wave-manager-dispatch-authorization.md: the dispatch
// authorization was consumed by a FAILED dispatch; the wave became permanently
// un-dispatchable. THE FIX: the registry state machine in src/tools/wave-
// registry.ts. THIS BATTERY red-teams the EXACT bug + every build-breaking
// variation of the lifecycle:
//   T1 THE EXACT BUG     — attempt → after-hook 'failed' → RE-FIRE ALLOWED
//   T2 THE PRE-EXEC REJECT — attempt → 'recorded' + window expired → RE-FIRE ALLOWED
//   T3 THE SUCCESS PATH  — attempt → 'accepted' → RE-FIRE BLOCKED
//   T4 THE IN-FLIGHT DUPE — 'recorded' + window open → same-key re-fire BLOCKED
//   T5 THE DERAILMENT    — 1 accepted + window expired → new-key BLOCKED
//   T6 THE MIXED RECOVERY — 3 accepted + 3 failed → the failed keys re-fireable
//   T7 THE FULL BATCH    — 6/6 accepted → every re-fire BLOCKED
//   T8 THE V1→V2 LEGACY  — a v1 string[] registry normalizes + recovers
//   T9 THE RELEASE       — the manual reset makes the wave re-fireable
//   T10 THE CONFIRM GUARDS — accepted never downgraded; failed upgrades on success
//   T11 THE STATE TRANSITIONS — ready → dispatching → dispatched

import { describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import {
  createWaveRegistry, readWaveRegistryFile, writeWaveRegistryFile,
  releaseWaveRegistryFile, evaluateWaveBatchGate, deriveWaveStatus,
  confirmWaveRegistryCall, isTaskCallAccepted, resolveWaveCallKey,
  type WaveRegistry,
} from '../tools/wave-registry.ts';

const WINDOW = 60 * 1000;                       // WAVE_DISPATCH_WINDOW_MS
const sandboxes: string[] = [];
function tmp(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wave-registry-test-'));
  sandboxes.push(dir);
  return dir;
}

function sha(s: string): string { return createHash('sha256').update(s).digest('hex'); }

// a wave + a generated prompt file for one agent (the resolve path needs it)
function makeWave(dir: string, n = 2): { wave: string; keys: string[]; files: string[] } {
  const wave = 'wave-' + Date.now();
  const keys: string[] = [];
  const files: string[] = [];
  const agents: Array<Record<string, unknown>> = [];
  for (let i = 0; i < n; i++) {
    const name = 'agent-' + i;
    const prompt = 'MISSION: test ' + i + '\nREADING ORDER: /tmp/x\nWHAT: a\nWHY: b\nEXPECTED: c\nVERIFICATION: grep\nRETURN FORMAT: report\n';
    const file = path.join(dir, name + '.md');
    fs.writeFileSync(file, prompt, 'utf-8');
    const s = sha(prompt);
    keys.push(name + '|' + wave + '|' + s);
    files.push(file);
    agents.push({ name, type: 'trident_explore', lines: 7, sha256: s, status: 'ready', generatedAt: new Date().toISOString(), generationMs: 1 });
  }
  // THE WAVE-LEVEL MANIFEST (the resolver's source — mirrors the generator's shape):
  fs.writeFileSync(path.join(dir, '.wave-manifest-' + wave + '.json'), JSON.stringify({ wave, generatedAt: new Date().toISOString(), agents }, null, 2), 'utf-8');
  // THE PER-AGENT RECORDS (the dispatch-authorization shape):
  for (const a of agents) {
    fs.writeFileSync(path.join(dir, '.wave-manifest-' + wave + '-' + a.name + '.json'), JSON.stringify({ wave, generatedAt: new Date().toISOString(), agents: [a] }, null, 2), 'utf-8');
  }
  const reg = createWaveRegistry(dir, wave, n);
  expect(reg.status).toBe('ready');
  return { wave, keys, files };
}

describe('T1 THE EXACT BUG — a runtime-rejected dispatch must NOT consume the authorization', () => {
  test('attempt → after-hook failed → RE-FIRE ALLOWED (the bug’s recovery)', () => {
    const dir = tmp();
    const { wave, keys } = makeWave(dir, 1);
    const reg = readWaveRegistryFile(dir, wave)!;
    // the dispatch attempt: the gate appends 'recorded'
    const d1 = evaluateWaveBatchGate(reg, keys[0], 1_000, WINDOW);
    expect(d1.action).toBe('allow');
    expect(d1.reason).toBe('new-call');
    writeWaveRegistryFile(dir, d1.reg);
    // the runtime REJECTS the call (the env-var demand / schema error) — the
    // after-hook observes the rejection:
    const confirmed = confirmWaveRegistryCall(dir, 'agent-0', path.join(dir, 'agent-0.md'), false);
    expect(confirmed?.status).toBe('failed');
    // the re-fire (the operator's now-valid dispatch): MUST be allowed
    const reg2 = readWaveRegistryFile(dir, wave)!;
    const d2 = evaluateWaveBatchGate(reg2, keys[0], 2_000, WINDOW);
    expect(d2.action).toBe('allow');
    expect(d2.reason).toBe('failed-reset');
    // THE OLD CODE BLOCKED HERE — "[WAVE BATCH] already recorded" — the wave
    // was permanently bricked. THE FIX: the failed attempt is re-fireable.
  });
});

describe('T2 THE PRE-EXECUTION REJECTION — the after-hook NEVER fires', () => {
  test('recorded + window EXPIRED → RE-FIRE ALLOWED (stale-recorded-reset)', () => {
    const dir = tmp();
    const { wave, keys } = makeWave(dir, 1);
    let reg = readWaveRegistryFile(dir, wave)!;
    const d1 = evaluateWaveBatchGate(reg, keys[0], 1_000, WINDOW);
    writeWaveRegistryFile(dir, d1.reg);
    // the runtime rejects BEFORE execution — no after-hook — the key stays
    // 'recorded'. The window expires (the re-fire lands minutes later):
    reg = readWaveRegistryFile(dir, wave)!;
    const d2 = evaluateWaveBatchGate(reg, keys[0], 1_000 + WINDOW + 1, WINDOW);
    expect(d2.action).toBe('allow');
    expect(d2.reason).toBe('stale-recorded-reset');
  });
});

describe('T3 THE SUCCESS PATH — a confirmed dispatch blocks the re-fire', () => {
  test('attempt → after-hook accepted → RE-FIRE BLOCKED', () => {
    const dir = tmp();
    const { wave, keys } = makeWave(dir, 1);
    const reg = readWaveRegistryFile(dir, wave)!;
    const d1 = evaluateWaveBatchGate(reg, keys[0], 1_000, WINDOW);
    writeWaveRegistryFile(dir, d1.reg);
    const confirmed = confirmWaveRegistryCall(dir, 'agent-0', path.join(dir, 'agent-0.md'), true);
    expect(confirmed?.status).toBe('accepted');
    // the wave is now dispatched:
    expect(deriveWaveStatus(readWaveRegistryFile(dir, wave)!)).toBe('dispatched');
    // the re-fire (the double-dispatch attempt) MUST be blocked:
    const reg2 = readWaveRegistryFile(dir, wave)!;
    const d2 = evaluateWaveBatchGate(reg2, keys[0], 2_000, WINDOW);
    expect(d2.action).toBe('block');
    expect(d2.reason).toBe('accepted');
  });
});

describe('T4 THE IN-FLIGHT DUPLICATE — a recorded call re-fired inside the window', () => {
  test('recorded + window OPEN → BLOCKED (in-flight)', () => {
    const dir = tmp();
    const { wave, keys } = makeWave(dir, 1);
    const reg = readWaveRegistryFile(dir, wave)!;
    const d1 = evaluateWaveBatchGate(reg, keys[0], 1_000, WINDOW);
    writeWaveRegistryFile(dir, d1.reg);
    // the same call re-fired within the window (the batch still in flight):
    const reg2 = readWaveRegistryFile(dir, wave)!;
    const d2 = evaluateWaveBatchGate(reg2, keys[0], 1_500, WINDOW);
    expect(d2.action).toBe('block');
    expect(d2.reason).toBe('in-flight');
  });
});

describe('T5 THE ONE-AT-A-TIME DERAILMENT — the gate’s reason to exist', () => {
  test('1 accepted + window expired → a NEW agent’s call BLOCKED', () => {
    const dir = tmp();
    const { wave, keys } = makeWave(dir, 2);
    // agent-0 dispatched + accepted:
    let reg = readWaveRegistryFile(dir, wave)!;
    const d0 = evaluateWaveBatchGate(reg, keys[0], 1_000, WINDOW);
    writeWaveRegistryFile(dir, d0.reg);
    confirmWaveRegistryCall(dir, 'agent-0', path.join(dir, 'agent-0.md'), true);
    // the window expires; the derailment's NEXT-TURN call for agent-1 arrives:
    reg = readWaveRegistryFile(dir, wave)!;
    const d1 = evaluateWaveBatchGate(reg, keys[1], 1_000 + WINDOW + 1, WINDOW);
    expect(d1.action).toBe('block');
    expect(d1.reason).toBe('partial-expired');
  });
  test('the SAME window (the legit full batch) is NOT blocked', () => {
    const dir = tmp();
    const { wave, keys } = makeWave(dir, 2);
    let reg = readWaveRegistryFile(dir, wave)!;
    const d0 = evaluateWaveBatchGate(reg, keys[0], 1_000, WINDOW);
    writeWaveRegistryFile(dir, d0.reg);
    confirmWaveRegistryCall(dir, 'agent-0', path.join(dir, 'agent-0.md'), true);
    // agent-1's call lands within the SAME window — the legit batch:
    reg = readWaveRegistryFile(dir, wave)!;
    const d1 = evaluateWaveBatchGate(reg, keys[1], 1_200, WINDOW);
    expect(d1.action).toBe('allow');
  });
});

describe('T6 THE MIXED RECOVERY — 3 accepted + 3 rejected', () => {
  test('the rejected keys re-fire ALLOWED; the accepted keys stay BLOCKED', () => {
    const dir = tmp();
    const { wave, keys, files } = makeWave(dir, 6);
    let reg = readWaveRegistryFile(dir, wave)!;
    for (let i = 0; i < 6; i++) {
      const d = evaluateWaveBatchGate(reg, keys[i], 1_000 + i, WINDOW);
      reg = d.reg;
    }
    writeWaveRegistryFile(dir, reg);
    // after-hooks: 0-2 accepted, 3-5 rejected:
    for (let i = 0; i < 3; i++) confirmWaveRegistryCall(dir, 'agent-' + i, files[i], true);
    for (let i = 3; i < 6; i++) confirmWaveRegistryCall(dir, 'agent-' + i, files[i], false);
    // the re-fire of the REJECTED agents (the recovery — same window):
    reg = readWaveRegistryFile(dir, wave)!;
    const d3 = evaluateWaveBatchGate(reg, keys[3], 1_100, WINDOW);
    expect(d3.action).toBe('allow');
    expect(d3.reason).toBe('failed-reset');
    // the re-fire of an ACCEPTED agent stays blocked:
    reg = readWaveRegistryFile(dir, wave)!;
    const d0 = evaluateWaveBatchGate(reg, keys[0], 1_150, WINDOW);
    expect(d0.action).toBe('block');
    expect(d0.reason).toBe('accepted');
  });
});

describe('T7 THE FULL BATCH — 6/6 accepted', () => {
  test('every re-fire BLOCKED — the wave is dispatched', () => {
    const dir = tmp();
    const { wave, keys, files } = makeWave(dir, 6);
    let reg = readWaveRegistryFile(dir, wave)!;
    for (let i = 0; i < 6; i++) {
      const d = evaluateWaveBatchGate(reg, keys[i], 1_000 + i, WINDOW);
      reg = d.reg;
    }
    writeWaveRegistryFile(dir, reg);
    for (let i = 0; i < 6; i++) confirmWaveRegistryCall(dir, 'agent-' + i, files[i], true);
    expect(deriveWaveStatus(readWaveRegistryFile(dir, wave)!)).toBe('dispatched');
    for (let i = 0; i < 6; i++) {
      const d = evaluateWaveBatchGate(readWaveRegistryFile(dir, wave)!, keys[i], 2_000 + i, WINDOW);
      expect(d.action).toBe('block');
      expect(d.reason).toBe('accepted');
    }
  });
});

describe('T8 THE V1→V2 LEGACY — the OLD stuck registries recover', () => {
  test('a v1 string[] registry normalizes to recorded + the expired window recycles', () => {
    const dir = tmp();
    const wave = 'wave-' + Date.now();
    // the OLD generator's shape (calls: string[]):
    const legacy = {
      wave,
      total: 1,
      calls: ['agent-0|' + wave + '|' + sha('x')],
      windowStart: 1_000,
    };
    fs.writeFileSync(path.join(dir, '.wave-registry-' + wave + '.json'), JSON.stringify(legacy), 'utf-8');
    const reg = readWaveRegistryFile(dir, wave)!;
    expect(reg.calls.length).toBe(1);
    expect(reg.calls[0].status).toBe('recorded');   // the v1→v2 normalization
    // the window expired long ago (the bug’s stuck wave) — the re-fire recovers:
    const d = evaluateWaveBatchGate(reg, legacy.calls[0], 1_000 + WINDOW + 1, WINDOW);
    expect(d.action).toBe('allow');
    expect(d.reason).toBe('stale-recorded-reset');
  });
});

describe('T9 THE RELEASE — the manual safety valve', () => {
  test('release resets the registry → the batch re-fireable', () => {
    const dir = tmp();
    const { wave, keys } = makeWave(dir, 2);
    // a stuck state: 1 accepted + 1 recorded (the mixed brick):
    let reg = readWaveRegistryFile(dir, wave)!;
    const d0 = evaluateWaveBatchGate(reg, keys[0], 1_000, WINDOW);
    writeWaveRegistryFile(dir, d0.reg);
    confirmWaveRegistryCall(dir, 'agent-0', path.join(dir, 'agent-0.md'), true);
    const released = releaseWaveRegistryFile(dir, wave)!;
    expect(released.status).toBe('ready');
    expect(released.calls.length).toBe(0);
    // the re-fire of BOTH agents passes (the wave is re-fireable):
    for (const k of keys) {
      const d = evaluateWaveBatchGate(released, k, 2_000, WINDOW);
      expect(d.action).toBe('allow');
    }
  });
  test('release by ALIAS resolves to the generated wave id (2026-08-12 — the container red-team\'s live finding)', () => {
    const dir = tmp();
    const wave = 'wave-' + Date.now();
    const alias = 'ct-redteam-v1';
    // the manifest carries the alias (requestedWaveId):
    fs.writeFileSync(path.join(dir, '.wave-manifest-' + wave + '.json'), JSON.stringify({
      wave, requestedWaveId: alias, generatedAt: new Date().toISOString(),
      agents: [{ name: 'rg-a1', type: 'trident_explore', lines: 7, sha256: sha('p'), status: 'ready', generatedAt: new Date().toISOString(), generationMs: 1 }],
    }), 'utf-8');
    fs.writeFileSync(path.join(dir, 'rg-a1.md'), 'MISSION: p\nREADING ORDER: /tmp/x\nWHAT: a\nWHY: b\nEXPECTED: c\nVERIFICATION: grep\nRETURN FORMAT: report\n', 'utf-8');
    // a stuck (dispatched) registry:
    let reg = createWaveRegistry(dir, wave, 1);
    const d0 = evaluateWaveBatchGate(reg, 'rg-a1|' + wave + '|' + sha('p'), 1_000, WINDOW);
    writeWaveRegistryFile(dir, d0.reg);
    confirmWaveRegistryCall(dir, 'rg-a1', path.join(dir, 'rg-a1.md'), true);
    expect(readWaveRegistryFile(dir, wave)!.status).toBe('dispatched');
    // THE RELEASE BY ALIAS — the operator passes the waveId they used at generation:
    const released = releaseWaveRegistryFile(dir, alias)!;
    expect(released.wave).toBe(wave);       // the alias resolved to the generated id
    expect(released.status).toBe('ready');
    expect(released.calls).toEqual([]);
    // and the release by the GENERATED id also works:
    const released2 = releaseWaveRegistryFile(dir, wave)!;
    expect(released2?.wave).toBe(wave);
  });
  test('release on a missing registry → null (no-op)', () => {
    const dir = tmp();
    expect(releaseWaveRegistryFile(dir, 'wave-999')).toBeNull();
  });
});

describe('T10 THE CONFIRM GUARDS — the acceptance probe’s safety', () => {
  test("an 'accepted' entry is NEVER downgraded by a blocked re-fire's error", () => {
    const dir = tmp();
    const { wave, keys, files } = makeWave(dir, 1);
    let reg = readWaveRegistryFile(dir, wave)!;
    const d0 = evaluateWaveBatchGate(reg, keys[0], 1_000, WINDOW);
    writeWaveRegistryFile(dir, d0.reg);
    confirmWaveRegistryCall(dir, 'agent-0', files[0], true);
    // a later blocked re-fire's after-hook fires with the [WAVE BATCH] error:
    const c = confirmWaveRegistryCall(dir, 'agent-0', files[0], false);
    expect(c).toBeNull();                            // the guard skipped the downgrade
    expect(readWaveRegistryFile(dir, wave)!.calls[0].status).toBe('accepted');
  });
  test("a 'failed' entry UPGRADES to 'accepted' when the re-fire lands", () => {
    const dir = tmp();
    const { wave, keys, files } = makeWave(dir, 1);
    let reg = readWaveRegistryFile(dir, wave)!;
    const d0 = evaluateWaveBatchGate(reg, keys[0], 1_000, WINDOW);
    writeWaveRegistryFile(dir, d0.reg);
    confirmWaveRegistryCall(dir, 'agent-0', files[0], false);   // attempt 1: failed
    const c = confirmWaveRegistryCall(dir, 'agent-0', files[0], true);  // the re-fire lands
    expect(c?.status).toBe('accepted');
    expect(deriveWaveStatus(readWaveRegistryFile(dir, wave)!)).toBe('dispatched');
  });
  test('an undetermined outcome (null) leaves the entry unchanged', () => {
    const dir = tmp();
    const { wave, keys, files } = makeWave(dir, 1);
    let reg = readWaveRegistryFile(dir, wave)!;
    const d0 = evaluateWaveBatchGate(reg, keys[0], 1_000, WINDOW);
    writeWaveRegistryFile(dir, d0.reg);
    expect(isTaskCallAccepted('some unrelated prose')).toBeNull();
    expect(confirmWaveRegistryCall(dir, 'agent-0', files[0], null)).toBeNull();
    expect(readWaveRegistryFile(dir, wave)!.calls[0].status).toBe('recorded');
  });
});

describe('T10b THE ACCEPTANCE PROBE — the mechanical detector', () => {
  test('the task_id / session id → accepted', () => {
    expect(isTaskCallAccepted(JSON.stringify({ task_id: 'ses_abc123' }))).toBe(true);
    expect(isTaskCallAccepted('{"output": "{\\"sessionId\\": \\"ses_xyz789\\"}"}'.replace(/\\\\/g, '\\'))).toBe(true);
    expect(isTaskCallAccepted('ses_abc123')).toBe(true);
  });
  test('the rejection texts → failed', () => {
    expect(isTaskCallAccepted('Background subagents require OPENCODE_EXPERIMENTAL_BACKGROUND_SUBAGENTS=true')).toBe(false);
    expect(isTaskCallAccepted('[WAVE BATCH] the dispatch authorization is CONFIRMED')).toBe(false);
    expect(isTaskCallAccepted('Invalid arguments: background must be a boolean')).toBe(false);
  });
  test('the unrelated prose → null (undetermined — the window recycling handles it)', () => {
    expect(isTaskCallAccepted('The wave completed and the results are collected.')).toBeNull();
  });
});

describe('T11 THE STATE TRANSITIONS + THE RESOLVE', () => {
  test('ready → dispatching → dispatched', () => {
    const dir = tmp();
    const { wave, keys } = makeWave(dir, 1);
    expect(deriveWaveStatus(readWaveRegistryFile(dir, wave)!)).toBe('ready');
    let reg = readWaveRegistryFile(dir, wave)!;
    const d0 = evaluateWaveBatchGate(reg, keys[0], 1_000, WINDOW);
    writeWaveRegistryFile(dir, d0.reg);
    expect(deriveWaveStatus(readWaveRegistryFile(dir, wave)!)).toBe('dispatching');
    confirmWaveRegistryCall(dir, 'agent-0', path.join(dir, 'agent-0.md'), true);
    expect(deriveWaveStatus(readWaveRegistryFile(dir, wave)!)).toBe('dispatched');
  });
  test('resolveWaveCallKey — the prompt-file sha path + the name-only fallback', () => {
    const dir = tmp();
    const { wave, keys, files } = makeWave(dir, 2);
    const r1 = resolveWaveCallKey(dir, 'agent-0', files[0]);
    expect(r1?.wave).toBe(wave);
    expect(r1?.key).toBe(keys[0]);
    // the wiped-file fallback (the name-only path):
    fs.unlinkSync(files[0]);
    const r2 = resolveWaveCallKey(dir, 'agent-0', files[0]);
    expect(r2?.wave).toBe(wave);
    expect(r2?.key).toBe(keys[0]);
  });
});

describe('THE REGISTRY FILE IO', () => {
  test('createWaveRegistry writes the ready state', () => {
    const dir = tmp();
    const wave = 'wave-' + Date.now();
    createWaveRegistry(dir, wave, 3);
    const reg = readWaveRegistryFile(dir, wave)!;
    expect(reg.wave).toBe(wave);
    expect(reg.total).toBe(3);
    expect(reg.calls).toEqual([]);
    expect(reg.windowStart).toBeNull();
    expect(reg.status).toBe('ready');
  });
});
