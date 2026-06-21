import {
  LayerRule,
  CodeConstruct,
  AnalysisContext,
  AuditFinding,
  ConstructType,
} from './types.ts';
import { EvidenceGate } from './evidence-gate.ts';

export class LayerEngine {
  private layers: LayerRule[] = [];

  registerLayer(layer: LayerRule): void {
    this.layers.push(layer);
  }

  registerLayers(layers: LayerRule[]): void {
    for (const layer of layers) {
      this.layers.push(layer);
    }
  }

  evaluateAll(ctx: AnalysisContext, evidence: EvidenceGate): AuditFinding[] {
    const allFindings: AuditFinding[] = [];

    for (const layer of this.layers) {
      if (!layer.enabled) continue;

      const layerFindings = this.evaluateLayer(layer, ctx, evidence);
      allFindings.push(...layerFindings);
    }

    return deduplicateFindings(allFindings);
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
