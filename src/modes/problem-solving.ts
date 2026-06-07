import { orchestrator } from '../orchestrator.js';
import { LayerConfig, PROBLEM_SOLVING_LAYERS } from '../types.js';
import {
  problemSolvingStateMachine,
  ProblemSolvingStateMachine,
  AssumptionState,
  ActionState,
  ObservationState,
  GapState,
  MetaState,
  VerificationState,
} from './problem-solving-state-machine.js';

export interface ProblemSolvingArtifact {
  layer: number;
  name: string;
  content: string;
  requirements: string[];
  thinking: string;
  iteration: string;
}

export class ProblemSolvingModule {
  private layers: LayerConfig[];
  private stateMachine: ProblemSolvingStateMachine;

  constructor() {
    this.layers = PROBLEM_SOLVING_LAYERS;
    this.stateMachine = problemSolvingStateMachine;
  }

  getLayerConfig(layer: number): LayerConfig | undefined {
    return this.layers.find(l => l.number === layer);
  }

  getIteration(): number {
    return this.stateMachine.getIteration();
  }

  newIteration(): void {
    this.stateMachine.newIteration();
  }

  buildLayer1Template(): string {
    return `# PROBLEM SOLVING — LAYER 1: ASSUMPTION STATEMENT

## Problem Statement
[What is the problem being solved? Be specific.]

## 1.1 Explicit Assumption
**Assumption:** [State your assumption in ONE clear sentence. What do you believe?]

## 1.2 Reasoning Chain
[Why do you believe this assumption is true?]

1. [Reason 1]
2. [Reason 2]
3. [Reason 3]

## 1.3 Success Criteria
[What would prove this assumption correct? Be specific and observable.]

1. [Criteria 1]
2. [Criteria 2]

## 1.4 Confirmation / Disproof Criteria
**Would confirm:** [What evidence would prove this true]
**Would disprove:** [What evidence would prove this false]

---
**Layer:** 1/6 | **Iteration:** ${this.stateMachine.getIteration()}
**Thinking:** "${this.getLayerConfig(1)?.thinking}"
`;
  }

  buildLayer2Template(): string {
    return `# PROBLEM SOLVING — LAYER 2: ACTION WITH PREDICTION

## 2.1 Exact Command to Run
` + '```' + `
[EXACT command to execute - no placeholders]
` + '```' + `

## 2.2 Expected Output
[What do you expect to happen?]

## 2.3 Environment State
| Variable | Value |
|----------|-------|
| [var] | [value] |

## 2.4 What to Observe
[Specific things to watch for]

---
**Layer:** 2/6 | **Iteration:** ${this.stateMachine.getIteration()}
**Thinking:** "${this.getLayerConfig(2)?.thinking}"
`;
  }

  buildLayer3Template(): string {
    return `# PROBLEM SOLVING — LAYER 3: OBSERVATION & EVIDENCE

## 3.1 Raw Evidence
[COPY-PASTE actual output here - NO paraphrasing]
` + '```' + `
[PASTE ACTUAL OUTPUT]
` + '```' + `

## 3.2 Logs Checked
| Log Source | What Checked | Result |
|------------|--------------|--------|
| [log] | [what] | [found] |

## 3.3 Expected vs Actual Comparison
| Aspect | Expected | Actual | Difference |
|--------|----------|--------|------------|
| [aspect] | [expected] | [actual] | [diff] |

**Rule:** Agent-created evidence = INVALID. Only external system logs count.

---
**Layer:** 3/6 | **Iteration:** ${this.stateMachine.getIteration()}
**Thinking:** "${this.getLayerConfig(3)?.thinking}"
`;
  }

  buildLayer4Template(): string {
    return `# PROBLEM SOLVING — LAYER 4: GAP ANALYSIS

## 4.1 Gap Statement
[What gap exists between expected and actual?]

## Gap Analysis
| Gap | Analysis |
|-----|----------|
| [gap] | [analysis] |

## 4.3 Previous Assumption
[What did we assume? Was it correct?]

## 4.4 Updated Hypothesis
[New understanding. What do we believe NOW?]

## 4.5 Next Action
[What action follows from this insight?]

## 4.6 What to Observe in Next Iteration
[What specific evidence would confirm/disprove new hypothesis?]

---
**Layer:** 4/6 | **Iteration:** ${this.stateMachine.getIteration()}
**Thinking:** "${this.getLayerConfig(4)?.thinking}"
`;
  }

  buildLayer5Template(): string {
    return `# PROBLEM SOLVING — LAYER 5: META-REFLECTION

## 5.1 What I Should Have Done
| Step | What I Did | What I Should Have Done |
|------|------------|------------------------|
| [step] | [actual] | [ideal] |

## 5.2 Pattern Extracted
**Name:** [Pattern name]
**Description:** [Pattern description]
**When to Apply:** [Conditions where this pattern works]

## 5.3 Systemic Issue
**Issue:** [What systemic issue was at play?]
**Why Systemic:** [Why is this a pattern, not a one-off?]
**Fix Needed:** [What structural change prevents recurrence?]

## 5.4 Root Cause vs Symptom
| Finding | Type | Explanation |
|---------|------|-------------|
| [finding] | Root Cause / Symptom | [why] |

---
**Layer:** 5/6 | **Iteration:** ${this.stateMachine.getIteration()}
**Thinking:** "${this.getLayerConfig(5)?.thinking}"
`;
  }

  buildLayer6Template(): string {
    return `# PROBLEM SOLVING — LAYER 6: VERIFICATION

## 6.1 Target Environment
[Where did we test? Container? Host?]

## 6.2 Execution & Result
` + '```' + `
[Actual execution output]
` + '```' + `

## 6.3 Original Requirement
[What was the original problem/requirement?]

## 6.4 Current Behavior
[Does the fix work as expected?]

## 6.5 Requirements Met
| Requirement | Met? | Evidence |
|-------------|------|----------|
| [req] | Yes/No | [evidence] |

## 6.6 Console Errors
[Any errors? NULL if none]

## 6.7 Side Effects
[Any unintended consequences?]

## 6.8 Regression Check
| Component | Status | Notes |
|-----------|--------|-------|
| [comp] | OK/Affected | [notes] |

## 6.9 Final Assessment
**Status:** [Resolved / Partially Resolved / Not Resolved]
**Confidence:** [High / Medium / Low]
**Remaining Issues:** [List or "None"]

---
**Layer:** 6/6 | **Iteration:** ${this.stateMachine.getIteration()}
**Thinking:** "${this.getLayerConfig(6)?.thinking}"
`;
  }

  getLayerRequirements(layer: number): string {
    const config = this.getLayerConfig(layer);
    if (!config) return '';

    let req = `## Layer ${layer}: ${config.name}\n`;
    req += `**Thinking:** "${config.thinking}"\n\n`;
    req += `**Evokes:** ${config.evokes.join(', ')}\n\n`;
    req += `**Requirements:**\n`;
    for (const r of config.requires) {
      const typeStr = r.type === 'number' ? ` (${r.value}+)` : r.type === 'boolean' ? ' (required)' : '';
      req += `- [ ] ${r.field.replace(/_/g, ' ')}${typeStr}\n`;
    }
    return req;
  }

  validateLayerContent(layer: number, content: string): { valid: boolean; missing: string[] } {
    const missing: string[] = [];
    const msg = content.toLowerCase();

    switch (layer) {
      case 1:
        if (!msg.includes('assumption')) missing.push('Explicit Assumption');
        if (!msg.includes('reasoning')) missing.push('Reasoning Chain (3+)');
        if (!msg.includes('success criteria')) missing.push('Success Criteria');
        if (!msg.includes('confirm') && !msg.includes('disprov')) missing.push('Confirmation/Disproof Criteria');
        break;
      case 2:
        if (!msg.includes('command') && !msg.includes('```')) missing.push('Exact Command');
        if (!msg.includes('expected') && !msg.includes('output')) missing.push('Expected Output');
        if (!msg.includes('environ')) missing.push('Environment State');
        break;
      case 3:
        if (!msg.includes('```') && !msg.includes('actual')) missing.push('Raw Evidence (copy-pasted)');
        if (!msg.includes('log')) missing.push('Logs Checked');
        if (!msg.includes('expect') && !msg.includes('actual')) missing.push('Expected vs Actual Table');
        break;
      case 4:
        if (!msg.includes('gap')) missing.push('Gap Statement + Analysis');
        if (!msg.includes('hypothesis')) missing.push('Updated Hypothesis');
        if (!msg.includes('next') || !msg.includes('action')) missing.push('Next Action');
        break;
      case 5:
        if (!msg.includes('should have done')) missing.push('What I Should Have Done');
        if (!msg.includes('pattern')) missing.push('Pattern Extracted');
        if (!msg.includes('systemic')) missing.push('Systemic Issue');
        break;
      case 6:
        if (!msg.includes('environ')) missing.push('Target Environment');
        if (!msg.includes('execution') && !msg.includes('```')) missing.push('Execution + Result');
        if (!msg.includes('assessment') && !msg.includes('status')) missing.push('Final Assessment');
        break;
    }

    return { valid: missing.length === 0, missing };
  }

  generateArtifact(layer: number, userContent: string): string {
    const config = this.getLayerConfig(layer);
    if (!config) return 'Error: invalid layer';

    const template = `# PROBLEM SOLVING — ${config.name.toUpperCase()}

${userContent}

---
**Layer:** ${layer}/6 | **Iteration:** ${this.stateMachine.getIteration()}
**Thinking:** "${config.thinking}"
`;

    orchestrator.getState().artifacts.set(`psm-layer${layer}`, template);
    return template;
  }

  getStateMachine(): ProblemSolvingStateMachine {
    return this.stateMachine;
  }

  getHelpText(): string {
    return `## TRIDENT PROBLEM SOLVING v4

**CORE PRINCIPLE:** "Trident Modes. Human Execution."

**6-LAYER DEBUGGING METHODOLOGY:**

| Layer | Name | Thinking |
|-------|------|----------|
| 1 | ASSUMPTION | "What do I assume?" |
| 2 | ACTION | "What action with prediction?" |
| 3 | OBSERVATION | "What actually happened?" |
| 4 | GAP ANALYSIS | "What does the gap tell me?" |
| 5 | META-REFLECTION | "What should I have done?" |
| 6 | VERIFICATION | "Does the fix work in target env?" |

**COMMANDS:**
- "start debug [problem]" - Begin problem solving
- "continue" - Advance to next layer
- "show findings" - Display artifacts
- "new iteration" - Start V1.1 (preserves history)
- "reset" - Reset to IDLE

**ITERATION SUPPORT:** Loops V1.0 -> V1.1 -> V1.2 for complex problems.
Each iteration preserves previous findings and deepens analysis.`;
  }
}

export const problemSolvingModule = new ProblemSolvingModule();
