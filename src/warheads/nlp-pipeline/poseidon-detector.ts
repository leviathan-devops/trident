// PoseidonDetector — Semantic activation/deactivation detection for Poseidon Mode
// Uses regex first-pass (keyword "poseidon") + semantic second-pass (ON/OFF signal scoring)

export interface PoseidonResult {
  detected: boolean;
  action: 'activate' | 'deactivate' | null;
  confidence: number;
}

var ON_SIGNALS: string[] = [
  'activate', 'enable', 'on', 'start', 'engage', 'unlock', 'begin',
  'initiate', 'power', 'wake', 'arm', 'ignite', 'launch', 'open',
  'unleash', 'awaken', 'summon', 'enter',
];

var OFF_SIGNALS: string[] = [
  'disable', 'off', 'stop', 'revoke', 'revoked', 'deactivate',
  'disengage', 'lock', 'end', 'terminate', 'shut', 'close',
  'cancel', 'abort', 'halt', 'suspend', 'finish', 'complete',
  'exit', 'quit', 'sleep',
];

var NEGATION_PATTERNS: RegExp[] = [
  /\bdon'?t\s+(activate|enable|start|engage|unlock)/i,
  /\b(no|not|never)\s+(poseidon)/i,
  /\bstop\s+poseidon/i,
];

export class PoseidonDetector {
  detect(message: string): PoseidonResult {
    if (!message || typeof message !== 'string') {
      return { detected: false, action: null, confidence: 0 };
    }

    // Phase 1: Regex first-pass — is "poseidon" mentioned?
    if (!/\bposeidon\b/i.test(message)) {
      return { detected: false, action: null, confidence: 0 };
    }

    // Phase 2: Semantic second-pass — score ON vs OFF signals
    var lower = message.toLowerCase();
    var onScore = 0;
    var offScore = 0;

    for (var i = 0; i < ON_SIGNALS.length; i++) {
      if (lower.indexOf(ON_SIGNALS[i]) !== -1) onScore++;
    }
    for (var j = 0; j < OFF_SIGNALS.length; j++) {
      if (lower.indexOf(OFF_SIGNALS[j]) !== -1) offScore++;
    }

    // Phase 3: Check negation patterns
    var negationScore = 0;
    for (var k = 0; k < NEGATION_PATTERNS.length; k++) {
      if (NEGATION_PATTERNS[k].test(message)) negationScore++;
    }

    // Decision
    if (onScore > offScore) {
      return { detected: true, action: 'activate', confidence: onScore / (onScore + offScore + 1) };
    }
    if (offScore > onScore) {
      return { detected: true, action: 'deactivate', confidence: offScore / (onScore + offScore + 1) };
    }
    // Equal scores or no signals — check negation
    if (negationScore > 0) {
      return { detected: true, action: 'deactivate', confidence: 0.6 };
    }
    // Default: "poseidon" mentioned with no clear signal → assume activate
    return { detected: true, action: 'activate', confidence: 0.5 };
  }
}
