import type { PluginInput, Hooks } from '@opencode-ai/plugin';
import { orchestrator } from './orchestrator.js';
import { createTridentHooks } from './hooks/trident-hooks.js';
import { createTridentTools } from './tools/trident-tools.js';
import { TRIDENT_AGENTS, getAgentConfig } from './agents/definitions.js';
import { getEvidenceStore, tridentLog } from './utils.js';

export default async function TridentPlugin(input: PluginInput): Promise<Hooks> {
  if (typeof input !== 'object' || input === null) return {} as Hooks; // input not an object — skip
  const sessionId = (input as Record<string, unknown>)?.sessionID as string || 'default';
  orchestrator.setSession(sessionId);

  const hooks = createTridentHooks();
  const tools = createTridentTools();

  return {
    ...hooks,

    tool: {
      ...tools,
    },

    config: async (opencodeConfig: Record<string, unknown>) => {
      if (!opencodeConfig.agent) {
        opencodeConfig.agent = {};
      }

      const agent = opencodeConfig.agent as Record<string, unknown>;
      agent['trident'] = {
        mode: 'primary',
        description: 'Trident v4.3.2 — Code audit and analysis engine.',
        instructions: ((getAgentConfig()['trident'] as Record<string, unknown>)?.instructions as string || '') + '\n\nBlocked: edit/write/bash, hive write.',
        permission: {
          // REMOVED task: 'deny' — task enforcement consolidated to LayerEngine TASK_BLOCK layer
          // Single authority prevents contradictory enforcement (Finding #2 fix)
          read: 'allow',
          glob: 'allow',
          grep: 'allow',
          hive_context: 'allow',
          webfetch: 'allow',
          'trident-code-audit': 'allow',
          'trident-deep-planning': 'allow',
          'trident-problem-solving': 'allow',
          'trident-context-synthesis': 'allow',
          'trident-gate': 'allow',
          'trident-status': 'allow',
          'trident-vision': 'allow',
          'trident-help': 'allow',
          write: 'deny',
          edit: 'deny',
          bash: 'deny',
          todowrite: 'allow',
        },
      };

      agent['trident_explore'] = {
        mode: 'subagent',
        description: 'Trident Explore v4.3.2 — Read-only context ingestion subagent.',
        permission: {
          read: 'allow',
          glob: 'allow',
          grep: 'allow',
          hive_context: 'allow',
          'trident-help': 'allow',
          'trident-status': 'allow',
          '*': 'deny',
        },
      };
    },
  };
}
