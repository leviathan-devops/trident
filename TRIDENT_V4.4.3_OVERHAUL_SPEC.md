# TRIDENT v4.4.3 — POSEIDON GOD LOOP OVERHAUL — MACRO SPECIFICATION
# ============================================================
**Version:** 2.0 (ENHANCED — incorporates all user feedback + decision-making tool)
**Classification:** POSEIDON OVERHAUL — INTELLIGENT EVENT-DRIVEN STATE MACHINE
**Authority:** Trident v4.4.3 Overhaul Architecture
**Engine Mandate:** "Replace tool-call-driven God Loop with intelligent event-driven autonomous goal engine, wire decision-making intelligence at every judgment point, enable parallel workflow execution via forked sessions with shadow agent sidecar bridges."
**Build Time Estimate:** 8-12 days (3 parts, sequential)
**Lines of Code Estimate:** ~3,600 new + ~800 modified
**Semantic Order Target:** L3 (Behavioral)
**Dependencies:**
  - TRIDENT_DECISION_MAKING_TOOL_SPEC.md (MANDATORY — provides 20 decision frameworks)
  - v4.4.3 Converged base (hash: 7461c3d3...)
  - Shadow Agent v2 architecture (existing plumbing at Active_Projects/Shadow_Agents)
**Build Status:** SPECIFICATION — Awaiting Implementation
**Date:** 2026-07-30
**Build Order:** Part 1 → Part 2 → Part 3 (sequential, each independently testable)
# ============================================================

## TABLE OF CONTENTS

- Part 1: God Loop Phase Intelligence Overhaul
- Part 2: /poseidon Command — Event-Driven Macro Goal Loop
- Part 3: Forked Session Workflow System — Shadow Agent Sidecar Bridge
- Appendix A: Task Classification Intelligence
- Appendix B: Container Test Adversarial Quality Gates
- Appendix C: Execution Mode Decision Matrix
- Appendix D: Shadow Agent Sidecar Intervention Patterns
- Appendix E: Event Flow Reference
- Appendix F: Decision-Making Tool Integration Map
- Appendix G: Acceptance Criteria (Complete)
- Appendix H: Bible Compliance Matrix
- Appendix I: File Manifest (Complete)
- Appendix J: Performance Budgets

---

# ═══════════════════════════════════════════════════════════
# PART 1: GOD LOOP PHASE INTELLIGENCE OVERHAUL
# ═══════════════════════════════════════════════════════════

## 1.1 PROBLEM STATEMENT

The current God Loop has 13 phases but only DISPATCH requires model intelligence.
The other 12 phases are mechanical — they run deterministic code and return
instructions saying "call trident-poseidon action=start."

This is a design flaw. Six phases require engineering judgment:

1. DECIDE — Approach selection when score stalls
2. PLAN — Root cause analysis + fix strategy per file
3. DISPATCH — Agent dispatch (already model-required — unchanged)
4. VERIFY — Trust determination on agent outputs
5. CONTAINER_TEST (on failure) — Failure diagnosis (FULLY MANUAL, primary agent owned)
6. PROBLEM_SOLVE — Deep source code analysis + architectural proposals

## 1.2 NO FALLBACKS — PHASE-APPROPRIATE ACTION ENFORCEMENT

**CRITICAL DESIGN DECISION:** There are NO fallbacks to mechanical routing.

If the model is at DECIDE phase and calls `action=start` instead of `action=decide`,
the God Loop REJECTS it:

```
[POSEIDON: PHASE ACTION ERROR]
You are at DECIDE phase. action=start is not valid here.
You MUST call trident-poseidon action=decide with your decision and reasoning.
```

Same enforcement for every model-required phase:
- DECIDE → must call `action=decide`
- PLAN → must call `action=plan`
- VERIFY → must call `action=verify`
- CONTAINER_TEST (on failure) → must call `action=diagnose`
- PROBLEM_SOLVE → must call `action=solve`

The model engages with the intelligence or the loop stalls — and the stall
detector catches it and escalates.

**MECHANICAL PHASES (unchanged, no model action needed):**
- INIT, AUDIT, SCORE, COLLECT, AUDIT_RECHECK → run mechanically, advance automatically
- These phases call `trident-poseidon action=start` internally (via GoalDriver, not the model)

## 1.3 CORRECTED PHASE CLASSIFICATION

| Phase | Type | Model Action Required | Intelligence Source |
|-------|------|----------------------|---------------------|
| INIT | Mechanical | None | Deterministic file scan |
| AUDIT | Mechanical | None | 18-layer AST engine |
| SCORE | Mechanical | None | Formula: max(0, 100-15C-8H-3M-1L) |
| **DECIDE** | **Model** | **action=decide** | Decision-Making Engine Layer 2 |
| **PLAN** | **Model** | **action=plan** | Decision-Making Engine + DP L1 via preflight |
| **DISPATCH** | **Model** | **task() calls** | Model dispatches agents |
| COLLECT | Mechanical | None | Read agent output files |
| **VERIFY** | **Model** | **action=verify** | Decision-Making Engine Layer 2 (sniff test) |
| AUDIT_RECHECK | Mechanical | None | Re-run audit engine |
| **CONTAINER_TEST** | **Model (FULLY MANUAL)** | **action=diagnose (on failure)** | Primary agent owns entire process |
| **PROBLEM_SOLVE** | **Model** | **action=solve** | Decision-Making Engine + source reading |
| PASS | Terminal | None | Goal complete |
| LOOP | Terminal→Reset | None | Round reset with learning |

## 1.4 DECIDE PHASE — INTELLIGENT APPROACH SELECTION

### Decision-Making Tool Integration

At DECIDE phase, the Decision-Making Engine's Layer 2 generates a decision context
using frameworks composed for the current problem type:

```
[POSEIDON: DECIDE — Engineering Judgment Required]

The Decision-Making Engine has selected these frameworks for your problem:
- Consequence Cascade (F3): Trace 2nd/3rd order effects of each option
- Reversibility Classification (F2): Is this reversible?
- Inflection Detection (F11): Has the approach been invalidated?
- Depth Calibration (F15): Are you thinking deeply enough?

Current State:
- Score: 94/100 (target: 96)
- Cycle: 2 (max: 50)
- Stall counter: 2/2 (AT THRESHOLD)
- Findings: 4 remaining (down from 16)

Remaining Findings by File:
  ArchitectureFactory.ts (4 findings):
    [CRITICAL] R17:119 — delegate() returns hardcoded success
    [HIGH] R10:110 — isAgentAllowedTool() never called
    [HIGH] R10:123 — canDelegate() never called
    [HIGH] R10:131 — enforceGate() never called

Previous Wave Results:
- Wave 1: 6 agents, 12 resolved, 4 remain
- All 4 remaining in SAME FILE
- Previous approach: individual catch-block fixes
- Result: findings persist — fixes didn't address root cause

Decision Required:
Choose ONE:
A) PLAN — New wave with DIFFERENT approach (the previous one failed)
B) PROBLEM_SOLVE — Deep diagnosis (read source, identify architectural issue)
C) ACCEPT_RISK — Mark as acceptable risk with justification

Foresight (from Consequence Cascade):
If A (PLAN with same approach): → findings persist again → score stalls →
  PROBLEM_SOLVE fires anyway → 1 wasted cycle
If A (PLAN with different approach): → may resolve if root cause addressed
If B (PROBLEM_SOLVE): → reads source → identifies architectural issue →
  next PLAN is informed → higher success probability
If C (ACCEPT_RISK): → score jumps to 100 → container test runs →
  but CRITICAL finding remains → adversarial verification will likely reject

Recommendation: B (PROBLEM_SOLVE)
Reasoning: All 4 findings are theatrical code (dead functions + stub returns).
  Individual fixes can't resolve theatrical code — the functions need real
  implementations or removal. This is an architectural decision, not a
  patch-level decision.

Call trident-poseidon action=decide with your choice.
```

### New trident-poseidon Action: `decide`

```typescript
// action=decide parameters
{
  action: 'decide',
  decision: 'PLAN' | 'PROBLEM_SOLVE' | 'ACCEPT_RISK',
  reasoning: string,           // Why this decision — first principles chain
  approachChange?: string,     // If PLAN: what's different from last wave
  riskJustification?: string,  // If ACCEPT_RISK: why acceptable + what evidence
}
```

If ACCEPT_RISK: findings marked `accepted_risk`, score recalculated excluding
them, risk justification stored in canon docs for audit trail. CONTAINER_TEST
proceeds, but adversarial verification will scrutinize accepted risks.

## 1.5 PLAN PHASE — INTELLIGENT FIX STRATEGY

### Decision-Making Tool Integration

PLAN uses the Decision-Making Engine + existing DP L1 pipeline via preflight:

**Process:**
1. Decision-Making Engine Layer 2 provides frameworks: Critical Path, Blast Radius,
   Elimination Principle, Mental Simulation
2. Model generates fix strategies per file (root cause analysis)
3. Model calls `action=plan` with file strategies
4. God Loop builds agent specs from model's strategies
5. Agent specs go through `trident-preflight` validation
6. DISPATCH gate calls full DP L1 pipeline (with quality audit) for each agent
7. L1 output becomes the agent's prompt

**Key: The primary agent generates HIGH-QUALITY INPUT ARGS during PLAN.
These args go through preflight. The DISPATCH gate calls the full DP L1
pipeline internally — same quality audit, same output standards. The
primary agent never holds 5 detailed L1 plans in its context.**

### Dispatch Input Freshness Gate

```
DISPATCH verifies plan files being injected are fresh:
- Plans written to: .trident/workflows/dispatch-plans/
- Each plan labeled with task-relevant-token
- DISPATCH reads from dispatch-plans subfolder
- Plans must be < 10 minutes old (ample write time)
- If stale → REJECT dispatch → RESET to PLAN gate → force proper plan writing
```

### New trident-poseidon Action: `plan`

```typescript
{
  action: 'plan',
  fileStrategies: Array<{
    file: string,
    approach: string,          // High-level strategy (root cause informed)
    rootCause: string,         // What's actually wrong at depth
    specificFixes: Array<{
      findingId: string,
      fix: string,             // Specific fix instruction
    }>,
    blastRadiusAssessment: string, // What this change affects
    depthLevel: 'surface' | 'medium' | 'deep' | 'root',
  }>,
}
```

## 1.6 VERIFY PHASE — INTELLIGENT TRUST DETERMINATION

### Two-Stage Verification

**Stage 1 (Mechanical — unchanged):**
- SHA256 verification (files actually changed?)
- Build verification (compiles?)
- Evidence rate (enough tool calls?)
- Audit artifact freshness (audit ran recently?)

**Stage 2 (NEW — model intelligence with Decision-Making Engine):**

Frameworks active: Sniff Test, Construction vs Evidence, Depth Calibration

```
[POSEIDON: VERIFY — Trust Judgment Required]

Mechanical checks: ALL PASS
SHA256: verified | Build: passes | Evidence rate: 0.98

Agent Outputs for review:
Agent 1 (StateStore.ts):
  SHA256: 9f68f4d7... | Claims: "Fixed empty catch with console.error + rethrow"
  Code: catch (e: unknown) { console.error("[StateStore]", e); throw new Error(...); }
  → Is this real error handling or theatrical? Does the rethrow reach a handler?

Agent 2 (ArchitectureFactory.ts):
  SHA256: a3b2c1d4... | Claims: "Removed delegate() stub, implemented real delegation"
  Code: delegate(task) { const result = this.assignTask(task); return result; }
  → Is assignTask() a real implementation or another stub?
  → CONSTRUCTION CHECK: does the new code add discriminative power or is it tautological?

For each agent: Call trident-poseidon action=verify with per-agent verdicts.
```

### New trident-poseidon Action: `verify`

```typescript
{
  action: 'verify',
  agentVerdicts: Array<{
    agentName: string,
    verdict: 'TRUSTED' | 'QUARANTINED' | 'REJECTED',
    reasoning: string,         // First principles chain
    issues?: string[],         // New issues introduced
    depthAssessment: 'surface' | 'medium' | 'deep' | 'root',
  }>,
}
```

## 1.7 CONTAINER_TEST — FULLY MANUAL, PRIMARY AGENT OWNED

### CRITICAL: This Phase Is NOT Automated

The primary agent FULLY OWNS the entire container testing process. This is THE
most manual part of the whole God Loop with the STRICTEST adversarial quality
gates. The God Loop does NOT advance from CONTAINER_TEST until the agent produces
real mechanical evidence from 5+ adversarial angles.

### What the Agent Must Do

1. **Design a container test plan** that tests expected post-ship behavior from
   5+ DIFFERENT adversarial angles. Not 5 variations of the same test — 5
   genuinely different attack vectors that try to break the system in different ways.
2. **Execute each test** via `trident-container-test` tool manually
3. **Analyze every failure mode** — root cause, not symptom
4. **Only declare PASS** when ALL angles pass with mechanical evidence

### Adversarial Quality Gates (Mechanically Enforced)

The following quality filters REJECT inadequate test plans and force rewrites:

**Gate 1: Scenario Count (mechanical)**
```
if (testPlan.scenarios.length < 5) {
  REJECT: "Container test plan requires minimum 5 adversarial scenarios.
  Current: N. You are testing post-ship behavior in production runtime
  environments. Anything less than 5 angles is insufficient."
  → RESET to CONTAINER_TEST planning
}
```

**Gate 2: Scenario Diversity (semantic)**
```
// Semantic check: are the 5 scenarios genuinely different?
const attackVectors = scenarios.map(s => classifyAttackVector(s));
const uniqueVectors = new Set(attackVectors);
if (uniqueVectors.size < 5) {
  REJECT: "Scenarios are not sufficiently diverse. Detected overlap:
  ${findOverlaps(scenarios)}. Each scenario must test a DIFFERENT
  failure mode."
}
// Attack vector categories: input-validation, concurrency, state-corruption,
// resource-exhaustion, boundary-conditions, permission-bypass, error-propagation,
// integration-failure, configuration-drift, timing-race
```

**Gate 3: Evidence Quality (semantic, using SSTF patterns from v4.4.2)**
```
// For each scenario, verify the evidence is mechanical, not theatrical
for (const scenario of scenarios) {
  if (!hasMechanicalEvidence(scenario)) {
    REJECT: "Scenario '${scenario.name}' lacks mechanical evidence.
    Evidence must include: stream output, artifact on disk, SHA256,
    or exit code. 'I tested it and it works' is not evidence."
  }
  if (isTheatricalEvidence(scenario)) {
    // Uses SSTF's DESCRIPTIVE vs SUGGESTIVE scoring
    REJECT: "Scenario '${scenario.name}' has theatrical evidence.
    Output appears simulated, not mechanically captured."
  }
}
```

**Gate 4: Adversarial Intent (semantic)**
```
// Using the same lexicon system as Poseidon intent detection
for (const scenario of scenarios) {
  const adversarialScore = scoreAdversarialIntent(scenario.description);
  const descriptiveScore = scoreDescriptiveContext(scenario.description);
  if (adversarialScore < descriptiveScore) {
    REJECT: "Scenario '${scenario.name}' is not adversarial enough.
    It describes what SHOULD work rather than trying to BREAK it.
    Rewrite with adversarial intent: 'What happens if X goes wrong?'"
  }
}
```

**Gate 5: Coverage Completeness**
```
// Must cover: identity, tools, firewall, audit, poseidon lifecycle
const requiredCoverage = ['identity', 'tools', 'firewall', 'audit', 'poseidon'];
const covered = scenarios.map(s => detectCoverageArea(s));
for (const area of requiredCoverage) {
  if (!covered.includes(area)) {
    REJECT: "Missing coverage for: ${area}. Test plan must cover all
    critical system areas: identity injection, tool availability, firewall
    enforcement, audit accuracy, and Poseidon lifecycle."
  }
}
```

### New trident-poseidon Action: `diagnose` (on container test failure)

```typescript
{
  action: 'diagnose',
  diagnosis: Array<{
    error: string,
    rootCause: string,         // WHY it failed, not WHAT failed
    fixFile: string,
    fixApproach: string,
    blastRadius: string,       // What else is affected
  }>,
  nextPhase: 'PLAN' | 'PROBLEM_SOLVE',
  reasoning: string,
}
```

### On Container Test PASS

If the container test PASSES all 5+ adversarial scenarios with mechanical
evidence, the God Loop advances to PASS. No further model action needed.

## 1.8 PROBLEM_SOLVE — DEEP SOURCE ANALYSIS

### The Model Reads Actual Source Code

PROBLEM_SOLVE is NOT text generation. The model:

1. READS the actual source files with findings
2. Identifies the ROOT CAUSE (architectural, not symptom-level)
3. Proposes SPECIFIC changes (not abstract recommendations)
4. Uses Decision-Making Engine frameworks: Depth Calibration, Derivation Engine,
   Enhancement Protocol, Inflection Detection

### New trident-poseidon Action: `solve`

```typescript
{
  action: 'solve',
  rootCause: string,           // The architectural issue
  depthLevel: 'surface' | 'medium' | 'deep' | 'root',
  proposal: string,            // Specific change proposal
  affectedFiles: string[],
  estimatedEffort: 'low' | 'medium' | 'high',
  derives?: string[],          // What patterns can be distilled from this
  nextPhase: 'PLAN' | 'LOOP',
  reasoning: string,           // First principles chain
}
```

## 1.9 IMPLEMENTATION FILES (Part 1)

| File | Action | Est. Lines |
|------|--------|-----------|
| src/poseidon/god-loop.ts | MODIFY — add intelligence to 5 phases | +400 |
| src/poseidon/phase-intelligence.ts | NEW — context generators per phase | 350 |
| src/tools/trident-poseidon.ts | MODIFY — add 5 new actions | +200 |
| src/tools/decision-engine/* | NEW — (see DM Tool Spec) | 1,330 |
| **Part 1 Total** | | **~2,280** |

---

# ═══════════════════════════════════════════════════════════
# PART 2: /poseidon COMMAND — EVENT-DRIVEN MACRO GOAL LOOP
# ═══════════════════════════════════════════════════════════

## 2.1 /poseidon COMMAND — REPLACES NLP ACTIVATION

### No Blanket Activation

```
/poseidon
→ ERROR: "Poseidon requires a goal. Usage: /poseidon <goal description>"
→ Write permissions remain DISABLED.
```

The user MUST provide a purpose every time. Write permissions are tied to an
active goal — no goal, no writes. This forces the user to use at least 5% of
their brain. God mode has standards.

### Command Interface

```
/poseidon <goal description>     → Activate with goal, classify task, start
/poseidon status                 → Show goal + workflow status
/poseidon stop                   → User interrupt, deactivate immediately
```

**Auto-deactivation:** When the goal fully completes (PASS + adversarial
verification), Poseidon auto-deactivates and write permissions are disabled.
The user does NOT need to type /poseidon stop on success.

### Lifecycle

```
/poseidon <goal>
  → Activate Poseidon Mode (writes unlocked)
  → Decision-Making Engine Layer 0: classify problem
  → Decision-Making Engine Layer 1: chart strategic path
  → Task Classification: DIRECT vs LINEAR vs PARALLEL (see Appendix A)
  → Goal Driver starts (event-driven autonomous loop)
  → System prompt injected with goal status every round

[goal runs autonomously via GoalDriver event loop]

  Goal completes (PASS + adversarial verification)
  → Auto-deactivate (writes locked)
  → Decision-Making Engine Layer 4: extract completion intelligence
  → Output returned to user

OR

  /poseidon stop
  → Deactivate immediately (writes locked)
  → State preserved for resumption
```

## 2.2 TASK CLASSIFICATION — 3 EXECUTION MODES

When /poseidon activates, the Decision-Making Engine classifies the task:

### Mode 1: DIRECT (No God Loop)

```
Classification criteria:
- < 10 TypeScript files in target
- < 10 audit findings
- Problem type: trivial modification, single-file fix, quick cleanup

Behavior:
- Poseidon Mode active (writes unlocked)
- NO God Loop started
- Normal Trident agent behavior with writes enabled
- Agent works directly on the target
- /poseidon completes when agent says "done" + evidence verified
```

### Mode 2: LINEAR (Single God Loop in session)

```
Classification criteria:
- 10-30 TypeScript files
- 10-50 audit findings
- Problem type: moderate refactor, module overhaul, bug fix campaign

Behavior:
- Poseidon Mode active (writes unlocked)
- Single God Loop started in current session
- GoalDriver drives the loop via event hook + client.session.prompt()
- No forked sessions, no shadow agents
- Agent advances through 13 phases with decision-making intelligence
```

### Mode 3: PARALLEL (Multiple God Loops via forked sessions)

```
Classification criteria:
- > 30 TypeScript files AND > 50 findings
- Modules are separable (minimal cross-imports)
- Problem type: large-scale refactor, multi-module migration, integration

Behavior:
- Poseidon Mode active (writes unlocked)
- Parent session runs GoalDriver as coordinator
- Forked child sessions run individual God Loops (see Part 3)
- Shadow agent sidecars bridge parent-child communication
```

### Classification Output

```
[POSEIDON] Target: /path/to/project
[POSEIDON] Goal: Migrate auth module to new API
[POSEIDON]
[POSEIDON] Scanning target...
[POSEIDON] 67 files, 94 findings detected
[POSEIDON] Problem type: migration/complex
[POSEIDON]
[POSEIDON] Classification: PARALLEL execution
[POSEIDON] 3 separable modules detected:
[POSEIDON]   - src/auth/ (24 files, 38 findings)
[POSEIDON]   - src/middleware/ (19 files, 31 findings)
[POSEDION]   - src/routes/ (24 files, 25 findings)
[POSEIDON]
[POSEIDON] 3 parallel workflows will be dispatched.
[POSEIDON] Integration workflow will run after all 3 complete.
[POSEIDON]
[POSEIDON] Decision-Making Engine: Strategic path charted.
[POSEIDON] Frameworks active: Consequence Cascade, Parallel Tracks,
[POSEIDON]   Convergence Detector, Blast Radius, Premortem
[POSEIDON]
[POSEIDON] Goal loop starting. Use /poseidon stop to cancel.
```

## 2.3 GOAL DRIVER — EVENT-DRIVEN AUTONOMOUS LOOP

### Architecture

The GoalDriver replaces the tool-call-driven model. Instead of the model
calling `trident-poseidon action=start`, the GoalDriver:

1. **Watches for turn completion** via the `event` hook (step-finish/idle)
2. **Evaluates the goal** after every turn (mechanical + decision engine)
3. **Injects continuation** via `input.client.session.prompt()` as synthetic user turn
4. **Runs adversarial verification** when goal appears complete

This is structurally identical to grok-build's goal driver: the platform
evaluates each model round and re-prompts automatically.

### GoalDriver Implementation

```typescript
class GoalDriver {
  private active: boolean = false;
  private sessionId: string = '';
  private targetPath: string = '';
  private goal: string = '';
  private goalState: GoalState;
  private continuationPending: boolean = false;
  private decisionEngine: DecisionEngine;
  private workflowRegistry: WorkflowRegistry | null = null;
  private executionMode: ExecutionMode = 'LINEAR';

  startGoal(
    sessionId: string,
    targetPath: string,
    goal: string,
    client: unknown,
  ): void {
    this.active = true;
    this.sessionId = sessionId;
    this.targetPath = targetPath;
    this.goal = goal;
    this.client = client;

    // Layer 0: Assess problem space
    const assessment = this.decisionEngine.assessProblemSpace(targetPath, goal);

    // Determine execution mode
    this.executionMode = assessment.recommendedExecutionMode;

    // Layer 1: Chart strategic path
    const cognition = this.decisionEngine.chartStrategicPath(
      targetPath, goal, assessment, findings);

    // Initialize goal state
    this.goalState = {
      status: 'Active',
      phase: 'Executing',
      tokenBudget: 0,
      tokensUsed: 0,
      roundsSinceVerify: 0,
      lastVerifierGaps: [],
      consecutiveNotAchieved: 0,
      goalStartTimestamp: Date.now(),
      lastEvaluatorVerdict: '',
      executionMode: this.executionMode,
      strategicPath: cognition,
    };

    // Start based on execution mode
    switch (this.executionMode) {
      case 'DIRECT':
        // No God Loop — just enable writes, let agent work
        this.injectDirectModePrompt(goal, targetPath);
        break;
      case 'LINEAR':
        // Single God Loop in this session
        this.startLinearGodLoop(targetPath, sessionId);
        break;
      case 'PARALLEL':
        // Forked sessions (Part 3)
        this.workflowRegistry = new WorkflowRegistry(client, sessionId);
        this.startParallelWorkflows(targetPath, assessment);
        break;
    }

    poseidonState.startGoal(sessionId, targetPath, goal);
    tridentLog('INFO', 'goal-driver',
      `Goal started: mode=${this.executionMode}, target=${targetPath}`);
  }

  // Called from plugin's event hook when step-finish/idle detected
  async onTurnComplete(sessionId: string): Promise<void> {
    if (!this.active || sessionId !== this.sessionId) return;
    if (this.continuationPending) return; // Dedup

    // 1. Evaluate the goal round
    const verdict = await this.evaluateGoalRound();

    switch (verdict) {
      case 'Continue':
        const directive = this.prepareContinuation();
        await this.injectContinuation(directive);
        break;

      case 'CandidateComplete':
        const verification = await this.runAdversarialVerification();
        if (verification.verdict === 'Achieved') {
          await this.completeGoal();
        } else {
          this.goalState.lastVerifierGaps = verification.gaps;
          this.goalState.consecutiveNotAchieved++;
          const directive = this.prepareContinuation();
          await this.injectContinuation(directive);
        }
        break;

      case 'Blocked':
        this.goalState.status = 'Blocked';
        // Inject guidance for user
        await this.injectContinuation(
          '[POSEIDON: BLOCKED]\n\nThe goal is blocked. ' +
          'Review the blocker and provide guidance, or use /poseidon stop.');
        break;
    }
  }

  // Evaluate current round — mechanical + decision engine
  async evaluateGoalRound(): Promise<'Continue' | 'CandidateComplete' | 'Blocked'> {
    if (this.executionMode === 'DIRECT') {
      // DIRECT mode: check if agent declared completion with evidence
      return this.evaluateDirectMode();
    }

    // LINEAR/PARALLEL: check God Loop state
    const godLoopState = godLoopOrchestrator.getStatus(this.targetPath);

    if (godLoopState.phase === 'PASS') return 'CandidateComplete';

    // Check for model stall (no tool call in last response)
    // Decision-Making Engine Layer 3: detect cognitive traps
    const enhancement = this.decisionEngine.generateMetaCognitiveEnhancement(
      godLoopState.phase, this.decisionHistory, lastModelOutput);

    // If traps detected, they're injected into the continuation
    return 'Continue';
  }

  // Prepare continuation directive
  prepareContinuation(): string {
    const godLoopState = godLoopOrchestrator.getStatus(this.targetPath);
    const enhancement = this.decisionEngine.generateMetaCognitiveEnhancement(
      godLoopState.phase, this.decisionHistory, '');

    let directive = '[POSEIDON: CONTINUATION]\n\n';
    directive += 'Goal: ' + this.goal + '\n';
    directive += 'God Loop Phase: ' + godLoopState.phase + '\n';
    directive += 'Score: ' + godLoopState.score + '/100\n';
    directive += 'Cycle: ' + godLoopState.cycle + '\n';
    directive += 'Stall: ' + godLoopState.stalledSince + '/2\n';

    if (this.goalState.lastVerifierGaps.length > 0) {
      directive += '\nGAPS FROM LAST VERIFICATION:\n';
      for (const gap of this.goalState.lastVerifierGaps) {
        directive += '- ' + gap + '\n';
      }
    }

    // Layer 3: Meta-cognitive enhancements
    if (enhancement.depthCheck) directive += '\n' + enhancement.depthCheck + '\n';
    if (enhancement.derivationPrompt) directive += '\n' + enhancement.derivationPrompt + '\n';
    if (enhancement.blindspotProbe) directive += '\n' + enhancement.blindspotProbe + '\n';

    // Phase-appropriate action
    directive += '\nAdvance the God Loop now.';
    directive += '\nMechanical phases advance automatically.';
    directive += '\nFor model-required phases, call the appropriate action.';

    return directive;
  }

  // Inject continuation as synthetic user turn
  async injectContinuation(directive: string): Promise<void> {
    this.continuationPending = true;
    try {
      const client = this.getClient();
      await client.session.prompt(this.sessionId, {
        parts: [{ type: 'text', text: directive }],
      });
    } catch (e) {
      tridentLog('ERROR', 'goal-driver',
        'Failed to inject continuation: ' + (e instanceof Error ? e.message : String(e)));
    }
    this.continuationPending = false;
  }

  // Adversarial verification (ported from grok-build pattern)
  async runAdversarialVerification(): Promise<VerificationResult> {
    // 1. Build evidence packet
    const evidence = await this.buildEvidencePacket();

    // 2. Spawn 3 skeptic subagents in parallel
    const skeptics = await Promise.all([
      this.spawnSkeptic(evidence, 0),  // Gatekeeper
      this.spawnSkeptic(evidence, 1),  // Cold panel
      this.spawnSkeptic(evidence, 2),  // Cold panel
    ]);

    // 3. Aggregate — majority of COLD panel (skeptic 0's approve doesn't count)
    const coldVotes = skeptics.slice(1);
    const notRefuted = coldVotes.filter(s => s.verdict === 'Not Refuted');
    const needed = Math.floor(coldVotes.length / 2) + 1;

    if (notRefuted.length >= needed) {
      return { verdict: 'Achieved', gaps: [] };
    } else {
      const gaps = skeptics.flatMap(s => s.findings || []);
      return { verdict: 'NotAchieved', gaps };
    }
  }

  // Complete goal
  async completeGoal(): Promise<void> {
    this.active = false;

    // Layer 4: Extract completion intelligence
    const intelligence = this.decisionEngine.extractCompletionIntelligence(
      true, godLoopState.score, godLoopState.cycle);

    // Store intelligence for future goals
    await this.storeCompletionIntelligence(intelligence);

    // Deactivate Poseidon (disable writes)
    poseidonState.completeGoal(this.sessionId);

    tridentLog('INFO', 'goal-driver', 'Goal COMPLETE. Poseidon deactivated.');
  }
}
```

### GoalState Interface

```typescript
interface GoalState {
  status: 'Active' | 'Paused' | 'Blocked' | 'Complete' | 'BudgetLimited';
  phase: 'Planning' | 'Executing' | 'Verifying';
  tokenBudget: number;
  tokensUsed: number;
  roundsSinceVerify: number;
  lastVerifierGaps: string[];
  consecutiveNotAchieved: number;
  goalStartTimestamp: number;
  lastEvaluatorVerdict: string;
  executionMode: ExecutionMode;
  strategicPath: StrategicCognition;
}
```

## 2.4 SIMPLIFICATION — REMOVING NLP DETECTION

With /poseidon as the activation command, the following are REMOVED:

| Component | File | Status |
|-----------|------|--------|
| PoseidonDetector | warheads/nlp-pipeline/poseidon-detector.ts | REMOVED |
| classifyActivationIntent | warheads/nlp-pipeline/poseidon-detector.ts | REMOVED |
| chat.message Poseidon detection | hooks/trident-hooks.ts (lines ~489-510) | REMOVED |
| Poseidon Intent Gate | hooks/trident-hooks.ts (tool.execute.before) | REMOVED |
| setPoseidonIntent/getPoseidonIntent | hooks/agent-state.ts | REMOVED |

What REMAINS (unchanged):
- poseidonState.activate/deactivate/isActive
- isGodLoopActive/getGodLoopPhase
- isLeafNode
- Tool blocking/unblocking based on poseidonState.isActive()
- Phase enforcement (God Loop phase-appropriate actions)

## 2.5 SYSTEM PROMPT INJECTION

```typescript
// In experimental.chat.system.transform:
if (goalDriver.isActive()) {
  const status = goalDriver.getStatus();

  let prompt = '\n[POSEIDON GOAL LOOP ACTIVE]\n';
  prompt += 'Goal: ' + status.goal + '\n';
  prompt += 'Mode: ' + status.executionMode + '\n';
  prompt += 'Phase: ' + status.phase + '\n';
  prompt += 'Score: ' + status.score + '/100\n';
  prompt += 'Cycle: ' + status.cycle + '\n';

  if (status.executionMode === 'PARALLEL') {
    prompt += '\nActive Workflows:\n';
    for (const wf of status.workflows) {
      prompt += '  ' + wf.name + ': ' + wf.phase + ' (' + wf.score + '/100)\n';
    }
  }

  // Decision-Making Engine Layer 3: meta-cognitive enhancements
  const enhancement = decisionEngine.generateMetaCognitiveEnhancement(
    status.phase, decisionHistory, '');
  if (enhancement.depthCheck) prompt += '\n' + enhancement.depthCheck;
  if (enhancement.blindspotProbe) prompt += '\n' + enhancement.blindspotProbe;

  prompt += '\nYou are in autonomous mode. Do NOT stop and wait for user input.';
  system.push(prompt);
}
```

## 2.6 IMPLEMENTATION FILES (Part 2)

| File | Action | Est. Lines |
|------|--------|-----------|
| src/poseidon/goal-driver.ts | NEW — event-driven macro loop | 400 |
| src/poseidon/goal-verifier.ts | NEW — adversarial skeptic panel | 300 |
| src/hooks/trident-hooks.ts | MODIFY — remove NLP, add goal driver integration | +100/-80 |
| src/hooks/agent-state.ts | MODIFY — remove intent tracking, add goal state | +50/-30 |
| src/poseidon/poseidon-state.ts | MODIFY — add goal state management | +80 |
| opencode.json | MODIFY — register /poseidon command | +5 |
| **Part 2 Total** | | **~825** |

---

# ═══════════════════════════════════════════════════════════
# PART 3: FORKED SESSION WORKFLOW SYSTEM
# SHADOW AGENT SIDECAR BRIDGE
# ═══════════════════════════════════════════════════════════

## 3.1 ARCHITECTURE OVERVIEW

```
┌─────────────────────────────────────────────────────────────────┐
│                     /poseidon (PARENT)                           │
│                                                                 │
│  GoalDriver ◄──► DecisionEngine ◄──► ShadowPoseidon            │
│       │                  │                    │                 │
│       │           Strategic Path           Filter Layer         │
│       │           (Layer 1)               (token flow control)  │
│       │                                                        │
│  ┌────┴──────────────────────────────────────────────────┐     │
│  │              WORKFLOW REGISTRY                          │     │
│  │  god-loop-hydra │ god-loop-tools │ god-loop-pipeline   │     │
│  └──┬──────────────┬───────────────┬──────────────────────┘     │
│     │              │               │                            │
│     ▼              ▼               ▼                            │
│  ┌────────┐   ┌────────┐    ┌────────┐                         │
│  │CHILD 1 │   │CHILD 2 │    │CHILD 3 │  Forked OpenCode         │
│  │Session │   │Session │    │Session │  Sessions                │
│  │        │   │        │    │        │                         │
│  │/poseidon   │/poseidon   │/poseidon  Each child has:          │
│  │ active │   │ active │    │ active │  - Own model stream     │
│  │        │   │        │    │        │  - Own context window   │
│  │God Loop│   │God Loop│    │God Loop│  - Own God Loop          │
│  │on hydra│   │on tools│    │on pipe │  - Own audit findings    │
│  └───┬────┘   └───┬────┘    └───┬────┘                         │
│      │            │             │                               │
│      ▼            ▼             ▼                               │
│  ┌────────┐   ┌────────┐    ┌────────┐                         │
│  │SHADOW  │   │SHADOW  │    │SHADOW  │  Shadow Agent Sidecars   │
│  │SIDECAR │   │SIDECAR │    │SIDECAR │                          │
│  │  1     │   │  2     │    │  3     │  Each sidecar:           │
│  │        │   │        │    │        │  - Monitors child events │
│  │Stall   │   │Stall   │    │Stall   │  - Intervenes via prompt │
│  │detect  │   │detect  │    │detect  │  - Feeds radio bus       │
│  │False   │   │False   │    │False   │  - Routes parent cmds    │
│  │claim   │   │claim   │    │claim   │                          │
│  │Loop    │   │Loop    │    │Loop    │                          │
│  │detect  │   │detect  │    │detect  │                          │
│  └───┬────┘   └───┬────┘    └───┬────┘                         │
│      │            │             │                               │
│      └────────────┴─────────────┘                               │
│                   │                                             │
│                   ▼                                             │
│         ┌──────────────────┐                                    │
│         │    RADIO BUS      │  FindingBus port (TypeScript)     │
│         │                   │  - SHA-256 dedup                   │
│         │  Channel:         │  - Severity promotion              │
│         │  workflow:{name}  │  - Synchronous delivery            │
│         └────────┬──────────┘                                    │
│                  │                                               │
│                  ▼                                               │
│         ┌──────────────────┐                                    │
│         │  SHADOW POSEIDON  │  Token flow filter                 │
│         │                   │  - Escalates only CRITICAL         │
│         │  Filter:          │  - Routes commands to children     │
│         │  Critical only    │  - Manages short-term memory       │
│         └────────┬──────────┘                                    │
│                  │                                               │
│                  ▼                                               │
│         ┌──────────────────┐                                    │
│         │ SHORT-TERM MEMORY │  Context pool                      │
│         │ (TencentDB pattern)│  - Absorbs all shadow data        │
│         │                   │  - Organizes by recency            │
│         │  Max 500 entries  │  - Auto-expires old data           │
│         │  Max 50 cycles    │  - Deduplicates                    │
│         └──────────────────┘                                    │
│                                                                 │
│  After all parallel workflows PASS:                              │
│  → Dependency graph triggers integration workflow                │
│  → Integration God Loop runs on full project                    │
│  → Container test on final merged output                        │
│  → Goal adversarial verification                                │
│  → /poseidon auto-deactivates                                   │
└─────────────────────────────────────────────────────────────────┘
```

## 3.2 WORKFLOW REGISTRY

```typescript
class WorkflowRegistry {
  private workflows: Map<string, WorkflowInstance> = new Map();
  private dependencyGraph: DependencyGraph;
  private completed: Set<string> = new Set();

  constructor(
    private client: OpenCodeClient,
    private parentSessionId: string,
  ) {
    this.dependencyGraph = new DependencyGraph();
  }

  async createWorkflow(
    name: string,
    targetPath: string,
    dependsOn: string[] = [],
  ): Promise<WorkflowInstance> {
    // 1. Register in dependency graph
    this.dependencyGraph.addWorkflow(name, dependsOn);

    // 2. Check if dependencies are met
    if (!this.dependenciesMet(name)) {
      // Register but don't start — blocked by dependencies
      const instance: WorkflowInstance = {
        name, targetPath, dependsOn,
        status: 'blocked',
        childSessionId: null,
        shadow: null,
        createdAt: Date.now(),
      };
      this.workflows.set(name, instance);
      return instance;
    }

    // 3. Create forked session
    const childSession = await this.client.session.create({
      parentID: this.parentSessionId,
      title: 'workflow:' + name,
    });

    // 4. Activate /poseidon on child session
    poseidonState.activate(childSession.id);

    // 5. Generate DP L1 prompt for this workflow
    const l1Prompt = await this.generateWorkflowL1Prompt(
      targetPath, name, parentGoal);

    // 6. Send L1 prompt to child — this IS the /poseidon activation
    await this.client.session.prompt(childSession.id, {
      parts: [{
        type: 'text',
        text: '[POSEIDON WORKFLOW: ' + name + ']\n\n' +
              'Target: ' + targetPath + '\n' +
              'You are an autonomous workflow agent.\n' +
              'Run the God Loop on your target until PASS.\n' +
              'Do NOT stop until PASS or /poseidon stop from parent.\n\n' +
              l1Prompt,
      }],
    });

    // 7. Create shadow agent sidecar
    const shadow = new ShadowAgentSidecar(
      childSession.id,
      this.parentSessionId,
      name,
      targetPath,
      this.client,
    );

    // 8. Register
    const instance: WorkflowInstance = {
      name, targetPath, dependsOn,
      status: 'active',
      childSessionId: childSession.id,
      shadow,
      createdAt: Date.now(),
    };
    this.workflows.set(name, instance);

    tridentLog('INFO', 'workflow-registry',
      `Workflow ${name} started: target=${targetPath}, session=${childSession.id}`);
    return instance;
  }

  // Check if any blocked workflows can now start
  checkBlockedWorkflows(): string[] {
    const ready = this.dependencyGraph.getReady(this.completed);
    const started: string[] = [];
    for (const name of ready) {
      const wf = this.workflows.get(name);
      if (wf && wf.status === 'blocked') {
        this.createWorkflow(name, wf.targetPath, wf.dependsOn);
        started.push(name);
      }
    }
    return started;
  }

  // Called when a workflow reaches PASS
  onWorkflowComplete(name: string): void {
    this.completed.add(name);
    tridentLog('INFO', 'workflow-registry',
      `Workflow ${name} COMPLETE. Checking for newly unblocked workflows.`);
    this.checkBlockedWorkflows();
  }

  allComplete(): boolean {
    return this.dependencyGraph.isComplete(this.completed);
  }

  private dependenciesMet(name: string): boolean {
    const deps = this.dependencyGraph.getDependencies(name);
    return deps.every(d => this.completed.has(d));
  }
}
```

## 3.3 SHADOW AGENT SIDECAR

```typescript
class ShadowAgentSidecar {
  constructor(
    private childSessionId: string,
    private parentSessionId: string,
    private workflowName: string,
    private targetPath: string,
    private client: OpenCodeClient,
  ) {}

  // Called from plugin's event hook for events from this child
  onEvent(event: OpencodeEvent): void {
    if (event.properties?.sessionID !== this.childSessionId) return;

    switch (event.type) {
      case 'step-finish':
        this.onChildTurnComplete(event);
        break;
      case 'message-updated':
        this.onChildMessage(event);
        break;
      case 'session.status':
        this.onChildStatusChange(event);
        break;
    }
  }

  private async onChildTurnComplete(event: any): Promise<void> {
    // 1. Read child's recent messages
    const messages = await this.client.session.messages(this.childSessionId);
    const lastMessages = messages.slice(-5);

    // 2. Analyze child behavior
    const analysis = this.analyzeChildActivity(lastMessages);

    // 3. Detect issues and intervene
    if (analysis.stalled) {
      await this.intervene('FORCE_CONTINUE',
        '[SHADOW: FORCE_CONTINUE] Workflow "' + this.workflowName +
        '" stalled. Resume immediately. Complete remaining tasks.');
    }

    if (analysis.falseClaim) {
      await this.intervene('BLOCK_CLAIM',
        '[SHADOW: BLOCK_CLAIM] Claim not backed by evidence. ' +
        'Run verification tool. Evidence is not optional.');
    }

    if (analysis.looping) {
      await this.intervene('PATTERN_BREAK',
        '[SHADOW: PATTERN_BREAK] Repeating: ' + analysis.loopPattern +
        '. Try a DIFFERENT strategy. Read the file, find root cause.');
    }

    // 4. Publish progress to radio bus
    const progress = this.extractProgress(analysis);
    radioBus.publish('workflow:' + this.workflowName, progress);

    // 5. Check if child reached PASS
    if (analysis.godLoopPhase === 'PASS') {
      this.onWorkflowComplete();
    }
  }

  // Intervene in child session via SDK client
  private async intervene(level: string, message: string): Promise<void> {
    await this.client.session.prompt(this.childSessionId, {
      parts: [{ type: 'text', text: message }],
    });
    tridentLog('WARN', 'shadow-agent',
      `[${this.workflowName}] Intervention: ${level}`);
  }

  // Analyze child activity (ported from Shadow Agent v2 patterns)
  private analyzeChildActivity(messages: Message[]): ChildAnalysis {
    return {
      stalled: this.detectStall(messages),
      falseClaim: this.detectFalseClaim(messages),
      looping: this.detectLoop(messages),
      godLoopPhase: this.extractGodLoopPhase(messages),
      toolsCalled: this.extractToolCalls(messages),
      filesChanged: this.extractFileChanges(messages),
      scoreProgress: this.extractScoreProgress(messages),
    };
  }

  // Stall detection (from Shadow Agent v2 SCE)
  private detectStall(messages: Message[]): boolean {
    const last = messages[messages.length - 1];
    if (!last) return false;
    return Date.now() - last.timestamp > 120_000;
  }

  // False claim detection (from Shadow Agent v2 FDE)
  private detectFalseClaim(messages: Message[]): boolean {
    const lastResponse = messages
      .filter(m => m.role === 'assistant')
      .pop()?.content || '';
    const claims = [/tests?\s+pass/i, /all\s+pass/i, /verified/i, /works/i];
    const hasClaim = claims.some(p => p.test(lastResponse));
    if (!hasClaim) return false;
    const hasEvidence = messages.some(m =>
      m.content.includes('PASS') || m.content.includes('exit code 0'));
    return hasClaim && !hasEvidence;
  }

  // Loop detection (from Shadow Agent v2 TLE)
  private detectLoop(messages: Message[]): { looping: boolean; pattern: string } {
    const recentTools = messages
      .slice(-10)
      .filter(m => m.type === 'tool')
      .map(m => m.toolName);
    if (recentTools.length < 4) return { looping: false, pattern: '' };
    const counts: Record<string, number> = {};
    for (const t of recentTools) {
      counts[t] = (counts[t] || 0) + 1;
      if (counts[t] >= 3) return { looping: true, pattern: t };
    }
    return { looping: false, pattern: '' };
  }

  private onWorkflowComplete(): void {
    radioBus.publish('workflow:' + this.workflowName, {
      category: 'workflow_complete',
      severity: 'critical',
      message: 'Workflow ' + this.workflowName + ' reached PASS',
    });
    workflowRegistry.onWorkflowComplete(this.workflowName);
  }
}
```

## 3.4 RADIO BUS (FindingBus Port)

```typescript
class RadioBus {
  private channels: Map<string, Finding[]> = new Map();
  private consumers: Map<string, ((f: Finding) => void)[]> = new Map();
  private maxEntries: number = 5000;

  publish(channel: string, finding: Finding): void {
    // SHA-256 dedup
    const dedupKey = createHash('sha256')
      .update(channel + finding.category + finding.message)
      .digest('hex');

    const entries = this.channels.get(channel) || [];
    const existing = entries.find(e => e.dedupKey === dedupKey);
    if (existing) {
      existing.occurrenceCount++;
      existing.severity = this.promoteSeverity(existing.severity);
      return;
    }

    const entry = {
      ...finding,
      dedupKey,
      occurrenceCount: 1,
      resolved: false,
      timestamp: Date.now(),
    };
    entries.push(entry);
    this.channels.set(channel, entries);

    // Capacity management
    if (entries.length > this.maxEntries) {
      entries.shift(); // FIFO eviction
    }

    // Deliver to consumers
    const consumers = this.consumers.get(channel) || [];
    for (const consumer of consumers) {
      try { consumer(entry); } catch (e) { /* isolate */ }
    }
  }

  subscribe(channel: string, consumer: (f: Finding) => void): void {
    const arr = this.consumers.get(channel) || [];
    arr.push(consumer);
    this.consumers.set(channel, arr);
  }

  getChannel(name: string): Finding[] {
    return this.channels.get(name) || [];
  }

  private promoteSeverity(s: string): string {
    const order = ['info', 'low', 'medium', 'high', 'critical'];
    const idx = order.indexOf(s);
    return idx < order.length - 1 ? order[idx + 1] : s;
  }
}
```

## 3.5 SHADOW POSEIDON — TOKEN FLOW FILTER

```typescript
class ShadowPoseidon {
  constructor(
    private radioBus: RadioBus,
    private shortTermMemory: ShortTermMemory,
  ) {
    // Subscribe to all workflow channels
    // Uses pattern matching to subscribe to workflow:* channels
  }

  // Only CRITICAL findings reach the parent
  private shouldEscalateToParent(finding: Finding): boolean {
    return finding.severity === 'critical' ||
           finding.category === 'workflow_complete' ||
           finding.category === 'workflow_stalled' ||
           finding.category === 'cross_workflow_conflict';
  }

  // Generate filtered status for parent's system prompt
  generateParentStatus(): string {
    // Summarize all active workflows — condensed, token-efficient
    const active = this.getActiveWorkflows();
    let status = '[WORKFLOW STATUS]\n';
    for (const wf of active) {
      status += '- ' + wf.name + ': ' + wf.phase + ' (' + wf.score + '/100, ' +
        wf.findingsRemaining + ' findings)\n';
    }
    return status;
  }

  // Route command from parent to specific child
  async routeCommand(workflowName: string, command: string): Promise<void> {
    const wf = workflowRegistry.get(workflowName);
    if (wf?.shadow) {
      await wf.shadow.intervene('PARENT_COMMAND', command);
    }
  }
}
```

## 3.6 SHORT-TERM MEMORY

```typescript
class ShortTermMemory {
  private store: Map<string, MemoryEntry> = new Map();
  private maxAge: number = 50;  // cycles
  private maxEntries: number = 500;

  store_entry(finding: Finding, workflow: string): void {
    const key = finding.dedupKey || finding.id;
    const existing = this.store.get(key);

    if (existing) {
      existing.occurrenceCount++;
      existing.lastSeen = Date.now();
    } else {
      this.store.set(key, {
        ...finding,
        workflow,
        firstSeen: Date.now(),
        lastSeen: Date.now(),
      });
    }

    if (this.store.size > this.maxEntries) this.prune();
  }

  query(filter: { workflow?: string; severity?: string; limit?: number }): MemoryEntry[] {
    let entries = Array.from(this.store.values());
    if (filter.workflow) entries = entries.filter(e => e.workflow === filter.workflow);
    if (filter.severity) entries = entries.filter(e => e.severity === filter.severity);
    entries.sort((a, b) => b.lastSeen - a.lastSeen);
    return entries.slice(0, filter.limit || 50);
  }

  private prune(): void {
    // Remove oldest entries
    const sorted = Array.from(this.store.entries())
      .sort((a, b) => a[1].lastSeen - b[1].lastSeen);
    while (this.store.size > this.maxEntries * 0.8) {
      const oldest = sorted.shift();
      if (oldest) this.store.delete(oldest[0]);
    }
  }
}
```

## 3.7 DEPENDENCY GRAPH

```typescript
class DependencyGraph {
  private nodes: Map<string, string[]> = new Map();

  addWorkflow(name: string, dependsOn: string[] = []): void {
    this.nodes.set(name, dependsOn);
  }

  getReady(completed: Set<string>): string[] {
    const ready: string[] = [];
    for (const [name, deps] of this.nodes) {
      if (completed.has(name)) continue;
      if (deps.every(d => completed.has(d))) ready.push(name);
    }
    return ready;
  }

  getDependencies(name: string): string[] {
    return this.nodes.get(name) || [];
  }

  isComplete(completed: Set<string>): boolean {
    for (const name of this.nodes.keys()) {
      if (!completed.has(name)) return false;
    }
    return true;
  }
}
```

## 3.8 COMPLETE EXECUTION FLOW

### Step 1: /poseidon activation + classification

```
User: /poseidon Build Poseidon v4.4.4 for /path/to/project

→ Poseidon Mode activated (writes unlocked)
→ Decision Engine Layer 0: classify problem
  → 67 files, 94 findings, 3 separable modules
  → Classification: PARALLEL
→ Decision Engine Layer 1: chart strategic path
  → Frameworks: Consequence Cascade, Parallel Tracks, Convergence Detector
  → Critical path: 3 parallel + 1 integration = 4 phases
  → Anticipated risks: cross-module conflicts, integration failures
  → Preemptive safeguards: file-scoped agents, integration test gate

→ User sees classification output
→ GoalDriver starts in PARALLEL mode
```

### Step 2: Workflow creation

```
GoalDriver creates 4 workflows:
  god-loop-hydra:     target=/path/to/project/src/poseidon,    deps=[]
  god-loop-tools:     target=/path/to/project/src/tools,       deps=[]
  god-loop-pipeline:  target=/path/to/project/src/hooks,       deps=[]
  god-loop-integration: target=/path/to/project,               deps=[hydra,tools,pipeline]

→ 3 workflows start immediately (no dependencies)
→ 1 workflow blocked (integration waits for all 3)
→ Each workflow: forked session + shadow agent sidecar + own God Loop
```

### Step 3: Parallel execution

```
Each child session runs independently:
  - Own model stream (parallel LLM calls)
  - Own context window (no cross-contamination)
  - Own God Loop (independent phase machine)
  - /poseidon active on child (writes unlocked)

Shadow agents monitor each child:
  - Stall detection → FORCE_CONTINUE
  - False claim → BLOCK_CLAIM
  - Loop detection → PATTERN_BREAK
  - Progress → RadioBus → ShadowPoseidon → parent system prompt

Parent (GoalDriver):
  - Receives filtered status (critical only)
  - Makes macro decisions
  - Dispatches commands via ShadowPoseidon → shadow → child
```

### Step 4: Integration phase

```
All 3 parallel workflows reach PASS
→ Dependency graph triggers integration workflow
→ Forked session created for integration
→ /poseidon activated with L1 prompt for full project
→ Integration God Loop runs:
  AUDIT (cross-module issues) → PLAN → DISPATCH → VERIFY
  → CONTAINER_TEST (fully manual, 5+ adversarial angles)
  → If fails → diagnose → fix → retest
  → Eventually PASS
```

### Step 5: Goal verification

```
Integration workflow PASSED
→ GoalDriver runs adversarial verification:
  3 skeptic subagents with evidence packet
  Each must REFUTE completion
  Majority vote of cold panel
→ If Achieved → /poseidon auto-deactivates (writes locked)
→ Decision Engine Layer 4: extract learnings
→ Output returned to user
```

## 3.9 IMPLEMENTATION FILES (Part 3)

| File | Action | Est. Lines |
|------|--------|-----------|
| src/poseidon/workflow-registry.ts | NEW | 200 |
| src/poseidon/shadow-agent-sidecar.ts | NEW | 500 |
| src/poseidon/radio-bus.ts | NEW | 250 |
| src/poseidon/shadow-poseidon.ts | NEW | 300 |
| src/poseidon/short-term-memory.ts | NEW | 200 |
| src/poseidon/dependency-graph.ts | NEW | 100 |
| **Part 3 Total** | | **~1,550** |

---

# APPENDIX A: TASK CLASSIFICATION INTELLIGENCE

## Classification Algorithm

```typescript
function classifyTask(
  fileCount: number,
  findingCount: number,
  problemType: ProblemType,
  moduleBoundaries: ModuleBoundary[],
): ExecutionMode {
  // DIRECT: trivial, no God Loop
  if (fileCount <= 10 && findingCount <= 10) return 'DIRECT';

  // Check module separability for PARALLEL
  if (fileCount > 30 && findingCount > 50) {
    const separable = moduleBoundaries.filter(m => m.crossImports < 3);
    if (separable.length >= 2) return 'PARALLEL';
  }

  // Default: LINEAR (single God Loop)
  return 'LINEAR';
}
```

## Module Boundary Detection

```typescript
function detectModuleBoundaries(
  targetPath: string,
  files: string[],
): ModuleBoundary[] {
  // Group files by top-level subdirectory
  const groups: Map<string, string[]> = new Map();
  for (const file of files) {
    const rel = path.relative(targetPath, file);
    const topDir = rel.split(path.sep)[1] || 'root';
    const arr = groups.get(topDir) || [];
    arr.push(file);
    groups.set(topDir, arr);
  }

  // Count cross-directory imports
  const boundaries: ModuleBoundary[] = [];
  for (const [dir, dirFiles] of groups) {
    let crossImports = 0;
    for (const file of dirFiles) {
      const content = fs.readFileSync(file, 'utf-8');
      const imports = content.match(/from\s+['"]\.\..*['"]/g) || [];
      crossImports += imports.filter(imp =>
        !imp.includes(dir + '/')).length;
    }
    boundaries.push({
      directory: dir,
      fileCount: dirFiles.length,
      crossImports,
      separable: crossImports < 3,
    });
  }
  return boundaries;
}
```

---

# APPENDIX B: CONTAINER TEST ADVERSARIAL QUALITY GATES

## Gate Implementation (5 Mechanical + Semantic Filters)

```typescript
// ── Named Constants ──
export const CONTAINER_TEST_GATES = {
  /**
   * MIN_ADVERSARIAL_SCENARIOS = 5
   * BECAUSE: Testing post-ship behavior from fewer than 5 angles
   * provides insufficient coverage. Each angle tests a different
   * failure mode: input-validation, concurrency, state-corruption,
   * resource-exhaustion, boundary-conditions. Missing any leaves
   * a blind spot that production will exploit.
   */
  MIN_ADVERSARIAL_SCENARIOS: 5,

  /**
   * MIN_UNIQUE_ATTACK_VECTORS = 5
   * BECAUSE: 5 scenarios testing the same vector (e.g., all input
   * validation) provides false confidence. Each scenario must test
   * a genuinely different category of failure.
   */
  MIN_UNIQUE_ATTACK_VECTORS: 5,

  /**
   * REQUIRED_COVERAGE_AREAS
   * BECAUSE: The plugin has 5 critical subsystems. All must be tested.
   */
  REQUIRED_COVERAGE: ['identity', 'tools', 'firewall', 'audit', 'poseidon'],
};

// Attack vector categories (for diversity check)
const ATTACK_VECTORS = new Set([
  'input-validation',     // Malformed input, edge cases
  'concurrency',          // Race conditions, parallel access
  'state-corruption',     // Invalid state transitions
  'resource-exhaustion',  // Memory, CPU, file handles
  'boundary-conditions',  // Off-by-one, empty, max-size
  'permission-bypass',    // Firewall circumvention
  'error-propagation',    // Unhandled errors cascading
  'integration-failure',  // Module interaction breaks
  'configuration-drift',  // Env/config mismatch
  'timing-race',          // Order-dependent failures
]);
```

---

# APPENDIX C: EXECUTION MODE DECISION MATRIX

| Criteria | DIRECT | LINEAR | PARALLEL |
|----------|--------|--------|----------|
| Files | <10 | 10-30 | >30 |
| Findings | <10 | 10-50 | >50 |
| God Loop | No | Yes (1) | Yes (N + integration) |
| Shadow Agents | No | No | Yes (per workflow) |
| Forked Sessions | No | No | Yes (per workflow) |
| Decision Engine | Layer 0 only | All layers | All layers |
| Token Cost | Low | Medium | High (N× streams) |
| Speed | Fastest | Medium | Fastest for large |

---

# APPENDIX D: SHADOW AGENT INTERVENTION TEMPLATES

```typescript
const INTERVENTION_TEMPLATES = {
  FORCE_CONTINUE: (wf: string, stallMs: number) =>
    '[SHADOW: FORCE_CONTINUE]\n' + wf + ' idle ' + Math.round(stallMs/1000) +
    's. Resume NOW. Complete ALL remaining tasks. Do NOT wait for input.',

  BLOCK_CLAIM: (wf: string, claim: string) =>
    '[SHADOW: BLOCK_CLAIM]\n' + wf + ' claimed: "' + claim.substring(0,100) +
    '"\nNOT backed by evidence. Run verification. Evidence is not optional.',

  PATTERN_BREAK: (wf: string, pattern: string) =>
    '[SHADOW: PATTERN_BREAK]\n' + wf + ' repeating: ' + pattern +
    '. Try a DIFFERENT strategy. Read the file. Find root cause.',

  PARENT_COMMAND: (wf: string, cmd: string) =>
    '[SHADOW: PARENT_COMMAND]\n' + wf + ' directive from parent: ' + cmd,
};
```

---

# APPENDIX E: EVENT FLOW REFERENCE

```
/poseidon <goal>
  ↓ command.execute.before
  ↓ poseidonState.activate()
  ↓ Decision Engine Layer 0 (classify)
  ↓ Decision Engine Layer 1 (chart path)
  ↓ GoalDriver.startGoal()
  ↓ God Loop INIT (mechanical)
  ↓ ... AUTIT, SCORE (mechanical) ...
  ↓ DECIDE (model: action=decide)
  ↓ Decision Engine Layer 2 (provide context)
  ↓ Model evaluates, calls action=decide
  ↓ PLAN (model: action=plan)
  ↓ Decision Engine + preflight validation
  ↓ Model calls action=plan with strategies
  ↓ DISPATCH (model: task() calls)
  ↓ Agents run, return
  ↓ tool.execute.after routes outputs
  ↓ COLLECT (mechanical)
  ↓ VERIFY (model: action=verify)
  ↓ Decision Engine Layer 2 (sniff test)
  ↓ Model calls action=verify
  ↓ AUDIT_RECHECK, SCORE (mechanical)
  ↓ If score >= 96 → CONTAINER_TEST (FULLY MANUAL)
  ↓ Agent designs 5+ adversarial tests
  ↓ Quality gates enforce
  ↓ If pass → PASS
  ↓ event hook: step-finish/idle
  ↓ GoalDriver.onTurnComplete()
  ↓ evaluateGoalRound() → CandidateComplete
  ↓ runAdversarialVerification() (3 skeptics)
  ↓ If Achieved → completeGoal()
  ↓ poseidonState.deactivate() (writes locked)
  ↓ Decision Engine Layer 4 (extract learnings)
  ↓ Output to user
```

---

# APPENDIX F: DECISION-MAKING TOOL INTEGRATION MAP

| God Loop Phase | DM Engine Layer | Frameworks Active | Output |
|---------------|-----------------|-------------------|--------|
| (activation) | Layer 0 | Cognitive Model Selection | Problem classification |
| (activation) | Layer 1 | All strategic frameworks | Strategic path |
| DECIDE | Layer 2 | Consequence Cascade, Reversibility, Inflection, Depth | Decision context |
| PLAN | Layer 2 | Critical Path, Blast Radius, Elimination, Mental Simulation | Fix strategy context |
| VERIFY | Layer 2 | Sniff Test, Construction vs Evidence, Depth Calibration | Trust assessment context |
| CONTAINER_TEST | Layer 2 | Premortem, Mental Simulation, Consequence Cascade | Test design guidance |
| PROBLEM_SOLVE | Layer 2 | Depth Calibration, Derivation, Enhancement, Inflection | Deep analysis context |
| (every round) | Layer 3 | All 10 trap detectors | Meta-cognitive enhancements |
| (completion) | Layer 4 | All frameworks scored | Completion intelligence |

---

# APPENDIX G: ACCEPTANCE CRITERIA (COMPLETE)

## Part 1: Phase Intelligence
- [ ] DECIDE phase rejects action=start, requires action=decide
- [ ] PLAN phase rejects action=start, requires action=plan
- [ ] VERIFY phase rejects action=start, requires action=verify
- [ ] CONTAINER_TEST rejects action=start on failure, requires action=diagnose
- [ ] PROBLEM_SOLVE rejects action=start, requires action=solve
- [ ] DECIDE context includes consequence cascade to 2nd order
- [ ] PLAN context includes blast radius per file
- [ ] VERIFY context includes construction-vs-evidence check
- [ ] Container test gate rejects plans with <5 scenarios
- [ ] Container test gate rejects scenarios without mechanical evidence
- [ ] Container test gate rejects non-adversarial scenarios
- [ ] Mechanical phases still advance without model action

## Part 2: /poseidon Command
- [ ] /poseidon without arguments returns error requiring goal
- [ ] /poseidon <goal> activates, unlocks writes, starts goal driver
- [ ] /poseidon status shows goal + workflow status
- [ ] /poseidon stop deactivates, locks writes
- [ ] Goal auto-deactivates on completion (PASS + verification)
- [ ] DIRECT mode: no God Loop, writes enabled, agent works directly
- [ ] LINEAR mode: single God Loop in session
- [ ] PARALLEL mode: forked sessions with workflows
- [ ] PoseidonDetector NLP removed
- [ ] classifyActivationIntent removed
- [ ] Intent gate removed
- [ ] GoalDriver injects continuation via client.session.prompt
- [ ] Adversarial verification spawns 3 skeptics with evidence packets
- [ ] System prompt includes goal status every round

## Part 3: Forked Sessions
- [ ] WorkflowRegistry creates forked sessions via client.session.create
- [ ] Each child session has /poseidon activated with L1 prompt
- [ ] ShadowAgentSidecar monitors child via event hook
- [ ] ShadowAgentSidecar intervenes via client.session.prompt
- [ ] Stall detection works (120s threshold)
- [ ] False claim detection works (regex + evidence check)
- [ ] Loop detection works (3x same tool)
- [ ] RadioBus publishes with SHA-256 dedup
- [ ] RadioBus promotes severity on duplicates
- [ ] ShadowPoseidon escalates only critical findings
- [ ] ShortTermMemory stores and prunes correctly
- [ ] DependencyGraph blocks integration until deps complete
- [ ] Integration workflow starts automatically after deps pass

---

# APPENDIX H: BIBLE COMPLIANCE MATRIX

| Iron Law | Enforcement |
|----------|------------|
| §14 Read-Before-Write | Layer 1 requires reading target before charting path |
| §2.3 Naming Illusion | DM Engine Layer 3 detects wrong mental model usage |
| §7.6 Branding Illusion | Sniff Test catches rationalization |
| Law 4 (regex as L0) | Container test gates use regex as tip-of-spear, semantic analysis decides |
| Law 7 (exclusive ownership) | Each framework owns its domain |
| Law 8 (no duplicate checks) | Framework composition caps at 5, prevents overlap |
| Evidence Grounding | All verification requires mechanical evidence |
| Transparent Blind Spots | Layer 0 lists unknownUnknowns explicitly |
| Mechanical Verification | Container test gates reject theatrical evidence |
| No Theatrical Code | Sniff Test framework enforces honest assessment |

---

# APPENDIX I: FILE MANIFEST (COMPLETE)

## Part 1 Files
| File | Action | Lines |
|------|--------|-------|
| src/poseidon/god-loop.ts | MODIFY | +400 |
| src/poseidon/phase-intelligence.ts | NEW | 350 |
| src/tools/trident-poseidon.ts | MODIFY | +200 |
| src/tools/decision-engine/types.ts | NEW | 350 |
| src/tools/decision-engine/frameworks.ts | NEW | 400 |
| src/tools/decision-engine/index.ts | NEW | 500 |
| src/tools/decision-engine/constants.ts | NEW | 80 |

## Part 2 Files
| File | Action | Lines |
|------|--------|-------|
| src/poseidon/goal-driver.ts | NEW | 400 |
| src/poseidon/goal-verifier.ts | NEW | 300 |
| src/hooks/trident-hooks.ts | MODIFY | +100/-80 |
| src/hooks/agent-state.ts | MODIFY | +50/-30 |
| src/poseidon/poseidon-state.ts | MODIFY | +80 |
| opencode.json | MODIFY | +5 |

## Part 3 Files
| File | Action | Lines |
|------|--------|-------|
| src/poseidon/workflow-registry.ts | NEW | 200 |
| src/poseidon/shadow-agent-sidecar.ts | NEW | 500 |
| src/poseidon/radio-bus.ts | NEW | 250 |
| src/poseidon/shadow-poseidon.ts | NEW | 300 |
| src/poseidon/short-term-memory.ts | NEW | 200 |
| src/poseidon/dependency-graph.ts | NEW | 100 |

## Total
| Category | Lines |
|----------|-------|
| New code | ~3,610 |
| Modified code | ~820 |
| **Grand Total** | **~4,430** |

---

# APPENDIX J: PERFORMANCE BUDGETS

| Metric | Target |
|--------|--------|
| GoalDriver round evaluation | < 100ms |
| Decision Engine Layer 0 | < 500ms |
| Decision Engine Layer 1 | < 2s |
| Decision Engine Layer 2 | < 100ms |
| Decision Engine Layer 3 | < 50ms |
| Shadow agent intervention latency | < 5s (from detection to injection) |
| RadioBus publish latency | < 1ms |
| ShadowPoseidon filter latency | < 10ms |
| System prompt injection size | < 2000 tokens |
| Framework prompt size | < 500 tokens each |
| Memory footprint (per workflow) | < 10MB |
| Parallel workflow overhead | < 5% per additional workflow |

---

*Specification complete. Implementation-ready. All types defined, all classes designed, all constants named with rationale, all acceptance criteria testable, all file paths specified.*

*Dependencies: TRIDENT_DECISION_MAKING_TOOL_SPEC.md (provides 20 frameworks)*

*Build order: Part 1 → Part 2 → Part 3 (sequential)*

*This specification incorporates all user feedback including: no fallbacks, /poseidon requires goal, container test fully manual with adversarial gates, 3 execution classes, decision-making tool integration, forked sessions with shadow agent sidecar bridge.*
