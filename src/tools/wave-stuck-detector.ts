// src/tools/wave-stuck-detector.ts — the ISE PatternFamily for the kill decision
// (Part 13.4 + Part 16). THE LAW: the regex/boolean is the mechanical DETECTOR
// only; the DECISION is the state machine above it (the ISE law — never a
// hardcoded ladder, never a fixed ETA+20 kill). The kill fires ONLY on the
// matched evidence.

import type { AgentTrack, WaveTrack } from './wave-tracker.ts';
import { buildKillDirectiveText } from './wave-constants.ts';

export type PatternKind =
  | 'activity-evidence' | 'provider-evidence' | 'session-evidence' | 'operator-evidence';

export type PatternSeverity = 'INFO' | 'HIGH' | 'CRITICAL';

export type Remediation =
  | 'KILL_AND_RESPAWN' | 'KILL_AND_RESPAWN_WITH_SWITCH'
  | 'RESPAWN_IMMEDIATE' | 'WAIT';

export interface PatternFamily {
  id: string;
  kind: PatternKind;
  matcher: (evidence: StuckEvidence) => boolean;      // the mechanical DETECTOR
  triggerCondition: (evidence: StuckEvidence) => boolean;
  severity: PatternSeverity;
  messageTemplate: string;
  remediationHook: Remediation;
}

export interface StuckEvidence {
  agent: AgentTrack;
  wave: WaveTrack;
  name: string;                          // THE AGENT'S NAME KEY (2026-08-13 — the directive must name the REAL agent, never the literal '<agent>' placeholder)
  sessionStatus: string;                 // the session.status read
  statusReadFailed: boolean;             // the read itself failed (2026-08-07:
                                         // a READ FAILURE is NOT a session
                                         // crash — the live false-positive
                                         // the operator's run exposed)
  lastTickBytes: number;                 // the bytes at the previous tick
  streamGrowing: boolean;                // bytes > lastTickBytes
  lastActivityAgeMs: number;
  providerErrorCount: number;            // the 429/500/quota codes in the tail
  now: number;
}

export interface StuckDecision {
  action: Remediation;
  pattern: PatternFamily | null;
  directive: string | null;              // the tier-2 text (11.1) when actionable
}

// THE PATTERN FAMILY — the typed members (Part 5.3 + Part 16). Each matcher is
// the mechanical DETECTOR; each triggerCondition is the contextual gate. The
// ordering is intentional: the HIGH/CRITICAL evidence classes are checked
// before the SLOW_LEGIT INFO class — a growing stream with an error status must
// surface the SESSION_CRASH, never the WAIT.

// THE TIMING CONSTANTS (the named calibrations — the ISE anti-magic-ladder
// discipline: every threshold references the documented calibration source):
export const STUCK_ACTIVITY_AGE_MS = 5 * 60_000;   // Part 5.3: "lastActivityAge > 5m"
export const SLOW_LEGIT_AGE_MS = 2 * 60_000;       // Part 5.3: "lastActivityAge < 2m"
export const PROVIDER_ERROR_THRESHOLD = 2;         // Part 5.3: "the error count > 2"

export const PATTERNS: PatternFamily[] = [
  {
    id: 'STUCK_NO_ACTIVITY', kind: 'activity-evidence',
    matcher: (e) => e.lastActivityAgeMs > STUCK_ACTIVITY_AGE_MS && !e.streamGrowing,
    triggerCondition: (e) => e.now > e.wave.dispatchedAt + e.wave.etaMs,
    severity: 'HIGH',
    messageTemplate: 'WAVE <name> — STUCK_NO_ACTIVITY for <agent>: no stream growth for <age>m past the ETA',
    remediationHook: 'KILL_AND_RESPAWN',
  },
  {
    id: 'PROVIDER_QUOTA', kind: 'provider-evidence',
    matcher: (e) => e.providerErrorCount > PROVIDER_ERROR_THRESHOLD,
    triggerCondition: () => true,
    severity: 'HIGH',
    messageTemplate: 'WAVE <name> — PROVIDER_QUOTA for <agent>: <codes>',
    remediationHook: 'KILL_AND_RESPAWN_WITH_SWITCH',
  },
  {
    id: 'SESSION_CRASH', kind: 'session-evidence',
    matcher: (e) => !e.statusReadFailed
      && (e.sessionStatus === 'error' || e.sessionStatus === 'closed'
        || e.sessionStatus === 'missing'),
    triggerCondition: () => true,
    severity: 'CRITICAL',
    messageTemplate: 'WAVE <name> — SESSION_CRASH for <agent>: <status>',
    remediationHook: 'RESPAWN_IMMEDIATE',
  },
  {
    id: 'SLOW_LEGIT', kind: 'activity-evidence',
    matcher: (e) => e.lastActivityAgeMs < SLOW_LEGIT_AGE_MS && e.streamGrowing,
    triggerCondition: () => false,
    severity: 'INFO',
    messageTemplate: '',
    remediationHook: 'WAIT',
  },
];

// THE DIRECTIVE BUILDER — the evidence named in the kill text (Part 5.3: "the
// diagnosis first (the evidence named), the axe only on the matched evidence").
// THE ID FIX (2026-08-13 — the operator's question: "does it return the exact
// task/session IDs of the agents to investigate?" — the OLD builder fired the
// literal '<agent>' placeholder + an EMPTY session id for background waves (the
// sessionIds array is empty until the batch dispatch writes them; the REAL
// handles are the taskIds). The directive now carries the REAL agent name +
// the REAL session ids + the REAL taskIds — the orchestrator can investigate
// THE EXACT sessions, never a placeholder.)
function buildDirective(p: PatternFamily, e: StuckEvidence): string {
  const name = e.name || '<unknown-agent>';
  const sids = e.agent.sessionIds.length > 0 ? e.agent.sessionIds.join(',') : 'none';
  const tids = e.agent.taskIds && e.agent.taskIds.length > 0 ? e.agent.taskIds.join(',') : 'none';
  const agentRef = name + ' (sessions: ' + sids + '; taskIds: ' + tids + ')';
  const ageMin = Math.round(e.lastActivityAgeMs / 60000);
  let evidence = '';
  if (p.id === 'STUCK_NO_ACTIVITY') evidence = 'no stream growth for ' + ageMin + 'm past the ETA';
  else if (p.id === 'PROVIDER_QUOTA') evidence = e.agent.errorCodes.join(', ') || 'quota/500 codes in the tail';
  else if (p.id === 'SESSION_CRASH') evidence = 'session status ' + e.sessionStatus;
  else evidence = 'the operator\'s decision';
  const lastId = e.agent.sessionIds.length > 0
    ? e.agent.sessionIds[e.agent.sessionIds.length - 1]
    : (tids !== 'none' ? tids.split(',')[0] : '');
  return buildKillDirectiveText(e.wave.wave, p.id, agentRef, evidence, lastId);
}

// THE DECISION — the pattern loop (the detector layer). The FIRST matched +
// triggered pattern decides (the HIGH/CRITICAL order); no match = WAIT.
export function matchStuckPatterns(evidence: StuckEvidence): StuckDecision {
  for (const p of PATTERNS) {
    let matched: boolean;
    try {
      matched = p.matcher(evidence);
    } catch (mErr) {
      // A throwing matcher is a defect — the detector fails SAFE (never a
      // kill on broken detection). The WARN is logged by the caller's catch.
      matched = false;
    }
    if (matched) {
      let trigger: boolean;
      try {
        trigger = p.triggerCondition(evidence);
      } catch (tErr) {
        trigger = false;
      }
      if (trigger) {
        const directive = p.remediationHook === 'WAIT'
          ? null
          : buildDirective(p, evidence);
        return { action: p.remediationHook, pattern: p, directive };
      }
    }
  }
  return { action: 'WAIT', pattern: null, directive: null };
}
