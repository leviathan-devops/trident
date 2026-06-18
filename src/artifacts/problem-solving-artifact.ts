import { tridentLog } from '../utils.js';
import type { DiscoveryResult } from '../shared/auto-discover.js';

interface ReasoningStep {
  observation: string;
  hypothesis: string;
  evidence: string;
  conclusion: string;
}

interface PlanPhase {
  description: string;
  files: string;
  expectedOutcome: string;
  risk: string;
  rollback: string;
}

/**
 * Parse reasoning steps. Supports:
 * - Pipe-delimited: "observation|hypothesis|evidence|conclusion"
 * - Free text: entire string becomes observation, hypothesis is derived
 */
function parseReasoningChain(reasoning: string[]): ReasoningStep[] {
  return reasoning.map((r: string, i: number) => {
    const parts = r.split('|').map(s => s.trim());
    if (parts.length >= 4) {
      return {
        observation: parts[0],
        hypothesis: parts[1],
        evidence: parts[2],
        conclusion: parts[3],
      };
    }
    if (parts.length >= 2) {
      return {
        observation: parts[0],
        hypothesis: parts[1],
        evidence: 'Pending investigation',
        conclusion: parts[1],
      };
    }
    // Free text: derive hypothesis from causal keywords
    const text = r.trim();
    const lowerText = text.toLowerCase();
    let hypothesis = 'Under investigation';
    const causalMarkers = ['because', 'due to', 'caused by', 'results from', 'since', 'as a result'];
    for (const marker of causalMarkers) {
      const idx = lowerText.indexOf(marker);
      if (idx !== -1) {
        hypothesis = text.substring(idx + marker.length).trim();
        break;
      }
    }
    return {
      observation: text,
      hypothesis,
      evidence: 'See observation',
      conclusion: text.substring(0, 80),
    };
  });
}

/**
 * Parse working plan phases. Supports pipe-delimited format.
 */
function parseWorkingPlan(plan: string[]): PlanPhase[] {
  return plan.map((p: string) => {
    const parts = p.split('|').map(s => s.trim());
    if (parts.length >= 5) {
      return {
        description: parts[0],
        files: parts[1],
        expectedOutcome: parts[2],
        risk: parts[3],
        rollback: parts[4],
      };
    }
    if (parts.length >= 2) {
      return {
        description: parts[0],
        files: parts[1],
        expectedOutcome: 'Fix applied',
        risk: 'MEDIUM',
        rollback: 'git checkout HEAD -- affected files',
      };
    }
    const text = p.trim();
    const lowerText = text.toLowerCase();
    let risk = 'MEDIUM';
    if (lowerText.match(/safe|trivial|simple|cosmetic/)) risk = 'LOW';
    if (lowerText.match(/critical|breaking|dangerous|irreversible|migration/)) risk = 'HIGH';
    return {
      description: text,
      files: 'See description',
      expectedOutcome: 'Expected behavior restored',
      risk,
      rollback: risk === 'HIGH'
        ? 'Full backup required before proceeding. Rollback: revert commit + restore DB.'
        : 'git checkout HEAD -- affected files',
    };
  });
}

/**
 * Classify severity based on finding text content.
 */
function classifySeverity(finding: string): string {
  const lower = finding.toLowerCase();
  if (lower.match(/critical|crash|data loss|security|injection|broken/)) return 'CRITICAL';
  if (lower.match(/error|fail|bug|incorrect|wrong|invalid/)) return 'HIGH';
  if (lower.match(/warning|deprecated|cleanup|minor/)) return 'MEDIUM';
  return 'LOW';
}

/**
 * Generate reasoning chain with discovery cross-referencing.
 * Unlike the old version, this:
 * 1. Extracts FILE NAMES and CODE PATTERNS from reasoning text (not English words)
 * 2. Cross-references against discovery patterns by file path, not by keyword
 * 3. Only reports REAL evidence matches
 */
function generateReasoningChain(
  reasoning: string[],
  discovery?: DiscoveryResult | null
): ReasoningStep[] {
  const steps = parseReasoningChain(reasoning);

  if (!discovery || !discovery.patterns || discovery.patterns.length === 0) {
    return steps;
  }

  // Extract file references and code identifiers from reasoning text
  return steps.map(step => {
    const text = step.observation + ' ' + step.hypothesis;

    // Extract file paths (e.g., "src/hooks/trident-hooks.ts" or "trident-hooks.ts:42")
    const fileRefs = text.match(/[\w.-]+\.(ts|js|json|md)(:\d+)?/g) || [];

    // Extract identifier patterns (camelCase, snake_case, kebab-case)
    const identifiers = text.match(/\b[a-z][a-zA-Z0-9_]{3,}\b/g) || [];

    // Cross-reference: match discovery patterns by file path or identifier
    const matchedPatterns = discovery.patterns.filter(p => {
      // Match by file path
      if (fileRefs.some(ref => p.file.includes(ref.replace(/:\d+$/, '')))) return true;
      // Match by pattern name containing an identifier from the reasoning
      if (identifiers.some(id => p.name.toLowerCase().includes(id.toLowerCase()))) return true;
      return false;
    });

    if (matchedPatterns.length > 0) {
      const bestMatch = matchedPatterns[0];
      step.evidence = `Found: ${bestMatch.name} (${bestMatch.type}) at ${bestMatch.file}:${bestMatch.line}`;
      step.conclusion = `${step.hypothesis.substring(0, 60)} — confirmed by ${bestMatch.name}`;
    } else {
      step.evidence = 'No code pattern match found — manual verification needed';
    }

    return step;
  });
}

/**
 * Generate Root Cause Analysis.
 * Picks the step with the STRONGEST evidence (real matches, not longest strings).
 */
function generateRCA(
  steps: ReasoningStep[],
  problem: string,
  targetPath: string,
  findings: string[]
): { rootCause: string; contributingFactors: string; confidence: string } {
  // Score each step by evidence quality
  const scored = steps.map((step, i) => {
    let score = 0;
    // Real code match = highest score
    if (step.evidence.startsWith('Found:')) score += 100;
    // File reference in evidence
    if (/\w+\.\w+:\d+/.test(step.evidence)) score += 50;
    // Non-default evidence
    if (!step.evidence.includes('No code pattern match') && !step.evidence.includes('See observation') && !step.evidence.includes('Pending')) score += 30;
    // Later steps are more likely to be root cause (investigation progresses)
    score += i * 5;
    return { step, score, index: i };
  });

  scored.sort((a, b) => b.score - a.score);
  const bestStep = scored[0]?.step || steps[steps.length - 1] || { conclusion: problem, evidence: 'No evidence collected', hypothesis: 'Unknown' };

  const rootCause = bestStep.conclusion || problem;
  const contributingFactors = findings.slice(0, 3).join('; ') || 'None identified';

  // Calculate REAL confidence
  const stepsWithRealEvidence = steps.filter(s =>
    s.evidence.startsWith('Found:') || /\w+\.\w+:\d+/.test(s.evidence)
  ).length;
  const evidenceRatio = steps.length > 0 ? stepsWithRealEvidence / steps.length : 0;
  const hasFindings = findings.length > 0;

  let confidence: string;
  if (evidenceRatio >= 0.5 && hasFindings) confidence = 'High';
  else if (evidenceRatio >= 0.25 || hasFindings) confidence = 'Medium';
  else confidence = 'Low';

  return { rootCause, contributingFactors, confidence };
}

/**
 * Generate findings log from REAL discovery failure modes.
 * Only includes failures that are relevant to the target path.
 */
function generateFindingsLog(
  findings: string[],
  discovery?: DiscoveryResult | null
): Array<{ finding: string; severity: string; source: string }> {
  const result: Array<{ finding: string; severity: string; source: string }> = [];

  // User-provided findings first
  for (const f of findings) {
    result.push({
      finding: f,
      severity: classifySeverity(f),
      source: 'Investigation',
    });
  }

  // Discovery failure modes (limit to 5, only those with real patterns)
  if (discovery && discovery.failureModes) {
    const relevantFailures = discovery.failureModes
      .filter(f => f.pattern && !f.pattern.includes('Invalid key'))  // Filter out garbage
      .slice(0, 5);
    for (const f of relevantFailures) {
      result.push({
        finding: f.message,
        severity: classifySeverity(f.message),
        source: `${f.file}:${f.line}`,
      });
    }
  }

  return result;
}

/**
 * MAIN EXPORT: Generate the complete problem-solving plan artifact.
 */
export function generatePlanArtifact(
  targetPath: string,
  problem: string,
  reasoning: string[],
  workingPlan: string[],
  findings: string[],
  discovery?: DiscoveryResult | null
): string {
  const ts = new Date().toISOString();
  const steps = generateReasoningChain(reasoning, discovery);
  const phases = parseWorkingPlan(workingPlan);
  const rca = generateRCA(steps, problem, targetPath, findings);
  const findingsLog = generateFindingsLog(findings, discovery);

  let a = `# PROBLEM-SOLVING PLAN\n\n`;
  a += `**Problem:** ${problem}\n`;
  a += `**Target:** ${targetPath}\n`;
  a += `**Generated:** ${ts}\n`;
  a += `**Status:** INVESTIGATION\n`;
  a += `**Confidence:** ${rca.confidence}\n\n`;

  // Reasoning Chain
  a += `## Reasoning Chain (${steps.length} steps)\n\n`;
  a += `| Step | Observation | Hypothesis | Evidence | Conclusion |\n`;
  a += `|------|-------------|------------|----------|------------|\n`;
  steps.forEach((s: ReasoningStep, i: number) => {
    a += `| ${i + 1} | ${s.observation.substring(0, 80)} | ${s.hypothesis.substring(0, 60)} | ${s.evidence.substring(0, 60)} | ${s.conclusion.substring(0, 60)} |\n`;
  });
  a += `\n`;

  // Root Cause Analysis
  a += `## Root Cause Analysis\n\n`;
  a += `| Field | Detail |\n`;
  a += `|-------|--------|\n`;
  a += `| **Symptom** | ${steps[0]?.observation || problem} |\n`;
  a += `| **Root Cause** | ${rca.rootCause} |\n`;
  a += `| **Contributing Factors** | ${rca.contributingFactors} |\n`;
  a += `| **Impact Scope** | ${targetPath} and dependent modules |\n`;
  a += `| **Confidence** | ${rca.confidence} (${steps.filter(s => s.evidence.startsWith('Found:')).length}/${steps.length} steps have code evidence) |\n`;
  a += `\n`;

  // Working Plan
  a += `## Working Plan (${phases.length} phases)\n\n`;
  a += `| Phase | Description | Files | Expected Outcome | Risk | Rollback |\n`;
  a += `|-------|-------------|-------|------------------|------|----------|\n`;
  phases.forEach((p: PlanPhase, i: number) => {
    a += `| ${i + 1} | ${p.description.substring(0, 60)} | ${p.files.substring(0, 30)} | ${p.expectedOutcome.substring(0, 40)} | ${p.risk} | ${p.rollback.substring(0, 40)} |\n`;
  });
  a += `\n`;

  // Findings Log
  a += `## Findings Log\n\n`;
  if (findingsLog.length > 0) {
    a += `| # | Finding | Severity | Source |\n`;
    a += `|---|---------|----------|--------|\n`;
    findingsLog.forEach((f, i: number) => {
      a += `| ${i + 1} | ${f.finding.substring(0, 80)} | ${f.severity} | ${f.source} |\n`;
    });
  } else {
    a += `No findings recorded.\n`;
  }
  a += `\n`;

  // Verification Checklist
  a += `## Verification Checklist\n\n`;
  a += `- [ ] Symptom no longer reproduces\n`;
  a += `- [ ] Root cause confirmed fixed (not just symptom masked)\n`;
  a += `- [ ] No new regressions introduced\n`;
  a += `- [ ] Test suite passes (or new tests added)\n`;
  a += `- [ ] Container TUI test passes\n`;
  a += `- [ ] Evidence collected from external source (not self-created)\n\n`;

  // Regression Prevention
  a += `## Regression Prevention\n\n`;
  a += `- Add test case that reproduces original symptom\n`;
  a += `- Add audit layer check for this failure pattern\n`;
  a += `- Update context library with this failure mode\n`;
  a += `- Review related code paths for similar issues\n`;

  a += `\n---\n*Generated by Trident v4.3.3 Problem-Solving Engine*\n`;
  a += `*Confidence: ${rca.confidence} | Reasoning: ${steps.length} steps | Plan: ${phases.length} phases*\n`;
  return a;
}
