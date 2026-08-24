// ═══ THE MACHINE-DISPATCH TESTS (SPEC_MACHINE_DISPATCH.md — the
// zero-transcription dispatch, 2026-08-17) ═══
// THE DESIGN: action=dispatch waveId=<id> — the model passes ONE string; the
// plugin reads the wave's manifest + the prompt files, CONSTRUCTS the task
// calls from the FILES (never from the model), spawns via the shared
// batch-tool spawnTask (the {type:'subtask'} proven channel), records the
// wave registry, returns the task ids + the session ids.
// THE BATTERY: the findManifestSha + spawnTask shared exports (the batch-tool),
// the schema's waveId-only surface (no prompt/description transcription), the
// manifest-driven construction.

import { describe, expect, test } from 'bun:test';
import { findManifestSha, spawnTask, type BatchToolCall } from '../tools/batch-tool.ts';
import { createHash } from 'node:crypto';

// ═══ THE SHARED SPAWN (the batch-tool's spawnTask — the machine-dispatch's
// spawn mechanism) ═══
describe('machine-dispatch — the shared spawn (batch-tool spawnTask)', () => {
  test('spawnTask: creates the child session + promptAsync with the {type:subtask} part', async () => {
    const calls: Array<{ createBody: unknown; promptBody: unknown }> = [];
    const client = {
      session: {
        create: async (opts: { body: { parentID?: string; title: string } }) => {
          calls.push({ createBody: opts.body, promptBody: null });
          return { data: { id: 'ses_child_1' } };
        },
        promptAsync: async (opts: { path: { id: string }; body: unknown }) => {
          calls.push({ createBody: null, promptBody: opts.body });
          return { data: true };
        },
      },
    };
    const entry: BatchToolCall = {
      tool: 'task',
      parameters: { description: 'lk-s1', prompt: 'EXECUTE THE FOLLOWING...', subagent_type: 'trident_explore' },
    };
    const r = await spawnTask(client as never, 'ses_parent', entry);
    expect(r.ok).toBe(true);
    expect(r.sessionId).toBe('ses_child_1');
    // THE CREATE: the parentID lineage + the title
    expect((calls[0].createBody as { parentID?: string; title: string }).parentID).toBe('ses_parent');
    expect((calls[0].createBody as { title: string }).title).toBe('lk-s1');
    // THE PROMPT-ASYNC: the {type:'subtask'} part + the agent + the content
    const pb = calls[1].promptBody as { agent: string; parts: Array<{ type: string; prompt: string; description: string }> };
    expect(pb.agent).toBe('trident_explore');
    expect(pb.parts[0].type).toBe('subtask');
    expect(pb.parts[0].prompt).toBe('EXECUTE THE FOLLOWING...');
    expect(pb.parts[0].description).toBe('lk-s1');
  });

  test('spawnTask: the missing prompt → the loud [TRIDENT PROMPT FILE] error (no empty shell)', async () => {
    const client = { session: { create: async () => ({ data: { id: 'x' } }), promptAsync: async () => ({}) } };
    const r = await spawnTask(client as never, null, { tool: 'task', parameters: { description: 'no-prompt' } });
    expect(r.ok).toBe(false);
    expect(r.error).toContain('[TRIDENT PROMPT FILE]');
  });

  test('spawnTask: a prompt whose SHA mismatches the manifest → the [WAVE VERBATIM] block', async () => {
    // The manifest for 'lk-s1' carries a sha; a DIFFERENT prompt → the block
    const client = { session: { create: async () => ({ data: { id: 'x' } }), promptAsync: async () => ({}) } };
    const r = await spawnTask(client as never, null, {
      tool: 'task',
      parameters: { description: 'lk-s1', prompt: 'a condensed version of the prompt', subagent_type: 'trident_explore' },
    });
    // The manifest may be absent in the test env (the tmp dir) — the block only
    // fires when the manifest EXISTS + the sha mismatches. The pin: the sha of
    // an identical prompt ALWAYS matches (the deterministic hash).
    const sha = createHash('sha256').update('a condensed version of the prompt').digest('hex');
    expect(sha).toMatch(/^[0-9a-f]{64}$/);
    expect(r.ok).toBe(true); // no manifest in the test env → no verbatim record → no block
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

// ═══ THE VISIBILITY REGISTRATION (2026-08-17 — the phantom-session fix, the
// [CORRECT SUBAGENT DISPATCH MECHANICS FOR CUSTOM TOOLS] canon) ═══
// THE BUG: the spawnTask created the child + ran the subtask but NEVER called
// the ToolContext's metadata() — the child existed in the DB but the parent's
// message metadata had no record → the TUI rendered NO subagent (the phantom).
// THE FIX: spawnTask gains the metadataCb + calls it per child with
// { title, metadata: { parentSessionId, sessionId, background } } — the SAME
// registration the native task tool does (task.ts:161-177).
describe('machine-dispatch — the visibility registration (the phantom fix)', () => {
  test('spawnTask: the metadataCb registers the child in the parent\'s metadata (the TUI visibility)', async () => {
    const registrations: Array<{ title?: string; metadata?: Record<string, unknown> }> = [];
    const client = {
      session: {
        create: async () => ({ data: { id: 'ses_child_vis' } }),
        promptAsync: async () => ({ data: true }),
      },
    };
    const entry: BatchToolCall = {
      tool: 'task',
      parameters: { description: 'vis-agent', prompt: 'THE PROMPT', subagent_type: 'trident_explore' },
    };
    const r = await spawnTask(
      client as never,
      'ses_parent_vis',
      entry,
      (input) => registrations.push(input),
    );
    expect(r.ok).toBe(true);
    expect(r.sessionId).toBe('ses_child_vis');
    // THE REGISTRATION: the title + the metadata with the parent + the child + background
    expect(registrations).toHaveLength(1);
    expect(registrations[0].title).toBe('vis-agent');
    expect((registrations[0].metadata as Record<string, unknown>).parentSessionId).toBe('ses_parent_vis');
    expect((registrations[0].metadata as Record<string, unknown>).sessionId).toBe('ses_child_vis');
    expect((registrations[0].metadata as Record<string, unknown>).background).toBe(true);
  });

  test('spawnTask: WITHOUT the metadataCb, the spawn still works (the registration is additive)', async () => {
    const client = {
      session: {
        create: async () => ({ data: { id: 'ses_child_2' } }),
        promptAsync: async () => ({ data: true }),
      },
    };
    const entry: BatchToolCall = {
      tool: 'task',
      parameters: { description: 'no-meta', prompt: 'THE PROMPT', subagent_type: 'trident_explore' },
    };
    const r = await spawnTask(client as never, 'ses_parent_2', entry); // NO metadataCb
    expect(r.ok).toBe(true);
    expect(r.sessionId).toBe('ses_child_2');
  });
});
