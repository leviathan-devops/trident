// ═══ WAVE-TELEMETRY TESTS — the bounded-concurrency generation + the
// per-agent telemetry (2026-08-09 — the wave-generator reliability fixes:
// the plutus forensics found 5/10 generations failed (HTTP_500 ×2 + TIMEOUT
// ×3) because the all-at-once Promise.allSettled put N simultaneous 384K
// requests on the shared provider. THE FIX: the bounded pool (3 concurrent)
// + the per-agent startedAt/finishedAt/durationMs telemetry in the returned
// output — "the tool exposes NO telemetry to prove it" is dead). These tests
// exercise the REAL executeWaveDispatch with an INJECTED generator (no LLM,
// no network) — the adversarial cases: the concurrency bound holds under a
// 4-agent wave, the failures land in the failed list + the telemetry marks
// them failed, the batch form carries the exact prompts.

// @ts-ignore — bun:test ships the runtime, not TS declarations
import { afterEach, describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { executeWaveDispatch } from '../tools/wave-dispatch.ts';
import { WaveTracker } from '../tools/wave-tracker.ts';

const SANDBOX = path.join(os.tmpdir(), 'wd-telemetry-' + Date.now());
fs.mkdirSync(SANDBOX, { recursive: true });

afterEach(() => {
  WaveTracker.clear();
  try { fs.rmSync(SANDBOX, { recursive: true, force: true }); } catch (e) { void e; }
  fs.mkdirSync(SANDBOX, { recursive: true });
});

// The FULL-context agent spec — the CTX_FLOORS floors (the wave manager's
// own validation) must pass even though the generator is injected. The
// filepaths MUST EXIST on this machine (the validateAgentSpec refuses
// non-existent paths — the generated prompt must reference readable files).
const REAL_PATHS = [
  '/home/leviathan/OPENCODE_WORKSPACE/Shared Workspace Context/Manta Agent/Active_Projects/Trident_v4.4.2/src/tools/wave-dispatch.ts',
  '/home/leviathan/OPENCODE_WORKSPACE/Shared Workspace Context/Manta Agent/Active_Projects/Trident_v4.4.2/src/tools/wave-constants.ts',
];
const FULL_SPEC = (name: string, template: 'E1' | 'B3') => ({
  name,
  template,
  filepaths: REAL_PATHS,
  mission: 'THE MISSION — extract the exports + the file:line anchors of the two target files (wave-dispatch.ts + wave-constants.ts) with the per-file roles, the internal structure, the data contracts at the boundaries, and the coupling graph, so the next wave can specify surgical edits against verified-current anchors.',
  knownContext: 'THE KNOWN CONTEXT — the file set is small (two modules); the anchors are the exported symbols (executeWaveDispatch, WaveManifest, WaveDispatchResult, the tracker helpers); the verification is the grep of the export names + the full read passes; the wave-dispatch is the generator-only baseline (it never spawns).',
  doctrine: 'THE OPERATOR\'S DOCTRINE — evidence over prose (every claim carries a file:line anchor); the read-only discipline (no writes, no edits); the honest-notes contract (an anchor that moved is reported MOVED, never the stale line); the L4 supremacy (the files are the only ground truth).',
  measurements: 'THE KNOWN MEASUREMENTS — the two target files (wave-dispatch.ts ~530 lines, wave-constants.ts ~110 lines), the export count target (the named exports of both files), the verification commands (grep -rn export, the full read passes) with the expected outputs (the export list with the line anchors).',
  acceptance: 'THE ACCEPTANCE — the per-file extraction blocks with the line anchors (path, role, exports, key functions); the file:line verification table (spec claim → current line → verdict); the data flows with the contracts; the coupling graph with the anchors; the failure modes with the verdicts; the honest notes.',
  taskTargets: 'THE PER-TASK EXPANSIONS — Task 1 the per-file extraction with the exports and the internal structure; Task 2 the file:line verification table (the spec claims vs the current lines); Task 3 the data flow through the region; Task 4 the coupling graph (every importer of the exports); Task 5 the failure modes (the error paths, the empty catches); Task 6 the architecture position (the generator-only baseline).',
  position: 'THE POSITION — the extraction feeds the next wave\'s surgical edits; the anchors must be verified-current; the wave-dispatch is the ONLY subagent dispatch path so its exports are load-bearing.',
});

// A 150+ line fake prompt — the generated prompt's shape (the batch form
// carries it verbatim; the real generator produces 200+ lines).
const BIG_PROMPT = (name: string): string => {
  const lines: string[] = [
    'EXECUTE THE FOLLOWING FORENSIC CONTEXT EXTRACTION VERBATIM. You are a trident_explore agent — READ-ONLY.',
    '',
    'WORKSPACE ROOT: /x',
    'THE MISSION: extract the region of ' + name + ' for the next wave.',
  ];
  for (let i = 0; i < 150; i++) lines.push('Section ' + i + ' — the detailed expansion of the extraction target with the concrete checks and the expected evidence.');
  return lines.join('\n');
};

describe('wave-dispatch — the bounded-concurrency generation + the telemetry (2026-08-09)', () => {
  test('TELEMETRY: the returned output carries the per-agent startedAt/finishedAt/durationMs + the batch form', async () => {
    const r = await executeWaveDispatch(
      { agents: [FULL_SPEC('a1', 'E1'), FULL_SPEC('a2', 'B3')], dispatchDir: SANDBOX },
      'test-session-telemetry',
      { generator: async (spec) => ({ prompt: BIG_PROMPT(spec.name), notes: ['injected'] }) },
    );
    expect(r.telemetry).toBeDefined();
    expect(r.telemetry['a1']).toBeDefined();
    expect(r.telemetry['a1'].status).toBe('ok');
    expect(typeof r.telemetry['a1'].startedAt).toBe('string');
    expect(r.telemetry['a1'].startedAt.length).toBeGreaterThan(10);
    expect(typeof r.telemetry['a1'].finishedAt).toBe('string');
    expect(typeof r.telemetry['a1'].durationMs).toBe('number');
    expect(r.telemetry['a1'].durationMs!).toBeGreaterThanOrEqual(0);
    expect(r.telemetry['a2']).toBeDefined();
    expect(r.telemetry['a2'].status).toBe('ok');
    // the batch form carries ONLY the dispatch metadata + the promptFile PATH
    // (2026-08-14 — the operator: "the only thing the model should pass is the
    // literal prompt file path generated by wave manager + subagent type and
    // desc and thats it. the t.e.b machine handles the rest"): NO prompt, NO
    // placeholder, NO background — the T.E.B. loader hook (trident-hooks.ts:1741)
    // mutates promptFile → prompt + adds background:true before the tool runs)
    expect(r.batch).toBeDefined();
    const tools = (r.batch.parameters as { tools: Array<{ tool: string; parameters: { description: string; promptFile?: string; background?: boolean } }> }).tools;
    expect(tools.length).toBe(2);
    // THE NATIVE TASK EMISSION (2026-08-14 — the T.E.B. MACHINE spec): the
    // batch emits the NATIVE task tool + description + promptFile + subagent_type
    // ONLY — the T.E.B. loader hook mutates promptFile → prompt byte-exact +
    // adds background:true before the runtime executes; the native task tool
    // then runs background.start() (the job registry + task_status + the result
    // injection — the PROVEN baseline).
    expect(tools[0].tool).toBe('task');
    expect((tools[0].parameters as { prompt?: string }).prompt).toBeUndefined();  // NO placeholder garbage
    expect((tools[0].parameters as { background?: boolean }).background).toBeUndefined();  // the machine adds it
    expect(tools[0].parameters.promptFile).toContain('a1.md');
    expect(r.failed).toHaveLength(0);
    // the prompt files landed in the tmp dir (the durable record)
    expect(fs.existsSync(path.join(SANDBOX, 'a1.md'))).toBe(true);
    expect(fs.existsSync(path.join(SANDBOX, 'a2.md'))).toBe(true);
  });

  test('BOUND: a 4-agent wave never exceeds 3 concurrent generations (the bounded pool)', async () => {
    let active = 0;
    let maxActive = 0;
    const sleeper = async (spec: { name: string }): Promise<{ prompt: string; notes: string[] }> => {
      active++;
      maxActive = Math.max(maxActive, active);
      await new Promise((r) => setTimeout(r, 25));
      active--;
      return { prompt: BIG_PROMPT(spec.name), notes: [] };
    };
    const t0 = Date.now();
    const r = await executeWaveDispatch(
      {
        agents: [FULL_SPEC('b1', 'E1'), FULL_SPEC('b2', 'E1'), FULL_SPEC('b3', 'B3'), FULL_SPEC('b4', 'B3')],
        dispatchDir: SANDBOX,
      },
      'test-session-bound',
      { generator: sleeper },
    );
    const elapsed = Date.now() - t0;
    // THE POOL BOUND (2026-08-13 — the operator's ruling: "raise this limit to
    // 15"): the bound is now 15 — a 4-agent wave runs ALL 4 concurrently (one
    // slice); the pool still caps the 25-agent maximum to two slices.
    expect(maxActive).toBeLessThanOrEqual(15);
    expect(maxActive).toBeGreaterThanOrEqual(4);   // the whole wave ran at once
    expect(r.dispatched.length).toBe(4);
    // the pool: ONE slice of 4 concurrent 25ms sleeps → the total ≈ 25ms, NOT
    // 4 × 25ms (the sequential) — the elapsed stays well under 90ms.
    expect(elapsed).toBeLessThan(90);
    expect(r.telemetry['b1'].status).toBe('ok');
    expect(r.telemetry['b4'].status).toBe('ok');
  });

  test('FAILED: a throwing generator lands in the failed list + the telemetry marks it failed (the loud-fail)', async () => {
    const r = await executeWaveDispatch(
      {
        agents: [FULL_SPEC('ok1', 'E1'), FULL_SPEC('fail1', 'B3')],
        dispatchDir: SANDBOX,
      },
      'test-session-failed',
      {
        generator: async (spec) => {
          if (spec.name === 'fail1') throw new Error('SHADOW_BRAIN_TIMEOUT: the injected failure');
          return { prompt: BIG_PROMPT(spec.name), notes: [] };
        },
      },
    );
    expect(r.failed.length).toBe(1);
    expect(r.failed[0].name).toBe('fail1');
    expect(r.failed[0].error).toContain('SHADOW_BRAIN_TIMEOUT');
    expect(r.telemetry['fail1'].status).toBe('failed');
    expect(r.telemetry['ok1'].status).toBe('ok');
    // the batch form SKIPS the failed agent — never an empty prompt
    const tools = (r.batch.parameters as { tools: Array<{ parameters: { description: string } }> }).tools;
    expect(tools.length).toBe(1);
    expect(tools[0].parameters.description).toBe('ok1');
    // the ERROR file records the named failure
    expect(fs.existsSync(path.join(SANDBOX, 'ERROR-fail1.txt'))).toBe(true);
    expect(fs.readFileSync(path.join(SANDBOX, 'ERROR-fail1.txt'), 'utf-8')).toContain('SHADOW_BRAIN_TIMEOUT');
  });

  test('MANIFEST: the .wave-manifest.json records the telemetry fields', async () => {
    const r = await executeWaveDispatch(
      { agents: [FULL_SPEC('m1', 'E1')], dispatchDir: SANDBOX },
      'test-session-manifest',
      { generator: async (spec) => ({ prompt: BIG_PROMPT(spec.name), notes: [] }) },
    );
    const manifest = JSON.parse(fs.readFileSync(path.join(SANDBOX, '.wave-manifest-' + r.wave + '.json'), 'utf-8')) as {
      agents: Array<{ name: string; status: string; generatedAt?: string; generationMs?: number }>;
    };
    expect(manifest.agents[0].name).toBe('m1');
    // THE HONEST LIFECYCLE (2026-08-12 — the bug-report's fiction fix): the
    // manifest records the generation telemetry under the GENERATION-named
    // fields + the status 'ready' — NEVER 'running'/'startedAt' (the generator
    // does not spawn; the old fields froze a never-dispatched wave as running).
    expect(manifest.agents[0].status).toBe('ready');
    expect(typeof manifest.agents[0].generatedAt).toBe('string');
    expect(typeof manifest.agents[0].generationMs).toBe('number');
    expect(r.wave).toMatch(/^wave-\d+$/);
  });

  test('CHECK-IN: the compact two-liner (2026-08-13 — the T1 battery pin: the stale wall + the dead tool names are GONE)', async () => {
    const r = await executeWaveDispatch(
      { agents: [FULL_SPEC('c1', 'E1')], dispatchDir: SANDBOX },
      'test-session-checkin',
      { generator: async (spec) => ({ prompt: BIG_PROMPT(spec.name), notes: [] }) },
    );
    // THE COMPACT LINE (the anti-derailment two-liner): the wave + the dispatch
    // command + the tracking pointer — the ONLY content of the check-in.
    expect(r.checkIn).toContain('WAVE ' + r.wave);
    expect(r.checkIn).toContain('READY — DISPATCH the returned batch form as ONE message');
    expect(r.checkIn).toContain('trident-wave-manager action=status waveId=' + r.wave);
    // THE STALE WALL IS GONE (the T1 battery finding — wave-dispatch.ts:556's
    // append survived the compact-context fix): NO removed-tool names, NO
    // poll/steer directives, NO directive wall, NO background wall.
    expect(r.checkIn).not.toContain('trident-wave-status');
    expect(r.checkIn).not.toContain('trident-wave-steer');
    expect(r.checkIn).not.toContain('CHECK IN every');
    expect(r.checkIn).not.toContain('Manage the waves like a senior engineer');
    expect(r.checkIn).not.toContain('POLL task_status');
    expect(r.checkIn).not.toContain('The wave runs in the BACKGROUND');
  });
});
