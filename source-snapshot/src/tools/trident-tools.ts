// @ts-ignore
import { tool } from '@opencode-ai/plugin';
import { z } from 'zod';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as os from 'os';
import { tridentLog } from '../utils.js';
import { orchestrator } from '../orchestrator.js';
import { AuditEngine } from '../audit-engine/index.js';
import { generateCodeReviewArtifact } from '../artifacts/code-review-artifact.ts';
import { generateBuildSpecArtifact, generateContextLibraryManifest } from '../artifacts/deep-planning-artifact.ts';
import { generatePlanArtifact } from '../artifacts/problem-solving-artifact.ts';
import { generateT1Injectable } from '../artifacts/context-synthesis-artifact.ts';
import { TRIDENT_CONFIG } from '../config.js';
import { deepPlanningModule } from '../modes/deep-planning.js';
import { problemSolvingModule } from '../modes/problem-solving.js';
import { contextSynthesisModule } from '../modes/context-synthesis.js';
import { tridentVisionTool } from './trident-vision.js';

// If a path segment contains spaces, it needs quoting for shell commands.
// Node.js fs operations handle spaces natively, but any spawn/execFile
// with the path as a cwd or argument needs proper handling.
function quotePathForShell(filePath: string): string {
  // If path has spaces, wrap in double quotes (works on Linux/macOS)
  if (filePath.includes(' ')) {
    return '"' + filePath + '"';
  }
  return filePath;
}

// FINDING #10 FIX: Async readFile instead of sync readFileSync
// PATH WITH SPACES / CONTAINER: If exact path fails, search accessible directories.
// The model may truncate paths at spaces, AND the container may not have the
// same filesystem as the host. Search for the project by name in known paths.
async function resolveTargetPath(inputPath: string): Promise<string> {
  const trimmed = inputPath.trim();
  if (!trimmed) throw new Error('targetPath is empty — provide an absolute path');

  // Step 1: Try exact path
  try { await fs.access(trimmed); return trimmed; } catch { console.error('[resolveTargetPath] Path not accessible:', trimmed); tridentLog('WARN', 'resolveTargetPath', 'Path not accessible: ' + trimmed); /* path doesn't exist, try resolution */ }

  // Step 2: Extract the last meaningful path segment (project/directory name)
  const parts = trimmed.split('/').filter(Boolean);
  const projectName = parts[parts.length - 1] || '';

  // Step 3: Try searching in known accessible paths within the container
  const searchRoots: string[] = [];
  // Current session project root (from env or cwd)
  if (process.env.OPENCODE_PROJECT_ROOT) searchRoots.push(process.env.OPENCODE_PROJECT_ROOT);
  // Common workspace paths in container
  const homeDir = process.env.HOME || os.homedir();
  searchRoots.push(
    homeDir,
    path.join(homeDir, '.config', 'opencode'),
    os.tmpdir(),
  );
  // Check if any of these exist and search them
  for (const root of searchRoots) {
    try { await fs.access(root); } catch { console.error('[resolveTargetPath] Search root not accessible:', root); tridentLog('DEBUG', 'resolveTargetPath', 'Search root not accessible: ' + root); continue; }
    try {
      const { execFile } = await import('child_process');
      const { promisify } = await import('util');
      const execAsync = promisify(execFile);
      const escapedName = projectName.replace(/[^a-zA-Z0-9_-]/g, '');
      if (escapedName.length >= 2) {
        const { stdout } = await execAsync('find', [
          root, '-maxdepth', '5', '-type', 'd',
          '-name', `*${escapedName}*`,
          '-not', '-path', '*/node_modules/*',
          '-not', '-path', '*/.*',
        ].filter(Boolean) as string[], { timeout: 10000 });
        const matches = stdout.trim().split('\n').filter(Boolean);
        if (matches.length > 0) {
          const best = matches[0];
          tridentLog('INFO', 'resolveTargetPath', `Resolved "${trimmed}" → "${best}"`);
          return best;
        }
      }
    } catch { console.error('[resolveTargetPath] Search failed in ' + root); tridentLog('DEBUG', 'resolveTargetPath', `Search in ${root} failed, trying next root`); }
  }

  // Step 4: If project name contains spaces, the model may only have passed
  // the portion before the first space. Try broader search.
  const firstSegment = projectName.split(' ')[0];
  if (firstSegment && firstSegment !== projectName && firstSegment.length >= 2) {
    for (const root of searchRoots) {
      try { await fs.access(root); } catch { console.error('[resolveTargetPath] Search root not accessible:', root); tridentLog('DEBUG', 'resolveTargetPath', 'Search root not accessible: ' + root); continue; }
      try {
        const { execFile } = await import('child_process');
        const { promisify } = await import('util');
        const execAsync = promisify(execFile);
        const { stdout } = await execAsync('find', [
          root, '-maxdepth', '5', '-type', 'd',
          '-name', `*${firstSegment.replace(/[^a-zA-Z0-9_-]/g, '')}*`,
          '-not', '-path', '*/node_modules/*',
          '-not', '-path', '*/.*',
        ].filter(Boolean) as string[], { timeout: 8000 });
        const matches = stdout.trim().split('\n').filter(Boolean);
        if (matches.length > 0) {
          tridentLog('WARN', 'resolveTargetPath', `Resolved via partial match "${firstSegment}" → "${matches[0]}"`);
          return matches[0];
        }
      } catch { console.error('[resolveTargetPath] Search failed in ' + root); tridentLog('DEBUG', 'resolveTargetPath', `Partial match search in ${root} failed`); }
    }
  }

  throw new Error(
    'targetPath does not exist: "' + trimmed + '" — could not auto-resolve.\n' +
    'Specify the correct absolute path to the project directory.'
  );
}

async function resolveProjectName(targetPath: string): Promise<string> {
  const pkgPath = path.join(targetPath, 'package.json');
  try {
    const content = await fs.readFile(pkgPath, 'utf-8');
    const pkg = JSON.parse(content) as Record<string, unknown>;
    if (pkg && typeof pkg.name === 'string') return pkg.name;
  } catch (e: unknown) {
    console.error('[trident-tools] resolveProjectName failed:', e instanceof Error ? e.message : String(e));
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
  try { await fs.access(filePath); return true; }
  catch { return false; /* file not found — expected */ }
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
  } catch (err: unknown) {
    console.error('[trident-tools] writeArtifactFile failed:', err instanceof Error ? err.message : String(err));
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
  const noneValid = passCount === 0;

  // When all layers are partial, input was too minimal — skip validation theater
  if (noneValid && validations.length > 0) {
    let r = `## Mode Validation — ${modeName}\n\n`;
    r += `**Result:** SKIPPED — Input too minimal for validation (${validations.length} layers checked, 0 passed)\n\n`;
    r += `Validation requires detailed input parameters. Re-run with richer requirements, architecture, and patterns for a full validation.\n`;
    return r;
  }

  let r = `## Mode Validation — ${modeName}\n\n`;
  r += `**Result:** ${allValid ? 'PASS' : 'PARTIAL'} (${passCount}/${validations.length} layers validated)\n\n`;
  r += `| Layer | Name | Status | Missing Requirements |\n`;
  r += `|-------|------|--------|---------------------|\n`;
  for (const v of validations) {
    r += `| ${v.layer} | ${v.name} | ${v.valid ? 'PASS' : 'PARTIAL'} | ${v.missing.length > 0 ? v.missing.join(', ') : '—'} |\n`;
  }
  r += `\n`;
  if (!allValid) {
    r += `**Note:** Missing requirements indicate content that would benefit from more detailed input parameters.\n`;
  }
  return r;
}

export function createTridentTools() {
  return {
    'trident-code-audit': tool({
      description: 'Run CODE_REVIEW mode: 3-layer pipeline (preflight → 17-layer audit R0-R16 → artifact) against a project path. Produces dense code review artifact with findings table, fix code, verification checklist.',
      args: {
        targetPath: z.string().min(1, 'targetPath is required — provide the absolute path to the project root').describe('Absolute path to the project root to audit. If the path contains spaces, pass it as a single string — JSON handles spaces in strings.'),
        action: z.enum(['full', 'quick', 'preflight-only']).default('full').describe('Audit depth: full=preflight+17 layers+artifact, quick=17 layers+artifact, preflight-only=just tsc+build+dist'),
      },
      execute: async (args) => {
        // Resolve targetPath (handles paths with spaces that model may truncate)
        args.targetPath = await resolveTargetPath(args.targetPath);
        try {
          orchestrator.startAudit();
          const projectName = await resolveProjectName(args.targetPath);

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

          const artifact = generateCodeReviewArtifact(result, args.targetPath, projectName, 'trident');
          const mdPath = await writeArtifactFile('CODE_REVIEW', artifact);
          storeArtifacts({
            'code-review': artifact,
            'artifact-path': mdPath,
            'raw-audit-result': JSON.stringify({ score: result.score, grade: result.grade, findings: result.findings.length }),
          });

          if (!result || typeof result.score !== 'number') {
            orchestrator.failLayer('Invalid audit result');
          }

          return artifact + (mdPath ? `\n\n---\n📄 Artifact saved: \`${mdPath}\`` : '');
        } catch (err: unknown) {
          console.error('[trident-code-audit] Failed:', err instanceof Error ? err.message : String(err));
          const errorId = `AUDIT-ERR-${Date.now()}`;
          const errMsg = err instanceof Error ? err.message : String(err);
          tridentLog('ERROR', 'trident-code-audit', `[${errorId}] ${errMsg}`);
          return JSON.stringify({
            error: 'Code audit failed',
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
        targetPath: z.string().min(1, 'targetPath is required').describe('Absolute path to the project root'),
        requirements: z.string().describe('What this project needs to do — requirements text'),
        architecture: z.string().describe('Architecture description — how the system is structured'),
        patterns: z.array(z.string()).optional().describe('Known patterns to include in context library'),
        failures: z.array(z.string()).optional().describe('Known failure modes to document'),
        decisions: z.array(z.string()).optional().describe('Design decisions already made'),
      },
      execute: async (args) => {
        args.targetPath = await resolveTargetPath(args.targetPath);
        try {
          orchestrator.startPlanning();
          const projectName = await resolveProjectName(args.targetPath);

          const v1 = deepPlanningModule.validateLayerContent(1, args.requirements + ' ' + args.architecture);
          if (v1.valid) { orchestrator.completeLayer(); } else { orchestrator.failLayer(`Layer 1: ${v1.missing.join(', ')}`); }

          const buildSpec = generateBuildSpecArtifact(
            args.targetPath,
            projectName,
            args.requirements,
            args.architecture
          );
          const v2 = deepPlanningModule.validateLayerContent(2, buildSpec);
          if (v2.valid) { orchestrator.completeLayer(); } else { orchestrator.failLayer(`Layer 2: ${v2.missing.join(', ')}`); }

          const contextLib = generateContextLibraryManifest(
            projectName,
            args.architecture,
            args.patterns || [],
            args.failures || [],
            args.decisions || []
          );
          const v3 = deepPlanningModule.validateLayerContent(3, contextLib);
          if (v3.valid) { orchestrator.completeLayer(); } else { orchestrator.failLayer(`Layer 3: ${v3.missing.join(', ')}`); }

          const combined = buildSpec + '\n\n---\n\n' + contextLib;
          const mdPath = await writeArtifactFile('BUILD_SPEC', combined);
          storeArtifacts({
            'build-spec': buildSpec,
            'context-library-manifest': contextLib,
            'artifact-path': mdPath,
            'validation-report': JSON.stringify({ layer1: v1, layer2: v2, layer3: v3 }),
          });

          const validations = [
            { layer: 1, name: 'INITIAL PLAN', ...v1 },
            { layer: 2, name: 'DETAILED WORKFLOW', ...v2 },
            { layer: 3, name: 'CONTEXT LIBRARY', ...v3 },
          ];
          return combined + (mdPath ? `\n\n---\n📄 Artifact saved: \`${mdPath}\`` : '') + '\n\n---\n\n' + formatValidationReport(validations, 'DEEP_PLANNING');
        } catch (err: unknown) {
          console.error('[trident-deep-planning] Failed:', err instanceof Error ? err.message : String(err));
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
        targetPath: z.string().min(1, 'targetPath is required').describe('Absolute path to the affected project'),
        problem: z.string().describe('Problem statement — what is broken or wrong'),
        reasoning: z.array(z.string()).describe('Reasoning chain steps. Use "observation|hypothesis|evidence|conclusion" pipe format for best table output'),
        workingPlan: z.array(z.string()).describe('Working plan phases. Use "description|files|expected outcome|risk|rollback" pipe format for best table output'),
        findings: z.array(z.string()).optional().describe('Findings discovered during investigation'),
      },
      execute: async (args) => {
        args.targetPath = await resolveTargetPath(args.targetPath);
        try {
          orchestrator.startProblemSolving();
          const combinedInput = [
            args.problem,
            ...args.reasoning,
            ...args.workingPlan,
            ...(args.findings || []),
          ].join('\n');

          const validations: Array<{ layer: number; name: string; valid: boolean; missing: string[] }> = [];
          for (let layer = 1; layer <= 6; layer++) {
            const config = problemSolvingModule.getLayerConfig(layer);
            const v = problemSolvingModule.validateLayerContent(layer, combinedInput);
            validations.push({ layer, name: config?.name || `Layer ${layer}`, ...v });
            if (v.valid) { orchestrator.completeLayer(); } else { orchestrator.failLayer(`Layer ${layer}: ${v.missing.join(', ')}`); }
          }

          const iteration = problemSolvingModule.getIteration();
          const artifact = generatePlanArtifact(
            args.targetPath,
            args.problem,
            args.reasoning,
            args.workingPlan,
            args.findings || []
          );

          const mdPath = await writeArtifactFile('PLAN', artifact);
          storeArtifacts({
            'problem-solving-plan': artifact,
            'artifact-path': mdPath,
            'validation-report': JSON.stringify(validations),
            'iteration': String(iteration),
          });

          return artifact + (mdPath ? `\n\n---\n📄 Artifact saved: \`${mdPath}\`` : '') + '\n\n---\n\n' + formatValidationReport(validations, `PROBLEM_SOLVING (${iteration})`);
        } catch (err: unknown) {
          console.error('[trident-problem-solving] Failed:', err instanceof Error ? err.message : String(err));
          const errMsg = err instanceof Error ? err.message : String(err);
          const errorId = `PS-ERR-${Date.now()}`;
          tridentLog('ERROR', 'trident-problem-solving', `[${errorId}] ${errMsg}`);
          return JSON.stringify({ error: 'Problem solving failed', errorId, message: (err instanceof Error ? err.message : String(err)) }, null, 2);
        }
      },
    }),

    'trident-context-synthesis': tool({
      description: 'Run CONTEXT_SYNTHESIS mode: 4-layer pipeline (Context Collection → Relevance Scoring → Compression → Injection Format). Validates output against ContextSynthesisModule requirements at each layer. Produces T1 Injectable (copy-paste-ready opencode.json config).',
      args: {
        projectName: z.string().describe('Agent/project name (used for plugin path and agent config)'),
        config: z.record(z.string(), z.any()).optional().describe('opencode.json config object (model, provider, plugin, agent)'),
        patterns: z.array(z.string()).optional().describe('Patterns to embed in the injectable'),
        keyFacts: z.array(z.string()).optional().describe('Critical facts the agent must know'),
      },
      execute: async (args) => {
        try {
          orchestrator.startContextSynthesis();
          const combinedInput = [
            args.projectName,
            JSON.stringify(args.config || {}),
            ...(args.patterns || []),
            ...(args.keyFacts || []),
          ].join('\n');

          const validations: Array<{ layer: number; name: string; valid: boolean; missing: string[] }> = [];
          for (let layer = 1; layer <= 4; layer++) {
            const config = contextSynthesisModule.getLayerConfig(layer);
            const v = contextSynthesisModule.validateLayerContent(layer, combinedInput);
            validations.push({ layer, name: config?.name || `Layer ${layer}`, ...v });
            if (v.valid) { orchestrator.completeLayer(); } else { orchestrator.failLayer(`Layer ${layer}: ${v.missing.join(', ')}`); }
          }

          const artifact = generateT1Injectable(
            args.projectName,
            args.config || { model: 'deepseek/deepseek-v4-flash' },
            args.patterns || [],
            args.keyFacts || []
          );

          const mdPath = await writeArtifactFile('T1_INJECTABLE', artifact);
          storeArtifacts({
            't1-injectable': artifact,
            'artifact-path': mdPath,
            'validation-report': JSON.stringify(validations),
          });

          return artifact + (mdPath ? `\n\n---\n📄 Artifact saved: \`${mdPath}\`` : '') + '\n\n---\n\n' + formatValidationReport(validations, 'CONTEXT_SYNTHESIS');
        } catch (err: unknown) {
          console.error('[trident-context-synthesis] Failed:', err instanceof Error ? err.message : String(err));
          const errMsg = err instanceof Error ? err.message : String(err);
          const errorId = `CS-ERR-${Date.now()}`;
          tridentLog('ERROR', 'trident-context-synthesis', `[${errorId}] ${errMsg}`);
          return JSON.stringify({ error: 'Context synthesis failed', errorId, message: (err instanceof Error ? err.message : String(err)) }, null, 2);
        }
      },
    }),

    'trident-gate': tool({
      description: 'Evaluate a specific audit layer or get gate criteria for a layer',
      args: {
        action: z.enum(['evaluate', 'criteria']).describe('evaluate=run layer, criteria=show what layer checks'),
        layer: z.enum(['R0', 'R1', 'R2', 'R3', 'R4', 'R5', 'R6', 'R7', 'R8', 'R9', 'R10', 'R11', 'R12']).describe('Audit layer to evaluate'),
        targetPath: z.string().optional().describe('Project path (required for evaluate)'),
      },
      execute: async (args) => {
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
          };
          return JSON.stringify({
            layer: args.layer,
            description: layerDescriptions[args.layer] || 'Unknown layer',
          }, null, 2);
        }

        if (!args.targetPath) {
          return JSON.stringify({ error: 'targetPath required for evaluate action' });
        }

        args.targetPath = await resolveTargetPath(args.targetPath);

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
          console.error('[trident-gate] Failed:', err instanceof Error ? err.message : String(err));
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
| trident-context-synthesis | CONTEXT_SYNTHESIS | 4 layers (collect→score→compress→inject) | T1 Injectable |

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
