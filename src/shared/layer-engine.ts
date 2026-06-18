type Verdict = 'PASS' | 'BLOCK' | 'WARN';

export interface LayerInput {
  toolName: string;
  commandStr: string | null;
  sessionAgent: string | undefined;
  currentGate: string;
  auditLayer?: string;
  mode?: string;
  sessionId?: string;
}

export interface LayerResult {
  name: string;
  verdict: Verdict;
  reason: string;
  correction?: string;
}

export interface FirewallLayer {
  name: string;
  evaluate(input: LayerInput): LayerResult;
}

export class LayerEngine {
  private results: LayerResult[] = [];

  assess(layers: FirewallLayer[], input: LayerInput): LayerResult {
    this.results = [];
    for (const layer of layers) {
      const result = layer.evaluate(input);
      this.results.push(result);
      if (result.verdict === 'BLOCK') {
        return result;
      }
    }
    return { name: 'ALL', verdict: 'PASS', reason: 'All layers passed' };
  }

  getResults(): LayerResult[] {
    return [...this.results];
  }
}
