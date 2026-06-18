import { PreflightResult, AuditFinding } from './types.ts';
import * as ts from 'typescript';

export class EvidenceGate {
  private preflight: PreflightResult;
  private diagnostics: ts.Diagnostic[];
  private findings: AuditFinding[];

  constructor(preflight: PreflightResult, diagnostics: ts.Diagnostic[], findings?: AuditFinding[]) {
    this.preflight = preflight;
    this.diagnostics = diagnostics;
    this.findings = findings || [];
  }

  getPreflight(): PreflightResult {
    return this.preflight;
  }

  getDiagnostics(): ts.Diagnostic[] {
    return this.diagnostics;
  }

  suppress(layer: string): boolean {
    switch (layer) {
      case 'R0':
        return this.preflight.buildPassed && this.preflight.typeCheckPassed;
      case 'R5':
        return this.preflight.distExists && this.preflight.distIsSingleFile;
      case 'R6':
        return this.preflight.buildPassed;
      case 'R13':
        return this.findings.some((f: AuditFinding) =>
          f.layer === layer && f.evidence.includes(': ') && /[A-Z][a-zA-Z]+:\s/.test(f.evidence)
        );
      case 'R14':
        return this.findings.some((f: AuditFinding) =>
          f.layer === layer && (f.file.includes('.test.') || f.file.includes('.spec.') || f.file.includes('__tests__'))
        );
      case 'R15':
        return this.findings.some((f: AuditFinding) =>
          f.layer === layer && /process\.env\.\w+\s*\|\|/.test(f.evidence)
        );
      case 'R16':
        return this.preflight.buildPassed && this.preflight.typeCheckPassed;
      default:
        return false;
    }
  }

  support(layer: string): boolean {
    switch (layer) {
      case 'R0':
        return !this.preflight.buildPassed || !this.preflight.typeCheckPassed;
      case 'R5':
        return !this.preflight.distExists || !this.preflight.distIsSingleFile;
      case 'R6':
        return this.diagnostics.some((d: ts.Diagnostic) => d.category === ts.DiagnosticCategory.Error);
      case 'R13':
        return this.findings.some((f: AuditFinding) =>
          f.layer === layer && !f.evidence.includes(': ')
        );
      case 'R14':
        return this.findings.some((f: AuditFinding) =>
          f.layer === layer && !f.file.includes('.test.') && !f.file.includes('.spec.') && !f.file.includes('__tests__')
        );
      case 'R15':
        return this.findings.some((f: AuditFinding) =>
          f.layer === layer && !/process\.env\.\w+\s*\|\|/.test(f.evidence)
        );
      case 'R16':
        return !this.preflight.buildPassed || !this.preflight.typeCheckPassed;
      default:
        return false;
    }
  }

  applyEvidenceFactor(finding: AuditFinding): AuditFinding {
    const suppressed = this.suppress(finding.layer);
    const supported = this.support(finding.layer);

    let confidence = finding.confidence;
    if (suppressed && !supported) {
      confidence = finding.confidence * 0.1;
    } else if (supported && !suppressed) {
      confidence = Math.min(1.0, finding.confidence * 1.5);
    } else if (suppressed && supported) {
      if (finding.severity === 'CRITICAL') {
        confidence = finding.confidence * 0.1;
      } else {
        confidence = Math.min(1.0, finding.confidence * 1.5);
      }
    }

    return {
      ...finding,
      confidence,
      evidenceSuppressed: suppressed,
    };
  }
}
