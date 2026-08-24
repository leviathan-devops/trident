import { tridentLog } from '../utils.js';

const ALLOWED_TOOLS = new Set([
  'trident-audit',
  'trident-status',
  'trident-help',
  'trident-gate',
  'trident-code-audit',
  'trident-deep-planning',
  'trident-problem-solving',
  'trident-context-synthesis',
  'trident-ship-package',
  'trident-poseidon',
  'build-status',
  // trident-vision REMOVED — replaced by zai-vision_* and visual-cortex_* MCP tools
]);

const ALLOWED_EXTERNAL_TOOLS = new Set([
  'read',
  'glob',
  'grep',
  'webfetch',
  'question',
  // THE NATIVE TASK TOOL (the 2026-08-14 revert — the trident-task tangent
  // UNDONE): the batch form emits the native task tool + the promptFile
  // channel; the T.E.B. loader hook (trident-hooks.ts:1741) injects the
  // file's byte-exact content into the prompt BEFORE the runtime executes.
  // The native task tool runs background.start() (the job registry +
  // task_status + the result injection — the PROVEN working baseline).
  'task',
  // task_status REMOVED (2026-08-16 — the FALSE-LIVENESS incident): the
  // runtime's background-JOB poll reported 'cancelled' for TWO LIVE streaming
  // sessions (the loop-killer + the memory-repair subagents were writing
  // files while the job registry said cancelled) — the false read nearly
  // caused a useless re-dispatch. THE SESSION STREAM IS THE ONLY LIVENESS
  // TRUTH: trident-wave-manager action=status sessionId=<id> + the dedicated
  // trident-wave-read tool read the session parts directly (the opencode.db)
  // — NEVER the job registry. The completion payload is visible via the
  // session stream (the final text/result part). The wave manager + the
  // wave-read tool fully cover subagent management; the native poll is gone.
  'todowrite',
  'checkpoint',
  'skill',
  // THE BATCH TOOL (2026-08-10 — the operator: "WHY IS THIS NOT IN YOUR
  // FUCKING ALLOWLIST"): the runtime's native parallel-dispatch tool (the
  // wave manager's batch form dispatches through it — the canonical subtask
  // path). It was NEVER admitted to the plugin's allowlist — the wave
  // dispatch deadlocked on the missing admission. 016_batch.md documents it:
  // tool_calls array (max 25), parallel execution, partial failures.
  'batch',
  // Hive Mind Plugin (2.2-hotfix) — underscore names only, matching actual plugin registration
  'hive_context',
  'hive_status',
  'hive_remember',
  'hive_scan',
  'hive_forget',
  'hive_purge',
  'hive_restore',
  'hive_trash_list',
  'hive_trash_status',
  'memlink_parent',
]);

// Prefix-based allowlist — any tool starting with these prefixes is auto-allowed.
// This future-proofs against tool name changes within known namespaces.
const ALLOWED_TOOL_PREFIXES = [
  'trident-',
  'reasoning-bus_',
  'visual-cortex_',
  'zai-vision_',
  'pdf-reader_',
  'vc-browser_',
  'vc-fetch_',
  'hive_',
  'memlink_',
];

// R10 FIX: Exported so the AST call-graph engine can trace invocation from trident-hooks.ts
export function isToolAllowed(toolName: string): boolean {
  if (!toolName || typeof toolName !== 'string') return false;
  const lower = toolName.toLowerCase();
  if (ALLOWED_TOOLS.has(lower)) return true;
  if (ALLOWED_EXTERNAL_TOOLS.has(lower)) return true;
  for (const prefix of ALLOWED_TOOL_PREFIXES) {
    if (lower.startsWith(prefix)) return true;
  }
  tridentLog('WARN', 'tool-allowlist', `DENIED tool: ${toolName} (not in allowlist)`);
  return false;
}

export { ALLOWED_TOOLS, ALLOWED_EXTERNAL_TOOLS };
