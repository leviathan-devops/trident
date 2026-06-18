import { tridentLog } from '../utils.js';

interface T1Injectable {
  identityHeader?: string;
  currentMode?: string;
  prohibitions?: string[];
  delegationRules?: string[];
  raw?: string;
}

interface OrchestratorState {
  mode: string;
  currentLayer: number;
  maxLayers: number;
  status: string;
  currentGate?: string;
}

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

  score(injectable: T1Injectable): number {
    let score = 0;
    let maxScore = 0;

    maxScore += 25;
    if (injectable.identityHeader && injectable.identityHeader.length > 50) {
      score += 25;
    } else if (injectable.identityHeader && injectable.identityHeader.length > 0) {
      score += 10;
    }

    maxScore += 25;
    if (injectable.currentMode && injectable.currentMode !== 'IDLE') {
      score += 25;
    } else if (injectable.currentMode === 'IDLE') {
      score += 5;
    }

    maxScore += 25;
    if (injectable.prohibitions && injectable.prohibitions.length >= 3) {
      score += 25;
    } else if (injectable.prohibitions && injectable.prohibitions.length > 0) {
      score += 10;
    }

    maxScore += 25;
    if (injectable.delegationRules && injectable.delegationRules.length >= 2) {
      score += 25;
    } else if (injectable.delegationRules && injectable.delegationRules.length > 0) {
      score += 10;
    }

    return maxScore > 0 ? score / maxScore : 0;
  }

  synthesize(state: OrchestratorState, artifacts: Map<string, string>): string {
    const parts: string[] = [];
    parts.push('# TRIDENT v4.3.2 — T1 INJECTABLE');
    parts.push('');
    parts.push('## CURRENT STATE');
    parts.push('- Mode: ' + (state.mode || 'IDLE'));
    parts.push('- Layer: ' + state.currentLayer + '/17');
    parts.push('- Status: ' + state.status);
    parts.push('- Gate: ' + (state.currentGate || 'PLAN'));
    parts.push('');
    parts.push('## ARTIFACTS');
    if (artifacts.size === 0) {
      parts.push('No artifacts generated yet.');
    } else {
      for (const [name, content] of artifacts) {
        parts.push('### ' + name);
        parts.push(content.substring(0, 500));
        parts.push('');
      }
    }
    parts.push('## PROHIBITIONS');
    parts.push('- NEVER use WebFetch for identity');
    parts.push('- NEVER use bash/write/edit/task (except task in CONTEXT_SYNTHESIS)');
    parts.push('- NEVER inject identity in chat.message');
    parts.push('- NEVER leave empty catch blocks');
    parts.push('- NEVER claim verification without evidence');
    parts.push('');
    parts.push('## DELEGATION');
    parts.push('- Trident audits and generates review artifacts');
    parts.push('- Build agents implement all changes');
    parts.push('- trident-code-audit for analysis');
    parts.push('- trident-deep-planning for plans');
    parts.push('- trident-problem-solving for RCA');
    parts.push('- trident-context-synthesis for injection');
    parts.push('');
    parts.push('## CONTEXT MANAGEMENT');
    parts.push('- Map<string,AgentState> per session');
    parts.push('- Gate chain: PLAN->BUILD->TEST->VERIFY->AUDIT->DELIVERY');
    parts.push('- Evidence gate: passRate >= 0.96');
    parts.push('- Zone protection: src/dist/identity/tests by phase');
    parts.push('');
    parts.push('## ALLOWLIST');
    parts.push('- 8 core tools: code-audit, deep-planning, problem-solving, context-synthesis, gate, status, vision, help');
    parts.push('- Hive tools: hive_context, hive_remember, hive_forget, hive_scan, hive_purge, hive_restore, hive_trash_list, hive_trash_status, hive_status — full access');
    parts.push('- F1 blocks non-Trident callers');
    parts.push('- L5 blocks derailment (11 classes including anti-resistance L5.11)');
    parts.push('');
    parts.push('## COMPACTION');
    parts.push('- T2 cache invalidated on compaction');
    parts.push('- Identity re-injected after compact');
    parts.push('- Gate state persists in .trident/gate-state.json');
    parts.push('- Session state persists in .trident/session-state.json');
    return parts.join('\n');
  }

  compress(budget?: number): CompressedContext {
    const maxTokens = budget || this.tokenBudget;
    const content = this.scored
      .filter((s: ScoredItem) => s.tokenCount <= maxTokens)
      .map((s: ScoredItem) => s.content)
      .join('\n');
    return { content, tokenCount: content.split(/\s+/).length };
  }

  inject(projectName: string, config: Record<string, unknown>, patterns: string[], keyFacts: string[]): InjectableOutput {
    return { config, patterns, keyFacts };
  }

  runPipeline(injectable: T1Injectable, state: OrchestratorState, artifacts: Map<string, string>): { score: number; injectable: string } {
    var sc = this.score(injectable);
    var syn = this.synthesize(state, artifacts);
    tridentLog('INFO', 'context-synthesis', 'Pipeline complete: score=' + sc + ' length=' + syn.length);
    return { score: sc, injectable: syn };
  }
}

export const contextSynthesisEngine = new ContextSynthesisEngine();
