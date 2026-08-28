// THE SHADOW CAPTURE TESTS (2026-08-26) — v2: the 0-trust audit's closure.
// The FIRST import is the tracker DB isolation (module-body ordering), then
// the capture sandbox env. Tiers verified:
//   1. THE MODULE — timeline rows, transcript sections, no-op safety,
//      retry-append, the delta assembler (v1, kept).
//   2. THE AGENT TIER (NEW) — a REAL ShadowAgent.run with a scripted stream +
//      the REAL pi edit tool: RUN_START, the SYSTEM PROMPT section, the ROUND
//      USER PROMPT section, TOOL CALL/RESULT with full args, ROUND_END, RUN_END.
//   3. THE RUNONE TIER (NEW) — generateWave with inlineAgents + injected
//      generator + taskDispatch: RUN_START → GENERATION_END (sha256) → DPL1
//      passed → TASKDISPATCH_CALL → TASKDISPATCH_RETURN (awaitMs + sessionId)
//      → RUNONE_END dispatched:true. THE RC-2 COLUMNS, mechanically verified.
//   4. THE OWNER GUARD (NEW) — ownerHasRunningAgents: owned+live → true;
//      foreign/default/complete → false.
//   5. THE SLEEP PREDICATE (kept) + the cron fast-tick constant + stop.
import './tracker-test-env.ts';
import { describe, expect, test, beforeEach } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

// THE CAPTURE SANDBOX (before any capture call; captureDir() reads at call time).
const CAP_SANDBOX = path.join(os.tmpdir(), 'trident-capture-it-' + Date.now());
process.env.TRIDENT_SHADOW_CAPTURE_DIR = CAP_SANDBOX;

import {
  beginCapture,
  captureEvent,
  captureSection,
  endCapture,
  captureDir,
  assembleCall,
  writeCallTranscript,
} from '../tools/shadow/capture.ts';
import { blindSleepSeconds } from '../tools/wave-sleep-guard.ts';
import { ShadowAgent } from '../tools/shadow/shadow-agent.ts';
import { generateWave } from '../tools/wave-dispatch.ts';
import { WaveTracker, freshAgentTrack } from '../tools/wave-tracker.ts';
import { ACTIVE_TICK_MS } from '../tools/wave-cron.ts';
import { AssistantMessageEventStream, type AssistantMessage } from '@earendil-works/pi-ai';

function rmSandbox(): void {
  try { fs.rmSync(CAP_SANDBOX, { recursive: true, force: true }); } catch { /* absent */ }
}

// ── the scripted-stream helpers (the shadow-runner.test.ts pattern, compact) ──

function makeBasePartial(modelId: string): AssistantMessage {
  return {
    role: 'assistant',
    api: 'openai-completions',
    provider: 'test',
    model: modelId,
    content: [],
    stopReason: 'stop',
    usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    timestamp: Date.now(),
  } as never;
}

function scriptedEditStream(modelId: string, targetPath: string, oldText: string, newText: string): AssistantMessageEventStream {
  const stream = new AssistantMessageEventStream();
  void (async () => {
    const partial = makeBasePartial(modelId);
    const editArgs = { path: targetPath, edits: [{ oldText, newText }] };
    const content: AssistantMessage['content'] = [
      { type: 'toolCall', id: 'c2', name: 'edit', arguments: editArgs },
    ];
    const withCall: AssistantMessage = { ...partial, content, stopReason: 'toolUse', timestamp: Date.now() };
    stream.push({ type: 'start', partial });
    stream.push({ type: 'toolcall_start', contentIndex: 0, partial: withCall });
    stream.push({ type: 'toolcall_end', contentIndex: 0, toolCall: { id: 'c2', name: 'edit', arguments: editArgs } as never, partial: withCall });
    stream.push({ type: 'done', reason: 'toolUse', message: withCall });
    stream.end(withCall);
  })();
  return stream;
}

function scriptedTextStream(modelId: string, text: string): AssistantMessageEventStream {
  const stream = new AssistantMessageEventStream();
  void (async () => {
    const partial = makeBasePartial(modelId);
    const content: AssistantMessage['content'] = [{ type: 'text', text }];
    const withText: AssistantMessage = { ...partial, content, stopReason: 'stop', timestamp: Date.now() };
    stream.push({ type: 'start', partial });
    stream.push({ type: 'text_start', contentIndex: 0, partial: withText });
    stream.push({ type: 'text_delta', contentIndex: 0, delta: text, partial: withText });
    stream.push({ type: 'text_end', contentIndex: 0, content: text, partial: withText });
    stream.push({ type: 'done', reason: 'stop', message: withText });
    stream.end(withText);
  })();
  return stream;
}

// ── the DPL1-valid prompt (the wave-spec-only.test.ts fixture, verbatim class) ──

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

const REAL_PATHS = [
  '/home/leviathan/OPENCODE_WORKSPACE/Shared Workspace Context/Trident_Agent/Active_Projects/v4.4.2-wave-manager-async/src/tools/wave-dispatch.ts',
  '/home/leviathan/OPENCODE_WORKSPACE/Shared Workspace Context/Trident_Agent/Active_Projects/v4.4.2-wave-manager-async/src/tools/wave-constants.ts',
];
const validAgent = (name: string, template: 'E1' | 'B3' = 'E1') => ({
  name,
  template,
  filepaths: REAL_PATHS,
  mission: 'THE MISSION — extract the exports + the file:line anchors of the two target files with the per-file roles and the coupling graph, so the next wave can specify surgical edits against verified-current anchors.',
  knownContext: 'THE KNOWN CONTEXT — the file set is small (two modules); the anchors are the exported symbols; the verification is the grep of the export names + the full read passes; the wave-dispatch is the generator-only baseline.',
  doctrine: 'THE OPERATOR\'S DOCTRINE — evidence over prose (every claim carries a file:line anchor); the read-only discipline; the honest-notes contract; the L4 supremacy.',
  measurements: 'THE KNOWN MEASUREMENTS — the two target files, the export count target, the verification commands (grep -rn export, the full read passes) with the expected outputs.',
  acceptance: 'THE ACCEPTANCE — the per-file extraction blocks with the line anchors; the file:line verification table; the data flows with the contracts; the coupling graph; the honest notes.',
  taskTargets: 'THE PER-TASK EXPANSIONS — Task 1 the per-file extraction; Task 2 the file:line verification table; Task 3 the data flow; Task 4 the coupling graph; Task 5 the failure modes.',
  position: 'THE POSITION — the extraction feeds the next wave\'s surgical edits; the anchors must be verified-current.',
});

// ═══ 1. THE MODULE TIER (v1, kept) ═══

describe('the shadow capture — module tier', () => {
  beforeEach(rmSandbox);

  test('begin → rows land; end → no more rows; re-begin APPENDS (the retry never destroys attempt #1)', () => {
    const file = beginCapture('w-x-agent-x', 'w-x', 'agent-x');
    expect(file.startsWith(captureDir())).toBe(true);
    captureEvent('w-x-agent-x', 'RUN_START', { name: 'agent-x' });
    captureEvent('w-x-agent-x', 'CHAIN_OK', { rung: 'opencode-go/mimo-v2.5', attempt: 1, events: 24, durS: 8 });
    captureSection('w-x-agent-x', 'SYSTEM PROMPT (full)', 'THE SYSTEM PROMPT BODY', 'markdown');
    endCapture('w-x-agent-x', 'RUNONE_END', { outcome: 'OK' });
    let text = fs.readFileSync(file, 'utf-8');
    expect(text).toContain('| RUN_START |');
    expect(text).toContain('| CHAIN_OK |');
    expect(text).toContain('| RUNONE_END |');
    expect(text).toContain('THE SYSTEM PROMPT BODY');
    const sizeBefore = fs.statSync(file).size;
    captureEvent('w-x-agent-x', 'AFTER_END', { nope: true });
    expect(fs.statSync(file).size).toBe(sizeBefore);
    captureEvent('never-begun-key', 'GHOST', { nope: true });
    beginCapture('w-x-agent-x', 'w-x', 'agent-x');
    captureEvent('w-x-agent-x', 'ROUND_START', { round: 1 });
    endCapture('w-x-agent-x', 'RUNONE_END', { outcome: 'OK', attempt: 2 });
    text = fs.readFileSync(file, 'utf-8');
    expect(text).toContain('## RE-BEGIN (retry pass)');
    expect(text.indexOf('| RUN_START |')).toBeLessThan(text.indexOf('## RE-BEGIN'));
    expect(text).toContain('| ROUND_START |');
  });

  test('the delta assembler + the transcript layers', () => {
    const a = assembleCall([
      { type: 'start' },
      { type: 'thinking_delta', delta: 'plan ' },
      { type: 'thinking_delta', delta: 'the edits' },
      { type: 'text_delta', delta: 'working' },
      { type: 'toolcall_start', toolCallId: 'tc1', toolName: 'edit' },
      { type: 'toolcall_delta', delta: '{"path":"/tmp/x.md","edits":[' },
      { type: 'toolcall_delta', delta: ']}' },
      { type: 'done', message: { content: [] } },
    ]);
    expect(a.reasoning).toBe('plan the edits');
    expect(a.text).toBe('working');
    expect(a.toolCalls.length).toBe(1);
    expect(a.toolCalls[0].args).toBe('{"path":"/tmp/x.md","edits":[]}');
    expect(assembleCall([{ type: 'error', error: { errorMessage: 'boom' } }]).errorText).toBe('boom');

    const file = beginCapture('w-y-agent-y', 'w-y', 'agent-y');
    writeCallTranscript('w-y-agent-y', 'LLM CALL — test OK (3 events, 8s)',
      [{ type: 'thinking_delta', delta: 'reason here' }, { type: 'toolcall_start', toolName: 'edit' }, { type: 'toolcall_delta', delta: '{"a":1}' }],
      { role: 'assistant', content: [{ type: 'text', text: 'full' }], stopReason: 'stop' });
    const text = fs.readFileSync(file, 'utf-8');
    expect(text).toContain('REASONING (assembled from thinking deltas)');
    expect(text).toContain('TOOL CALLS (assembled)');
    expect(text).toContain('RAW DONE-MESSAGE');
    expect(text).toContain('"stopReason": "stop"');
    endCapture('w-y-agent-y', 'DONE', {});
  });
});

// ═══ 2. THE AGENT TIER — a REAL ShadowAgent.run end-to-end (the scripted
//        stream + the REAL pi edit tool executing against the promptFile) ═══

describe('the shadow capture — agent tier (run() → tools → rounds, /export level)', () => {
  beforeEach(rmSandbox);

  test('RUN_START + the system/round sections + the FULL edit args + the results + RUN_END land in the per-agent file', async () => {
    const box = fs.mkdtempSync(path.join(os.tmpdir(), 'cap-agent-tier-'));
    const promptFilePath = path.join(box, 'cap-agent.md');
    fs.writeFileSync(promptFilePath, 'THE SEED LINE TO EDIT\nplus a second line to keep\n', 'utf-8');
    const capKey = 'w-agent-capme';
    beginCapture(capKey, 'w-agent', 'capme');

    const agent = new ShadowAgent(box);
    let call = 0;
    const res = await agent.run({
      promptFilePath,
      systemPrompt: 'THE POLISH DISCIPLINE SYSTEM PROMPT — capture test',
      demand: 'Polish the file: replace the seed line.',
      maxRounds: 1,
      captureKey: capKey,
      streamFn: ((_m: unknown, _c: unknown) => {
        call++;
        return call === 1
          ? scriptedEditStream('cap-test-model', promptFilePath, 'THE SEED LINE TO EDIT', 'THE EDITED LINE — capture proof')
          : scriptedTextStream('cap-test-model', 'DONE');
      }) as never,
    });

    expect(res.errors).toHaveLength(0);
    expect(res.toolCallsMade).toBeGreaterThanOrEqual(1);
    expect(fs.readFileSync(promptFilePath, 'utf-8')).toContain('THE EDITED LINE — capture proof');

    const file = path.join(captureDir(), 'w-agent', 'capme-capture.md');
    expect(fs.existsSync(file)).toBe(true);
    const text = fs.readFileSync(file, 'utf-8');
    // the timeline rows
    expect(text).toContain('| RUN_START |');
    expect(text).toContain('| ROUND_START |');
    expect(text).toContain('| TOOL_CALL |');
    expect(text).toContain('| ROUND_END |');
    expect(text).toContain('| RUN_END |');
    // the transcript sections — the full verbatim layers
    expect(text).toContain('SYSTEM PROMPT (full)');
    expect(text).toContain('THE POLISH DISCIPLINE SYSTEM PROMPT');
    expect(text).toContain('ROUND 1 — USER PROMPT (verbatim)');
    expect(text).toContain('Polish the file: replace the seed line.');
    expect(text).toContain('TOOL CALL — edit (full args)');
    expect(text).toContain('THE SEED LINE TO EDIT');           // the oldText, FULL
    expect(text).toContain('THE EDITED LINE — capture proof'); // the newText, FULL
    expect(text).toContain('TOOL RESULT — edit');
  }, 30000);
});

// ═══ 3. THE RUNONE TIER — generateWave: GENERATION_END → DPL1 → THE RC-2
//        DISPATCH COLUMNS → RUNONE_END (injected generator + taskDispatch) ═══

describe('the shadow capture — runOne tier (the dispatch columns)', () => {
  beforeEach(rmSandbox);

  test('GENERATION_END (sha256) + DPL1 passed + TASKDISPATCH_CALL/RETURN (awaitMs + sessionId) + RUNONE_END dispatched', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cap-runone-'));
    const dispatchedArgs: Array<Record<string, unknown>> = [];
    const r = await generateWave({}, 'cap-runone-session', {
      tmpDir,
      inlineAgents: [validAgent('cap-agent-a')],
      generator: async (spec: { name: string }) => ({ prompt: dpl1Prompt(spec.name), notes: ['capture-it'] }),
      taskDispatch: async (p: Record<string, unknown>) => {
        dispatchedArgs.push(p);
        return { sessionId: 'ses-cap-dispatched' };
      },
    });

    expect(r.dispatched.length).toBe(1);
    expect(r.dispatched[0].sessionId).toBe('ses-cap-dispatched');
    expect(dispatchedArgs.length).toBe(1);
    expect(dispatchedArgs[0].background).toBe(true);

    const file = path.join(captureDir(), r.wave, 'cap-agent-a-capture.md');
    expect(fs.existsSync(file)).toBe(true);
    const text = fs.readFileSync(file, 'utf-8');
    expect(text).toContain('| RUN_START |');
    expect(text).toMatch(/\| GENERATION_END \|.*sha256/);      // the promptFile sha
    expect(text).toMatch(/\| DPL1 \|.*"passed":true/);          // the validation gate
    expect(text).toContain('| TASKDISPATCH_CALL |');            // the RC-2 column t0
    expect(text).toMatch(/\| TASKDISPATCH_RETURN \|.*awaitMs/); // the RC-2 column t1
    expect(text).toContain('ses-cap-dispatched');
    expect(text).toMatch(/\| RUNONE_END \|.*"dispatched":true/);
    // the checkIn carries the auto-dispatch + the orchestration contract
    expect(r.checkIn).toContain('AUTO-DISPATCHED 1/1');
    expect(r.checkIn).toContain('ORCHESTRATION CONTRACT');
  }, 30000);
});

// ═══ 4. THE OWNER GUARD (the sleep guard's c2+c3 source) ═══

describe('ownerHasRunningAgents (the sleep guard query)', () => {
  test('owned + live → true; foreign / default / all-complete → false', () => {
    const wave = 'cap-owner-' + Date.now();
    WaveTracker.registerWave({
      wave,
      ownerSessionId: 'ses-owner-x',
      names: ['a'],
      sessionIds: ['ses-child'],
      dispatchedAt: Date.now(),
      etaMs: 60000,
      etaConfidence: 0,
      agents: { a: freshAgentTrack('ses-child') },
    } as never);
    expect(WaveTracker.ownerHasRunningAgents('ses-owner-x')).toBe(true);   // owned, agent running
    expect(WaveTracker.ownerHasRunningAgents('ses-foreign')).toBe(false);  // not the owner
    expect(WaveTracker.ownerHasRunningAgents('default')).toBe(false);      // never default
    expect(WaveTracker.ownerHasRunningAgents(undefined)).toBe(false);
    // the agent completes + the wave completes → false
    WaveTracker.markComplete(wave, 'a');
    const w = WaveTracker.getWave(wave);
    if (w) w.status = 'complete' as never;
    expect(WaveTracker.ownerHasRunningAgents('ses-owner-x')).toBe(false);
  });
});

// ═══ 5. THE SLEEP PREDICATE + THE CRON CONSTANTS ═══

describe('the blind-sleep predicate + the adaptive cron', () => {
  test('bare + compound + suffix forms; the longest wins; null on non-sleep', () => {
    expect(blindSleepSeconds('sleep 300')).toBe(300);
    expect(blindSleepSeconds('echo hi && sleep 60')).toBe(60);
    expect(blindSleepSeconds('sleep 5m')).toBe(300);
    expect(blindSleepSeconds('sleep 2h')).toBe(7200);
    expect(blindSleepSeconds('sleep 10 && sleep 45')).toBe(45);
    expect(blindSleepSeconds('sleep 45')).toBe(45);            // the sanctioned poll cadence — passes the 60s gate
    expect(blindSleepSeconds('sleep 20')).toBe(20);            // below the gate — passes
    expect(blindSleepSeconds('bun test ./src/')).toBeNull();
    expect(blindSleepSeconds('echo "go to sleep now"')).toBeNull();
  });

  test('the fast tick is live-wave cadence (75s default) + start/stop are idempotent', async () => {
    expect(ACTIVE_TICK_MS).toBe(75000);
    const { startWaveCron, stopWaveCron } = await import('../tools/wave-cron.ts');
    startWaveCron();
    startWaveCron();   // idempotent — no double chain
    stopWaveCron();
    stopWaveCron();    // idempotent — no throw
    startWaveCron();   // restartable
    stopWaveCron();
  });
});
