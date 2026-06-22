import type { PluginInput, Hooks } from '@opencode-ai/plugin';
import { appendFileSync } from 'node:fs';
import { orchestrator } from './orchestrator.js';
import { createTridentHooks } from './hooks/trident-hooks.js';
import { createTridentTools } from './tools/trident-tools.js';
import { TRIDENT_AGENTS, getAgentConfig } from './agents/definitions.js';
import { getEvidenceStore, tridentLog } from './utils.js';
import { setCurrentAgent, getCurrentAgent } from './hooks/agent-state.js';
import { isTridentBuildAgent } from './identity/agent-identity.js';
import { registerWarheadHooks } from './shared/trident-warhead-synthesizer.js';
import { TRIDENT_BUILD_T1 } from './subagents/trident-build/identity/t1-prompt.js';
import { createTridentBuildHooks } from './subagents/trident-build/hooks/index.js';
import { createBuildStatusTool } from './subagents/trident-build/tools/build-status.js';

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

  // Merge Trident_Build subagent enforcement hooks (BuildFirewall)
  // These handle plan scope validation, AST analysis, and evidence chain
  // for the trident_build subagent.
  // R12 CROSS_PLUGIN: Build hooks fire for all agents by design.
  // BuildFirewall validates isTridentBuildAgent() internally before enforcing build rules.
  // Non-build agents pass through without any BuildFirewall enforcement applied.
  const buildHooks = createTridentBuildHooks();

  // Chain tool.execute.before: handle build subagent specially
  // BuildFirewall runs first for all agents (it's gated by isTridentBuildAgent internally).
  // For trident_build subagent: skip Trident's write blocks (BuildFirewall handles enforcement).
  // For trident agent: run original enforcement as normal.
  if (buildHooks['tool.execute.before']) {
    const buildBefore = buildHooks['tool.execute.before'] as Function;
    const originalBefore = hooks['tool.execute.before'] as Function;
    hooks['tool.execute.before'] = async (...args: unknown[]) => {
      const input = args[0] as Record<string, unknown>;
      const sid = input.sessionID as string || 'default';
      const agentFromInput = (input.agent as string) || (input.agentName as string) || '';
      
      // Propagate agent identity from input metadata if not yet in state store
      // This handles subagent dispatches where chat.message doesn't fire
      if (agentFromInput && !getCurrentAgent(sid)) {
        setCurrentAgent(agentFromInput, sid);
      }
      
      // Run BuildFirewall first — it gates on isTridentBuildAgent internally
      await buildBefore(...args);
      
      // For build subagent: skip Trident's tool blocks (BuildFirewall handles enforcement)
      const currentAgent = getCurrentAgent(sid);
      if (currentAgent && currentAgent.indexOf('build') !== -1 && isTridentBuildAgent(currentAgent)) {
        return; // BuildFirewall ran — Trident's write blocks would kill the build
      }
      
      // For Trident agent: run original enforcement
      return originalBefore(...args);
    };
  }

  // Chain tool.execute.after: run BuildFirewall after-hook first, then Trident's original hook
  if (buildHooks['tool.execute.after']) {
    const buildAfter = buildHooks['tool.execute.after'] as Function;
    const originalAfter = hooks['tool.execute.after'] as Function;
    hooks['tool.execute.after'] = async (...args: unknown[]) => {
      await buildAfter(...args);
      return originalAfter(...args);
    };
  }

  const tools = createTridentTools();

  // Wrap all hooks with debug logging
  const wrappedHooks: Record<string, (...args: unknown[]) => Promise<unknown>> = {};
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
      'build-status': createBuildStatusTool(),
    },

    config: async (opencodeConfig: Record<string, unknown>) => {
      try {
        appendFileSync('/tmp/trident-hook-debug.log', `[${Date.now()}] CONFIG_CALLED\n`);
        if (!opencodeConfig.agent) {
          opencodeConfig.agent = {};
        }
        const agentConfig = opencodeConfig.agent as Record<string, unknown>;
        const configs = getAgentConfig();
        configs['trident'] = {
          ...configs['trident'],
          description: 'TRIDENT v4.3.3 — Algorithmic Audit Engine. Allowed: all trident-* tools, task, read, glob, grep, webfetch, question, hive_*, vc-visual-mcp_*, reasoning-bus_*. Blocked: edit, write, bash, terminal, exec, mcp_write, mcp_edit.',
          instructions: (configs['trident']?.instructions || '') + '\n\nAllowed: all trident-* tools, task, read, glob, grep, webfetch, question, hive_*, vc-visual-mcp_*, reasoning-bus_*. Blocked: edit, write, bash, terminal, exec, mcp_write, mcp_edit.',
          permission: {
            '*': 'allow',
          },
        };

        // NEW: Trident_Build subagent registration
        configs['trident_build'] = {
          name: 'trident_build',
          description: 'Trident Build — Runtime-grade build engineer. Executes remediation plans verbatim. DO NOT THINK. DO NOT DEVIATE.',
          instructions: TRIDENT_BUILD_T1,
          mode: 'subagent',
          color: '#0066CC',
          permission: { task: 'allow' },
          tools: {
            'read': true, 'write': true, 'edit': true, 'bash': true,
            'glob': true, 'grep': true, 'task': true,
          },
        };
        Object.assign(agentConfig, configs);
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
