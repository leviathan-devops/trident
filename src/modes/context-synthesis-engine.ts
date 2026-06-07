// Backward-compatibility stub for context-synthesis-engine.ts
// Original was deleted in Phase 1 (replaced by XState fsm/context-synthesis-machine.ts)

export interface CollectedContext {
  raw: string;
  source: string;
  timestamp: number;
}

export interface ScoredItem {
  content: string;
  relevance: number;
  tokenCount: number;
}

export interface CompressedContext {
  content: string;
  tokenCount: number;
}

export interface InjectableOutput {
  config: Record<string, unknown>;
  patterns: string[];
  keyFacts: string[];
}

export class ContextSynthesisEngine {
  private tokenBudget = 2000;
  private collected: CollectedContext[] = [];
  private scored: ScoredItem[] = [];

  collect(raw: string, source: string): void {
    this.collected.push({ raw, source, timestamp: Date.now() });
  }

  score(): ScoredItem[] {
    this.scored = this.collected.map(c => ({
      content: c.raw.substring(0, 500),
      relevance: 0.5,
      tokenCount: c.raw.split(/\s+/).length,
    }));
    return this.scored;
  }

  compress(budget?: number): CompressedContext {
    const maxTokens = budget || this.tokenBudget;
    const content = this.scored
      .filter(s => s.tokenCount <= maxTokens)
      .map(s => s.content)
      .join('\n');
    return { content, tokenCount: content.split(/\s+/).length };
  }

  inject(projectName: string, config: Record<string, unknown>, patterns: string[], keyFacts: string[]): InjectableOutput {
    return { config, patterns, keyFacts };
  }
}

export const contextSynthesisEngine = new ContextSynthesisEngine();
