// ═══ WAVE SPEC-ONLY ENFORCEMENT + AUTO-DISPATCH TESTS (2026-08-22) ═══
//
// TWO LAWS UNDER TEST:
//
// 1. THE ONLY-INPUT-PATH LAW: .trident/wave-spec.json is THE ONLY input for
//    action=generate. The zod schema carries ZERO roster params; the function
//    boundary refuses anything but the spec file (or the internal opts.inlineAgents
//    channel the model can never reach). Verified HERE mechanically:
//    missing file → template created on disk + loud refusal; placeholder file →
//    compiler diagnostics; valid file → generation proceeds + reset-to-template;
//    legacy args.agents shape → REFUSED at the function boundary too.
//
// 2. THE AUTO-DISPATCH LAW: each completed agent dispatches IMMEDIATELY via
//    opts.taskDispatch (background:true, correct subagent_type, DPL1-validated),
//    while the rest of the wave is still generating. Dispatch failures never
//    kill the generation.

// @ts-ignore — bun:test ships the runtime, not TS declarations
import './tracker-test-env.ts';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  createWaveManagerTool, generateWave,
} from '../tools/wave-dispatch.ts';
import { WaveTracker } from '../tools/wave-tracker.ts';

let sandbox = '';
const REAL_CWD = process.cwd();
// bun-types' narrow test() overload lacks the timeout arg — the battery's
// long-running scenarios (the 1-3s dispatch stagger + the trickle sleeps)
// need it; cast once here like the tool-schema boundary does.
const testT = test as unknown as (name: string, fn: () => Promise<void> | void, timeoutMs?: number) => void;

function enterSandbox(): string {
  sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'wave-spec-only-'));
  fs.mkdirSync(path.join(sandbox, '.trident'), { recursive: true });
  process.chdir(sandbox);
  return sandbox;
}

beforeEach(() => {
  WaveTracker.clear();
});

afterEach(() => {
  process.chdir(REAL_CWD);
  WaveTracker.clear();
  try { fs.rmSync(sandbox, { recursive: true, force: true }); } catch (e) { void e; }
});

function specJson(agents: unknown[], expectedCount?: number): string {
  return JSON.stringify(expectedCount ? { expectedCount, agents } : { agents }, null, 2);
}

function validAgent(name: string, template = 'E1') {
  // THE REAL-PATH CONTRACT: validateAgentSpec refuses specs whose filepaths do
  // not exist on THIS machine — so every fixture writes a real file first.
  const fp = path.join(process.cwd(), '.trident', 'fixture-' + name + '.ts');
  fs.mkdirSync(path.dirname(fp), { recursive: true });
  fs.writeFileSync(fp, '// fixture target for ' + name + '\nexport const marker = true;\n');
  return {
    name,
    template,
    filepaths: [fp],
    mission: 'THE MISSION: extract the spec-file enforcement mechanics of the wave manager and report the two-branch structure, the template creation path, and the diagnostics format with file:line anchors. '.repeat(2),
    knownContext: 'THE KNOWN CONTEXT: the wave manager reads .trident/wave-spec.json as its only model-reachable input; validateSpecFile produces compiler-style diagnostics; ensureSpecFile writes the template shell. '.repeat(2),
    doctrine: 'THE DOCTRINE: THE FILES ARE THE ONLY GROUND TRUTH. THE CONTEXT ARGS ARE BELIEF — VERIFY AGAINST THE FILES. A contradiction MUST be flagged, never conformed to. ',
    measurements: 'THE MEASUREMENTS: the two-branch count, the template placeholder fields, the diagnostic line format, each verified against the source. ',
    acceptance: ['the two branches are observable in generateWave', 'the template lands on disk', 'the diagnostics name every thin field'],
    taskTargets: ['WHAT: map the spec resolution branches', 'HOW: cite file:line anchors per claim', 'WHY: anchor without fabrication', 'EXPECTED: filled prompt above floors'],
    position: 'THE POSITION: the battery of the only-input-path enforcement — feeds nothing downstream directly. ',
  };
}

/** A DPL1-valid prompt: 125+ non-empty lines, 3+ abs paths, WHAT×3/EXPECTED×3/
 *  WHY×2, a verification command, zero [FILL:] markers — passes validateTaskPromptLines. */
function dpl1Prompt(seed: string): string {
  const lines: string[] = [
    '# DISPATCH PROMPT — ' + seed,
    '## MISSION: extract the forensic context from the target files and synthesize.',
    '## READING ORDER — read before any execution:',
    '/tmp/wave-spec-only-target-one.ts',
    '/tmp/wave-spec-only-target-two.ts',
    '/home/leviathan/OPENCODE_WORKSPACE/fixtures/target-three.ts',
    '',
  ];
  for (let i = 1; i <= 4; i++) {
    lines.push('### TASK ' + i);
    lines.push('WHAT: map section ' + i + ' of the target with file:line anchors.');
    lines.push('HOW: read the assigned files at 2500 lines per pass; cite every claim.');
    lines.push('WHY: anchored extraction prevents fabricated findings downstream.');
    lines.push('EXPECTED: a dense table with one row per symbol and its line number.');
    lines.push('');
  }
  for (let i = lines.length; i < 130; i++) lines.push('- constraint detail line ' + i + ': do not touch frozen files; verification: grep pattern src/file.ts; sha256sum dist check.');
  lines.push('VERIFICATION: grep -c "anchor" output.md must report >= 40; bun test must stay green.');
  lines.push('RETURN FORMAT: FULL REPORT with per-task verdicts and file:line evidence.');
  return lines.join('\n');
}

function genOk(promptOf: (name: string) => string) {
  return async (spec: { name: string }) => ({ prompt: promptOf(spec.name), notes: ['spec-only-test'] });
}

// ═══ A. THE ONLY-INPUT-PATH ENFORCEMENT ═══

describe('wave-spec-only — THE ONLY INPUT PATH IS THE SPEC FILE', () => {

  test('A1: no spec file anywhere → template CREATED on disk + loud refusal naming the path', async () => {
    const box = enterSandbox();
    let threw = '';
    try {
      await generateWave({}, 'main-a1', { tmpDir: path.join(box, 'tmp'), generator: genOk(() => 'x') });
    } catch (e) { threw = e instanceof Error ? e.message : String(e); }
    expect(threw).toContain('WAVE SPEC TEMPLATE created at');
    // THE TEMPLATE IS PHYSICALLY ON DISK at the sandbox cwd:
    const specPath = path.join(box, '.trident', 'wave-spec.json');
    expect(fs.existsSync(specPath)).toBe(true);
    const onDisk = fs.readFileSync(specPath, 'utf-8');
    expect(onDisk).toContain('[MISSION');
    expect(onDisk).toContain('expectedCount');
    expect(onDisk).toContain('DUPLICATE THIS ENTIRE OBJECT');
  });

  test('A2: placeholder spec file → compiler-style diagnostics listing every unfilled field', async () => {
    const box = enterSandbox();
    // THE REAL TEMPLATE SHELL (what ensureSpecFile writes): every value is a
    // bracketed instruction — validation must flag them as PLACEHOLDERs.
    fs.writeFileSync(path.join(box, '.trident', 'wave-spec.json'),
      JSON.stringify({ expectedCount: '[SET TO NUMBER: total agents in your wave, e.g. 8]', agents: [{ name: '[NAME: e.g. explore-alpha — semantic, lowercase-with-hyphens]' }] }, null, 2));
    let threw = '';
    try {
      await generateWave({}, 'main-a2', { tmpDir: path.join(box, 'tmp'), generator: genOk(() => 'x') });
    } catch (e) { threw = e instanceof Error ? e.message : String(e); }
    expect(threw).toContain('WAVE SPEC VALIDATION');
    expect(threw).toContain('agent-1.name');   // per-agent labeled diagnostics
    expect(threw).toMatch(/mission.*(MISSING|PLACEHOLDER)/);   // the named field + its remedy
    expect(threw).toContain('re-call action=generate');   // the fix instruction
  });

  test('A3: VALID spec file → generation proceeds FROM DISK; after success the file RESETS to template', async () => {
    const box = enterSandbox();
    const specPath = path.join(box, '.trident', 'wave-spec.json');
    // NOTE (2026-08-23): the second agent is E2 not B3 — the template-intent
    // filter REFUSES an extract-flavored mission in a B3 costume now (the
    // filter caught this exact fixture as its first live offender).
    fs.writeFileSync(specPath, specJson([validAgent('disk-a1'), validAgent('disk-d2', 'E2')], 2));
    const result = await generateWave({}, 'main-a3', {
      tmpDir: path.join(box, 'tmp'),
      generator: genOk((n) => dpl1Prompt(n)),
    });
    expect(result.dispatched).toHaveLength(2);
    expect(result.dispatched).toHaveLength(2);
    expect(result.dispatched.map((d: { name: string }) => d.name).sort()).toEqual(['disk-a1', 'disk-d2']);
    // THE LIFECYCLE CLOSE: after success the spec file is back to the clean shell.
    const reset = fs.readFileSync(specPath, 'utf-8');
    expect(reset).toContain('[MISSION');
    expect(reset).not.toContain('disk-a1');
  });

  test('A4: the zod schema carries ZERO roster params — no inline bypass reachable by the model', () => {
    const toolDef = createWaveManagerTool() as unknown as { args: Record<string, unknown> };
    const keys = Object.keys(toolDef.args);
    for (const banned of ['agents', 'agentsJson', 'template', 'filepaths', 'mission',
      'knownContext', 'doctrine', 'measurements', 'acceptance', 'taskTargets',
      'position', 'context', 'outputName']) {
      expect(keys).not.toContain(banned);
    }
    // the control surface survives:
    expect(keys).toContain('action');
    expect(keys).toContain('planningNote');
  });

  test('A5: the LEGACY args.agents shape is DEAD at the FUNCTION boundary — refused, never generated', async () => {
    const box = enterSandbox();
    let threw = '';
    try {
      // the OLD programmatic shape passed as ARGS (what models used to send):
      await generateWave({ agents: [validAgent('legacy-a1')] }, 'main-a5', {
        tmpDir: path.join(box, 'tmp'), generator: genOk(() => dpl1Prompt('x')),
      });
    } catch (e) { threw = e instanceof Error ? e.message : String(e); }
    // NOT a generation — the template-refusal path fired instead:
    expect(threw).toContain('WAVE SPEC TEMPLATE created at');
    expect(fs.existsSync(path.join(box, 'tmp'))).toBe(false);   // no tmp writes = no generation ran
  });

  test('A6: opts.inlineAgents (internal) STILL WORKS for programmatic callers', async () => {
    const box = enterSandbox();
    const result = await generateWave({}, 'main-a6', {
      tmpDir: path.join(box, 'tmp'),
      generator: genOk((n) => dpl1Prompt(n)),
      inlineAgents: [validAgent('internal-a1')],
    });
    expect(result.dispatched).toHaveLength(1);
    expect(result.dispatched[0].name).toBe('internal-a1');
  });
});

// ═══ B. THE ACTION INFERENCE (v2 — zero-input = generate) ═══

describe('wave-spec-only — the action inference v2', () => {

  function getExecute(): (args: Record<string, unknown>, ctx?: unknown) => Promise<unknown> {
    const t = createWaveManagerTool() as unknown as Record<string, unknown>;
    const exec = (t.execute ?? (t.input as Record<string, unknown> | undefined)?.execute) as
      | ((args: Record<string, unknown>, ctx?: unknown) => Promise<unknown>)
      | undefined;
    if (typeof exec !== 'function') throw new Error('test wiring: tool execute not reachable');
    return exec;
  }

  test('B1: action OMITTED + zero management args → inferred generate (template refusal proves the path)', async () => {
    const box = enterSandbox();
    // v2 gate: the WRITTEN WAVE PLAN is the prerequisite — write a minimal one
    // so the inference probe reaches the spec-file refusal (its actual target).
    fs.writeFileSync(path.join(box, '.trident', 'wave-plan.md'), 'WAVES: 1\n# inference probe plan\n');
    const exec = getExecute();
    // planningNote latches the planning gate ACTIVE for this session id.
    let out = '';
    try {
      await exec({ planningNote: 'spec-only inference probe: 1 agent E1 extracting spec mechanics' },
        { sessionID: 'sess-infer-b1', extra: {} });
    } catch (e) { out = e instanceof Error ? e.message : String(e); }
    // generate RAN (no action-mandatory refusal) and hit the spec-file refusal:
    expect(out).toContain('WAVE SPEC TEMPLATE created at');
    expect(fs.existsSync(path.join(box, '.trident', 'wave-spec.json'))).toBe(true);
  });

  test('B2: action OMITTED + sessionId present → AMBIGUOUS loud refusal (no guessing on management verbs)', async () => {
    enterSandbox();
    const exec = getExecute();
    let threw = '';
    try {
      await exec({ sessionId: 'sess-xyz' }, { sessionID: 'sess-infer-b2', extra: {} });
    } catch (e) { threw = e instanceof Error ? e.message : String(e); }
    expect(threw).toContain('AMBIGUOUS');
  });
});

// ═══ C. THE AUTO-DISPATCH MECHANICS ═══

describe('wave-spec-only — AUTO-DISPATCH fires per completed agent', () => {

  testT('C1: per-agent immediate dispatch — correct type, background:true, TRICKLES while wave generates', async () => {
    const box = enterSandbox();
    const calls: Array<{ description: string; subagent_type: string; background?: boolean; at: number }> = [];
    const genResolvedAt: Record<string, number> = {};
    const result = await generateWave({}, 'main-c1', {
      tmpDir: path.join(box, 'tmp'),
      // agent 'slow-e' takes 6s to generate; 'fast-b' resolves instantly.
      // fast-b's worst-case start stagger is 3s (the anti-429 burst split) +
      // an instant generation — so if dispatch trickles per-agent-completion,
      // fast-b ALWAYS dispatches while slow-e is still mid-generation.
      // A post-wave flush would dispatch both AFTER slow-e's 6s — this
      // assertion kills that design dead.
      generator: async (spec: { name: string }) => {
        if (spec.name === 'slow-e') await new Promise((r) => setTimeout(r, 6000));
        genResolvedAt[spec.name] = Date.now();
        return { prompt: dpl1Prompt(spec.name), notes: [] };
      },
      taskDispatch: async (p) => {
        calls.push({ ...p, at: Date.now() });
        return { title: p.description, metadata: {}, output: '', partID: 'p', callID: 'c', sessionId: 'sess-' + p.description };
      },
      inlineAgents: [validAgent('slow-e', 'E1'), validAgent('fast-b', 'B3')],
    });
    // BOTH dispatched, exactly once each:
    expect(calls).toHaveLength(2);
    const byName = Object.fromEntries(calls.map((c) => [c.description, c]));
    // THE TYPE RESOLUTION: E→explore, B→build:
    expect(byName['slow-e'].subagent_type).toBe('trident_explore');
    expect(byName['fast-b'].subagent_type).toBe('trident_build');
    // BACKGROUND: every dispatch rides background:true (never hostiles the orchestrator):
    expect(byName['slow-e'].background).toBe(true);
    expect(byName['fast-b'].background).toBe(true);
    // THE TRICKLE PROOF: fast-b was dispatched before slow-e's generator resolved —
    // dispatch is PER-AGENT-COMPLETION, not a post-wave flush.
    expect(byName['fast-b'].at).toBeLessThan(genResolvedAt['slow-e']);
    // generation itself still reports both agents ready:
    expect(result.dispatched).toHaveLength(2);
    // THE SESSION-ID PROPAGATION (2026-08-23): auto-dispatched children's
    // session ids ride IN the result — the orchestrator sees where each agent
    // landed without a status round-trip; status flips ready→running.
    const dByName = Object.fromEntries(result.dispatched.map((d: { name: string; sessionId: string; status: string }) => [d.name, d]));
    expect(dByName['slow-e'].sessionId).toBe('sess-slow-e');
    expect(dByName['slow-e'].status).toBe('running');
    expect(dByName['fast-b'].sessionId).toBe('sess-fast-b');
    // THE HONEST CHECK-IN: names the AUTO-DISPATCH reality + the ids, never
    // the stale manual action=dispatch instruction.
    expect(result.checkIn).toContain('AUTO-DISPATCHED 2/2');
    expect(result.checkIn).toContain('slow-e→sess-slow-e');
    expect(result.checkIn).not.toContain('DISPATCH via trident-wave-manager action=dispatch');
  }, 20000);

  test('C2: a DPL1-invalid prompt NEVER dispatches — the validation gate holds', async () => {
    const box = enterSandbox();
    const calls: unknown[] = [];
    const result = await generateWave({}, 'main-c2', {
      tmpDir: path.join(box, 'tmp'),
      generator: genOk(() => 'too short — fails every structural marker'),
      taskDispatch: async (p) => { calls.push(p); return { title: '', metadata: {}, output: '', partID: '', callID: '', sessionId: '' }; },
      inlineAgents: [validAgent('gate-hold')],
    });
    expect(calls).toHaveLength(0);          // skipped, not dispatched
    expect(result.dispatched).toHaveLength(1);   // generation itself succeeded
  });

  test('C3: a THROWING taskDispatch never kills the generation', async () => {
    const box = enterSandbox();
    const result = await generateWave({}, 'main-c3', {
      tmpDir: path.join(box, 'tmp'),
      generator: genOk((n) => dpl1Prompt(n)),
      taskDispatch: async () => { throw new Error('runtime exploded mid-dispatch'); },
      inlineAgents: [validAgent('boom-proof')],
    });
    expect(result.dispatched).toHaveLength(1);
    expect(result.failed).toHaveLength(0);
  });
});
