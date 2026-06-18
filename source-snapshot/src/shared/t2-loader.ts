import { synthesizeT1Injectables as synthInjectables, invalidateT1Cache as invalidateWarheads } from './trident-warhead-synthesizer.js';
import { isTridentAgent } from '../identity/agent-identity.js';

let _t1Cache: string | null = null;

export function synthesizeT1Injectables(agentName?: string): string {
  if (agentName && !isTridentAgent(agentName)) return '';
  if (_t1Cache) return _t1Cache;
  try {
    _t1Cache = synthInjectables();
    return _t1Cache;
  } catch (e: unknown) {
    console.error('[t2-loader] synthesizeT1Injectables failed:', e instanceof Error ? e.message : String(e));
    // [P3] Fallback: return minimal injectable on synthesizer failure
    const fallback = [
      '[T1 INJECTABLE: RULES]',
      '- SCAN+REPLACE identity on every system.transform',
      '- Per-turn override appended after SCAN',
      '- Session lifecycle handles created+ended',
      '- Every hook gates on isTridentAgent()',
      '[T1 INJECTABLE: PROHIBITIONS]',
      '- NEVER use bash/write/edit/task/spawn',
      '- NEVER inject identity in chat.message',
      '- NEVER leave empty catch blocks',
      '[T1 INJECTABLE: ALLOWLIST]',
      '- 8 core tools + hive tools — full access',
      '- F1 blocks non-Trident callers',
      '- L5 blocks derailment',
    ].join('\n');
    _t1Cache = fallback;
    return _t1Cache;
  }
}

export function invalidateT1Cache(): void {
  _t1Cache = null;
  try {
    invalidateWarheads();
  } catch (e: unknown) {
    console.error('[t2-loader] Cache invalidation failed:', e instanceof Error ? e.message : String(e));
  }
}
