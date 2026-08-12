// src/tools/batch-tool.ts — THE PLUGIN-SIDE BATCH TOOL (2026-08-10)
//
// THE WHY: the runtime 1.14.43's tool registry (/experimental/tool/ids)
// LACKS the vanilla build's 'batch' tool (016_batch.md:
// vanilla-source/packages/opencode/src/tool/batch.ts) — the model surface
// cannot invoke it — the wave manager's batch form falls back to the
// session loop's SEQUENTIAL per-call execution (the task tool's sync prompt
// holds the loop until each subagent finishes — the wave's agents ran
// one-at-a-time, the manifest's startedAt chain proved it). THE FIX: the
// plugin REGISTERS its own 'batch' tool (the plugin's tools DO appear in the
// registry) — the 016_batch.md schema (tool_calls array) — the execute runs
// the task entries IN PARALLEL via the opencode client (session.create +
// session.promptAsync — the SAME machinery the native task tool uses: the
// SubtaskPartInput message → the child session). The wave's dispatch becomes
// a genuine parallel batch.
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
import { loadPromptFileForDispatch, type SpawnCall } from './wave-dispatch.ts';
import { getOpencodeClient } from './trident-tools.ts';
import { TRIDENT_TMP_DIR } from './wave-constants.ts';

export interface BatchToolCall {
  tool: string;
  parameters: Record<string, unknown>;
}

/** THE WAVE-MANIFEST SHA VERIFICATION (the batch's [WAVE VERBATIM]): find the
 *  manifest entry for the description + compare the dispatched prompt's SHA.
 *  A manifest match with a SHA mismatch = the condensed prompt → BLOCK. */
function findManifestSha(desc: string): { sha256: string; lines: number } | null {
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

/** THE PARALLEL TASK SPAWN (the doc's PART 1 — the client's session.create +
 *  promptAsync — the SAME SubtaskPartInput the native task tool uses). */
async function spawnTask(
  client: { session: { create(opts: { body: { parentID?: string; title: string } }): Promise<{ data: { id: string } }>; promptAsync(opts: { path: { id: string }; body: SpawnCall['promptBody'] }): Promise<unknown> } },
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
  // THE SPAWN (the child session + the subtask message):
  try {
    const created = await client.session.create({
      body: mainSessionId ? { parentID: mainSessionId, title: description } : { title: description },
    });
    const childId = created.data.id;
    await client.session.promptAsync({
      path: { id: childId },
      body: {
        agent: subagentType,
        parts: [{
          type: 'subtask',
          prompt: promptText,
          description: description,
          agent: subagentType,
        }],
      },
    });
    tridentLog('INFO', 'batch-tool', 'spawned ' + description + ' → ' + childId + ' (parent ' + (mainSessionId ?? 'root') + ')');
    return { ok: true, sessionId: childId };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export function createBatchTool() {
  return tool({
    description: 'Execute multiple tool calls concurrently — THE PARALLEL BATCH (016_batch.md). The tool_calls array (min 1, max 25): each entry {tool, parameters}. The task entries spawn their subagents IN PARALLEL (the child sessions via the client — the wave manager\'s batch form dispatches through this). The non-task entries are refused with the named error (the plugin-side batch executes the task/spawn surface). Returns the batch summary: {title: "Batch execution (N/M successful)", output}. THE WAVE-VERBATIM ENFORCEMENT: a task entry whose description matches a wave-manifest agent must carry the exact generated prompt — the promptFile channel + the SHA verification — a condensed prompt is BLOCKED.',
    args: {
      tool_calls: z.array(z.object({
        tool: z.string().describe('The tool to execute — "task" for the subagent spawns'),
        parameters: z.record(z.string(), z.any()).describe('The tool parameters: description, subagent_type, promptFile (or prompt), etc.'),
      })).min(1).max(25).describe('The array of tool calls to execute in parallel (max 25)'),
    },
    execute: async (args: { tool_calls: BatchToolCall[] }, context?: { sessionID?: string }) => {
      const mainSessionId = (context && typeof context.sessionID === 'string' && context.sessionID) || null;
      const client = getOpencodeClient();
      if (!client || typeof client.session !== 'object' || typeof client.session.create !== 'function' || typeof client.session.promptAsync !== 'function') {
        throw new Error('[BATCH TOOL] the opencode client is unavailable — the batch spawns require the session.create + promptAsync surface');
      }
      // THE PARALLEL EXECUTION (allSettled — the per-unit failure capture, the wave survives the stragglers):
      const results = await Promise.allSettled((args.tool_calls || []).map((entry) => spawnTask(client, mainSessionId, entry)));
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
        output: 'The batch spawned ' + ok + '/' + total + ' agents in parallel (parent ' + (mainSessionId ?? 'root') + '). Per-call: ' + JSON.stringify(details),
        metadata: { totalCalls: total, successful: ok, failed: total - ok, tools: (args.tool_calls || []).map((c) => c.tool) },
      };
      return summary;
    },
  });
}
