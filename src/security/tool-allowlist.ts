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
  'task',
  'todowrite',
  'checkpoint',
  'skill',
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
  'memread_session',
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
  'memread_',
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
