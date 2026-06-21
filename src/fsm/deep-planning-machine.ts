import { createMachine, assign } from 'xstate';

type DeepPlanningEvent = 
  | { type: 'START' }
  | { type: 'SUBMIT_LAYER1'; count: number }
  | { type: 'SUBMIT_LAYER2'; count: number }
  | { type: 'SUBMIT_LAYER3'; content: string }
  | { type: 'RETRY'; error: string }
  | { type: 'RESET' };

export const deepPlanningMachine = createMachine({
  id: 'deepPlanning',
  initial: 'idle',
  context: { principles: 0, components: 0, contextLibrary: '', error: null },
  states: {
    idle: { on: { START: { target: 'layer1', actions: 'clearError' } } },
    layer1: { entry: 'clearError', on: { SUBMIT_LAYER1: { target: 'layer1Validation', actions: 'setPrinciples' } } },
    layer1Validation: {
      always: [
        // Called by xstate framework — guard callback receives typed context from xstate runtime
        { target: 'layer2', guard: ({ context }) => context.principles >= 3 },
        { target: 'errorState', actions: 'principlesError' },
      ],
    },
    layer2: { on: { SUBMIT_LAYER2: { target: 'layer2Validation', actions: 'setComponents' } } },
    layer2Validation: {
      always: [
        // Called by xstate framework — guard callback receives typed context from xstate runtime
        { target: 'layer3', guard: ({ context }) => context.components >= 5 },
        { target: 'errorState', actions: 'componentsError' },
      ],
    },
    layer3: { on: { SUBMIT_LAYER3: { target: 'layer3Validation', actions: 'setLibrary' } } },
    layer3Validation: {
      always: [
        // Called by xstate framework — guard callback receives typed context from xstate runtime
        { target: 'done', guard: ({ context }) => context.contextLibrary.length > 0 },
        { target: 'errorState', actions: 'libraryError' },
      ],
    },
    errorState: { on: { RETRY: 'layer1', RESET: 'idle' } },
    done: { type: 'final' },
  },
}, {
  actions: {
    clearError: assign({ error: (_) => null }),
    setPrinciples: assign({ principles: ({ event }) => event.count }),
    setComponents: assign({ components: ({ event }) => event.count }),
    setLibrary: assign({ contextLibrary: ({ event }) => event.content }),
    // @ts-expect-error - XState v5 type inference limitation
    principlesError: assign({ error: ({ context }) => `Need >= 3 principles, got ${context.principles}` }),
    // @ts-expect-error - XState v5 type inference limitation
    componentsError: assign({ error: ({ context }) => `Need >= 5 components, got ${context.components}` }),
    // @ts-expect-error - XState v5 type inference limitation
    libraryError: assign({ error: (_) => 'Context library is empty' }),
  },
});
