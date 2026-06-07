import type { PluginInput, Hooks } from '@opencode-ai/plugin';
import { orchestrator } from './orchestrator.js';
import { createTridentHooks } from './hooks/trident-hooks.js';
import { createTridentTools } from './tools/trident-tools.js';
import { TRIDENT_AGENTS, getAgentConfig } from './agents/definitions.js';
import { detectIntent } from './nlp/intent-parser.js';
import { streamingParser } from './nlp/streaming-buffer.js';
import { extractPrinciplesFromText } from './nlp/principle-extractor.js';
import { getEvidenceStore, tridentLog } from './utils.js';

export default async function TridentPlugin(input: PluginInput): Promise<Hooks> {
  const sessionId = (input as any)?.sessionID || 'default';
  orchestrator.setSession(sessionId);

  const hooks = createTridentHooks();
  const tools = createTridentTools();

  return {
    ...hooks,

    detectIntent,
    streamingParser,
    extractPrinciplesFromText,
    tridentLog,
    getEvidenceStore,

    tool: {
      ...tools,
    },

    config: async (opencodeConfig: Record<string, any>) => {
      if (!opencodeConfig.agent) {
        opencodeConfig.agent = {};
      }
      const configs = getAgentConfig();
      configs['trident'] = {
        ...configs['trident'],
        description: 'TRIDENT v4.3.1-T3 — Algorithmic Audit Engine. XState-powered, NLP-driven, Merkle-verified. Blocked: edit/write/bash, task, todowrite, hive write, spawn tools.',
        instructions: (configs['trident']?.instructions || '') + '\n\nBlocked: edit/write/bash, task, todowrite, hive write, spawn tools.',
        permission: { task: 'deny' },
      };
      Object.assign(opencodeConfig.agent, configs);
    },
  } as any;
}
