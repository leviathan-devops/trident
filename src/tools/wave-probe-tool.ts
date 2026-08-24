// src/tools/wave-probe-tool.ts — the trident-wave-probe TOOL factory (Part 8/18).
// The Phase-0 probe registration: the live client + the session ID wired into
// the executeWaveProbe contract. The verdicts lock the design branches.

import { tool } from '../shared/tool-schema.js';
import { z } from 'zod';
import * as fsMod from 'node:fs';
import * as pathMod from 'node:path';
import { getOpencodeClient } from './trident-tools.ts';
import { executeWaveProbe, writeProbeResults, type WaveProbeClient, type ProbeResult } from './wave-probe.ts';

export function createWaveProbeTool() {
  return tool({
    description: 'THE PHASE-0 PROBE — the load-bearing verifications of the wave-dispatch design. P1 the in-tool subtask spawn (V1 the parentID set, V2 no main-list pollution, V3 the child in session.children, V4 the subagent runs, V5 the stream visible, V6 the promptAsync immediate). P2 the todowrite write (V1 the HTTP 200, V2 the EventTodoUpdated fires, V3 the GET returns the row). P3 the interrupt tiers (V1 the append lands, V2 the output-append rides a tool result, V3 the submit enters the stream). The verdicts are written to .trident/probe-results.json — the design branches lock from the recorded verdicts, never from the guesses.',
    args: {
      probe: z.enum(['P1', 'P2', 'P3', 'P4', 'P5', 'P6']).describe('The probe to run: P1 the subtask spawn, P2 the todowrite write, P3 the interrupt tiers, P4 the Effect-runtime-capture (PROBE-1/H1 — can the plugin resolve the runtime services via promptOps?), P5 the background-fork (PROBE-2/H2 — does runFork(promptOps.prompt) run the child async without blocking the parent?).'),
      sessionId: z.string().optional().describe('The main session ID (the parentID anchor). Defaults to the tool context.'),
    },
    execute: async (
      args: { probe: 'P1' | 'P2' | 'P3' | 'P4' | 'P5' | 'P6'; sessionId?: string },
      context: { sessionID: string; messageID?: string; extra?: Record<string, unknown> },
    ): Promise<string> => {
      const client = getOpencodeClient() as WaveProbeClient | null;
      const sessionId = args.sessionId ?? (context && typeof context.sessionID === 'string' ? context.sessionID : undefined);
      const messageId = context && typeof context.messageID === 'string' ? context.messageID : undefined;
      const result = await executeWaveProbe({ probe: args.probe, sessionId, messageId, extra: context?.extra }, client);
      // The aggregate — write the combined results on EVERY probe so the
      // orchestrator's single read stays current:
      const others = readExistingProbeResults();
      const aggregate: Record<'P1' | 'P2' | 'P3' | 'P4' | 'P5' | 'P6', ProbeResult> = {
        P1: args.probe === 'P1' ? result : others.P1,
        P2: args.probe === 'P2' ? result : others.P2,
        P3: args.probe === 'P3' ? result : others.P3,
        P4: args.probe === 'P4' ? result : others.P4,
        P5: args.probe === 'P5' ? result : others.P5,
        P6: args.probe === 'P6' ? result : others.P6,
      };
      writeProbeResults(aggregate);
      return JSON.stringify(result, null, 2);
    },
  });
}

function readExistingProbeResults(): Record<'P1' | 'P2' | 'P3' | 'P4' | 'P5' | 'P6', ProbeResult> {
  const empty = (p: 'P1' | 'P2' | 'P3' | 'P4' | 'P5' | 'P6'): ProbeResult => ({
    probe: p, verdict: false, results: {}, details: ['not yet run'], at: '',
  });
  try {
    const p = pathMod.join(process.cwd(), '.trident', 'probe-results.json');
    if (!fsMod.existsSync(p)) return { P1: empty('P1'), P2: empty('P2'), P3: empty('P3'), P4: empty('P4'), P5: empty('P5'), P6: empty('P6') };
    const parsed = JSON.parse(fsMod.readFileSync(p, 'utf-8')) as { probes?: Record<'P1' | 'P2' | 'P3' | 'P4' | 'P5' | 'P6', ProbeResult> };
    if (!parsed.probes) return { P1: empty('P1'), P2: empty('P2'), P3: empty('P3'), P4: empty('P4'), P5: empty('P5'), P6: empty('P6') };
    return parsed.probes;
  } catch (rErr) {
    return { P1: empty('P1'), P2: empty('P2'), P3: empty('P3'), P4: empty('P4'), P5: empty('P5'), P6: empty('P6') };
  }
}
