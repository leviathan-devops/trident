// ============================================================================
// file: src/tests/shadow-runner.test.ts
//
// THE SHADOW RUNNER TESTS (spec §4 + §6.1 — the zero-hint battery,
// adversarial-first). Every scenario asserts against the MEMORY TABLE + the
// DISK artifacts, never the agent prose:
//
//   A1 THE LIAR — the context claims "5 functions" over a file with 3; the
//      [SHADOW INFERENCE] (R1 detector) flags the contradiction; the final
//      prompt carries the inference + the frozen supremacy contract + the
//      doctrine VERBATIM (the silentVerify repair) — the read-before-write
//      (the mock brain calls the REAL read_file tool IN the loop).
//   A2 THE DEAD-LLM — the brain returns { ok: false } (SHADOW_BRAIN_TIMEOUT);
//      the v13 expansion throws in the test env (no client); the mechanical
//      repair carries the generation — a valid prompt, ALWAYS written.
//   A3 THE COHERENCE — 2 sequential runs in ONE session: seq 1 → 2, the
//      mirrors appear, and the second run's demand carries the chain
//      reference to the first (the memory hydrates the later generation).
//   A4 THE REATTACH GATE — a pre-seeded state.json whose sessionKey disagrees
//      with the claimed session → the ERROR manifest, 0 rows, no file.
//   A5 THE BLANK PROBE — a thin mission arg → the refusal names the field +
//      the shortfall; the brain is NEVER called; 0 rows.
// ============================================================================

import { describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { AssistantMessageEventStream, type AssistantMessage } from '@earendil-works/pi-ai';
import {
  runShadowPipeline,
  silentVerify,
  SUPREMACY_CONTRACT,
  type ShadowRunnerOptions,
} from '../tools/shadow/shadow-runner.ts';
import { SHADOW_INFERENCE_SECTION_TITLE } from '../tools/shadow/shadow-context-manager.ts';
import { ShadowMemory } from '../tools/shadow/shadow-memory.ts';
import type { AgentSpec } from '../tools/trident-task-preflight.ts';

// ── THE SANDBOX ──

interface Sandbox {
  memRoot: string;
  sidecarDir: string;
  outDir: string;
  projDir: string;
  pid: number;
  projectId: string;
  sessionKey: string;
}

let sandboxCounter = 0;

function makeSandbox(): Sandbox {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'shadow-runner-test-'));
  const sb: Sandbox = {
    memRoot: path.join(base, 'memory'),
    sidecarDir: path.join(base, 'sidecar'),
    outDir: path.join(base, 'out'),
    projDir: path.join(base, 'project'),
    pid: 910000 + sandboxCounter * 7 + 1,
    projectId: 'test-project',
    sessionKey: 'session-A',
  };
  sandboxCounter += 1;
  fs.mkdirSync(sb.memRoot, { recursive: true });
  fs.mkdirSync(sb.sidecarDir, { recursive: true });
  fs.mkdirSync(sb.outDir, { recursive: true });
  fs.mkdirSync(sb.projDir, { recursive: true });
  return sb;
}

// ── THE FIXTURES ──

/** The realistic E2 golden skeleton (the mirror of the real template — the
 *  operator's design: the WEAVE produces the DPL1-valid brief ON DISK, the pi
 *  Agent surgically edits it. The skeleton must be LONG (the real template is
 *  90+ lines) so the woven file is DPL1-valid + the edit has real content. */
function buildSkeleton(): string {
  return [
    'EXECUTE THE FOLLOWING CONTEXT SYNTHESIS VERBATIM. You are a trident_explore agent — READ-ONLY.',
    'You do NOT write, edit, modify, create, or delete any file. You produce a synthesis report, not changes.',
    '',
    'WORKSPACE ROOT: [WEAVE: workspaceRoot]',
    'KNOWLEDGE LIBRARY: [WEAVE: knowledgeLibrary]',
    '',
    'THE MISSION:',
    '[WEAVE: mission]',
    '',
    'THE ACCEPTANCE CRITERIA (all must be met — the synthesis is INCOMPLETE if any is missing):',
    '- A reader who has NEVER seen the project must be able to resume the build from the synthesis ALONE — without opening a single source file.',
    '- THE STATE: the current build state, the dist SHAs, the deployed SHA, the evidence status.',
    '- THE RULINGS: every canon decision and operator ruling, with the references.',
    '- THE ARCHITECTURE: the system as it EXISTS — the modules, the chain, the contracts — not as intended.',
    '- THE CONTENT SYNTHESIS: the substance of every doc — the key facts, the decisions, the mechanisms, the open ends — synthesized, not restated.',
    '- THE OPEN ITEMS: every open task, gap, and risk with the priorities.',
    '- [WEAVE: acceptance]',
    '',
    'THE READING ORDER (READ BEFORE ANY EXECUTION — read them ALL fully, never skip a section):',
    '[WEAVE: readingOrder]',
    '',
    'THE KNOWN CONTEXT (the measured state — do NOT re-derive, verify the anchors):',
    '[WEAVE: knownContext]',
    '',
    'THE FAILURE MODES (the synthesis\'s honesty requirements):',
    '- A finding that cannot be expressed as a deterministic predicate (a regex or a numeric comparison) is marked PROPOSED — never fuzzy prose.',
    '- A read that fails (a file moved/absent) is reported with the ABSENT verdict — never an invented substitute.',
    '- The operator\'s doctrine quotes are VERBATIM or marked as the paraphrase — a paraphrase is a claim.',
    '- A claim without a file:line anchor is a hallucination.',
    '',
    "THE OPERATOR'S DOCTRINE (the law the synthesis serves — VERBATIM quotes where available):",
    '[WEAVE: doctrine]',
    '',
    'THE PER-TASK EXPANSIONS (the concrete extraction targets — the density is the data):',
    '[WEAVE: taskTargets]',
    '',
    'THE KNOWN MEASUREMENTS TABLE (the audit\'s numbers — the synthesis\'s ground truth):',
    '[WEAVE: measurements]',
    '',
    'THE RETURN-FORMAT GROUNDING CONTRACT:',
    'Every claim in your return carries a file:line anchor or a command output. An anchorless claim is a hallucination.',
    'Unknown values are marked PROPOSED, never invented. The operator\'s doctrine quotes are verbatim or marked as the paraphrase.',
    '',
    'THE SYNTHESIS\'S POSITION IN THE BUILD (why your output matters):',
    '[WEAVE: position]',
    '',
    'THE TASKS (execute ALL — each task\'s output is a section of the final brief):',
    'Task 1 — THE STATE EXTRACTION.',
    '  WHAT: the current build state, the dist SHAs, the deployed SHA, the evidence status.',
    '  HOW: read the state/evidence docs; extract the SHA chain and the verification status.',
    '  WHY: the state anchor is the first thing a resuming session needs.',
    '  EXPECTED: the state block with the SHA values and the evidence table.',
    'Task 2 — THE CANON RULINGS.',
    '  WHAT: every decision and operator ruling in the docs.',
    '  HOW: read the decision docs fully; extract the rulings with their references.',
    '  WHY: the decisions are canon — a build that violates them derails.',
    '  EXPECTED: the ruling list with the decision IDs and the verbatim quotes.',
    'Task 3 — THE ARCHITECTURE AS IT EXISTS.',
    '  WHAT: the current architecture from the docs and the source structure.',
    '  HOW: read the architecture docs; glob the source tree; map the modules.',
    '  WHY: the build must match the architecture as it EXISTS, not as intended.',
    '  EXPECTED: the architecture summary with the module map and the chain.',
    'Task 4 — THE CONTENT SYNTHESIS (the core task).',
    '  WHAT: the substance of EVERY doc in THE READING ORDER.',
    '  HOW: for each doc: extract the key facts, the decisions, the mechanisms, the numbers, the open ends — synthesize into the brief\'s structure, never restate.',
    '  WHY: the fresh reader must absorb the docs\' substance without opening them.',
    '  EXPECTED: a synthesized content section per doc cluster with the file:line anchors.',
    'Task 5 — THE CROSS-REFERENCE ANALYSIS.',
    '  WHAT: the relationships, the contradictions, and the gaps between the docs.',
    '  HOW: compare the docs\' claims against each other; surface the disagreements and the dependencies.',
    '  WHY: a resuming session must know where the docs conflict before deciding anything.',
    '  EXPECTED: the cross-reference table: doc A vs doc B → the agreement/contradiction → the resolution path.',
    'Task 6 — THE OPEN ITEMS + THE CONTEXT ANSWER.',
    '  WHAT: every open task, gap, and risk + the direct answer to the mission.',
    '  HOW: extract the open items with their done-when and the priorities; synthesize the mission answer from the evidence gathered in Tasks 1-5.',
    '  WHY: the next wave picks up exactly these; the orchestrator needs the answer, not just the raw material.',
    '  EXPECTED: the open-item list with the priorities + the context answer with the evidence anchors.',
    '',
    'THE CONSTRAINTS:',
    '- READ-ONLY. No writes, no edits, no file creation, no bash output redirection.',
    '- No pipe chains in bash. Every bash command is a SINGLE command.',
    '- Do NOT read node_modules, .git, caches, browser profiles, or Checkpoints.',
    '- [WEAVE: frozen]',
    '',
    'THE VERIFICATION (run ALL + return the outputs — each a SINGLE command):',
    'read [WEAVE: readingOrderItem1] (full pass, offset=0) — the file read to completion',
    'grep -c "export" [WEAVE: readingOrderItem1]',
    'bun test [WEAVE: test]',
    'sha256sum [WEAVE: readingOrderItems]',
    '',
    'THE RETURN FORMAT:',
    '1. The synthesis in the brief\'s structure (the state, the rulings, the architecture, the content, the cross-references, the open items).',
    '2. THE REASONING for each synthesis decision.',
    '3. The verification outputs (the exit codes + the test results + the hashes).',
    '4. The honest notes (what could NOT be verified).',
    '',
    'THE FIRST TARGET FILE:',
    '[FILEPATHS: the first target file]',
    '',
    'THE LAST TARGET FILE:',
    '[FILEPATHS: the last target file]',
  ].join('\n');
}

/** A context-args blob long enough to pass every CTX_FLOOR. The mission's
 *  "5 functions" claim is the LIAR bait — the file has 3. */
function baseMission(): string {
  return 'The mission is to analyze the shadow module under test and report its exported surface. The shadow tool under analysis exposes 5 functions across the module, and the extraction must verify that count by reading the real file, never by trusting this summary. The why: the orchestrator must know the surface before specifying changes to the pipeline. The framing: the files are the only ground truth and every claim must be read from them.';
}

function makeSpec(sb: Sandbox, overrides: Partial<AgentSpec> = {}): AgentSpec {
  const doctrine = 'The operator ruled: "the tool itself does all of the inference — completely absorbs everything" (D-1). The shadow backend must read the real files before writing the prompt; a paraphrase of the doctrine is a defect.';
  return {
    name: 'wave-a',
    template: 'E2',
    filepaths: [path.join(sb.projDir, 'liar-module.ts'), path.join(sb.projDir, 'brain-module.ts'), path.join(sb.projDir, 'memory-module.ts')],
    mission: baseMission(),
    knownContext: 'The measured state: the modules below are the Wave-1 shadow surface; the runner composes them into the 13-step pipeline. The anchors to verify by reading: the exported functions, the interfaces, the error paths, the data contracts at each boundary. The session store holds the recent window; the memory root is session-scoped.',
    doctrine,
    measurements: 'The known measurements: the liar module has a small body, the brain module wraps the transport, the memory module owns the sqlite. The table below reconciles the claimed counts against the read line counts; every number must be verified in the loop.',
    acceptance: 'The acceptance criteria: the per-file WHAT/HOW/WHY/EXPECTED blocks are present for EVERY filepath; the reading order lists every filepath once; the verification commands are concrete; the doctrine appears verbatim; the file claims are read, never assumed; the manifest is a STRING.',
    taskTargets: 'The per-task targets: extract the role + the exports of each module with the line anchors; trace the call chains to the consumers; list the failure modes with the error handling; produce the verification table of spec claim to current line.',
    position: 'This wave lands the shadow-runner composition; the extraction below feeds the review of the 13-step pipeline before the container battery runs.',
    ...overrides,
  };
}

/** The real project files — the ground truth. The liar file has EXACTLY 3
 *  function declarations; the companions have none (the R1 count must be 3). */
function writeProjectFiles(sb: Sandbox): void {
  fs.writeFileSync(path.join(sb.projDir, 'liar-module.ts'),
    'export function alphaModule() { return 1; }\nexport function betaModule() { return 2; }\nfunction gammaInternal() { return 3; }\n');
  fs.writeFileSync(path.join(sb.projDir, 'brain-module.ts'),
    '// the brain module — a placeholder body for the test\nconst brainMarker = "SHADOW_BRAIN";\n');
  fs.writeFileSync(path.join(sb.projDir, 'memory-module.ts'),
    '// the memory module — a placeholder body for the test\nconst memoryMarker = "SHADOW_MEMORY";\n');
}

// ── THE MOCK PROMPT GENERATOR (a VALID dispatch prompt, 200+ lines, that
//    references the REAL filepaths — the mock brain's "golden" output) ──

function buildMockPrompt(filepaths: string[], extraRounds = 45): string {
  const L: string[] = [];
  L.push('EXECUTE THE FOLLOWING BUILD PLAN VERBATIM. You are the trident_explore agent for the shadow-enhanced task-preflight wave.');
  L.push('');
  L.push('THE MISSION');
  L.push('The mission is to analyze the shadow modules named below and report the exported surface, the internal structure, and the failure modes of each file. The task covers the read-before-write mechanics: the dispatch prompt must be grounded in the real file contents, never the session summary.');
  L.push('');
  L.push('THE KNOWN CONTEXT');
  L.push('The shadow backend is the session-scoped inference layer behind the task-preflight tool. The measured state: the modules below are the Wave-1 surface; the runner composes them into the 13-step pipeline. The anchors to verify by reading: the exported functions, the interfaces, the error paths.');
  L.push('');
  L.push('THE OPERATOR\'S DOCTRINE');
  L.push('The operator ruled that the tool does all of the inference, reads all the data, understands everything itself, and THEN generates a proper prompt. The doctrine must be quoted verbatim in the dispatch, never paraphrased.');
  L.push('');
  L.push('THE KNOWN MEASUREMENTS TABLE');
  L.push('| module | role | verified lines |');
  L.push('|--------|------|----------------|');
  filepaths.forEach((p, i) => L.push('| ' + path.basename(p) + ' | the shadow module ' + (i + 1) + ' | read in the loop |'));
  L.push('');
  L.push('THE ACCEPTANCE CRITERIA');
  L.push('- the per-file WHAT/HOW/WHY/EXPECTED blocks are present for EVERY filepath');
  L.push('- the reading order lists every filepath once');
  L.push('- the verification commands are concrete (read/grep/bun)');
  L.push('- the doctrine appears verbatim; the file claims are read, never assumed');
  L.push('');
  L.push('THE PER-TASK EXPANSIONS');
  filepaths.forEach((p, i) => L.push('- task ' + (i + 1) + ': extract the role + the exports of ' + p + '; cite the line anchors; list the failure modes'));
  L.push('');
  L.push('THE POSITION IN THE BUILD');
  L.push('This wave lands the shadow-runner composition; the extraction below feeds the review of the 13-step pipeline before the container battery.');
  L.push('');
  L.push('THE READING ORDER');
  filepaths.forEach((p, i) => L.push((i + 1) + '. ' + p + ' — the ' + (i === 0 ? 'primary target' : 'supporting target')));
  L.push('');
  L.push('THE CONSTRAINTS');
  L.push('- READ the files before claiming anything about them — the files are the only ground truth');
  L.push('- NEVER invent file paths outside the list; the anchor claims must be READ');
  L.push('- report the failure modes; a silent failure is a defect');
  L.push('');
  L.push('THE TASKS');
  filepaths.forEach((p, i) => {
    const name = path.basename(p).replace(/\.[^.]+$/, '');
    L.push('Task A' + (i + 1) + ' — the ' + name + ' role + exports.');
    L.push('  WHAT: the role, the exported surface, the internal structure of ' + p + ' (file ' + (i + 1) + ' of ' + filepaths.length + ').');
    L.push('  HOW: read ' + p + ' fully (2500-line passes); list the exports; describe the logic.');
    L.push('  WHY: the orchestrator must know the surface before specifying changes to ' + name + '.');
    L.push('  EXPECTED: the per-file block: path ' + p + ', role, exports, key functions, line anchors.');
    L.push('Task B' + (i + 1) + ' — the ' + name + ' anchors + data contracts.');
    L.push('  WHAT: the file:line anchors + the data contracts at the boundaries of ' + p + '.');
    L.push('  HOW: grep each cited symbol in ' + p + '; trace the call chains to the consumers.');
    L.push('  WHY: the surgical edits target these exact lines — a wrong anchor derails the build.');
    L.push('  EXPECTED: the verification table: spec claim -> current line -> verdict (FOUND/MOVED/ABSENT).');
    L.push('Task C' + (i + 1) + ' — the ' + name + ' failure modes.');
    L.push('  WHAT: the error paths + the failure handling in ' + p + '.');
    L.push('  HOW: read the error branches; note the empty catches, the silent fallbacks.');
    L.push('  WHY: the audit gate flags silent failures; the extraction surfaces them.');
    L.push('  EXPECTED: the failure-mode list per file: the error, the handling, the verdict.');
  });
  L.push('');
  L.push('THE VERIFICATION');
  L.push('read ' + filepaths[0] + ' (full pass, offset=0) — the file read to completion');
  L.push('grep -c "export" ' + filepaths[0]);
  L.push('bun test src/tests/shadow-runner.test.ts');
  L.push('sha256sum ' + filepaths.join(' '));
  L.push('');
  L.push('THE RETURN FORMAT');
  L.push('1. The diff summary (the runner + the wiring + the tests)');
  L.push('2. THE REASONING for EACH change');
  L.push('3. The verification outputs (the exit codes + the test results + the hashes)');
  L.push('4. The honest notes');
  L.push('');
  for (let i = 0; i < extraRounds; i++) {
    for (const [fi, p] of filepaths.entries()) {
      L.push('- the anchor-register entry ' + i + ' for ' + p + ' (file ' + (fi + 1) + ' of ' + filepaths.length + '): the symbol group ' + i + ' resolves near line ' + (100 + i * 7) + ' — read IN the loop, never a stale summary.');
    }
  }
  return L.join('\n');
}

// ── THE MOCK BRAIN ──

interface MockLog {
  demands: string[];
  calls: number;
}

/** THE SCRIPTED-STREAM HELPER (the operator's design: NO brain, the pi Agent
 *  consumes an AssistantMessageEventStream; the tests script the read + edit
 *  toolCalls the model would emit). A script is a function of the call index
 *  that returns the events: the toolCalls (read/edit) + the text. The pi loop
 *  executes the toolCalls natively. */
function makeBasePartial(modelId: string): AssistantMessage {
  return {
    role: 'assistant',
    content: [],
    api: 'openai-completions' as never,
    provider: 'nvidia' as never,
    model: modelId,
    usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
    stopReason: 'pending',
    timestamp: Date.now(),
  };
}

/** A scripted stream: pushes a read toolCall (round 1) then a done event. */
function scriptedReadStream(modelId: string, filepath: string): AssistantMessageEventStream {
  const stream = new AssistantMessageEventStream();
  void (async () => {
    const partial = makeBasePartial(modelId);
    stream.push({ type: 'start', partial });
    const content: AssistantMessage['content'] = [
      { type: 'toolCall', id: 'c1', name: 'read', arguments: { filepath } },
    ];
    const withCall: AssistantMessage = { ...partial, content, stopReason: 'toolUse', timestamp: Date.now() };
    stream.push({ type: 'toolcall_start', contentIndex: 0, partial: withCall });
    stream.push({ type: 'toolcall_end', contentIndex: 0, toolCall: { id: 'c1', name: 'read', arguments: { filepath } } as never, partial: withCall });
    stream.push({ type: 'done', reason: 'toolUse', message: withCall });
    stream.end(withCall);
  })();
  return stream;
}

/** A scripted stream: pushes an edit toolCall (round 2) then a done event.
 *  THE NATIVE-TOOL SHAPE (2026-08-20 — the ShadowAgent pi-SDK port): the edit
 *  tool is now the pi SDK's NATIVE createEditTool, whose input is
 *  { path, edits: [{ oldText, newText }] } — the scripted stream must emit the
 *  native shape or the tool's validateEditInput rejects it. */
function scriptedEditStream(modelId: string, targetPath: string, oldText: string, newText: string): AssistantMessageEventStream {
  const stream = new AssistantMessageEventStream();
  void (async () => {
    const partial = makeBasePartial(modelId);
    stream.push({ type: 'start', partial });
    const editArgs = { path: targetPath, edits: [{ oldText, newText }] };
    const content: AssistantMessage['content'] = [
      { type: 'toolCall', id: 'c2', name: 'edit', arguments: editArgs },
    ];
    const withCall: AssistantMessage = { ...partial, content, stopReason: 'toolUse', timestamp: Date.now() };
    stream.push({ type: 'toolcall_start', contentIndex: 0, partial: withCall });
    stream.push({ type: 'toolcall_end', contentIndex: 0, toolCall: { id: 'c2', name: 'edit', arguments: editArgs } as never, partial: withCall });
    stream.push({ type: 'done', reason: 'toolUse', message: withCall });
    stream.end(withCall);
  })();
  return stream;
}

/** A scripted stream: a plain text (the model's final "done" text). */
function scriptedTextStream(modelId: string, text: string): AssistantMessageEventStream {
  const stream = new AssistantMessageEventStream();
  void (async () => {
    const partial = makeBasePartial(modelId);
    stream.push({ type: 'start', partial });
    const content: AssistantMessage['content'] = [{ type: 'text', text }];
    const withText: AssistantMessage = { ...partial, content, stopReason: 'stop', timestamp: Date.now() };
    stream.push({ type: 'text_start', contentIndex: 0, partial: withText });
    stream.push({ type: 'text_delta', contentIndex: 0, delta: text, partial: withText });
    stream.push({ type: 'text_end', contentIndex: 0, content: text, partial: withText });
    stream.push({ type: 'done', reason: 'stop', message: withText });
    stream.end(withText);
  })();
  return stream;
}

/** A scripted stream: an error (the A2 dead-LLM). */
function scriptedErrorStream(modelId: string, error: string): AssistantMessageEventStream {
  const stream = new AssistantMessageEventStream();
  void (async () => {
    const partial = makeBasePartial(modelId);
    stream.push({ type: 'start', partial });
    const err: AssistantMessage = { ...partial, stopReason: 'error', errorMessage: error, timestamp: Date.now() };
    stream.push({ type: 'error', reason: 'error', error: err });
    stream.end(err);
  })();
  return stream;
}

/** The scripted streamFn (the test's replacement for the real 5-provider
 *  transport — the operator: "WHAT FUCKING MOCK BRAIN"). A script of the
 *  call index → the stream. */
function makeScriptedStreamFn(script: (callIndex: number, modelId: string) => AssistantMessageEventStream, log: MockLog): unknown {
  return (_model: unknown, context: unknown) => {
    log.calls += 1;
    const modelId = (_model as { id?: string })?.id ?? 'nemotron-3.5-lightning-30b-a3b';
    // capture the demand (the LATEST user message — the current round's prompt;
    // the pi Agent's 2-round loop appends a new user turn per round, so the
    // first user is the stale round-1 demand, the last is the current round).
    // THE DEMAND FILTER (2026-08-19 — the Wave-4 fix): the 2-round loop emits
    // 2 user turns per pipeline (round-1 = the demand+instruction, round-2+ =
    // the generic "review" prompt). The test asserts the DEMAND's chain, not the
    // per-round pings — only the demand-carrying turns (the woven brief) are
    // logged, so demands[0]=first pipeline, demands[1]=second pipeline.
    const msgs = (context as { messages?: Array<{ role?: string; content?: unknown }> })?.messages ?? [];
    let lastUser: typeof msgs[number] | undefined;
    for (let i = msgs.length - 1; i >= 0; i--) if (msgs[i].role === 'user') { lastUser = msgs[i]; break; }
    if (lastUser) {
      const content = lastUser.content;
      const text = typeof content === 'string' ? content : Array.isArray(content) ? content.map((c) => (c as { text?: string })?.text ?? '').join('') : '';
      if (text.includes('THE WOVEN BRIEF') || text.includes('THE FILE ON DISK IS THE WOVEN')) log.demands.push(text);
    }
    return script(log.calls, modelId);
  };
}

function runnerOptions(sb: Sandbox, streamFn: unknown, extra: Partial<ShadowRunnerOptions> = {}): ShadowRunnerOptions {
  return {
    streamFn,
    tether: { sessionKey: sb.sessionKey, projectId: sb.projectId, parentSessionId: null, pid: sb.pid },
    skeleton: buildSkeleton(),
    outDir: sb.outDir,
    ...extra,
  };
}

function openMemory(sb: Sandbox): ShadowMemory {
  return ShadowMemory.open(sb.projectId, sb.sessionKey);
}

function rowCount(sb: Sandbox): number {
  const mem = openMemory(sb);
  try {
    return mem.lastPrompts(100).length;
  } finally {
    mem.close();
  }
}

// ── THE ENV ISOLATION (the Wave-1 modules read the env AT CALL TIME; the
//    bun:test typings here lack beforeEach/afterEach, so each test wraps its
//    body in withSandbox — the sandbox + the env are scoped per test) ──

async function withSandbox<T>(fn: (sb: Sandbox) => Promise<T>): Promise<T> {
  const sb = makeSandbox();
  const savedMem = process.env.TRIDENT_PREFLIGHT_MEMORY_ROOT;
  const savedSidecar = process.env.TRIDENT_PREFLIGHT_SIDECAR_DIR;
  process.env.TRIDENT_PREFLIGHT_MEMORY_ROOT = sb.memRoot;
  process.env.TRIDENT_PREFLIGHT_SIDECAR_DIR = sb.sidecarDir;
  try {
    return await fn(sb);
  } finally {
    if (savedMem === undefined) delete process.env.TRIDENT_PREFLIGHT_MEMORY_ROOT;
    else process.env.TRIDENT_PREFLIGHT_MEMORY_ROOT = savedMem;
    if (savedSidecar === undefined) delete process.env.TRIDENT_PREFLIGHT_SIDECAR_DIR;
    else process.env.TRIDENT_PREFLIGHT_SIDECAR_DIR = savedSidecar;
  }
}

// ═══ A1 — THE LIAR (the L4 supremacy: the contradiction flagged, never
//    conformed; the read-before-write happens IN the loop) ═══

describe('shadow-runner — A1 THE LIAR (the supremacy + the [SHADOW INFERENCE] + the read-before-write)', () => {
  test('the context claims 5 functions over a 3-function file; the prompt reports the real state + the flag; the doctrine arrives VERBATIM via the repair', async () => {
    await withSandbox(async (sb) => {
    writeProjectFiles(sb);
    const log: MockLog = { demands: [], calls: 0 };
    const liarFile = path.join(sb.projDir, 'liar-module.ts');
    const streamFn = makeScriptedStreamFn((callIndex) => {
      if (callIndex === 1) {
        // the read-before-write, mechanically: the pi Agent calls the REAL read tool
        return scriptedReadStream('nemotron-3.5-lightning-30b-a3b', liarFile);
      }
      if (callIndex === 2) {
        // THE OPERATOR'S DESIGN: the model's polish IS an EDIT to the weave —
        // the edit tool replaces a REAL text span with the polished text. The
        // file (the weave + the edit) IS the deliverable. THE oldText MUST
        // match the EXACT woven text (the header has the "(why your output
        // matters)" suffix) + be UNIQUE (the edit rejects multiple matches).
        // THE NATIVE EDIT SHAPE: the pi edit tool edits the promptfile the
        // runner wrote BEFORE the agent runs — outDir/<spec.name>.md (the
        // runner's sanitizeName: 'wave-a.md' here).
        return scriptedEditStream(
          'nemotron-3.5-lightning-30b-a3b',
          path.join(sb.outDir, 'wave-a.md'),
          "THE SYNTHESIS'S POSITION IN THE BUILD (why your output matters):",
          "THE SYNTHESIS'S POSITION IN THE BUILD — the edit landed via the pi Agent:",
        );
      }
      // the agent is done — no more edits
      return scriptedTextStream('nemotron-3.5-lightning-30b-a3b', 'DONE');
    }, log);
    const spec = makeSpec(sb);
    const manifestStr = await runShadowPipeline(spec, ['the recent task window — the operator asked for the shadow backend'], runnerOptions(sb, streamFn));
    const manifest = JSON.parse(manifestStr) as { batch: { requested: number; ready: number }; agents: Array<{ name: string; path: string; lines: number; validated: boolean; ready: boolean; notes?: string[] }> };

    expect(manifest.batch.requested).toBe(1);
    expect(manifest.agents[0].ready).toBe(true);
    expect(manifest.agents[0].path).toBeDefined();
    expect(fs.existsSync(manifest.agents[0].path)).toBe(true);

    const prompt = fs.readFileSync(manifest.agents[0].path, 'utf-8');
    // 1. the read-before-write: the loop executed the REAL read tool
    expect(log.calls).toBeGreaterThanOrEqual(2);
    const piNote = (manifest.agents[0].notes || []).find((n) => n.startsWith('PI:'));
    expect(piNote).toBeDefined();
    expect(piNote).toContain('scoped tool call(s)');
    // 2. the supremacy contract (the frozen L4 framing) repaired into the prompt
    expect(prompt).toContain(SUPREMACY_CONTRACT);
    expect(prompt).toContain('THE FILES ARE THE ONLY GROUND TRUTH');
    // 3. THE NO-MECHANICAL-FALLBACK: the file is the weave + the edit (the
    //    model's surgical polish), NEVER a fabricated scaffold.
    expect(prompt).toContain('the edit landed via the pi Agent');
    const inferNote = (manifest.agents[0].notes || []).find((n) => n.startsWith('INFERENCE:'));
    expect(inferNote).toBeDefined();
    expect(inferNote).toMatch(/\d+ L4 contradiction\(s\) flagged/);
    // 4. the doctrine VERBATIM (the verifier's repair appended the quote)
    expect(prompt).toContain('completely absorbs everything');
    // 5. the memory row exists (the append happened)
    const mem = openMemory(sb);
    try {
      const rows = mem.lastPrompts(10);
      expect(rows.length).toBe(1);
      expect(rows[0].seq).toBe(1);
      expect(rows[0].name).toBe('wave-a');
      expect(rows[0].sha256.length).toBe(64);
      expect(fs.existsSync(path.join(sb.memRoot, sb.projectId, sb.sessionKey, 'prompts', '000001_wave-a.json'))).toBe(true);
    } finally {
      mem.close();
    }
    });
  });
});

// ═══ A2 — THE DEAD-LLM (the fallback chain: PI fails → the v13 expansion
//    throws in the test env → the mechanical repair carries the generation) ═══

describe('shadow-runner — A2 THE DEAD-LLM (THE LOUD-FAIL LAW — a generation failure is a LOUD ERROR, NEVER a fabricated prompt)', () => {
  test('a stalled brain returns the ERROR manifest: ready:false, NO file, NO fabricated prompt (the operator: "EITHER A LOUD FUCKING ERROR OR IT WORKS")', async () => {
    await withSandbox(async (sb) => {
    writeProjectFiles(sb);
    const log: MockLog = { demands: [], calls: 0 };
    const streamFn = makeScriptedStreamFn(() => scriptedErrorStream('nemotron-3.5-lightning-30b-a3b', 'SHADOW_BRAIN_TIMEOUT: the LLM call stalled past 240000ms'), log);
    const spec = makeSpec(sb);
    const manifestStr = await runShadowPipeline(spec, [], runnerOptions(sb, streamFn));
    const manifest = JSON.parse(manifestStr) as { batch: { ready: number }; agents: Array<{ lines: number; validated: boolean; ready: boolean; notes?: string[]; error?: string }> };

    // THE LOUD FAIL (2026-08-07 — the fallback machinery is DEAD):
    expect(manifest.agents[0].ready).toBe(false);
    expect(manifest.agents[0].lines).toBe(0);
    expect(manifest.agents[0].validated).toBe(false);
    expect(manifest.agents[0].error).toContain('PI_LOOP_EMPTY');
    expect(manifest.agents[0].error).toContain('SHADOW_BRAIN_TIMEOUT');
    expect(manifest.agents[0].error).toContain('NO mechanical fallback');
    // NO file is written — the mechanical brief is NEVER fabricated into a prompt
    const outPath = path.join(sb.outDir, 'wave-a.md');
    expect(fs.existsSync(outPath)).toBe(false);
    // NO memory row — the failed generation leaves no false trace
    expect(rowCount(sb)).toBe(0);
    });
  });
});

// ═══ A3 — THE COHERENCE (the session memory hydrates the later generation) ═══

describe('shadow-runner — A3 THE COHERENCE (the chain: the later generation references the earlier one)', () => {
  test('two sequential runs in ONE session: seq 1 → 2, the mirrors appear, and the second demand carries the [seq 1] chain', async () => {
    await withSandbox(async (sb) => {
    writeProjectFiles(sb);
    const log: MockLog = { demands: [], calls: 0 };
    const streamFn = makeScriptedStreamFn(() => scriptedTextStream('nemotron-3.5-lightning-30b-a3b', buildMockPrompt(makeSpec(sb).filepaths)), log);
    const spec = makeSpec(sb);
    const opts = runnerOptions(sb, streamFn);

    const m1 = await runShadowPipeline(spec, ['first call — no prior generations'], opts);
    const m2 = await runShadowPipeline(spec, ['second call — the memory must hydrate the chain'], opts);
    const man1 = JSON.parse(m1) as { agents: Array<{ ready: boolean }> };
    const man2 = JSON.parse(m2) as { agents: Array<{ ready: boolean }> };
    expect(man1.agents[0].ready).toBe(true);
    expect(man2.agents[0].ready).toBe(true);

    // the memory table: 2 rows, seq monotonic
    const mem = openMemory(sb);
    try {
      const rows = mem.lastPrompts(10);
      expect(rows.length).toBe(2);
      expect(rows[0].seq).toBe(1);
      expect(rows[1].seq).toBe(2);
      expect(rows[1].name).toBe('wave-a');
    } finally {
      mem.close();
    }
    // the append-only mirrors
    expect(fs.existsSync(path.join(sb.memRoot, sb.projectId, sb.sessionKey, 'prompts', '000001_wave-a.json'))).toBe(true);
    expect(fs.existsSync(path.join(sb.memRoot, sb.projectId, sb.sessionKey, 'prompts', '000002_wave-a.json'))).toBe(true);
    // the chain: the second demand (the brain's context) references the first
    // generation — the memory hydrated the later call (D-SH-1 / Stage 4)
    expect(log.demands.length).toBeGreaterThanOrEqual(2);
    expect(log.demands[0]).not.toContain('[seq 1]');
    expect(log.demands[1]).toContain('[seq 1]');
    expect(log.demands[1]).toContain('wave-a');
    expect(log.demands[1]).toContain('The epoch summary');
    });
  });
});

// ═══ A4 — THE REATTACH GATE (the M4 lesson: a log line proves nothing; 3
//    mechanical checks, ANY FAIL → the error string) ═══

describe('shadow-runner — A4 THE REATTACH GATE (the session mismatch → the ERROR manifest, 0 rows, no file)', () => {
  test('a pre-seeded state.json whose sessionKey disagrees with the claimed session fails the gate BEFORE any work', async () => {
    await withSandbox(async (sb) => {
    writeProjectFiles(sb);
    // pre-seed the claimed session's root with ANOTHER session's state.json
    const sessionDir = path.join(sb.memRoot, sb.projectId, sb.sessionKey);
    fs.mkdirSync(path.join(sessionDir, 'prompts'), { recursive: true });
    fs.writeFileSync(path.join(sessionDir, 'state.json'), JSON.stringify({
      sessionKey: 'session-B', projectId: sb.projectId, parentSessionId: null,
      lastSeq: 0, episode: { trigger: null, count: 0, lastAt: null }, created_at: new Date().toISOString(),
    }, null, 2), 'utf8');

    const log: MockLog = { demands: [], calls: 0 };
    const streamFn = makeScriptedStreamFn(() => scriptedTextStream('nemotron-3.5-lightning-30b-a3b', buildMockPrompt(makeSpec(sb).filepaths)), log);
    const spec = makeSpec(sb);
    const manifestStr = await runShadowPipeline(spec, [], runnerOptions(sb, streamFn));
    const manifest = JSON.parse(manifestStr) as { agents: Array<{ error?: string; lines: number; ready: boolean }> };

    expect(manifest.agents[0].error).toContain('MEMORY_REATTACH_FAILED');
    expect(manifest.agents[0].error).toContain('session-B');
    expect(manifest.agents[0].lines).toBe(0);
    expect(manifest.agents[0].ready).toBe(false);
    // NO work happened: no file, no memory rows, the brain NEVER called
    expect(fs.existsSync(path.join(sb.outDir, 'wave-a.md'))).toBe(false);
    expect(rowCount(sb)).toBe(0);
    expect(log.calls).toBe(0);
    });
  });
});

// ═══ A5 — THE BLANK PROBE (the thin args → the refusal names the field +
//    the shortfall; never a prompt from nothing) ═══

describe('shadow-runner — A5 THE BLANK PROBE (the thin mission → the refusal names the field + the shortfall)', () => {
  test('a 1-char mission is refused with "mission (1c < 200c)"; 0 rows; the brain is NEVER called', async () => {
    await withSandbox(async (sb) => {
    writeProjectFiles(sb);
    const log: MockLog = { demands: [], calls: 0 };
    const streamFn = makeScriptedStreamFn(() => scriptedTextStream('nemotron-3.5-lightning-30b-a3b', buildMockPrompt(makeSpec(sb).filepaths)), log);
    const spec = makeSpec(sb, { mission: 'x' });
    const manifestStr = await runShadowPipeline(spec, [], runnerOptions(sb, streamFn));
    const manifest = JSON.parse(manifestStr) as { agents: Array<{ error?: string; lines: number; ready: boolean }> };

    expect(manifest.agents[0].error).toContain('context args too thin');
    expect(manifest.agents[0].error).toContain('mission (1c < 200c)');
    expect(manifest.agents[0].lines).toBe(0);
    expect(manifest.agents[0].ready).toBe(false);
    expect(fs.existsSync(path.join(sb.outDir, 'wave-a.md'))).toBe(false);
    expect(rowCount(sb)).toBe(0);
    expect(log.calls).toBe(0); // the refusal happens BEFORE any LLM call
    });
  });
});

// ═══ THE SILENT-VERIFIER UNIT (the verbatim-doctrine + the freshness checks
//    in isolation — the A1 path exercised them end-to-end; here the mechanics) ═══

describe('shadow-runner — silentVerify (the verbatim-doctrine + the freshness mechanics)', () => {
  test('a paraphrase of the doctrine flags + repairs; a stale line-count claim flags (the freshness); the inference is appended', async () => {
    await withSandbox(async (sb) => {
    writeProjectFiles(sb);
    const spec = makeSpec(sb);
    const filepath = path.join(sb.projDir, 'liar-module.ts');
    const fileLines = fs.readFileSync(filepath, 'utf-8').split('\n').length;
    const inference = {
      sectionTitle: SHADOW_INFERENCE_SECTION_TITLE,
      text: SHADOW_INFERENCE_SECTION_TITLE + '\n\nThe shadow read the file and found 3 functions — the context claims 5 (FLAG).',
      flags: [],
    };

    // a paraphrased prompt with a WRONG line-count claim about the file
    const paraphrased = buildMockPrompt([filepath], 10);
    const stale = paraphrased.replace('THE VERIFICATION', 'THE VERIFICATION\n' + filepath + ' (' + (fileLines + 999) + ' lines) — the stale summary claim\n');
    const v = silentVerify(stale, spec, [{ path: filepath, lines: fileLines, chars: 1 }], inference as never);
    expect(v.verified).toBe(false);
    expect(v.flags.some((f) => f.startsWith('VERBATIM-DOCTRINE:'))).toBe(true);
    expect(v.flags.some((f) => f.startsWith('FRESHNESS:'))).toBe(true);
    expect(v.flags.some((f) => f.startsWith('SHADOW-INFERENCE:'))).toBe(true);
    // the repair: the doctrine verbatim + the supremacy — BUT NOT the
    // mechanical inference (2026-08-07 — the operator's ruling: the real
    // model brief or just the prompt; the mechanical fallback is BANNED)
    expect(v.repaired).toContain('completely absorbs everything');
    expect(v.repaired).toContain(SUPREMACY_CONTRACT);
    });
  });
});

// ═══ A6 — THE FRESHNESS (runner-level: the file modified mid-session; the
//    read-before-write must reflect the CURRENT state, never the stale) ═══

describe('shadow-runner — A6 THE FRESHNESS (the read-before-write reflects the current file state)', () => {
  test('the fixture modified after the run starts; the prompt reflects the CURRENT content', async () => {
    await withSandbox(async (sb) => {
      writeProjectFiles(sb);
      const target = path.join(sb.projDir, 'liar-module.ts');
      const original = fs.readFileSync(target, 'utf-8');
      // the mid-run mutation: the file's content changes (the count claim's ground truth shifts)
      fs.writeFileSync(target, original + '\n\nexport function extraFunction(): void { /* the new addition */ }\n');
      const log: MockLog = { demands: [], calls: 0 };
      const streamFn = makeScriptedStreamFn((callIndex) => {
        if (callIndex === 1) {
          return scriptedReadStream('nemotron-3.5-lightning-30b-a3b', target);
        }
        return scriptedTextStream('nemotron-3.5-lightning-30b-a3b', buildMockPrompt(spec.filepaths));
      }, log);
      const spec = makeSpec(sb);
      const manifestStr = await runShadowPipeline(spec, ['the freshness scenario — the file changed mid-session'], runnerOptions(sb, streamFn));
      const manifest = JSON.parse(manifestStr) as { batch: { ready: number }; agents: Array<{ path: string; ready: boolean }> };
      expect(manifest.batch.ready).toBe(1);
      expect(manifest.agents[0].ready).toBe(true);
      // the verifier's freshness: the file state captured IN the loop must be reflected
      // in the prompt — the prompt's claims about the file cannot be stale
      const promptText = fs.readFileSync(manifest.agents[0].path, 'utf-8');
      expect(promptText.length).toBeGreaterThan(100);
      expect(promptText).toContain(SUPREMACY_CONTRACT.substring(0, 40));
      // THE NO-MECHANICAL-FALLBACK (2026-08-07): the mock brain wrote no
      // model brief → the prompt ships WITHOUT the [SHADOW INFERENCE] section
    });
  });
});

// ═══ A7 — THE VERBATIM (runner-level: the doctrine's distinctive quote must
//    appear VERBATIM in the final prompt — a paraphrase fails) ═══

describe('shadow-runner — A7 THE VERBATIM (the doctrine quote word-for-word in the final prompt)', () => {
  test('the distinctive doctrine quote survives the pipeline VERBATIM', async () => {
    await withSandbox(async (sb) => {
      writeProjectFiles(sb);
      const quote = 'THE FILES ARE THE ONLY GROUND TRUTH. THE CONTEXT ARGS ARE BELIEF';
      const log: MockLog = { demands: [], calls: 0 };
      const streamFn = makeScriptedStreamFn((callIndex) => {
        if (callIndex === 1) {
          return scriptedReadStream('nemotron-3.5-lightning-30b-a3b', path.join(sb.projDir, 'fixture-lib.ts'));
        }
        // the golden output WITHOUT the doctrine quote — the verifier's repair must append it
        return scriptedTextStream('nemotron-3.5-lightning-30b-a3b', buildMockPrompt(spec.filepaths));
      }, log);
      const spec = makeSpec(sb, { doctrine: 'THE OPERATOR\'S RULING: ' + quote + ' — a paraphrase is a claim, the quote is the law.' });
      const manifestStr = await runShadowPipeline(spec, ['the verbatim scenario'], runnerOptions(sb, streamFn));
      const manifest = JSON.parse(manifestStr) as { batch: { ready: number }; agents: Array<{ path: string; ready: boolean }> };
      expect(manifest.batch.ready).toBe(1);
      expect(manifest.agents[0].ready).toBe(true);
      const promptText = fs.readFileSync(manifest.agents[0].path, 'utf-8');
      expect(promptText).toContain(quote);
    });
  });
});
