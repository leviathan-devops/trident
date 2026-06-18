// Backward-compatibility stub for deep-planning-state-machine.ts
// Original was deleted in Phase 1 (replaced by XState fsm/deep-planning-machine.ts)
// This file provides the same API for existing consumers

export interface Layer1Result {
  principles: Array<{ name: string; statement: string; constraints: string[]; successCriteria: string[] }>;
  openQuestions: string[];
}

export interface Layer2Result {
  components: Array<{ name: string; description: string; dependencies: string[]; failureModes: string[]; verificationSteps: string[] }>;
  sequencing: string[];
  dependencyGraph: Record<string, string[]>;
}

export interface Layer3Result {
  contextLibrary: string;
  manifest: Record<string, unknown>;
}

export interface LayerGateResult {
  passed: boolean;
  missing: string[];
  guidance: string;
}

export class DeepPlanningStateMachine {
  private principles: Layer1Result['principles'] = [];
  private components: Layer2Result['components'] = [];
  private contextLibrary = '';

  validateLayerContent(layer: number, input: string): { valid: boolean; missing: string[] } {
    switch (layer) {
      case 1: {
        const lines = input.split('\n').filter((l: string) => l.trim().length > 0);
        return { valid: lines.length >= 3, missing: lines.length < 3 ? ['Need >= 3 principles'] : [] };
      }
      case 2: {
        const hasComponents = input.includes('component') || input.includes('Component');
        return { valid: hasComponents, missing: hasComponents ? [] : ['Need component definitions'] };
      }
      case 3: {
        return { valid: input.length > 0, missing: input.length === 0 ? ['Context library is empty'] : [] };
      }
      default:
        return { valid: false, missing: ['Unknown layer'] };
    }
  }
}

export const deepPlanningStateMachine = new DeepPlanningStateMachine();
