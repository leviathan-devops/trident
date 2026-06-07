import { orchestrator } from '../orchestrator.js';
import { LayerConfig, CONTEXT_SYNTHESIS_LAYERS } from '../types.js';
import {
  contextSynthesisEngine,
  ContextSynthesisEngine,
  CollectedContext,
  ScoredItem,
  CompressedContext,
  InjectableOutput,
} from './context-synthesis-engine.js';

export class ContextSynthesisModule {
  private layers: LayerConfig[];
  private engine: ContextSynthesisEngine;
  private readonly TOKEN_BUDGET = 2000;

  constructor() {
    this.layers = CONTEXT_SYNTHESIS_LAYERS;
    this.engine = contextSynthesisEngine;
  }

  getLayerConfig(layer: number): LayerConfig | undefined {
    return this.layers.find(l => l.number === layer);
  }

  buildLayer1Template(): string {
    return `# CONTEXT SYNTHESIS — LAYER 1: CONTEXT COLLECTION

## Session Info
- **Session ID:** [Session ID]
- **Current Gate:** [PLAN/BUILD/TEST/VERIFY/AUDIT/DELIVERY]
- **Active Task:** [What agent is working on]

## T1: Session Context
**Method:** Kraken brain state API
**Status:** [Available/Unavailable]

| State | Value |
|-------|-------|
| Current Gate | [Gate] |
| Active Task | [Task] |
| Blockers | [List] |

## T2: Knowledge Context
**Method:** hermes_remember, hive_context, kraken_hive_search
**Status:** [Available/Unavailable]

## T3: File Context
**Method:** Read active files
**Status:** [Available/Unavailable]

## T4: Tool Context
**Method:** Recent commands
**Status:** [Available/Unavailable]

## Collection Summary
| Source | Status | Content Size |
|--------|--------|--------------|
| T1: Session | [OK/FAIL] | [Tokens] |
| T2: Knowledge | [OK/FAIL] | [Tokens] |
| T3: Files | [OK/FAIL] | [Tokens] |
| T4: Tools | [OK/FAIL] | [Tokens] |

---
**Layer:** 1/4 | **Token Budget:** ${this.TOKEN_BUDGET}
**Thinking:** "${this.getLayerConfig(1)?.thinking}"
`;
  }

  buildLayer2Template(): string {
    return `# CONTEXT SYNTHESIS — LAYER 2: RELEVANCE SCORING

## Scoring Formula
**Score = (Urgency x 0.6) + (Importance x 0.4)**

## Scored Items
| Source | Name | Urgency | Importance | Final Score | Rank |
|--------|------|---------|------------|-------------|------|

---
**Layer:** 2/4 | **Token Budget:** ${this.TOKEN_BUDGET}
**Thinking:** "${this.getLayerConfig(2)?.thinking}"
`;
  }

  buildLayer3Template(): string {
    return `# CONTEXT SYNTHESIS — LAYER 3: COMPRESSION

## Token Budget Allocation
| Category | Budget | Used | Remaining |
|----------|--------|------|-----------|
| **Total** | **2000** | **[N]** | **[N]** |

---
**Layer:** 3/4 | **Token Budget:** ${this.TOKEN_BUDGET}
**Thinking:** "${this.getLayerConfig(3)?.thinking}"
`;
  }

  buildLayer4Template(): string {
    return `# CONTEXT SYNTHESIS — LAYER 4: INJECTION FORMAT

## Injection Structure (T0-Ready)

---
**Layer:** 4/4 | **Token Budget:** ${this.TOKEN_BUDGET}
**Thinking:** "${this.getLayerConfig(4)?.thinking}"
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
        if (!msg.includes('session') && !msg.includes('context')) missing.push('Session/Context Info');
        if (!msg.includes('t1') && !msg.includes('t2') && !msg.includes('t3') && !msg.includes('t4')) missing.push('Context Sources (T1-T4)');
        if (!msg.includes('collection') && !msg.includes('collect')) missing.push('Collection Summary');
        break;
      case 2:
        if (!msg.includes('score') && !msg.includes('scoring')) missing.push('Scoring/Relevance');
        if (!msg.includes('urgency') && !msg.includes('priority')) missing.push('Urgency/Priority Ranking');
        if (!msg.includes('importance')) missing.push('Importance Factors');
        break;
      case 3:
        if (!msg.includes('compress') && !msg.includes('token') && !msg.includes('budget')) missing.push('Compression/Token Budget');
        if (!msg.includes('deduplicate') && !msg.includes('merge') && !msg.includes('summar')) missing.push('Deduplication/Merging');
        break;
      case 4:
        if (!msg.includes('inject') && !msg.includes('t0') && !msg.includes('format')) missing.push('Injection Format');
        if (!msg.includes('config') && !msg.includes('opencode')) missing.push('Config/opencode.json');
        break;
    }

    return { valid: missing.length === 0, missing };
  }

  getEngine(): ContextSynthesisEngine {
    return this.engine;
  }

  getHelpText(): string {
    return `## TRIDENT CONTEXT SYNTHESIS v4

**CORE PRINCIPLE:** "Trident synthesizes context for precise agent execution."

**4-LAYER CONTEXT MANAGEMENT:**

| Layer | Name | Thinking |
|-------|------|----------|
| 1 | CONTEXT COLLECTION | "What context exists?" (T1-T4) |
| 2 | RELEVANCE SCORING | "What matters most?" (urgency x importance) |
| 3 | COMPRESSION | "How to compress under 2K tokens?" |
| 4 | INJECTION FORMAT | "T0-ready format for agent injection" |

**TOKEN BUDGET:** 2000 tokens max per injection
**SOURCES:** T1 (Session), T2 (Knowledge), T3 (Files), T4 (Tools)`;
  }
}

export const contextSynthesisModule = new ContextSynthesisModule();
