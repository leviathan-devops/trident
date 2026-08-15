// ============================================================================
// file: src/sidecar/ledger.ts
//
// The evidence emitter (§19.1). Every tick appends one line; every verdict,
// warhead, escalation, and loop event is recorded. The ledger is the token
// firewall's accounting: quietness is provable, every activation is
// attributable, and every decision's reason string is quoted.
// ============================================================================

import { appendJson, ts } from './fs-utils.js';
import type { LedgerLine, GateVerdict, Warhead, Transition, RitualOutcome } from './types.js';

/**
 * The evidence emitter. Every tick appends one line; every verdict,
 * warhead, escalation, and loop event is recorded. The ledger is the
 * token firewall's accounting: quietness is provable, every activation
 * is attributable, and every decision's reason string is quoted.
 */
export class LedgerWriter {
  constructor(private dir: string) {}               // {ws}/sentinels/observations

  append(line: LedgerLine): void {
    const f = `${this.dir}/${line.observation.sessionId ?? 'none'}-${ts(line.t)}.json`;
    appendJson(f, line);                            // atomic append, never rewrite
  }

  appendVerdict(v: GateVerdict, ev: Transition): void {
    appendJson(`${this.dir}/verdicts-${ts()}.json`, { v, ev });
  }

  appendWarhead(w: Warhead): void {
    appendJson(`${this.dir}/warheads-${ts()}.json`, w);
  }

  appendTokens(spent: number): void {
    appendJson(`${this.dir}/tokens-${ts()}.json`, { spent, at: ts() });
  }

  appendEscalation(o: RitualOutcome): void {
    appendJson(`${this.dir}/escalations-${ts()}.json`, o);
  }

  appendLoopEvent(ev: unknown): void {
    appendJson(`${this.dir}/loop-${ts()}.json`, ev);
  }

  appendWarn(msg: string): void {
    appendJson(`${this.dir}/warns-${ts()}.json`, { msg });
  }
}
