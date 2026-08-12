// src/tools/wave-steer-tool.ts — the trident-wave-steer TOOL factory (2026-08-12).
// THE STEERING SURFACE: sends ANY prompt into an EXISTING subagent session —
// the orchestration overhaul (watch N waves → spot a derailment → steer).
// The generator-only doctrine holds: the tool returns the task-call form (the
// task_id + the prompt); the orchestrator dispatches the single task call (the
// resume-channel exemption passes the firewalls).

import { tool } from '../shared/tool-schema.js';
import { z } from 'zod';
import { executeWaveSteer } from './wave-dispatch.ts';

export function createWaveSteerTool() {
  return tool({
    description: 'THE STEERING SURFACE (2026-08-12) — send ANY prompt into an EXISTING subagent session to steer a derailing agent. The resume channel cloned + the input mechanism modified: the steer accepts any prompt, not just "continue". mode=queue (DEFAULT): the message QUEUES in the session — the subagent processes it after its current tool call completes (the runtime\'s native queue — low latency, the agent is not ripped out of context). mode=interrupt (CONDITIONAL): a hard steer — cancels the current generation first (the esc-esc equivalent), then the message lands; use ONLY when the runtime exposes a non-destructive cancel primitive, else queue + a note. The tool returns the task-call form; the orchestrator DISPATCHES it (the generator-only doctrine — the tool NEVER spawns). THE FLOW: wave-status shows a derailment in the reasoning trace → steer sessionId=<sid> prompt="<the correction>" → dispatch the returned task call → the agent re-orients after its current tool call.',
    args: {
      sessionId: z.string().describe('The EXISTING subagent session to steer (the task_id from the background dispatch or the wave-status report).'),
      prompt: z.string().describe('THE STEER MESSAGE — any prompt: the correction, the redirect, the new instruction. QUEUED by default.'),
      mode: z.enum(['queue', 'interrupt']).optional().describe('queue (default): the message queues after the current tool call. interrupt: cancel the current generation first (conditional on a runtime cancel primitive).'),
      subagentType: z.enum(['trident_explore', 'trident_build']).optional().describe('The agent type (default trident_explore).'),
    },
    execute: async (args: Record<string, unknown>): Promise<{ title: string; output: string }> => {
      const sessionId = typeof args.sessionId === 'string' ? args.sessionId : '';
      const prompt = typeof args.prompt === 'string' ? args.prompt : '';
      const mode = args.mode === 'interrupt' ? 'interrupt' : 'queue';
      const subagentType = typeof args.subagentType === 'string' ? args.subagentType : undefined;
      const result = await executeWaveSteer(sessionId, prompt, { mode, subagentType });
      return {
        title: 'STEER — ' + result.mode.toUpperCase() + ' → ' + result.sessionId + (result.verified ? '' : ' (UNVERIFIED)'),
        output: JSON.stringify(result, null, 2),
      };
    },
  });
}
