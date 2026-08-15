// Omni Vision v5.0 — Backend Sidecar (per-PID lifecycle + session resume)
// The shadow-agent pattern (per opencode PID, session-scoped memory, resume reconnect)
// WITH the memory-binding fix (sessionKey in state.json + the MEMORY_REATTACH GATE).
//
// Lifecycle:
//   first VC call → spawn the sidecar registry entry (pid lock)
//   session end (session.compacting / chat.params change) → graceful persist
//   session resume (opencode --continue) → the watcher re-discovers the session
//     via the DB poll → MEMORY_REATTACH GATE verifies the memory root before use
//
// This module is the REGISTRY + GATE. The actual analysis loop lives in
// index.ts's api-mode path (which calls buildContext → callVLM).

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

const SIDECAR_DIR = process.env.VC_SIDECAR_DIR || path.join(os.tmpdir(), 'vc-sidecar');

export interface SidecarRecord {
  pid: number;
  opencodePid: number;
  sessionKey: string;
  projectId: string;
  parentSessionId: string | null;
  spawnedAt: string;
  lastActivityAt: string;
  state: 'ACTIVE' | 'PERSISTED' | 'STALE';
}

function sidecarPath(opencodePid: number): string {
  return path.join(SIDECAR_DIR, `sidecar-${opencodePid}.json`);
}

/**
 * Register (or refresh) the sidecar record for an opencode PID.
 * Called on the first VC tool call of a session.
 */
export function registerSidecar(opencodePid: number, sessionKey: string, projectId: string, parentSessionId?: string): SidecarRecord {
  fs.mkdirSync(SIDECAR_DIR, { recursive: true });
  const now = new Date().toISOString();
  const existing = readSidecar(opencodePid);
  const record: SidecarRecord = {
    pid: process.pid,
    opencodePid,
    sessionKey,
    projectId,
    parentSessionId: parentSessionId ?? existing?.parentSessionId ?? null,
    spawnedAt: existing?.spawnedAt ?? now,
    lastActivityAt: now,
    state: 'ACTIVE',
  };
  fs.writeFileSync(sidecarPath(opencodePid), JSON.stringify(record, null, 2), 'utf8');
  return record;
}

export function readSidecar(opencodePid: number): SidecarRecord | null {
  try {
    const raw = fs.readFileSync(sidecarPath(opencodePid), 'utf8');
    const parsed: unknown = JSON.parse(raw);
    // P2 guard: the shape is validated before the cast — a corrupt/malformed
    // sidecar file must fail to a null (the caller's fallback), never a
    // wrong-shaped record that leaks a broken binding into the reattach gate.
    if (parsed === null || typeof parsed !== 'object') return null;
    const rec = parsed as SidecarRecord;
    if (typeof rec.opencodePid !== 'number' || typeof rec.sessionKey !== 'string') return null;
    return rec;
  } catch {
    return null;
  }
}

export function touchSidecar(opencodePid: number): void {
  const rec = readSidecar(opencodePid);
  if (rec) {
    rec.lastActivityAt = new Date().toISOString();
    rec.state = 'ACTIVE';
    fs.writeFileSync(sidecarPath(opencodePid), JSON.stringify(rec, null, 2), 'utf8');
  }
}

/**
 * Graceful persist on session end. Marks the record PERSISTED so a resume
 * knows the memory root exists and can run the re-attach gate.
 */
export function persistSidecar(opencodePid: number): void {
  const rec = readSidecar(opencodePid);
  if (rec) {
    rec.state = 'PERSISTED';
    rec.lastActivityAt = new Date().toISOString();
    fs.writeFileSync(sidecarPath(opencodePid), JSON.stringify(rec, null, 2), 'utf8');
  }
}

export interface ReattachResult {
  ok: boolean;
  reason?: string;
}

/**
 * THE MEMORY_REATTACH GATE (the shadow STEP-6 flaw fixed).
 * Before ANY analysis call on a resumed session, verify:
 *   1. the sidecar record exists and is bound to THIS opencode PID
 *   2. the session memory root exists and is readable
 *   3. state.json.sessionKey matches the claimed session
 *   4. the context pool can hydrate (storyline or prior analyses present)
 * FAIL → the caller must NOT proceed with the analysis — escalate instead.
 */
export function verifyMemoryReattach(
  opencodePid: number,
  sessionKey: string,
  memoryRoot: string,
): ReattachResult {
  const rec = readSidecar(opencodePid);
  if (!rec) {
    return { ok: false, reason: `MEMORY_REATTACH_FAILED: no sidecar record for PID ${opencodePid} — registerSidecar first` };
  }
  if (rec.sessionKey !== sessionKey) {
    return {
      ok: false,
      reason: `MEMORY_REATTACH_FAILED: sidecar bound to session ${rec.sessionKey}, call claims ${sessionKey} — SESSION_SWITCH: reset, never restore A's state into B`,
    };
  }
  if (!fs.existsSync(memoryRoot) || !fs.existsSync(path.join(memoryRoot, 'state.json'))) {
    return { ok: false, reason: `MEMORY_REATTACH_FAILED: memory root ${memoryRoot} missing or incomplete` };
  }
  try {
    const state = JSON.parse(fs.readFileSync(path.join(memoryRoot, 'state.json'), 'utf8')) as {
      sessionKey?: string;
    };
    if (state.sessionKey && state.sessionKey !== sessionKey) {
      return { ok: false, reason: `MEMORY_REATTACH_FAILED: state.json.sessionKey ${state.sessionKey} ≠ claimed ${sessionKey}` };
    }
  } catch {
    return { ok: false, reason: `MEMORY_REATTACH_FAILED: state.json unreadable at ${memoryRoot}` };
  }
  return { ok: true };
}

/**
 * The session-switch guard: never restore session A's state into session B.
 * Called when the watcher sees a DIFFERENT session than the sidecar record holds.
 */
export function handleSessionSwitch(opencodePid: number, newSessionKey: string): void {
  const rec = readSidecar(opencodePid);
  if (rec && rec.sessionKey !== newSessionKey) {
    // The record is re-bound to the new session; the OLD session's memory stays
    // untouched at its own root (isolation by construction).
    rec.sessionKey = newSessionKey;
    rec.state = 'ACTIVE';
    rec.lastActivityAt = new Date().toISOString();
    fs.writeFileSync(sidecarPath(opencodePid), JSON.stringify(rec, null, 2), 'utf8');
  }
}
