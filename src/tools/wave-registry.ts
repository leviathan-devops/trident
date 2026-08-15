// ═══ THE WAVE-DISPATCH REGISTRY — THE TRANSACTIONAL STATE MACHINE ═══
// (2026-08-12 — BUGREPORT_wave-manager-dispatch-authorization.md: the dispatch
// authorization was recorded at ATTEMPT time and the [WAVE BATCH] gate treated
// "authorization recorded" as "already dispatched" — a runtime-rejected dispatch
// permanently bricked the wave (the ONLY escape was the regenerate, discarding
// the wave identity + re-running the whole shadow generation).)
//
// THE FIX — the registry becomes a STATE MACHINE with per-call statuses:
//
//   WAVE-LEVEL:  ready (generated, no calls) → dispatching (calls recorded,
//                none accepted) → dispatched (at least one call ACCEPTED by
//                the runtime)
//
//   PER-CALL:    recorded (the before-hook appended the authorization —
//                the runtime has NOT yet confirmed) → accepted (the tool.after
//                hook observed the runtime's task_id — the dispatch LANDED)
//                OR failed (the tool.after hook observed a runtime rejection)
//
// THE GATE DECISION (evaluateWaveBatchGate — pure, testable):
//   - 'accepted'  → BLOCK re-fire (the wave agent is dispatched — the re-fire
//                   protection the gate exists for).
//   - 'failed'    → ALLOW (reset to 'recorded') — the prior attempt FAILED;
//                   the re-fire is the sanctioned recovery.
//   - 'recorded' + window OPEN   → BLOCK (the same call re-fired inside the
//                   in-flight window — the double-dispatch protection).
//   - 'recorded' + window EXPIRED → ALLOW (reset + reopen) — the tool.after
//                   never confirmed (the runtime rejected the call BEFORE
//                   execution — the exact bug's case) — the stale auth is
//                   recycled for the re-fire.
//   - NEW key + wave dispatched + window expired → BLOCK (the one-at-a-time
//                   derailment: a real dispatch happened, the window closed,
//                   a NEVER-SEEN agent call arrives — the sequential pattern).
//   - NEW key otherwise → ALLOW (append 'recorded').
//
// THE AFTER-HOOK CONFIRMATION (confirmWaveRegistryCall):
//   - 'recorded' → the call's observed outcome: 'accepted' | 'failed'
//   - 'failed'   → UPGRADE to 'accepted' when the current call succeeded (the
//                   legit re-fire landing after a failed attempt)
//   - 'accepted' → NEVER downgraded (a blocked re-fire's error must not flip
//                   a confirmed dispatch back to re-fireable)
//
// THE RELEASE (releaseWaveRegistryFile — trident-wave-manager action=release):
// the manual safety valve — resets a stuck wave's registry to the ready state
// so the batch can be re-fired WITHOUT regenerating.
//
// The v1 registries (calls: string[]) normalize to v2 on read (every legacy
// key → 'recorded') — an old stuck wave whose after-hook never ran becomes
// re-fireable via the window-expiry path THE MOMENT this code deploys.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import { tridentLog } from '../utils.js';

export type WaveRegistryCallStatus = 'recorded' | 'accepted' | 'failed';
export interface WaveRegistryCall {
  key: string;            // desc + '|' + waveId + '|' + sha256 — the wave-scoped dedupe
  status: WaveRegistryCallStatus;
}
export type WaveRegistryStatus = 'ready' | 'dispatching' | 'dispatched';
export interface WaveRegistry {
  wave: string;
  total: number;
  calls: WaveRegistryCall[];
  windowStart: number | null;   // null until the first dispatch call (the gate opens it)
  status: WaveRegistryStatus;
  derivedFromManifest?: boolean; // 2026-08-15 — the #25 Part-4 flag: the registry was DERIVED from the manifest (the pre-registry-fix wave)
}

export interface GateDecision {
  action: 'allow' | 'block';
  reason: 'accepted' | 'in-flight' | 'partial-expired' | 'new-call' | 'failed-reset' | 'stale-recorded-reset';
  reg: WaveRegistry;          // the mutated registry (the caller writes it back)
}

// THE WAVE-LEVEL STATE DERIVATION (the derived state — never stored disjoint):
export function deriveWaveStatus(reg: WaveRegistry): WaveRegistryStatus {
  for (const c of reg.calls) {
    if (c.status === 'accepted') return 'dispatched';
  }
  return reg.calls.length > 0 ? 'dispatching' : 'ready';
}

// ═══ THE PURE GATE DECISION — the algorithmic decision layer (the ISE law:
// the state machine decides; the regexes below are the mechanical DETECTOR for
// the acceptance probe only, never the gate itself). ═══
export function evaluateWaveBatchGate(
  reg: WaveRegistry,
  callKey: string,
  now: number,
  windowMs: number,
): GateDecision {
  const entry = reg.calls.find((c) => c.key === callKey) ?? null;
  const acceptedCount = reg.calls.filter((c) => c.status === 'accepted').length;
  const windowOpen = typeof reg.windowStart === 'number' && now - reg.windowStart <= windowMs;

  if (entry) {
    if (entry.status === 'accepted') {
      return { action: 'block', reason: 'accepted', reg };
    }
    if (entry.status === 'failed') {
      // THE SANCTIONED RE-FIRE: the prior attempt failed (the after-hook
      // confirmed the runtime rejection). Reset to 'recorded' + reopen the
      // window — the re-fire is the recovery, never the derailment.
      entry.status = 'recorded';
      reg.windowStart = now;
      return { action: 'allow', reason: 'failed-reset', reg };
    }
    // 'recorded':
    if (windowOpen) {
      return { action: 'block', reason: 'in-flight', reg };
    }
    // 'recorded' + window expired — the after-hook NEVER confirmed (the runtime
    // rejected the call BEFORE execution — THE BUG'S EXACT CASE). The stale
    // authorization is recycled: reset + reopen the window for the re-fire.
    entry.status = 'recorded';
    reg.windowStart = now;
    return { action: 'allow', reason: 'stale-recorded-reset', reg };
  }

  // A NEW call (the key never recorded):
  if (acceptedCount > 0 && !windowOpen) {
    // THE ONE-AT-A-TIME DERAILMENT: real dispatches happened (accepted), the
    // window closed, and a NEVER-SEEN agent call arrives — the sequential
    // pattern the [WAVE BATCH] gate exists to block.
    return { action: 'block', reason: 'partial-expired', reg };
  }
  if (reg.calls.length === 0) reg.windowStart = now;   // the window opens on the first dispatch call
  reg.calls.push({ key: callKey, status: 'recorded' });
  reg.status = deriveWaveStatus(reg);
  return { action: 'allow', reason: 'new-call', reg };
}

// ═══ THE FILE IO (the v1→v2 tolerant read) ═══
export function readWaveRegistryFile(tmpDir: string, waveId: string): WaveRegistry | null {
  try {
    const p = path.join(tmpDir, '.wave-registry-' + waveId + '.json');
    if (!fs.existsSync(p)) return null;
    const parsed = JSON.parse(fs.readFileSync(p, 'utf-8')) as {
      wave?: unknown; total?: unknown; calls?: unknown; windowStart?: unknown; status?: unknown;
    };
    const rawCalls = Array.isArray(parsed.calls) ? parsed.calls : [];
    // THE v1→v2 NORMALIZATION: the legacy string[] → every key 'recorded'
    // (the legacy gate's appended keys were NEVER confirmed — the after-hook
    // did not exist — so 'recorded' is the honest state; the window-expiry
    // path recycles them).
    const calls: WaveRegistryCall[] = rawCalls.map((c: unknown) => {
      if (typeof c === 'string') return { key: c, status: 'recorded' as const };
      const o = (c ?? {}) as { key?: unknown; status?: unknown };
      const st = o.status === 'accepted' || o.status === 'failed' ? o.status : 'recorded';
      return { key: typeof o.key === 'string' ? o.key : String(o.key ?? ''), status: st as WaveRegistryCallStatus };
    });
    const reg: WaveRegistry = {
      wave: typeof parsed.wave === 'string' ? parsed.wave : waveId,
      total: typeof parsed.total === 'number' ? parsed.total : calls.length,
      calls,
      windowStart: typeof parsed.windowStart === 'number' ? parsed.windowStart : null,
      status: parsed.status === 'dispatched' || parsed.status === 'dispatching' ? parsed.status : 'ready',
    };
    return reg;
  } catch (e) {
    return null;
  }
}

export function writeWaveRegistryFile(tmpDir: string, reg: WaveRegistry): boolean {
  try {
    const p = path.join(tmpDir, '.wave-registry-' + reg.wave + '.json');
    fs.writeFileSync(p, JSON.stringify(reg, null, 2), 'utf-8');
    return true;
  } catch (e) {
    tridentLog('WARN', 'wave-registry', 'the registry write failed for ' + reg.wave + ': ' + (e instanceof Error ? e.message : String(e)));
    return false;
  }
}

export function createWaveRegistry(tmpDir: string, waveId: string, total: number): WaveRegistry {
  const reg: WaveRegistry = { wave: waveId, total, calls: [], windowStart: null, status: 'ready' };
  writeWaveRegistryFile(tmpDir, reg);
  return reg;
}

// ═══ THE RELEASE — the manual safety valve (trident-wave-manager action=release) ═══
// THE ALIAS RESOLUTION (2026-08-12 — the container red-team's live finding: the
// operator's waveId arg is the ALIAS — the files are named by the GENERATED
// 'wave-<epoch>' id; a release by alias looked for the alias-named registry and
// failed. The manifest now records requestedWaveId (the alias); the release
// resolves the alias → the generated wave id before the registry reset.)
export function resolveReleaseWaveId(tmpDir: string, waveId: string): string | null {
  if (!waveId || waveId.trim().length === 0) return null;
  // 1. THE EXACT REGISTRY FILE (the generated wave id):
  if (fs.existsSync(path.join(tmpDir, '.wave-registry-' + waveId + '.json'))) return waveId;
  // 2. THE ALIAS → MANIFEST RESOLUTION (requestedWaveId === the alias):
  try {
    const files = fs.readdirSync(tmpDir, { withFileTypes: true });
    for (const f of files) {
      if (!f.isFile() || f.name.indexOf('.wave-manifest-') !== 0 || !f.name.endsWith('.json')) continue;
      const waveIdPart = f.name.substring('.wave-manifest-'.length).replace(/\.json$/, '');
      if (!/^wave-\d+$/.test(waveIdPart)) continue;   // the wave-level record only
      const parsed = JSON.parse(fs.readFileSync(path.join(tmpDir, f.name), 'utf-8')) as { wave?: unknown; requestedWaveId?: unknown };
      if (parsed.requestedWaveId === waveId && typeof parsed.wave === 'string') return parsed.wave;
    }
  } catch (e) { /* non-fatal — the exact-path attempt above already failed */ }
  return null;
}

export function releaseWaveRegistryFile(tmpDir: string, waveId: string): WaveRegistry | null {
  try {
    const resolvedWaveId = resolveReleaseWaveId(tmpDir, waveId);
    if (!resolvedWaveId) return null;
    const prior = readWaveRegistryFile(tmpDir, resolvedWaveId);
    const reset: WaveRegistry = {
      wave: resolvedWaveId,
      total: prior ? prior.total : 0,
      calls: [],
      windowStart: null,
      status: 'ready',
    };
    writeWaveRegistryFile(tmpDir, reset);
    tridentLog('INFO', 'wave-registry', 'RELEASE: the wave ' + resolvedWaveId + ' (alias ' + waveId + ') authorization reset to ready (' + (prior ? prior.calls.length : 0) + ' prior call records discarded)');
    return reset;
  } catch (e) {
    tridentLog('WARN', 'wave-registry', 'the release failed for ' + waveId + ': ' + (e instanceof Error ? e.message : String(e)));
    return null;
  }
}

// ═══ THE WAVE/CALL-KEY RESOLUTION (the after-hook side) ═══
// The after-hook sees the task's input args (description + promptFile) — it
// must resolve the wave + the call key WITHOUT the before-hook's sha. Two
// paths: (1) the prompt-file sha (the EXACT match — the file content IS the
// generated prompt, its sha IS the manifest sha), (2) the name-only fallback
// (the first manifest agent with the name — used when the file was wiped).
export function resolveWaveCallKey(tmpDir: string, desc: string, promptFile: string): { wave: string; key: string } | null {
  // 1. THE PROMPT-FILE SHA PATH (exact):
  try {
    if (promptFile && fs.existsSync(promptFile)) {
      const sha = createHash('sha256').update(fs.readFileSync(promptFile, 'utf-8')).digest('hex');
      const rec = findWaveRecordForAgent(tmpDir, desc, sha);
      if (rec) return { wave: rec.wave, key: desc + '|' + rec.wave + '|' + sha };
    }
  } catch (e) { /* fall through to the name path */ }
  // 2. THE NAME-ONLY PATH (the manifest sha):
  try {
    const files = fs.readdirSync(tmpDir, { withFileTypes: true });
    for (const f of files) {
      if (!f.isFile() || f.name.indexOf('.wave-manifest-') !== 0 || !f.name.endsWith('.json')) continue;
      const waveIdPart = f.name.substring('.wave-manifest-'.length).replace(/\.json$/, '');
      if (!/^wave-\d+$/.test(waveIdPart)) continue;
      const parsed = JSON.parse(fs.readFileSync(path.join(tmpDir, f.name), 'utf-8')) as { wave?: unknown; agents?: Array<{ name?: unknown; sha256?: unknown }> };
      const agents = Array.isArray(parsed.agents) ? parsed.agents : [];
      for (const a of agents) {
        if (a.name === desc && typeof a.sha256 === 'string') {
          const wave = typeof parsed.wave === 'string' ? parsed.wave : waveIdPart;
          return { wave, key: desc + '|' + wave + '|' + a.sha256 };
        }
      }
    }
  } catch (e) { /* non-fatal */ }
  return null;
}

function findWaveRecordForAgent(tmpDir: string, desc: string, sha: string): { wave: string } | null {
  try {
    const files = fs.readdirSync(tmpDir, { withFileTypes: true });
    for (const f of files) {
      if (!f.isFile() || f.name.indexOf('.wave-manifest-') !== 0 || !f.name.endsWith('.json')) continue;
      const waveIdPart = f.name.substring('.wave-manifest-'.length).replace(/\.json$/, '');
      if (!/^wave-\d+$/.test(waveIdPart)) continue;
      const parsed = JSON.parse(fs.readFileSync(path.join(tmpDir, f.name), 'utf-8')) as { wave?: unknown; agents?: Array<{ name?: unknown; sha256?: unknown }> };
      const agents = Array.isArray(parsed.agents) ? parsed.agents : [];
      for (const a of agents) {
        if (a.name === desc && a.sha256 === sha) {
          return { wave: typeof parsed.wave === 'string' ? parsed.wave : waveIdPart };
        }
      }
    }
  } catch (e) { /* non-fatal */ }
  return null;
}

// ═══ THE AFTER-HOOK CONFIRMATION ═══
// The tool.after hook for a task call resolves the call key + applies the
// observed outcome. THE GUARDS: an 'accepted' entry is NEVER downgraded (a
// blocked re-fire's error must not flip a confirmed dispatch back to
// re-fireable); a 'failed' entry UPGRADES to 'accepted' when the current call
// succeeded (the legit re-fire landing after a failed attempt — the bug's
// recovery). Returns the confirmed record or null (not a wave call / unknown).
export function confirmWaveRegistryCall(
  tmpDir: string,
  desc: string,
  promptFile: string,
  accepted: boolean | null,
): { wave: string; key: string; status: WaveRegistryCallStatus } | null {
  if (accepted === null) return null;      // the outcome undetermined — leave 'recorded'
  const resolved = resolveWaveCallKey(tmpDir, desc, promptFile);
  if (!resolved) return null;
  const reg = readWaveRegistryFile(tmpDir, resolved.wave);
  if (!reg) return null;
  const entry = reg.calls.find((c) => c.key === resolved.key);
  if (!entry) return null;
  if (entry.status === 'accepted') return null;   // never downgrade a confirmed dispatch
  if (accepted) entry.status = 'accepted';        // 'recorded' → 'accepted'; 'failed' → 'accepted' (the upgrade)
  else if (entry.status === 'recorded') entry.status = 'failed';  // only 'recorded' → 'failed'
  // 'failed' + a failed current call → keep 'failed' (no change needed)
  reg.status = deriveWaveStatus(reg);
  writeWaveRegistryFile(tmpDir, reg);
  return { wave: resolved.wave, key: resolved.key, status: entry.status };
}

// ═══ THE ACCEPTANCE PROBE — the mechanical DETECTOR (the ISE law: the probe
// is the detection layer; the state machine decides; the null outcome falls
// through to 'recorded' + the window-expiry recycling — never a guess). ═══
// A background task call's accepted output carries the runtime's task_id (the
// session id); a rejected call carries an error/block text. The probe unwraps
// the runtime wrapper ({ output: '<string>' } or a string) and classifies.
export function isTaskCallAccepted(raw: unknown): boolean | null {
  let out: unknown = raw;
  if (typeof out === 'string') {
    try { out = JSON.parse(out); } catch (e) { /* keep the raw string */ }
  }
  let text = '';
  if (typeof out === 'string') {
    text = out;
  } else if (out && typeof (out as { output?: unknown }).output === 'string') {
    text = (out as { output: string }).output;
  } else {
    try { text = JSON.stringify(out ?? {}); } catch (e) { text = ''; }
  }
  // ACCEPTED: the runtime's session/task id surfaced (the background dispatch
  // returned the task_id — the acceptance signal).
  if (/(?:ses_[A-Za-z0-9_-]{6,}|"task_id"\s*:|"sessionId"\s*:|"session_id"\s*:)/.test(text)) return true;
  // REJECTED: the runtime/gate rejection text (the env-var demand, the schema
  // error, the firewall block).
  if (/(?:\brequire\b|rejected|\[WAVE BATCH\]|\[WAVE VERBATIM\]|\[TASK FIREWALL\]|invalid|block|error|not supported)/i.test(text)) return false;
  return null;   // the outcome undetermined — leave 'recorded' (the window expiry recycles)
}
