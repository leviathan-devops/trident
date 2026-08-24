// ═══ THE WAVE-PLANNING GATE v2 — THE WRITTEN PLAN IS THE BUDGET (2026-08-23
// the operator: "why is this a dumb fucking const and not properly adapted to
// the wave plan that is written before the wave manager tool is allowed to be
// called? make sure the proper flow is wave plan skill --> wave plan written
// --> waves from the plan is fed into the state machine and budget is based on
// that. make sure there is no dumb static const") ═══
//
// THE FLOW (mechanically enforced):
//   1. The model loads the wave-planning skill.
//   2. The skill's STEP 5 artifact is WRITTEN TO DISK at .trident/wave-plan.md
//      with a machine-parseable `WAVES: <N>` header line (or explicit
//      `### Wave k` sections the parser counts).
//   3. THE GATE READS THAT FILE. No plan file → COLD → generate REFUSED — a
//      planningNote alone no longer unlocks anything; the plan must EXIST.
//   4. Budget = the plan's wave count. ACTIVE while wavesGenerated < budget
//      AND the plan file is unchanged since the latch.
//   5. STALE when the budget is exhausted OR the plan was edited/deleted —
//      re-planning means EDITING THE PLAN, not whispering a fresh note.
//
// THE KILLED CONSTS: PLAN_WAVE_BUDGET=6 and PLAN_WINDOW_MS=45min are GONE.
// A 2-wave build gets exactly 2 generates; a 12-wave grind sails through all
// 12 without a single re-mandate. The plan governs; nothing else does.
//
// THE EVIDENCE: .trident/wave-planning-state.json keyed by parentSessionId,
// each entry latching {plannedAt, planNote, wavesGenerated, planMtimeMs}.

import * as fs from 'node:fs';
import * as path from 'node:path';

export interface PlanningStateEntry {
  plannedAt: string;
  planNote: string;
  /** Renamed from wavesPlanned (2026-08-23): it counts GENERATES SERVED under
   *  this latch — compared against the WRITTEN PLAN's wave count. */
  wavesGenerated: number;
  /** The plan file's mtimeMs at latch time — any edit to the plan invalidates
   *  the latch (the plan is the contract; a changed plan is a new contract). */
  planMtimeMs: number;
}

export type PlanningPhase = 'cold' | 'active' | 'stale';

/** THE WRITTEN PLAN'S CANONICAL PATH (the skill's STEP 5 artifact home). */
export const WAVE_PLAN_RELATIVE_PATH = '.trident/wave-plan.md';

const NOTE_MIN_CHARS = 20;

export interface WavePlanInfo {
  path: string;
  mtimeMs: number;
  /** The parsed wave budget — from `WAVES: <N>` or counted `### Wave` headings. */
  totalWaves: number;
}

/** THE PLAN PARSER — the budget source. ISE NOTE: these two regexes are
 *  MECHANICAL DETECTORS ONLY (the detection layer, never the decision layer —
 *  the decision is decidePlanning's state machine below). The input is a
 *  human-authored markdown artifact with no AST; `WAVES: <N>` is the skill's
 *  mandated machine-readable header and `### Wave k` its section form — a
 *  line-marker match IS the entire detection problem, so Order-1 matching is
 *  the CORRECT Order here, not slop.
 *  1. `WAVES: <N>` line anywhere in the file wins (the skill mandates it).
 *  2. Otherwise count `### Wave ` headings (the template's section form).
 *  Returns null when the file is absent or parses to zero waves — both are
 *  COLD states: an unparseable plan is no plan. */
export function readWavePlan(planPath: string = path.join(process.cwd(), WAVE_PLAN_RELATIVE_PATH)): WavePlanInfo | null {
  let content: string;
  try { content = fs.readFileSync(planPath, 'utf-8'); } catch { return null; }
  const mtimeMs = fs.statSync(planPath).mtimeMs;
  const marker = content.match(/^\s*WAVES:\s*(\d+)\s*$/im);
  if (marker) {
    const n = Number(marker[1]);
    if (Number.isInteger(n) && n > 0) return { path: planPath, mtimeMs, totalWaves: n };
  }
  const headings = content.match(/^###\s+Wave\s+\d+/gim);
  if (headings && headings.length > 0) return { path: planPath, mtimeMs, totalWaves: headings.length };
  return null;
}

function defaultStatePath(): string {
  return path.join(process.cwd(), '.trident', 'wave-planning-state.json');
}

export function readPlanningState(statePath: string): Record<string, PlanningStateEntry> {
  try {
    return JSON.parse(fs.readFileSync(statePath, 'utf-8')) as Record<string, PlanningStateEntry>;
  } catch {
    return {};
  }
}

export function writePlanningState(statePath: string, state: Record<string, PlanningStateEntry>): void {
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2), 'utf-8');
}

/** THE MACHINE'S DECIDER v2 — pure: (state entry?, planningNote?, plan) → verdict.
 *  NO time const, NO wave-count const — the WRITTEN PLAN is the only budget. */
export function decidePlanning(
  entry: PlanningStateEntry | undefined,
  planningNote: unknown,
  plan: WavePlanInfo | null,
): { phase: PlanningPhase; allow: boolean; reason?: string } {
  // NO WRITTEN PLAN → COLD. Always. A planningNote cannot substitute for the
  // artifact — the operator's flow is skill → plan WRITTEN → manager allowed.
  if (!plan || plan.totalWaves < 1) {
    return { phase: 'cold', allow: false, reason:
      'WAVE PLANNING REQUIRED before any generate. The wave plan must be WRITTEN TO DISK first: '
      + '(1) Load the wave-planning skill. (2) Execute STEPS 1–6 (backward map → forward waves). '
      + '(3) Write the artifact to ' + WAVE_PLAN_RELATIVE_PATH + ' with a `WAVES: <N>` header line '
      + '(N = total sequential waves). (4) Re-fire action=generate — the gate reads the file and '
      + 'grants exactly N generates. A planningNote WITHOUT the written plan unlocks NOTHING.' };
  }
  const note = typeof planningNote === 'string' ? planningNote.trim() : '';
  const planChanged = !entry || entry.planMtimeMs !== plan.mtimeMs;
  if (planChanged) {
    // FIRST latch under this plan (or the plan was edited → new contract):
    // demand the note as the engagement statement, then grant wave 1 of N.
    if (note.length < NOTE_MIN_CHARS) {
      return { phase: entry ? 'stale' : 'cold', allow: false, reason:
        'WAVE PLAN ' + (entry ? 'CHANGED' : 'DETECTED') + ' (' + plan.path + ', ' + plan.totalWaves
        + ' waves). Re-fire with a fresh planningNote stating this plan\'s purpose (one line).' };
    }
    return { phase: entry ? 'stale' : 'cold', allow: true };
  }
  // SAME plan, latch alive → budget check against the FILE's count:
  if ((entry?.wavesGenerated ?? 0) >= plan.totalWaves) {
    return { phase: 'stale', allow: false, reason:
      'WAVE PLAN BUDGET EXHAUSTED: ' + (entry?.wavesGenerated ?? 0) + '/' + plan.totalWaves
      + ' waves generated from ' + plan.path + '. The plan governs the budget — to run more waves, '
      + 'EDIT the plan (add Wave ' + (plan.totalWaves + 1) + '+ sections or raise the WAVES: line), '
      + 'then re-fire. A planningNote alone does NOT extend an exhausted plan.' };
  }
  return { phase: 'active', allow: true };
}

/** THE GATE CHECK — v3 semantics (2026-08-23, the operator: "waves should not
 *  be consumed until the agents are actually dispatched"): this is PURE — it
 *  throws the steering refusal on COLD/exhausted/changed-plan WITHOUT NOTE,
 *  and writes NOTHING. The budget is consumed ONLY by recordWaveServed() when
 *  a generate call actually dispatches agents. A refused call (thin spec,
 *  validation failure) burns ZERO budget. */
export function checkWavePlanning(
  args: Record<string, unknown>,
  sessionId: string | null,
  statePath: string = defaultStatePath(),
  planPath?: string,
): void {
  if (!sessionId) return;
  const plan = readWavePlan(planPath ?? path.join(process.cwd(), WAVE_PLAN_RELATIVE_PATH));
  const state = readPlanningState(statePath);
  const verdict = decidePlanning(state[sessionId.slice(-24)], args.planningNote, plan);
  if (!verdict.allow && verdict.reason) throw new Error(verdict.reason);
}

/** THE BUDGET TICK — called AFTER a wave actually dispatches agents. Consumes
 *  exactly ONE wave of the written plan's budget for this session, creating/
 *  refreshing the latch as needed (a first-dispatch after a fresh plan latch
 *  stamps plannedAt + planMtimeMs). */
export function recordWaveServed(
  sessionId: string | null,
  statePath: string = defaultStatePath(),
  planPath?: string,
  planNote: string = '',
): void {
  if (!sessionId) return;
  const key = sessionId.slice(-24);
  const plan = readWavePlan(planPath ?? path.join(process.cwd(), WAVE_PLAN_RELATIVE_PATH));
  const state = readPlanningState(statePath);
  const prev = state[key];
  state[key] = {
    plannedAt: prev && prev.planMtimeMs === (plan?.mtimeMs ?? 0) ? prev.plannedAt : new Date().toISOString(),
    planNote: prev?.planNote || planNote,
    wavesGenerated: (prev?.wavesGenerated ?? 0) + 1,
    planMtimeMs: plan ? plan.mtimeMs : 0,
  };
  writePlanningState(statePath, state);
}
