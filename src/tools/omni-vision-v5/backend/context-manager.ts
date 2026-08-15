// Omni Vision v5.0 — Backend Context Manager
// The v9.4.0 pattern: rebuild fresh context per inference from SQLite.
// The tool retains NOTHING between calls — the filesystem + SQLite are the memory.
// This is what makes the tool "relate things between tool calls" WITHOUT being an agent:
// the relationship is materialized as CONTEXT, not behavior.

import type { VisionMemory } from './memory';
import type { AnalysisRecord } from './memory';
import { tdbLoadHistory } from './tdb-sync';
import type { BriefInput } from './brief-builder';
import { buildVisionAnalysisBrief } from './brief-builder';
import * as fs from 'node:fs';
import * as path from 'node:path';

export interface ContextInput {
  projectId: string;
  mediaType: string;
  mediaPath: string;
  mediaContext: string;
  analysisGoal: string;
  outputRequirements: string[];
  storyline?: string;       // optional — the stored bible is injected when omitted
  artDirection?: string;    // optional — the stored spec is injected when omitted
  chainLength?: number;     // default 5
}

export interface BuiltContext {
  brief: string;
  storylineUsed: string;
  artDirectionUsed: string | null;
  priorAnalyses: AnalysisRecord[];
  epochSummary: string | null;
  frameSeq: number;
}

/**
 * Build the analysis context for a call: storyline + context chain + epoch.
 * Silently seeds the memory with the caller's storyline/art_direction on first call.
 */
export async function buildContext(memory: VisionMemory, input: ContextInput): Promise<BuiltContext> {
  // ── Storyline resolution: the arg OR the stored bible ──
  let storyline = input.storyline?.trim() ?? '';
  let artDirection = input.artDirection?.trim() ?? '';

  const stored = memory.getStoryline();
  if (!storyline && stored) storyline = stored.content;
  if (!artDirection && stored?.art_direction) artDirection = stored.art_direction;

  // ── Seed the memory silently when the caller provides richer context ──
  if (storyline && (!stored || stored.content !== storyline)) {
    memory.setStoryline(storyline, artDirection.length > 0 ? artDirection : undefined);
  }

  // ── The context chain ──
  const chainLength = input.chainLength ?? 5;
  let priorAnalyses = memory.lastAnalyses(chainLength);
  const epochSummary = memory.getEpochSummary();
  const frameSeq = memory.nextSeq();

  // ── T2 COLD-START HYDRATION (v5.1.3): when the T1 chain is cold (a NEW
  //    session), pull the durable history from TencentDB (cross-session
  //    persistence — the operator's T1/T2 model: SQLite = hot per-call,
  //    TencentDB = durable across sessions). The pulled history is injected
  //    into the brief's context chain as prior analyses. Fail-open: T2 down
  //    = cold start, never a crash. ──
  if (priorAnalyses.length === 0) {
    const t2History = await tdbLoadHistory(input.projectId, memory.sessionKey, chainLength)
      .catch(() => []);
    if (t2History.length > 0) {
      const t2Seq = 1000; // durable-history frames live in the 1000+ band
      priorAnalyses = t2History.map((content, i) => ({
        frame_id: `t2-${memory.sessionKey}-${t2Seq - i}`,
        seq: t2Seq - i,
        analysis_json: content,
        brief_hash: 't2-durable',
        brain_model: 'deepseek-v4-flash',
        vlm_model: 'mimo-v2.5',
        created_at: new Date().toISOString(),
      }));
    }
    // ── THE T2 HYDRATION OBSERVABILITY RECORD (M19 — the operator's "bet your
    //    life" fix #1): the t2-{sessionKey}-{seq} frame-id STRING was NOT
    //    post-hoc observable (the brief stores only its hash). This record
    //    persists the EXACT injected frame ids + the content lengths to
    //    <sessionDir>/hydrations.jsonl — append-only, one line per hydration
    //    event — so the injection is mechanically verifiable from disk even
    //    when the brief hash is opaque. Zero impact when the T2 is empty or
    //    down (the record simply records an empty frame list). ──
    try {
      const hydDir = path.join(memory.sessionDir, 'hydrations');
      fs.mkdirSync(hydDir, { recursive: true });
      fs.appendFileSync(
        path.join(hydDir, 'hydrations.jsonl'),
        JSON.stringify({
          ts: new Date().toISOString(),
          frameSeq,
          t2Count: priorAnalyses.length,
          t2Frames: priorAnalyses.map((a) => ({ frame_id: a.frame_id, seq: a.seq, chars: a.analysis_json.length })),
        }) + '\n',
        'utf8',
      );
    } catch (e) {
      // the record is observability, never load-bearing — but a failure must
      // be LOUD (the loud-error law): log it, never swallow silently.
      console.error(`[vc-context] t2 hydration record write failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  const briefInput: BriefInput = {
    projectId: input.projectId,
    mediaType: input.mediaType,
    mediaPath: input.mediaPath,
    mediaContext: input.mediaContext,
    analysisGoal: input.analysisGoal,
    outputRequirements: input.outputRequirements,
    storyline: storyline || '(no storyline registered — analyze on visual merit alone)',
    artDirection: artDirection || undefined,
    priorAnalyses,
    epochSummary,
    frameSeq,
  };

  const brief = buildVisionAnalysisBrief(briefInput);
  return {
    brief,
    storylineUsed: storyline,
    artDirectionUsed: artDirection || null,
    priorAnalyses,
    epochSummary,
    frameSeq,
  };
}
