// ============================================================================
// file: src/sidecar/types.ts
//
// THE COUPLING POINT for the Shadow Agent V5 sidecar. Every shared type and
// constant in the V5 orchestrator spec lives here; all sidecar modules import
// from this single module (the spec's `.js` import convention, resolved to
// `.ts` by tsx/esbuild).
//
// Ownership: E0 (this wave). The E1 builders (E1a-E1d) import from here and
// must NOT redefine any of these names locally.
//
// NOTABLE DECISIONS (documented in E0-REPORT.md):
//   - TaskStateName / TaskEvent / Transition are defined HERE (single source)
//     and task-state.ts (§34.2) imports them from ./types.js — the spec shows
//     them defined in task-state.ts, but signals.ts and engine.ts also import
//     TaskStateName from types.js, so the single source is this file.
//   - GateVerdict (§34.3), ToolResult (§34.9), WarheadParts + ParsedResponse
//     (§34.4), RitualOutcome + Option (§21.2), Warhead, EngineError are also
//     defined here so E1 modules import them from the coupling point instead
//     of re-defining (avoids the spec's cross-file duplication).
//   - EngineDeps (§4.2) is defined here with the concrete class members typed
//     as inline structural contracts derived from the spec's engine.ts /
//     index.ts usage. The concrete classes (SignalDeriver, IntentGate, ...)
//     are written by E1a/E1c and structurally satisfy these contracts. E1c's
//     engine.ts must type its private fields via `EngineDeps['signals']` etc.
//     (indexed access), NOT as the concrete class types, because the class
//     instances are only guaranteed to satisfy the structural contract.
// ============================================================================

// tencentdb-adapter is agent-side (DELETED at the tool scope).

// ============================================================================
// §3.1 Core Types
// ============================================================================

/**
 * The raw snapshot produced by the watcher every 5s (and on triggers).
 * This is Order-0 data: raw counters and verbatim text. All intelligence
 * is derived from it by the SignalDeriver — no decision is ever made
 * directly on these fields.
 */
export interface Observation {
  /** Session id, null until the first hook fire (noSession phase). */
  readonly sessionId: string | null;
  /** E4: the session's created time (ms, from the db) — the STABLE freshness
   * anchor. The old in-memory sessionStartAt moved forward on every sidecar
   * restart, making pre-restart artifacts STALE forever (completion blocked
   * live at 10:37). The session's own birth never moves. */
  readonly sessionCreated: number | null;
  /** Number of events-sentinel lines (transform-hook fires). */
  readonly turnCount: number;
  /** Last assistant text part, capped at 4k chars. */
  readonly lastAssistantText: string;
  /** Last tool calls: name, args (capped 200), output hash (S-7), and the
   * REAL message timestamp (E4: replayed tools must age out of the loop
   * window naturally — at=now kept replayed history inside it forever and
   * fabricated REPEATED_TOOL_LOOPs live at 10:40-10:45). */
  readonly lastToolCalls: Array<{ name: string; args: string; outputHash: string; at?: number }>;
  /** Count of session-store parts containing the injection prefix. */
  readonly warheadParts: number;
  /** Files changed since the last observation (path, mtime, size). */
  readonly fileChanges: Array<{ path: string; mtime: number; size: number }>;
  /** Milliseconds since the last activity (turn OR file change). */
  readonly silenceMs: number;
  /** Phase classification: noSession | building | verify | done. */
  readonly phase: 'noSession' | 'building' | 'verify' | 'done';
  /** Token usage of the last assistant message, if the store has it. */
  readonly tokens: { input: number; output: number } | null;
  /** Last tool output text, capped 2k (feeds the blockade lexicon). */
  readonly lastToolOutput: string;
}

/**
 * The derived, stateful signal vector (Layer 1 output).
 * Every field is computed by a pure function over rolling windows;
 * every field has a defined evidence trail (its computation is in §5-§14).
 */
export interface SignalVector {
  /** S-1: accelerating | steady | decaying | zero. */
  readonly trajectory: Trajectory;
  /** S-2: 0..1 completion estimate. */
  readonly completionScore: number;
  /** S-3: the model-aware silence floor in ms. */
  readonly adaptiveSilenceBaselineMs: number;
  /** S-3b: current silence in ms (raw observation — read by the §15.4 gate). */
  readonly silenceMs: number;
  /** S-4: a completion claim without verification-class tool calls. */
  readonly claimWithoutEvidence: boolean;
  /** S-5: per-requirement artifact checks (ground truth). */
  readonly artifactDelta: ArtifactCheck[];
  /** S-6: a permission/credential blockade detected. */
  readonly blockadeDetected: boolean;
  /** S-7: loop repetition with identical output hashes. */
  readonly repetition: RepetitionInfo;
  /** S-8: consecutive LLM errors in the freshness window. */
  readonly modelHealth: ModelHealth;
  /** S-9: the warhead delivery → ack → stall state machine. */
  readonly warheadAckState: WarheadAckState;
}

/**
 * The gate's decision (Layer 2 output). This is the ONLY place actions
 * originate. The engine executes exactly what this says — nothing else
 * may trigger a warhead, a verification, or an escalation.
 */
export type GateDecision =
  | { action: 'NO_ACTION'; reason: string }
  | { action: 'VERIFY'; trigger: TriggerToken; confidence: number; reason: string }
  | { action: 'INTERVENE'; trigger: TriggerToken; confidence: number; reason: string }
  | { action: 'ESCALATE'; trigger: TriggerToken; confidence: number; reason: string };

export type Trajectory = 'accelerating' | 'steady' | 'decaying' | 'zero';

export type WarheadAckState = 'none' | 'delivered' | 'acked' | 'stalled';

export interface RepetitionInfo {
  readonly detected: boolean;
  /** The repeated (toolName|argsHash) key, for the warhead evidence. */
  readonly tuple: string | null;
  /** How many executions produced the identical output hash. */
  readonly identicalOutputs: number;
}

export interface ModelHealth {
  readonly errors: number;
  readonly lastError: string | null;
}

// ============================================================================
// §3.2 S-1 Progress Trajectory Types
// ============================================================================

/**
 * Progress rate over a rolling window: file changes + tool calls.
 * trajectory:
 *   zero         ⟺ rate(5min) == 0
 *   decaying     ⟺ rate(5min) < rate(prev5min) × 0.33 AND rate(5min) ≥ 1
 *   accelerating ⟺ rate(5min) > rate(prev5min) × 1.5
 *   steady       ⟺ otherwise
 *
 * The decay ratio 0.33 is derived from the V4 session: a healthy build
 * produced 8 tool/file events in ~9 min (~0.9/min). A drop below
 * one-third of the previous rate while still active means the build is
 * winding down — but NEVER fires alone (it only weights the gate).
 */
export const TRAJECTORY = {
  WINDOW_MS: 5 * 60 * 1000,
  DECAY_RATIO: 0.33,
  ACCELERATE_RATIO: 1.5,
} as const;

// ============================================================================
// §3.3 S-2 Completion Score Types
// ============================================================================

/**
 * completionScore = 0.5 × todosCompletedRatio
 *                 + 0.3 × artifactPresence
 *                 + 0.2 × finalSummaryPresent
 *
 * 0.5/0.3/0.2 weighting rationale: the todos ratio is the agent's own
 * plan (weakest evidence but a useful signal); artifact presence is the
 * ground truth (SPEC files exist, fresh); the summary phrase is the
 * agent's word (weakest alone, but confirms intent). The gate NEVER
 * trusts the 0.2 leg alone — S-10 requires all three legs to agree.
 */
export interface TodosSnapshot {
  readonly completed: number;
  readonly total: number;
}

/**
 * Completion lexicon — tip-of-spear candidate generation ONLY.
 * These phrases feed the summary leg of the score and S-4. They never
 * decide anything by themselves.
 */
export const COMPLETION_LEXICON = [
  /\b(done|complete|completed|finished|ready)\b/i,
  /\ball\s+\d+\s+(files?|tests?|checks?)\b/i,
  /\b(dashboard|build|feature|module)\s+(is\s+)?(ready|complete|verified)\b/i,
  /\bsuccessfully\s+(built|created|verified|deployed|completed)\b/i,
  /\bno\s+(further|more)\s+(work|tasks|steps)\b/i,
] as const;

// ============================================================================
// §3.4 S-3 Adaptive Silence Baseline Types
// ============================================================================

/**
 * adaptiveSilenceBaselineMs = max(240_000, observedMaxReasoningGapMs × 2)
 *
 * observedMaxReasoningGapMs = the longest gap between an assistant turn
 * start and the next tool call, seeded at 120_000 and updated per turn.
 *
 * Rationale: the V4 session observed a 71.4s reasoning gap (Laguna)
 * before the agent acted — a FIXED 120s timer would have false-fired.
 * The floor 240s protects fast agents; the ×2 multiplier absorbs slow
 * thinkers with margin. This baseline gates every silence-dependent
 * trigger: silence only matters when it exceeds a model-aware floor.
 */
export const SILENCE = {
  FLOOR_MS: 240_000,
  SEED_MAX_GAP_MS: 120_000,
  MULTIPLIER: 2,
} as const;

// ============================================================================
// §3.5 S-4 Claim-vs-Evidence Types
// ============================================================================

/**
 * claimWithoutEvidence ⟺ completion-lexicon hit in lastAssistantText
 *                        ∧ NO verification-class tool call in the 10 min
 *                        before it.
 *
 * Verification-class tools: curl, grep, rg, test, tsc, node, python3,
 * npm, bun (matched by prefix). The window 600s mirrors Shark's
 * CLAIM_WINDOW_MS semantics: a claim older than the window stops
 * gating — the agent may have verified since.
 */
export const CLAIM = {
  WINDOW_MS: 600_000,
} as const;

// E4 (observed live 10:32): the agent verifies with read/bash — the spec's
// original list (curl|grep|rg|test|tsc|node|python3|npm|bun) missed them, so
// a genuine claim-with-evidence never cleared S-4 → the completion path was
// blocked at score 1.0 with all artifacts fresh. read/bash are verification.
export const VERIFICATION_TOOLS = /^(curl|grep|rg|test|tsc|node|python3|npm|bun|read|bash)(\s|$)/;

// ============================================================================
// §3.6 S-5 Artifact Delta Types
// ============================================================================

/**
 * The ground-truth check: does the build produce what the SPEC requires?
 * This is the check the V4 operator had to do by hand:
 *   grep -c hive-map-canvas /app/index.html   → 0  (REJECTED)
 *
 * Required items come from {ws}/SPEC.md (or SHADOW_ACCEPTANCE env,
 * default: markers:hive-map-canvas,HIVE PILOT VERIFIED + appDir:/app).
 */
export interface ArtifactCheck {
  readonly requirement: string;   // e.g. "file /app/index.html" | "marker hive-map-canvas"
  readonly ok: boolean;
  /** Verbatim evidence: the grep line, the stat line, or MISSING. */
  readonly evidence: string;
}

export interface AcceptanceSpec {
  readonly requiredFiles: string[];
  readonly markers: Array<{ pattern: string; appDir: string }>;
  readonly dataJson?: { path: string; minEvents: number };
  readonly checkUrl?: string;
}

// ============================================================================
// §3.7 S-6 Blockade Types
// ============================================================================

/**
 * blockadeDetected ⟺ silence ≥ baseline ∧ phase ≠ done ∧
 *   lastToolOutput matches BLOCKADE_LEXICON
 *   ∨ session has a pending permission in the db (permission.asked).
 *
 * The lexicon is tip-of-spear ONLY — it produces a candidate; the
 * silence + phase conditions must hold for the signal to be true.
 */
export const BLOCKADE_LEXICON = [
  /permission required/i,
  /allow once/i,
  /allow always/i,
  /reject/i,
  /sudo/i,
  /credentials/i,
  /api key/i,
  /authenticate/i,
  /token required/i,
] as const;

// ============================================================================
// §3.8 S-7 Repetition Types
// ============================================================================

/**
 * repetition ⟺ the same (toolName, argsHash) key appears ≥ 2× in 10 min
 *              AND ≥ 2 executions produced the IDENTICAL output hash.
 *
 * Identical output is the discriminator: retrying a flaky command
 * produces different output; a loop reproduces the same bytes. This is
 * the TLE brain's FM-pattern class, implemented deterministically.
 */
export const LOOP = {
  WINDOW_MS: 600_000,
  MIN_SAME_KEY: 2,
  MIN_IDENTICAL_OUTPUTS: 2,
} as const;

// ============================================================================
// §3.9 S-8 Model Health Types
// ============================================================================

/**
 * modelHealth.errors = consecutive LLM errors in the last 10 min
 * (402, 5xx, timeout, empty completion). Evidence source: the opencode
 * log's service=llm error lines + the session store's token rows.
 */
export const MODEL_HEALTH = {
  WINDOW_MS: 600_000,
  ESCALATE_AT: 2,
} as const;

// ============================================================================
// §3.10 S-9 Warhead Ack State Types
// ============================================================================

/**
 * warheadAckState:
 *   none      — no warhead delivered yet
 *   delivered — warhead part exists, no reasoning reference yet
 *   acked     — reasoning references the warhead content
 *   stalled   — acked ∧ no tool activity for ≥ baseline × 1.5
 *
 * This is the exact derailment that killed the osint-build and V4
 * sessions: the agent RECEIVED the warhead (referenced it in reasoning)
 * and then produced NO further activity. acked→stalled requires the
 * silence condition — the ack regex alone is tip-of-spear.
 */
export const ACK = {
  STALL_MULTIPLIER: 1.5,
} as const;

/** Tip-of-spear ack references: the warhead's own markers. */
export const ACK_LEXICON = [
  /HIVE WARHEAD INJECTION/i,
  /pilot steering/i,
  /hive-map-canvas/i,
  /HIVE PILOT VERIFIED/i,
] as const;

// ============================================================================
// §3.11 S-10 Supervised Completion Types
// ============================================================================

/**
 * COMPLETION_VERIFIABLE ⟺ completionScore ≥ 0.9
 *                       ∧ artifactDelta all ok (blockers == 0)
 *                       ∧ (claim evidence ∨ gate passed)
 *
 * The anti-spiral terminal: completion is declared only when the score,
 * the artifact delta, AND the evidence leg all agree — then exactly one
 * BUILD VERIFIED warhead, then silence forever (DONE is terminal, no
 * outgoing edges in the state machine, §4).
 */
export const COMPLETION = {
  SCORE_THRESHOLD: 0.9,
} as const;

// ============================================================================
// §3.12 Aggregate Verdict — The Ledger Line
// ============================================================================

/**
 * The complete record emitted every tick. This is the token firewall's
 * accounting: quietness is provable, every activation is attributable.
 */
export interface LedgerLine {
  readonly t: string;                       // ISO timestamp
  readonly observation: Observation;
  readonly signals: SignalVector;
  readonly gate: GateDecision;
  readonly llmTokensSpent: number;          // 0 unless INTERVENE/ESCALATE activated the loop
  readonly approachHash: string | null;     // §21 decision-ritual dedup
  readonly blindSpots: BlindSpot[];         // §16
}

export type BlindSpot =
  | 'NO_SESSION'          // sessionId null — no hook fire yet (TLA-hang class)
  | 'DB_LOCKED'           // opencode.db read failed — partial observation
  | 'ENV_CHANGE'          // version/model/config fingerprint changed
  | 'TOOL_TIMEOUT'        // a verification tool exceeded its cap — check UNKNOWN
  | 'MODEL_BLIND';        // PI loop DEGRADED — warheads suppressed, gate still runs

/**
 * Trigger tokens — the classification output of the intent gate.
 * The token IS the diagnosis: it names the situation, not a number.
 */
export type TriggerToken =
  | 'STALL_WITH_UNFINISHED_WORK'
  | 'BLOCKED_ON_PERMISSION'
  | 'DONE_CLAIMED_ARTIFACTS_MISSING'
  | 'REPEATED_TOOL_LOOP'
  | 'THEATRICAL_STUBS_WRITTEN'
  | 'DONE_CLAIMED_NO_EVIDENCE'
  | 'SPEC_DRIFT_DETECTED'
  | 'MODEL_API_FAILURE'
  | 'INTERVENTION_ACKED_THEN_STALLED'
  | 'COMPLETION_VERIFIABLE';

// ============================================================================
// §4.2 Dependency Injection Contract (shared types only)
// ============================================================================

export interface TrajectoryVerdict {
  readonly timestamp: string;
  readonly sessionID: string | null;
  readonly signals: SignalVector;
  readonly decision: GateDecision;
  readonly health: number;                 // composite, §4.3
}

export interface EngineState {
  readonly state: unknown;                 // task-state machine serialization
  readonly episode: { trigger: TriggerToken; count: number; lastAt: number } | null;
}

/**
 * EngineDeps — the dependency injection contract consumed by the engine
 * and constructed by src/sidecar/index.ts (§34.11).
 *
 * The concrete classes (SignalDeriver, IntentGate, TaskStateMachine,
 * QualityGate, ShadowTools, PiLoop, DecisionRitual, LedgerWriter,
 * BlindSpotCollector) are written by E1a/E1c and structurally satisfy the
 * inline contracts below — the contracts are derived verbatim from the
 * spec's §4.1 engine.ts and §34.11 index.ts usage sites. E1c's engine.ts
 * must type its private fields via `EngineDeps['signals']`-style indexed
 * access rather than the concrete class types.
 */
export interface EngineDeps {
  /** Resolved workspace root ({ws}/). */
  ws: string;
  /** S-1..S-10 derivations (pure). */
  signals: {
    derive(obs: Observation, state: { state: TaskStateName }): SignalVector;
  };
  /** The intent gate (pure). */
  gate: {
    decide(s: SignalVector, st: TaskState, ep: Episode | null): GateDecision;
  };
  /** The task-state machine (shared with the engine). */
  state: {
    current(): TaskState;
    onEvent(ev: TaskEvent): Transition;
    can(ev: TaskEvent): boolean;
    serialize(): TaskStateName;
    restore(s: TaskStateName): void;
  };
  /** The deterministic quality gate. */
  qualityGate: {
    evaluate(delta?: ArtifactCheck[]): Promise<GateVerdict>;
    summary(): string;
  };
  /** The firewalled tool layer. */
  tools: {
    markVerified(summary: string): ToolResult;
    writeWarhead(warhead: Warhead): ToolResult;
    markNeedsHuman(reason: string): ToolResult;
    markCritical(msg: string): ToolResult;
  };
  /** The pi-mono loop (LLM activation). */
  pi: {
    composeWarhead(s: SignalVector, d: GateDecision): Promise<Warhead>;
  };
  /** The decision ritual (§21). */
  decision: {
    ritual(trigger: TriggerToken, s: SignalVector): Promise<RitualOutcome>;
  };
  /** The evidence emitter. */
  ledger: {
    append(line: LedgerLine): void;
    appendVerdict(v: GateVerdict, ev: Transition): void;
    appendWarhead(w: Warhead): void;
    appendTokens(spent: number): void;
    appendEscalation(o: RitualOutcome): void;
    appendWarn(msg: string): void;
  };
  /** Blind-spot collector (§16). */
  blindSpots: {
    collect(): BlindSpot[];
    report(spot: BlindSpot): void;
  };
  /** TencentDB adapter (existing, reused). */
  memory: never;
  /** Injectable clock for deterministic tests. */
  clock: () => number;
}

// ============================================================================
// §4.4 Serialization and Restart Contract
// ============================================================================

/**
 * The engine's serializable state — the resume anchor (§22.1):
 *   state.json        ← TaskStateMachine.serialize() + episode
 *   pi-session.json   ← PiLoop AgentSession cache
 *   manifest.json     ← TencentDB sync index
 *
 * Restart sequence: load state.json → DONE stays DONE (a restart can
 * never revive the spiral) → load pi-session → hydrate memory → dedup
 * warheads/sent → resume event offsets → poll.
 */
export const RESUME_TRIAD = [
  '{ws}/.shadow/state.json',
  '{ws}/.shadow/pi-session.json',
  '{ws}/memory/manifest.json',
] as const;

// ============================================================================
// §15.4 / §34.2 Task State Machine Types (single source)
// ============================================================================

/**
 * The task-state machine's state names. Defined here as the single source
 * because signals.ts and engine.ts both import TaskStateName from types.js;
 * task-state.ts (§34.2) imports these from ./types.js rather than
 * re-defining them (E0 decision, documented in E0-REPORT.md).
 */
export type TaskStateName =
  | 'UNKNOWN' | 'ACTIVE' | 'VERIFYING' | 'NEEDS_ATTENTION' | 'DONE';

export type TaskEvent =
  | 'TURN' | 'SILENCE_240' | 'ASSERT_DONE' | 'TOOL_ACTIVITY'
  | 'GATE_PASS' | 'GATE_FAIL' | 'NEW_EVIDENCE';

export interface Transition {
  from: TaskStateName; to: TaskStateName; event: TaskEvent; illegal: boolean;
}

/** The gate's view of the task-state machine (intent-gate.ts consumes this). */
export interface TaskState {
  state: TaskStateName;
  lastInterventionAt: number;
}

/** A derailment episode: same trigger token, bounded interventions (§15.4). */
export interface Episode {
  trigger: TriggerToken;
  count: number;
  lastAt: number;
}

// ============================================================================
// §34.3 GateVerdict (single source — quality-gate.ts imports from types.js)
// ============================================================================

export interface GateVerdict {
  verdict: 'PASS' | 'FAIL';
  checks: Array<{ name: string; ok: boolean; evidence: string }>;
  blockerCount: number;
  warnCount: number;
}

// ============================================================================
// §34.4 WarheadParts + ParsedResponse (composer.ts imports from types.js)
// ============================================================================

export interface WarheadParts {
  trigger: string;
  summary: string;
  facts: string[];
  directive: string;
  constraints: string;
}

/** The response protocol parser's output shape (§17.4 / §34.4). */
export type ParsedResponse =
  | { kind: 'VERIFIED'; summary: string }
  | { kind: 'INTERVENE'; evidence: string; fix: string }
  | { kind: 'ESCALATE'; tried: string; why: string; ask: string };

// ============================================================================
// §34.9 ToolResult (tools.ts imports from types.js)
// ============================================================================

/** Every tool returns strings; every cap enforced. */
export interface ToolResult {
  output: string;
  error?: string;
}

// ============================================================================
// §21.2 RitualOutcome + Option (decision.ts imports from types.js)
// ============================================================================

export type RitualOutcome =
  | { kind: 'ACT'; approachHash: string; warhead: Warhead }
  | { kind: 'OPERATOR'; reason: string; operatorWarhead: Warhead };

export interface Option {
  id: string;                    // stable id for the approach hash
  label: string;
  reversible: boolean;           // restart = irreversible
  confidence: number;            // pre-scored by the caller's heuristics
  warhead: Warhead;              // what ACT would deliver
  consequences: string[];        // 2nd-order trace
}

// ============================================================================
// Warhead — the delivered intervention payload (§17.5 T1 structure)
// ============================================================================

export interface Warhead {
  content: string;
  triggerQuote: string;
}

// ============================================================================
// EngineError — thrown by PiLoop on protocol/circuit-breaker failures (§17.1)
// ============================================================================

export class EngineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EngineError';
  }
}

// ============================================================================
// §9.3 FsReadDeps (added to the coupling point — fs-utils.ts, quality-gate.ts
// and signals.ts all depend on this shape)
// ============================================================================

export interface FsReadDeps {
  read: (p: string) => Promise<string | null>;
  grep: (p: string, pattern: string) => Promise<string[]>;
  stat: (p: string) => Promise<{ mtime: number; size: number } | null>;
}
