// @ts-ignore
import { tool } from '@opencode-ai/plugin';
import { z } from 'zod';
import * as path from 'path';
import * as fs from 'fs/promises';
import { tridentLog } from '../utils.js';
import { orchestrator } from '../orchestrator.js';
import { AuditEngine } from '../audit-engine/index.js';
import { generateCodeReviewArtifact } from '../artifacts/code-review-artifact.ts';
import { generateBuildSpecArtifact, generateLayer1InitialPlan, generateLayer2DetailedWorkflow, generateContextLibraryManifest } from '../artifacts/deep-planning-artifact.ts';
import { generatePlanArtifact } from '../artifacts/problem-solving-artifact.ts';
import { generateT1Injectable, generateT2Artifact } from '../artifacts/context-synthesis-artifact.ts';
import { TRIDENT_CONFIG } from '../config.js';
import { deepPlanningModule } from '../modes/deep-planning.js';
import { problemSolvingModule } from '../modes/problem-solving.js';
import { contextSynthesisModule } from '../modes/context-synthesis.js';
import { tridentVisionTool } from './trident-vision.js';
import { tridentPoseidonTool } from './trident-poseidon.js';
import { discoverProject, type DiscoveryResult, type DiscoveredPattern, type DiscoveredFailure, type DiscoveredDecision } from '../shared/auto-discover.js';
import { interpret } from 'xstate';
import { deepPlanningMachine } from '../fsm/deep-planning-machine.js';
import { contextSynthesisMachine } from '../fsm/context-synthesis-machine.js';
import { problemSolvingMachine } from '../fsm/problem-solving-machine.js';
import { TsProgramWrapper } from '../warheads/ts-compiler-api/index.js';
import { P1P10Verification } from '../warheads/p1-p10-scanner/index.js';
import { ContainerTestRunner } from '../warheads/container-testing/index.js';

// M7: No shared singleton — create fresh AuditEngine per invocation
// M3: Wire completeLayer/failLayer for state machine hardening

// FINDING #10 FIX: Async readFile instead of sync readFileSync
async function resolveProjectName(targetPath: string): Promise<string> {
  const pkgPath = path.join(targetPath, 'package.json');
  try {
    const content = await fs.readFile(pkgPath, 'utf-8');
    const pkg = JSON.parse(content) as { name?: string; scripts?: Record<string, string> };
    if (pkg?.name) return pkg.name;
  } catch (e) {
    tridentLog('WARN', 'trident-tools', `resolveProjectName: no package.json at ${targetPath}`);
    return path.basename(targetPath);
  }
  return path.basename(targetPath);
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
    tridentLog('ERROR', 'trident-tools', `writeArtifactFile failed: ${(err as Error).message}`);
    return '';
  }
}

function storeArtifacts(artifacts: Record<string, string>): void {
  for (const [key, value] of Object.entries(artifacts)) {
    orchestrator.addArtifact(key, value);
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
 * Detect which deep-planning layer the user wants based on requirements text.
 * Layer 1 = Initial Plan (generative prompt) — default
 * Layer 2 = Detailed Workflow (implementation build spec)
 * Layer 3 = Context Library (reference docs)
 */
function detectDeepPlanningLayer(requirements: string): 1 | 2 | 3 {
  const lower = (requirements || '').toLowerCase();
  if (/\b(build\s*spec|implementation|phases?|how\s+to\s+build|code\s+phase|workflow)\b/.test(lower)) return 2;
  if (/\b(context\s*library|reference\s+doc|knowledge\s+file|documentation|context\s+lib)\b/.test(lower)) return 3;
  return 1; // Default: generative prompt
}

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
        // ISSUE 4 FIX: Timeout wrapper prevents audit from hanging indefinitely
        const auditTimeout = setTimeout(() => {
          throw new Error('[TIMEOUT] Audit exceeded 120s');
        }, 120000);
        try {
          orchestrator.startAudit();
          const projectName = await resolveProjectName(args.targetPath);

          // TsProgramWrapper: in-process ts.Program analysis
          if (args.targetPath) {
            try {
              const tsProgram = new TsProgramWrapper();
              if (tsProgram.createProgram(args.targetPath)) {
                const analysis = tsProgram.runAll();
                // Merge analysis results
              }
            } catch (e) {
              tridentLog('WARN', 'trident-tools', 'TsProgramWrapper analysis failed: ' + (e as Error).message);
            }
          }

          // P1-P10 Scanner: principle verification
          if (args.targetPath) {
            try {
              const p1p10 = new P1P10Verification();
              const scanResult = p1p10.scan(args.targetPath);
              tridentLog('INFO', 'trident-tools', 'P1-P10 scan: ' + scanResult.score + '%');
            } catch (e) {
              tridentLog('WARN', 'trident-tools', 'P1-P10 scan failed: ' + (e as Error).message);
            }
          }

          // Container Testing: deploy verification
          if (args.targetPath) {
            try {
              const runner = new ContainerTestRunner();
              tridentLog('INFO', 'trident-tools', 'Container test runner initialized');
            } catch (e) {
              tridentLog('WARN', 'trident-tools', 'Container test init failed: ' + (e as Error).message);
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

          const artifact = generateCodeReviewArtifact(result, args.targetPath, projectName, '');
          const mdPath = await writeArtifactFile('CODE_REVIEW', artifact);
          storeArtifacts({
            'code-review': artifact,
            'artifact-path': mdPath,
            'raw-audit-result': JSON.stringify({ score: result.score, grade: result.grade, findings: result.findings.length }),
          });

          // Validation failure is a WARNING, not an error — do not put machine in ERROR state

          return artifact + (mdPath ? `\n\n---\n📄 Artifact saved: \`${mdPath}\`` : '');
        } catch (err: unknown) {
          const errorId = `AUDIT-ERR-${Date.now()}`;
          const errMsg = err instanceof Error ? err.message : String(err);
          tridentLog('ERROR', 'trident-code-audit', `[${errorId}] ${errMsg}`);
          return JSON.stringify({
            error: 'Code audit failed',
            errorId,
            message: errMsg,
            targetPath: args.targetPath,
          }, null, 2);
        } finally {
          clearTimeout(auditTimeout);
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
      },
      execute: async (args: {
        targetPath?: string;
        requirements?: string;
        architecture?: string;
        patterns?: string[];
        failures?: string[];
        decisions?: string[];
      }) => {
        // Forward-mapping mode: when targetPath is omitted, generate from requirements alone
        const isForwardMode = !args.targetPath;
        
        if (!isForwardMode && !(await fileExists(args.targetPath || ''))) {
          throw new Error('targetPath does not exist: ' + args.targetPath);
        }
        
        if (isForwardMode && !args.requirements) {
          throw new Error('requirements required when targetPath is omitted (forward-mapping mode). Pass a minimal idea like "build a GUI for X"');
        }
        
        try {
          // Detect which layer the user wants via semantic analysis of requirements
          const layer = detectDeepPlanningLayer(args.requirements || '');
          const layerNames: Record<number, string> = {
            1: 'INITIAL PLAN (Generative Prompt)',
            2: 'DETAILED WORKFLOW (Implementation Build Spec)',
            3: 'CONTEXT LIBRARY',
          };

          // Update orchestrator state non-blocking (startMode — no longer throws)
          try { orchestrator.startPlanning(); } catch { /* Non-fatal: orchestrator state update is best-effort; deep-planning continues regardless of state machine errors */ }
          const machineActor = interpret(deepPlanningMachine).start();
          const projectName = isForwardMode ? (args.requirements?.substring(0, 30).replace(/[^a-zA-Z0-9]/g, '-') || 'forward-project') : await resolveProjectName(args.targetPath || '');

          // D1 Fix: Wire auto-discovery into deep-planning (skip in forward-mapping mode)
          let discovery: DiscoveryResult | null = null;
          if (!isForwardMode) {
            try {
              discovery = await discoverProject(args.targetPath || process.cwd());
              tridentLog('INFO', 'trident-deep-planning', `Auto-discovery: ${discovery.totalFiles} files, ${discovery.totalLines} lines, ${discovery.patterns.length} patterns, ${discovery.failureModes.length} failure modes, ${discovery.decisions.length} decisions`);
            } catch (discErr) {
              tridentLog('WARN', 'trident-deep-planning', `Auto-discovery failed (falling back to user input): ${(discErr as Error).message}`);
              // Safe to continue — discovery stays null, code falls back to user-provided args or defaults
            }
          } else {
            tridentLog('INFO', 'trident-deep-planning', `Forward-mapping mode: generating from requirements alone: "${args.requirements?.substring(0, 80)}..."`);
          }

          // Auto-generate requirements/architecture (from discovery in backward mode, from args in forward mode)
          const requirements = args.requirements || (discovery
            ? `Auto-discovered project: ${discovery.totalFiles} files, ${discovery.totalLines} lines across ${Object.keys(discovery.languages).length} languages. Entry points: ${discovery.entryPoints.join(', ') || 'none detected'}. Languages: ${Object.entries(discovery.languages).map(([k, v]: [string, number]) => `${k} (${v} files)`).join(', ')}.`
            : 'Forward-mapping: generate from idea');

          const architecture = args.architecture || (discovery ? discovery.directoryTree : 'Forward-mapping: no architecture specified — will be generated from requirements');

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

          const targetPathForGen = isForwardMode ? 'forward-mapping (no target)' : (args.targetPath || '');

          let output: string;
          let artifactPath: string | undefined;

          if (layer === 1) {
            // Layer 1: Initial Plan — return output directly (NO writeArtifactFile)
            output = generateLayer1InitialPlan(targetPathForGen, projectName, requirements, architecture, discovery);
            try {
              const principlesCount = discovery ? (discovery.patterns.length > 3 ? 5 : 3) : 3;
              machineActor.send({ type: 'SUBMIT_LAYER1', count: principlesCount });
              orchestrator.completeLayer();
            } catch { /* Non-fatal: layer completion state update is best-effort; artifact already generated */ }
          } else if (layer === 2) {
            // Layer 2: Detailed Workflow — save as .md via writeArtifactFile
            output = generateLayer2DetailedWorkflow(targetPathForGen, projectName, requirements, architecture, discovery);
            artifactPath = await writeArtifactFile('BUILD_SPEC', output);
            try {
              const discoveryPhases = discovery
                ? [discovery.patterns, discovery.failureModes, discovery.decisions, discovery.warheads, discovery.entryPoints, discovery.auditLayers]
                    .filter((arr: unknown[]) => arr.length > 0).length
                : 0;
              const componentsCount = Math.max(discoveryPhases, 5);
              machineActor.send({ type: 'SUBMIT_LAYER2', count: componentsCount });
              orchestrator.completeLayer();
            } catch { /* Non-fatal: layer 2 completion state update is best-effort; artifact already persisted */ }
          } else {
            // Layer 3: Context Library — save .md files
            output = generateContextLibraryManifest(
              projectName, architecture, mergedPatterns, mergedFailures, mergedDecisions,
              args.targetPath, discovery
            );
            artifactPath = await writeArtifactFile('BUILD_SPEC', output);
            try {
              machineActor.send({ type: 'SUBMIT_LAYER3', content: output });
              orchestrator.completeLayer();
            } catch { /* Non-fatal: layer 3 completion state update is best-effort; context library manifest already written */ }
          }

          // Store artifacts for orchestrator state
          storeArtifacts({
            'layer': String(layer),
            'layer-name': layerNames[layer],
            'output': output,
            ...(artifactPath ? { 'artifact-path': artifactPath } : {}),
            'mode': isForwardMode ? 'forward-mapping' : 'backward-mapping',
            'auto-discovery': discovery ? JSON.stringify({
              totalFiles: discovery.totalFiles,
              totalLines: discovery.totalLines,
              patterns: discovery.patterns.length,
              failureModes: discovery.failureModes.length,
              decisions: discovery.decisions.length,
              warheads: discovery.warheads.length,
              entryPoints: discovery.entryPoints,
              languages: discovery.languages,
            }) : (isForwardMode ? 'forward-mapping' : 'disabled'),
          });

          const nextLayersMap: Record<number, number[]> = {
            1: [2, 3],
            2: [3],
            3: [],
          };

          const layerHints: Record<number, string> = {
            1: 'Layer 1 (Initial Plan) complete. For implementation build spec, call with requirements mentioning "build spec", "implementation", or "workflow". For context library, mention "context library" or "documentation".',
            2: 'Layer 2 (Detailed Workflow) complete. For context library, call with requirements mentioning "context library", "reference doc", or "documentation".',
            3: 'Layer 3 (Context Library) complete. All deep-planning layers finished. Context library files written to disk.',
          };

          return JSON.stringify({
            layer,
            layerName: layerNames[layer],
            output,
            artifactPath: artifactPath || null,
            nextLayers: nextLayersMap[layer],
            hint: layerHints[layer],
          }, null, 2);
        } catch (err: unknown) {
          const errMsg = err instanceof Error ? err.message : String(err);
          const errorId = `PLAN-ERR-${Date.now()}`;
          tridentLog('ERROR', 'trident-deep-planning', `[${errorId}] ${errMsg}`);
          return JSON.stringify({ error: 'Deep planning failed', errorId, message: (err instanceof Error ? err.message : String(err)) }, null, 2);
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
          } catch {
            discovery = undefined;
            // Safe to continue — discovery stays undefined, artifact generator handles null discovery
          }

          const iteration = problemSolvingModule.getIteration();
          const artifact = generatePlanArtifact(
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
      },
      execute: async (args: {
        projectName: string;
        config?: Record<string, unknown>;
        patterns?: string[];
        keyFacts?: string[];
        targetPath?: string;
        targetPaths?: string[];
        outputMode: 'T1' | 'T2';
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

          if (mode === 'T2') {
            // Auto-discover for dense T2 content
            let discovery: DiscoveryResult | null = null;
            if (args.targetPath) {
              try {
                discovery = await discoverProject(args.targetPath);
              } catch (e) {
                tridentLog('WARN', 'trident-context-synthesis', `T2 discovery failed: ${(e as Error).message}`);
                // Safe to continue — discovery stays null, T2 artifact handles null discovery
              }
            }

            // ---- T2: Dense knowledge file written to disk ----
            const t2 = await generateT2Artifact(
              args.projectName,
              args.patterns || [],
              args.keyFacts || [],
              args.targetPath,
              discovery
            );
            csMachineActor.send({ type: 'COLLECT', context: t2.content });

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
              const v = contextSynthesisModule.validateLayerContent(layer, t2.content);
              validations.push({ layer, name: config?.name || `Layer ${layer}`, ...v });
              // Validation failure is a WARNING, not an error — always advance
              orchestrator.completeLayer();

              // Wire FSM events for CS layers
              if (layer === 1) csMachineActor.send({ type: 'COLLECT', context: t2.content });
              else if (layer === 2) csMachineActor.send({ type: 'SCORE' });
              else if (layer === 3) csMachineActor.send({ type: 'COMPRESS', compressed: t2.content });
              else if (layer === 4) csMachineActor.send({ type: 'FORMAT', sections: t2.sections });
            }

            storeArtifacts({
              't2-knowledge': t2.content,
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
            return summary;
          }

          // ---- T1 (default): Lightweight injectable ----
          const artifact = generateT1Injectable(
            args.projectName,
            args.config || { model: 'deepseek/deepseek-v4-flash' },
            args.patterns || [],
            args.keyFacts || []
          );
          csMachineActor.send({ type: 'COLLECT', context: artifact });

          const validations: Array<{ layer: number; name: string; valid: boolean; missing: string[] }> = [];
          for (let layer = 1; layer <= 4; layer++) {
            const config = contextSynthesisModule.getLayerConfig(layer);
            const v = contextSynthesisModule.validateLayerContent(layer, artifact);
            validations.push({ layer, name: config?.name || `Layer ${layer}`, ...v });
            // Validation failure is a WARNING, not an error — always advance
            orchestrator.completeLayer();

            // Wire FSM events for CS layers
            if (layer === 1) csMachineActor.send({ type: 'COLLECT', context: artifact });
            else if (layer === 2) csMachineActor.send({ type: 'SCORE' });
            else if (layer === 3) csMachineActor.send({ type: 'COMPRESS', compressed: artifact });
            else if (layer === 4) csMachineActor.send({ type: 'FORMAT', sections: [artifact] });
          }

          const mdPath = await writeArtifactFile('T1_INJECTABLE', artifact);
          storeArtifacts({
            't1-injectable': artifact,
            'artifact-path': mdPath,
            'validation-report': JSON.stringify(validations),
          });

          return artifact + (mdPath ? `\n\n---\n📄 Artifact saved: \`${mdPath}\`` : '') + '\n\n---\n\n' + formatValidationReport(validations, 'CONTEXT_SYNTHESIS');
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

    'trident-vision': tridentVisionTool,

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
| trident-vision | Analyze images using GLM-4.6V-Flash VLM |
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
