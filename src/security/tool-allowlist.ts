import { tridentLog } from '../utils.js';

const ALLOWED_TOOLS = new Set([
  'trident-audit',
  'trident-status',
  'trident-help',
  'trident-vision',
  'trident-gate',
  'trident-code-audit',
  'trident-deep-planning',
  'trident-problem-solving',
  'trident-context-synthesis',
  'trident-poseidon',
  'build-status',
]);

const ALLOWED_EXTERNAL_TOOLS = new Set([
  'read',
  'glob',
  'grep',
  'webfetch',
  'question',
  'task',
  'todowrite',
  'hive_context',
  'hive-context',
  'hive_status',
  'hive-status',
  'hive_context_absorb',
  'hive-context-absorb',
  'hive_remember',
  'hive-remember',
  'hive_forget',
  'hive-forget',
  'hive_purge',
  'hive-purge',
  'hive_restore',
  'hive-restore',
  'hive_scan',
  'hive-scan',
  'hive_trash_list',
  'hive-trash-list',
  'hive_trash_status',
  'hive-trash-status',
]);

// Prefix-based allowlist — any tool starting with these prefixes is auto-allowed.
// This future-proofs against tool name changes within known namespaces.
const ALLOWED_TOOL_PREFIXES = [
  'reasoning-bus_',
  'vc-visual-mcp_',
];

// Called from trident-hooks.ts toolBeforeHook — isToolAllowedAllowlist(toolName) at line 499
function isToolAllowed(toolName: string): boolean {
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

export { isToolAllowed, ALLOWED_TOOLS, ALLOWED_EXTERNAL_TOOLS };
