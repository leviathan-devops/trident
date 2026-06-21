# NEXT STEPS — Poseidon Mode Semantic Firewall

## 2-Layer Architecture

### Layer 1: Poseidon Orchestrator Enforcement

**Location:** `src/poseidon/god-loop.ts` + `src/poseidon/cycle-tracker.ts` (NEW)
**Purpose:** Stop the "trust me" garbage. Force the God Loop to produce measurable progress every cycle, with exact instructions that leave no room for theatrical compliance.

### Problem With Current God Loop

```
CYCLE 1: audit → score=12 → generatePlan → dispatchToBuildAgent → "BUILD COMPLETE: all fixed" → CYCLE 2
CYCLE 2: audit → score=12 → same findings as cycle 1 → generatePlan → dispatchToBuildAgent → "BUILD COMPLETE: all fixed"
...repeats 50 times...
EXIT: max_cycles. Score never changed. No one knows why. Useless.
```

The loop doesn't know if fixes were actually applied. It trusts the placeholder return.

### Fix: CycleTracker + Finding Lifecycle Management

**NEW FILE:** `src/poseidon/cycle-tracker.ts`

```typescript
interface FindingState {
  id: string;             // hash of file+line+issue
  file: string;
  line: number;
  issue: string;
  severity: string;
  firstSeenAt: number;     // which cycle
  lastSeenAt: number;      // which cycle
  status: 'new' | 'persistent' | 'regression' | 'fixed';
  fixAttempted: boolean;   // was it in the remediation plan?
  fixVerified: boolean;    // did the next audit confirm it's gone?
  assignedPlan: string;    // exact instruction sent to Trident_Build
}

class CycleTracker {
  private findings: Map<string, FindingState>;
  private cycles: Array<{ cycle: number; score: number; findingIds: string[]; plan: string }>;

  // After audit: classify each finding as new/persistent/regression
  classifyFindings(currentFindings, previousFindingIds): FindingState[];

  // After generating plan: mark which findings had fix instructions
  markFindingsAsPlanned(findings, plan): void;

  // After build/dispatch: check if the agent actually fixed them
  // By comparing which files changed against which findings had fix instructions
  verifyFixes(changedFiles, plannedFindingIds): { fixed, ignored, incomplete };

  // Detect stagnation: if N most recent cycles show same score → abort
  detectStagnation(): { stuck: boolean; cyclesWithoutImprovement: number };

  // Score trajectory: for the build report, show score across cycles
  getTrajectory(): Array<{ cycle: number; score: number }>;
}
```

### New God Loop Flow

```
CYCLE N:
  PHASE A: AUDIT
    → audit target
    → extract score + findings
    → classifyFindings(current, previous) → marks as new/persistent/regression
    → detectStagnation() → if score hasn't improved in 5 cycles → abort with "STALLED_NO_PROGRESS"
    → if score >= 96 → skip to PHASE D

  PHASE A.5: PLAN GENERATION
    → FOR each finding:
      → Read the offending source file
      → Parse the exact line and surrounding context
      → Generate FIX with: FILE, LINE, CURRENT_CODE_SNIPPET, EXPECTED_FIX, EXPLANATION
    → markFindingsAsPlanned(findings, plan)
    → Write PLAN.md with: FILE, LINE, CURRENT (showing the bad code), FIX (showing what to change it to)

  PHASE B: EXECUTE (Trident_Build)
    → dispatchToBuildAgent(plan, targetPath)
    → RECEIVE BUILD RESULT with changedFiles[] and SHA256[]
    → verifyFixes(changedFiles, plannedFindingIds)

  PHASE C: RE-AUDIT
    → audit target again
    → FOR each planned finding:
      → If finding still present → mark as persistent, increment cycle count
      → If finding gone → mark as fixed, celebrate
      → If NEW finding appears → mark as regression, ADD to total workload
    → Compare trajectories: if 5 cycles no improvement → abort
    → LOG the full cycle result with changed files, new findings, persistent findings
```

### The "I Will Not Accept Lies" Gate

At `god-loop.ts`, after `dispatchToBuildAgent()` returns, add:

```typescript
// VERIFY: Did we actually make progress?
var scoreAfter = this.extractScore(await this.runAudit(targetPath));

// If score didn't improve AND no findings were fixed → loop is broken
if (scoreAfter <= score && findingsAfter.fixed.length === 0) {
  cycleTracker.incrementStallCounter();
  if (cycleTracker.getStallCounter() >= 3) {
    tiLog('POSEIDON', `CYCLE ${cycle}: 3 cycles with ZERO progress. Aborting.`);
    return { score, cycles, passed: false, reason: 'stalled_no_progress' };
  }
  // Don't trust the build result — re-audit clearly shows no progress
  tiLog('POSEIDON', `CYCLE ${cycle}: Build claimed success but score did not improve. Retrying with more detailed plan.`);
  // Regenerate plan with MORE detail — show exact line content, not just description
  plan = this.generateVerbosePlan(cycle, findings, targetPath, score);
}
```

### The Verbose Plan Format (for stalled cycles)

```markdown
## CYCLE {N} REMEDIATION PLAN (VERBOSE — STALL DETECTED)

## Current Score: {score}/100 (unchanged for {N} cycles)

### CRITICAL FINDINGS
1. FILE: src/foo.ts LINE: 42
   CURRENT:
   ```typescript
   function checkAccess() {
     return { blocked: false }; // <-- THIS IS THEATRICAL
   }
   ```
   FIX: Replace with:
   ```typescript
   function checkAccess(user: User): boolean {
     return user.permissions.includes('access');
   }
   ```
   EXPLANATION: The current code returns a hardcoded value. It must check actual permissions.

### PREVIOUS CYCLE ANALYSIS
- Cycle {N-1} asked you to fix: src/foo.ts:42, src/bar.ts:15, src/baz.ts:88
- Cycle {N-1} you claimed: "BUILD COMPLETE: All findings fixed"
- Cycle {N} audit shows: src/foo.ts:42 NOT FIXED, src/bar.ts:15 FIXED, src/baz.ts:88 NEWLY BROKEN
- You LIED about fixing src/foo.ts:42.

### INSTRUCTIONS
- Fix the findings listed above. Not a subset. Not "almost all." EACH ONE.
- Do NOT add features. Do NOT touch files not in this list.
- DO THE ABOVE AND NOTHING ELSE.
```

### Files Changed

| File | Change |
|------|--------|
| **NEW** `src/poseidon/cycle-tracker.ts` | CycleTracker class (~200 lines) |
| **EDIT** `src/poseidon/god-loop.ts` | Wire CycleTracker into runLoop() — replace stub dispatch with verified progress checks |
| **EDIT** `src/poseidon/god-loop.ts` | Add `generateVerbosePlan()` method — shows exact line content for stalled cycles |

---

### Layer 2: Trident_Build Agent Firewall

**Location:** `src/subagents/trident-build/firewall/` (NEW directory, ~400 lines, 5 files)
**Purpose:** Code-enforced enforcement that Trident_Build ONLY touches what the plan says, produces evidence for every change, and cannot deviate from scope.

### File Structure

```
src/subagents/trident-build/firewall/
├── plan-scope.ts         — Plan scope validation
├── snapshot-diff.ts      — Before/after directory snapshot
├── ast-rules.ts          — Real AST analysis (ts.createProgram)
├── evidence-enforcer.ts  — SHA256 + artifact enforcement
├── index.ts              — Composed into guardian-hook
```

### File 1: `plan-scope.ts`

Reads the remediation plan and extracts the set of allowed {file, line} targets.

```typescript
interface PlanFinding {
  file: string;
  line: number;
  issue: string;
  fix: string;
}

interface PlanScope {
  findings: PlanFinding[];
  allowedFiles: Set<string>;
  allowedLines: Map<string, Set<number>>;
  createdAt: number;
}

class PlanScopeValidator {
  loadPlan(planText: string): PlanScope;
  isFileAllowed(filePath: string): boolean;
  isLineAllowed(filePath: string, line: number): boolean;
  validateEdit(filePath: string, editLine?: number): { allowed: boolean; reason?: string };
  verifyCompleteness(changedFiles: string[]): { complete: boolean; missing: PlanFinding[] };
}
```

### File 2: `snapshot-diff.ts`

Snapshots the project directory before and after execution. Detects files changed/created outside plan scope.

```typescript
interface Snapshot {
  timestamp: number;
  files: Map<string, string>;  // path → SHA256
}

class SnapshotDiff {
  private before: Snapshot | null;
  takeSnapshot(rootDir: string, exclude?: string[]): Snapshot;
  diff(): Array<{ file: string; beforeHash: string; afterHash: string; status: 'changed' | 'created' | 'deleted' }>;
  checkScopeViolation(planScope: PlanScope): Array<{ file: string; reason: string }>;
}
```

### File 3: `ast-rules.ts`

Real AST analysis using TypeScript Compiler API. Replaces the current regex-based SemanticEngine.

```typescript
class ASTFirewall {
  private program: ts.Program;
  private checker: ts.TypeChecker;

  initialize(projectRoot: string): void;  // ts.createProgram()
  analyze(filePath: string, content: string): ASTFinding[];

  // Rule 1: Theatrical return detection — Order 5 analysis
  checkTheatricalReturn(node: ts.ReturnStatement): ASTFinding | null;

  // Rule 2: Empty catch detection — Order 2 analysis
  checkEmptyCatch(node: ts.CatchClause): ASTFinding | null;

  // Rule 3: Evidence-bearing results — Order 5 analysis
  checkEvidenceBearing(funcNode: ts.FunctionDeclaration): ASTFinding | null;

  // Rule 4: Floating promises — Order 4 (CFG) analysis
  checkFloatingPromises(node: ts.CallExpression): ASTFinding | null;

  // Rule 5: Hardcoded paths — Order 2 analysis
  checkHardcodedPaths(node: ts.StringLiteral): ASTFinding | null;
}
```

### File 4: `evidence-enforcer.ts`

Ensures every changed file has a SHA256 hash reported back to the God Loop.

```typescript
class EvidenceEnforcer {
  private changedFiles: Map<string, { claimedHash: string; actualHash: string; verified: boolean }>;

  captureBefore(filePath: string): void;
  captureAfter(filePath: string): string;
  verifyClaim(filePath: string, claimedHash: string): boolean;
  getReport(): Array<{ file: string; hash: string; verified: boolean }>;
  enforceIntegrity(): void;
}
```

### File 5: `index.ts` — Composition

```typescript
export class BuildFirewall {
  private planScope: PlanScopeValidator;
  private snapshot: SnapshotDiff;
  private ast: ASTFirewall;
  private evidence: EvidenceEnforcer;

  constructor(projectRoot: string) { ... }

  async initialize(planText: string): Promise<void> {
    this.planScope.loadPlan(planText);
    this.ast.initialize(projectRoot);
    this.beforeSnapshot = this.snapshot.takeSnapshot(projectRoot);
  }

  async onBeforeWrite(toolName: string, filePath: string, content: string): Promise<void> {
    // 1. Plan scope check — is this file allowed?
    if (!this.planScope.isFileAllowed(filePath)) {
      throw new EnforcementError(
        `[SF-SCOPE] File ${filePath} is NOT in the remediation plan.`,
        'PLAN_DEVIATION', 'critical'
      );
    }
    // 2. AST analysis — real TypeScript Compiler API
    var astFindings = this.ast.analyze(filePath, content);
    var critical = astFindings.filter(f => f.severity === 'critical');
    if (critical.length > 0) {
      throw new EnforcementError(`[SF-AST] ${critical[0].message}`, critical[0].id, 'critical');
    }
    // 3. Evidence capture — hash before change
    this.evidence.captureBefore(filePath);
  }

  async onAfterWrite(toolName: string, filePath: string): Promise<void> {
    this.evidence.captureAfter(filePath);
  }

  async onBuildComplete(): Promise<BuildReport> {
    var afterSnapshot = this.snapshot.takeSnapshot(projectRoot);
    var diff = this.snapshot.diff();
    var scopeViolations = this.snapshot.checkScopeViolation(this.planScope);
    var completeness = this.planScope.verifyCompleteness(diff.changed);
    return { changedFiles: diff, scopeViolations, completeness, evidence: this.evidence.getReport() };
  }
}
```

### Wiring: Guardian Hook Integration

In `src/subagents/trident-build/hooks/guardian-hook.ts`, add the firewall as a step BEFORE TheatricalBlock:

```typescript
    // LAYER 1: Plan scope — is this file even allowed?
    await buildFirewall.onBeforeWrite(toolName, filePath, content);

    // LAYER 2: TheatricalBlock — 20+ pattern scan
    var matches = theatricalBlock.scan(content);

    // LAYER 3: AST analysis — real TypeScript Compiler API
    var astFindings = buildFirewall.ast.analyze(filePath, content);

    // LAYER 4: P1-P10 — already exists
    var violations = runtimeGrade.check(/*...*/);
```

### Summary

### Layer 1: Poseidon Orchestrator Enforcement (3 files)

| File | Lines | Purpose |
|------|-------|---------|
| `src/poseidon/cycle-tracker.ts` | ~200 | Track finding lifecycle across cycles, detect stagnation, classify new/persistent/regression |
| `src/poseidon/god-loop.ts` (edit) | +80 | Wire CycleTracker, add "I will not accept lies" gate, add verbose plan generation for stalled cycles |
| `src/poseidon/god-loop.ts` (edit) | +60 | `generateVerbosePlan()` — shows exact line content for stubborn unfixed issues |

### Layer 2: Trident_Build Agent Firewall (5 files)

| File | Lines | Purpose |
|------|-------|---------|
| `src/subagents/trident-build/firewall/plan-scope.ts` | ~100 | Load plan, validate file:line scope, verify completeness |
| `src/subagents/trident-build/firewall/snapshot-diff.ts` | ~80 | Before/after snapshots with SHA256, scope violation detection |
| `src/subagents/trident-build/firewall/ast-rules.ts` | ~150 | Real ts.createProgram() AST analysis — replaces regex SemanticEngine |
| `src/subagents/trident-build/firewall/evidence-enforcer.ts` | ~60 | Per-file SHA256 capture + verification |
| `src/subagents/trident-build/firewall/index.ts` | ~70 | Compose into BuildFirewall class, wire into guardian-hook |

**Total new code: ~700 lines across 8 files.**
