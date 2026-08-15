// BuildFirewall — Composed enforcement for Trident_Build
// Integrates plan-scope validation, snapshot diff, AST analysis, and evidence enforcement
// Called from guardian-hook.ts as LAYER 1 before TheatricalBlock

import { PlanScopeValidator, PlanScope } from './plan-scope.js';
import { SnapshotDiffClass, DiffEntry } from './snapshot-diff.js';
import { ASTFirewall, ASTFinding } from './ast-rules.js';
import { EvidenceEnforcer, EvidenceEntry } from './evidence-enforcer.js';
import { EnforcementError } from '../harness/enforcement-error.js';

export interface BuildReport {
  changedFiles: DiffEntry[];
  scopeViolations: Array<{ file: string; reason: string }>;
  completeness: { complete: boolean; missing: Array<{ file: string; line: number; issue: string; fix: string }> };
  evidence: EvidenceEntry[];
}

export class BuildFirewall {
  public planScope: PlanScopeValidator;
  public snapshot: SnapshotDiffClass;
  public ast: ASTFirewall;
  public evidence: EvidenceEnforcer;
  private initialized = false;

  constructor() {
    this.planScope = new PlanScopeValidator();
    this.snapshot = new SnapshotDiffClass();
    this.ast = new ASTFirewall();
    this.evidence = new EvidenceEnforcer();
  }

  async initialize(projectRoot: string, planText: string): Promise<void> {
    this.planScope.loadPlan(planText);
    try {
      this.ast.initialize(projectRoot);
    } catch (e) {
      // Non-fatal — AST analysis is best-effort
    }
    // Defer snapshot capture — only needed when plan scope is active
    // this.snapshot.captureBefore(projectRoot);
    this.initialized = true;
  }

  isInitialized(): boolean { return this.initialized; }

  async onBeforeWrite(toolName: string, filePath: string, content: string): Promise<void> {
    // Try to load plan from well-known path if not already loaded
    this.planScope.loadFromWellKnownPath();

    // Layer 1: Plan scope — is this file allowed?
    var scopeCheck = this.planScope.validateEdit(filePath);
    if (!scopeCheck.allowed) {
      throw new EnforcementError(
        '[SF-SCOPE] ' + scopeCheck.reason,
        'PLAN_DEVIATION',
        'critical'
      );
    }

    // Layer 2: AST analysis — real TypeScript Compiler API
    if (filePath.endsWith('.ts') || filePath.endsWith('.js')) {
      var astFindings = this.ast.analyze(filePath, content);
      var critical = astFindings.filter(function(f) { return f.severity === 'critical'; });
      if (critical.length > 0) {
        throw new EnforcementError(
          '[SF-AST] ' + critical[0].message + ' (line ' + critical[0].line + ')',
          critical[0].id,
          'critical'
        );
      }
    }

    // Layer 3: Evidence capture — hash before change
    this.evidence.captureBefore(filePath);
  }

  async onAfterWrite(toolName: string, filePath: string): Promise<void> {
    this.evidence.captureAfter(filePath);
  }

  async onBuildComplete(): Promise<BuildReport> {
    var afterSnapshot = this.snapshot.takeSnapshot(process.cwd());
    var diff = this.snapshot.diff();
    var scopeViolations = this.snapshot.checkScopeViolation(this.planScope.getScope());
    var completeness = this.planScope.verifyCompleteness(
      diff.filter(function(d) { return d.status === 'changed' || d.status === 'created'; }).map(function(d) { return d.file; })
    );
    var evidence = this.evidence.getReport();

    return { changedFiles: diff, scopeViolations, completeness, evidence };
  }
}
