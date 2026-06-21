// GodLoopOrchestrator — Quality enforcement loop for Poseidon Mode
// Orchestrates audit → build → verify cycles via async stateful steps.
// PHASE A: Audit target source (trident-code-audit)
// PHASE A: If <96%, generate remediation plan
// PHASE C: Re-audit, compare scores, loop until 96%+

import { poseidonState } from './poseidon-state.js';
import { tridentLog } from '../utils.js';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import * as path from 'node:path';
import { CycleTracker, PlanFinding } from './cycle-tracker.js';

class GodLoopOrchestrator {
  // PHASE A: Audit target and generate remediation plan
  // Called by trident-poseidon action=start
  async auditAndPlan(targetPath: string, sessionId: string, maxCycles?: number): Promise<{
    cycle: number;
    score: number;
    findings: Array<{ file: string; line: number; issue: string; severity: string }>;
    plan: string;
    planPath: string;
    archiveBase: string;
    status: 'looping' | 'complete' | 'error';
  }> {
    var archiveBase = path.join(process.cwd(), '.trident', 'poseidon-audits', sessionId);
    mkdirSync(archiveBase, { recursive: true });

    // Load previous state if exists, or start fresh
    var previousState = this.loadLoopState(archiveBase);
    var cycle = (previousState?.cycle || 0) + 1;
    var cycleTracker = new CycleTracker();
    if (previousState?.cycleTrackerPath) {
      cycleTracker.loadFromDisk(previousState.cycleTrackerPath);
    }

    poseidonState.incrementCycles(sessionId);
    tiLog('POSEIDON', `--- CYCLE ${cycle}: AUDIT ---`);

    // Check abort flag
    var metrics = poseidonState.getMetrics(sessionId);
    if (metrics?.abortFlag) {
      return { cycle, score: 0, findings: [], plan: '', planPath: '', archiveBase, status: 'error' };
    }

    // Run audit
    var auditOutput = await this.runAudit(targetPath);
    var score = this.extractScore(auditOutput);
    var rawFindings = this.extractFindings(auditOutput, targetPath);
    
    // Track via cycleTracker
    var planFindings = this.createPlanFindings(auditOutput);
    var previousIds = cycleTracker.getPreviousFindingIds();
    var classifiedFindings = cycleTracker.classifyFindings(planFindings, previousIds);
    var classifiedIds = classifiedFindings.filter(function(f) { return f.status !== 'fixed'; }).map(function(f) { return f.id; });
    cycleTracker.recordCycle(cycle, score, classifiedIds, '');

    // Check max cycles from config or parameter
    var effectiveMaxCycles = maxCycles || (globalThis as any).poseidonMaxCycles || 50;

    // Check stagnation
    var stagnation = cycleTracker.detectStagnation();
    if (stagnation.stuck) {
      tiLog('POSEIDON', `CYCLE ${cycle}: STALLED — aborting.`);
      return { cycle, score, findings: rawFindings, plan: '', planPath: '', archiveBase, status: 'error' };
    }

    // Archive audit output
    this.archiveCycle(archiveBase, cycle, auditOutput, score);
    this.writeLoopState(archiveBase, cycle, score, targetPath);

    // Check if score >= 96% — done!
    if (score >= 96) {
      tiLog('POSEIDON', `CYCLE ${cycle}: Score >= 96 — build passed audit.`);
      this.writeLoopState(archiveBase, cycle, score, targetPath);
      this.writeNextSteps(archiveBase, cycle, score, 'container');
      cycleTracker.saveToDisk(archiveBase);
      this.saveLoopState(archiveBase, { cycle, score, highestScore: score, status: 'complete', nextAction: 'container_test', archiveBase, cycleTrackerPath: archiveBase, targetPath });
      return { cycle, score, findings: rawFindings, plan: '', planPath: '', archiveBase, status: 'complete' };
    }

    // Generate remediation plan
    var plan = this.generatePlan(cycle, rawFindings, targetPath, score);
    cycleTracker.markFindingsAsPlanned(classifiedFindings, plan);
    this.archivePlan(archiveBase, cycle, plan);
    var planPath = path.join(archiveBase, `cycle_${cycle}`, 'PLAN.md');
    // Write plan to well-known location for BuildFirewall to read
    var planDir = path.join(process.cwd(), '.trident-build', 'plan');
    try { mkdirSync(planDir, { recursive: true }); writeFileSync(path.join(planDir, 'CURRENT_PLAN.md'), plan); } catch (e) {
      tiLog('ERROR', 'Failed to write CURRENT_PLAN.md: ' + (e instanceof Error ? e.message : String(e)));
    }
    this.writeNextSteps(archiveBase, cycle, score, 'execute');

    // Persist state
    cycleTracker.saveToDisk(archiveBase);
    this.saveLoopState(archiveBase, { cycle, score, highestScore: previousState?.highestScore || score, status: 'looping', nextAction: 'dispatch_build', archiveBase, cycleTrackerPath: archiveBase, targetPath, plan });

    tiLog('POSEIDON', `CYCLE ${cycle}: Audit complete. Score=${score}/100. Plan saved to ${planPath}`);

    return { cycle, score, findings: rawFindings, plan, planPath, archiveBase, status: 'looping' };
  }

  // PHASE C: Verify build results after Trident_Build execution
  // Called by trident-poseidon action=verify
  async verifyCycle(targetPath: string, sessionId: string): Promise<{
    cycle: number;
    score: number;
    previousScore: number;
    findingsFixed: number;
    findingsRemaining: number;
    nextAction: 'audit' | 'dispatch_build' | 'complete' | 'error';
    status: 'looping' | 'complete' | 'error';
  }> {
    var archiveBase = path.join(process.cwd(), '.trident', 'poseidon-audits', sessionId);
    var previousState = this.loadLoopState(archiveBase);
    if (!previousState) {
      return { cycle: 0, score: 0, previousScore: 0, findingsFixed: 0, findingsRemaining: 0, nextAction: 'error', status: 'error' };
    }

    var cycle = previousState.cycle;
    var previousScore = previousState.score;
    var cycleTracker = new CycleTracker();
    cycleTracker.loadFromDisk(archiveBase);

    tiLog('POSEIDON', `--- CYCLE ${cycle}: VERIFY ---`);

    // Run re-audit
    var auditOutput = await this.runAudit(targetPath);
    var score = this.extractScore(auditOutput);
    var rawFindings = this.extractFindings(auditOutput, targetPath);

    // Track findings
    var planFindings = this.createPlanFindings(auditOutput);
    var previousIds = cycleTracker.getPreviousFindingIds();
    var classifiedFindings = cycleTracker.classifyFindings(planFindings, previousIds);
    cycleTracker.recordCycle(cycle, score, classifiedFindings.filter(function(f) { return f.status !== 'fixed'; }).map(function(f) { return f.id; }), '');
    cycleTracker.saveToDisk(archiveBase);

    var findingsFixed = 0;
    var findingsRemaining = 0;
    for (var i = 0; i < classifiedFindings.length; i++) {
      if (classifiedFindings[i].status === 'fixed') findingsFixed++;
      else findingsRemaining++;
    }

    var stagnation = cycleTracker.detectStagnation();
    if (stagnation.stuck) {
      tiLog('POSEIDON', `CYCLE ${cycle}: STALLED — no progress across multiple cycles.`);
      this.saveLoopState(archiveBase, { ...previousState, score, highestScore: Math.max(previousState.highestScore, score), status: 'error', nextAction: 'error' });
      return { cycle, score, previousScore, findingsFixed, findingsRemaining, nextAction: 'error', status: 'error' };
    }

    // Check if build made progress
    if (score > previousScore) {
      tiLog('POSEIDON', `CYCLE ${cycle}: Score improved ${previousScore} → ${score}.`);
      if (score >= 96) {
        tiLog('POSEIDON', `CYCLE ${cycle}: Score >= 96 — build passed!`);
        this.writeNextSteps(archiveBase, cycle, score, 'container');
        this.saveLoopState(archiveBase, { ...previousState, score, highestScore: Math.max(previousState.highestScore, score), status: 'complete', nextAction: 'container_test' });
        return { cycle, score, previousScore, findingsFixed, findingsRemaining, nextAction: 'complete', status: 'complete' };
      }
      // Progress but not done — dispatch another build
      var plan = this.generatePlan(cycle, rawFindings, targetPath, score);
      this.archivePlan(archiveBase, cycle + 1, plan);
      this.saveLoopState(archiveBase, { ...previousState, score, highestScore: Math.max(previousState.highestScore, score), cycle, status: 'looping', nextAction: 'dispatch_build', plan });
      return { cycle, score, previousScore, findingsFixed, findingsRemaining, nextAction: 'dispatch_build', status: 'looping' };
    } else {
      // No progress — generate verbose plan
      tiLog('POSEIDON', `CYCLE ${cycle}: No score improvement (${previousScore} → ${score}). Generating verbose plan.`);
      var verbosePlan = this.generateVerbosePlan(cycle, rawFindings, targetPath, score);
      this.archivePlan(archiveBase, cycle + 1, verbosePlan);
      this.saveLoopState(archiveBase, { ...previousState, score, highestScore: Math.max(previousState.highestScore, score), cycle, status: 'looping', nextAction: 'dispatch_build', plan: verbosePlan });
      return { cycle, score, previousScore, findingsFixed, findingsRemaining, nextAction: 'dispatch_build', status: 'looping' };
    }
  }

  // Run trident-code-audit on target
  private async runAudit(targetPath: string): Promise<string> {
    try {
      var AuditEngine = (await import('../audit-engine/index.js')).AuditEngine;
      var generateCodeReviewArtifact = (await import('../artifacts/code-review-artifact.js')).generateCodeReviewArtifact;
      
      tiLog('POSEIDON', `Running audit on: ${targetPath}`);
      var engine = new AuditEngine();
      var result = await engine.audit(targetPath);
      
      tiLog('POSEIDON', `Audit complete: Score=${result.score}/100, Findings=${result.findings.length}, Files=${result.filesScanned}`);
      
      if (result.report) {
        return result.report;
      }
      
      return generateCodeReviewArtifact(result, targetPath, targetPath.split('/').pop() || 'project', 'poseidon-god-loop');
    } catch (e) {
      var errMsg = e instanceof Error ? e.message : String(e);
      tiLog('ERROR', `Audit failed: ${errMsg}`);
      return JSON.stringify({ 
        error: errMsg, 
        score: 0, 
        findings: [{ message: errMsg }] 
      }, null, 2);
    }
  }

  // Extract score from audit output
  private extractScore(auditOutput: string): number {
    var patterns = [
      /Score:\s*(\d+)\s*\/\s*100/i,
      /(\d+)\s*\/\s*100/i,
      /(\d+)\s*%/,
      /pass.?rate[:\s]*(\d+(?:\.\d+)?)/i,
    ];
    for (var i = 0; i < patterns.length; i++) {
      var match = auditOutput.match(patterns[i]);
      if (match) return parseInt(match[1], 10);
    }
    return 0;
  }

  // Extract findings from audit output
  private extractFindings(auditOutput: string, targetPath?: string): Array<{ file: string; line: number; issue: string; severity: string }> {
    var findings: Array<{ file: string; line: number; issue: string; severity: string }> = [];
    var lines = auditOutput.split('\n');
    var inTable = false;

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();

      // Detect markdown table rows with findings
      // Format: | filename.ts | 42 | Description of issue | critical |
      if (line.startsWith('|') && line.endsWith('|')) {
        var cols = line.split('|').filter(function(c) { return c.trim().length > 0; });
        if (cols.length >= 3) {
          var file = cols[0].trim();
          var lineNum = parseInt(cols[1].trim(), 10);
          var issue = cols[2].trim();
          var severity = cols.length >= 4 ? cols[3].trim() : 'high';
          if (!isNaN(lineNum) && file.indexOf('.ts') !== -1 || file.indexOf('.js') !== -1) {
            findings.push({ file, line: lineNum, issue, severity });
            inTable = true;
          }
        }
      }

      // Also detect: FILE: path LINE: num ISSUE: desc
      if (/FILE:\s*\S+\s+LINE:\s*\d+/i.test(line)) {
        var fileMatch = line.match(/FILE:\s*(\S+)/i);
        var lineMatch = line.match(/LINE:\s*(\d+)/i);
        var issueMatch = line.match(/ISSUE:\s*(.+?)(?:\s+SEVERITY:|$)/i);
        if (fileMatch && lineMatch) {
          findings.push({
            file: fileMatch[1],
            line: parseInt(lineMatch[1], 10),
            issue: issueMatch ? issueMatch[1].trim() : line,
            severity: 'high',
          });
        }
      }

      // NEW: **File:** `path:line` pattern (AuditEngine report format)
      var fileLineMatch = line.match(/\*\*File:\*\*\s*`([^:]+):(\d+)`/i);
      if (fileLineMatch) {
        var file = fileLineMatch[1].trim();
        var lineNum = parseInt(fileLineMatch[2], 10);
        // Look ahead for the Problem line
        var problem = '';
        for (var look = i + 1; look < Math.min(i + 5, lines.length); look++) {
          var probMatch = lines[look].match(/\*\*Problem:\*\*\s*(.+)/i);
          if (probMatch) {
            problem = probMatch[1].trim();
            break;
          }
        }
        findings.push({ file, line: lineNum, issue: problem || line, severity: 'high' });
      }

      // NEW: ### [R#] CATEGORY — SEVERITY pattern (section headers with severity)
      var sectionMatch = line.match(/^###\s+\[(R\d+|SUMMARY|THEATRICAL|FLOATING|EMPTY|DEAD|SCOPE)\]\s*(.+?)\s*[—\-]\s*(CRITICAL|HIGH|MEDIUM|LOW)/i);
      if (sectionMatch) {
        var category = sectionMatch[2].trim();
        var severity = sectionMatch[3].toLowerCase();
        // Store as a finding with inferred context
        if (!fileLineMatch) {
          findings.push({ file: targetPath || '', line: 0, issue: '[' + sectionMatch[1] + '] ' + category, severity });
        }
      }

      // Fallback: numbered lines with file references
      if (/^\d+[\.\)]\s+\S+\.(ts|js)/.test(line)) {
        var parts = line.match(/^\d+[\.\)]\s+(\S+\.(?:ts|js))\s*-?\s*(.+)/);
        if (parts) {
          findings.push({
            file: parts[1],
            line: 0,
            issue: parts[2] || line,
            severity: 'high',
          });
        }
      }
    }

    return findings;
  }

  // Parse findings from audit output into structured PlanFinding[]
  private createPlanFindings(auditOutput: string): PlanFinding[] {
    var findings: PlanFinding[] = [];
    var extracted = this.extractFindings(auditOutput, '');
    for (var i = 0; i < extracted.length; i++) {
      var e = extracted[i];
      findings.push({ file: e.file, line: e.line, issue: e.issue, severity: e.severity });
    }
    return findings;
  }

  // Generate remediation plan
  private generatePlan(cycle: number, findings: Array<{ file: string; line: number; issue: string; severity: string }>, targetPath: string, score: number): string {
    var plan = `## CYCLE ${cycle} REMEDIATION PLAN\n`;
    plan += `## Current Score: ${score}/100\n`;
    plan += score < 60 ? '## Verdict: NOT_RUNTIME_GRADE\n\n' : score < 96 ? '## Verdict: APPROACHING\n\n' : '## Verdict: RUNTIME_GRADE\n\n';

    if (findings.length > 0) {
      plan += '### CRITICAL FINDINGS (fix ALL of these — do not skip):\n\n';
      for (var i = 0; i < findings.length; i++) {
        var f = findings[i];
        plan += `${i + 1}. FILE: ${f.file} LINE: ${f.line}\n`;
        plan += `   ISSUE: ${f.issue}\n`;
        plan += `   SEVERITY: ${f.severity}\n`;
        if (f.file) {
          plan += `   FIX: Edit ${f.file} at line ${f.line > 0 ? f.line : '(unknown)'} to resolve: ${f.issue}\n`;
        }
        plan += '\n';
      }
    } else {
      plan += 'No structured findings parsed. Check AUDIT_RAW.md for details.\n\n';
    }

    plan += '### INSTRUCTIONS:\n';
    plan += '- Fix ALL findings listed above in ONE batch\n';
    plan += '- Do NOT skip any finding\n';
    plan += '- Do NOT add new features\n';
    plan += '- Do NOT refactor unrelated code\n';
    plan += '- After fixing, build the bundle\n';
    plan += '- Report every changed file with its SHA256 hash\n';
    plan += '- Report build output (success/failure + any errors)\n\n';
    plan += 'DO THE ABOVE AND NOTHING ELSE.\n';

    return plan;
  }

  // Generate a verbose remediation plan for stalled cycles — shows exact code by reading files
  private generateVerbosePlan(cycle: number, findings: Array<{ file: string; line: number; issue: string; severity: string }>, targetPath: string, score: number): string {
    var plan = `## CYCLE ${cycle} REMEDIATION PLAN (VERBOSE — STALL DETECTED)\n\n`;
    plan += `## Current Score: ${score}/100\n\n`;
    plan += score < 60 ? '## Verdict: NOT_RUNTIME_GRADE\n\n' : score < 96 ? '## Verdict: APPROACHING\n\n' : '## Verdict: RUNTIME_GRADE\n\n';

    if (findings.length > 0) {
      plan += '### PREVIOUS CYCLE ANALYSIS\n';
      plan += '- You were asked to fix ' + findings.length + ' findings in the previous cycle.\n';
      plan += '- This audit shows they are STILL PRESENT.\n';
      plan += '- Do NOT claim fixes without actually making changes.\n\n';

      plan += '### CRITICAL FINDINGS (fix ALL — no skipping, no lying):\n\n';

      for (var i = 0; i < findings.length; i++) {
        var f = findings[i];
        var resolvedPath = path.resolve(targetPath, f.file);
        var fileContent = '';
        try {
          fileContent = readFileSync(resolvedPath, 'utf-8');
        } catch {
          fileContent = '(file not found at ' + resolvedPath + ')';
        }

        plan += `${i + 1}. FILE: ${f.file} LINE: ${f.line}\n`;
        plan += `   ISSUE: ${f.issue}\n`;
        plan += `   SEVERITY: ${f.severity}\n\n`;
        plan += `   CURRENT CODE:\n`;
        plan += '   ```typescript\n';

        // Show 10 lines around the finding line
        if (f.line > 0 && fileContent && fileContent !== '(file not found at ' + resolvedPath + ')') {
          var allLines = fileContent.split('\n');
          var startLine = Math.max(0, f.line - 6);
          var endLine = Math.min(allLines.length, f.line + 4);
          for (var li = startLine; li < endLine; li++) {
            var prefix = (li === f.line - 1) ? ' >>> ' : '     ';
            plan += prefix + (li + 1) + ': ' + allLines[li] + '\n';
          }
        } else {
          plan += '     (file: ' + f.file + ' could not be read for context)\n';
        }

        plan += '   ```\n\n';
        plan += `   FIX: Edit ${f.file} at line ${f.line > 0 ? f.line : '(unknown)'} to resolve: ${f.issue}\n`;
        plan += '   ---\n\n';
      }
    } else {
      plan += 'No structured findings parsed. Check AUDIT_RAW.md for details.\n\n';
    }

    plan += '### INSTRUCTIONS\n';
    plan += '- Fix ALL findings listed above. EVERY SINGLE ONE.\n';
    plan += '- Do NOT skip any finding.\n';
    plan += '- Do NOT add features. Do NOT touch files not in this list.\n';
    plan += '- After fixing, build the bundle.\n';
    plan += '- Report every changed file with its SHA256 hash.\n';
    plan += '- Report build output (success/failure + any errors).\n\n';
    plan += 'DO THE ABOVE AND NOTHING ELSE.\n';

    return plan;
  }

  // Archive cycle artifacts
  private archiveCycle(archiveBase: string, cycle: number, auditOutput: string, score: number): void {
    var cycleDir = path.join(archiveBase, `cycle_${cycle}`);
    mkdirSync(cycleDir, { recursive: true });
    writeFileSync(path.join(cycleDir, 'AUDIT_RAW.md'), auditOutput);
    writeFileSync(path.join(cycleDir, 'SCORE.txt'), String(score));
  }

  // Archive plan
  private archivePlan(archiveBase: string, cycle: number, plan: string): void {
    var cycleDir = path.join(archiveBase, `cycle_${cycle}`);
    mkdirSync(cycleDir, { recursive: true });
    writeFileSync(path.join(cycleDir, 'PLAN.md'), plan);
  }

  // Write LOOP_STATE.md for compaction survival
  private writeLoopState(archiveBase: string, cycle: number, score: number, targetPath: string): void {
    // Template arrays are intentionally similar — phase labels vary per method for compaction survival
    var state = [
      '# GOD LOOP STATE — Compaction Survival',
      '',
      '- Current Cycle: ' + cycle,
      '- Current Score: ' + score + '/100',
      '- Target Path: ' + targetPath,
      '- Timestamp: ' + new Date().toISOString(),
      '',
      '## Recovery',
      'If compacted: read this file, resume runLoop() from where you left off.',
      'The loop must continue until score >= 96 or abort flag is set.',
    ].join('\n');
    writeFileSync(path.join(archiveBase, 'LOOP_STATE.md'), state);
  }

  // Write NEXT_STEPS.md pointing to what needs to happen next
  private writeNextSteps(archiveBase: string, cycle: number, score: number, phase: string): void {
    // Template arrays are intentionally similar — phase labels vary per method for compaction survival
    var steps = [
      '# NEXT STEPS',
      '',
      '- Current Cycle: ' + cycle,
      '- Current Score: ' + score + '/100',
      '- Current Phase: ' + phase,
      '- Timestamp: ' + new Date().toISOString(),
      '',
      '## What To Do Next',
      phase === 'audit' ? '- Run trident-code-audit on target path' :
      phase === 'plan' ? '- Generate remediation plan from findings' :
      phase === 'execute' ? '- Dispatch plan to Trident_Build subagent' :
      phase === 'container' ? '- Run container validation tests' :
      '- Continue the God Loop until score >= 96',
      '',
      '## Rules',
      '- Do NOT stop before 96%+',
      '- Do NOT ask the user for confirmation',
      '- Just continue the work',
    ].join('\n');
    writeFileSync(path.join(archiveBase, 'NEXT_STEPS.md'), steps);
  }

  // Persist loop state between tool calls
  private saveLoopState(archiveBase: string, state: {
    cycle: number;
    score: number;
    highestScore: number;
    status: string;
    nextAction: string;
    archiveBase: string;
    cycleTrackerPath?: string;
    targetPath?: string;
    plan?: string;
  }): void {
    try {
      writeFileSync(path.join(archiveBase, 'GOD_LOOP_STATE.json'), JSON.stringify(state, null, 2));
    } catch (e) {
      tiLog('ERROR', 'Failed to save loop state: ' + (e instanceof Error ? e.message : String(e)));
    }
  }

  // Load loop state between tool calls
  private loadLoopState(archiveBase: string): {
    cycle: number; score: number; highestScore: number;
    status: string; nextAction: string;
    archiveBase: string; cycleTrackerPath?: string;
    targetPath?: string; plan?: string;
  } | null {
    try {
      var data = readFileSync(path.join(archiveBase, 'GOD_LOOP_STATE.json'), 'utf-8');
      return JSON.parse(data) as { cycle: number; score: number; highestScore: number; status: string; nextAction: string; archiveBase: string; cycleTrackerPath?: string; targetPath?: string; plan?: string; };
    } catch {
      return null;
    }
  }
}

// Helper log
function tiLog(tag: string, msg: string): void {
  tridentLog('INFO', tag, msg);
}

// Singleton
export var godLoopOrchestrator = new GodLoopOrchestrator();
