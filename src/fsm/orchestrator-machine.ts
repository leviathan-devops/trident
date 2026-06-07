import { createMachine, assign } from 'xstate';
import type { OrchestratorContext } from './types.js';

// Simple orchestrator state machine without Map assign (XState v5 cannot type-check Map assign)
// The orchestrator.ts wrapper handles actual Map storage - this just tracks state transitions
type OrchestratorEvent =
  | { type: 'START_SESSION'; sessionId: string }
  | { type: 'SET_MODE'; sessionId: string; mode: string }
  | { type: 'END_SESSION'; sessionId: string }
  | { type: 'ERROR'; sessionId: string; error: string }
  | { type: 'RECOVER' }
  | { type: 'RESET' };

export const orchestratorMachine = createMachine({
  id: 'orchestrator',
  initial: 'idle',
  context: {
    currentSession: null,
    error: null,
    mode: 'idle',
  },
  states: {
    idle: {
      on: {
        START_SESSION: {
          target: 'active',
          actions: assign({ currentSession: ({ event }) => event.sessionId }),
        },
      },
    },
    active: {
      on: {
        SET_MODE: {
          actions: assign({ mode: ({ event }) => event.mode }),
        },
        END_SESSION: {
          target: 'idle',
          actions: assign({ currentSession: () => null }),
        },
        ERROR: {
          target: 'error_state',
          actions: assign({ error: ({ event }) => event.error }),
        },
      },
    },
    error_state: {
      on: {
        RECOVER: { target: 'active', actions: assign({ error: () => null }) },
        RESET: { target: 'idle', actions: assign({ error: () => null, currentSession: () => null }) },
      },
    },
  },
});
