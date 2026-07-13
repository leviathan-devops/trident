// @ts-ignore
import { tool } from '@opencode-ai/plugin';
import { z } from 'zod';
import * as path from 'path';
import * as fs from 'fs/promises';
import { tridentLog } from '../utils.js';
import { orchestrator } from '../orchestrator.js';
import { AuditEngine } from '../audit-engine/index.js';
import type { AuditFinding } from '../audit-engine/types.js';
import { generateCodeReviewArtifact } from '../artifacts/code-review-artifact.ts';
import { generateLayer1InitialPlan, generateLayer2DetailedWorkflow, generateContextLibraryManifest, generateContextBrief, buildLayer1Prompt } from '../artifacts/deep-planning-artifact.ts';
import { generatePipelineSpec } from '../artifacts/pipeline-generator.ts';
import { classifyProject } from '../audit-engine/code-classifier.ts';
import { generatePlanArtifact } from '../artifacts/problem-solving-artifact.ts';
import { ProblemSolver } from '../poseidon/problem-solver.js';
import type { ProblemContext } from '../poseidon/problem-solver.js';
import { generateT1Injectable, generateT2Artifact } from '../artifacts/context-synthesis-artifact.ts';
import { contextSynthesisEngine } from '../modes/context-synthesis-engine.js';
import * as fsSync from 'fs';
import { TRIDENT_CONFIG } from '../config.js';
import { deepPlanningModule } from '../modes/deep-planning.js';
import { problemSolvingModule } from '../modes/problem-solving.js';
import { contextSynthesisModule } from '../modes/context-synthesis.js';
// trident-vision REMOVED — replaced by zai-vision_* and visual-cortex_* MCP tools
import { tridentPoseidonTool } from './trident-poseidon.js';
import { discoverProject, type DiscoveryResult, type DiscoveredPattern, type DiscoveredFailure, type DiscoveredDecision } from '../shared/auto-discover.js';
import { interpret } from 'xstate';
import { deepPlanningMachine } from '../fsm/deep-planning-machine.js';
import { contextSynthesisMachine } from '../fsm/context-synthesis-machine.js';
import { problemSolvingMachine } from '../fsm/problem-solving-machine.js';
import { TsProgramWrapper } from '../warheads/ts-compiler-api/index.js';
import type { AnalyzerResult } from '../warheads/ts-compiler-api/program.js';
import { P1P10Verification } from '../warheads/p1-p10-scanner/index.js';

// M7: No shared singleton — create fresh AuditEngine per invocation
// M3: Wire completeLayer/failLayer for state machine hardening

// FINDING #10 FIX: Async readFile instead of sync readFileSync
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
  BUILD_SPEC: 'BUILD_SPEC',
  PLAN: 'PLAN',
  T1_INJECTABLE: 'T1_INJECTABLE',
  T2_KNOWLEDGE: 'T2_KNOWLEDGE',
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

async function writeArtifactFile(modeFolder: string, content: string): Promise<string> {
  const folder = MODE_FOLDERS[modeFolder] || modeFolder;
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

  // v4.3.3: No more escape hatch — report all failures, never skip
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
// SEMANTIC LAYER DETECTION FUNCTIONS
// ============================================================================

/**
 * Detect which problem-solving layer the user wants based on problem text.
 * Layer 1 = Assumption (default)
 * Layer 2 = Action
 * Layer 3 = Observation
 * Layer 4 = Gap Analysis
 * Layer 5 = Meta-Reflection
 * Layer 6 = Verification
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

export function createTridentTools() {
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
        targetPath: z.string().optional().describe('Absolute path to the project root (omit for pure forward-mapping from requirements)'),
        requirements: z.string().optional().describe('What this project needs to do — requirements text (required for forward-mapping when targetPath omitted)'),
        architecture: z.string().optional().describe('Architecture description — how the system is structured (auto-discovered if omitted)'),
        patterns: z.array(z.string()).optional().describe('Known patterns to include in context library (merged with auto-discovered patterns)'),
        failures: z.array(z.string()).optional().describe('Known failure modes to document (merged with auto-discovered failures)'),
        decisions: z.array(z.string()).optional().describe('Design decisions already made (merged with auto-discovered decisions)'),
        layer: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional().describe('Explicit layer override: 1=Initial Plan, 2=Detailed Workflow, 3=Context Library (auto-detected from requirements if omitted)'),
        contextFiles: z.array(z.string()).optional().describe('MANDATORY for L2/L3 when generating from external source code. Absolute paths to ALL source files the tool must read before generating. The tool reads each file, extracts TypeScript interfaces/classes/functions/algorithms, and returns a STRUCTURED BRIEF that tells the agent exactly what to write in each spec section. Without this, the tool can only template-fill from the section parameters below.'),
        outputPath: z.string().optional().describe('Absolute path where the final artifact .md file should be written. If omitted, defaults to GENERATED_ARTIFACTS/BUILD_SPEC/.'),

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
          // Step 1: Layer determination — explicit parameter ALWAYS wins
          // When targetPath is provided (backward mode), default to Layer 2 to trigger
          // the deterministic pipeline. When no targetPath (forward mode), default to Layer 1.
          const layer = args.layer || (args.targetPath ? 2 : 1);
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

          // Step 2: L1 = AUTO-GENERATE FROM DISCOVERY (no blank templates)
          if (layer === 1) {
            // Auto-fill sections from discovery data so Layer 1 produces real content
            const disc1 = discovery;
            const fc1 = disc1 ? disc1.totalFiles : 0;
            const lc1 = disc1 ? disc1.totalLines : 0;
            const langs1 = disc1 ? Object.entries(disc1.languages).map(function(e: [string, number]) { return e[0] + ' (' + e[1] + ')'; }).join(', ') : 'TypeScript';
            const eps1 = disc1 ? disc1.entryPoints.join(', ') : 'index.ts';

            if (!args.executiveSummary) (args as Record<string, unknown>).executiveSummary =
              '## Executive Summary\n\nRequirements: ' + inputParams + '\n\nProject: ' + fc1 + ' files, ' + lc1 + ' lines (' + langs1 + '). Entry points: ' + eps1 + '.\n' +
              (disc1 ? 'Discovery: ' + disc1.patterns.length + ' patterns, ' + disc1.failureModes.length + ' failure modes, ' + disc1.decisions.length + ' decisions.' : '');

            if (!args.architectureOverview) (args as Record<string, unknown>).architectureOverview =
              '## Architecture Overview\n\n' + (disc1 ? disc1.directoryTree : 'See project structure.') + '\n\nEntry points: ' + eps1;

            if (!args.dataModel) (args as Record<string, unknown>).dataModel =
              '## Data Model\n\nKey types and interfaces from discovery:\n' +
              (disc1 ? disc1.patterns.slice(0, 10).map(function(p: DiscoveredPattern) { return '- ' + p.name + ' (' + p.type + ') at ' + p.file + ':' + p.line; }).join('\n') : 'No patterns discovered.');

            if (!args.engineDesign) (args as Record<string, unknown>).engineDesign =
              '## Engine Class Design\n\nBased on ' + (disc1 ? disc1.patterns.length : 0) + ' discovered patterns and ' + (disc1 ? disc1.failureModes.length : 0) + ' failure modes.';

            if (!args.defenseRules || (Array.isArray(args.defenseRules) && args.defenseRules.length === 0)) (args as Record<string, unknown>).defenseRules =
              ['Validate inputs at boundaries', 'Log all errors with context', 'Use discriminated unions'];

            if (!args.blindSpots) (args as Record<string, unknown>).blindSpots =
              '## Blind Spots\n\n' + (disc1 && disc1.failureModes.length > 0
                ? 'Known failures: ' + disc1.failureModes.slice(0, 5).map(function(f: DiscoveredFailure) { return f.message; }).join('; ')
                : 'No failure modes discovered.');

            if (!args.integrationPlan) (args as Record<string, unknown>).integrationPlan =
              '## Integration Plan\n\n1. Implement types\n2. Build engine\n3. Wire into ' + eps1 + '\n4. Add defense rules\n5. Write tests';

            if (!args.evidenceFormat) (args as Record<string, unknown>).evidenceFormat =
              '## Evidence Format\n\nAll claims cite file:line evidence. Runtime verified via container TUI testing.';

            if (!args.testSpecs) (args as Record<string, unknown>).testSpecs =
              '## Test Specifications\n\n1. Unit tests for types\n2. Integration tests for engine\n3. Container TUI tests for runtime';

            if (!args.migrationStrategy) (args as Record<string, unknown>).migrationStrategy =
              '## Migration Strategy\n\nPhase 1: Add types (non-breaking)\nPhase 2: Build engine\nPhase 3: Wire in\nPhase 4: Deploy';

            tridentLog('INFO', 'trident-deep-planning', 'Layer 1 auto-generated all sections from discovery data.');
            // Fall through to assembly below — treat as Layer 2 with auto-filled sections
          }

          // === v4.4 PIPELINE PATH: Auto-generate spec from AST analysis ===
          // When layer=2 is called WITHOUT contextFiles and WITHOUT section content,
          // run the deterministic pipeline directly — no manual section writing needed.
          const hasPipelineSections = args.executiveSummary || args.dataModel || args.engineDesign ||
                                      args.defenseRules || args.integrationPlan || args.testSpecs;
          if (layer === 2 && !args.contextFiles && !hasPipelineSections) {
            try {
              const tsconfigPath = path.join(targetPathForGen, 'tsconfig.json');
              const tsconfig = fsSync.existsSync(tsconfigPath)
                ? JSON.parse(fsSync.readFileSync(tsconfigPath, 'utf-8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*/g, ''))
                : null;
              const preflight = {
                typeCheckPassed: true, typeCheckError: null,
                buildPassed: true, buildError: null,
                distExists: false, distIsSingleFile: false,
                distSize: 0, hasRelativeImports: false, sourceMapExists: false,
                findings: [] as { check: string; passed: boolean; detail: string }[],
              };
              const pkgJson = discovery?.packageJson
                ? (discovery.packageJson as Record<string, unknown>) as Record<string, unknown> | null
                : null;
              const analysisContext = classifyProject(targetPathForGen, preflight, pkgJson, tsconfig, null);
              if (analysisContext && analysisContext.constructs.length > 0) {
                tridentLog('INFO', 'trident-deep-planning', `Pipeline mode: ${analysisContext.constructs.length} constructs, callGraph ${analysisContext.callGraph?.coveragePercent ?? 0}%`);
                const pipelineOutput = generatePipelineSpec(
                  analysisContext.constructs,
                  analysisContext.callGraph,
                  inputParams,
                  architecture,
                  discovery,
                  projectName,
                  targetPathForGen,
                );
                const pipelineArtifactPath = await writeArtifactFile('BUILD_SPEC', pipelineOutput);
                storeArtifacts({
                  'layer': '2',
                  'layer-name': 'DETAILED WORKFLOW (PIPELINE)',
                  'output': pipelineOutput,
                  'mode': 'PIPELINE_GENERATED',
                });
                try { machineActor.send({ type: 'SUBMIT_LAYER2', count: 10 }); orchestrator.completeLayer(); } catch (e: unknown) { tridentLog('WARN', 'trident-tools', `Error: ${e instanceof Error ? e.message : String(e)}`); }
                return pipelineOutput + (pipelineArtifactPath ? `\n\n---\n📄 Artifact saved: \`${pipelineArtifactPath}\`` : '');
              }
              // classifyProject returned no constructs — fall through to contextFiles requirement
              tridentLog('INFO', 'trident-deep-planning', 'Pipeline mode: no constructs found, falling through to contextFiles');
            } catch (pipeErr) {
              tridentLog('WARN', 'trident-deep-planning', `Pipeline mode failed: ${pipeErr instanceof Error ? pipeErr.message : String(pipeErr)} — falling through`);
            }
          }

          // Step 3: L2/L3 REQUIRE contextFiles (when pipeline didn't produce output)
          if ((layer === 2 || layer === 3) && (!args.contextFiles || args.contextFiles.length === 0)) {
            throw new Error(
              'contextFiles is REQUIRED for Layer ' + layer + '. ' +
              'Alternatively, ensure the targetPath contains .ts files for auto-analysis. ' +
              'Example: contextFiles=["/path/to/file1.ts", "/path/to/file2.ts"]'
            );
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

          artifactPath = await writeArtifactFile('BUILD_SPEC', output);
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
      description: 'Run PROBLEM_SOLVING mode: 6-layer pipeline (Assumption → Action → Observation → Gap Analysis → Meta-Reflection → Verification). Validates output against ProblemSolvingModule requirements at each layer. Produces plan artifact with reasoning chain, RCA, working plan.',
      args: {
        targetPath: z.string().describe('Absolute path to the affected project'),
        problem: z.string().describe('Problem statement — what is broken or wrong'),
        reasoning: z.array(z.string()).describe('Reasoning chain steps. Use "observation|hypothesis|evidence|conclusion" pipe format for best table output'),
        workingPlan: z.array(z.string()).describe('Working plan phases. Use "description|files|expected outcome|risk|rollback" pipe format for best table output'),
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
          // Detect which problem-solving layer the user wants (for semantic routing)
          const detectedLayer = detectProblemSolvingLayer(args.problem);
          orchestrator.startProblemSolving();
          const psMachineActor = interpret(problemSolvingMachine).start();

          // Wire auto-discovery for genuine evidence synthesis (D3/D5/D6 fixes)
          let discovery;
          try {
            discovery = await discoverProject(args.targetPath || process.cwd());
          } catch (e: unknown) {
            tridentLog('WARN', 'trident-tools', `Error: ${e instanceof Error ? e.message : String(e)}`);
            discovery = undefined;
            // Safe to continue — discovery stays undefined, artifact generator handles null discovery
          }

          // Populate realCodeMap for reasoning chain evidence (same pattern as context-synthesis T2)
          const psRealCodeMap = new Map<string, string>();
          if (args.targetPath && discovery && discovery.patterns.length > 0) {
            const psFileIndex = new Map<string, string[]>();
            const psBuildIndex = (dir: string, depth: number) => {
              if (depth > 10) return;
              try {
                for (const entry of fsSync.readdirSync(dir, { withFileTypes: true })) {
                  if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist') continue;
                  const full = path.join(dir, entry.name);
                  if (entry.isDirectory()) psBuildIndex(full, depth + 1);
                  else if (entry.isFile()) {
                    const arr = psFileIndex.get(entry.name) || [];
                    arr.push(full);
                    psFileIndex.set(entry.name, arr);
                  }
                }
              } catch (e: unknown) { tridentLog('WARN', 'trident-tools', `Error: ${e instanceof Error ? e.message : String(e)}`); /* skip */ }
            };
            psBuildIndex(args.targetPath, 0);
            for (const pat of discovery.patterns.slice(0, 30)) {
              try {
                const candidates = psFileIndex.get(pat.file);
                if (!candidates || candidates.length === 0) continue;
                const content = fsSync.readFileSync(candidates[0], 'utf-8');
                const lines = content.split('\n');
                const startLine = Math.max(0, pat.line - 1);
                const snippet = lines.slice(startLine, startLine + 20).join('\n');
                psRealCodeMap.set(pat.file + ':' + pat.line, snippet);
              } catch (e: unknown) { tridentLog('WARN', 'trident-tools', `Error: ${e instanceof Error ? e.message : String(e)}`); /* skip */ }
            }
          }

          const iteration = problemSolvingModule.getIteration();
          
          // === 6-FRAMEWORK PROBLEM SOLVER ENGINE ===
          // Run the intelligent ProblemSolver with Five Whys, Fault Tree, Systems Thinking,
          // Pareto, First Principles, and Hypothesis-Driven frameworks
          let frameworkAnalysis = '';
          try {
            const solver = new ProblemSolver(args.targetPath);
            const findingLayers: string[] = [];
            const findingBreakdown: Record<string, number> = {};
            if (discovery) {
              for (const pat of discovery.patterns) {
                const layerName = pat.type + ':' + pat.name;
                if (findingLayers.indexOf(layerName) === -1) findingLayers.push(layerName);
                findingBreakdown[layerName] = (findingBreakdown[layerName] || 0) + 1;
              }
              for (const fail of discovery.failureModes) {
                const layerName = 'FAILURE:' + fail.pattern;
                if (findingLayers.indexOf(layerName) === -1) findingLayers.push(layerName);
                findingBreakdown[layerName] = (findingBreakdown[layerName] || 0) + 1;
              }
            }
            const context: ProblemContext = {
              symptom: args.problem,
              score: 0,
              highestScore: 0,
              cycle: 0,
              stalledSince: 0,
              targetPath: args.targetPath,
              findingLayers,
              findingCount: findingLayers.length,
              findingBreakdown,
              scoreHistory: [],
            };
            const solution = solver.solve(context);
            frameworkAnalysis = solution.instructions + '\n\n---\n\n';
            tridentLog('INFO', 'trident-problem-solving', `6-framework analysis complete: rootCause=${solution.rootCause.substring(0, 80)}, confidence=${solution.diagnoses.length} frameworks applied`);
          } catch (fwErr) {
            tridentLog('WARN', 'trident-problem-solving', `Framework analysis failed (non-fatal), using template only: ${fwErr instanceof Error ? fwErr.message : String(fwErr)}`);
          }
          
          const artifact = frameworkAnalysis + generatePlanArtifact(
            args.targetPath,
            args.problem,
            args.reasoning,
            args.workingPlan,
            args.findings || [],
            discovery
          );

          const validations: Array<{ layer: number; name: string; valid: boolean; missing: string[] }> = [];
          for (let layer = 1; layer <= 6; layer++) {
            const config = problemSolvingModule.getLayerConfig(layer);
            const v = problemSolvingModule.validateLayerContent(layer, artifact);
            validations.push({ layer, name: config?.name || `Layer ${layer}`, ...v });
            // Validation failure is a WARNING, not an error — always advance
            orchestrator.completeLayer();

            // Wire FSM events for each problem-solving layer
            if (layer === 1) psMachineActor.send({ type: 'SUBMIT_ASSUMPTION' });
            else if (layer === 2) psMachineActor.send({ type: 'SUBMIT_ACTION' });
            else if (layer === 3) psMachineActor.send({ type: 'SUBMIT_OBSERVATION' });
            else if (layer === 4) psMachineActor.send({ type: 'SUBMIT_GAP' });
            else if (layer === 5) psMachineActor.send({ type: 'SUBMIT_META' });
            else if (layer === 6) psMachineActor.send({ type: 'SUBMIT_VERIFICATION' });
          }

          const mdPath = await writeArtifactFile('PLAN', artifact);
          storeArtifacts({
            'problem-solving-plan': artifact,
            'artifact-path': mdPath,
            'validation-report': JSON.stringify(validations),
            'iteration': String(iteration),
            'detected-layer': String(detectedLayer),
          });

          return artifact + (mdPath ? `\n\n---\n📄 Artifact saved: \`${mdPath}\`` : '') + '\n\n---\n\n' + formatValidationReport(validations, `PROBLEM_SOLVING (${iteration})`);
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
            // Auto-discover for dense T2 content — discovery already run above

            // ---- T2: Dense knowledge file written to disk ----
            // v4.4.1: Kill fabricated code examples. Read REAL source files and feed through engine.
            const realCodeMap = new Map<string, string>();

            // Build a basename → fullpath index for the project so we can resolve pattern.file
            const _basePath = args.targetPath || '';
            if (_basePath && discovery && discovery.patterns.length > 0) {
              const fileIndex = new Map<string, string[]>();
              const buildIndex = (dir: string, depth: number) => {
                if (depth > 10) return;
                try {
                  for (const entry of fsSync.readdirSync(dir, { withFileTypes: true })) {
                    if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist') continue;
                    const full = path.join(dir, entry.name);
                    if (entry.isDirectory()) buildIndex(full, depth + 1);
                    else if (entry.isFile()) {
                      const arr = fileIndex.get(entry.name) || [];
                      arr.push(full);
                      fileIndex.set(entry.name, arr);
                    }
                  }
                } catch (e: unknown) { tridentLog('WARN', 'trident-tools', `Error: ${e instanceof Error ? e.message : String(e)}`); /* skip unreadable dirs */ }
              };
              buildIndex(_basePath, 0);

              // For each discovered pattern, read the ACTUAL source file
              const shown = discovery.patterns.slice(0, Math.max(30, Math.floor((args.targetLines || 1000) / 10)));
              for (const pat of shown) {
                try {
                  const candidates = fileIndex.get(pat.file);
                  if (!candidates || candidates.length === 0) continue;
                  const content = fsSync.readFileSync(candidates[0], 'utf-8');
                  const lines = content.split('\n');
                  const startLine = Math.max(0, pat.line - 1);
                  // v4.4.1: Scale code examples to meet targetLines (75-90% of target)
                  const scaleFactor = Math.max(1, Math.floor((args.targetLines || 1000) / 500));
                  const snippetLines = Math.min(30 * scaleFactor, 80); // 30, 60, 80 lines based on scale
                  const snippet = lines.slice(startLine, startLine + snippetLines).join('\n');
                  realCodeMap.set(pat.file + ':' + pat.line, snippet);
                } catch (e: unknown) {
                  tridentLog('WARN', 'trident-tools', `Error: ${e instanceof Error ? e.message : String(e)}`);
                  // Skip unreadable files
                }
              }
              tridentLog('INFO', 'trident-context-synthesis', `T2 real source: read ${realCodeMap.size} actual code snippets from disk`);
            }

            // Build source material from REAL code for engine synthesis
            const t2SourceMap = new Map<string, string>();
            if ((args.keyFacts || []).length > 0) t2SourceMap.set('key-facts', (args.keyFacts || []).join('\n'));
            if ((args.patterns || []).length > 0) t2SourceMap.set('user-patterns', (args.patterns || []).join('\n'));
            for (const [key, snippet] of realCodeMap) {
              t2SourceMap.set('code/' + key, snippet);
            }

            // Synthesize through engine: collect → score → compress → inject
            let t2EngineSections: string[] = [];
            try {
              if (t2SourceMap.size > 0) {
                const t2EngineResult = await contextSynthesisEngine.synthesize(t2SourceMap);
                t2EngineSections = t2EngineResult.sections;
                tridentLog('INFO', 'trident-context-synthesis', `T2 engine: synthesized ${t2EngineResult.totalTokens} tokens across ${t2EngineSections.length} sections`);
              }
            } catch (e: unknown) {
              tridentLog('WARN', 'trident-tools', `Error: ${e instanceof Error ? e.message : String(e)}`);
              tridentLog('WARN', 'trident-context-synthesis', `T2 engine synthesis failed: ${e instanceof Error ? e.message : String(e)}`);
              return;
            }

            const t2 = await generateT2Artifact(
              args.projectName,
              args.patterns || [],
              args.keyFacts || [],
              args.targetPath,
              discovery,
              args.targetLines,
              realCodeMap,
            );
            // Append engine-synthesized sections to T2 content if produced
            const t2Content = t2EngineSections.length > 0
              ? t2.content + '\n\n## Engine-Synthesized Context (Real Source)\n\n' + t2EngineSections.join('\n\n') + '\n'
              : t2.content;
            csMachineActor.send({ type: 'COLLECT', context: t2Content });

            // Auto-dispatch trident_explore subagents if targetPaths provided and outputMode is T2
            if (args.targetPaths && args.targetPaths.length > 0 && mode === 'T2') {
              const explorePlan = contextSynthesisModule.buildExplorerDispatchTemplate(
                args.targetPaths.slice(0, 5),
                Math.min(args.targetPaths.length, 5)
              );
              storeArtifacts({
                'explore-dispatch-plan': explorePlan,
              });
              tridentLog('INFO', 'trident-context-synthesis', `Explore dispatch plan generated for ${Math.min(args.targetPaths.length, 5)} subagents`);
            }

            const validations: Array<{ layer: number; name: string; valid: boolean; missing: string[] }> = [];
            for (let layer = 1; layer <= 4; layer++) {
              const config = contextSynthesisModule.getLayerConfig(layer);
              const v = contextSynthesisModule.validateLayerContent(layer, t2Content);
              validations.push({ layer, name: config?.name || `Layer ${layer}`, ...v });
              // Validation failure is a WARNING, not an error — always advance
              orchestrator.completeLayer();

              // Wire FSM events for CS layers
              if (layer === 1) csMachineActor.send({ type: 'COLLECT', context: t2Content });
              else if (layer === 2) csMachineActor.send({ type: 'SCORE' });
              else if (layer === 3) csMachineActor.send({ type: 'COMPRESS', compressed: t2Content });
              else if (layer === 4) csMachineActor.send({ type: 'FORMAT', sections: t2.sections });
            }

            // v4.4.1: Re-write artifact to disk with engine-enriched content
            if (t2Content !== t2.content) {
              try { await fs.writeFile(t2.path, t2Content, 'utf-8'); } catch (e: unknown) { tridentLog('WARN', 'trident-tools', `Error: ${e instanceof Error ? e.message : String(e)}`); /* non-fatal */ }
            }

            storeArtifacts({
              't2-knowledge': t2Content,
              't2-artifact-path': t2.path,
              'validation-report': JSON.stringify(validations),
              't2-metadata': JSON.stringify({ lineCount: t2.lineCount, sizeKB: t2.sizeKB, sections: t2.sections }),
            });

            let summary = `# T2 Knowledge File Generated: ${args.projectName}\n\n`;
            summary += `**Output Mode:** T2 (dense, bible-style standalone knowledge file)\n`;
            summary += `**File Path:** \`${t2.path}\`\n\n`;
            summary += `## Structure Overview\n\n`;
            summary += `| Metric | Value |\n`;
            summary += `|--------|-------|\n`;
            summary += `| Lines | ${t2.lineCount} |\n`;
            summary += `| Size | ${t2.sizeKB} KB |\n`;
            summary += `| Sections | ${t2.sections.length} |\n\n`;
            summary += `**Sections Detected:**\n`;
            for (const s of t2.sections) { summary += `- ${s}\n`; }
            summary += `\n## Preview (first 500 chars)\n\n`;
            summary += `\`\`\`markdown\n${t2.preview}\n\`\`\`\n\n`;
            summary += `---\n📄 T2 Knowledge File saved: \`${t2.path}\`\n\n`;
            summary += `---\n\n` + formatValidationReport(validations, 'CONTEXT_SYNTHESIS (T2)');
            return {
              output: t2Content,
              summary,
              artifactPath: t2.path,
              sections: t2.sections,
              lineCount: t2.lineCount,
              sizeKB: t2.sizeKB,
            };
          }

          // ---- T1 (default): Lightweight injectable ----
          // v4.4.1: Use ACTUAL engine pipeline instead of dead artifact generators
          // Build source material from user input
          const t1SourceMap = new Map<string, string>();
          if ((args.patterns || []).length > 0) t1SourceMap.set('user-patterns', (args.patterns || []).join('\n'));
          if ((args.keyFacts || []).length > 0) t1SourceMap.set('key-facts', (args.keyFacts || []).join('\n'));

          // Run through engine: collect → score → compress → inject
          let t1EngineOutput = '';
          try {
            if (t1SourceMap.size > 0) {
              const t1Result = await contextSynthesisEngine.synthesize(t1SourceMap);
              t1EngineOutput = t1Result.sections.join('\n\n');
              tridentLog('INFO', 'trident-context-synthesis', `T1 engine: synthesized ${t1Result.totalTokens} tokens across ${t1Result.sections.length} sections`);
            }
          } catch (e: unknown) {
            tridentLog('WARN', 'trident-tools', `Error: ${e instanceof Error ? e.message : String(e)}`);
            tridentLog('WARN', 'trident-context-synthesis', `T1 engine synthesis failed: ${e instanceof Error ? e.message : String(e)}`);
            return;
          }

          // Generate base config + append engine output as enrichment
          const artifact = generateT1Injectable(
            args.projectName,
            args.config || { model: 'deepseek/deepseek-v4-flash' },
            args.patterns || [],
            args.keyFacts || [],
            discovery || null,
          );
          // Append engine-synthesized context if produced
          const finalArtifact = t1EngineOutput
            ? artifact + '\n\n## Engine-Synthesized Context (NLP Pipeline)\n\n' + t1EngineOutput + '\n'
            : artifact;
          csMachineActor.send({ type: 'COLLECT', context: finalArtifact });

          const validations: Array<{ layer: number; name: string; valid: boolean; missing: string[] }> = [];
          for (let layer = 1; layer <= 4; layer++) {
            const config = contextSynthesisModule.getLayerConfig(layer);
            const v = contextSynthesisModule.validateLayerContent(layer, finalArtifact);
            validations.push({ layer, name: config?.name || `Layer ${layer}`, ...v });
            // Validation failure is a WARNING, not an error — always advance
            orchestrator.completeLayer();

            // Wire FSM events for CS layers
            if (layer === 1) csMachineActor.send({ type: 'COLLECT', context: finalArtifact });
            else if (layer === 2) csMachineActor.send({ type: 'SCORE' });
            else if (layer === 3) csMachineActor.send({ type: 'COMPRESS', compressed: finalArtifact });
            else if (layer === 4) csMachineActor.send({ type: 'FORMAT', sections: [finalArtifact] });
          }

          const mdPath = await writeArtifactFile('T1_INJECTABLE', finalArtifact);
          storeArtifacts({
            't1-injectable': finalArtifact,
            'artifact-path': mdPath,
            'validation-report': JSON.stringify(validations),
          });

          return finalArtifact + (mdPath ? `\n\n---\n📄 Artifact saved: \`${mdPath}\`` : '') + '\n\n---\n\n' + formatValidationReport(validations, 'CONTEXT_SYNTHESIS');
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
          return JSON.stringify({
            layer: args.layer,
            findingsCount: result.findings.length,
            findings: result.findings,
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
      description: 'Show current Trident Brain v4.3 state: mode, layer, iteration, status, artifact metadata',
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
      description: 'Show Trident Brain v4.3 help: modes, commands, 17-layer audit engine, artifacts',
      args: {},
      execute: async () => {
        return `## TRIDENT BRAIN v4.3 — Runtime Grade Audit Engine

**CORE PRINCIPLE:** "Trident Audits & Generates Review Artifacts. Build Agents Implement All Changes."

**MODE-BASED TOOLS (with pipeline validation):**
| Tool | Mode | Pipeline Layers | Artifacts |
|------|------|-----------------|-----------|
| trident-code-audit | CODE_REVIEW | 3 stages (preflight → R0-R16 → artifact) | Code review report |
| trident-deep-planning | DEEP_PLANNING | 3 layers (L1 first-principles → L2 workflow → L3 context-lib) | Build Spec + Context Library |
| trident-problem-solving | PROBLEM_SOLVING | 6 layers (assumption→action→observe→gap→meta→verify) | Plan + RCA |
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
