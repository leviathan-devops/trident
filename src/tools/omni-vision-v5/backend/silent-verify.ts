// Omni Vision v5.0 — Backend Silent Verify
// The consistency check runs AFTER the VLM returns, BEFORE the tool returns.
// The brain (DeepSeek V4 Flash) compares the analysis against the prior frames +
// the storyline and appends a backend-only note where RELEVANT.
// The tool does NOT return a directive the agent must execute — the flags are
// embedded in the analysis text where relevant. The evidence trail goes to
// verify-log.jsonl (the hooks can read it for the claim gate).

import { callBrain } from './brain';
import type { VisionMemory } from './memory';

export interface VerifyResult {
  analysis: string;      // the analysis WITH the backend note appended (where relevant)
  noteAppended: boolean;
  flags: string[];       // the consistency flags (regression / contradiction / ok)
}

const VERIFY_SYSTEM = `You are the silent consistency verifier for a visual analysis pipeline (the shadow
signals layer, re-scoped to the tool domain). Your ONLY job: detect the tool-domain
signals: CONTEXT_MISMATCH (caller belief vs the actual pixels/data), REGRESSION
(vs prior analyses), EXACT_VALUE_VIOLATION (a confident value not readable from the
data), BLANK_INPUT (the media shows no activity), CONTINUITY_BREAK (a discontinuity
across the chain). Output a single JSON object: {"flags": ["..."]}.
NEVER fabricate. NEVER restate the analysis. Only flag REAL contradictions.`;

/**
 * Run the silent consistency verify. Bounded: on brain failure, pass through
 * the analysis unchanged with a logged note (fail-open observation).
 */
export async function silentVerify(
  memory: VisionMemory,
  analysis: string,
  frameSeq: number,
  storylineUsed: string,
): Promise<VerifyResult> {
  const prior = memory.lastAnalyses(3);
  if (prior.length === 0) {
    memory.appendVerifyLog({ frameSeq, flags: [], note: 'no-prior-frames' });
    return { analysis, noteAppended: false, flags: [] };
  }

  const priorExcerpts = prior
    .map((a) => `[frame ${a.seq}] ${a.analysis_json.substring(0, 800)}`)
    .join('\n---\n');

  const prompt = [
    `## STORYLINE (excerpt)`,
    storylineUsed.substring(0, 800),
    ``,
    `## PRIOR FRAME ANALYSES`,
    priorExcerpts,
    ``,
    `## NEW FRAME ANALYSIS (seq ${frameSeq})`,
    analysis.substring(0, 2000),
  ].join('\n');

  const result = await callBrain(prompt, VERIFY_SYSTEM, 1024);

  if (!result.ok) {
    memory.appendVerifyLog({ frameSeq, flags: [], note: `verify-brain-failed: ${result.error}` });
    return { analysis, noteAppended: false, flags: [] };
  }

  // Extract the flags array (defensive — the brain may wrap in prose)
  let flags: string[] = [];
  try {
    const jsonMatch = result.content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (Array.isArray(parsed.flags)) flags = parsed.flags.map(String);
    }
  } catch {
    flags = [];
  }

  if (flags.length > 0) {
    const note =
      `\n\n[backend consistency note — seq ${frameSeq}]\n` +
      flags.map((f) => `- ${f}`).join('\n');
    memory.appendVerifyLog({ frameSeq, flags, note: 'flags-appended' });
    return { analysis: analysis + note, noteAppended: true, flags };
  }

  memory.appendVerifyLog({ frameSeq, flags: [], note: 'consistent' });
  return { analysis, noteAppended: false, flags: [] };
}
