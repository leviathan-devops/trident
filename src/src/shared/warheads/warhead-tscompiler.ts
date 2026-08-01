import { Warhead } from '../warhead-interface.js';
import { isTridentAgent } from '../../identity/agent-identity.js';
import { tridentLog } from '../../utils.js';
import { loadKnowledgeTechniqueWithCode } from '../knowledge-loader.js';

/**
 * TS COMPILER API WARHEAD — Loads KB-01 technique reference code for T1 injection.
 * KB-01 contains TypeScript code examples for ts.Program, TypeChecker, AST, etc.
 * This warhead loads REFERENCE CODE (text). It does NOT create ts.Program — the
 * audit-engine (audit-engine/index.ts) does that at runtime.
 */

class TSCompilerAPIWarhead implements Warhead {
  id = 'ts-compiler-api';
  priority = 6;
  type = 'static' as const;

  private auditCount = 0;

  private kbLoaded = false;
  private techniqueCount = 0;

  async init(): Promise<void> {
    let c = 0;
    for (let i = 1; i <= 7; i++) {
      const t = loadKnowledgeTechniqueWithCode('KB-01', i);
      if (t.loaded) c++;
    }
    this.techniqueCount = c;
    this.kbLoaded = c > 0;
    await tridentLog('INFO', 'warhead-tsc', `KB-01: ${c}/7 techniques loaded`);
  }


  getT0(): string {
    const kbInfo = this.kbLoaded
      ? `${this.techniqueCount} KB-01 techniques (TypeScript API reference)`
      : 'KB-01 unavailable';
    return `[TS COMPILER API] ${this.auditCount} audits. ${kbInfo}. No local ts.Program — delegates to audit-engine.`;
  }

  getStatus(): Record<string, number | string> {
    return {
      audits: this.auditCount,
      kbLoaded: Number(this.kbLoaded),
      techniques: this.techniqueCount,
    };
  }
}

export const tsCompilerAPIWarhead = new TSCompilerAPIWarhead();
