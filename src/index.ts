import type { PluginInput, Hooks } from '@opencode-ai/plugin';
import { appendFileSync } from 'node:fs';
import { orchestrator } from './orchestrator.js';
import { createTridentHooks } from './hooks/trident-hooks.js';
import { createTridentTools } from './tools/trident-tools.js';
import { TRIDENT_AGENTS, getAgentConfig } from './agents/definitions.js';
import { getEvidenceStore, tridentLog } from './utils.js';
import { registerWarheadHooks, synthesizeT1Injectables } from './shared/trident-warhead-synthesizer.js';

// MODULE-LEVEL DEBUG: Fires when this module is imported/loaded
try { process.stderr.write('[TRIDENT_DEBUG] MODULE_LOADED\n'); } catch { /* Debug logging non-fatal — plugin loading continues regardless */ }
try {
  appendFileSync('/tmp/trident-hook-debug.log', `[${Date.now()}] MODULE_LOADED: trident plugin module imported\n`);
} catch(_e) {
  try { process.stderr.write('[TRIDENT_DEBUG] MODULE_LOADED_FS_FAILED: ' + (_e as Error).message + '\n'); } catch { /* Debug logging non-fatal — plugin loading continues regardless */ }
}

export default async function TridentPlugin(input: PluginInput): Promise<Hooks> {
  // DEBUG: Plugin entry point trace
  try { appendFileSync('/tmp/trident-hook-debug.log', `[${Date.now()}] PLUGIN_ENTRY: function called\n`); } catch { /* Debug logging non-fatal — plugin loading continues regardless */ }
  const sessionId = (input as { sessionID?: string })?.sessionID || 'default';
  orchestrator.setSession(sessionId);

  // v4.3.3: Initialize warhead intelligence system (restores NLP, evidence, persistence, etc.)
  try {
    await registerWarheadHooks();
    tridentLog('INFO', 'plugin', 'Warhead system initialized');
  } catch (e) {
    tridentLog('WARN', 'plugin', `Warhead init failed (non-fatal): ${(e as Error).message}`);
  }

  const hooks = createTridentHooks();
  const tools = createTridentTools();

  // Wrap all hooks with debug logging
  const wrappedHooks: Record<string, any> = {};
  for (const [key, hookFn] of Object.entries(hooks)) {
    wrappedHooks[key] = async (...args: unknown[]) => {
      try {
        appendFileSync('/tmp/trident-hook-debug.log', `[${Date.now()}] HOOK_CALLED: ${key}\n`);
        const result = await (hookFn as Function)(...args);
        appendFileSync('/tmp/trident-hook-debug.log', `[${Date.now()}] HOOK_COMPLETE: ${key}\n`);
        return result;
      } catch (e) {
        appendFileSync('/tmp/trident-hook-debug.log', `[${Date.now()}] HOOK_ERROR: ${key} | ${(e as Error).message}\n`);
        throw e;
      }
    };
  }

  const result = {
    ...wrappedHooks,

    tool: {
      ...tools,
    },

    config: async (opencodeConfig: Record<string, any>) => {
      try {
        appendFileSync('/tmp/trident-hook-debug.log', `[${Date.now()}] CONFIG_CALLED\n`);
        if (!opencodeConfig.agent) {
          opencodeConfig.agent = {};
        }
        const configs = getAgentConfig();
        configs['trident'] = {
          ...configs['trident'],
          description: 'TRIDENT v4.3.3 — Algorithmic Audit Engine. Allowed: all trident-* tools, task, read, glob, grep, webfetch, question, hive_*. Blocked: edit, write, bash, terminal, exec, todowrite, spawn_*.',
          instructions: (configs['trident']?.instructions || '') + '\n\nAllowed: all trident-* tools, task, read, glob, grep, webfetch, question, hive_*. Blocked: edit, write, bash, terminal, exec, todowrite, spawn_*.',
          permission: {
            '*': 'allow',
          },
        };
        Object.assign(opencodeConfig.agent, configs);
        appendFileSync('/tmp/trident-hook-debug.log', `[${Date.now()}] CONFIG_COMPLETE\n`);
      } catch {
        tridentLog('WARN', 'plugin', 'Config hook failed (non-fatal)');
      }
    },
  } as Hooks;

  // DEBUG: Log registered hook keys
  try {
    const hookKeys = Object.keys(result).filter(k => k !== 'tool' && k !== 'config');
    appendFileSync('/tmp/trident-hook-debug.log', `[${Date.now()}] PLUGIN_RETURN: hooks=${hookKeys.join(',')} | tool_count=${Object.keys(result.tool || {}).length}\n`);
  } catch { /* Debug logging non-fatal — plugin loading continues regardless */ }

  return result;
}
