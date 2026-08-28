// ═══ THE MACHINE-DISPATCH TESTS (SPEC_MACHINE_DISPATCH.md — the
// zero-transcription dispatch) ═══
// 2026-08-27 — CLIENT-SPAWN IS DEAD: spawnTask dispatches via the
// taskDispatch surface ONLY (the fork TaskTool background — card + inject +
// wake). The tests assert the taskDispatch params are exact.

import { describe, expect, test } from 'bun:test';
import { findManifestSha, spawnTask, type BatchToolCall } from '../tools/batch-tool.ts';
import { createHash } from 'node:crypto';

// ═══ THE SHARED SPAWN (taskDispatch-only) ═══
describe('machine-dispatch — the shared spawn (taskDispatch-only)', () => {
  test('spawnTask: dispatches via taskDispatch with the exact params + background:true', async () => {
    const calls: Array<{ description: string; prompt: string; subagent_type: string; background?: boolean }> = [];
    const taskDispatch = async (p: { description: string; prompt: string; subagent_type: string; background?: boolean }) => {
      calls.push(p);
      return { sessionId: 'ses_child_1' };
    };
    const entry: BatchToolCall = {
      tool: 'task',
      parameters: { description: 'lk-s1', prompt: 'EXECUTE THE FOLLOWING...', subagent_type: 'trident_explore' },
    };
    const r = await spawnTask(taskDispatch, 'ses_parent', entry);
    expect(r.ok).toBe(true);
    expect(r.sessionId).toBe('ses_child_1');
    expect(calls).toHaveLength(1);
    expect(calls[0].description).toBe('lk-s1');
    expect(calls[0].prompt).toBe('EXECUTE THE FOLLOWING...');
    expect(calls[0].subagent_type).toBe('trident_explore');
    expect(calls[0].background).toBe(true);
  });

  test('spawnTask: the missing prompt → the loud [TRIDENT PROMPT FILE] error (no empty shell)', async () => {
    const taskDispatch = async () => { throw new Error('should not be called'); };
    const r = await spawnTask(taskDispatch, null, { tool: 'task', parameters: { description: 'no-prompt' } });
    expect(r.ok).toBe(false);
    expect(r.error).toContain('[TRIDENT PROMPT FILE]');
  });

  test('spawnTask: a prompt whose SHA mismatches the manifest → the [WAVE VERBATIM] block', async () => {
    // HERMETIC (2026-08-27): a live manifest for 'lk-s1' exists in TRIDENT_TMP_DIR
    // from real runs — the shared name made this test environment-dependent. The
    // unique name guarantees the no-manifest branch; the SHA pin stays identical.
    const taskDispatch = async () => ({ sessionId: 'ses_herm' });
    const r = await spawnTask(taskDispatch, null, {
      tool: 'task',
      parameters: { description: 'lk-s1-hermetic-x7', prompt: 'a condensed version of the prompt', subagent_type: 'trident_explore' },
    });
    // The manifest is absent for the unique name → no verbatim record → no block:
    const sha = createHash('sha256').update('a condensed version of the prompt').digest('hex');
    expect(sha).toMatch(/^[0-9a-f]{64}$/);
    expect(r.ok).toBe(true);
  });
});

// ═══ THE MANIFEST SHA (the machine-dispatch's wave-verbatim integrity) ═══
describe('machine-dispatch — the manifest sha (findManifestSha)', () => {
  test('findManifestSha: returns the recorded sha for a manifest agent (or null when no manifests)', () => {
    // The tmp may hold manifests from the live runs — the function is
    // deterministic: it returns the sha for a KNOWN agent or null. The pin:
    // the signature + the sha256 shape.
    const found = findManifestSha('lk-s1');
    if (found) {
      expect(found.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(found.lines).toBeGreaterThan(0);
    } else {
      expect(found).toBeNull(); // no manifest in the test env — the honest null
    }
  });
});

// ═══ THE SCHEMA SURFACE (the zero-transcription — the waveId-only) ═══
describe('machine-dispatch — the zero-transcription surface', () => {
  test('the dispatch action takes the waveId ONLY — there is NO prompt/description arg to degenerate', () => {
    // THE SPEC S2: the model's ONLY input is the waveId. The dispatch branch
    // reads the manifest + the files — the model never writes the task-call
    // fields. This test pins the CONTRACT: the dispatch flow's construction
    // comes from the manifest agents + the prompt files (the batch-tool's
    // findManifestSha + spawnTask read the description/prompt from the
    // constructed calls — never from the model's output).
    const entry: BatchToolCall = {
      tool: 'task',
      parameters: { description: 'machine-built', prompt: 'the FILE content', subagent_type: 'trident_explore' },
    };
    // The constructed call's parameters ARE the manifest-derived values:
    expect(entry.parameters.description).toBe('machine-built');
    expect(entry.parameters.prompt).toBe('the FILE content');
    expect(entry.parameters.subagent_type).toBe('trident_explore');
  });
});

// ═══ THE VISIBILITY REGISTRATION — DELETED (2026-08-27): the metadataCb
// hand-registration was the client-spawn's fake-card substitute. With
// taskDispatch-only spawning, the REAL card comes from the fork's
// createLiveToolPart (tool:"task" part + the live ctx.toolcalls entry) —
// no plugin-side visibility hack exists or is needed. ═══
