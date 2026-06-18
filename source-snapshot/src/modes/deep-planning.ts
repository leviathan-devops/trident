import { orchestrator, TridentMode } from '../orchestrator.js';
import { LayerConfig, DEEP_PLANNING_LAYERS, WHY_EXPLANATIONS, HOW_EXPLANATIONS } from '../types.js';
import {
  deepPlanningStateMachine,
  DeepPlanningStateMachine,
  Layer1Result,
  Layer2Result,
  Layer3Result,
  LayerGateResult,
} from './deep-planning-state-machine.js';

interface DeepPlanningArtifact {
  layer: number;
  name: string;
  content: string;
  requirements: string[];
  thinking: string;
}

class DeepPlanningModule {
  private layers: LayerConfig[];
  private stateMachine: DeepPlanningStateMachine;

  constructor() {
    this.layers = DEEP_PLANNING_LAYERS;
    this.stateMachine = deepPlanningStateMachine;
  }

  getLayerConfig(layer: number): LayerConfig | undefined {
    return this.layers.find((l: LayerConfig) => l.number === layer);
  }

  getCurrentLayerThinking(): string {
    const layer = orchestrator.getState()?.currentLayer ?? 1;
    const config = this.getLayerConfig(layer);
    return config?.thinking || 'Unknown';
  }

  buildLayer1Template(): string {
    return `# LAYER 1: INITIAL PLAN

## Surface Understanding
[What's being asked, explained in MY OWN WORDS - not echoing the prompt]

## First Principles
[3+ non-negotiable truths that govern this domain]

1. [Principle 1]
2. [Principle 2]
3. [Principle 3]

## Constraints
[3+ limits - what MUST be true]

- [Constraint 1]
- [Constraint 2]
- [Constraint 3]

## Success Criteria
[How we know we've succeeded - measurable outcomes]

## Open Questions
[2+ things we don't yet know - honest acknowledgment]

## Direction
[Initial approach based on first principles]
`;
  }

  buildLayer2Template(): string {
    return `# LAYER 2: DETAILED WORKFLOW

## Components (5+)
[Break the problem into 5+ distinct components]

1. [Component 1]
2. [Component 2]
3. [Component 3]
4. [Component 4]
5. [Component 5]

## Sequencing
[What must come BEFORE what - critical path]

## Dependencies
[What relies on what]

## Failure Modes (3+)
[3+ ways this could fail]

1. [Failure mode 1]
2. [Failure mode 2]
3. [Failure mode 3]

## Verification Strategy
[How to verify EACH component works]
`;
  }

  buildLayer3Template(): string {
    return `# LAYER 3: SELF-CONTAINED CONTEXT LIBRARY

## Architecture
[How everything fits together - diagram + explanation]

## Interfaces
[What talks to what - precise contracts]

## State Management
[What persists, how, where]

## Error Handling
[What can go wrong at each layer]

## Testing Strategy
[How we know it works]

## Mental Model
[The simplest way to think about this entire system]
`;
  }

  generateArtifact(layer: number, userContent: string): string {
    const config = this.getLayerConfig(layer);
    if (!config) return 'Error: invalid layer';

    let content = '';
    switch (layer) {
      case 1:
        content = this.mergeLayer1Content(userContent);
        break;
      case 2:
        content = this.mergeLayer2Content(userContent);
        break;
      case 3:
        content = this.mergeLayer3Content(userContent);
        break;
    }

    orchestrator.getState().artifacts.set(`layer${layer}`, content);
    return content;
  }

  private mergeLayer1Content(userContent: string): string {
    return `# LAYER 1: INITIAL PLAN

${userContent}

---

**Thinking:** "${this.getCurrentLayerThinking()}"
**Gate:** MUST have 3+ first principles, surface understanding, constraints, success criteria, open questions
`;
  }

  private mergeLayer2Content(userContent: string): string {
    return `# LAYER 2: DETAILED WORKFLOW

${userContent}

---

**Thinking:** "${this.getCurrentLayerThinking()}"
**Gate:** MUST have 5+ components, sequencing, dependencies, 3+ failure modes, verification
`;
  }

  private mergeLayer3Content(userContent: string): string {
    return `# LAYER 3: SELF-CONTAINED CONTEXT LIBRARY

${userContent}

---

**Thinking:** "${this.getCurrentLayerThinking()}"
**Gate:** MUST have architecture, interfaces, state management, error handling - injectable to another agent
`;
  }

  getWhyExplanation(layer: number): string {
    return WHY_EXPLANATIONS[`LAYER_${layer}`] || '';
  }

  getHowExplanation(layer: number): string {
    return HOW_EXPLANATIONS[`LAYER_${layer}`] || '';
  }

  validateLayerContent(layer: number, content: string): { valid: boolean; missing: string[] } {
    const missing: string[] = [];
    const msg = content.toLowerCase();

    switch (layer) {
      case 1:
        if (!msg.includes('first principle')) missing.push('First Principles (3+)');
        if (!msg.includes('surface understanding') && !msg.includes('own word')) missing.push('Surface Understanding');
        if (!msg.includes('constraint')) missing.push('Constraints (3+)');
        if (!msg.includes('success criteria')) missing.push('Success Criteria');
        if (!msg.includes('open question')) missing.push('Open Questions (2+)');
        break;
      case 2:
        if (!msg.includes('component')) missing.push('Components (5+)');
        if (!msg.includes('sequence')) missing.push('Sequencing');
        if (!msg.includes('dependenc')) missing.push('Dependencies');
        if (!msg.includes('failure mode')) missing.push('Failure Modes (3+)');
        if (!msg.includes('verification')) missing.push('Verification Strategy');
        break;
      case 3:
        if (!msg.includes('architecture')) missing.push('Architecture');
        if (!msg.includes('interface')) missing.push('Interfaces');
        if (!msg.includes('state')) missing.push('State Management');
        if (!msg.includes('error')) missing.push('Error Handling');
        break;
    }

    return { valid: missing.length === 0, missing };
  }


  getStateMachine(): DeepPlanningStateMachine {
    return this.stateMachine;
  }
}

export const deepPlanningModule = new DeepPlanningModule();
