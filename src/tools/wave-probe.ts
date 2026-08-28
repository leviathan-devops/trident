// src/tools/wave-probe.ts — THE TEMPORARY PROBE (Part 8 + Part 18 — the
// Phase-0 load-bearing verifications). The probe tool runs the three probe
// specs against the LIVE runtime: P1 the subtask spawn (V1-V6), P2 the
// todowrite write (V1-V3), P3 the interrupt tiers (V1-V3). The verdicts lock
// the design branches (Part 8.1-8.3). THE VERDICTS FROM THE REAL SIDE EFFECTS,
// never a fitted oracle. The client is the live opencode client (getOpencodeClient)
// or an injected stub (the container test / the SDK harness).

import { tridentLog } from '../utils.js';
import { ReminderQueue } from './wave-reminder-queue.ts';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

export interface ProbeResult {
  probe: 'P1' | 'P2' | 'P3' | 'P4' | 'P5' | 'P6';
  verdict: boolean;
  results: Record<string, boolean>;
  details: string[];
  at: string;
  skipped?: boolean;
  skipReason?: string;
}

export interface WaveProbeClient {
  session: {
    create(opts: { body?: { parentID?: string; title?: string } }): Promise<{ data: { id: string; parentID?: string } }>;
    promptAsync(opts: { path: { id: string }; body: Record<string, unknown> }): Promise<unknown>;
    list(opts: Record<string, unknown>): Promise<{ data?: Array<{ id: string }> | null }>;
    children(opts: { path: { id: string } }): Promise<{ data?: Array<{ id: string }> | null }>;
    messages(opts: { path: { id: string }; query?: Record<string, unknown> }): Promise<{ data?: unknown[] | null }>;
    todo(opts: { path: { id: string } }): Promise<{ data?: Array<{ id: string }> | null }>;
  };
  tui: {
    appendPrompt(opts: { body: { text: string } }): Promise<{ data?: unknown }>;
    submitPrompt(opts: Record<string, unknown>): Promise<{ data?: unknown }>;
  };
  request(opts: { method: string; url: string; path?: Record<string, unknown>; body?: unknown }): Promise<{ status?: number }>;
}

// THE PROBE RESULT FILE (the per-probe artifact — the Part 18 contract):
export function writeProbeArtifact(
  artifact: ProbeResult,
  outDir = path.join(process.cwd(), '.trident'),
): string {
  try {
    fs.mkdirSync(outDir, { recursive: true });
    const file = path.join(outDir, 'probe-' + artifact.probe + '-result.json');
    fs.writeFileSync(file, JSON.stringify(artifact, null, 2), 'utf-8');
    return file;
  } catch (wErr) {
    tridentLog('WARN', 'wave-probe', 'probe artifact write failed: ' + (wErr instanceof Error ? wErr.message : String(wErr)));
    return '';
  }
}

// THE AGGREGATE (the orchestrator's single read — .trident/probe-results.json):
export interface ProbeResultsFile {
  probes: Record<'P1' | 'P2' | 'P3' | 'P4' | 'P5' | 'P6', ProbeResult>;
  allPass: boolean;
  at: string;
}

export function writeProbeResults(
  probes: Record<'P1' | 'P2' | 'P3' | 'P4' | 'P5' | 'P6', ProbeResult>,
  outDir = path.join(process.cwd(), '.trident'),
): string {
  const allPass = probes.P1.verdict && probes.P2.verdict && probes.P3.verdict && probes.P4.verdict;
  const file: ProbeResultsFile = { probes, allPass, at: new Date().toISOString() };
  try {
    fs.mkdirSync(outDir, { recursive: true });
    const p = path.join(outDir, 'probe-results.json');
    fs.writeFileSync(p, JSON.stringify(file, null, 2), 'utf-8');
    return p;
  } catch (wErr) {
    tridentLog('WARN', 'wave-probe', 'probe-results write failed: ' + (wErr instanceof Error ? wErr.message : String(wErr)));
    return '';
  }
}

// THE COMPLETION POLL (V4/V5 — the child's messages grow + the part events):
async function pollForCompletion(
  client: WaveProbeClient,
  childId: string,
  timeoutMs: number,
): Promise<{ finalMessagePresent: boolean; partEvents: number }> {
  const deadline = Date.now() + timeoutMs;
  let partEvents = 0;
  while (Date.now() < deadline) {
    try {
      const msgs = await client.session.messages({ path: { id: childId } });
      const arr = msgs.data ?? [];
      if (arr.length > 0) {
        partEvents += arr.length;
        const last = arr[arr.length - 1];
        if (last && typeof last === 'object' && (last as { role?: string }).role === 'assistant') {
          return { finalMessagePresent: true, partEvents };
        }
      }
    } catch (pErr) {
      tridentLog('WARN', 'wave-probe', 'poll read failed (retrying): ' + (pErr instanceof Error ? pErr.message : String(pErr)));
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  return { finalMessagePresent: false, partEvents };
}

async function waitForTodoEvent(
  testRowId: string,
  client: WaveProbeClient,
  sessionId: string,
  timeoutMs: number,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const rows = await client.session.todo({ path: { id: sessionId } });
      if ((rows.data ?? []).some((r) => r.id === testRowId)) return true;
    } catch (tErr) {
      tridentLog('WARN', 'wave-probe', 'todo-event wait read failed (retrying): ' + (tErr instanceof Error ? tErr.message : String(tErr)));
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

async function probeP1(
  client: WaveProbeClient,
  mainSessionId: string | null,
): Promise<ProbeResult> {
  const results: Record<string, boolean> = {};
  const details: string[] = [];
  if (!mainSessionId) {
    const r: ProbeResult = {
      probe: 'P1', verdict: false, results: {},
      details: ['SKIPPED: no main session ID available in this runtime — the parentID probe requires the live session context'],
      at: new Date().toISOString(), skipped: true,
      skipReason: 'no main session ID',
    };
    writeProbeArtifact(r);
    return r;
  }
  try {
    // RETIRED (2026-08-27 — the operator's ruling): client-spawn
    // (session.create + promptAsync) is the FORBIDDEN spawn path — no
    // TaskTool → no live card, no completion inject, no idle wake (a mute
    // agent). Every spawn routes through extra.taskDispatch ONLY. The P1
    // experiment is concluded; this probe now self-reports the retirement.
    throw new Error('P1 RETIRED — client-spawn (session.create + promptAsync) is the FORBIDDEN path (2026-08-27): no TaskTool → no card, no completion inject, no wake. Only extra.taskDispatch (TaskTool.execute background) spawns.');
  } catch (p1Err) {
    const msg = p1Err instanceof Error ? p1Err.message : String(p1Err);
    tridentLog('ERROR', 'wave-probe', 'P1 failed: ' + msg);
    details.push('P1 error: ' + msg);
  }
  const r: ProbeResult = {
    probe: 'P1', verdict: Object.values(results).length >= 4 && Object.values(results).every(Boolean),
    results, details, at: new Date().toISOString(),
  };
  writeProbeArtifact(r);
  return r;
}

async function probeP2(
  client: WaveProbeClient,
  mainSessionId: string | null,
): Promise<ProbeResult> {
  const results: Record<string, boolean> = {};
  const details: string[] = [];
  if (!mainSessionId) {
    const r: ProbeResult = {
      probe: 'P2', verdict: false, results: {},
      details: ['SKIPPED: no main session ID available in this runtime'],
      at: new Date().toISOString(), skipped: true, skipReason: 'no main session ID',
    };
    writeProbeArtifact(r);
    return r;
  }
  const testRow = { content: 'probe-write-test', status: 'in_progress', priority: 'low', id: 'probe-' + Date.now() };
  try {
    const post = await client.request({
      method: 'POST', url: '/session/{id}/todo',
      path: { id: mainSessionId }, body: { todos: [testRow] },
    }).catch((e: { status?: number }) => ({ status: e.status ?? 0 }));
    results['V1_http_200'] = post.status === 200;
    details.push('POST status=' + String(post.status));
    results['V2_event_fired'] = await waitForTodoEvent(testRow.id, client, mainSessionId, 5000);
    const rows = await client.session.todo({ path: { id: mainSessionId } });
    results['V3_get_returns'] = (rows.data ?? []).some((r) => r.id === testRow.id);
  } catch (p2Err) {
    const msg = p2Err instanceof Error ? p2Err.message : String(p2Err);
    tridentLog('ERROR', 'wave-probe', 'P2 failed: ' + msg);
    details.push('P2 error: ' + msg);
  }
  const r: ProbeResult = {
    probe: 'P2', verdict: Object.values(results).length >= 2 && Object.values(results).every(Boolean),
    results, details, at: new Date().toISOString(),
  };
  writeProbeArtifact(r);
  return r;
}

async function probeP3(client: WaveProbeClient): Promise<ProbeResult> {
  const results: Record<string, boolean> = {};
  const details: string[] = [];
  try {
    const app = await client.tui.appendPrompt({ body: { text: 'PROBE_APPEND' } });
    results['V1_append'] = app.data === true;
    details.push('append data=' + String(app.data));
  } catch (p3Err) {
    const msg = p3Err instanceof Error ? p3Err.message : String(p3Err);
    tridentLog('ERROR', 'wave-probe', 'P3 append failed: ' + msg);
    details.push('P3 append error: ' + msg);
  }
  try {
    const sub = await client.tui.submitPrompt({});
    results['V3_submit'] = sub.data === true;
    details.push('submit data=' + String(sub.data));
  } catch (p3Err) {
    const msg = p3Err instanceof Error ? p3Err.message : String(p3Err);
    tridentLog('ERROR', 'wave-probe', 'P3 submit failed: ' + msg);
    details.push('P3 submit error: ' + msg);
  }
  // V2 — the output-append rides a real tool result: enqueue a probe reminder
  // and simulate the tool.execute.after injection (the hook's takeNext + append):
  ReminderQueue.enqueue('PROBE_REMINDER');
  const reminder = ReminderQueue.takeNext();
  const appended = reminder !== null && reminder.text === 'PROBE_REMINDER';
  results['V2_output_append'] = appended;
  details.push('reminder drained=' + appended);
  const r: ProbeResult = {
    probe: 'P3', verdict: Object.values(results).length >= 2 && Object.values(results).every(Boolean),
    results, details, at: new Date().toISOString(),
  };
  writeProbeArtifact(r);
  return r;
}

// THE EXECUTE (the Part 18 contract):
export async function executeWaveProbe(
  args: { probe: 'P1' | 'P2' | 'P3' | 'P4' | 'P5' | 'P6'; sessionId?: string; messageId?: string; extra?: Record<string, unknown> },
  client: WaveProbeClient | null,
): Promise<ProbeResult> {
  if (!client) {
    const r: ProbeResult = {
      probe: args.probe, verdict: false, results: {},
      details: ['SKIPPED: no opencode client in this runtime — the probes require the live plugin context (the container test / the SDK harness)'],
      at: new Date().toISOString(), skipped: true, skipReason: 'no client',
    };
    writeProbeArtifact(r);
    return r;
  }
  const mainSessionId = args.sessionId ?? null;
  if (args.probe === 'P1') return probeP1(client, mainSessionId);
  if (args.probe === 'P2') return probeP2(client, mainSessionId);
  if (args.probe === 'P3') return probeP3(client);
  if (args.probe === 'P4') return probeP4(client, args.extra);
  if (args.probe === 'P5') return probeP5(client, mainSessionId, args.extra);
  return probeP6(client, mainSessionId, args.messageId ?? null, args.extra);
}

// ── THE ANTIFRAGILE EFFECT RESOLVER ──
// The bare import('effect') walks node_modules from the plugin's load path — FRAGILE:
// the host loads the plugin from one tree, the container deploys it to another
// (/root/OPENCODE_WORKSPACE/dist), and the bun-compiled runtime's ESM loader does NOT
// follow the standard node_modules walk from the plugin path. This resolver NEVER
// depends on the walk: it discovers effect by ABSOLUTE file-URL import from candidate
// roots (host + container + baked-image conventions), then createRequire anchors.
// THE CONSTRAINT THAT MATTERS: resolving ANY effect is necessary but NOT sufficient —
// the promptOps Effects yield ambient services (InstanceState/provider/agents) from the
// runtime's AppLayer, so only the RUNTIME'S OWN effect instance can resolve them. The
// resolver surfaces WHICH instance it found so Q3 can report the exact failure mode.
interface EffectHandle { runPromise: (e: unknown) => Promise<unknown>; runFork: (e: unknown) => unknown; source: string; }

function effectEntryPoint(pkgDir: string): string | null {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf-8')) as {
      exports?: Record<string, unknown>; module?: string; main?: string;
    };
    const dot = pkg.exports?.['.'];
    let rel: string | undefined;
    if (typeof dot === 'string') rel = dot;
    else if (dot && typeof dot === 'object') {
      const o = dot as Record<string, unknown>;
      rel = (o['import'] ?? o['default'] ?? o['require']) as string | undefined;
    }
    rel = rel ?? pkg.module ?? pkg.main;
    if (!rel) return null;
    const abs = path.join(pkgDir, rel);
    return fs.existsSync(abs) ? abs : null;
  } catch { return null; }
}

async function tryEffectImport(specifier: string): Promise<EffectHandle | null> {
  try {
    const mod = (await import(specifier)) as Record<string, unknown>;
    const E = (mod['Effect'] ?? (mod['default'] as Record<string, unknown> | undefined)?.['Effect']) as
      | { runPromise?: (e: unknown) => Promise<unknown>; runFork?: (e: unknown) => unknown } | undefined;
    if (E && typeof E.runPromise === 'function' && typeof E.runFork === 'function') {
      return { runPromise: (e) => E.runPromise!(e), runFork: (e) => E.runFork!(e), source: specifier };
    }
  } catch { /* fall through to the next strategy */ }
  return null;
}

async function resolveEffect(): Promise<EffectHandle | null> {
  // STRATEGY 1 — the bare specifier (works when effect IS on the load-path walk)
  const bare = await tryEffectImport('effect');
  if (bare) return bare;
  // STRATEGY 2 — candidate node_modules roots (discovered, never one hardcoded tree)
  const home = process.env.HOME ?? '/root';
  const roots = [
    path.join(home, '.config', 'opencode', 'node_modules'),
    '/root/.config/opencode/node_modules',
    path.join(home, '.opencode', 'node_modules'),
    path.join(home, '.local', 'share', 'opencode', 'node_modules'),
    '/usr/local/lib/node_modules',
    path.join(process.cwd(), 'node_modules'),
  ];
  for (const root of roots) {
    const pkgDir = path.join(root, 'effect');
    if (!fs.existsSync(path.join(pkgDir, 'package.json'))) continue;
    const entry = effectEntryPoint(pkgDir);
    if (!entry) continue;
    const hit = await tryEffectImport(pathToFileURL(entry).href);
    if (hit) return hit;
  }
  // STRATEGY 3 — createRequire anchored at the runtime entry + the cwd
  const anchors = [process.argv[1], process.argv[0], path.join(process.cwd(), 'noop.js')]
    .filter((a): a is string => typeof a === 'string' && a.length > 0);
  for (const anchor of anchors) {
    try {
      const req = createRequire(anchor);
      const resolved = req.resolve('effect');
      const hit = await tryEffectImport(pathToFileURL(resolved).href);
      if (hit) return hit;
    } catch { /* next anchor */ }
  }
  return null;
}

// ── P4 — THE EFFECT-RUNTIME-CAPTURE PROBE (DISPATCH_TESTING_PLAN PROBE-1 → H1) ──
// THE QUESTION: can the plugin capture the Effect runtime with the full service
// context — i.e. does `runPromise`/`runFork` on a promptOps Effect resolve the
// runtime's services (sessions, provider, agents)? This is the ONLY unverified
// hypothesis. The probe reads context.extra.promptOps via args.extra (the tool
// boundary casts context to any) and runs three commands:
//   Q1 promptOpsPresent — is the runtime's prompt engine injected into extra?
//   Q2 resolvePromptParts — does a leaf Effect resolve the services (runPromise)?
//   Q3 contextCapture — does Effect.context() see the runtime's context?
// A FAIL on Q2 ("Service not found") = the Effect path is dead → the dispatch
// falls back to the spawnTask path + accepts the inline-card limitation.
// PROBE-1 PASS requires Q1 + Q2 (the mechanism resolves); Q3 is diagnostic.
async function probeP4(
  client: WaveProbeClient,
  extra?: Record<string, unknown>,
): Promise<ProbeResult> {
  const results: Record<string, boolean> = {};
  const details: string[] = [];
  try {
    // Q1 — is the runtime's prompt engine injected into context.extra? (prompt.ts:540)
    const promptOps = (extra ?? {})['promptOps'] as
      | { resolvePromptParts?: (template: string) => unknown; prompt?: (input: unknown) => unknown }
      | undefined;
    results['Q1_promptOpsPresent'] = !!(promptOps && typeof promptOps.resolvePromptParts === 'function');
    details.push('promptOps injected into extra=' + String(results['Q1_promptOpsPresent']));
    if (!results['Q1_promptOpsPresent']) {
      results['Q2_effectModuleResolves'] = false;
      results['Q3_servicesResolve'] = false;
      details.push('ABORT: no promptOps in context.extra — the runtime did not inject the prompt engine into this tool context (pluginCtx spread). The dispatch-by-promptOps path is structurally unavailable here.');
    } else {
      // Q2 — can the plugin resolve effect via the ANTIFRAGILE resolver (bare →
      //      absolute-path discovery → createRequire anchors)? A failed resolution
      //      kills ONLY this probe, never the whole plugin on load.
      const handle = await resolveEffect();
      results['Q2_effectModuleResolves'] = handle !== null;
      details.push('effect resolved=' + String(handle !== null) + (handle ? ' source=' + handle.source : ''));
      // Q3 — THE REAL TEST: run the promptOps Effect with the resolved module's
      //      runPromise. The promptOps Effects yield AMBIENT services (InstanceState/
      //      provider/agents — prompt.ts:227 yield* InstanceState.context) provided by
      //      the runtime's AppLayer. If the resolved effect is a SEPARATE instance (the
      //      runtime is a bun-compiled binary with effect baked in), the Context tags
      //      mismatch → "Service not found" → H1 = FALSE → fallback to spawnTask.
      if (handle) {
        const t0 = Date.now();
        try {
          const effValue = promptOps!.resolvePromptParts!('EXECUTE THE FOLLOWING PROBE: reply PROBE_OK.');
          const parts = await handle.runPromise(effValue);
          results['Q3_servicesResolve'] = true;
          details.push('resolvePromptParts ran OK latency=' + (Date.now() - t0) + 'ms parts=' + JSON.stringify(parts).slice(0, 120));
        } catch (runErr) {
          const msg = runErr instanceof Error ? runErr.message : String(runErr);
          results['Q3_servicesResolve'] = false;
          const isServiceNotFound = /service.*not.*found|not in the current context|cannot read properties|is not a function|unknown effect|invalid/i.test(msg);
          details.push('Q3 run error: ' + msg.slice(0, 220));
          details.push(isServiceNotFound
            ? 'H1 VERDICT = FALSE: the resolved effect is a SEPARATE instance from the runtime (the bun binary bundles its own effect; the promptOps Effects need the runtime AppLayer ambient services). The Effect dispatch path is DEAD. FALLBACK: the spawnTask path (child runs async + tethered; inline card is the limitation; the subagent PANEL shows the child).'
            : 'Q3 failed for a NON-service reason — investigate the message.');
        }
      } else {
        results['Q3_servicesResolve'] = false;
        details.push('Q3 SKIPPED: no effect module resolvable by ANY strategy (bare + ' + 'candidate roots + createRequire anchors).');
      }
    }
  } catch (p4Err) {
    const msg = p4Err instanceof Error ? p4Err.message : String(p4Err);
    tridentLog('ERROR', 'wave-probe', 'P4 failed: ' + msg);
    details.push('P4 outer error: ' + msg);
  }
  // THE VERDICT: the mechanism resolves ONLY if promptOps present AND the shared
  // module resolves AND the services resolve. Q2 alone is not enough — a module
  // that imports but mismatches tags still fails at Q3.
  const r: ProbeResult = {
    probe: 'P4',
    verdict: results['Q1_promptOpsPresent'] === true
      && results['Q2_effectModuleResolves'] === true
      && results['Q3_servicesResolve'] === true,
    results, details, at: new Date().toISOString(),
  };
  writeProbeArtifact(r);
  return r;
}

// ── P5 — THE BACKGROUND-FORK PROBE (DISPATCH_TESTING_PLAN PROBE-2 → H2) ──
// THE QUESTION: does runFork(promptOps.prompt(...)) run the child session in the
// BACKGROUND without blocking the parent's loop? This is the FULL child run — the
// model call, the provider service, the agent loop — far more services than the
// resolvePromptParts leaf (P4). P4 passing proves the plugin can run a promptOps
// Effect; P5 proves the FULL child can fork async. THE PASS SHAPE: the child session
// tethers (parentID), runFork returns immediately (non-blocking), the child's stream
// grows (parts land), and the parent's loop is never blocked. A FAIL on Q4 (the child
// never produces parts) means the provider/agent services are NOT ALS-backed and the
// Effect dispatch is dead for the full run → the spawnTask fallback.
async function probeP5(
  client: WaveProbeClient,
  mainSessionId: string | null,
  extra?: Record<string, unknown>,
): Promise<ProbeResult> {
  const results: Record<string, boolean> = {};
  const details: string[] = [];
  if (!mainSessionId) {
    const r: ProbeResult = {
      probe: 'P5', verdict: false, results: {},
      details: ['SKIPPED: no main session ID available in this runtime — the background-fork probe requires the live parent session'],
      at: new Date().toISOString(), skipped: true, skipReason: 'no main session ID',
    };
    writeProbeArtifact(r);
    return r;
  }
  try {
    const promptOps = (extra ?? {})['promptOps'] as
      | { resolvePromptParts?: (template: string) => unknown; prompt?: (input: unknown) => unknown }
      | undefined;
    results['Q1_promptOpsPresent'] = !!(promptOps && typeof promptOps.prompt === 'function' && typeof promptOps.resolvePromptParts === 'function');
    details.push('promptOps.prompt injected=' + String(results['Q1_promptOpsPresent']));
    if (!results['Q1_promptOpsPresent']) {
      results['Q2_childTethered'] = false;
      results['Q3_forkNonBlocking'] = false;
      results['Q4_childStreamed'] = false;
      details.push('ABORT: no promptOps.prompt in context.extra — cannot test the background fork.');
    } else {
      const handle = await resolveEffect();
      results['Q2_effectResolved'] = handle !== null;
      if (handle) {
        // THE CHILD (tethered to the parent):
        // RETIRED (2026-08-27): the client-spawn child is FORBIDDEN (see P1).
        throw new Error('P5 RETIRED — the Effect-fork experiment\'s client-spawn child (session.create) is the FORBIDDEN path (2026-08-27): no TaskTool → no card, no inject, no wake. Only extra.taskDispatch spawns.');
      } else {
        results['Q2_childTethered'] = false;
        results['Q3_forkNonBlocking'] = false;
        results['Q4_childStreamed'] = false;
        details.push('ABORT: effect not resolvable by any strategy.');
      }
    }
  } catch (p5Err) {
    const msg = p5Err instanceof Error ? p5Err.message : String(p5Err);
    tridentLog('ERROR', 'wave-probe', 'P5 failed: ' + msg);
    details.push('P5 outer error: ' + msg);
  }
  const r: ProbeResult = {
    probe: 'P5',
    verdict: results['Q1_promptOpsPresent'] === true
      && results['Q2_childTethered'] === true
      && results['Q3_forkNonBlocking'] === true
      && results['Q4_childStreamed'] === true,
    results, details, at: new Date().toISOString(),
  };
  writeProbeArtifact(r);
  return r;
}

// ── P6 — THE CARD-VIA-UPDATEPART PROBE (DISPATCH_TESTING_PLAN PROBE-3 → H3) ──
// THE QUESTION: can the plugin create the INLINE subagent card — the tool:"task"
// ToolPart the TUI renders (index.tsx:1434, 1982-2018)? THE MECHANISM (verified from
// the runtime source): the card is a ToolPart written via sessions.updatePart
// (prompt.ts:729) with tool:"task" + state.input.{subagent_type,description} +
// state.metadata.{sessionId,background:true}. The server EXPOSES updatePart over HTTP
// (groups/session.ts:100 PATCH /session/:sessionID/message/:messageID/part/:partID →
// session.updatePart — an UPSERT, handleSubtask creates fresh parts with it). The
// plugin's Tool.Context carries sessionID + messageID + extra.promptOps. SO the plugin
// can write the card part itself: create the child (tethered) + write the card part
// (updatePart) + runFork the child (async). THE PASS SHAPE: the card part persists in
// the parent's assistant message (the TUI renders it) + the child runs async.
// THE ID FORMAT: PartID must start with "prt" (schema.ts:24 isStartsWith("prt")) and
// the ascending format is prt_<hex-timestamp><base62> (id/id.ts:69).
function genProbeId(prefix: string): string {
  return prefix + '_' + Date.now().toString(16) + Math.random().toString(36).slice(2, 14);
}

// ── THE ANTIFRAGILE CARD-PART WRITER ──
// The plugin's client surface is NOT guaranteed — the runtime passes an OpencodeClient
// whose exposed HTTP verbs vary by SDK build (the raw .request was ABSENT in the
// container's build, crashing the naive call). This writer ENUMERATES the client's
// actual method surface (the diagnostic) + tries EVERY channel that can reach the
// updatePart endpoint (PATCH /session/:sessionID/message/:messageID/part/:partID), and
// reports WHICH channel worked — never depending on a single client shape.
async function writeCardPart(
  client: WaveProbeClient,
  ids: { sessionID: string; messageID: string; partID: string },
  cardPart: Record<string, unknown>,
): Promise<{ ok: boolean; channel: string; status?: number; error?: string; surface: string[] }> {
  const anyClient = client as unknown as Record<string, unknown>;
  // THE DEEP DIAGNOSTIC — walk the prototype chain, trigger the namespace getters, and
  // enumerate each namespace's methods (the v2 SDK exposes client.part.update, not a
  // top-level verb; a shallow function-only walk misses the accessor namespaces).
  const surface: string[] = [];
  try {
    let obj: unknown = anyClient;
    const seen = new Set<string>();
    while (obj && obj !== Object.prototype) {
      for (const k of Object.getOwnPropertyNames(obj)) {
        if (seen.has(k) || k === 'constructor') continue;
        seen.add(k);
        let v: unknown;
        try { v = (anyClient as Record<string, unknown>)[k]; } catch { continue; }
        if (typeof v === 'function') { surface.push(k + '()'); continue; }
        if (v && typeof v === 'object') {
          const sub: string[] = [];
          let so: unknown = v;
          const subSeen = new Set<string>();
          while (so && so !== Object.prototype) {
            for (const sk of Object.getOwnPropertyNames(so)) {
              if (!subSeen.has(sk) && sk !== 'constructor' && typeof (v as Record<string, unknown>)[sk] === 'function') { subSeen.add(sk); sub.push(sk); }
            }
            so = Object.getPrototypeOf(so);
          }
          surface.push(k + ':{' + sub.join(',') + '}');
        }
      }
      obj = Object.getPrototypeOf(obj);
    }
  } catch { /* surface enumeration is best-effort */ }
  const templated = '/session/{sessionID}/message/{messageID}/part/{partID}';
  const flat = '/session/' + ids.sessionID + '/message/' + ids.messageID + '/part/' + ids.partID;
  const pathParams = { sessionID: ids.sessionID, messageID: ids.messageID, partID: ids.partID };
  // THE INNER HEY-API CLIENT — the v1 OpencodeClient wrapper exposes the raw verbs on
  // `._client` (the container surface showed `_client:{buildUrl,delete,get,patch,post,
  // put,request,...}`), NOT on the top level. The channels hit `._client` first.
  const inner = (anyClient['_client'] ?? anyClient) as Record<string, unknown>;
  // CHANNEL A — the inner hey-api generic request:
  if (typeof inner['request'] === 'function') {
    try {
      const r = await (inner['request'] as (o: unknown) => Promise<{ response?: { status?: number } }>)({ method: 'PATCH', url: templated, path: pathParams, body: cardPart });
      return { ok: true, channel: 'client._client.request', status: r?.response?.status, surface };
    } catch (e) { return { ok: false, channel: 'client._client.request', error: String(e).slice(0, 200), surface }; }
  }
  // CHANNEL B — the inner hey-api patch verb:
  if (typeof inner['patch'] === 'function') {
    try {
      const r = await (inner['patch'] as (o: unknown) => Promise<{ response?: { status?: number } }>)({ url: templated, path: pathParams, body: cardPart });
      return { ok: true, channel: 'client._client.patch', status: r?.response?.status, surface };
    } catch (e) { return { ok: false, channel: 'client._client.patch', error: String(e).slice(0, 200), surface }; }
  }
  // CHANNEL C — the v2 part namespace: client.part.update (absent on the v1 SDK):
  const partNs = anyClient['part'] as Record<string, unknown> | undefined;
  if (partNs && typeof partNs['update'] === 'function') {
    try {
      const r = await (partNs['update'] as (o: unknown) => Promise<{ response?: { status?: number } }>)({ sessionID: ids.sessionID, messageID: ids.messageID, partID: ids.partID, part: cardPart });
      return { ok: true, channel: 'client.part.update', status: r?.response?.status, surface };
    } catch (e) { return { ok: false, channel: 'client.part.update', error: String(e).slice(0, 200), surface }; }
  }
  // CHANNEL D — the typed session.updatePart (if this build exposes it):
  const sess = anyClient['session'] as Record<string, unknown> | undefined;
  if (sess && typeof sess['updatePart'] === 'function') {
    try {
      const r = await (sess['updatePart'] as (o: unknown) => Promise<{ response?: { status?: number } }>)({ path: pathParams, body: cardPart });
      return { ok: true, channel: 'session.updatePart', status: r?.response?.status, surface };
    } catch { /* fall through */ }
  }
  // CHANNEL E — raw fetch via the inner client's config baseUrl + auth headers:
  try {
    const getCfg = (inner['getConfig'] ?? anyClient['getConfig']) as (() => { baseUrl?: string; headers?: Record<string, string> }) | undefined;
    const cfg = typeof getCfg === 'function' ? getCfg.call(inner) : undefined;
    const baseUrl = (cfg?.baseUrl ?? 'http://localhost:4096').replace(/\/$/, '');
    const resp = await fetch(baseUrl + flat, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...(cfg?.headers ?? {}) },
      body: JSON.stringify(cardPart),
    });
    return { ok: resp.ok, channel: 'raw fetch baseUrl=' + baseUrl, status: resp.status, surface };
  } catch (e) {
    return { ok: false, channel: 'none', error: String(e), surface };
  }
}

async function probeP6(
  client: WaveProbeClient,
  mainSessionId: string | null,
  messageId: string | null,
  extra?: Record<string, unknown>,
): Promise<ProbeResult> {
  const results: Record<string, boolean> = {};
  const details: string[] = [];
  if (!mainSessionId || !messageId) {
    const r: ProbeResult = {
      probe: 'P6', verdict: false, results: {},
      details: ['SKIPPED: need both sessionID and messageID — the card part writes into the parent\'s CURRENT assistant message (the plugin Tool.Context.messageID)'],
      at: new Date().toISOString(), skipped: true, skipReason: 'no sessionID/messageID',
    };
    writeProbeArtifact(r);
    return r;
  }
  try {
    const promptOps = (extra ?? {})['promptOps'] as
      | { resolvePromptParts?: (template: string) => unknown; prompt?: (input: unknown) => unknown }
      | undefined;
    results['Q1_promptOpsPresent'] = !!(promptOps && typeof promptOps.prompt === 'function' && typeof promptOps.resolvePromptParts === 'function');
    details.push('promptOps injected=' + String(results['Q1_promptOpsPresent']) + ' messageId=' + messageId);
    if (!results['Q1_promptOpsPresent']) {
      results['Q2_childTethered'] = false; results['Q3_cardPartWritten'] = false; results['Q5_cardPartPersisted'] = false;
      details.push('ABORT: no promptOps — cannot run the child.');
    } else {
      const handle = await resolveEffect();
      if (!handle) {
        results['Q2_childTethered'] = false; results['Q3_cardPartWritten'] = false; results['Q5_cardPartPersisted'] = false;
        details.push('ABORT: effect not resolvable.');
      } else {
        // STEP 1 — THE CHILD (tethered):
        // RETIRED (2026-08-27): the updatePart fake card + the client-spawn
        // child are BOTH on the forbidden list (a PATCHed card is not a live
        // ctx.toolcalls entry; the client-spawn has no TaskTool at all).
        throw new Error('P6 RETIRED — the updatePart fake card + the client-spawn child are FORBIDDEN (2026-08-27): only extra.taskDispatch (createLiveToolPart → TaskTool.execute background) makes real cards + completion injects.');
      }
    }
  } catch (p6Err) {
    const msg = p6Err instanceof Error ? p6Err.message : String(p6Err);
    tridentLog('ERROR', 'wave-probe', 'P6 failed: ' + msg);
    details.push('P6 outer error: ' + msg);
  }
  const r: ProbeResult = {
    probe: 'P6',
    verdict: results['Q2_childTethered'] === true && results['Q3_cardPartWritten'] === true && results['Q5_cardPartPersisted'] === true,
    results, details, at: new Date().toISOString(),
  };
  writeProbeArtifact(r);
  return r;
}
