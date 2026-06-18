import { tridentLog } from '../utils.js';

/**
 * Wrap a Set in a runtime readonly Proxy.
 * Traps add/delete/clear so importing code cannot bypass the allowlist.
 */
function createReadonlySet<T>(source: Set<T>): ReadonlySet<T> {
  return new Proxy(source, {
    get(target, prop) {
      if (prop === 'add' || prop === 'delete' || prop === 'clear') {
        throw new Error(
          'Cannot mutate readonly allowlist set — use tool-allowlist.ts to add allowed tools'
        );
      }
      const value = Reflect.get(target, prop);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}

/** Internal mutable set — NOT exported directly (see readonly proxies below). */
const allowedTools = new Set<string>([
  'trident-code-audit',
  'trident-deep-planning',
  'trident-problem-solving',
  'trident-context-synthesis',
  'trident-gate',
  'trident-status',
  'trident-vision',
  'trident-help',
  // Legacy aliases (kept for backward compat with existing artifacts)
  'trident-audit',
  'trident-plan',
  'trident-context',
  'trident-identity',
  'trident-debug',
]);

/** Internal mutable set — NOT exported directly (see readonly proxies below). */
const allowedExternalTools = new Set<string>([
  'read',
  'glob',
  'grep',
  'webfetch',
  // Hive tools — full access (v4.3.2)
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
  'hive_scan',
  'hive-scan',
  'hive_purge',
  'hive-purge',
  'hive_restore',
  'hive-restore',
  'hive_trash_list',
  'hive-trash-list',
  'hive_trash_status',
  'hive-trash-status',
  // Task planning (v4.3.2 — allowed)
  'todowrite',
  // REMOVED 'task' — task enforcement handled by LayerEngine TASK_BLOCK layer (guardian-hook.ts)
  // Three contradictory enforcement points (allowlist=allow, config=deny, guardian=conditional)
  // consolidated to single authority: LayerEngine.
]);

/** Check whether a tool name is in the allowlist. */
function isToolAllowed(toolName: string): boolean {
  if (!toolName || typeof toolName !== 'string') return false;
  const lower = toolName.toLowerCase();
  if (allowedTools.has(lower)) return true;
  if (allowedExternalTools.has(lower)) return true;
  tridentLog('WARN', 'tool-allowlist', `DENIED tool: ${toolName} (not in allowlist)`);
  return false;
}

// ── Readonly exports ──────────────────────────────────────────────
// R14 FIX: These are readonly Proxies, not raw Sets. Any code that
// imports ALLOWED_TOOLS or ALLOWED_EXTERNAL_TOOLS and calls .add(),
// .delete(), or .clear() will throw at runtime, preventing security
// bypass through mutation of the allowlist.
const ALLOWED_TOOLS: ReadonlySet<string> = createReadonlySet(allowedTools);
const ALLOWED_EXTERNAL_TOOLS: ReadonlySet<string> = createReadonlySet(allowedExternalTools);
export { isToolAllowed };
