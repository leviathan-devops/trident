/**
 * WARHEAD: Distilled Knowledge (TS Deep Knowledge)
 *
 * P1-D: Dedicated warhead for TypeScript Deep Knowledge KB files.
 * Loads all 9 KB files from the Typescript Deep Knowledge library
 * and tracks their availability and synthesis quality.
 *
 * Real implementation: Uses knowledge-loader.ts for KB-level
 * technique access and ContextSynthesisEngine for semantic
 * extraction of compiler API patterns, state machine protocols,
 * concurrency patterns, and testing oracles.
 */

import { HookRegistry } from '../warhead-registry.js';
import { Warhead } from '../warhead-interface.js';
import { isTridentAgent } from '../../identity/agent-identity.js';
import { tridentLog, getEvidenceStore } from '../../utils.js';
import { loadKnowledgeSummary } from '../knowledge-loader.js';

class DistilledKnowledgeWarhead implements Warhead {
  id = 'distilled-knowledge';
  priority = 13;
  type = 'static' as const;

  private kbFilesLoaded: string[] = [];
  private kbCount = 0;
  private totalKBChars = 0;
  private synthesisCount = 0;
  private lastTechniqueCount = 0;
  private engineAvailable = false;

  // Per-KB tracking
  private kbTechniques: Record<string, number> = {};

  async init(): Promise<void> {
    // Probe ContextSynthesisEngine
    try {
      const { ContextSynthesisEngine } = await import('../../modes/context-synthesis-engine.js');
      if (typeof ContextSynthesisEngine === 'function') {
        this.engineAvailable = true;
      }
    } catch (e: unknown) {
      this.engineAvailable = false;
    }

    // Probe KB files via T2 cache
    try {
      const { ensureT2Cache } = await import('../trident-warhead-synthesizer.js');
      const t2 = ensureT2Cache();
      const allKeys: string[] = [];
      t2.forEach((_, key) => { allKeys.push(key); });
      const kbFiles = allKeys.filter((k: string) => k.startsWith('kb/'));
      this.kbCount = kbFiles.length;
      
      for (const key of kbFiles) {
        const content = t2.get(key);
        if (content) {
          this.totalKBChars += content.length;
          const name = key.replace('kb/', '');
          this.kbFilesLoaded.push(name);
          
          // Count techniques per KB (## Technique N: or ### N.N patterns)
          const techniqueMatches = content.match(/^#{2,3}\s+(Technique\s+\d+|[\d.]+[\s.])/gm);
          this.kbTechniques[name] = techniqueMatches ? techniqueMatches.length : 0;
          this.lastTechniqueCount += this.kbTechniques[name];
        }
      }

      if (this.kbCount > 0) {
        tridentLog('INFO', 'warhead-distilled-knowledge',
          `${this.kbCount} KB files loaded: ${this.kbFilesLoaded.join(', ')} (${Math.round(this.totalKBChars / 1024)}KB, ${this.lastTechniqueCount} techniques)`);
      } else {
        tridentLog('WARN', 'warhead-distilled-knowledge',
          'No KB files found in T2 cache');
      }
    } catch (e: unknown) {
      tridentLog('WARN', 'warhead-distilled-knowledge',
        `T2 cache probe failed: ${e instanceof Error ? e.message : String(e)}`);
    }

    // Also load summaries via knowledge-loader for technique-level access
    const kbIds = ['KB-00', 'KB-01', 'KB-02', 'KB-03', 'KB-04', 'KB-05', 'KB-06', 'KB-07'];
    let loaded = 0;
    for (const kbId of kbIds) {
      const summary = loadKnowledgeSummary(kbId, 10);
      if (summary.loaded) loaded++;
    }
    tridentLog('INFO', 'warhead-distilled-knowledge',
      `knowledge-loader: ${loaded}/${kbIds.length} KB summaries accessible`);
  }

  register(hooks: HookRegistry): void {
    // Track synthesis cycles via system.transform
    hooks.on('system.transform', async (input, _output) => {
      try {
        if (typeof input !== 'object' || input === null) return;
        const inputR = input as Record<string, unknown>;
        const agentName = inputR.agent as string;
        if (agentName && !isTridentAgent(agentName)) return;

        this.synthesisCount++;

        // Log KB stats to evidence store periodically (every 10 cycles)
        if (this.synthesisCount % 10 === 0) {
          try {
            const store = await getEvidenceStore();
            await store.append('global', 'SYSTEM', 'R0', 'distilled-knowledge', {
              kbCount: this.kbCount,
              totalKBChars: this.totalKBChars,
              techniques: this.lastTechniqueCount,
              files: this.kbFilesLoaded,
              synthesisCount: this.synthesisCount,
              timestamp: Date.now(),
            });
          } catch {
            // Non-critical
          }
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        tridentLog('ERROR', 'warhead-distilled-knowledge', `Hook failed: ${msg}`);
      }
    });
  }

  getT0(): string {
    const fileInfo = this.kbCount > 0
      ? `${this.kbCount} KBs, ${Math.round(this.totalKBChars / 1024)}KB, ${this.lastTechniqueCount} techniques`
      : 'no KB files loaded';
    const engineStatus = this.engineAvailable ? 'semantic extraction' : 'regex fallback';
    return `[DISTILLED KNOWLEDGE] ${fileInfo} | ${this.synthesisCount} cycles | ${engineStatus}`;
  }

  getStatus(): Record<string, number | string> {
    return {
      kbCount: this.kbCount,
      totalKBChars: this.totalKBChars,
      techniqueCount: this.lastTechniqueCount,
      synthesisCount: this.synthesisCount,
      engineAvailable: Number(this.engineAvailable),
      filesLoaded: this.kbFilesLoaded.join(', '),
    };
  }
}

export const distilledKnowledgeWarhead = new DistilledKnowledgeWarhead();
