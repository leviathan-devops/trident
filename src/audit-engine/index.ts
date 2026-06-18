import * as fs from 'fs/promises';
import * as path from 'path';
import * as ts from 'typescript';
import { tridentLog } from '../utils.js';
import { AuditResult, AuditFinding, ConfidenceDistribution } from './types.ts';
import { LayerEngine } from './layer-engine.ts';
import { EvidenceGate } from './evidence-gate.ts';
import { computeScore } from './scoring.ts';
import { classifyProject } from './code-classifier.ts';
import { runPreflight, PreflightResult } from './preflight.ts';
import { enrichWithHiveKnowledge } from './hive-loader.ts';
import { prioritizeFixes, generateFixSummary } from './fix-prioritizer.ts';
import { generateContainerTestPlan } from './test-plan-generator.ts';
import { generateDeploymentManifest } from './deploy-manifest.ts';
import { shortFile, confidenceLabel } from '../utils.js';

import { R0_BUILD_CHAIN } from './layers/r0-build-chain.ts';
import { R1_HOOK_CONTRACT } from './layers/r1-hook-contract.ts';
import { R2_STATE_MACHINE } from './layers/r2-state-machine.ts';
import { R3_ASYNC_CORRECTNESS } from './layers/r3-async-correctness.ts';
import { R4_ERROR_HANDLING } from './layers/r4-error-handling.ts';
import { R5_CONTAINER_DEPLOY } from './layers/r5-container-deploy.ts';
import { R6_DEPENDENCY_INTEGRITY } from './layers/r6-dependency-integrity.ts';
import { R7_CONFIG_SCHEMA } from './layers/r7-config-schema.ts';
import { R8_SOURCE_HYGIENE } from './layers/r8-source-hygiene.ts';
import { R9_RUNTIME_CONTRACT } from './layers/r9-runtime-contract.ts';
import { R10_INVOCATION_INTEGRITY } from './layers/r10-invocation-integrity.ts';
import { R11_THEATRICAL_INTEGRITY } from './layers/r11-theatrical-integrity.ts';
import { R12_CROSS_PLUGIN_ISOLATION } from './layers/r12-cross-plugin-isolation.ts';
import { R13_DATA_FLOW_ANALYSIS } from './layers/r13-data-flow-analysis.ts';
import { R14_CONTROL_FLOW_GRAPH } from './layers/r14-control-flow-graph.ts';
import { R15_CONTAINER_PREFLIGHT } from './layers/r15-container-preflight.ts';
import { R16_BIBLE_ENFORCEMENT } from './layers/r16-bible-enforcement.ts';
import { R17_THEATRICAL_INTEGRITY } from './layers/r17-theatrical-integrity.ts';

// FINDING #8 FIX: Centralized config — single source of truth for versions
import { TRIDENT_CONFIG } from '../config.js';

const BASELINE_BINARY = TRIDENT_CONFIG.baselineBinary;
const TARGET_IMAGE = TRIDENT_CONFIG.containerImage;

export class AuditEngine {
  private engine: LayerEngine;

  constructor() {
    this.engine = new LayerEngine();
    this.engine.registerLayers([
      R0_BUILD_CHAIN,
      R1_HOOK_CONTRACT,
      R2_STATE_MACHINE,
      R3_ASYNC_CORRECTNESS,
      R4_ERROR_HANDLING,
      R5_CONTAINER_DEPLOY,
      R6_DEPENDENCY_INTEGRITY,
      R7_CONFIG_SCHEMA,
      R8_SOURCE_HYGIENE,
      R9_RUNTIME_CONTRACT,
      R10_INVOCATION_INTEGRITY,
      R11_THEATRICAL_INTEGRITY,
      R12_CROSS_PLUGIN_ISOLATION,
      R13_DATA_FLOW_ANALYSIS,
      R14_CONTROL_FLOW_GRAPH,
      R15_CONTAINER_PREFLIGHT,
      R16_BIBLE_ENFORCEMENT,
      R17_THEATRICAL_INTEGRITY,
    ]);
  }

  // E22: Unified empty result handling — single path returns empty result
  private buildEmptyResult(targetPath: string, preflight: PreflightResult, pkgJson: Record<string, any> | null): AuditResult {
    const emptyFinding: AuditFinding = {
      layer: 'R0',
      severity: 'CRITICAL',
      category: 'EMPTY_TARGET',
      file: '(entire project)',
      line: 1,
      evidence: `Target path ${targetPath} contains 0 .ts source files`,
      description: 'No source files found in targetPath',
      correction: 'Point trident-code-audit at a directory containing src/ with .ts files',
      runtimeImpact: 'Audit returns 0/100 with no findings — no analysis was performed',
      confidence: 1.0,
      constructType: null,
      callGraphRef: null,
      evidenceSuppressed: false,
    };

    return {
      score: 0,
      grade: 'NOT RUNTIME GRADE — No source files found',
      findings: [emptyFinding],
      filesScanned: 0,
      sourceFilesScanned: 0,
      layers: [],
      report: '',
      preflight,
      confidenceDistribution: { definite: 0, high: 0, moderate: 0, low: 0, noise: 0 },
      suppressedFindings: [],
      auditMeta: {
        callGraphCoverage: 0, totalCallSites: 0, resolvedCallSites: 0,
        checkerAvailable: false,
        blindSpots: ['ZERO source files found — target path may be dist-only'],
        suppressedBelowFloor: 0,
        selfAudit: false,
      },
    };
  }

  reset(): void {
    this.engine = new LayerEngine();
    this.engine.registerLayers([
      R0_BUILD_CHAIN,
      R1_HOOK_CONTRACT,
      R2_STATE_MACHINE,
      R3_ASYNC_CORRECTNESS,
      R4_ERROR_HANDLING,
      R5_CONTAINER_DEPLOY,
      R6_DEPENDENCY_INTEGRITY,
      R7_CONFIG_SCHEMA,
      R8_SOURCE_HYGIENE,
      R9_RUNTIME_CONTRACT,
      R10_INVOCATION_INTEGRITY,
      R11_THEATRICAL_INTEGRITY,
      R12_CROSS_PLUGIN_ISOLATION,
      R13_DATA_FLOW_ANALYSIS,
      R14_CONTROL_FLOW_GRAPH,
      R15_CONTAINER_PREFLIGHT,
      R16_BIBLE_ENFORCEMENT,
      R17_THEATRICAL_INTEGRITY,
    ]);
  }

  async audit(targetPath: string): Promise<AuditResult> {
    const preflight = await runPreflight(targetPath);
    const pkgJson = await this.readJson(path.join(targetPath, 'package.json'));
    const tsconfig = await this.readJson(path.join(targetPath, 'tsconfig.json'));
    const opencodeJson = await this.readJson(path.join(targetPath, 'opencode.json'));

    const ctx = classifyProject(targetPath, preflight, pkgJson, tsconfig, opencodeJson);

    // Early exit: if no source files found, return 0/100 with explanation
    const srcFilesScanned = Array.from(ctx.constructsByFile.keys()).filter(
      f => f.endsWith('.ts') && !f.includes('node_modules')
    ).length;

    if (srcFilesScanned === 0) {
      const result = this.buildEmptyResult(targetPath, preflight, pkgJson);
      result.report = this.generateReport(result, targetPath, typeof pkgJson?.name === 'string' ? pkgJson.name : path.basename(targetPath), '');
      return result;
    }

    const evidenceInitial = new EvidenceGate(preflight, ctx.diagnostics);
    const rawFindings = this.engine.evaluateAll(ctx, evidenceInitial);

    const docsDir = path.join(targetPath, 'docs');
    const enrichedFindings = await enrichWithHiveKnowledge(rawFindings, docsDir);

    const evidence = new EvidenceGate(preflight, ctx.diagnostics, enrichedFindings);

    const layerStats = this.computeLayerStats(enrichedFindings);
    const filesScanned = ctx.constructsByFile.size;
    const sourceFilesScanned = Array.from(ctx.constructsByFile.keys()).filter(
      f => f.endsWith('.ts') && !f.includes('node_modules')
    ).length;

    const checkerAvailable = ctx.callGraph.totalCallSites === 0 || ctx.callGraph.coveragePercent > 0;

    const result = computeScore(
      enrichedFindings,
      evidence,
      filesScanned,
      sourceFilesScanned,
      layerStats,
      ctx.callGraph.coveragePercent,
      ctx.callGraph.totalCallSites,
      ctx.callGraph.resolvedCallSites,
      checkerAvailable,
      ctx.isSelfAudit,
    );

    const projectName = typeof pkgJson?.name === 'string' ? pkgJson.name : path.basename(targetPath);
    const agentName = typeof opencodeJson?.agent === 'object' && opencodeJson?.agent !== null ? Object.keys(opencodeJson?.agent)[0] || '' : '';

    result.report = this.generateReport(result, targetPath, projectName, agentName);
    return result;
  }

  async auditWithPreflight(targetPath: string): Promise<AuditResult> {
    return await this.audit(targetPath);
  }

  async auditSingleLayer(targetPath: string, layerId: string): Promise<AuditResult> {
    const preflight = await runPreflight(targetPath);
    const pkgJson = await this.readJson(path.join(targetPath, 'package.json'));
    const tsconfig = await this.readJson(path.join(targetPath, 'tsconfig.json'));
    const opencodeJson = await this.readJson(path.join(targetPath, 'opencode.json'));

    const ctx = classifyProject(targetPath, preflight, pkgJson, tsconfig, opencodeJson);

    const srcFilesScanned = Array.from(ctx.constructsByFile.keys()).filter(
      f => f.endsWith('.ts') && !f.includes('node_modules')
    ).length;

    if (srcFilesScanned === 0) {
      const result = this.buildEmptyResult(targetPath, preflight, pkgJson);
      result.report = this.generateReport(result, targetPath, typeof pkgJson?.name === 'string' ? pkgJson.name : path.basename(targetPath), '');
      return result;
    }

    const singleEngine = new LayerEngine();
    const allLayers = [
      R0_BUILD_CHAIN, R1_HOOK_CONTRACT, R2_STATE_MACHINE, R3_ASYNC_CORRECTNESS,
      R4_ERROR_HANDLING, R5_CONTAINER_DEPLOY, R6_DEPENDENCY_INTEGRITY, R7_CONFIG_SCHEMA,
      R8_SOURCE_HYGIENE, R9_RUNTIME_CONTRACT, R10_INVOCATION_INTEGRITY, R11_THEATRICAL_INTEGRITY,
      R12_CROSS_PLUGIN_ISOLATION, R13_DATA_FLOW_ANALYSIS, R14_CONTROL_FLOW_GRAPH,
      R15_CONTAINER_PREFLIGHT, R16_BIBLE_ENFORCEMENT,
      R17_THEATRICAL_INTEGRITY,
    ];
    const targetLayer = allLayers.find(l => l.layer === layerId);
    if (!targetLayer) {
      return this.buildEmptyResult(targetPath, preflight, pkgJson);
    }
    singleEngine.registerLayer(targetLayer);

    const evidence = new EvidenceGate(preflight, ctx.diagnostics);
    const rawFindings = singleEngine.evaluateAll(ctx, evidence);

    const docsDir = path.join(targetPath, 'docs');
    const enrichedFindings = await enrichWithHiveKnowledge(rawFindings, docsDir);

    const layerStats = this.computeLayerStats(enrichedFindings);
    const filesScanned = ctx.constructsByFile.size;
    const checkerAvailable = ctx.callGraph.totalCallSites === 0 || ctx.callGraph.coveragePercent > 0;

    const result = computeScore(
      enrichedFindings,
      evidence,
      filesScanned,
      srcFilesScanned,
      layerStats,
      ctx.callGraph.coveragePercent,
      ctx.callGraph.totalCallSites,
      ctx.callGraph.resolvedCallSites,
      checkerAvailable,
      ctx.isSelfAudit,
    );

    const projectName = typeof pkgJson?.name === 'string' ? pkgJson.name : path.basename(targetPath);
    const agentName = typeof opencodeJson?.agent === 'object' && opencodeJson?.agent !== null ? Object.keys(opencodeJson?.agent)[0] || '' : '';
    result.report = this.generateReport(result, targetPath, projectName, agentName);
    return result;
  }

  async generateDevOpsReport(result: AuditResult, targetPath: string): Promise<string> {
    const pkgJson = await this.readJson(path.join(targetPath, 'package.json'));
    const opencodeJson = await this.readJson(path.join(targetPath, 'opencode.json'));
    const projectName = typeof pkgJson?.name === 'string' ? pkgJson.name : path.basename(targetPath);
    const agentName = typeof opencodeJson?.agent === 'object' && opencodeJson?.agent !== null ? Object.keys(opencodeJson?.agent)[0] || '' : '';

    let report = this.generateReport(result, targetPath, projectName, agentName);

    const phases = prioritizeFixes(result);
    report += '\n\n' + generateFixSummary(phases, result.score);

    const testPlan = generateContainerTestPlan(result.findings, projectName, agentName);
    if (testPlan) {
      report += `\n\n---\n\n${testPlan}`;
    }

    report += '\n\n' + generateDeploymentManifest(result, projectName, agentName, BASELINE_BINARY);

    return report;
  }

  private computeLayerStats(findings: AuditFinding[]): { layer: string; name: string; findingCount: number; avgConfidence: number; evidenceSuppressed: boolean }[] {
    const stats = new Map<string, { count: number; totalConf: number; suppressed: boolean; name: string }>();

    const layerNames: Record<string, string> = {
      R0: 'Build Chain', R1: 'Hook Contract', R2: 'State Machine', R3: 'Async Correctness',
      R4: 'Error Handling', R5: 'Container Deploy', R6: 'Dependency Integrity', R7: 'Config Schema',
      R8: 'Source Hygiene', R9: 'Runtime Contract', R10: 'Invocation Integrity', R11: 'Theatrical Integrity',
      R12: 'Cross-Plugin Isolation',
      R13: 'Data Flow Analysis',
      R14: 'Control Flow Graph',
      R15: 'Container Preflight',
      R16: 'Bible Enforcement (P1-P11)',
      R17: 'Theatrical Integrity (D1-D10)',
    };

    for (const f of findings) {
      const existing = stats.get(f.layer);
      if (existing) {
        existing.count++;
        existing.totalConf += f.confidence;
        if (f.evidenceSuppressed) existing.suppressed = true;
      } else {
        stats.set(f.layer, {
          count: 1,
          totalConf: f.confidence,
          suppressed: f.evidenceSuppressed,
          name: layerNames[f.layer] || f.layer,
        });
      }
    }

    const allLayers = Object.entries(layerNames).map(([layer, name]) => {
      const stat = stats.get(layer);
      return {
        layer,
        name,
        findingCount: stat?.count || 0,
        avgConfidence: stat ? Math.round((stat.totalConf / stat.count) * 100) / 100 : 0,
        evidenceSuppressed: stat?.suppressed || false,
      };
    });

    return allLayers;
  }

  private generateReport(result: AuditResult, targetPath: string, projectName: string, agentName: string): string {
    // For empty results (0 files scanned), return a clear error report
    if (result.sourceFilesScanned === 0) {
      let r = `# TRIDENT CODE REVIEW — ${projectName}\n\n`;
      r += `**Score:** 0/100 — NOT RUNTIME GRADE\n`;
      r += `**Files:** ${result.filesScanned} total | ${result.sourceFilesScanned} source\n`;
      r += `**Findings:** No source files found to analyze\n\n`;
      r += `---\n\n`;
      r += `## ERROR: Zero source files scanned\n\n`;
      r += `The audit engine could not find any \`.ts\` source files at the target path.\n`;
      r += `This can happen when:\n`;
      r += `- The target path does not contain a \`src/\` directory\n`;
      r += `- The path points to a compiled dist-only package (e.g., \`node_modules\`, deployed bundle)\n`;
      r += `- The path is incorrect or does not exist\n\n`;
      r += `**Target path checked:** \`${targetPath}\`\n\n`;
      r += `To fix: point \`trident-code-audit\` at the source root (the directory containing \`src/\`).\n`;
      r += `\n---\n*Generated by Trident v4.3 AST-Powered Code Review Engine*\n`;
      return r;
    }
    const critical = result.findings.filter(f => f.severity === 'CRITICAL');
    const high = result.findings.filter(f => f.severity === 'HIGH');
    const medium = result.findings.filter(f => f.severity === 'MEDIUM');
    const low = result.findings.filter(f => f.severity === 'LOW');
    const dist = result.confidenceDistribution;
    const total = dist.definite + dist.high + dist.moderate + dist.low + dist.noise;

    let report = `# TRIDENT v4.3 — RUNTIME GRADE DEVOPS AUDIT\n\n`;
    report += `**Score:** ${result.score}/100 — ${result.grade}\n`;
    report += `**Target:** ${targetPath} (${projectName})\n`;
    report += `**Agent:** ${agentName}\n`;
    report += `**Files Scanned:** ${result.sourceFilesScanned} source files\n`;
    report += `**Findings:** ${critical.length} CRITICAL | ${high.length} HIGH | ${medium.length} MEDIUM | ${low.length} LOW\n`;
    report += `**Layers:** ${result.layers.length}/17 active\n\n`;
    report += `---\n\n`;

    report += `## Mechanical Evidence (PREFLIGHT)\n\n`;
    report += `| Check | Result | Detail |\n`;
    report += `|-------|--------|--------|\n`;
    for (const f of result.preflight.findings) {
      report += `| ${f.check} | ${f.passed ? 'PASS' : 'FAIL'} | ${f.detail} |\n`;
    }
    report += `\n`;

    report += `## Confidence Distribution\n\n`;
    report += `| Confidence | Count | % of Total |\n`;
    report += `|------------|-------|-----------|\n`;
    if (total > 0) {
      report += `| 0.95-1.00 (Definite) | ${dist.definite} | ${((dist.definite / total) * 100).toFixed(1)}% |\n`;
      report += `| 0.85-0.94 (High) | ${dist.high} | ${((dist.high / total) * 100).toFixed(1)}% |\n`;
      report += `| 0.70-0.84 (Moderate) | ${dist.moderate} | ${((dist.moderate / total) * 100).toFixed(1)}% |\n`;
      report += `| < 0.70 (Low/Noise) | ${dist.low + dist.noise} | ${(((dist.low + dist.noise) / total) * 100).toFixed(1)}% |\n`;
    }
    report += `\n*(Findings below 0.70 confidence are excluded from scoring)*\n\n`;

    if (critical.length > 0) {
      report += `## CRITICAL — Prevents First-Attempt Deployment\n\n`;
      for (const f of critical) {
        report += formatFinding(f);
      }
    }

    if (high.length > 0) {
      report += `## HIGH — Will Fail Container Test\n\n`;
      for (const f of high) {
        report += formatFinding(f);
      }
    }

    if (medium.length > 0) {
      report += `## MEDIUM — Quality Issues\n\n`;
      const shown = medium.slice(0, 20);
      for (const f of shown) {
        report += `- [${f.layer}] \`${shortFile(f.file)}:${f.line}\` — ${f.description} (conf: ${f.confidence.toFixed(2)})\n`;
      }
      if (medium.length > 20) report += `\n... and ${medium.length - 20} more medium findings\n`;
      report += `\n`;
    }

    report += `---\n\n`;
    report += `## Layer Summary\n\n`;
    report += `| Layer | Name | Findings | Avg Confidence | Evidence Suppressed |\n`;
    report += `|-------|------|----------|---------------|--------------------|\n`;
    for (const l of result.layers) {
      report += `| ${l.layer} | ${l.name} | ${l.findingCount} | ${l.avgConfidence.toFixed(2)} | ${l.evidenceSuppressed ? 'YES' : 'no'} |\n`;
    }

    report += `\n## Audit Meta — Transparency Report\n\n`;
    report += `| Metric | Value |\n`;
    report += `|--------|-------|\n`;
    report += `| Call Graph Coverage | ${result.auditMeta.callGraphCoverage}% (${result.auditMeta.resolvedCallSites}/${result.auditMeta.totalCallSites} resolved) |\n`;
    report += `| Type Checker | ${result.auditMeta.checkerAvailable ? 'Available' : 'UNAVAILABLE — findings degraded'} |\n`;
    report += `| Self-Audit | ${result.auditMeta.selfAudit ? 'YES — blind spot: cannot find bugs in itself' : 'No'} |\n`;
    report += `| Suppressed Below Floor | ${result.auditMeta.suppressedBelowFloor} findings below 0.50 confidence |\n`;

    if (result.auditMeta.blindSpots.length > 0) {
      report += `\n### Known Blind Spots\n\n`;
      for (const bs of result.auditMeta.blindSpots) {
        report += `- ${bs}\n`;
      }
    }

    if (result.suppressedFindings.length > 0) {
      report += `\n### Suppressed Findings (below 0.50 confidence)\n\n`;
      report += `| Layer | Sev | File:Line | Description | Confidence |\n`;
      report += `|-------|-----|-----------|-------------|------------|\n`;
      for (const sf of result.suppressedFindings.slice(0, 20)) {
        report += `| ${sf.layer} | ${sf.severity.substring(0, 4)} | ${shortFile(sf.file)}:${sf.line} | ${sf.description.substring(0, 60)} | ${sf.confidence.toFixed(2)} |\n`;
      }
      if (result.suppressedFindings.length > 20) {
        report += `\n... and ${result.suppressedFindings.length - 20} more suppressed findings\n`;
      }
    }

    report += `\n*Generated by Trident v4.3 AST-Powered Audit Engine*\n`;
    report += `*Confidence-weighted | Call-graph-aware | Mechanical-evidence-gated*\n`;
    return report;
  }

  private async readJson(filePath: string): Promise<Record<string, unknown> | null> {
    try {
      await fs.access(filePath);
      const raw = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(raw) as Record<string, unknown>;
    } catch (e) {
      tridentLog('WARN', 'audit-engine', `readJson failed for ${filePath}: ${(e as Error).message}`);
      return null;
    }
  }
}

function formatFinding(f: AuditFinding): string {
  let s = `### [${f.layer}] ${f.category} — ${f.severity} (confidence: ${f.confidence.toFixed(2)} — ${confidenceLabel(f.confidence)})\n\n`;
  s += `**File:** \`${shortFile(f.file)}:${f.line}\`\n`;
  if (f.constructType) s += `**AST Construct:** ${f.constructType}\n`;
  if (f.callGraphRef) s += `**Call Graph:** ${f.callGraphRef}\n`;
  s += `**Evidence:** \`${f.evidence.substring(0, 150)}\`\n`;
  s += `**Problem:** ${f.description}\n`;
  s += `**Runtime Impact:** ${f.runtimeImpact}\n`;
  s += `**Fix:** ${f.correction}\n`;
  if (f.evidenceSuppressed) s += `**Evidence Suppressed:** YES — preflight contradicts this finding\n`;
  s += `\n`;
  return s;
}

export const auditEngine = new AuditEngine();
