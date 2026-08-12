// src/tools/wave-status-tool.ts — the trident-wave-status TOOL factory (Part 23).
// The watch instrument's registration: the live client (getOpencodeClient) + the
// main session ID (the tool context) wired into the executeWaveStatus contract.

import { tool } from '../shared/tool-schema.js';
import { z } from 'zod';
import { getOpencodeClient } from './trident-tools.ts';
import { executeWaveStatus, type WaveStatusClient, type WaveStatusArgs } from './wave-status.ts';

export function createWaveStatusTool() {
  return tool({
    description: 'THE WATCH INSTRUMENT — the orchestrator\'s live control surface for the dispatched waves. status+waveId: the per-agent report (the live tails, the states, the lineage — the sessions are the truth). status+sessionId: the raw stream view of one child. kill+agent+waveId: the per-session abort (the untethering — ONE child, the wave untouched) + the respawn directive queued. kill-wave+waveId: abort per child + the wave archived as aborted. The orchestrator dispatches → watches → kills the rogue → respawns → continues.',
    args: {
      waveId: z.string().optional().describe('The wave to introspect.'),
      sessionId: z.string().optional().describe('A single child session (the raw stream view).'),
      agent: z.string().optional().describe('A single agent within the wave (for action=kill).'),
      action: z.enum(['status', 'kill', 'kill-wave']).optional().describe('status (default) | kill (one agent) | kill-wave (all).'),
      reason: z.string().optional().describe('The kill\'s reason (default ORCHESTRATOR_ABORT).'),
    },
    execute: async (
      args: WaveStatusArgs,
      context: { sessionID: string },
    ): Promise<string> => {
      const client = getOpencodeClient() as WaveStatusClient | null;
      const mainSessionId = (context && typeof context.sessionID === 'string' && context.sessionID) || null;
      const report = await executeWaveStatus(args, client, mainSessionId);
      return JSON.stringify(report, null, 2);
    },
  });
}
