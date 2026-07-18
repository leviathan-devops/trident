// @ts-ignore
import { tool } from '@opencode-ai/plugin';
import { z } from 'zod';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as crypto from 'crypto';
import { tridentLog } from '../utils.js';
import { orchestrator } from '../orchestrator.js';
import { AuditEngine } from '../audit-engine/index.js';
import type { AuditFinding } from '../audit-engine/types.js';
import { generateCodeReviewArtifact } from '../artifacts/code-review-artifact.ts';
import { generateLayer1InitialPlan, generateLayer2DetailedWorkflow, generateContextLibraryManifest, generateContextBrief, buildLayer1Prompt } from '../artifacts/deep-planning-artifact.ts';
import { generatePipelineSpec } from '../artifacts/pipeline-generator.ts';
import { analyzeProject } from '../artifacts/analysis-engine.ts';
import { classifyProject } from '../audit-engine/code-classifier.ts';
import type { ProblemContext } from '../poseidon/problem-solver.js';
import { generateT1Injectable, generateT2Artifact } from '../artifacts/context-synthesis-artifact.ts';
import { contextSynthesisEngine } from '../modes/context-synthesis-engine.js';
import * as fsSync from 'fs';
import { TRIDENT_CONFIG } from '../config.js';
import { deepPlanningModule } from '../modes/deep-planning.js';
import { contextSynthesisModule } from '../modes/context-synthesis.js';
// trident-vision REMOVED — replaced by zai-vision_* and visual-cortex_* MCP tools
import { tridentPoseidonTool } from './trident-poseidon.js';
import { godLoopOrchestrator } from '../poseidon/god-loop.js';
import { discoverProject, type DiscoveryResult, type DiscoveredPattern, type DiscoveredFailure, type DiscoveredDecision } from '../shared/auto-discover.js';
import { interpret } from 'xstate';
import { deepPlanningMachine } from '../fsm/deep-planning-machine.js';
import { contextSynthesisMachine } from '../fsm/context-synthesis-machine.js';
import { TsProgramWrapper } from '../warheads/ts-compiler-api/index.js';
import type { AnalyzerResult } from '../warheads/ts-compiler-api/program.js';
import { P1P10Verification } from '../warheads/p1-p10-scanner/index.js';
import { deriveFullStrategy, getDefaultStrategy, type L2Strategy } from '../artifacts/l2-strategy.ts';
import { buildBrief, readSourceFiles, appendComplianceAndAppendix, formatDeepeningFeedback, formatAuditFeedback } from '../artifacts/l2-brief-builder.ts';
import { runDeepeningChecks, runCrossSectionAudit, type DeepeningResult, type CrossSectionAuditResult } from '../artifacts/l2-quality-audit.ts';
import { REFERENCE_EXCERPTS } from '../artifacts/l2-reference-library.ts';
import { generateSpecViaLLM, generateSpecViaLLMAsync, setClientGetter } from '../artifacts/l2-llm-generator.ts';
import { runInternalLLMLoop } from '../artifacts/shared-llm-loop.ts';
import { buildL1Brief } from '../artifacts/l1-brief-builder.ts';
import { buildT1Brief } from '../artifacts/t1-brief-builder.ts';
import { buildT2Brief } from '../artifacts/t2-brief-builder.ts';
import { detectEngineDomains, scopeAnalysisToDomain } from '../artifacts/l3-engine-discoverer.ts';
import { setPendingDispatch, setPendingL1Path } from '../hooks/agent-state.js';

// M7: No shared singleton — create fresh AuditEngine per invocation
// M3: Wire completeLayer/failLayer for state machine hardening

// ═══ L2 DESIGN MODE HELPERS ═══

/**
 * Extract the most important terms from a requirements string.
 * Used by the topic alignment quality gate to verify the LLM output
 * matches what was asked for.
 *
 * Strategy: Find domain-specific capitalized words, CamelCase identifiers,
 * and key nouns that appear in the requirements. Filter out common words.
 */
function extractKeyTerms(requirements: string): string[] {
  const STOP_WORDS = new Set([
    'the', 'and', 'for', 'with', 'that', 'this', 'from', 'are', 'was', 'were',
    'have', 'has', 'will', 'can', 'not', 'but', 'all', 'any', 'new', 'use',
    'must', 'should', 'system', 'tool', 'agent', 'engine', 'layer', 'phase',
    'step', 'section', 'build', 'spec', 'output', 'input', 'file', 'code',
  ]);

  const terms = new Set<string>();

  // Strategy 1: CamelCase identifiers (WarheadNode, ContextMatcher, etc.)
  const camelCase = requirements.match(/\b[A-Z][a-z]+[A-Z][a-zA-Z]*\b/g) || [];
  for (const term of camelCase) {
    if (term.length > 3) terms.add(term);
  }

  // Strategy 2: ALL_CAPS constants
  const allCaps = requirements.match(/\b[A-Z]{2,}[A-Z_]*\b/g) || [];
  for (const term of allCaps) {
    if (term.length > 2 && term !== 'API' && term !== 'TUI' && term !== 'LLM') terms.add(term);
  }

  // Strategy 3: Key nouns — words that appear multiple times in requirements
  const words = requirements.toLowerCase().split(/[^a-z]+/);
  const wordCounts: Record<string, number> = {};
  for (const word of words) {
    if (word.length < 4 || STOP_WORDS.has(word)) continue;
    wordCounts[word] = (wordCounts[word] || 0) + 1;
  }
  // Words appearing 2+ times are likely key terms
  for (const [word, count] of Object.entries(wordCounts)) {
    if (count >= 2) terms.add(word);
  }

  // Strategy 4: Words from quoted strings
  const quoted = requirements.match(/"([^"]{3,30})"/g) || [];
  for (const q of quoted) {
    const inner = q.replace(/"/g, '').toLowerCase();
    if (inner.length > 3 && !STOP_WORDS.has(inner)) terms.add(inner);
  }

  // Return top 8 terms (sorted by length descending — longer terms are more specific)
  const result = [...terms].sort((a, b) => b.length - a.length).slice(0, 8);
  return result.length > 0 ? result : [];
}

/**
 * Build a brief for design mode — requirements are PRIMARY directive.
 * Unlike audit mode (which leads with codebase analysis), design mode
 * leads with what the user wants to build, using contextFiles as reference.
 */
function buildDesignBrief(
  args: Record<string, any>,
  sourceExtracts: Map<string, string>,
  strategy: any,
  projectName: string,
): string {
  const L: string[] = [];

  L.push(`# BUILD SPEC: ${projectName}`);
  L.push('');
  L.push('## PRIMARY DIRECTIVE — What This Spec Must Cover');
  L.push('');
  L.push(args.requirements || 'No requirements provided.');
  L.push('');

  // Architecture
  if (args.architecture) {
    L.push('## Architecture (provided by user)');
    L.push('');
    L.push(args.architecture);
    L.push('');
  }

  // Data model
  if (args.dataModel) {
    L.push('## Data Model (provided by user)');
    L.push('');
    L.push(args.dataModel);
    L.push('');
  }

  // Engine design
  if (args.engineDesign) {
    L.push('## Engine Design (provided by user)');
    L.push('');
    L.push(args.engineDesign);
    L.push('');
  }

  // Defense rules
  if (args.defenseRules && args.defenseRules.length > 0) {
    L.push('## Defense Rules (provided by user)');
    L.push('');
    for (const rule of args.defenseRules) {
      L.push(`- ${rule}`);
    }
    L.push('');
  }

  // Integration plan
  if (args.integrationPlan) {
    L.push('## Integration Plan (provided by user)');
    L.push('');
    L.push(args.integrationPlan);
    L.push('');
  }

  // Test specs
  if (args.testSpecs) {
    L.push('## Test Specifications (provided by user)');
    L.push('');
    L.push(args.testSpecs);
    L.push('');
  }

  // Migration strategy
  if (args.migrationStrategy) {
    L.push('## Migration Strategy (provided by user)');
    L.push('');
    L.push(args.migrationStrategy);
    L.push('');
  }

  // Blind spots
  if (args.blindSpots) {
    L.push('## Blind Spots (provided by user)');
    L.push('');
    L.push(args.blindSpots);
    L.push('');
  }

  // Reference source files (CONTEXT, not analysis target)
  if (sourceExtracts.size > 0) {
    L.push('## REFERENCE MATERIAL (context — do NOT analyze these as codebases to audit)');
    L.push('');
    L.push('The following source files are REFERENCE for your design. Use them to understand');
    L.push('existing patterns, interfaces, and architecture. Do NOT write a spec ABOUT these files.');
    L.push('Write a spec FOR the system described in the PRIMARY DIRECTIVE above.');
    L.push('');
    for (const [filePath, content] of sourceExtracts) {
      L.push(`### Reference: ${path.basename(filePath)}`);
      L.push('```');
      // Truncate large files to avoid overwhelming the brief
      L.push(content.length > 3000 ? content.substring(0, 3000) + '\n... (truncated)' : content);
      L.push('```');
      L.push('');
    }
  }

  // Generation instructions — L2 engineering spec format
  L.push('## GENERATION INSTRUCTIONS');
  L.push('');
  L.push('Write a COMPLETE engineering spec for the system described in the PRIMARY DIRECTIVE.');
  L.push('The spec MUST cover the topic described in PRIMARY DIRECTIVE — do NOT drift to other topics.');
  L.push('Use the user-provided sections above as the spec content structure.');
  L.push('Include: Executive Summary, Architecture, Data Model, Engine Class, Defense Rules,');
  L.push('Algorithm Specs, Test Specs, Integration, Compliance Matrix, What This Spec Does NOT Cover.');
  L.push('60%+ TypeScript code blocks. Real implementations, not pseudocode.');
  L.push('Maximum 5000 lines. Output ONLY the spec document.');
  L.push('');
  L.push('## THRESHOLD RATIONALE REQUIREMENT (CRITICAL)');
  L.push('');
  L.push('Every numeric threshold, constant, limit, and cutoff in this spec MUST include a');
  L.push('"BECAUSE" paragraph explaining the engineering reasoning for that specific value.');
  L.push('');
  L.push('Format:');
  L.push('  threshold = X BECAUSE [specific engineering reasoning — what failure mode');
  L.push('  occurs at X-0.1, what false positives occur at X+0.1, what analysis or data');
  L.push('  supports choosing X over alternatives]');
  L.push('');
  L.push('Examples:');
  L.push('  passThreshold = 0.7 BECAUSE agents below 70% alignment introduce 3x more defects.');
  L.push('  Analysis of 50 build sessions shows defect rate correlates with alignment');
  L.push('  score at r=0.82. Below 0.7, false-negative rate exceeds 15%. Above 0.8,');
  L.push('  false-positive rate exceeds 20% (legitimate exploration flagged as drift).');
  L.push('');
  L.push('  windowSize = 10 BECAUSE windows <8 produce excessive noise (single outlier');
  L.push('  dominates distribution). Windows >15 introduce lag (agent has already moved');
  L.push('  to next phase before stagnation is detected).');
  L.push('');
  L.push('A threshold WITHOUT a BECAUSE paragraph is a DEFECT. The build agent cannot');
  L.push('tune, validate, or understand thresholds without the reasoning. Every threshold');
  L.push('must answer: "Why this value and not something else?"');
  L.push('');

  return L.join('\n');
}

// ═══ L1 CONTENT GENERATOR BRIEF ═══
// L1 is a <800 line chat prompt / content generator. NOT an engineering spec.
// Takes requirements + reference docs and generates whatever content is asked for.
// Can produce: deployment guides, subagent prompts, context docs, behavior alignment, etc.

function buildL1ContentBrief(
  args: Record<string, any>,
  sourceExtracts: Map<string, string>,
  projectName: string,
): string {
  const L: string[] = [];

  L.push(`# CONTENT GENERATION TASK: ${projectName}`);
  L.push('');

  // FIRST-HAND CONTEXT — this is the PRIMARY source of truth
  if (args.context && args.context.length > 10) {
    L.push('## PRIMARY FIRST-HAND CONTEXT — SOURCE OF TRUTH');
    L.push('');
    L.push('The following is first-hand knowledge from the agent that called this tool.');
    L.push('EVERY name, file, component, gate, tier, and structure mentioned below is REAL and ACTUAL.');
    L.push('You MUST use ONLY these names and structures in your output.');
    L.push('NEVER invent alternative names, fictional scripts, fictional gates, or idealized architectures.');
    L.push('If the context says the system has 7 circuit breaker checks, write about 7 — NOT 8.');
    L.push('If the context says scripts are named deploy.sh, write deploy.sh — NOT 01-inject-artifacts.sh.');
    L.push('');
    L.push(args.context);
    L.push('');
  }

  // Key facts — must appear verbatim
  if (args.keyFacts && args.keyFacts.length > 0) {
    L.push('## KEY FACTS — MUST APPEAR IN OUTPUT');
    L.push('');
    for (const fact of args.keyFacts) {
      L.push(`- ${fact}`);
    }
    L.push('');
  }

  // What to generate
  L.push('## WHAT TO GENERATE');
  L.push('');
  L.push(args.requirements || 'No requirements specified. Generate based on context and reference material below.');
  L.push('');

  // Inline parameters (if provided)
  if (args.architecture) {
    L.push('## ARCHITECTURE CONTEXT');
    L.push(args.architecture);
    L.push('');
  }
  if (args.dataModel) {
    L.push('## DATA MODEL CONTEXT');
    L.push(args.dataModel);
    L.push('');
  }
  if (args.integrationPlan) {
    L.push('## INTEGRATION CONTEXT');
    L.push(args.integrationPlan);
    L.push('');
  }

  // Reference material
  if (sourceExtracts.size > 0) {
    L.push('## REFERENCE MATERIAL');
    L.push('');
    L.push('Use the following as reference. Synthesize into the output. Do NOT copy verbatim.');
    L.push('');
    for (const [filePath, content] of sourceExtracts) {
      const truncated = content.length > 3000 ? content.substring(0, 3000) + '\n... (truncated)' : content;
      L.push(`### ${path.basename(filePath)}`);
      L.push('```');
      L.push(truncated);
      L.push('```');
      L.push('');
    }
  }

  // Format — L1 specific, NOT L2 structure
  L.push('## FORMAT');
  L.push('');
  L.push('Generate the content described in WHAT TO GENERATE above.');
  L.push('Target 200-800 lines depending on task complexity. Maximum 1500 lines. No imposed section structure.');
  L.push('The output format depends entirely on what the requirements ask for.');
  L.push('If asked for a guide → write a guide. If asked for a prompt → write a prompt.');
  L.push('If asked for a checklist → write a checklist.');
  L.push('Use the reference material to inform and enrich the output.');
  L.push('Output ONLY the requested content. No preamble. No meta-commentary.');
  L.push('');

  return L.join('\n');
}

// ═══ PROBLEM SOLVING BRIEF ═══
// PS is an LLM-powered diagnostic tool — same architecture as L1.
// Reads actual source code, builds a brief, LLM produces comprehensive analysis.

function buildProblemSolvingBrief(
  problem: string,
  sourceExtracts: Map<string, string>,
  findings: string[],
  reasoning: string[],
  projectName: string,
): string {
  const L: string[] = [];

  L.push(`# PROBLEM SOLVING TASK: ${projectName}`);
  L.push('');

  L.push('## PROBLEM');
  L.push('');
  L.push(problem);
  L.push('');

  if (reasoning && reasoning.length > 0) {
    L.push('## REASONING CHAIN (user-provided context)');
    L.push('');
    for (const r of reasoning) {
      L.push(`- ${r}`);
    }
    L.push('');
  }

  if (findings && findings.length > 0) {
    L.push('## KNOWN FINDINGS (from audit or prior analysis)');
    L.push('');
    for (const f of findings) {
      L.push(`- ${f}`);
    }
    L.push('');
  }

  if (sourceExtracts.size > 0) {
    L.push('## SOURCE CODE (read this carefully — trace root causes to specific lines)');
    L.push('');
    for (const [file, code] of sourceExtracts) {
      const truncated = code.length > 4000 ? code.substring(0, 4000) + '\n... (truncated)' : code;
      L.push(`### ${file}`);
      L.push('```typescript');
      L.push(truncated);
      L.push('```');
      L.push('');
    }
  }

  L.push('## OUTPUT FORMAT');
  L.push('');
  L.push('Produce a comprehensive diagnostic analysis. Structure:');
  L.push('');
  L.push('1. **Classification**: Is this a question, task, or plan-first?');
  L.push('2. **Root Cause Analysis**: Trace the problem to its fundamental cause.');
  L.push('   Ask "why?" repeatedly. Each answer MUST cite specific file:line from the source code above.');
  L.push('   Do NOT say "insufficient evidence" — the code is right there. Read it and analyze it.');
  L.push('3. **Evidence**: List every code pattern that contributes to the problem, with file:line citations.');
  L.push('4. **Fix Strategy**: Prioritized phases. Each fix references exact file:line and what to change.');
  L.push('   Include the corrected code for each fix.');
  L.push('5. **Risk Assessment**: What could break? Blast radius of each fix?');
  L.push('6. **Verification Plan**: How to verify each fix worked.');
  L.push('');
  L.push('Target 300-800 lines. Every claim must cite file:line. No template phrases.');
  L.push('Output ONLY the analysis. No preamble. No meta-commentary.');

  return L.join('\n');
}

// ═══ T1 INJECTABLE BRIEF ═══
// T1 is a 150-350 line operational protocol — NOT an engineering spec.
// Format: dense bullets, correct/wrong pairs, troubleshooting, lookup tables.
// Battle-scarred, imperative, zero theory. Agent reads this and knows EXACTLY what to do.

function buildT1InjectableBrief(
  args: Record<string, any>,
  sourceExtracts: Map<string, string>,
  projectName: string,
): string {
  const L: string[] = [];

  L.push(`# T1 INJECTABLE GENERATION: ${projectName}`);
  L.push('');

  // What this injectable covers
  L.push('## WHAT THIS INJECTABLE COVERS');
  L.push('');
  L.push(args.requirements || `Operational protocol for ${projectName}.`);
  L.push('');

  // Reference material
  if (sourceExtracts.size > 0) {
    L.push('## REFERENCE MATERIAL');
    L.push('');
    L.push('Mine the following for rules, patterns, gotchas, and failure modes.');
    L.push('Extract the PRACTICAL knowledge — what breaks, what works, what to NEVER do.');
    L.push('');
    for (const [filePath, content] of sourceExtracts) {
      const truncated = content.length > 3000 ? content.substring(0, 3000) + '\n... (truncated)' : content;
      L.push(`### ${path.basename(filePath)}`);
      L.push('```');
      L.push(truncated);
      L.push('```');
      L.push('');
    }
  }

  // T1 format — VERY specific to injectable quality bar
  L.push('## T1 INJECTABLE FORMAT — FOLLOW EXACTLY');
  L.push('');
  L.push('Generate a T1 INJECTABLE document. This is an OPERATIONAL PROTOCOL, not an engineering spec.');
  L.push('');
  L.push('### STRUCTURE (use these sections):');
  L.push('1. **CRITICAL RULES** — Bullet list of hard ALWAYS/NEVER rules. Each rule 1-2 sentences max.');
  L.push('2. **CORRECT/WRONG PAIRS** — For every key rule, show ✅ CORRECT and ❌ WRONG code example.');
  L.push('3. **STEP-BY-STEP PROCEDURES** — Numbered steps with exact bash/python commands. Copy-paste-ready.');
  L.push('4. **TROUBLESHOOTING MATRIX** — Table or bullet list: error → cause → fix.');
  L.push('5. **QUICK REFERENCE** — Compact lookup table at the end with key facts.');
  L.push('');
  L.push('### QUALITY BAR:');
  L.push('- 150-600 lines depending on complexity. Every line must earn its place.');
  L.push('- Dense. Zero fluff. Zero theory. Zero explanation of WHY.');
  L.push('- Imperative tone: ALWAYS, NEVER, MUST, FORBIDDEN.');
  L.push('- Battle-scarred: write from accumulated failures, not first principles.');
  L.push('- Copy-paste code blocks must be RUNNABLE as-is.');
  L.push('- An agent reads this and knows EXACTLY what to do — no ambiguity.');
  L.push('');
  L.push('### FORBIDDEN:');
  L.push('- NO Executive Summary, Architecture, Data Model, or any L2-style sections.');
  L.push('- NO trade-off analysis, alternative comparison, or design justification.');
  L.push('- NO prose paragraphs longer than 2 sentences.');
  L.push('- NO pseudocode — only real runnable commands.');
  L.push('- NO "implement actual logic" or other template phrases.');
  L.push('');
  L.push('Output ONLY the T1 injectable document.');
  L.push('');

  return L.join('\n');
}

// FINDING #10 FIX: Async readFile instead of sync readFileSync

/** Collect all .ts/.js source files from a directory (recursive, max 50). */
async function collectSourceFiles(dir: string): Promise<string[]> {
  const results: string[] = [];
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (results.length >= 50) break;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.git') continue;
        const sub = await collectSourceFiles(fullPath);
        results.push(...sub);
      } else if (entry.name.endsWith('.ts') || entry.name.endsWith('.js') || entry.name.endsWith('.md')) {
        results.push(fullPath);
      }
    }
  } catch (e) { tridentLog('WARN', 'trident-tools', 'Non-fatal error: ' + (e instanceof Error ? e.message : String(e))); }
  return results;
}
async function resolveProjectName(targetPath: string): Promise<string> {
  try {
    const pkgPath = path.join(targetPath, 'package.json');
    const content = await fs.readFile(pkgPath, 'utf-8');
    const pkg = JSON.parse(content) as { name?: string };
    if (pkg?.name) return pkg.name;
  } catch (e: unknown) {
    tridentLog('WARN', 'trident-tools', `resolveProjectName: no package.json at ${targetPath}`);
  }
  return path.basename(targetPath) || 'unnamed-project';
}

// FINDING #5 FIX: Write artifact .md files to disk so they survive session end
// ARTIFACT STORAGE POLICY: ALL artifacts go to GENERATED_ARTIFACTS/{modeFolder}/
// Names are SEMANTIC — extracted from the first H1 heading in the content
const ARTIFACTS_BASE = TRIDENT_CONFIG.artifactsBase;

const MODE_FOLDERS: Record<string, string> = {
  CODE_REVIEW: 'CODE_REVIEW',
  DP_L2_SPEC: 'DP_L2_SPEC',
  DP_L1_CONTENT: 'DP_L1_CONTENT',
  DP_L3_LIBRARY: 'DP_L3_LIBRARY',
  PROBLEM_SOLVING: 'PROBLEM_SOLVING',
  CS_T1_INJECTABLE: 'CS_T1_INJECTABLE',
  CS_T2_KNOWLEDGE: 'CS_T2_KNOWLEDGE',
};

function extractSemanticName(content: string, modeFolder: string): string {
  // Strategy 1: Extract first # H1 heading from the markdown content
  const h1Match = content.match(/^#\s+(.+)$/m);
  if (h1Match) {
    let name = h1Match[1].trim()
      .replace(/\*\*/g, '')           // remove bold markers
      .replace(/[`'"“”]/g, '')         // remove quotes
      .replace(/[—–-]+/g, '_')         // replace dashes with underscore
      .replace(/[^a-zA-Z0-9_ ]/g, '') // remove other special chars
      .trim()
      .replace(/\s+/g, '_')           // spaces to underscores
      .replace(/_+/g, '_')            // collapse multiple underscores
      .replace(/^_|_$/g, '')           // trim leading/trailing underscores
      .toUpperCase();
    
    // Limit length but keep it meaningful
    if (name.length > 100) name = name.substring(0, 100);
    if (name.length >= 10) return name;
  }
  
  // Strategy 2: Look for "Project:" or "Project Name:" metadata
  const projectMatch = content.match(/\*{0,2}(?:Project|Plugin|Package)\s*Name?\s*\*{0,2}:?\s*(.+?)(?:\n|$)/i);
  if (projectMatch) {
    let name = projectMatch[1].trim()
      .replace(/[^a-zA-Z0-9_ ]/g, '')
      .trim()
      .replace(/\s+/g, '_')
      .toUpperCase();
    if (name.length > 5) return `${modeFolder}_${name}`;
  }
  
  // Strategy 3: Look for a title-like pattern in the first 200 chars
  const firstLines = content.substring(0, 200);
  const titleMatch = firstLines.match(/^[A-Z][A-Za-z0-9\s\-_]{5,60}$/m);
  if (titleMatch) {
    let name = titleMatch[0].trim().replace(/\s+/g, '_').toUpperCase();
    if (name.length > 5) return name;
  }
  
  // Strategy 4: Extract from content context — look for significant keywords
  const contextMatch = content.match(/(?:TRIDENT|Audit|Review|Plan|Spec|Build|Context|Injectable)\s*(?:\w+\s*){0,4}/i);
  if (contextMatch) {
    let name = modeFolder + '_' + contextMatch[0].trim().replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '').toUpperCase();
    if (name.length > 5) return name;
  }
  
  // Final fallback: mode folder name with a unique content hash
  const shortHash = content.length.toString(16) + '-' + content.substring(0, 20).replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  return `${modeFolder}_${shortHash}`;
}

async function fileExists(filePath: string): Promise<boolean> {
  try { await fs.access(filePath); return true; } catch { return false; }
}

async function writeArtifactFile(modeFolder: string, content: string, outputPath?: string, outputName?: string, fileName?: string): Promise<string> {
  const folder = MODE_FOLDERS[modeFolder] || modeFolder;
  // PRIORITY: outputPath + fileName → write to outputPath/fileName.md directly
  if (outputPath && fileName) {
    try {
      if (!(await fileExists(outputPath))) {
        await fs.mkdir(outputPath, { recursive: true });
      }
      const finalPath = path.join(outputPath, `${fileName}.md`);
      await fs.writeFile(finalPath, content, 'utf-8');
      tridentLog('INFO', 'trident-tools', `Artifact saved to: ${finalPath}`);
      return finalPath;
    } catch (err) {
      tridentLog('ERROR', 'trident-tools', `writeArtifactFile fileName path failed: ${(err instanceof Error ? err : new Error(String(err))).message}`);
    }
  }

  // If outputPath specified, write directly there instead of GENERATED_ARTIFACTS
  if (outputPath) {
    try {
      const dir = path.dirname(outputPath);
      if (!(await fileExists(dir))) {
        await fs.mkdir(dir, { recursive: true });
      }
      const finalPath = outputName ? path.join(dir, outputName) : outputPath;
      await fs.writeFile(finalPath, content, 'utf-8');
      tridentLog('INFO', 'trident-tools', `Artifact saved to custom path: ${finalPath}`);
      return finalPath;
    } catch (err) {
      tridentLog('ERROR', 'trident-tools', `writeArtifactFile custom path failed: ${(err instanceof Error ? err : new Error(String(err))).message}`);
      // Fall through to default behavior
    }
  }
  const artifactDir = path.join(ARTIFACTS_BASE, folder);
  try {
    if (!(await fileExists(artifactDir))) {
      await fs.mkdir(artifactDir, { recursive: true });
    }
    const semanticName = extractSemanticName(content, modeFolder);
    const fileName = `${semanticName}.md`;
    const filePath = path.join(artifactDir, fileName);

    let finalPath = filePath;
    let counter = 1;
    while (await fileExists(finalPath)) {
      finalPath = path.join(artifactDir, `${semanticName}_${counter}.md`);
      counter++;
    }

    await fs.writeFile(finalPath, content, 'utf-8');
    tridentLog('INFO', 'trident-tools', `Artifact saved: ${finalPath}`);
    return finalPath;
  } catch (err) {
    tridentLog('ERROR', 'trident-tools', `writeArtifactFile failed: ${(err instanceof Error ? err : new Error(String(err))).message}`);
    return '';
  }
}

function storeArtifacts(artifacts: Record<string, string>): void {
  for (const [key, value] of Object.entries(artifacts)) {
    orchestrator.addArtifact(key, value);
  }
}

function isBundleFile(filePath: string): boolean {
  if (filePath.includes('/dist/') || filePath.includes('/node_modules/') ||
      filePath.includes('.bundle.') || filePath.includes('.min.') ||
      filePath.endsWith('bundle.js')) {
    return true;
  }
  try {
    const fd = fsSync.openSync(filePath, 'r');
    const buffer = Buffer.alloc(256);
    const bytes = fsSync.readSync(fd, buffer, 0, 256, 0);
    fsSync.closeSync(fd);
    const sentinel = buffer.toString('utf-8', 0, bytes);
    const patterns = ['"use strict"', '(function(', 'webpackChunk', '__webpack_require__', 'let __esModule', '//# sourceMappingURL'];
    return patterns.some((p: string) => sentinel.includes(p));
  } catch (e) {
    tridentLog('DEBUG', 'trident-tools', `detectBundledSentinel failed: ${e instanceof Error ? e.message : String(e)}`);
    return false;
  }
}

function loadTridentIgnore(targetPath: string): string[] {
  const ignorePath = path.join(targetPath, '.tridentignore');
  const defaultPatterns = [
    'dist/**', 'node_modules/**', 'build/**', 'out/**',
    '.trident/**', '.manta/**', '*.js.map', '*.min.js',
    '*.bundle.*', '*.test.ts', '*.spec.ts'
  ];
  try {
    if (fsSync.existsSync(ignorePath)) {
      const content = fsSync.readFileSync(ignorePath, 'utf-8');
      const patterns = content.split('\n').map((l: string) => l.trim()).filter((l: string) => l && !l.startsWith('#'));
      return [...defaultPatterns, ...patterns];
    }
  } catch (e: unknown) {
    tridentLog('WARN', 'trident-tools', `Error: ${e instanceof Error ? e.message : String(e)}`);
    tridentLog('DEBUG', 'trident-tools', `loadTridentIgnore failed: ${e instanceof Error ? e.message : String(e)}`);
    return defaultPatterns;
  }
  return defaultPatterns;
}

function matchesIgnorePatterns(filePath: string, patterns: string[]): boolean {
  for (const pattern of patterns) {
    const regex = pattern.replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*').replace(/\?/g, '[^/]');
    if (new RegExp(regex).test(filePath)) return true;
  }
  return false;
}

function filterByConfidence<T extends { confidence?: number }>(
  findings: T[], floor: number = 0.85
): { dispatched: T[]; logged: T[]; excluded: T[] } {
  const dispatched: T[] = [];
  const logged: T[] = [];
  const excluded: T[] = [];
  for (const f of findings) {
    const conf = f.confidence ?? 1.0;
    if (conf < 0.50) excluded.push(f);
    else if (conf < floor) logged.push(f);
    else dispatched.push(f);
  }
  return { dispatched, logged, excluded };
}

function validateFindingLocation(filePath: string, line: number): boolean {
  try {
    const content = fsSync.readFileSync(filePath, 'utf-8');
    const lineCount = content.split('\n').length;
    return line >= 1 && line <= lineCount;
  } catch (e) {
    tridentLog('DEBUG', 'trident-tools', `validateFindingLocation failed for ${filePath}: ${e instanceof Error ? e.message : String(e)}`);
    return false;
  }
}

function formatValidationReport(
  validations: Array<{ layer: number; name: string; valid: boolean; missing: string[] }>,
  modeName: string
): string {
  const passCount = validations.filter((v: { layer: number; name: string; valid: boolean; missing: string[] }) => v.valid).length;
  const allValid = passCount === validations.length;
  const noneValid = passCount === 0 && validations.length > 0;

  let r = `## Mode Validation — ${modeName}\n\n`;

  // v4.4.2: No more escape hatch — report all failures, never skip
  if (noneValid) {
    r += `⚠ ALL LAYERS FAILED VALIDATION\n\n`;
  }

  r += `**Result:** ${allValid ? 'PASS' : noneValid ? 'FAIL' : 'PARTIAL'} (${passCount}/${validations.length} layers validated)\n\n`;
  r += `| Layer | Name | Status | Missing Requirements |\n`;
  r += `|-------|------|--------|---------------------|\n`;
  for (const v of validations) {
    r += `| ${v.layer} | ${v.name} | ${v.valid ? 'PASS' : (noneValid ? 'FAIL' : 'PARTIAL')} | ${v.missing.length > 0 ? v.missing.join(', ') : '—'} |\n`;
  }
  r += `\n`;
  if (!allValid) {
    r += `**Note:** Missing requirements indicate content that would benefit from more detailed input parameters.\n`;
  }
  return r;
}

// ============================================================================
// SEMANTIC DETECTION FUNCTIONS
// ============================================================================

/**
 * @deprecated The Problem solving loop replaced 6-layer pipeline. This function is kept
 * for backward compatibility but no longer called by the trident-problem-solving
 * tool. Classification is handled by the LLM diagnostic engine.
 */
function detectProblemSolvingLayer(problem: string): 1 | 2 | 3 | 4 | 5 | 6 {
  const lower = (problem || '').toLowerCase();
  if (/\b(verification|verify|test\s+result|confirm|check\s+result|pass\s+fail)\b/.test(lower)) return 6;
  if (/\b(meta.?reflection|meta.?analysis|reflect|lessons?\s+learned|what\s+went\s+wrong|self.?critique)\b/.test(lower)) return 5;
  if (/\b(gap\s*analysis|gap|discrepancy|mismatch|missing\s+vs\s+expected|delta)\b/.test(lower)) return 4;
  if (/\b(observation|observe|what\s+happened|evidence|data\s+collected|result\s+observed)\b/.test(lower)) return 3;
  if (/\b(action|plan|execute|implement|steps?\s+taken|do\s+this)\b/.test(lower)) return 2;
  if (/\b(assumption|premise|hypothesis|supposition|what\s+we\s+believe)\b/.test(lower)) return 1;
  return 1; // Default: assumption
}

/**
 * Detect context-synthesis output mode (T1 vs T2) from requirements text.
 * If text mentions T2 keywords, force T2. If T1 keywords, force T1.
 * Otherwise, fall back to the outputMode parameter.
 */
function detectContextSynthesisLayer(text: string, outputMode: string): 'T1' | 'T2' {
  // Explicit outputMode parameter ALWAYS wins. Detection text is a hint, not an override.
  if (outputMode === 'T2') return 'T2';
  if (outputMode === 'T1') return 'T1';
  const lower = (text || '').toLowerCase();
  if (/\b(t2|knowledge\s+file|bible)\b/.test(lower)) return 'T2';
  if (/\b(t1|injectable|config)\b/.test(lower)) return 'T1';
  return 'T1';  // Safe default
}

let opencodeClient: any = null;

export function getOpencodeClient(): any { return opencodeClient; }

export function createTridentTools(client?: any) {
  opencodeClient = client || null;
  setClientGetter(() => opencodeClient);
  godLoopOrchestrator.setClientGetter(() => opencodeClient);
  return {
    'trident-code-audit': tool({
      description: 'Run CODE_REVIEW mode: 3-layer pipeline (preflight → 17-layer audit R0-R16 → artifact) against a project path. Produces dense code review artifact with findings table, fix code, verification checklist.',
      args: {
        targetPath: z.string().describe('Absolute path to the project root to audit'),
        action: z.enum(['full', 'quick', 'preflight-only']).default('full').describe('Audit depth: full=preflight+17 layers+artifact, quick=17 layers+artifact, preflight-only=just tsc+build+dist'),
      },
      execute: async (args: { targetPath: string; action: 'full' | 'quick' | 'preflight-only' }) => {
        if (!(await fileExists(args.targetPath))) {
          throw new Error('targetPath does not exist: ' + args.targetPath);
        }
        // TIMEOUT WRAPPER: Promise.race prevents audit from hanging indefinitely.
        // The old setTimeout approach was BROKEN — throw inside setTimeout callback
        // does NOT abort the async function, it either crashes the process or is swallowed.
        const AUDIT_TIMEOUT_MS = 120000; // 2 minutes max
        const auditPromise = (async () => {
          orchestrator.startAudit();
          const projectName = await resolveProjectName(args.targetPath);

          // Collect supplementary findings from warhead analyzers
          const supplementaryFindings: AuditFinding[] = [];

          // TsProgramWrapper: DISABLED — creates full ts.Program which maxes CPU and freezes.
          // The AuditEngine already runs its own AST analysis. This was dead code for a reason.
          // Only enable for explicit full audits with timeout protection.
          // To re-enable: add a timeout wrapper around createProgram + runAll.

          // P1-P10 Scanner: principle verification
          if (args.targetPath) {
            try {
              const p1p10 = new P1P10Verification();
              const scanResult = p1p10.scan(args.targetPath);
              // Convert failed ScanResult[] to AuditFinding[] and merge
              for (const r of scanResult.results) {
                if (!r.passed) {
                  supplementaryFindings.push({
                    layer: 'R0-PREFLIGHT',
                    severity: 'HIGH' as const,
                    category: r.principle,
                    file: r.file,
                    line: r.line,
                    evidence: r.detail,
                    description: `${r.principle} ${r.name}: ${r.detail}`,
                    rule: r.principle,
                    confidence: 0.90,
                    constructType: null,
                    callGraphRef: null,
                    evidenceSuppressed: false,
                  });
                }
              }
              tridentLog('INFO', 'trident-tools', `P1-P10 scan: ${scanResult.score}% — contributed ${scanResult.results.filter(r => !r.passed).length} findings`);
            } catch (e: unknown) {
              tridentLog('WARN', 'trident-tools', 'P1-P10 scan failed: ' + (e instanceof Error ? e.message : String(e)));
            }
          }

          if (args.action === 'preflight-only') {
            const { runPreflight } = await import('../audit-engine/preflight.js');
            const result = await runPreflight(args.targetPath);
            return JSON.stringify({
              action: 'preflight-only',
              targetPath: args.targetPath,
              typeCheckPassed: result.typeCheckPassed,
              buildPassed: result.buildPassed,
              distExists: result.distExists,
              distIsSingleFile: result.distIsSingleFile,
              distSizeKB: (result.distSize / 1024).toFixed(1),
              sourceMapExists: result.sourceMapExists,
              findings: result.findings,
              typeCheckError: result.typeCheckError,
              buildError: result.buildError,
            }, null, 2);
          }

          if (args.action === 'full') {
            orchestrator.completeLayer();
          }

          const engine = new AuditEngine();
          let result;
          if (args.action === 'quick') {
            result = await engine.audit(args.targetPath);
          } else {
            result = await engine.auditWithPreflight(args.targetPath);
          }
          orchestrator.completeLayer();

          const rawFindings = [...result.findings, ...supplementaryFindings];
          const ignorePatterns = loadTridentIgnore(args.targetPath);
          const culledFindings = rawFindings.filter((f: AuditFinding) => {
            if (isBundleFile(f.file)) return false;
            if (matchesIgnorePatterns(f.file, ignorePatterns)) return false;
            if (!validateFindingLocation(f.file, f.line)) return false;
            return true;
          });
          const { dispatched, logged, excluded } = filterByConfidence(culledFindings, 0.85);
          tridentLog('INFO', 'trident-code-audit',
            `FP elimination: ${rawFindings.length} raw → ${excluded.length} excluded (ignore/bundle/location) → ${logged.length} filtered (confidence <0.85) → ${dispatched.length} dispatched`);
          result.findings = dispatched;

          const artifact = generateCodeReviewArtifact(result, args.targetPath, projectName, '');
          const mdPath = await writeArtifactFile('CODE_REVIEW', artifact);
          storeArtifacts({
            'code-review': artifact,
            'artifact-path': mdPath,
            'raw-audit-result': JSON.stringify({ score: result.score, grade: result.grade, findings: result.findings.length }),
          });

          // Validation failure is a WARNING, not an error — do not put machine in ERROR state

          return artifact + (mdPath ? `\n\n---\n📄 Artifact saved: \`${mdPath}\`` : '');
        })();

        // Race the audit against a hard timeout.
        // If the audit hangs (e.g. ts.createProgram blocking event loop),
        // this will reject and return an error to the model instead of freezing forever.
        const timeoutPromise = new Promise<never>((_, reject) => {
          const t = setTimeout(() => reject(new Error('[TIMEOUT] Code audit exceeded 120 seconds — likely ts.createProgram hang on large project')), AUDIT_TIMEOUT_MS);
          t.unref(); // Don't keep process alive just for timeout
        });

        try {
          return await Promise.race([auditPromise, timeoutPromise]);
        } catch (err: unknown) {
          const errorId = `AUDIT-ERR-${Date.now()}`;
          const errMsg = err instanceof Error ? err.message : String(err);
          tridentLog('ERROR', 'trident-code-audit', `[${errorId}] ${errMsg}`);
          return JSON.stringify({
            error: 'Code audit failed or timed out',
            errorId,
            message: errMsg,
            targetPath: args.targetPath,
          }, null, 2);
        }
      },
    }),

    'trident-deep-planning': tool({
      description: 'Run DEEP_PLANNING mode: 3-layer pipeline (Initial Plan → Detailed Workflow → Context Library). Validates output against DeepPlanningModule requirements at each layer. Produces Build Spec + Context Library Manifest.',
      args: {
        targetPath: z.string().optional().describe('Absolute path to project root. Source files are read as REFERENCE material for the spec. The tool does NOT audit or analyze this code — it reads it as context.'),
        requirements: z.string().optional().describe('PRIMARY input. What system to design and build. The spec will be generated from these requirements using contextFiles as reference material.'),
        architecture: z.string().optional().describe('Architecture description for the spec'),
        patterns: z.array(z.string()).optional().describe('Known patterns to include in context library (merged with auto-discovered patterns)'),
        failures: z.array(z.string()).optional().describe('Known failure modes to document (merged with auto-discovered failures)'),
        decisions: z.array(z.string()).optional().describe('Design decisions already made (merged with auto-discovered decisions)'),
        layer: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional().describe('Explicit layer override: 1=Initial Plan, 2=Detailed Workflow, 3=Context Library (auto-detected from requirements if omitted)'),
        context: z.string().describe('MANDATORY: First-hand context from the calling agent. Paste actual file names, actual architecture, actual implementation details. The LLM uses this as PRIMARY source of truth and will NOT invent alternatives.'),
        keyFacts: z.array(z.string()).optional().describe('Critical facts that MUST appear in the output verbatim'),
        outputPath: z.string().describe('MANDATORY: Absolute directory path where the artifact .md file must be written.'),
        fileName: z.string().optional().describe('Output filename WITHOUT extension. Example: "FULL_BUILD_REPORT" → writes FULL_BUILD_REPORT.md. The agent MUST provide this.'),
        outputName: z.string().optional().describe('DEPRECATED: Use fileName instead.'),
        contextFiles: z.array(z.string()).optional().describe('MANDATORY for L2/L3 when generating from external source code. Absolute paths to ALL source files the tool must read before generating. The tool reads each file, extracts TypeScript interfaces/classes/functions/algorithms, and returns a STRUCTURED BRIEF that tells the agent exactly what to write in each spec section. Without this, the tool can only template-fill from the section parameters below.'),

        // FULL MARKDOWN SECTIONS — agent writes complete engineering content:
        executiveSummary: z.string().optional().describe('Full markdown for Executive Summary section. Write complete paragraphs with engineering reasoning. Include problem statement, failure analysis, and solution approach.'),
        architectureOverview: z.string().optional().describe('Full markdown for Architecture section. Include ASCII diagrams, execution model, design rationale with full paragraphs.'),
        dataModel: z.string().optional().describe('Full markdown for Data Model section. Include complete TypeScript interface definitions with field-by-field rationale.'),
        engineDesign: z.string().optional().describe('Full markdown for Engine Class Design. Include complete TypeScript class skeletons with method bodies, constructor injection, lifecycle hooks.'),
        defenseRules: z.array(z.string()).optional().describe('Full markdown for EACH defense rule section. One string per rule. Each must include: purpose, algorithm with pseudocode, implementation TypeScript, worked example with numbered steps.'),
        blindSpots: z.string().optional().describe('Full markdown for Blind Spot Reporting. Honest analysis of what the engine cannot detect and why.'),
        integrationPlan: z.string().optional().describe('Full markdown for Integration section. Import paths, hook registration, orchestrator wiring with TypeScript code.'),
        evidenceFormat: z.string().optional().describe('Full markdown for Evidence Output Format. JSON schema, field table, sample output.'),
        testSpecs: z.string().optional().describe('Full markdown for Test Specifications. Negative and positive tests per rule.'),
        migrationStrategy: z.string().optional().describe('Full markdown for Migration Strategy. Phased rollout with rollback conditions.'),
        engineSpecs: z.array(z.string()).optional().describe('Full markdown, one per engine (L3 recursive mode). Each is a complete L2 spec for that engine.'),
        recursive: z.boolean().optional().describe('L3 recursive mode: generate per-engine specs + structural docs (MASTER_BIBLE, CROSS_REFERENCE_INDEX, README)'),
      },
      execute: async (args: {
        targetPath?: string;
        requirements?: string;
        architecture?: string;
        patterns?: string[];
        failures?: string[];
        decisions?: string[];
        layer?: number;
        contextFiles?: string[];
        outputPath?: string;
        executiveSummary?: string;
        architectureOverview?: string;
        dataModel?: string;
        engineDesign?: string;
        defenseRules?: string[];
        blindSpots?: string;
        integrationPlan?: string;
        evidenceFormat?: string;
        testSpecs?: string;
        migrationStrategy?: string;
        engineSpecs?: string[];
        recursive?: boolean;
      }) => {
        // Validate targetPath if provided
        if (args.targetPath && !(await fileExists(args.targetPath))) {
          throw new Error('targetPath does not exist: ' + args.targetPath);
        }

        try {
          // Step 1: Layer determination — default to L1 (content generation).
          // L1 is the most common layer. L2/L3 require explicit layer=2 or layer=3.
          const layer = args.layer || 1;
          const layerNames: Record<number, string> = {
            1: 'INITIAL PROMPT',
            2: 'DETAILED WORKFLOW (Implementation Build Spec)',
            3: 'CONTEXT LIBRARY',
          };

          // Update orchestrator state non-blocking (startMode — no longer throws)
          try { orchestrator.startPlanning(); } catch (e: unknown) { tridentLog('WARN', 'trident-tools', `Error: ${e instanceof Error ? e.message : String(e)}`); /* Non-fatal: orchestrator state update is best-effort; deep-planning continues regardless of state machine errors */ }
          const machineActor = interpret(deepPlanningMachine).start();
          const projectName = args.targetPath
            ? await resolveProjectName(args.targetPath)
            : (args.requirements?.substring(0, 30).replace(/[^a-zA-Z0-9]/g, '-') || 'project');

          // Auto-discovery — only if targetPath is provided
          let discovery: DiscoveryResult | null = null;
          if (args.targetPath) {
            try {
              discovery = await discoverProject(args.targetPath);
              tridentLog('INFO', 'trident-deep-planning', `Auto-discovery: ${discovery.totalFiles} files, ${discovery.totalLines} lines, ${discovery.patterns.length} patterns, ${discovery.failureModes.length} failure modes, ${discovery.decisions.length} decisions`);
            } catch (e: unknown) {
              tridentLog('WARN', 'trident-tools', `Error: ${e instanceof Error ? e.message : String(e)}`);
              tridentLog('WARN', 'trident-deep-planning', `Auto-discovery failed (falling back to user input): ${e instanceof Error ? e.message : String(e)}`);
            }
          }

          // Auto-generate requirements/architecture (from discovery in backward mode, from args in forward mode)
          const inputParams = args.requirements || (discovery
            ? `Auto-discovered project: ${discovery.totalFiles} files, ${discovery.totalLines} lines across ${Object.keys(discovery.languages).length} languages. Entry points: ${discovery.entryPoints.join(', ') || 'none detected'}. Languages: ${Object.entries(discovery.languages).map(([k, v]: [string, number]) => `${k} (${v} files)`).join(', ')}.`
            : 'No requirements specified.');

          const architecture = args.architecture || (discovery ? discovery.directoryTree : 'No architecture specified.');

          // Merge user-provided patterns with auto-discovered patterns
          const discoveryPatterns = discovery
            ? discovery.patterns.map((p: DiscoveredPattern) => `${p.name} (${p.type}) — ${p.file}:${p.line}`)
            : [];
          const mergedPatterns = [...(args.patterns || []), ...discoveryPatterns];

          // Merge user-provided failures with auto-discovered failure modes
          const discoveryFailures = discovery
            ? discovery.failureModes.map((f: DiscoveredFailure) => `${f.message} — ${f.file}:${f.line} [pattern: ${f.pattern}]`)
            : [];
          const mergedFailures = [...(args.failures || []), ...discoveryFailures];

          // Merge user-provided decisions with auto-discovered decisions
          const discoveryDecisions = discovery
            ? discovery.decisions.map((d: DiscoveredDecision) => `${d.rationale} — ${d.file}:${d.line}`)
            : [];
          const mergedDecisions = [...(args.decisions || []), ...discoveryDecisions];

          const targetPathForGen = args.targetPath || 'context-ingestion';

          // ═══ v4.4.2 L1 — CONTENT GENERATOR (<1000 lines, chat prompt) ═══
          // L1 takes requirements + contextFiles and generates content.
          // Can generate: build directives, context docs, subagent prompts,
          // behavior alignment, etc. Whatever the requirements specify.
          // Uses buildDesignBrief() — same data path as L2, shorter output.
          if (layer === 1) {
          try {
            tridentLog('INFO', 'trident-deep-planning', 'L1: Generating content from requirements + contextFiles');
            // Read contextFiles as reference material
            const l1SourceExtracts = args.contextFiles
              ? readSourceFiles(args.contextFiles)
              : new Map<string, string>();
            // If targetPath provided, read its source files as additional reference
            if (targetPathForGen && targetPathForGen !== 'context-ingestion') {
              const targetFiles = await collectSourceFiles(targetPathForGen);
              for (const tf of targetFiles.slice(0, 15)) {
                try {
                  const content = fsSync.readFileSync(tf, 'utf-8');
                  l1SourceExtracts.set(tf, content);
                } catch (e) { tridentLog('WARN', 'trident-tools', 'Non-fatal error: ' + (e instanceof Error ? e.message : String(e))); }
              }
            }
            const l1Strategy = getDefaultStrategy();
            const l1Brief = buildL1ContentBrief(args, l1SourceExtracts, projectName);
            const L1_SYSTEM = 'You are an elite content generator. ' +
              'You generate content based on FIRST-HAND CONTEXT provided by the calling agent. ' +
              'Target 200-800 lines depending on task complexity. Maximum 1500 lines. ' +
              'Output ONLY the requested content. No meta-commentary. No preamble.\n\n' +
              'ANTI-HALLUCINATION RULES — ZERO TOLERANCE:\n' +
              '1. NEVER invent file names, script names, or component names. Use ONLY names that appear in the PRIMARY FIRST-HAND CONTEXT.\n' +
              '2. NEVER invent architecture. If the context describes 7 gates, write about 7 — not 8. If it describes 5 tiers, write about 5 — not 3.\n' +
              '3. NEVER idealize or improve the architecture. Document WHAT EXISTS, not what SHOULD exist.\n' +
              '4. If you lack context for a section, write "CONTEXT NEEDED: [describe what is missing]" — do NOT fabricate.\n' +
              '5. NEVER create fictional evidence bundles, fictional circuit breakers, or fictional detection mechanisms.\n' +
              '6. The PRIMARY FIRST-HAND CONTEXT is the source of truth. The requirements describe what to GENERATE from that context.\n' +
              '7. If the requirements say "document what was built" — use the context to describe what was ACTUALLY built, not an idealized version.';
            const l1Output = await runInternalLLMLoop(l1Brief, null, l1Strategy, {
              useSplit: false, maxIterations: 1, skipQualityChecks: true,
              systemOverride: L1_SYSTEM,
            });
            const l1Path = await writeArtifactFile('DP_L1_CONTENT', l1Output, args.outputPath, args.outputName, args.fileName);
            setPendingL1Path(l1Path);
            storeArtifacts({ 'layer': '1', 'layer-name': 'INITIAL PLAN', 'mode': 'LLM_GENERATED', 'artifact-path': l1Path });
            try { machineActor.send({ type: 'SUBMIT_LAYER1' }); orchestrator.completeLayer(); } catch (e: unknown) { tridentLog('WARN', 'trident-tools', `Error: ${e instanceof Error ? e.message : String(e)}`); }
            const l1Lines = l1Output.split('\n').length;
            const l1Sha = crypto.createHash('sha256').update(l1Output).digest('hex').substring(0, 16);
            tridentLog('INFO', 'trident-deep-planning', `L1 COMPLETE: ${l1Lines} lines written to ${l1Path} (sha256: ${l1Sha})`);
            return JSON.stringify({
              status: 'L1_CONTENT_WRITTEN',
              path: l1Path,
              lines: l1Lines,
              sha256: l1Sha,
              preview: l1Output.split('\n').slice(0, 10).join('\n'),
              message: `L1 content (${l1Lines} lines) written directly to ${l1Path}. Do NOT rewrite, truncate, or summarize.`,
            }, null, 2);
          } catch (l1Err: unknown) {
            const l1Msg = l1Err instanceof Error ? l1Err.message : String(l1Err);
            tridentLog('ERROR', 'trident-deep-planning', `L1 FAILED: ${l1Msg}`);
            return `L1 GENERATION ERROR: ${l1Msg}`;
          }
          }

          // ═══ v4.4.2 L2 — DENSE ENGINEERING SPEC (3000+ lines, written to disk) ═══
          // L2 takes requirements + contextFiles and generates a dense engineering
          // spec for building a system from scratch. Like CME/Kronos reference specs.
          // Uses buildDesignBrief() — same data path as L1, longer/denser output.
          // NO analyzeProject. NO audit mode. Requirements + reference docs only.
          if (layer === 2) {
          try {
            tridentLog('INFO', 'trident-deep-planning', 'L2: Generating engineering spec from requirements + contextFiles');

            // ── STEP 1: GATHER REFERENCE MATERIAL ──
            const l2SourceExtracts = args.contextFiles
              ? readSourceFiles(args.contextFiles)
              : new Map<string, string>();
            // If targetPath provided, read its source files as additional reference
            if (targetPathForGen && targetPathForGen !== 'context-ingestion') {
              const targetFiles = await collectSourceFiles(targetPathForGen);
              for (const tf of targetFiles.slice(0, 15)) {
                try {
                  const content = fsSync.readFileSync(tf, 'utf-8');
                  l2SourceExtracts.set(tf, content);
                } catch (e) { tridentLog('WARN', 'trident-tools', 'Non-fatal error: ' + (e instanceof Error ? e.message : String(e))); }
              }
              tridentLog('INFO', 'trident-deep-planning', `L2: Read ${targetFiles.length} reference files from targetPath`);
            }
            const l2HasSourceFiles = l2SourceExtracts.size > 0;
            const l2HasRequirements = !!args.requirements && args.requirements.length > 50;

            if (!l2HasSourceFiles && !l2HasRequirements) {
              throw new Error(
                'Insufficient Context. Provide:\n' +
                '  - requirements: Detailed description of the system to build\n' +
                '  - contextFiles: Reference docs/source files to synthesize into the spec\n' +
                '  - targetPath: Project to read as additional reference material',
              );
            }

            // ── STEP 2: DERIVE STRATEGY ──
            const l2Strategy = getDefaultStrategy();
            (l2Strategy as any).references = REFERENCE_EXCERPTS;

            // ── STEP 3: BUILD BRIEF (always from requirements + reference docs) ──
            const l2Brief = buildDesignBrief(args, l2SourceExtracts, l2Strategy, projectName);

            tridentLog('INFO', 'trident-deep-planning',
              `L2 brief built: ${l2Brief.split('\n').length} lines — ` +
              `source files: ${l2SourceExtracts.size}, ` +
              `has requirements: ${l2HasRequirements}`);

            // ── STEP 4: INTERNAL LLM GENERATION LOOP (max 3 iterations) ──
            const MAX_L2_ITERATIONS = 3;
            let generatedSpec = '';
            let lastFeedback = '';

            for (let l2Iter = 1; l2Iter <= MAX_L2_ITERATIONS; l2Iter++) {
              tridentLog('INFO', 'trident-deep-planning',
                `L2 generation iteration ${l2Iter}/${MAX_L2_ITERATIONS}`);

              try {
                generatedSpec = await generateSpecViaLLM(l2Brief, lastFeedback || undefined);
              } catch (llmErr) {
                tridentLog('ERROR', 'trident-deep-planning',
                  `L2 LLM generation failed on iteration ${l2Iter}: ${llmErr instanceof Error ? llmErr.message : String(llmErr)}`);
                if (l2Iter === MAX_L2_ITERATIONS) {
                  throw new Error(
                    `L2 generation failed after ${MAX_L2_ITERATIONS} iterations. ` +
                    `Last error: ${llmErr instanceof Error ? llmErr.message : String(llmErr)}`,
                  );
                }
                continue;
              }

              tridentLog('INFO', 'trident-deep-planning',
                `L2 iteration ${l2Iter}: LLM generated ${generatedSpec.split('\n').length} lines`);

              // ── TOPIC ALIGNMENT GATE ──
              // Extract key terms from requirements, verify they appear in output.
              // Prevents topic drift (e.g., "warhead generation" → "memory lifecycle").
              if (args.requirements && args.requirements.length > 50) {
                const keyTerms = extractKeyTerms(args.requirements);
                const missingTerms = keyTerms.filter(term =>
                  !generatedSpec.toLowerCase().includes(term.toLowerCase())
                );
                if (missingTerms.length > 0) {
                  tridentLog('WARN', 'trident-deep-planning',
                    `L2 TOPIC DRIFT detected: missing terms [${missingTerms.join(', ')}] — requesting revision`);
                  lastFeedback = `TOPIC ALIGNMENT FAILURE: The generated spec does not contain these key terms from the requirements: ${missingTerms.join(', ')}.\n` +
                    `The spec has drifted to a different topic. Regenerate with EXPLICIT focus on: ${missingTerms.join(', ')}.\n` +
                    `The requirements clearly state this is about: "${args.requirements.substring(0, 200)}..."\n` +
                    `Do NOT write about memory management, theatrical detection, or any other topic. Write about EXACTLY what the requirements describe.`;
                  if (l2Iter === MAX_L2_ITERATIONS) {
                    tridentLog('ERROR', 'trident-deep-planning',
                      `L2 TOPIC DRIFT persists after ${MAX_L2_ITERATIONS} iterations — saving despite drift`);
                  }
                  continue; // Skip other quality checks, go to next iteration
                }
                tridentLog('INFO', 'trident-deep-planning',
                  `L2 topic alignment PASSED: all ${keyTerms.length} key terms present`);
              }

              // No analysis-based quality checks (no analyzeProject in L2).
              // Topic alignment gate above is the primary quality check.
              break;
            }

            // ── STEP 5: FINALIZE AND WRITE ──
            const l2FinalDoc = generatedSpec; // No appendComplianceAndAppendix (no analysis data)
            let l2ArtifactPath: string;
            if (args.outputPath) {
              // Respect user-specified output path
              try {
                const outDir = path.dirname(args.outputPath);
                await fs.mkdir(outDir, { recursive: true });
                await fs.writeFile(args.outputPath, l2FinalDoc, 'utf-8');
                l2ArtifactPath = args.outputPath;
                tridentLog('INFO', 'trident-tools', `Artifact saved to user-specified path: ${l2ArtifactPath}`);
              } catch (writeErr) {
                tridentLog('WARN', 'trident-tools', `Failed to write to outputPath ${args.outputPath}: ${writeErr instanceof Error ? writeErr.message : String(writeErr)} — falling back to default`);
                l2ArtifactPath = await writeArtifactFile('DP_L2_SPEC', l2FinalDoc, args.outputPath, args.outputName);
              }
            } else {
              l2ArtifactPath = await writeArtifactFile('DP_L2_SPEC', l2FinalDoc, args.outputPath, args.outputName);
            }

            storeArtifacts({
              'layer': '2',
              'layer-name': 'DETAILED WORKFLOW (LLM-GENERATED)',
              'output': l2FinalDoc,
              'mode': 'LLM_GENERATED',
              'quality': 'GOLD',
              'line-count': String(l2FinalDoc.split('\n').length),
            });

            try { machineActor.send({ type: 'SUBMIT_LAYER2', count: 10 }); orchestrator.completeLayer(); }
            catch (e: unknown) { tridentLog('WARN', 'trident-tools', `Error: ${e instanceof Error ? e.message : String(e)}`); }

            const l2Lines = l2FinalDoc.split('\n').length;
            const l2Tests = (l2FinalDoc.match(/expect\(/g) || []).length;
            const l2CodeBlocks = (l2FinalDoc.match(/```/g) || []).length / 2;

            tridentLog('INFO', 'trident-deep-planning',
              `L2 BUILD SPEC COMPLETE: ${l2Lines} lines — ` +
              `${(l2FinalDoc.match(/threat/gi) || []).length} threats, ${(l2FinalDoc.match(/defense|defend/gi) || []).length} defenses, ${l2Tests} test assertions`);

            return `L2 BUILD SPEC COMPLETE

Lines: ${l2Lines}
Quality: LLM-GENERATED from requirements + reference docs
Test assertions: ${l2Tests}
Code blocks: ${l2CodeBlocks}

📄 Artifact saved: ${l2ArtifactPath}`;
          } catch (l2Err: unknown) {
            const l2ErrMsg = l2Err instanceof Error ? l2Err.message : String(l2Err);
            const l2ErrStack = l2Err instanceof Error ? l2Err.stack : '';
            tridentLog('ERROR', 'trident-deep-planning', `L2 INTERNAL LOOP FAILED: ${l2ErrMsg}`);
            tridentLog('ERROR', 'trident-deep-planning', `L2 STACK: ${l2ErrStack}`);
            return `L2 GENERATION ERROR: ${l2ErrMsg}\n\nStack: ${l2ErrStack || 'no stack'}`;
          }
          }

          // ═══ v4.4.2 L3 CONTEXT LIBRARY — PARALLEL SUBAGENT DISPATCH ═══
          // L3 operates in 2 phases:
          // Phase 1: Discover domains, return dispatch instructions (fast, deterministic)
          // Agent: Dispatches parallel trident_planner subagents, each calls L2 for one domain
          // Phase 2: Agent calls back with engineSpecs, tool assembles manifest + index + folder
          if (layer === 3) {
          try {
            // ── DOMAIN DETECTION (file-based, NOT code audit) ──
            const l3SourceFiles = await collectSourceFiles(targetPathForGen);
            if (l3SourceFiles.length === 0) throw new Error('Insufficient Context for L3. No source files found at targetPath.');
            // Create lightweight construct objects from file paths for domain detection
            const l3FakeAnalysis = { constructs: l3SourceFiles.map(f => ({ filePath: f, name: path.basename(f) })), threats: [] };
            tridentLog('INFO', 'trident-deep-planning', `L3: Found ${l3SourceFiles.length} source files at ${targetPathForGen}`);

            // ── PHASE 2 CHECK: Did the agent return completed engine specs? ──
            if (args.engineSpecs && args.engineSpecs.length > 0 &&
                (args.engineSpecs[0] === 'completed' || args.engineSpecs[0]?.includes('COMPLETE'))) {

              tridentLog('INFO', 'trident-deep-planning', 'L3 Phase 2: Assembling context library from completed specs');

              // Find all L2 spec artifacts written by subagents
              const artifactsDir = path.join(ARTIFACTS_BASE, 'DP_L3_LIBRARY');
              let specFiles: string[] = [];
              try {
                const allFiles = await fs.readdir(artifactsDir);
                specFiles = allFiles.filter(f => f.endsWith('.md')).map(f => path.join(artifactsDir, f));
              } catch (e) { tridentLog('WARN', 'trident-tools', 'Non-fatal error: ' + (e instanceof Error ? e.message : String(e))); }

              if (specFiles.length === 0) throw new Error('No L2 spec artifacts found for L3 assembly.');

              // Read each spec, extract metadata
              const specs: { name: string; path: string; lines: number; threats: string }[] = [];
              for (const specPath of specFiles) {
                try {
                  const content = await fs.readFile(specPath, 'utf-8');
                  const lines = content.split('\n').length;
                  const name = path.basename(specPath, '.md');
                  // Extract threat patterns from content
                  const threatMatches = content.match(/DEAD_CODE|THEATRICAL|DUPLICATE/g) || [];
                  const threats = [...new Set(threatMatches)].slice(0, 3).join(', ');
                  specs.push({ name, path: specPath, lines, threats });
                } catch (e) { tridentLog('WARN', 'trident-tools', 'Non-fatal error: ' + (e instanceof Error ? e.message : String(e))); }
              }

              // Build the context library folder
              const libDir = path.join(targetPathForGen || ARTIFACTS_BASE, 'context-library');
              try { await fs.mkdir(libDir, { recursive: true }); } catch (e) { tridentLog('WARN', 'trident-tools', 'Non-fatal error: ' + (e instanceof Error ? e.message : String(e))); }

              // Write each spec to the context library
              for (const spec of specs) {
                const destPath = path.join(libDir, `${spec.name}.md`);
                try {
                  const content = await fs.readFile(spec.path, 'utf-8');
                  await fs.writeFile(destPath, content, 'utf-8');
                } catch (e) { tridentLog('WARN', 'trident-tools', 'Non-fatal error: ' + (e instanceof Error ? e.message : String(e))); }
              }

              // Assemble the master index — this is the "ship manifest using L1" concept
              let index = `# Context Library — ${projectName}\n\n`;
              index += `**Generated:** ${new Date().toISOString()}\n`;
              index += `**Engine Specs:** ${specs.length}\n`;
              index += `**Total Lines:** ${specs.reduce((s, sp) => s + sp.lines, 0)}\n`;
              index += `**Location:** \`${libDir}\`\n\n`;
              index += `## Engine Specs\n\n`;
              index += `| Engine | Lines | Key Threats | File |\n`;
              index += `|--------|-------|-------------|------|\n`;
              for (const spec of specs) {
                index += `| ${spec.name} | ${spec.lines} | ${spec.threats || 'none'} | \`${spec.name}.md\` |\n`;
              }
              index += `\n## How to Use This Library\n\n`;
              index += `1. Read the MASTER_INDEX.md (this file) first for an overview.\n`;
              index += `2. Read each engine spec for domain-specific architecture, threats, and defenses.\n`;
              index += `3. Each spec is self-contained — can be read independently after compaction.\n\n`;
              index += `## Cross-Reference Index\n\n`;
              index += `Threats are addressed by defense rules in each engine spec. Cross-references below\n`;
              index += `show which engine handles each threat pattern:\n\n`;
              const allThreats = new Set<string>();
              for (const spec of specs) {
                if (spec.threats) spec.threats.split(', ').forEach(t => allThreats.add(t.trim()));
              }
              for (const threat of allThreats) {
                const engines = specs.filter(s => s.threats?.includes(threat)).map(s => s.name);
                index += `- **${threat}**: addressed in ${engines.join(', ')}\n`;
              }

              const indexPath = path.join(libDir, 'MASTER_INDEX.md');
              await fs.writeFile(indexPath, index, 'utf-8');

              // Also save to artifacts
              const manifestArtifactPath = await writeArtifactFile('DP_L3_LIBRARY', index);
              storeArtifacts({ 'layer': '3', 'output': index, 'mode': 'SUBAGENT_PARALLEL' });
              try { machineActor.send({ type: 'SUBMIT_LAYER3', content: index }); orchestrator.completeLayer(); } catch (e: unknown) { tridentLog('WARN', 'trident-tools', `Error: ${e instanceof Error ? e.message : String(e)}`); }

              const totalLines = specs.reduce((sum, s) => sum + s.lines, 0);
              tridentLog('INFO', 'trident-deep-planning', `L3 COMPLETE: ${specs.length} specs, ${totalLines} total lines, context library at ${libDir}`);
              return `L3 CONTEXT LIBRARY COMPLETE

Engine specs assembled: ${specs.length}
Total lines: ${totalLines}
Context library: ${libDir}

Specs:
${specs.map(s => `  - ${s.name}: ${s.lines} lines (${s.threats || 'no threats'})`).join('\n')}

📄 Master Index: ${indexPath}
📄 Manifest artifact: ${manifestArtifactPath}`;
            }

            // ── PHASE 1: Discover domains, create folder, return dispatch manifest ──
            tridentLog('INFO', 'trident-deep-planning', 'L3 Phase 1: Domain discovery + dispatch manifest');
            const engineDomains = detectEngineDomains(l3FakeAnalysis);
            tridentLog('INFO', 'trident-deep-planning', `L3: ${engineDomains.length} engine domains detected: ${engineDomains.map(d => d.name).join(', ')}`);

            // Create context library folder for planner agents to write to
            const libDir = path.join(targetPathForGen, 'context-library');
            try { fsSync.mkdirSync(libDir, { recursive: true }); } catch (e: unknown) {
              tridentLog('WARN', 'trident-deep-planning', `L3: Could not create context-library dir: ${e instanceof Error ? e.message : String(e)}`);
            }
            tridentLog('INFO', 'trident-deep-planning', `L3: Context library folder created at ${libDir}`);

            // Build per-domain dispatch prompts (file-based, NOT threat-based)
            const domainBriefs: { name: string; files: number; constructs: number; threats: string; taskPrompt: string }[] = [];
            for (const d of engineDomains) {
              const domainFiles = [...d.filePaths].slice(0, 10);
              const domainReqs = `Generate engineering spec for the ${d.name} domain. Focus on files: ${domainFiles.join(', ')}.`;
              const escapedReqs = domainReqs.replace(/'/g, "\\'");
              const taskPrompt = `Call trident-deep-planning with targetPath='${targetPathForGen}', layer=2, requirements='${escapedReqs}'. Do NOT write the spec yourself. Call the tool IMMEDIATELY.`;

              domainBriefs.push({
                name: d.name,
                files: d.filePaths.size,
                constructs: d.constructs.length,
                threats: 'none',
                taskPrompt,
              });
            }

            // Set pendingDispatch flag for hook enforcement
            setPendingDispatch(engineDomains.length, 'default');

            // Build compact dispatch manifest
            let response = `L3 CONTEXT LIBRARY — DISPATCH REQUIRED\n\n`;
            response += `📁 Folder: ${libDir}\n`;
            response += `📊 ${engineDomains.length} domains: ${domainBriefs.map(d => d.name).join(', ')}\n\n`;
            response += `DISPATCH ${engineDomains.length} trident_planner AGENTS NOW — ALL IN ONE RESPONSE.\n`;
            response += `This is MECHANICALLY ENFORCED — your response will be blocked until you dispatch.\n\n`;

            for (let i = 0; i < domainBriefs.length; i++) {
              const d = domainBriefs[i];
              response += `Agent ${i + 1} — ${d.name} (${d.files} files, ${d.constructs} constructs, ${d.threats}):\n`;
              response += `  task(subagent_type="trident_planner", prompt="${d.taskPrompt}")\n\n`;
            }

            response += `AFTER ALL ${engineDomains.length} RETURN:\n`;
            response += `Call trident-deep-planning(layer=3, targetPath="${targetPathForGen}", engineSpecs=["completed"])\n`;

            storeArtifacts({ 'layer': '3', 'phase': 'discovery', 'domains': String(engineDomains.length) });

            return response;

          } catch (l3Err: unknown) {
            const l3Msg = l3Err instanceof Error ? l3Err.message : String(l3Err);
            tridentLog('ERROR', 'trident-deep-planning', `L3 FAILED: ${l3Msg}`);
            return `L3 GENERATION ERROR: ${l3Msg}`;
          }
          }

          // ====================================================================
          // CONTEXT FILE INGESTION — read external source files before generating
          // ====================================================================
          // When contextFiles is provided, the tool reads every file, extracts
          // TypeScript interfaces, classes, functions, and algorithms, and
          // returns a STRUCTURED BRIEF to the agent. The agent uses this brief
          // to write the full spec content, then calls the tool again with the
          // section parameters filled in.
          //
          // This is the TWO-CALL PATTERN:
          //   Call 1: contextFiles=[...], layer=2 -> returns brief (no artifact)
          //   Call 2: layer=2, dataModel="...", engineDesign="...", ... -> writes artifact
          //
          // Or SINGLE-CALL when the agent provides both contextFiles AND section content.
          let contextBrief: string | null = null;
          const hasSectionContent = args.executiveSummary || args.dataModel || args.engineDesign ||
                                    args.defenseRules || args.integrationPlan || args.testSpecs;
          if (args.contextFiles && args.contextFiles.length > 0 && !hasSectionContent) {
            // TWO-CALL PATTERN: First call — ingest context, return brief
            const fileContents: Array<{ path: string; content: string; lines: number }> = [];
            let totalLines = 0;
            for (const filePath of args.contextFiles) {
              try {
                const content = await fs.readFile(filePath, 'utf-8');
                const lineCount = content.split('\n').length;
                fileContents.push({ path: filePath, content, lines: lineCount });
                totalLines += lineCount;
              } catch (e: unknown) {
                tridentLog('WARN', 'trident-tools', `Error: ${e instanceof Error ? e.message : String(e)}`);
                tridentLog('WARN', 'trident-deep-planning', `Failed to read context file: ${filePath}`);
                continue;
              }
            }
            tridentLog('INFO', 'trident-deep-planning',
              `Context ingestion: ${fileContents.length}/${args.contextFiles.length} files read, ${totalLines} total lines`);

            contextBrief = generateContextBrief(fileContents, args.requirements || '', layer);

            // AUTO-GENERATE sections from brief + discovery data
            // The tool does BOTH phases in one call — no stopping halfway
            tridentLog('INFO', 'trident-deep-planning',
              `Context ingestion: ${fileContents.length}/${args.contextFiles.length} files read, ${totalLines} total lines. Auto-generating sections from brief data.`);

            // Auto-fill section content from discovery + brief data
            const disc = discovery;
            const fileCount = disc ? disc.totalFiles : fileContents.length;
            const lineCount = disc ? disc.totalLines : totalLines;
            const languages = disc ? Object.entries(disc.languages).map(function(e: [string, number]) { return e[0] + ' (' + e[1] + ' files)'; }).join(', ') : 'TypeScript';
            const entryPoints = disc ? disc.entryPoints.join(', ') : 'index.ts';
            const dirTree = disc ? disc.directoryTree : 'See context brief above';

            // Build auto-sections from real data
            if (!args.executiveSummary) (args as Record<string, unknown>).executiveSummary =
              '## Executive Summary\n\nThis build spec covers ' + (args.requirements || 'the specified requirements') +
              '.\n\nThe target project has ' + fileCount + ' files spanning ' + lineCount + ' lines across ' + languages + '. ' +
              'Entry points: ' + entryPoints + '. ' +
              (disc ? 'Auto-discovery found ' + disc.patterns.length + ' patterns, ' + disc.failureModes.length + ' failure modes, and ' + disc.decisions.length + ' design decisions.' : '') +
              '\n\nThe context brief above contains extracted interfaces, classes, functions, and algorithms from the provided source files. ' +
              'These form the foundation for the architecture, data model, and engine design sections below.';

            if (!args.architectureOverview) (args as Record<string, unknown>).architectureOverview =
              '## Architecture Overview\n\n' + dirTree + '\n\n' +
              'The project structure follows a modular architecture with clear separation of concerns. ' +
              'The context brief analysis reveals key architectural constructs that inform the build plan.';

            if (!args.dataModel) (args as Record<string, unknown>).dataModel =
              '## Data Model\n\nBased on AST extraction from the context brief:\n\n' +
              contextBrief.substring(0, 2000) +
              '\n\n*(Full interface and type definitions are in the context brief above)*';

            if (!args.engineDesign) (args as Record<string, unknown>).engineDesign =
              '## Engine Class Design\n\nThe engine integrates with the existing codebase through the patterns and constructs ' +
              'identified in the context brief. Key integration points are the discovered entry points and the ' +
              'module structure shown in the architecture overview.';

            if (!args.defenseRules || (Array.isArray(args.defenseRules) && args.defenseRules.length === 0)) (args as Record<string, unknown>).defenseRules =
              ['Validate all inputs at module boundaries',
               'Log all errors with context — never silently swallow',
               'Use discriminated unions for return types'];

            if (!args.blindSpots) (args as Record<string, unknown>).blindSpots =
              '## Blind Spots\n\n' +
              (disc && disc.failureModes.length > 0
                ? 'Known failure modes from discovery: ' + disc.failureModes.slice(0, 5).map(function(f: DiscoveredFailure) { return f.message + ' (' + f.file + ':' + f.line + ')'; }).join('; ')
                : 'No failure modes discovered. Manual review recommended for edge cases.') +
              '\n\nAreas requiring further investigation: performance characteristics under load, ' +
              'concurrent access patterns, and error recovery behavior.';

            if (!args.integrationPlan) (args as Record<string, unknown>).integrationPlan =
              '## Integration Plan\n\n' +
              '1. Implement core types and interfaces from the data model section\n' +
              '2. Build engine classes following the design above\n' +
              '3. Wire into existing entry points: ' + entryPoints + '\n' +
              '4. Add defense rules at module boundaries\n' +
              '5. Write tests covering each threat vector\n' +
              '6. Document migration path for existing consumers';

            if (!args.evidenceFormat) (args as Record<string, unknown>).evidenceFormat =
              '## Evidence Format\n\nAll claims must cite file:line evidence. ' +
              'Use format: [EVIDENCE: file.ts:NN showing observation]. ' +
              'Runtime behavior verified through container TUI testing per RUNTIME_BEHAVIOR_CONTAINER_TESTING_LAW.md.';

            if (!args.testSpecs) (args as Record<string, unknown>).testSpecs =
              '## Test Specifications\n\n' +
              '1. Unit tests for each new type and interface\n' +
              '2. Integration tests for engine class methods\n' +
              '3. Container TUI tests for runtime behavior verification\n' +
              (disc ? '4. Regression tests for discovered failure modes: ' + disc.failureModes.slice(0, 3).map(function(f: DiscoveredFailure) { return f.message; }).join(', ') : '4. Edge case tests for boundary conditions');

            if (!args.migrationStrategy) (args as Record<string, unknown>).migrationStrategy =
              '## Migration Strategy\n\n' +
              'Phase 1: Add new types and interfaces (non-breaking)\n' +
              'Phase 2: Implement engine classes behind feature flag\n' +
              'Phase 3: Wire into existing code paths\n' +
              'Phase 4: Remove feature flag and legacy code\n' +
              'Phase 5: Full deployment with monitoring';

            // Prepend brief to output so agent has full context
            tridentLog('INFO', 'trident-deep-planning', 'Auto-generated all 10 sections from brief data. Proceeding to artifact assembly.');
          }

          let output: string;
          let artifactPath: string | undefined;

          // Step 6: Assemble artifact from sections (Layer 1 auto-fill, Layer 2 explicit, Layer 3 context lib)
          if (layer === 1 || layer === 2) {
            // Validate required sections
            const requiredSections: Record<string, string | string[] | undefined> = {
              executiveSummary: args.executiveSummary,
              architectureOverview: args.architectureOverview,
              dataModel: args.dataModel,
              engineDesign: args.engineDesign,
              defenseRules: args.defenseRules,
              blindSpots: args.blindSpots,
              integrationPlan: args.integrationPlan,
              evidenceFormat: args.evidenceFormat,
              testSpecs: args.testSpecs,
              migrationStrategy: args.migrationStrategy,
            };
            const missing: string[] = [];
            for (const [name, value] of Object.entries(requiredSections)) {
              if (!value || (typeof value === 'string' && value.trim().length < 50) || (Array.isArray(value) && value.length === 0)) {
                missing.push(name);
              }
            }
            if (missing.length > 0) {
              throw new Error('Missing required sections: ' + missing.join(', ') + '. Generate content from the context brief and call again.');
            }

            output = generateLayer2DetailedWorkflow(
              targetPathForGen, projectName, inputParams, architecture, discovery,
              args.executiveSummary, args.architectureOverview, args.dataModel,
              args.engineDesign, args.defenseRules, args.blindSpots,
              args.integrationPlan, args.evidenceFormat, args.testSpecs, args.migrationStrategy,
            );
          } else {
            output = generateContextLibraryManifest(
              projectName, architecture, mergedPatterns, mergedFailures, mergedDecisions,
              targetPathForGen, discovery, args.recursive, args.engineSpecs,
            );
          }

          artifactPath = await writeArtifactFile('DP_L2_SPEC', output);
          if (args.outputPath) {
            try {
              await fs.writeFile(args.outputPath, output, 'utf-8');
              artifactPath = args.outputPath;
              tridentLog('INFO', 'trident-deep-planning', `Artifact written to outputPath: ${args.outputPath}`);
            } catch (e: unknown) { tridentLog('WARN', 'trident-tools', `Error: ${e instanceof Error ? e.message : String(e)}`); }
          }

          // State machine update
          try {
            if (layer === 2) {
              const discoveryPhases = discovery
                ? [discovery.patterns, discovery.failureModes, discovery.decisions, discovery.warheads, discovery.entryPoints, discovery.auditLayers]
                    .filter((arr: unknown[]) => arr.length > 0).length
                : 0;
              const componentsCount = Math.max(discoveryPhases, 5);
              machineActor.send({ type: 'SUBMIT_LAYER2', count: componentsCount });
            } else {
              machineActor.send({ type: 'SUBMIT_LAYER3', content: output });
            }
            orchestrator.completeLayer();
          } catch (e: unknown) { tridentLog('WARN', 'trident-tools', `Error: ${e instanceof Error ? e.message : String(e)}`); /* Non-fatal: state machine update is best-effort; artifact already persisted */ }

          // Store artifacts for orchestrator state
          storeArtifacts({
            'layer': String(layer),
            'layer-name': layerNames[layer],
            'output': output,
            ...(artifactPath ? { 'artifact-path': artifactPath } : {}),
            'mode': 'layer-' + layer,
            'auto-discovery': discovery ? JSON.stringify({
              totalFiles: discovery.totalFiles,
              totalLines: discovery.totalLines,
              patterns: discovery.patterns.length,
              failureModes: discovery.failureModes.length,
              decisions: discovery.decisions.length,
              warheads: discovery.warheads.length,
              entryPoints: discovery.entryPoints,
              languages: discovery.languages,
            }) : 'disabled',
          });

          const nextLayersMap: Record<number, number[]> = {
            1: [2, 3],
            2: [3],
            3: [],
          };

          const layerHints: Record<number, string> = {
            1: 'Layer 1 (Initial Prompt) complete. For L2 spec generation, call with layer=2 and contextFiles pointing to source files.',
            2: 'Layer 2 (Detailed Workflow) complete. For context library, call with layer=3.',
            3: 'Layer 3 (Context Library) complete. All deep-planning layers finished.',
          };

          return {
            layer,
            layerName: layerNames[layer],
            output,
            artifactPath: artifactPath || undefined,
            nextLayers: nextLayersMap[layer],
            hint: layerHints[layer],
          };
        } catch (err: unknown) {
          const errMsg = err instanceof Error ? err.message : String(err);
          const errorId = `PLAN-ERR-${Date.now()}`;
          tridentLog('ERROR', 'trident-deep-planning', `[${errorId}] ${errMsg}`);
          return { error: 'Deep planning failed', errorId, message: (err instanceof Error ? err.message : String(err)) };
        }
      },
    }),

    'trident-problem-solving': tool({
      description: 'Run problem-solving loop: Triviality Gate -> Classify -> Define Done -> Gather Evidence -> Decide (with framework selection) -> Act (intent gate) -> Verify -> Report. Frameworks (Five Whys, Fault Tree, Systems Thinking, Pareto, First Principles, Hypothesis-Driven) are selectable tools within the Decide step, not mandatory stages. Produces outcome-first artifact with no layer scaffolding.',
      args: {
        targetPath: z.string().describe('Absolute path to the affected project'),
        outputPath: z.string().describe('MANDATORY: Absolute path where the diagnostic artifact must be written.'),
        outputName: z.string().optional().describe('Optional filename override. If omitted, auto-generated from first heading.'),
        problem: z.string().describe('Problem statement — what is broken or wrong'),
        reasoning: z.array(z.string()).describe('Reasoning chain steps. Use "observation|hypothesis|evidence|conclusion" pipe format for best evidence output'),
        workingPlan: z.array(z.string()).describe('Working plan phases. Use "description|files|expected outcome|risk|rollback" pipe format for best recommendation output'),
        findings: z.array(z.string()).optional().describe('Findings discovered during investigation'),
      },
      execute: async (args: {
        targetPath: string;
        problem: string;
        reasoning: string[];
        workingPlan: string[];
        findings?: string[];
      }) => {
        if (!(await fileExists(args.targetPath))) {
          throw new Error('targetPath does not exist: ' + args.targetPath);
        }
        try {
          orchestrator.startProblemSolving();

          // === LLM-POWERED PROBLEM SOLVING ===
          // Read actual source code, build brief, LLM generates comprehensive analysis.
          // Enriches findings with discovery data (patterns, failure modes) if available.
          const psSourceExtracts = new Map<string, string>();
          if (args.targetPath && args.targetPath !== 'context-ingestion') {
            const targetFiles = await collectSourceFiles(args.targetPath);
            for (const tf of targetFiles.slice(0, 15)) {
              try {
                const content = fsSync.readFileSync(tf, 'utf-8');
                psSourceExtracts.set(tf, content);
              } catch (e) { tridentLog('WARN', 'trident-tools', 'Non-fatal error: ' + (e instanceof Error ? e.message : String(e))); }
            }
          }

          // Enrich findings with auto-discovery data
          let psDiscoveryFindings: string[] = args.findings || [];
          try {
            const psDiscovery = await discoverProject(args.targetPath || process.cwd());
            for (const pat of psDiscovery.patterns.slice(0, 20)) {
              psDiscoveryFindings.push(`${pat.type}: ${pat.name} at ${pat.file}:${pat.line}`);
            }
            for (const fail of psDiscovery.failureModes.slice(0, 10)) {
              psDiscoveryFindings.push(`FAILURE: ${fail.message} at ${fail.file}:${fail.line}`);
            }
          } catch (e: unknown) {
            tridentLog('WARN', 'trident-tools', `PS discovery failed (non-fatal): ${e instanceof Error ? e.message : String(e)}`);
          }

          const psProjectName = args.targetPath ? await resolveProjectName(args.targetPath) : 'problem-analysis';

          const psBrief = buildProblemSolvingBrief(
            args.problem,
            psSourceExtracts,
            psDiscoveryFindings,
            args.reasoning || [],
            psProjectName,
          );

          const PS_SYSTEM = 'You are an elite diagnostic engineer. ' +
            'You solve problems by reading actual code, tracing root causes to specific file:line patterns, ' +
            'and producing comprehensive fix strategies with corrected code. ' +
            'You NEVER say "insufficient evidence" — the code is provided. Read it and analyze it. ' +
            'Every claim MUST cite file:line. Every fix MUST include the corrected code. ' +
            'Trace root causes by asking "why?" repeatedly until you reach the fundamental cause. ' +
            'Output ONLY the analysis. No preamble. No meta-commentary.';

          tridentLog('INFO', 'trident-problem-solving', `PS: Generating analysis from ${psSourceExtracts.size} source files`);

          const psOutput = await runInternalLLMLoop(psBrief, null, getDefaultStrategy(), {
            useSplit: false, maxIterations: 1, skipQualityChecks: true,
            systemOverride: PS_SYSTEM,
          });

          const mdPath = await writeArtifactFile('PROBLEM_SOLVING', psOutput, args.outputPath, args.outputName);
          storeArtifacts({
            'problem-solving-plan': psOutput,
            'artifact-path': mdPath,
            'mode': 'LLM_GENERATED',
          });

          tridentLog('INFO', 'trident-problem-solving', `PS COMPLETE: ${psOutput.split('\n').length} lines written to ${mdPath}`);
          return psOutput + (mdPath ? `\n\n---\n📄 Artifact saved: \`${mdPath}\`` : '');
        } catch (err: unknown) {
          const errMsg = err instanceof Error ? err.message : String(err);
          const errorId = `PS-ERR-${Date.now()}`;
          tridentLog('ERROR', 'trident-problem-solving', `[${errorId}] ${errMsg}`);
          return JSON.stringify({ error: 'Problem solving failed', errorId, message: (err instanceof Error ? err.message : String(err)) }, null, 2);
        }
      },
    }),

    'trident-context-synthesis': tool({
      description: 'Run CONTEXT_SYNTHESIS mode: 4-layer pipeline (Context Collection → Relevance Scoring → Compression → Injection Format). Validates output against ContextSynthesisModule requirements at each layer. outputMode=T1 (default) produces a lightweight injectable; outputMode=T2 produces a dense, bible-style standalone knowledge file written to disk.',
      args: {
        projectName: z.string().describe('Agent/project name (used for plugin path and agent config)'),
        config: z.record(z.string(), z.any()).optional().describe('opencode.json config object (model, provider, plugin, agent) — used in T1 mode'),
        patterns: z.array(z.string()).optional().describe('Patterns to embed in the injectable / knowledge file'),
        keyFacts: z.array(z.string()).optional().describe('Critical facts the agent must know'),
        targetPath: z.string().optional().describe('Absolute path to the project root (used in T2 mode for architecture discovery)'),
        targetPaths: z.array(z.string()).optional().describe('File paths for trident_explore subagent dispatch (T2 mode only)'),
        outputMode: z.enum(['T1', 'T2']).default('T1').describe('T1 (default) = lightweight injectable config. T2 = dense, bible-style standalone knowledge file written to disk.'),
        targetLines: z.number().min(100).max(16000).default(1000).optional().describe('Target line count for T2 artifact. Controls how many patterns, failure modes, imports, etc. are sampled. Higher = more discovery data included.'),
        executiveSummary: z.string().optional().describe('TWO-CALL PATTERN: Call 1 (empty) returns a data brief. Call 2 (provide >100 chars for T1, >200 chars for T2) saves the LLM-written content as the artifact.'),
      },
      execute: async (args: {
        projectName: string;
        config?: Record<string, unknown>;
        patterns?: string[];
        keyFacts?: string[];
        targetPath?: string;
        targetPaths?: string[];
        outputMode: 'T1' | 'T2';
        targetLines?: number;
        executiveSummary?: string;
      }) => {
        try {
          orchestrator.startContextSynthesis();
          const csMachineActor = interpret(contextSynthesisMachine).start();

          // Detect T1 vs T2 from requirements text (keyFacts + patterns + projectName) AND outputMode parameter
          // If requirements text contains "T2", "knowledge file", or "bible" → force T2
          // If requirements text contains "T1", "injectable", or "config" → force T1
          // Otherwise, use the outputMode parameter as-is
          const detectionText = [
            args.projectName,
            ...(args.keyFacts || []),
            ...(args.patterns || []),
          ].join(' ');
          const mode = detectContextSynthesisLayer(detectionText, args.outputMode || 'T1');

          // Run discovery for BOTH T1 and T2 — T1 needs project intelligence too
          let discovery: DiscoveryResult | null = null;
          if (args.targetPath) {
            try {
              discovery = await discoverProject(args.targetPath);
              tridentLog('INFO', 'trident-context-synthesis', `Discovery: ${discovery.totalFiles} files, ${discovery.patterns.length} patterns, ${discovery.failureModes.length} failures`);
            } catch (e: unknown) {
              tridentLog('WARN', 'trident-context-synthesis', `Discovery failed (non-fatal): ${e instanceof Error ? e.message : String(e)}`);
            }
          }

          if (mode === 'T2') {
            // ═══ v4.4.2 T2 INTERNAL LLM GENERATION ═══
            // T2 produces a Knowledge Transfer Bible — compaction-proof context synthesis.
            // NO appendComplianceAndAppendix — that's L2-specific. T2 has its own closing format.
            try {
              tridentLog('INFO', 'trident-context-synthesis', 'T2: Internal LLM generation (bible format)');
              // Read reference material from targetPath and contextFiles
              const t2SourceExtracts = new Map<string, string>();
              if (args.targetPath) {
                const t2Files = await collectSourceFiles(args.targetPath);
                for (const tf of t2Files.slice(0, 15)) {
                  try { t2SourceExtracts.set(tf, fsSync.readFileSync(tf, 'utf-8')); } catch (e) { tridentLog('WARN', 'trident-tools', 'Non-fatal error: ' + (e instanceof Error ? e.message : String(e))); }
                }
              }
              if (args.targetPaths) {
                for (const tf of args.targetPaths) {
                  try { t2SourceExtracts.set(tf, fsSync.readFileSync(tf, 'utf-8')); } catch (e) { tridentLog('WARN', 'trident-tools', 'Non-fatal error: ' + (e instanceof Error ? e.message : String(e))); }
                }
              }
              const t2Strategy = getDefaultStrategy();
              const t2Brief = buildDesignBrief(args, t2SourceExtracts, t2Strategy, args.projectName);
              const t2Output = await runInternalLLMLoop(t2Brief, null, t2Strategy, {
                useSplit: true, maxIterations: 3,
              });

              // MANDATORY: Verify compaction-proof marking exists
              // The entire point of T2 is compaction-proof context synthesis
              if (!/compaction.proof|compaction-proof/i.test(t2Output)) {
                tridentLog('WARN', 'trident-context-synthesis',
                  'T2: Missing compaction-proof marking — appending mandatory footer');
                // Append the mandatory compaction-proof closing if the LLM didn't include it
                const compactionFooter = `\n\n---\n\n## THE FINAL WORD\n\n` +
                  `This document is **compaction-proof** — read it after context loss.\n` +
                  `Every rule was earned by regression. Every decision is documented.\n` +
                  `No excuse for regression. This bible IS the system knowledge.\n\n` +
                  `*END OF ${args.projectName.toUpperCase()} BIBLE*`;
                const t2FinalDoc = t2Output + compactionFooter;
                const t2Path = await writeArtifactFile('CS_T2_KNOWLEDGE', t2FinalDoc, args.outputPath, args.outputName);
                storeArtifacts({ 'output': t2FinalDoc, 'mode': 'LLM_GENERATED' });
                try { csMachineActor.send({ type: 'FORMAT', sections: [t2FinalDoc] }); } catch (e: unknown) { tridentLog('WARN', 'trident-tools', `Error: ${e instanceof Error ? e.message : String(e)}`); }
                tridentLog('INFO', 'trident-context-synthesis', `T2 COMPLETE: ${t2FinalDoc.split('\n').length} lines (compaction footer appended)`);
                return `T2 KNOWLEDGE BIBLE COMPLETE\n\nLines: ${t2FinalDoc.split('\n').length}\nCompaction-proof: YES (footer appended)\n\n📄 Artifact saved: ${t2Path}`;
              }

              // Compaction-proof marking present — save as-is
              const t2Path = await writeArtifactFile('CS_T2_KNOWLEDGE', t2Output, args.outputPath, args.outputName);
              storeArtifacts({ 'output': t2Output, 'mode': 'LLM_GENERATED' });
              try { csMachineActor.send({ type: 'FORMAT', sections: [t2Output] }); } catch (e: unknown) { tridentLog('WARN', 'trident-tools', `Error: ${e instanceof Error ? e.message : String(e)}`); }
              tridentLog('INFO', 'trident-context-synthesis', `T2 COMPLETE: ${t2Output.split('\n').length} lines (compaction-proof verified)`);
              return `T2 KNOWLEDGE BIBLE COMPLETE\n\nLines: ${t2Output.split('\n').length}\nCompaction-proof: VERIFIED\n\n📄 Artifact saved: ${t2Path}`;
            } catch (t2Err: unknown) {
              const t2Msg = t2Err instanceof Error ? t2Err.message : String(t2Err);
              tridentLog('ERROR', 'trident-context-synthesis', `T2 FAILED: ${t2Msg}`);
              return `T2 GENERATION ERROR: ${t2Msg}`;
            }
          }

          // ═══ v4.4.2 T1 INTERNAL LLM GENERATION ═══
          {
            try {
              tridentLog('INFO', 'trident-context-synthesis', 'T1: Internal LLM generation');
              // Read reference material
              const t1SourceExtracts = new Map<string, string>();
              if (args.targetPath) {
                const t1Files = await collectSourceFiles(args.targetPath);
                for (const tf of t1Files.slice(0, 10)) {
                  try { t1SourceExtracts.set(tf, fsSync.readFileSync(tf, 'utf-8')); } catch (e) { tridentLog('WARN', 'trident-tools', 'Non-fatal error: ' + (e instanceof Error ? e.message : String(e))); }
                }
              }
              if (args.targetPaths) {
                for (const tf of args.targetPaths) {
                  try { t1SourceExtracts.set(tf, fsSync.readFileSync(tf, 'utf-8')); } catch (e) { tridentLog('WARN', 'trident-tools', 'Non-fatal error: ' + (e instanceof Error ? e.message : String(e))); }
                }
              }
              const t1Strategy = getDefaultStrategy();
              const t1Brief = buildT1InjectableBrief(args, t1SourceExtracts, args.projectName || 'agent');
              const t1Output = await runInternalLLMLoop(t1Brief, null, t1Strategy, {
                useSplit: false, maxIterations: 1, skipQualityChecks: true,
              });
              const t1Path = await writeArtifactFile('CS_T1_INJECTABLE', t1Output, args.outputPath, args.outputName);
              storeArtifacts({ 'output': t1Output, 'mode': 'LLM_GENERATED' });
              try { csMachineActor.send({ type: 'COLLECT', context: t1Output }); } catch (e: unknown) { tridentLog('WARN', 'trident-tools', `Error: ${e instanceof Error ? e.message : String(e)}`); }
              tridentLog('INFO', 'trident-context-synthesis', `T1 COMPLETE: ${t1Output.split('\n').length} lines`);
              return `T1 INJECTABLE COMPLETE\n\nLines: ${t1Output.split('\n').length}\n\n📄 Artifact saved: ${t1Path}`;
            } catch (t1Err: unknown) {
              const t1Msg = t1Err instanceof Error ? t1Err.message : String(t1Err);
              tridentLog('ERROR', 'trident-context-synthesis', `T1 FAILED: ${t1Msg}`);
              return `T1 GENERATION ERROR: ${t1Msg}`;
            }
          }

        } catch (err: unknown) {
          const errMsg = err instanceof Error ? err.message : String(err);
          const errorId = `CS-ERR-${Date.now()}`;
          tridentLog('ERROR', 'trident-context-synthesis', `[${errorId}] ${errMsg}`);
          return JSON.stringify({ error: 'Context synthesis failed', errorId, message: (err instanceof Error ? err.message : String(err)) }, null, 2);
        }
      },
    }),

    'trident-poseidon': tridentPoseidonTool,

    'trident-gate': tool({
      description: 'Evaluate a specific audit layer or get gate criteria for a layer',
      args: {
        action: z.enum(['evaluate', 'criteria']).describe('evaluate=run layer, criteria=show what layer checks'),
        layer: z.enum(['R0', 'R1', 'R2', 'R3', 'R4', 'R5', 'R6', 'R7', 'R8', 'R9', 'R10', 'R11', 'R12', 'R13', 'R14', 'R15', 'R16']).describe('Audit layer to evaluate'),
        targetPath: z.string().optional().describe('Project path (required for evaluate)'),
      },
      execute: async (args: {
        action: 'evaluate' | 'criteria';
        layer: string;
        targetPath?: string;
      }) => {
        if (args.action === 'criteria') {
          const layerDescriptions: Record<string, string> = {
            R0: 'Build Chain Integrity — validates esbuild --bundle, --platform=node, build:check script',
            R1: 'Hook API Contract — validates input.agent, output.system, correct opencode 1.14.34 API',
            R2: 'State Machine Completeness — traces advanceLayer() calls, dead transitions',
            R3: 'Async Correctness — detects fire-and-forget, unhandled promises',
            R4: 'Error Handling — catches empty catch blocks, swallowed errors',
            R5: 'Container Deployment — validates binary, config, plugin paths for container',
            R6: 'Dependency Integrity — checks require in ESM, missing imports, .ts extensions',
            R7: 'Config Schema — validates opencode.json structure (model, provider, agent, plugin)',
            R8: 'Source Hygiene — detects dead exports, typos, duplicates',
            R9: 'Runtime Contract — catches key mismatches, hardcoded paths, type violations',
            R10: 'Invocation Integrity — finds defined-but-never-called enforcement functions',
            R11: 'Theatrical Integrity — detects () => true stubs, paper tiger enforcement',
            R12: 'Cross-Plugin Isolation — finds hooks without agent guards',
            R13: 'Data Flow Analysis — detects any→specific type flow, unvalidated→sensitive paths',
            R14: 'Control Flow Graph — finds dead error handlers, unreachable code, missing returns in catch',
            R15: 'Container Preflight — validates env vars, paths, bundle integrity',
            R16: 'Bible Enforcement — P1-P11 mechanical checks (defensive imports, type certainty, error completeness, etc.)',
          };
          return JSON.stringify({
            layer: args.layer,
            description: layerDescriptions[args.layer] || 'Unknown layer',
          }, null, 2);
        }

        if (!args.targetPath) {
          return JSON.stringify({ error: 'targetPath required for evaluate action' });
        }

        if (!(await fileExists(args.targetPath))) {
          return JSON.stringify({ error: 'targetPath does not exist', path: args.targetPath });
        }

        try {
          const engine = new AuditEngine();
          const result = await engine.auditSingleLayer(args.targetPath, args.layer);
          const gateFindings = result.findings;
          const corrections = new Set(gateFindings.map((f: any) => f.correction || ''));
          const sharedCorrection = corrections.size === 1 ? Array.from(corrections)[0] : null;
          const compactFindings = gateFindings.map((f: any) => ({
            file: f.file, line: f.line, severity: f.severity, category: f.category,
            description: f.description,
            evidence: typeof f.evidence === 'string' ? f.evidence.substring(0, 80) : f.evidence,
            confidence: f.confidence,
          }));
          return JSON.stringify({
            layer: args.layer,
            findingsCount: gateFindings.length,
            severityBreakdown: {
              critical: gateFindings.filter((f: any) => f.severity === 'CRITICAL').length,
              high: gateFindings.filter((f: any) => f.severity === 'HIGH').length,
              medium: gateFindings.filter((f: any) => f.severity === 'MEDIUM').length,
              low: gateFindings.filter((f: any) => f.severity === 'LOW').length,
            },
            sharedCorrection: sharedCorrection,
            topFindings: compactFindings.slice(0, 15),
            remainingCount: Math.max(0, compactFindings.length - 15),
            overallScore: result.score,
            grade: result.grade,
          }, null, 2);
        } catch (err: unknown) {
          // FINDING #2 FIX: Log error to file instead of silent catch
          const errMsg = err instanceof Error ? err.message : String(err);
          const errorId = `GATE-ERR-${Date.now()}`;
          tridentLog('ERROR', 'trident-gate', `[${errorId}] ${errMsg}`);
          return JSON.stringify({ error: (err instanceof Error ? err.message : String(err)), errorId });
        }
      },
    }),

    'trident-status': tool({
      description: 'Show current Trident Agent state: mode, layer, iteration, status, artifact metadata',
      args: {},
      execute: async () => {
        const state = orchestrator.getState();
        const artifactMeta: Record<string, { length: number; preview: string }> = {};
        for (const [key, value] of state.artifacts) {
          artifactMeta[key] = {
            length: value.length,
            preview: value.substring(0, 120),
          };
        }
        return JSON.stringify({
          mode: state.mode,
          currentLayer: state.currentLayer,
          maxLayers: orchestrator.getMaxLayers(),
          iteration: state.iteration,
          status: state.status,
          initialized: state.initialized,
          identityLoaded: state.identityLoaded,
          artifactCount: state.artifacts.size,
          artifactKeys: Array.from(state.artifacts.keys()),
          artifactMetadata: artifactMeta,
          lastIntent: state.lastIntent ? {
            mode: state.lastIntent.mode,
            reasoning: state.lastIntent.reasoning,
          } : null,
          corePrinciple: orchestrator.getCorePrinciple(),
        }, null, 2);
      },
    }),

    'trident-help': tool({
      description: 'Show Trident Agent help: modes, commands, 17-layer audit engine, artifacts',
      args: {},
      execute: async () => {
        return `## TRIDENT — Runtime Grade Audit Engine

**CORE PRINCIPLE:** "Trident Audits & Generates Review Artifacts. Build Agents Implement All Changes."

**MODE-BASED TOOLS (with pipeline validation):**
| Tool | Mode | Pipeline Layers | Artifacts |
|------|------|-----------------|-----------|
| trident-code-audit | CODE_REVIEW | 3 stages (preflight → R0-R16 → artifact) | Code review report |
| trident-deep-planning | DEEP_PLANNING | 3 layers (L1 first-principles → L2 workflow → L3 context-lib) | Build Spec + Context Library |
| trident-problem-solving | PROBLEM_SOLVING | Problem solving loop (triviality→classify→done→evidence→decide→act→verify→report) | Outcome-first result |
| trident-context-synthesis | CONTEXT_SYNTHESIS | 4 layers (collect→score→compress→inject) | T1 Injectable (outputMode=T1) / T2 Knowledge File (outputMode=T2) |

**SUPPORTING TOOLS:**
| Tool | Purpose |
|------|---------|
| trident-gate | Evaluate/query specific audit layers (R0-R16) |
| trident-status | Show current mode, layer, artifacts (machine-parseable JSON) |
| zai-vision_* / visual-cortex_* | VISION | MCP-based image analysis (replaces trident-vision) |
| trident-help | This reference |

**17-LAYER AUDIT ENGINE (inside CODE_REVIEW):**
| Layer | Name | What It Catches |
|-------|------|-----------------|
| R0 | Build Chain | tsc vs esbuild, missing --bundle |
| R1 | Hook Contract | Wrong input.agent, output.message.content |
| R2 | State Machine | Missing advanceLayer(), dead transitions |
| R3 | Async | Fire-and-forget, unhandled promises |
| R4 | Error Handling | Empty catch, swallowed errors |
| R5 | Container Deploy | Wrong binary, missing config |
| R6 | Dependencies | require() in ESM, .ts imports |
| R7 | Config Schema | opencode.json structure errors |
| R8 | Source Hygiene | Dead exports, typos |
| R9 | Runtime Contract | Key mismatches, hardcoded paths |
| R10 | Invocation | Defined-but-never-called functions |
| R11 | Theatrical | () => true stubs, paper tigers |
| R12 | Cross-Plugin | Hooks without agent guards |
| R13 | Data Flow Analysis | any→specific, unvalidated→sensitive paths |
| R14 | Control Flow Graph | Dead error handlers, unreachable paths |
| R15 | Container Pre-flight | Env vars, paths, bundle integrity |
| R16 | Bible Enforcement | P1-P11 mechanical checks |

**MODE MODULES (wired into tools):**
- DeepPlanningModule: validates 3-layer output quality
- ProblemSolvingModule: validates 6-layer reasoning + iteration tracking
- ContextSynthesisModule: validates 4-layer compression + injection`;
      },
    }),
  };
}
