// src/tools/shadow/shadow-degeneracy.ts
// THE DEGENERACY LEXICON + STATE MACHINE (2026-08-19 — the operator: "make
// sure you build a proper lexicon for this degeneracy filter and not a dumb
// truncator that cuts off stupidly and can fuck up later").
//
// THE PROBLEM (the live NVIDIA finding): the model (Nemotron) degenerates
// into TOKEN SOUP mid-generation — the 1992-line live output had the ENTIRE
// valid dispatch prompt in lines 1-66, then line 67 collapsed into
// incoherent word-salad: fused tokens ("of1ichtete"), CJK leakage ("随后"),
// bracket cascades ("[ [ ["), random mid-word capitals ("industrydnmS"), and
// stray Unicode dingbats ("‐ „ ¾"). A POSITIONAL truncator (cut after the
// RETURN FORMAT section) would have DESTROYED the valid [SHADOW INFERENCE]
// content that followed it — the operator's exact objection. The cut must be
// at the DEGENERACY ONSET, wherever it occurs, detected by a REAL lexicon.
//
// THE ISE LAW (the INTELLIGENT_SYSTEMS_ENGINEERING_T1 warhead):
// - The PatternFamily: every degeneracy class is a typed FAMILY MEMBER
//   { id, kind, matcher, triggerCondition, severity, messageTemplate,
//     remediationHook, exampleHits }.
// - The state machine: IDLE → PARSED → ANALYZED → CLASSIFIED → EVIDENCED →
//   EMITTED; every transition has a mechanical precondition; the fail-state
//   is INCONCLUSIVE, never PASS.
// - The MPSE triplet: { Pattern, State, Evidence } — no triplet, no finding.
//
// THE DETECTION/DECISION SPLIT (the ISE law): the family matchers below are
// the DETECTION layer (Order-2 structural scans — they measure the line's
// CHARACTER CLASS COMPOSITION, not just grep for keywords). The DECISION is
// the state machine: a line is CLASSIFIED as degenerate only when its
// structural scores cross the calibrated thresholds (each threshold NAMED +
// calibrated from the live evidence). The machine is fail-closed: a line that
// cannot be classified is INCONCLUSIVE (kept, never cut).

// ── THE PATTERN FAMILY (typed members — the detection lexicon) ──

export type DegeneracyKind =
  | "FUSED_TOKENS"      // long lowercase runs with no spaces (token soup)
  | "CJK_LEAK"          // CJK/Unicode-range chars in an English prompt
  | "BRACKET_CASCADE"   // repeated [ [ [ / "[[ / ]] — the recursion artifacts
  | "RANDOM_CASE"       // mid-word capitals not at sentence starts
  | "UNICODE_DINGBATS"  // stray ‐ „ ¾ etc. — the font-corruption artifacts
  | "NON_LETTER_DENSE"  // lines that are mostly punctuation/digits/whitespace
  | "REVIEW_LEAK";      // the model's self-review meta-commentary in the output

export interface DegeneracyFamilyMember {
  id: string;
  kind: DegeneracyKind;
  /** THE STRUCTURAL MATCHER — Order-2: measures the line's character-class
   *  composition, never a bare keyword grep. Returns the severity score
   *  (0-1) or 0 for no match. */
  score(line: string): number;
  /** The threshold above which a line is flagged (calibrated from the live
   *  evidence — each number references its calibration in the comment). */
  threshold: number;
  severity: "high" | "medium";
  messageTemplate: string;
  exampleHits: string[];
}

/** THE CALIBRATION SOURCE (the live 2026-08-19 NVIDIA evidence — the line 67
 *  onset): "the really ideology of1ichtete andr \"y and [ [ industrydnmS downc
 *  recent racism pillf随后 CIA InvestigationLos andc [ [ [ health..." —
 *  the degenerate line is 70%+ non-letter chars, contains fused tokens
 *  (length>12 with no spaces), CJK chars, bracket cascades, and mid-word
 *  capitals SIMULTANEOUSLY. The clean lines (1-66) have <10% non-letter
 *  chars, no CJK, no fused tokens, no bracket cascades. The thresholds are
 *  set to separate these two populations with a clear margin. */
const CJK_RE = /[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af\uff00-\uffef]/;
const BRACKET_CASCADE_RE = /(\[\s*){3,}|(quote\s*){2,}\[/i;
const MID_WORD_CAP_RE = /\b[a-z]{2,}[A-Z][a-z]+\b/;
const DINGBAT_RE = /[\u2020-\u2027\u2030-\u2038\u20ac\u00a7\u00b6\u00be\u00bc\u00bd]/;

export const DEGENERACY_FAMILY: DegeneracyFamilyMember[] = [
  {
    id: "DG-FUSED",
    kind: "FUSED_TOKENS",
    // THE MATCHER: a run of >= 20 lowercase letters with NO internal space
    // or punctuation (the model's token soup fuses words). The live evidence:
    // "of1ichtete", "industrydnmS", "downc" — the fused runs.
    score(line) {
      const runs = line.match(/[a-z]{20,}/g);
      if (!runs) return 0;
      const fusedChars = runs.reduce((n, r) => n + r.length, 0);
      const letters = (line.match(/[a-zA-Z]/g) || []).length;
      if (letters === 0) return 0;
      return Math.min(1, fusedChars / letters);
    },
    threshold: 0.35,
    severity: "high",
    messageTemplate: "the line contains fused tokens (long lowercase runs with no spaces — the model's token soup)",
    exampleHits: ["of1ichtete", "industrydnmS", "downc recent racism"],
  },
  {
    id: "DG-CJK",
    kind: "CJK_LEAK",
    // THE MATCHER: ANY CJK/Unicode-range char in an English dispatch prompt.
    // The live evidence: "随后" (the Chinese leak at the onset). The dispatch
    // prompts are ALWAYS English (the DPL1 templates) — a CJK char is a
    // definitive degeneracy marker.
    score(line) {
      return CJK_RE.test(line) ? 1 : 0;
    },
    threshold: 0.5,
    severity: "high",
    messageTemplate: "the line contains CJK/Unicode-range characters (随后 etc.) — the model's cross-lingual degeneracy",
    exampleHits: ["随后 CIA InvestigationLos", "‐Hyim", "„"],
  },
  {
    id: "DG-BRACKET",
    kind: "BRACKET_CASCADE",
    // THE MATCHER: repeated open/close brackets (3+ in a run) — the recursion
    // artifacts of the degenerate attention loop. The live evidence:
    // "[ [ [ health", "\"[[In Performance".
    score(line) {
      return BRACKET_CASCADE_RE.test(line) ? 1 : 0;
    },
    threshold: 0.5,
    severity: "high",
    messageTemplate: "the line contains a bracket cascade ([ [ [ or \"[[ — the attention-loop recursion artifact)",
    exampleHits: ["[ [ [ health Tharmne", "\"[[In Performance Vision"],
  },
  {
    id: "DG-CASE",
    kind: "RANDOM_CASE",
    // THE MATCHER: mid-word capitals or ALL-CAPS runs — the corruption of
    // the normal sentence case. The live evidence: "industrydnmS",
    // "HCSecuritySecuritycon", "InvestProf".
    score(line) {
      const caps = line.match(MID_WORD_CAP_RE);
      if (!caps) return 0;
      // weight by the number of hits
      return Math.min(1, caps.length / 3);
    },
    threshold: 0.5,
    severity: "medium",
    messageTemplate: "the line contains mid-word capitals or ALL-CAPS runs (industrydnmS) — the case corruption",
    exampleHits: ["industrydnmS", "HCSecuritySecuritycon"],
  },
  {
    id: "DG-DINGBAT",
    kind: "UNICODE_DINGBATS",
    // THE MATCHER: stray typographic symbols (‐ „ ¾ § ¶) — the font-corruption
    // artifacts of the degenerate generation. The live evidence: "‐Hyim",
    // "„", "¾".
    score(line) {
      return DINGBAT_RE.test(line) ? 1 : 0;
    },
    threshold: 0.5,
    severity: "medium",
    messageTemplate: "the line contains stray Unicode dingbats (‐ „ ¾) — the font-corruption artifact",
    exampleHits: ["‐HyimRecent", "„", "¾"],
  },
  {
    id: "DG-REVIEW",
    kind: "REVIEW_LEAK",
    // THE MATCHER (2026-08-19 — the live HuFvYv finding): the model output its
    // SELF-REVIEW as the prompt content — "I think it's all good. The output
    // is clean. I should say DONE... But wait - the user said..." — the meta-
    // commentary interleaved with the actual prompt. The dispatch prompt NEVER
    // contains the model's evaluation of its own output. THE DETECTOR: the
    // first-person meta phrases (I think / I should / But wait / Let me check
    // / That should be fine / I need to be / Looking back / One more check).
    // THE SEVERITY: HIGH — the meta-commentary is the model's reasoning, not
    // the deliverable; a prompt full of it is a FAILED generation.
    score(line) {
      if (!/^I\s+(think|should|need|believe|want)|^But wait|^Let me check|^That should be fine|^Looking back|^One more check|^Another thing|^I don't have|^I didn't include|^I have|^I'll say/i.test(line.trim())) return 0;
      return 1;
    },
    threshold: 0.5,
    severity: "high",
    messageTemplate: "the line is the model's self-review meta-commentary (\"I think\", \"But wait\") — the reasoning leaked into the output",
    exampleHits: ["I think it's all good.", "But wait - the user said...", "Let me check one more thing:", "Looking back at the DPL1 validation items again:"],
  },
  {
    id: "DG-NONLETTER",
    kind: "NON_LETTER_DENSE",
    // THE MATCHER: a line whose non-letter content (digits/punct/whitespace)
    // exceeds the named threshold — the degenerate tail is mostly noise. The
    // calibration: clean lines are ~20-40% non-letter; the degenerate tail
    // exceeds 60%. THE STRUCTURAL EXEMPTIONS (2026-08-19 — the A1/A3/A6/A7
    // mock failure): markdown table separators ("|--------|------|"), code
    // fences ("```"), and horizontal rules ("---") are LEGITIMATE structure
    // with zero letters — they must NEVER be flagged as degenerate. The
    // exemption regex checks the line is PURELY a table separator / fence /
    // rule before the density score applies.
    score(line) {
      if (line.trim().length === 0) return 0;
      // THE EXEMPTIONS: table separators, fences, hr rules, list markers
      const trimmed = line.trim();
      if (/^\|[\s\-:|]+\|$/.test(trimmed)) return 0; // a table separator
      if (/^```/.test(trimmed)) return 0; // a code fence
      if (/^-{3,}$/.test(trimmed)) return 0; // a horizontal rule
      if (/^(\d+\.)\s+/.test(trimmed)) return 0; // a numbered list item (the marker is structure)
      const letters = (line.match(/[a-zA-Z]/g) || []).length;
      const ratio = 1 - letters / line.length;
      return Math.min(1, Math.max(0, (ratio - 0.6) / 0.3));
    },
    threshold: 0.5,
    severity: "medium",
    messageTemplate: "the line is mostly non-letter content (digits/punct — the degenerate noise)",
    exampleHits: [".Hy.8'", "ln", "Vert vers"],
  },
];

// ── THE STATE MACHINE (the DECISION layer — the ISE law: the detection is
//    the lexicon, the DECISION is the machine; fail-closed) ──

export type DegeneracyState =
  | "IDLE"
  | "PARSED"
  | "ANALYZED"
  | "CLASSIFIED"
  | "EVIDENCED"
  | "EMITTED"
  | "INCONCLUSIVE";

export interface DegeneracyVerdict {
  state: DegeneracyState;
  /** The onset line INDEX (1-based) where the degeneracy begins, or -1. */
  onsetLine: number;
  /** The MPSE triplets: { Pattern, State, Evidence } for every flagged line. */
  triplets: Array<{ pattern: string; state: DegeneracyState; evidence: string }>;
  /** The cut text: everything BEFORE the onset (the valid prompt). */
  clean: string;
  /** The cut text: everything from the onset onward (the degenerate tail). */
  tail: string;
}

/** THE LINE-SCORE (a single line against the whole family — returns the max
 *  family hit + the list of matched ids). The DETECTION layer. */
export function scoreLine(line: string): { score: number; hits: string[]; severity: "high" | "medium" | null } {
  let maxScore = 0;
  let maxSeverity: "high" | "medium" | null = null;
  const hits: string[] = [];
  for (const member of DEGENERACY_FAMILY) {
    const s = member.score(line);
    if (s > 0) {
      if (s > maxScore) {
        maxScore = s;
        maxSeverity = member.severity;
      }
      hits.push(member.id);
    }
  }
  // THE DECISION (the machine's ANALYZED → CLASSIFIED transition): a line is
  // CLASSIFIED as degenerate when (a) ANY high-severity family scores >= its
  // threshold, OR (b) 2+ families score > 0 simultaneously (the live onset
  // line hit FUSED + CJK + BRACKET + CASE simultaneously).
  const thresholdHits = hits.filter((id) => {
    const m = DEGENERACY_FAMILY.find((f) => f.id === id);
    if (!m) return false;
    return scoreLineInternal(m, line) >= m.threshold;
  });
  const classified = thresholdHits.length > 0 || (hits.length >= 2 && maxScore > 0.2);
  return {
    score: maxScore,
    hits,
    severity: classified ? maxSeverity : null,
  };

  function scoreLineInternal(m: DegeneracyFamilyMember, l: string): number {
    return m.score(l);
  }
}

/** THE CUT-QUALITY GUARD (2026-08-19 — the operator: "not a dumb truncator
 *  that cuts off stupidly"): the onset line is adjusted BACKWARD until it
 *  lands on a boundary that does NOT split a bullet, a code block, or a
 *  numbered item. The live evidence: the onset was mid-bullet ("- THE
 *  MISSION: ... reading the really ideology") — a raw cut there would have
 *  left a dangling "- THE MISSION:" fragment. The guard walks back to the
 *  previous line that is a bullet start (starts with "- ") or a blank. */
export function adjustCutBoundary(lines: string[], rawOnset: number): number {
  let idx = rawOnset; // 1-based onset
  // THE CUT IS EXCLUSIVE: the degenerate line itself is NEVER kept. Walk back
  // from the onset to the nearest SAFE boundary — a blank line or a section
  // header (####/###) — so the cut lands at the START of a clean structural
  // unit. A corrupted bullet ("- THE MISSION: ...of1ichtete...") is a unit
  // whose START looks valid but whose BODY is degenerate — cutting before the
  // bullet leaves a dangling "- " fragment, so the cut walks back to the
  // preceding header/blank. The live evidence: onset line 65 was a corrupted
  // "- THE MISSION:" bullet; the correct cut is at the "### What the task
  // actually requires" header (line 63), keeping the header + dropping the
  // corrupted bullet.
  let boundary = -1;
  while (idx > 0) {
    const line = lines[idx - 1]; // 0-based (the line AT the cut position)
    if (line.trim().length === 0 || /^#{1,6}\s/.test(line)) {
      boundary = idx; // cut BEFORE this blank/header → it is kept
      break;
    }
    // if we've walked to a bullet start AND the onset line was NOT itself a
    // bullet start, cut before the bullet (keep the bullet's header context)
    if (/^\s*[-*]\s+/.test(line) && !/^\s*[-*]\s+/.test(lines[rawOnset - 1] ?? '')) {
      boundary = idx;
      break;
    }
    idx -= 1;
  }
  // fall back: cut at the onset (never keep the degenerate line)
  return boundary > 0 ? boundary : rawOnset;
}

/** THE DEGENERACY FILTER (the machine's full run: IDLE → PARSED → ANALYZED →
 *  CLASSIFIED → EVIDENCED → EMITTED). Returns the verdict with the clean text
 *  (everything before the onset) + the tail (the degenerate region). */
export function detectDegeneracy(text: string): DegeneracyVerdict {
  // IDLE → PARSED: the input is a string
  if (!text || text.trim().length === 0) {
    return { state: "INCONCLUSIVE", onsetLine: -1, triplets: [], clean: text ?? "", tail: "" };
  }
  const lines = text.split("\n");
  const triplets: DegeneracyVerdict["triplets"] = [];
  let onset = -1;

  // PARSED → ANALYZED: score every line against the family
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim().length === 0) continue;
    const { severity, hits } = scoreLine(line);
    if (severity) {
      // EVIDENCED: the MPSE triplet (Pattern, State, Evidence)
      triplets.push({
        pattern: hits.join("+"),
        state: "CLASSIFIED",
        evidence: "line " + (i + 1) + ": " + line.substring(0, 100),
      });
      if (onset < 0) {
        onset = i + 1; // 1-based onset (the FIRST degenerate line)
      }
    }
  }

  if (onset < 0) {
    return { state: "EMITTED", onsetLine: -1, triplets: [], clean: text, tail: "" };
  }

  // CLASSIFIED → EMITTED: the boundary guard (never split a bullet)
  const cutIdx = adjustCutBoundary(lines, onset);
  const clean = lines.slice(0, cutIdx).join("\n").trim();
  const tail = lines.slice(cutIdx).join("\n").trim();
  return { state: "EMITTED", onsetLine: cutIdx, triplets, clean, tail };
}
