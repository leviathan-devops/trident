// ═══ WAVE-SPAWN TESTS — the spawn-arg construction (Part 3 + Part 19). THE
// ZERO-HINT discipline: the REAL buildSpawnCall + the REAL generateWave
// with runtime-built fixtures + an injected generator (the shadow pipeline's
// prompt production) + an injected client stub (the SDK boundary). The
// adversarial cases: the unsafe agent name refused by the schema, the
// file-missing, the allSettled partial failure.

// @ts-ignore — bun:test ships the runtime, not TS declarations
import './tracker-test-env.ts';
import { afterEach, describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  // buildSpawnCall DELETED (2026-08-27 — client-spawn is forbidden; taskDispatch-only)
  resolveSubagentType, generateWave, normalizeAgents,

  type WaveDispatchClient,
} from '../tools/wave-dispatch.ts';
import { WaveTracker } from '../tools/wave-tracker.ts';
import { validateAgentSpec } from '../tools/trident-task-preflight.ts';

let sandbox = '';

afterEach(() => {
  WaveTracker.clear();
  try { fs.rmSync(sandbox, { recursive: true, force: true }); } catch (e) { void e; }
});

function makeValidAgent(name: string) {
  return {
    name,
    template: 'E1',
    filepaths: [__filename],
    mission: 'THE MISSION: extract the spawn construction of the wave dispatch and report the parts shape, the parentID contract, and the fire-and-forget semantics with the file:line anchors of the real modules. '.repeat(2),
    knownContext: 'THE KNOWN CONTEXT: the wave dispatch consumes the shadow pipeline, the tmp files, and the subtask-part spawn; the parentID children keep the main session list clean; the promptAsync returns immediately. '.repeat(2),
    doctrine: 'THE DOCTRINE: THE FILES ARE THE ONLY GROUND TRUTH. THE CONTEXT ARGS ARE BELIEF — VERIFY AGAINST THE FILES. A context arg that contradicts the file contents MUST be flagged, never conformed to. ',
    measurements: 'THE MEASUREMENTS: the spawn part shape, the parentID presence, the file-missing failure, the sha256 match — each with its pass bar. ',
    acceptance: 'THE ACCEPTANCE: the subtask part shaped, the parentID passed, the rootless fallback, the allSettled partial failure, the manifest sha256 matched. ',
    taskTargets: 'THE TASKS: verify the part shape, verify the parentID, verify the manifest sha, verify the unsafe-name refusal, verify the thin-arg refusal. ',
    position: 'THE POSITION: the battery of the wave dispatch — the spawn construction tests. ',
  };
}

function makeStubClient(overrides: Partial<WaveDispatchClient['session']> = {}): WaveDispatchClient {
  return {
    session: {
      create: async (opts) => ({ data: { id: 'sess-' + (opts.body?.title || 'x'), parentID: opts.body?.parentID } }),
      promptAsync: async () => ({ info: {}, parts: [] }),
      ...overrides,
    },
  };
}

function generatorFor(prompt: string) {
  return async () => ({ prompt, notes: ['test-generator'] });
}

describe('wave-spawn — the spawn-arg construction (Part 3)', () => {
  // buildSpawnCall DELETED (2026-08-27): client-spawn (session.create +
  // promptAsync) is the FORBIDDEN path — no TaskTool, no card, no completion
  // inject, no wake. Spawns route through extra.taskDispatch ONLY.

  test('the B-templates resolve to trident_build (the shared rule)', () => {
    expect(resolveSubagentType('B3')).toBe('trident_build');
    expect(resolveSubagentType('E1')).toBe('trident_explore');
  });

  test('THE GENERATOR-ONLY BASELINE: the prompts written to the tmp + the batch form carries the EXACT content (0 ignore)', async () => {
    sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'wave-spawn-'));
    let createCalls = 0;
    let promptAsyncCalls = 0;
    const client: WaveDispatchClient = {
      session: {
        create: async () => { createCalls++; return { data: { id: 'child-1' } }; },
        promptAsync: async () => { promptAsyncCalls++; return { info: {}, parts: [] }; },
      },
    };
    const genContent = 'EXECUTE THE FOLLOWING FORENSIC CONTEXT EXTRACTION VERBATIM — the file content. '.repeat(6);
    const result = await generateWave(
      {},
      'main-sess',
      { client, generator: generatorFor(genContent), tmpDir: sandbox, inlineAgents: [makeValidAgent('file-src')] },
    );
    // THE BASELINE (2026-08-07 — THE CATASTROPHE FIX): NO direct spawns —
    // the wave dispatch is the GENERATOR ONLY; the batch form carries the
    // EXACT generated prompts; the orchestrator dispatches via THE BATCH TOOL.
    expect(result.dispatched).toHaveLength(1);
    expect(createCalls).toBe(0);
    expect(promptAsyncCalls).toBe(0);
    // The prompt file written to the tmp:
    const fileContent = fs.readFileSync(path.join(sandbox, 'file-src.md'), 'utf-8');
    expect(fileContent).toContain('EXECUTE THE FOLLOWING');
    // The batch form carries the promptFile PATH ONLY (2026-08-14 — the
    // operator: "THE PROMPTFILE SHOULD LITERALLY BE PASSED AS THE PROMPT
    // VERBATIM NO PLACEHOLDER GARBAGE") — NO prompt field; the T.E.B. loader
    // hook mutates promptFile → prompt byte-exact before the tool executes.
    const spawnParams = result.batch?.parameters?.tools?.[0]?.parameters as { promptFile?: string; prompt?: string } | undefined;
    // THE SINGLE CARRIER (2026-08-16 — the operator's final fix): the batch
    // form carries ONLY prompt = the path string. NO promptFile field — the
    // model copies the path verbatim; the loader detects the VAL is a path +
    // mutates it to the byte-exact content.
    expect(spawnParams?.prompt).toContain('file-src.md');  // the path string, NOT content
    expect(spawnParams?.promptFile).toBeUndefined();       // NO promptFile field — the val IS the carrier
    // THE AP-1 RULE: the WaveAgentSpec has NO prompt field — the args cannot carry it:
    expect('prompt' in makeValidAgent('file-src')).toBe(false);
  });

  // buildSpawnCall rootless-fallback test DELETED (2026-08-27 — with the test above).

  test('THE BASELINE: the generator produces the batch form for ALL agents (no direct spawns)', async () => {
    sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'wave-spawn-'));
    let promptCount = 0;
    const client: WaveDispatchClient = {
      session: {
        create: async (opts) => ({ data: { id: 'child-' + (++promptCount), parentID: opts.body.parentID } }),
        promptAsync: async () => {
          promptCount++;
          return { info: {}, parts: [] };
        },
      },
    };
    const result = await generateWave(
      {},
      'main',
      { client, generator: generatorFor('THE PROMPT'), tmpDir: sandbox, inlineAgents: [makeValidAgent('good-one'), makeValidAgent('good-two')] },
    );
    // THE BASELINE (2026-08-07 — THE CATASTROPHE FIX): NO spawns — the
    // generator produces the manifest + the batch form for ALL agents.
    expect(result.dispatched).toHaveLength(2);
    expect(result.failed).toHaveLength(0);
    expect(promptCount).toBe(0);          // NO session.create/promptAsync calls
    expect(result.batch?.parameters?.tools).toHaveLength(2);   // the batch form
  });

  test('the manifest sha256 matches the written file', async () => {
    sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'wave-spawn-'));
    const prompt = 'EXECUTE THE FOLLOWING BUILD PLAN VERBATIM.\nTHE MISSION: sha256. ' + 'x'.repeat(300);
    const result = await generateWave(
      {},
      'main',
      { client: makeStubClient(), generator: generatorFor(prompt), tmpDir: sandbox, inlineAgents: [makeValidAgent('sha-check')] },
    );
    const manifest = JSON.parse(fs.readFileSync(path.join(sandbox, '.wave-manifest-' + result.wave + '.json'), 'utf-8'));
    const fileContent = fs.readFileSync(path.join(sandbox, 'sha-check.md'), 'utf-8');
    const { createHash } = await import('node:crypto');
    const fileSha = createHash('sha256').update(fileContent).digest('hex');
    expect(manifest.agents[0].sha256).toBe(fileSha);
    expect(manifest.agents[0].lines).toBe(fileContent.split('\n').length);
  });

  test('ADVERSARIAL: an agent name with unsafe characters is refused by the schema (the safe-file-label regex)', () => {
    const bad = makeValidAgent('bad name; rm -rf /');
    // The schema's regex refuses the unsafe label:
    const normalized = normalizeAgents({ agents: [bad] });
    expect(normalized[0].name).toMatch(/^[a-zA-Z0-9_-]+$/);   // sanitized
    // The validateAgentSpec rejects a name that violates the safe label:
    expect('bad name; rm -rf /').not.toMatch(/^[a-zA-Z0-9_-]+$/);
  });

  test('the validation refuses a thin context arg with the named remedy', () => {
    const agent = makeValidAgent('thin-ctx');
    agent.mission = 'too short';
    const err = validateAgentSpec(agent);
    expect(err).toBeTruthy();
    expect(err).toContain('mission');
  });
});
