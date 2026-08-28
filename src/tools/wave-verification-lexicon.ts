/**
 * THE VERIFICATION LEXICON (2026-08-26 — COMPLETION_GATE_SPEC §2.2).
 * Two typed detector families — the ISE PatternFamily shape (id/kind/matcher/
 * triggerCondition/severity/messageTemplate/remediationHook). The regex is
 * the DETECTOR; the completion gate's state machine decides. No bare regex
 * ladders (the ISE law).
 */

// ── THE PATTERN FAMILY MEMBER SHAPE (the ISE typed member) ──
export interface LexiconMember {
  id: string;
  kind: 'smoke' | 'evidence';
  /** Order-2 matcher: the regex + the required ABSENCE/presence context. */
  matcher: RegExp;
  /** The gate context that must hold for this member to fire. */
  triggerCondition: 'return-text';
  severity: 'HIGH' | 'MEDIUM' | 'PASS-SIG';
  messageTemplate: string;
  remediationHook: string;
}

// ── FAMILY 1: VERIFICATION_CLASS — on the agent's RETURN TEXT ──
export const RETURN_EVIDENCE_MEMBERS: LexiconMember[] = [
  {
    id: 'EVIDENCE-BATTERY',
    kind: 'evidence',
    matcher: /(?:bun test|bun\s+test)\b[\s\S]{0,200}?(?:\d+\s+pass|\d+\s+fail|\d+\/\d+)/i,
    triggerCondition: 'return-text',
    severity: 'PASS-SIG',
    messageTemplate: 'battery output with counts',
    remediationHook: '',
  },
  {
    id: 'EVIDENCE-TSC',
    kind: 'evidence',
    matcher: /(?:tsc|--noEmit|typecheck)\b[^\n]{0,80}(?:exit 0|0 error|no error|clean)/i,
    triggerCondition: 'return-text',
    severity: 'PASS-SIG',
    messageTemplate: 'typecheck exit 0',
    remediationHook: '',
  },
  {
    id: 'EVIDENCE-CONTAINER',
    kind: 'evidence',
    matcher: /container-test-results\.json|\.trident\/container-test|PASS.*tool-result context|scenario\s+\w+.*PASS/i,
    triggerCondition: 'return-text',
    severity: 'PASS-SIG',
    messageTemplate: 'container-test artifact/scenarios',
    remediationHook: '',
  },
  {
    id: 'EVIDENCE-RUN',
    kind: 'evidence',
    matcher: /(?:node|bun|python3?)\s+[^\n]{1,120}\.(?:js|html|py|mjs|ts)[^\n]{0,80}\n[\s\S]{0,400}?(?:VERDICT|OK|CRASH|output|Error|error|frames|LOAD)|ALL TESTS PASS|(?:^|\n)TEST \d+[^\n]{0,120}PASS|EVAL:\s*success|rAF pumped|exit['"]?\s*[:=]?\s*0/i,
    triggerCondition: 'return-text',
    severity: 'PASS-SIG',
    messageTemplate: 'executed-run output',
    remediationHook: '',
  },
  {
    id: 'EVIDENCE-BUILD',
    kind: 'evidence',
    matcher: /(?:bun build|npm run build|make)[^\n]{0,100}(?:success|exit 0|\d+\s+k?B|Bundled)/i,
    triggerCondition: 'return-text',
    severity: 'PASS-SIG',
    messageTemplate: 'build output',
    remediationHook: '',
  },
  {
    id: 'EVIDENCE-SHA',
    kind: 'evidence',
    matcher: /sha256[a-z]*\s+[0-9a-f]{16,64}\s*(?:\/|\)|$|\n)/im,
    triggerCondition: 'return-text',
    severity: 'PASS-SIG',
    messageTemplate: 'sha256 fingerprint',
    remediationHook: '',
  },
  {
    id: 'SMOKE-GREP-ONLY',
    kind: 'smoke',
    matcher: /(?:grep\s+-[a-z]+\s+"[^"]+"\s+[^\s]+\s*—|test -f\s+[^\s]+\s*&&)/i,
    triggerCondition: 'return-text',
    severity: 'HIGH',
    messageTemplate: 'grep/file-existence as the verification',
    remediationHook: 'EXECUTE the artifact and paste the real run output.',
  },
  {
    id: 'SMOKE-CLAIMED-VERIFIED',
    kind: 'smoke',
    matcher: /\b(?:verified|it works|working|all (?:checks? |tests? )?pass(?:ed)?)\b/i,
    triggerCondition: 'return-text',
    severity: 'HIGH',
    messageTemplate: 'claimed verification without pasted evidence',
    remediationHook: 'Paste the actual command outputs — a claim is not evidence.',
  },
  {
    id: 'SMOKE-OPENS-IN-BROWSER',
    kind: 'smoke',
    matcher: /opens? in a browser|runs? in a browser/i,
    triggerCondition: 'return-text',
    severity: 'MEDIUM',
    messageTemplate: '"opens in a browser" with no execution',
    remediationHook: 'Run it under a harness (node DOM-stubs / bun) and paste the output.',
  },
];

// ── FAMILY 2: ARTIFACT_CLASS — on the agent's write set ──
export type ArtifactClass = 'TYPE_BATTERY' | 'RUNTIME' | 'RUN' | 'DOC' | 'REPORT';

/** The artifact class from the write set (the files the agent produced).
 *  Pure; returns REPORT when no writes (explore/E-agents — gate-exempt).
 *  NOTE (the script-test finding): the runtime heuristic keys on the FILE
 *  EXTENSION (html/htm) only — never a path substring (a "game" dir name in
 *  a path misclassified .py/.md as RUNTIME in the live incident replay). The
 *  regex is the DETECTOR; this classifier is the typed decision. */
export function classifyArtifact(writeSet: string[]): ArtifactClass {
  const code = writeSet.filter((f) => /\.(ts|tsx|js|mjs)$/.test(f));
  const runtime = writeSet.filter((f) => /\.(html?|htm)$/.test(f));
  const py = writeSet.filter((f) => /\.py$/.test(f));
  const doc = writeSet.filter((f) => /\.(md|txt|json|ya?ml)$/i.test(f));
  if (code.length > 0) return 'TYPE_BATTERY';
  if (runtime.length > 0) return 'RUNTIME';
  if (py.length > 0) return 'RUN';
  if (doc.length > 0 && writeSet.length === doc.length) return 'DOC';
  return 'REPORT';
}

/** The evidence classes that satisfy each artifact class (spec §2.2 table). */
export const REQUIRED_EVIDENCE: Record<ArtifactClass, string[] | null> = {
  TYPE_BATTERY: ['EVIDENCE-BATTERY', 'EVIDENCE-TSC', 'EVIDENCE-CONTAINER', 'EVIDENCE-BUILD', 'EVIDENCE-RUN'],
  RUNTIME: ['EVIDENCE-RUN', 'EVIDENCE-CONTAINER'],
  RUN: ['EVIDENCE-RUN', 'EVIDENCE-CONTAINER'],
  DOC: null,            // greps acceptable — no runtime demanded
  REPORT: null,         // exempt — no writes
};

/** Extract the write set from the agent's return text (file paths with
 *  write-y extensions that appear in the return or the declared targets). */
export function extractWriteSet(returnText: string, declaredTargets: string[]): string[] {
  const paths = new Set<string>();
  // absolute paths in the return text with write-y extensions
  for (const m of returnText.matchAll(/\/[^\s`|()]+?\.(?:ts|tsx|js|mjs|html?|py|md|json)/g)) {
    paths.add(m[0]);
  }
  // the declared targets that now exist-shaped (from the wave spec)
  for (const p of declaredTargets) paths.add(p);
  return [...paths];
}

/** Which lexicon members fire on the return text (the DETECTION layer). */
export function scanReturn(returnText: string): { evidence: string[]; smoke: string[] } {
  const evidence: string[] = [];
  const smoke: string[] = [];
  for (const member of RETURN_EVIDENCE_MEMBERS) {
    if (member.matcher.test(returnText)) {
      (member.kind === 'evidence' ? evidence : smoke).push(member.id);
    }
  }
  return { evidence, smoke };
}
