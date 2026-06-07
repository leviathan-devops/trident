import {
  AuditFinding,
  AuditResult,
  Severity,
  SEVERITY_WEIGHT,
  ConfidenceDistribution,
  SuppressedFinding,
  AuditMeta,
} from './types.ts';
import { EvidenceGate } from './evidence-gate.ts';
import { FindingConfidence, computeFindingConfidence, ReproducibleFailure } from '../types.js';

function attachConfidenceDimensions(finding: AuditFinding, isSelfAudit: boolean): AuditFinding {
  const ast = Math.min(1.0, finding.confidence);
  const execution = isSelfAudit ? 0 : 0;
  const environment = 0;
  const dimensions = computeFindingConfidence({ ast, execution, environment });
  return {
    ...finding,
    confidenceDimensions: dimensions,
  };
}

function attachReproducible(finding: AuditFinding): AuditFinding {
  if (finding.severity !== 'CRITICAL' && finding.severity !== 'HIGH') return finding;
  const command = buildReproductionCommand(finding);
  if (!command) return finding;
  const reproducible: ReproducibleFailure = {
    finding: finding.description.substring(0, 200),
    command,
    expectedOutput: `No ${finding.category.toLowerCase()} issues in ${finding.file}:${finding.line}`,
    actualOutput: finding.evidence.substring(0, 200),
  };
  return { ...finding, reproducible };
}

function buildReproductionCommand(finding: AuditFinding): string {
  const f = finding.file;
  const line = finding.line;
  switch (finding.category) {
    case 'ERROR_HANDLING':
    case 'ERROR_COMPLETENESS':
      return `node -e "const m = require('./${f}'); try { /* trigger error path near line ${line} */ } catch(e) { console.log('caught:', e.message); }"`;
    case 'ASYNC_CORRECTNESS':
    case 'ASYNC_DISCIPLINE':
      return `node -e "import('./${f}').then(m => { console.log('loaded'); }).catch(e => { console.error('LOAD FAILED:', e.message); })"`;
    case 'DEFENSIVE_IMPORT':
      return `node -e "try { require('${finding.evidence.match(/'([^']+)'/)?.[1] || 'unknown'}'); } catch(e) { console.log('MISSING:', e.message); }"`;
    case 'PATH_RESOLUTION':
      return `node -e "const fs = require('fs'); console.log(fs.existsSync('${finding.evidence.replace(/['"]/g, '')}'));"`;
    case 'DATA_FLOW':
      return `node -e "const m = require('./${f}'); console.log(typeof m);"`;
    default:
      return `npx tsc --noEmit ${f} 2>&1 | grep -n "line ${line}"`;
  }
}

export function computeScore(
  findings: AuditFinding[],
  evidence: EvidenceGate,
  filesScanned: number,
  sourceFilesScanned: number,
  layers: { layer: string; name: string; findingCount: number; avgConfidence: number; evidenceSuppressed: boolean }[],
  callGraphCoverage: number,
  totalCallSites: number,
  resolvedCallSites: number,
  checkerAvailable: boolean,
  isSelfAudit: boolean,
): AuditResult {
  const suppressed: SuppressedFinding[] = [];

  // Guard: 0 source files = cannot audit
  if (sourceFilesScanned === 0) {
    const errorFinding: AuditFinding = {
      layer: 'R0',
      file: '(entire project)',
      line: 1,
      severity: 'CRITICAL',
      confidence: 1.0,
      description: 'No source files found in targetPath',
      category: 'EMPTY_TARGET',
      constructType: null,
      evidenceSuppressed: false,
      evidence: 'Target path contains 0 .ts source files',
      correction: 'Point trident-code-audit at a directory containing src/ with .ts files',
      runtimeImpact: 'Audit returns 0/100 with no findings — no analysis was performed',
      callGraphRef: null,
    };

    const blindSpots: string[] = [
      'ZERO source files found — target path may be a dist-only package, or source directory does not exist',
    ];

    const auditMeta: AuditMeta = {
      callGraphCoverage: 0,
      totalCallSites: 0,
      resolvedCallSites: 0,
      checkerAvailable: false,
      blindSpots,
      suppressedBelowFloor: 0,
      selfAudit: isSelfAudit,
    };

    return {
      score: 0,
      grade: 'NOT RUNTIME GRADE — No source files found',
      findings: [errorFinding],
      filesScanned: 0,
      sourceFilesScanned: 0,
      layers,
      report: '',
      preflight: evidence.getPreflight(),
      confidenceDistribution: { definite: 0, high: 0, moderate: 0, low: 0, noise: 0 },
      suppressedFindings: [],
      auditMeta,
    };
  }

  const processedFindings = findings
    .map(f => attachConfidenceDimensions(f, isSelfAudit))
    .map(f => attachReproducible(f))
    .filter(f => {
      // E16: Change floor from 0.50 to 0.30 for finer discrimination
      if (f.confidence < 0.30) {
        suppressed.push({
          layer: f.layer,
          severity: f.severity,
          category: f.category,
          file: f.file,
          line: f.line,
          description: f.description,
          confidence: f.confidence,
          suppressionReason: `Confidence ${f.confidence.toFixed(2)} below floor 0.30`,
        });
        return false;
      }
      return true;
    })
    .map(f => evidence.applyEvidenceFactor(f));

  // E16: Use logarithmic scale below 30 for finer discrimination
  // Adjacent severities must differ by >= 0.05
  let score = 100;
  for (const finding of processedFindings) {
    let weight = SEVERITY_WEIGHT[finding.severity];
    // E16: Apply logarithmic scaling for finer discrimination at lower scores
    if (score < 30 && weight > 0) {
      const logScale = Math.max(0.05, Math.log(weight + 1) / Math.log(20));
      weight = weight * logScale;
    }
    let deduction = weight * finding.confidence;
    if (finding.evidenceSuppressed) deduction *= 0.1;
    if (evidence.support(finding.layer)) deduction *= 1.5;
    score -= deduction;
  }
  score = Math.round(Math.max(0, Math.min(100, score)));

  const grade = score >= 95 ? 'RUNTIME GRADE'
    : score >= 80 ? 'NEAR RUNTIME GRADE'
    : score >= 60 ? 'NEEDS FIXES'
    : 'NOT RUNTIME GRADE';

  const dist = computeConfidenceDistribution(processedFindings);

  const blindSpots: string[] = [];
  if (callGraphCoverage < 50) {
    blindSpots.push(`Call graph coverage ${callGraphCoverage}% — ${totalCallSites - resolvedCallSites}/${totalCallSites} calls unresolved. Invocation integrity (R10) findings may be incomplete.`);
  }
  if (!checkerAvailable) {
    blindSpots.push('Type checker unavailable — async correctness (R3) and call graph resolution degraded. Findings rely on text-based analysis only.');
  }
  if (isSelfAudit) {
    blindSpots.push('Self-audit mode — Trident cannot find bugs in itself by definition. Only structural issues detected.');
  }

  const auditMeta: AuditMeta = {
    callGraphCoverage,
    totalCallSites,
    resolvedCallSites,
    checkerAvailable,
    blindSpots,
    suppressedBelowFloor: suppressed.length,
    selfAudit: isSelfAudit,
  };

  return {
    score,
    grade,
    findings: processedFindings,
    filesScanned,
    sourceFilesScanned,
    layers,
    report: '',
    preflight: evidence.getPreflight(),
    confidenceDistribution: dist,
    suppressedFindings: suppressed,
    auditMeta,
  };
}

function computeConfidenceDistribution(findings: AuditFinding[]): ConfidenceDistribution {
  let definite = 0;
  let high = 0;
  let moderate = 0;
  let low = 0;
  let noise = 0;

  for (const f of findings) {
    if (f.confidence >= 0.95) definite++;
    else if (f.confidence >= 0.85) high++;
    else if (f.confidence >= 0.70) moderate++;
    else if (f.confidence >= 0.50) low++;
    else noise++;
  }

  return { definite, high, moderate, low, noise };
}
