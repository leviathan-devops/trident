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
]);

const ALLOWED_EXTERNAL_TOOLS = new Set([
  'read',
  'glob',
  'grep',
  'webfetch',
  'hive_context',
  'hive-context',
  'hive_status',
  'hive-status',
  'hive_context_absorb',
  'hive-context-absorb',
]);

function isToolAllowed(toolName: string): boolean {
  if (!toolName || typeof toolName !== 'string') return false;
  const lower = toolName.toLowerCase();
  if (ALLOWED_TOOLS.has(lower)) return true;
  if (ALLOWED_EXTERNAL_TOOLS.has(lower)) return true;
  tridentLog('WARN', 'tool-allowlist', `DENIED tool: ${toolName} (not in allowlist)`);
  return false;
}

export { isToolAllowed, ALLOWED_TOOLS, ALLOWED_EXTERNAL_TOOLS };
