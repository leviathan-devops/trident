import { HookRegistry } from '../warhead-registry.js';
import { Warhead } from '../warhead-interface.js';
import { isTridentAgent } from '../../identity/agent-identity.js';
import { tridentLog } from '../../utils.js';
import { loadKnowledgeTechniqueWithCode } from '../knowledge-loader.js';
import { evidenceGate } from '../evidence-gate.js';

/**
 * TESTING WARHEAD — Loads KB-05 technique reference code for T1 injection.
 * Tracks verify operations and container test evidence status.
 * No runtime test execution — loads KB-05 content as reference.
 */

class TestingWarhead implements Warhead {
  id = 'testing-warhead';
  priority = 5;
  type = 'static' as const;

  private verifyCount = 0;

  private kbLoaded = false;
  private techniqueCount = 0;
  private evidenceFound = false;
  private evidenceChecked = false;

  async init(): Promise<void> {
    let c = 0;
    for (let i = 1; i <= 4; i++) {
      const t = loadKnowledgeTechniqueWithCode('KB-05', i);
      if (t.loaded) c++;
    }
    this.techniqueCount = c;
    this.kbLoaded = c > 0;
    await tridentLog('INFO', 'warhead-testing', `KB-05: ${c}/4 techniques loaded`);
  }

  private checkContainerTestEvidence(): boolean {
    try {
      return evidenceGate.hasContainerTestEvidence();
    } catch {
      this.evidenceChecked = true;
      this.evidenceFound = false;
      return false;
    }
  }

  register(hooks: HookRegistry): void {
    // Track test-related tool calls
    hooks.on('system.transform', async (_input, _output) => {
      try {
        if (typeof _input !== 'object' || _input === null) return;
        const agentName = (_input as Record<string, unknown>).agent as string;
        if (agentName && !isTridentAgent(agentName)) return;
        this.verifyCount++;
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        await tridentLog('ERROR', 'warhead-testing', `Transform hook failed: ${msg}`);
      }
    });

    // Track spider-container test calls
    hooks.on('tool.execute.before', async (input, _output) => {
      try {
        if (typeof input !== 'object' || input === null) return;
        const inputR = input as Record<string, unknown>;
        const agentName = inputR.agent as string;
        if (agentName && !isTridentAgent(agentName)) return;
        const toolName = inputR.tool;
        if (toolName === 'spider-container' || toolName === 'trident-gate') {
          const hasEvidence = this.checkContainerTestEvidence();
          await tridentLog('INFO', 'warhead-testing',
            `Test: ${toolName} | KB loaded: ${this.kbLoaded} | evidence: ${hasEvidence} | transforms: ${this.verifyCount}`);
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        await tridentLog('ERROR', 'warhead-testing', `Tool hook failed: ${msg}`);
      }
    });
  }

  getT0(): string {
    const kbInfo = this.kbLoaded
      ? `${this.techniqueCount} KB-05 techniques (testing reference)`
      : 'KB-05 unavailable';
    const evidenceStatus = this.evidenceChecked
      ? (this.evidenceFound ? 'evidence: PASS' : 'evidence: NONE')
      : 'evidence: unchecked';
    return `[TESTING] ${this.verifyCount} operations. ${kbInfo}. ${evidenceStatus}. No runtime test execution.`;
  }

  getStatus(): Record<string, number | string> {
    return {
      kbLoaded: Number(this.kbLoaded),
      techniques: this.techniqueCount,
      transforms: this.verifyCount,
      evidenceFound: Number(this.evidenceFound),
      evidenceChecked: Number(this.evidenceChecked),
    };
  }
}

export const testingWarhead = new TestingWarhead();
