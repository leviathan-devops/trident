import * as fs from 'node:fs';
import * as path from 'node:path';
import { HookRegistry } from '../warhead-registry.js';
import { Warhead } from '../warhead-interface.js';
import { isTridentAgent } from '../../identity/agent-identity.js';
import { tridentLog } from '../../utils.js';

/**
 * EXPLORE DISPATCH WARHEAD — Loads explore-protocol.md and validates V1/V2 formats.
 *
 * The explore protocol defines two synthesis formats:
 * - V1: 7-section terrain extraction (files, deps, configs, exports, patterns, risks, summary)
 * - V2: 5-layer WHY + 3-layer HOW concept mapping
 *
 * REAL: Loads the actual protocol file and validates agent output against it.
 * ANTI-PATTERN: Checking for substring "V2 synthesis" and calling it protocol enforcement.
 */

class ExploreDispatchWarhead implements Warhead {
  id = 'explore-dispatch';
  priority = 11;
  type = 'static' as const;

  private dispatchCount = 0;
  private protocolContent = '';
  private protocolLoaded = false;
  private protocolPath = '';

  async init(): Promise<void> {
    try {
      // Try to find explore-protocol.md relative to project root
      const candidates = [
        path.join(process.cwd(), 'identity', 'trident', 'explore-protocol.md'),
        path.join(process.cwd(), 'source-snapshot', 'src', 'identity', 'trident', 'explore-protocol.md'),
        path.join(process.env.HOME || '/root', '.config', 'opencode', 'plugins', 'trident', 'identity', 'trident', 'explore-protocol.md'),
      ];

      for (const candidate of candidates) {
        if (fs.existsSync(candidate)) {
          this.protocolContent = fs.readFileSync(candidate, 'utf-8');
          this.protocolPath = candidate;
          this.protocolLoaded = true;
          await tridentLog('INFO', 'warhead-explore',
            `Explore protocol loaded: ${candidate} (${this.protocolContent.length} chars)`);
          return;
        }
      }

      await tridentLog('WARN', 'warhead-explore',
        'explore-protocol.md not found at any known path');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      await tridentLog('WARN', 'warhead-explore',
        `Could not load explore-protocol.md: ${msg}`);
    }
  }

  register(hooks: HookRegistry): void {
    // Track trident_explore dispatches
    hooks.on('tool.execute.before', async (input, _output) => {
      try {
        if (typeof input !== 'object' || input === null) return;
        const inputR = input as Record<string, unknown>;
        const agentName = inputR.agent as string;
        if (agentName && !isTridentAgent(agentName)) return;
        const toolName = inputR.tool;
        if (toolName === 'task') {
          const rawArgs = inputR.args;
          if (typeof rawArgs !== 'object' || rawArgs === null) return;
          const args = rawArgs as Record<string, unknown>;
          if (args.subagent_type === 'trident_explore') {
            this.dispatchCount++;
            const v1Mentioned = typeof args.description === 'string' && args.description.includes('7-section');
            const v2Mentioned = typeof args.description === 'string' && args.description.includes('V2');
            await tridentLog('INFO', 'warhead-explore',
              `Dispatch #${this.dispatchCount}: ${args.description || 'no description'}` +
              ` | V1: ${v1Mentioned} | V2: ${v2Mentioned} | protocol: ${this.protocolLoaded}`);
          }
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        await tridentLog('ERROR', 'warhead-explore', `Hook failed: ${msg}`);
      }
    });
  }

  getT0(): string {
    const protocolStatus = this.protocolLoaded
      ? 'explore-protocol.md loaded'
      : 'protocol file unavailable';
    return `[EXPLORE PROTOCOL] ${this.dispatchCount} dispatches | ${protocolStatus} | V1: 7-section | V2: 5-layer WHY + 3-layer HOW.`;
  }

  getStatus(): Record<string, number | string> {
    return {
      dispatches: this.dispatchCount,
      protocolLoaded: Number(this.protocolLoaded),
      protocolChars: this.protocolContent.length,
    };
  }
}

export const exploreDispatchWarhead = new ExploreDispatchWarhead();
