import { createMachine, interpret } from 'xstate';
import { tridentLog } from '../../utils.js';

export type AuditMode = 'idle' | 'scanning' | 'analyzing' | 'reporting' | 'failed';
export type AuditEvent = 
  | { type: 'START_SCAN'; targetPath: string }
  | { type: 'SCAN_COMPLETE'; filesFound: number }
  | { type: 'START_ANALYSIS'; mode: string }
  | { type: 'ANALYSIS_COMPLETE'; findings: number }
  | { type: 'START_REPORT'; format: string }
  | { type: 'REPORT_COMPLETE' }
  | { type: 'FAIL'; error: string }
  | { type: 'RESET' };

export interface AuditContext {
  targetPath: string;
  currentLayer: number;
  maxLayers: number;
  filesFound: number;
  findings: number;
  error: string | null;
  startTime: number;
}

const auditMachine = createMachine({
  id: 'audit',
  initial: 'idle',
  context: {
    targetPath: '',
    currentLayer: 0,
    maxLayers: 17,
    filesFound: 0,
    findings: 0,
    error: null,
    startTime: 0,
  },
  states: {
    idle: {
      on: {
        START_SCAN: {
          target: 'scanning',
          actions: ({ context, event }) => {
            context.targetPath = (event as any).targetPath;
            context.startTime = Date.now();
            tridentLog('FSM', 'xstate', `Transition: idle → scanning (${(event as any).targetPath})`);
          },
        },
      },
    },
    scanning: {
      on: {
        SCAN_COMPLETE: {
          target: 'analyzing',
          actions: ({ context, event }) => {
            context.filesFound = (event as any).filesFound;
            tridentLog('FSM', 'xstate', `Transition: scanning → analyzing (${(event as any).filesFound} files)`);
          },
        },
        FAIL: {
          target: 'failed',
          actions: ({ context, event }) => {
            context.error = (event as any).error;
            tridentLog('FSM', 'xstate', `Transition: scanning → failed (${(event as any).error})`);
          },
        },
      },
    },
    analyzing: {
      on: {
        ANALYSIS_COMPLETE: {
          target: 'reporting',
          actions: ({ context, event }) => {
            context.findings = (event as any).findings;
            tridentLog('FSM', 'xstate', `Transition: analyzing → reporting (${(event as any).findings} findings)`);
          },
        },
        FAIL: {
          target: 'failed',
          actions: ({ context, event }) => {
            context.error = (event as any).error;
            tridentLog('FSM', 'xstate', `Transition: analyzing → failed (${(event as any).error})`);
          },
        },
      },
    },
    reporting: {
      on: {
        REPORT_COMPLETE: {
          target: 'idle',
          actions: {
            type: 'logReportComplete',
          },
        },
        FAIL: {
          target: 'failed',
          actions: ({ context, event }) => {
            context.error = (event as any).error;
          },
        },
      },
    },
    failed: {
      on: {
        RESET: {
          target: 'idle',
          actions: ({ context }) => {
            context.error = null;
            context.currentLayer = 0;
            tridentLog('FSM', 'xstate', 'Transition: failed → idle (reset)');
          },
        },
      },
    },
  },
});

export class AuditFSM {
  private service: any;
  private actor: any;

  constructor() {
    this.actor = interpret(auditMachine);
    this.service = this.actor;
  }

  start() {
    this.actor.start();
    tridentLog('INFO', 'xstate-fsm', 'AuditFSM started');
    return this;
  }

  send(event: AuditEvent) {
    this.actor.send(event);
  }

  getState(): string {
    return this.actor.getSnapshot()?.value as string || 'unknown';
  }

  getContext(): AuditContext {
    return this.actor.getSnapshot()?.context as AuditContext;
  }

  isRunning(): boolean {
    const state = this.getState();
    return state !== 'idle' && state !== 'failed';
  }

  stop() {
    this.actor.stop();
    tridentLog('INFO', 'xstate-fsm', 'AuditFSM stopped');
  }

  /** Convenience: run full audit cycle */
  async runFullCycle(targetPath: string): Promise<{ state: string; context: AuditContext }> {
    this.send({ type: 'START_SCAN', targetPath });
    // Simulate scan
    this.send({ type: 'SCAN_COMPLETE', filesFound: 42 });
    this.send({ type: 'START_ANALYSIS', mode: 'full' });
    this.send({ type: 'ANALYSIS_COMPLETE', findings: 7 });
    this.send({ type: 'START_REPORT', format: 'markdown' });
    this.send({ type: 'REPORT_COMPLETE' });
    tridentLog('INFO', 'xstate-fsm', `Audit cycle complete for ${targetPath}`);
    return { state: this.getState(), context: this.getContext() };
  }
}
