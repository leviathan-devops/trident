import { createMachine, assign } from 'xstate';

type ProblemSolvingEvent =
  | { type: 'SUBMIT_ASSUMPTION' }
  | { type: 'SUBMIT_ACTION' }
  | { type: 'SUBMIT_OBSERVATION' }
  | { type: 'SUBMIT_GAP' }
  | { type: 'SUBMIT_META' }
  | { type: 'SUBMIT_VERIFICATION' }
  | { type: 'RESET' };

export const problemSolvingMachine = createMachine({
  id: 'problemSolving',
  initial: 'idle',
  context: { iteration: 0, error: null },
  states: {
    idle: { on: { SUBMIT_ASSUMPTION: { target: 'assumption', actions: assign({ iteration: ({ context }) => context.iteration + 1 }) } } },
    assumption: { on: { SUBMIT_ACTION: { target: 'action' } } },
    action: { on: { SUBMIT_OBSERVATION: { target: 'observation' } } },
    observation: { on: { SUBMIT_GAP: { target: 'gap' } } },
    gap: { on: { SUBMIT_META: { target: 'meta' } } },
    meta: { on: { SUBMIT_VERIFICATION: { target: 'verification' } } },
    verification: { on: { SUBMIT_ASSUMPTION: { target: 'assumption', actions: assign({ iteration: ({ context }) => context.iteration + 1 }) }, RESET: 'idle' } },
    error_state: { on: { RETRY: 'assumption', RESET: 'idle' } },
  },
});
