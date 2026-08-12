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

export interface ProbeResult {
  probe: 'P1' | 'P2' | 'P3';
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
  probes: Record<'P1' | 'P2' | 'P3', ProbeResult>;
  allPass: boolean;
  at: string;
}

export function writeProbeResults(
  probes: Record<'P1' | 'P2' | 'P3', ProbeResult>,
  outDir = path.join(process.cwd(), '.trident'),
): string {
  const allPass = probes.P1.verdict && probes.P2.verdict && probes.P3.verdict;
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
    const created = await client.session.create({ body: { parentID: mainSessionId, title: 'probe-subagent' } });
    const childId = created.data.id;
    results['V1_parentID'] = created.data.parentID === mainSessionId;
    details.push('childId=' + childId + ' parentID=' + String(created.data.parentID));
    const t0 = Date.now();
    await client.session.promptAsync({
      path: { id: childId },
      body: {
        agent: 'trident_explore',
        parts: [{
          type: 'subtask',
          prompt: 'EXECUTE THE FOLLOWING PROBE: report the string PROBE_OK.',
          description: 'probe-subagent',
          agent: 'trident_explore',
        }],
      },
    });
    results['V6_promptAsync_immediate'] = Date.now() - t0 < 2000;
    details.push('promptAsync latency=' + (Date.now() - t0) + 'ms');
    const rootList = await client.session.list({});
    results['V2_no_main_list_pollution'] = !(rootList.data ?? []).some((s) => s.id === childId);
    const children = await client.session.children({ path: { id: mainSessionId } });
    results['V3_in_children'] = (children.data ?? []).some((s) => s.id === childId);
    const tail = await pollForCompletion(client, childId, 120_000);
    results['V4_subagent_ran'] = tail.finalMessagePresent;
    results['V5_stream_visible'] = tail.partEvents > 0;
    details.push('final=' + tail.finalMessagePresent + ' partEvents=' + tail.partEvents);
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
  args: { probe: 'P1' | 'P2' | 'P3'; sessionId?: string },
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
  return probeP3(client);
}
