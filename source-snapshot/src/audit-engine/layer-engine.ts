import {
  LayerRule,
  CodeConstruct,
  AnalysisContext,
  AuditFinding,
  ConstructType,
  PreflightResult,
} from './types.ts';
import * as ts from 'typescript';
import { EvidenceGate } from './evidence-gate.ts';

// ── CRITICAL VIOLATION ERROR ──
// Makes the LayerEngine an ACTIVE INTERCEPTOR, not a passive collector.
class LayerViolationError extends Error {
  constructor(
    public readonly layerName: string,
    public readonly category: string,
    public readonly description: string,
    message?: string,
  ) {
    super(message || `[${layerName}] ${category}: ${description}`);
    this.name = 'LayerViolationError';
  }
}

export class LayerEngine {
  private layers: LayerRule[] = [];

  registerLayer(layer: LayerRule): void {
    this.layers.push(layer);
  }

  registerLayers(layers: LayerRule[]): void {
    for (const layer of layers) {
      this.registerLayer(layer);
    }
  }

  evaluateAll(ctx: AnalysisContext, evidence: EvidenceGate): AuditFinding[] {
    const allFindings: AuditFinding[] = [];
    const errors: string[] = [];

    for (const layer of this.layers) {
      if (!layer.enabled) continue;
      const layerFindings = this.safeEvaluate(layer, ctx, evidence, errors);
      allFindings.push(...layerFindings);
    }

    for (const err of errors) {
      console.error(`[LayerEngine] ${err}`);
    }

    return deduplicateFindings(allFindings);
  }

  private safeEvaluate(
    layer: LayerRule,
    ctx: AnalysisContext,
    evidence: EvidenceGate,
    errors: string[],
  ): AuditFinding[] {
    try {
      return this.evaluateLayer(layer, ctx, evidence);
    } catch (e: unknown) {
      errors.push(`Layer ${layer.layer} failed: ${e}`);
      return [];
    }
  }

  evaluateInput(
    layerName: string,
    input: string,
  ): AuditFinding[] {
    const layer = this.layers.find((l: LayerRule) => l.layer === layerName);
    if (!layer || !layer.enabled) return [];

    const mockPreflight: PreflightResult = {
      typeCheckPassed: false, typeCheckError: null, buildPassed: false, buildError: null,
      distExists: false, distIsSingleFile: false, distSize: 0, hasRelativeImports: false,
      sourceMapExists: false, findings: [],
    };

    const construct: CodeConstruct = {
      type: ConstructType.STRING_LITERAL,
      name: input.substring(0, 80),
      body: input,
      filePath: '(runtime)',
      line: 0,
      endLine: 0,
      node: null as unknown as import('typescript').Node,
      returnType: null,
      children: [],
      parent: null,
      modifiers: [],
      isAsync: false,
      isDefinition: false,
      isCallSite: false,
      parameters: [],
    };

    const ctx: AnalysisContext = {
      constructs: [construct],
      projectRoot: process.cwd(),
      symbolTable: { symbols: new Map() },
      sourceFiles: new Map(),
      callGraph: { entries: new Map(), totalCallSites: 0, resolvedCallSites: 0, coveragePercent: 0 },
      preflight: mockPreflight,
      packageJson: null,
      tsconfig: null,
      opencodeJson: null,
      diagnostics: [],
      constructsByFile: new Map(),
      isSelfAudit: false,
    };

    try {
      const layerFindings = layer.evaluate(construct, ctx);
      const applied: AuditFinding[] = [];
      for (const f of layerFindings) {
        const finding = this.applyDefaults(f, layer, new EvidenceGate(mockPreflight, []), construct);
        applied.push(finding);
      }
      return applied;
    } catch (e: unknown) {
      if (e instanceof LayerViolationError) throw e;
      console.error(`[LayerEngine] evaluateInput error:`, e);
      return [];
    }
  }

  private evaluateLayer(
    layer: LayerRule,
    ctx: AnalysisContext,
    evidence: EvidenceGate,
  ): AuditFinding[] {
    const findings: AuditFinding[] = [];

    if (layer.applicableTo.length === 0) {
      const specialFindings = layer.evaluate(null, ctx);
      for (const f of specialFindings) {
        findings.push(this.applyDefaults(f, layer, evidence));
      }
      return findings;
    }

    const filtered = ctx.constructs.filter((c: CodeConstruct) => this.matchesGates(c, layer));

    for (const construct of filtered) {
      const constructFindings = layer.evaluate(construct, ctx);
      for (const f of constructFindings) {
        findings.push(this.applyDefaults(f, layer, evidence, construct));
      }
    }

    return findings;
  }

  private matchesGates(construct: CodeConstruct, layer: LayerRule): boolean {
    if (!layer.applicableTo.includes(construct.type)) return false;

    if (layer.excludeTypes && layer.excludeTypes.includes(construct.type)) return false;

    if (layer.requireAsync && !construct.isAsync) return false;

    if (layer.requireHasBody && (!construct.body || construct.body.length < 3)) return false;

    if (layer.requireDefinition && !construct.isDefinition) return false;

    if (layer.requireCallSite && !construct.isCallSite) return false;

    return true;
  }

  private applyDefaults(
    finding: AuditFinding,
    layer: LayerRule,
    evidence: EvidenceGate,
    construct?: CodeConstruct,
  ): AuditFinding {
    return {
      layer: layer.layer,
      severity: finding.severity,
      category: finding.category,
      file: finding.file,
      line: finding.line,
      evidence: finding.evidence,
      description: finding.description,
      correction: finding.correction,
      runtimeImpact: finding.runtimeImpact,
      confidence: finding.confidence || 0.70,
      constructType: construct?.type || finding.constructType || null,
      callGraphRef: finding.callGraphRef || null,
      evidenceSuppressed: evidence.suppress(layer.layer),
    };
  }

  getLayers(): LayerRule[] {
    return [...this.layers];
  }
}

function deduplicateFindings(findings: AuditFinding[]): AuditFinding[] {
  const seen = new Set<string>();
  return findings.filter((f: AuditFinding) => {
    const key = `${f.layer}:${f.file}:${f.line}:${f.category}:${f.description.substring(0, 60)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
