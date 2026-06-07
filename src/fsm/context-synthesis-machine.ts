import { createMachine, assign } from 'xstate';

type ContextSynthesisEvent =
  | { type: 'COLLECT'; context: string }
  | { type: 'SCORE' }
  | { type: 'COMPRESS'; compressed: string }
  | { type: 'FORMAT'; sections: string[] }
  | { type: 'RETRY'; error: string }
  | { type: 'RESET' };

export const contextSynthesisMachine = createMachine({
  id: 'contextSynthesis',
  initial: 'idle',
  context: { rawContext: '', compressed: '', tokenBudget: 4000, currentTokens: 0, error: null },
  states: {
    idle: { on: { COLLECT: { target: 't1_collection', actions: 'setRawContext' } } },
    t1_collection: { on: { SCORE: { target: 't2_scoring' } } },
    t2_scoring: { on: { COMPRESS: { target: 't3_compression', actions: 'setCompressed' } } },
    t3_compression: {
      always: [
        { target: 't4_format', guard: ({ context }) => context.currentTokens <= context.tokenBudget },
        { target: 'errorState', actions: 'overBudget' },
      ],
    },
    t4_format: { on: { FORMAT: { target: 'done', actions: 'setSections' } } },
    errorState: { on: { RETRY: 't1_collection', RESET: 'idle' } },
    done: { type: 'final' },
  },
}, {
  actions: {
    setRawContext: assign({ rawContext: ({ event }) => event.context }),
    setCompressed: assign({ compressed: ({ event }) => event.compressed }),
    // @ts-expect-error - XState v5 type inference limitation
    setSections: assign({ sections: ({ event }) => event.sections }),
    // @ts-expect-error - XState v5 type inference limitation
    overBudget: assign({ error: ({ context }) => `Token budget exceeded: ${context.currentTokens}/${context.tokenBudget}` }),
  },
});
