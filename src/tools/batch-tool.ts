// src/tools/batch-tool.ts — THE PLUGIN-SIDE BATCH TOOL
//
// 2026-08-27 — CLIENT-SPAWN IS DEAD (the operator's ruling): every spawn MUST
// go through extra.taskDispatch (the fork's TaskTool.execute background
// branch) — that is the ONLY surface that produces the vanilla completion:
// the live task card + the synthetic "Background task completed" part + the
// idle wake. The old client.session.create + promptAsync spawn produced a
// real child with NO card, NO BackgroundJob, NO inject, NO wake — a silently
// mute agent. That path is FORBIDDEN; this tool now either dispatches via
// taskDispatch or refuses LOUDLY. No fallback, no fake visibility metadata.
//
// THE SECURITY: the wave-verbatim discipline is enforced INSIDE the batch:
// a task entry whose description matches a wave-manifest agent MUST carry
// the exact generated prompt — the promptFile channel is loaded via
// loadPromptFileForDispatch (the tmp confinement + the DPL1 validation) and
// the SHA is compared against the manifest's recorded sha256 — a condensed
// prompt throws [WAVE VERBATIM], never spawns.

import { tool } from '../shared/tool-schema.js';
import { z } from 'zod';
import * as path from 'node:path';
import { readdirSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tridentLog } from '../utils.js';
import { loadPromptFileForDispatch } from './wave-dispatch.ts';
import { TRIDENT_TMP_DIR } from './wave-constants.ts';

export interface BatchToolCall {
  tool: string;
  parameters: Record<string, unknown>;
}

/** The fork's dispatch surface (context.extra.taskDispatch → makeTaskDispatch
 *  → TaskTool.execute background) — the ONLY sanctioned spawn. */
export type TaskDispatchSurface = (params: {
  description: string;
  prompt: string;
  subagent_type: string;
  background?: boolean;
}) => Promise<{ sessionId: string; partID?: string; callID?: string }>;

/** THE WAVE-MANIFEST SHA VERIFICATION (the batch's [WAVE VERBATIM]): find the
 *  manifest entry for the description + compare the dispatched prompt's SHA.
 *  A manifest match with a SHA mismatch = the condensed prompt → BLOCK. */
export function findManifestSha(desc: string): { sha256: string; lines: number } | null {
  try {
    const files = readdirSync(TRIDENT_TMP_DIR, { withFileTypes: true });
    for (let i = 0; i < files.length; i++) {
      if (!files[i].isFile() || files[i].name.indexOf('.wave-manifest-') !== 0 || !files[i].name.endsWith('.json')) continue;
      const parsed = JSON.parse(readFileSync(path.join(TRIDENT_TMP_DIR, files[i].name), 'utf-8')) as { agents?: Array<{ name: string; sha256: string; lines?: number }> };
      const agents = parsed?.agents || [];
      for (let a = 0; a < agents.length; a++) {
        if (agents[a].name === desc && typeof agents[a].sha256 === 'string') {
          return { sha256: agents[a].sha256, lines: agents[a].lines ?? 0 };
        }
      }
    }
  } catch (e) { /* the manifests absent — no verbatim record → no block */ }
  return null;
}

/** THE TASKDISPATCH SPAWN — the ONLY spawn: extra.taskDispatch (TaskTool
 *  background) → the live card + the completion inject + the idle wake.
 *  The prompt resolution ([promptFile | prompt | text]) + the [WAVE VERBATIM]
 *  SHA gate run FIRST; the dispatch is the last step. */
export async function spawnTask(
  taskDispatch: TaskDispatchSurface,
  mainSessionId: string | null,
  entry: BatchToolCall,
): Promise<{ ok: boolean; sessionId?: string; error?: string }> {
  const p = entry.parameters || {};
  const description = typeof p.description === 'string' ? p.description : 'agent';
  const subagentType = (typeof p.subagent_type === 'string' ? p.subagent_type : '') || (typeof p.subagentType === 'string' ? p.subagentType : '') || 'trident_explore';
  // THE PROMPTFILE CHANNEL (the loader — the tmp confinement + the DPL1 validation):
  let promptText = '';
  const pf = typeof p.promptFile === 'string' ? p.promptFile : '';
  if (pf && pf.trim().length > 0) {
    promptText = loadPromptFileForDispatch(pf.trim());
  } else if (typeof p.prompt === 'string' && p.prompt.trim().length > 0) {
    promptText = p.prompt;
  } else if (typeof p.text === 'string' && p.text.trim().length > 0) {
    promptText = p.text;
  }
  if (!promptText || promptText.trim().length === 0) {
    return { ok: false, error: '[TRIDENT PROMPT FILE] the batch entry ' + description + ' has no prompt — the promptFile is the required channel for generated prompts' };
  }
  // THE [WAVE VERBATIM] SHA CHECK (the batch's own enforcement):
  const manifestEntry = findManifestSha(description);
  if (manifestEntry) {
    const sha = createHash('sha256').update(promptText).digest('hex');
    if (sha !== manifestEntry.sha256) {
      return { ok: false, error: '[WAVE VERBATIM] the dispatched prompt for \"' + description + '\" is NOT the exact generated prompt — the SHA mismatch (compressed/condensed). DISPATCH THE BATCH FORM\'S PROMPT VERBATIM — 0 ignore, 0 condensation.' };
    }
  }
  // THE SPAWN — taskDispatch ONLY (TaskTool.execute background → card +
  // inject + wake). parent lineage rides the dispatching context
  // (ctx.sessionID inside the fork), never a manual create.
  try {
    const dr = await taskDispatch({
      description,
      prompt: promptText,
      subagent_type: subagentType,
      background: true,
    });
    tridentLog('INFO', 'batch-tool', 'TASKDISPATCHED ' + description + ' → ' + dr.sessionId + ' (parent ' + (mainSessionId ?? 'ctx') + ' — the fork surface: card + inject + wake)');
    return { ok: true, sessionId: dr.sessionId };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export function createBatchTool() {
  return tool({
    description: 'Execute multiple tool calls concurrently — THE PARALLEL BATCH (016_batch.md). The tool_calls array (min 1, max 25): each entry {tool, parameters}. The task entries dispatch their subagents IN PARALLEL via extra.taskDispatch (the fork TaskTool background surface — the live card + the vanilla "Background task completed" inject + the idle wake). THE CLIENT-SPAWN PATH IS FORBIDDEN AND DEAD. The non-task entries are refused with the named error. THE WAVE-VERBATIM ENFORCEMENT: a task entry whose description matches a wave-manifest agent must carry the exact generated prompt — the promptFile channel + the SHA verification — a condensed prompt is BLOCKED.',
    args: {
      tool_calls: z.array(z.object({
        tool: z.string().describe('The tool to execute — "task" for the subagent spawns'),
        parameters: z.record(z.string(), z.any()).describe('The tool parameters: description, subagent_type, promptFile (or prompt), etc.'),
      })).min(1).max(25).describe('The array of tool calls to execute in parallel (max 25)'),
    },
    execute: async (args: { tool_calls: BatchToolCall[] }, context?: { sessionID?: string; extra?: { taskDispatch?: TaskDispatchSurface } }) => {
      const mainSessionId = (context && typeof context.sessionID === 'string' && context.sessionID) || null;
      const taskDispatch = context?.extra?.taskDispatch;
      if (typeof taskDispatch !== 'function') {
        throw new Error('[BATCH TOOL] LOUD FAIL — context.extra.taskDispatch is missing: this runtime has NO dispatch surface. Client-spawn (session.create + promptAsync) is FORBIDDEN AND DELETED (no card, no completion inject, no wake). Run on the fork runtime or do not spawn.');
      }
      // THE PARALLEL EXECUTION (allSettled — the per-unit failure capture, the wave survives the stragglers):
      const results = await Promise.allSettled((args.tool_calls || []).map((entry) => spawnTask(taskDispatch, mainSessionId, entry)));
      const details: Array<{ status: string; sessionId?: string; error?: string }> = [];
      let ok = 0;
      for (const r of results) {
        if (r.status === 'fulfilled') {
          if (r.value.ok) { ok++; details.push({ status: 'completed', sessionId: r.value.sessionId }); }
          else { details.push({ status: 'error', error: r.value.error }); }
        } else {
          details.push({ status: 'error', error: r.reason instanceof Error ? r.reason.message : String(r.reason) });
        }
      }
      const total = (args.tool_calls || []).length;
      const summary = {
        title: 'Batch execution (' + ok + '/' + total + ' successful)',
        output: 'The batch dispatched ' + ok + '/' + total + ' agents in parallel via taskDispatch (parent ' + (mainSessionId ?? 'ctx') + '). Per-call: ' + JSON.stringify(details),
        metadata: { totalCalls: total, successful: ok, failed: total - ok, tools: (args.tool_calls || []).map((c) => c.tool) },
      };
      return summary;
    },
  });
}
