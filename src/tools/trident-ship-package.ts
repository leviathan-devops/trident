// src/tools/trident-ship-package.ts
// Ship Package Generator (SPG) — produces COMPLETE ship packages matching
// the structure of existing packages in Trident_Agent/Ship_Packages/.
//
// Output structure:
//   {SHIP_PACKAGES_BASE}/{projectName}/
//   ├── SHIP_MANIFEST.md      (deterministic)
//   ├── DEPLOY.sh             (deterministic)
//   ├── README.md             (deterministic)
//   ├── MASTER_INDEX.md       (deterministic)
//   ├── BUILD_REPORT.md       (LLM — 2000-5000 lines)
//   ├── DEBUG_LOG.md          (LLM — 1000-3000 lines)
//   ├── FULL_BUILD_CONTEXT.md (LLM — 2000-5000 lines)
//   ├── src/                  (full copy)
//   ├── dist/                 (index.js + .map)
//   ├── package.json          (copy)
//   ├── tsconfig.json         (copy)
//   └── (any other root configs)

import { tool } from '@opencode-ai/plugin';
import { z } from 'zod';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as crypto from 'crypto';
import * as os from 'os';
import { tridentLog } from '../utils.js';
import { generateSpecViaLLM, drainPendingSessions } from '../artifacts/llm-generator.ts';

// ── Constants ──

const SHIP_PACKAGES_BASE = path.join(
  os.homedir(), 'OPENCODE_WORKSPACE', 'Shared Workspace Context', 'Trident_Agent', 'Ship_Packages'
);

const ROOT_CONFIG_FILES = [
  'package.json', 'tsconfig.json', 'opencode.json', '.tridentignore',
  '.gitignore', 'bun.lock', 'package-lock.json', 'stryker.conf.json',
  'stryker-battlefield.json', 'stryker-utils.json',
];

// ── Deterministic helpers ──

function sha256(filePath: string): string {
  try {
    const content = fsSync.readFileSync(filePath);
    return crypto.createHash('sha256').update(content).digest('hex');
  } catch { return ''; }
}

async function collectSourceFiles(dir: string): Promise<string[]> {
  const results: string[] = [];
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (results.length >= 200) break;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.git' || entry.name === 'Ship_Packages') continue;
        results.push(...await collectSourceFiles(fullPath));
      } else if (entry.name.endsWith('.ts') || entry.name.endsWith('.js') || entry.name.endsWith('.md')) {
        results.push(fullPath);
      }
    }
  } catch (e) { tridentLog('WARN', 'spg', `collectSourceFiles: ${e instanceof Error ? e.message : String(e)}`); }
  return results;
}

async function countSourceLines(dir: string): Promise<{ files: number; lines: number; tsFiles: number; mdFiles: number }> {
  const allFiles = await collectSourceFiles(dir);
  let totalLines = 0;
  let tsFiles = 0;
  let mdFiles = 0;
  for (const f of allFiles) {
    try {
      const content = await fs.readFile(f, 'utf-8');
      totalLines += content.split('\n').length;
      if (f.endsWith('.ts')) tsFiles++;
      if (f.endsWith('.md')) mdFiles++;
    } catch { /* skip */ }
  }
  return { files: allFiles.length, lines: totalLines, tsFiles, mdFiles };
}

async function readPackageJson(targetPath: string): Promise<{ name?: string; version?: string }> {
  try {
    const content = await fs.readFile(path.join(targetPath, 'package.json'), 'utf-8');
    return JSON.parse(content);
  } catch { return {}; }
}

async function copyDir(src: string, dest: string): Promise<void> {
  await fs.rm(dest, { recursive: true, force: true }).catch(() => {});
  await fs.mkdir(dest, { recursive: true });
  await fs.cp(src, dest, { recursive: true });
}

// ── Deterministic existing-package detection ──

async function findExistingPackage(targetPath: string): Promise<string | null> {
  try {
    const entries = await fs.readdir(SHIP_PACKAGES_BASE, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const manifestPath = path.join(SHIP_PACKAGES_BASE, entry.name, 'SHIP_MANIFEST.md');
      try {
        const manifest = await fs.readFile(manifestPath, 'utf-8');
        // Match by source project path — the manifest stores "Project Root" or "targetPath"
        if (manifest.includes(targetPath)) {
          tridentLog('INFO', 'spg', `Found existing package for ${targetPath}: ${entry.name} — will UPDATE`);
          return path.join(SHIP_PACKAGES_BASE, entry.name);
        }
      } catch { /* no manifest — skip */ }
    }
  } catch { /* SHIP_PACKAGES_BASE doesn't exist yet */ }
  return null;
}

// ── Phase 1: Deterministic Validation ──

async function validateBuild(targetPath: string, expectedSha?: string): Promise<string[]> {
  const errors: string[] = [];

  const srcDir = path.join(targetPath, 'src');
  if (!fsSync.existsSync(srcDir)) {
    errors.push(`src/ directory not found at ${srcDir}`);
  } else {
    const srcFiles = await collectSourceFiles(srcDir);
    if (srcFiles.length === 0) errors.push('src/ directory has no source files');
  }

  const distPath = path.join(targetPath, 'dist', 'index.js');
  if (!fsSync.existsSync(distPath)) {
    errors.push(`dist/index.js not found. Run \`bun build src/index.ts --outdir dist --target bun --format esm --bundle\``);
  } else {
    const stat = fsSync.statSync(distPath);
    if (stat.size < 102400) {
      errors.push(`dist/index.js is ${(stat.size / 1024).toFixed(1)}KB — expected >100KB. Rebuild required.`);
    }
  }

  if (expectedSha && fsSync.existsSync(distPath)) {
    const actualSha = sha256(distPath);
    if (actualSha && actualSha !== expectedSha) {
      errors.push(`dist/index.js SHA mismatch: expected ${expectedSha}, got ${actualSha}. Rebuild required.`);
    }
  }

  return errors;
}

// ── Phase 4: Deterministic File Generators ──

function generateShipManifest(
  projectName: string, version: string, distSha: string, distSizeMB: string,
  stats: { files: number; lines: number; tsFiles: number; mdFiles: number },
  ctx: ContextBlocks, sourcePath: string,
): string {
  return `# SHIP MANIFEST — ${projectName}

**Version:** ${version}
**Source Path:** ${sourcePath}
**Build SHA:** \`${distSha}\`
**Bundle Size:** ${distSizeMB} MB
**Source Files:** ${stats.tsFiles} .ts files, ${stats.mdFiles} .md files, ${stats.files} total
**Source Lines:** ${stats.lines.toLocaleString()}
**Build Command:** \`bun build src/index.ts --outdir dist --target bun --format esm --bundle\`
**Generated:** ${new Date().toISOString()}
**Generator:** Trident Ship Package Generator (SPG)

## Test Results Summary
${ctx.testResults.substring(0, 500)}...

## Deploy Path
\`/root/.config/opencode/plugins/${projectName.toLowerCase().replace(/[^a-z0-9]/g, '-')}/dist/index.js\`

## Package Contents
- \`src/\` — Full source code (${stats.tsFiles} .ts files)
- \`dist/index.js\` — Compiled bundle (${distSizeMB} MB, SHA: ${distSha.substring(0, 16)}...)
- \`BUILD_REPORT.md\` — What was built, how, why
- \`DEBUG_LOG.md\` — Every bug with root cause and fix
- \`FULL_BUILD_CONTEXT.md\` — Compaction-proof context for future sessions
- \`MASTER_INDEX.md\` — Package index
- \`DEPLOY.sh\` — Deployment script
- \`README.md\` — Quick overview
`;
}

function generateDeployScript(projectName: string, distSha: string): string {
  const pluginDir = `/root/.config/opencode/plugins/${projectName.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;
  return `#!/bin/bash
# DEPLOY.sh — ${projectName} Ship Package Deployment
# Usage: bash DEPLOY.sh [container-name]

set -e

CONTAINER="\${1:-trident-test}"
PLUGIN_DIR="${pluginDir}"
EXPECTED_SHA="${distSha}"

echo "═══ Deploying ${projectName} to container: $CONTAINER ═══"

# 1. Copy dist to container
echo "[1/4] Copying dist/index.js..."
docker cp dist/index.js "$CONTAINER:$PLUGIN_DIR/dist/index.js"

# 2. Verify SHA
echo "[2/4] Verifying SHA256..."
ACTUAL_SHA=$(docker exec "$CONTAINER" sha256sum "$PLUGIN_DIR/dist/index.js" | cut -d' ' -f1)
if [ "$ACTUAL_SHA" != "$EXPECTED_SHA" ]; then
  echo "ERROR: SHA mismatch! Expected: $EXPECTED_SHA"
  echo "Got: $ACTUAL_SHA"
  exit 1
fi
echo "SHA verified: $ACTUAL_SHA"

# 3. Copy src (for reference)
echo "[3/4] Copying src/..."
docker cp src "$CONTAINER:$PLUGIN_DIR/src"

# 4. Done
echo "[4/4] Deployment complete."
echo "Plugin: $PLUGIN_DIR/dist/index.js"
echo "SHA: $ACTUAL_SHA"
`;
}

function generateReadme(projectName: string, version: string, distSha: string, distSizeMB: string, stats: { files: number; lines: number; tsFiles: number }): string {
  return `# ${projectName} — Ship Package v${version}

**Build SHA:** \`${distSha}\`
**Bundle:** ${distSizeMB} MB | **Source:** ${stats.tsFiles} .ts files, ${stats.lines.toLocaleString()} lines

## Deploy

\`\`\`bash
bash DEPLOY.sh [container-name]
\`\`\`

## Build

\`\`\`bash
bun build src/index.ts --outdir dist --target bun --format esm --bundle
\`\`\`

## Package Contents

| File | Description |
|------|-------------|
| \`dist/index.js\` | Compiled ESM bundle (${distSizeMB} MB) |
| \`src/\` | Full TypeScript source (${stats.tsFiles} files) |
| \`BUILD_REPORT.md\` | What was built, how, why |
| \`DEBUG_LOG.md\` | Every bug with root cause and fix |
| \`FULL_BUILD_CONTEXT.md\` | Compaction-proof context document |
| \`SHIP_MANIFEST.md\` | Build metadata and deploy info |
| \`DEPLOY.sh\` | Container deployment script |

## Verification

\`\`\`bash
sha256sum dist/index.js
# Should match: ${distSha}
\`\`\`
`;
}

// ── LLM System Prompts — AGGRESSIVE length requirements ──

const SPG_BUILD_REPORT_SYSTEM =
  'You are an elite build report writer producing COMPREHENSIVE documentation. ' +
  'This document MUST be at LEAST 2000 lines. Under 1500 lines is a FAILURE. ' +
  'You write for a FRESH agent who has ZERO context about this project. ' +
  'EVERY change, EVERY file, EVERY feature, EVERY modification MUST be documented. ' +
  'Include: what was built (narrative), how it was built (technical detail), ' +
  'why each change was made (rationale), files changed (detailed table), ' +
  'test results (with evidence), architecture overview, known issues. ' +
  'NEVER fabricate SHAs, statistics, or test results. ' +
  'Output ONLY markdown. Do NOT call tools.\n\n' +
  '## BUILD REPORT STRUCTURE (follow exactly, ALL sections required)\n' +
  '1. Build Summary (50+ lines) — version, SHA, bundle size, module count, build time, overview of ALL changes\n' +
  '2. What Was Built (500+ lines) — NARRATIVE of every change. Not a list — a STORY. Each feature described in full.\n' +
  '3. Technical Implementation (400+ lines) — HOW each change works. Code patterns, algorithms, data flows.\n' +
  '4. Architecture Changes (300+ lines) — What moved, what was added, what was removed. ASCII diagrams.\n' +
  '5. Files Changed (200+ lines) — Table: file | action (NEW/MODIFIED/DELETED) | lines changed | full description\n' +
  '6. Test Results (200+ lines) — Every test run with SHA evidence, timestamps, pass/fail. Container test details.\n' +
  '7. Known Issues and Limitations (100+ lines) — What is broken, what needs follow-up, workarounds\n' +
  '8. Deployment Notes (100+ lines) — Build command, deploy steps, gotchas, configuration requirements\n\n' +
  'CRITICAL: This is a 2000+ LINE document. Do NOT abbreviate. Do NOT summarize. ' +
  'EVERY section must be FULLY developed with real content from the provided context.';

const SPG_DEBUG_LOG_SYSTEM =
  'You are an elite debug log writer producing a COMPREHENSIVE forensic record. ' +
  'This document MUST be at LEAST 1000 lines. Under 800 lines is a FAILURE. ' +
  'Document EVERY bug, EVERY issue, EVERY gotcha with FULL diagnosis chains. ' +
  'Format per bug: Symptom -> Root Cause -> Diagnosis Process -> Fix Applied -> Verification -> Lesson Learned. ' +
  'Include ALL bugs — NO omissions. Every bug is a learning opportunity. ' +
  'Output ONLY markdown. Do NOT call tools.\n\n' +
  '## DEBUG LOG STRUCTURE (follow exactly)\n' +
  '1. Bug Summary Table — bug ID | symptom | severity | status (FIXED/WIP/KNOWN)\n' +
  '2. Detailed Bug Reports (800+ lines) — One FULL section per bug:\n' +
  '   - Symptom: What went wrong? What did the user/agent observe?\n' +
  '   - Root Cause: The fundamental reason. Not the symptom — the CAUSE.\n' +
  '   - Diagnosis Process: How was the root cause identified? What debugging steps?\n' +
  '   - Fix Applied: Exact code change. What was modified, where, how.\n' +
  '   - Verification: How was the fix verified? Container test? Build? Runtime check?\n' +
  '   - Lesson Learned: What rule prevents this from recurring?\n' +
  '3. Architecture Decisions (200+ lines) — Every key decision with rationale and rejected alternatives\n' +
  '4. Regression Watch (100+ lines) — What to check if these bugs reappear\n' +
  '5. Iron Laws (50+ lines) — Terse rules earned by each bug\n\n' +
  'CRITICAL: This is a 1000+ LINE document. EVERY bug gets a FULL page of analysis minimum.';

const SPG_FULL_CONTEXT_SYSTEM =
  'You are an elite context preservation writer producing a COMPREHENSIVE knowledge document. ' +
  'This document MUST be at LEAST 2000 lines. Under 1500 lines is a FAILURE. ' +
  'This document must survive context compaction and be readable by a FRESH agent session. ' +
  'Architecture, data flows, gotchas, conventions, file locations, API contracts, limitations, ' +
  'operational knowledge — ALL of it. NO summarization. NO "see above". Every section self-contained. ' +
  'Output ONLY markdown. Do NOT call tools.\n\n' +
  '## FULL CONTEXT STRUCTURE (follow exactly, ALL sections required)\n' +
  '1. Project Identity (100+ lines) — name, version, purpose, tech stack, dependencies, build system\n' +
  '2. Architecture Overview (300+ lines) — ASCII diagram, component map, data flow, module dependencies\n' +
  '3. Key Files Reference (400+ lines) — EVERY important file with its role, key exports, and gotchas\n' +
  '4. Design Decisions (300+ lines) — EVERY decision with rationale, rejected alternatives, cost of reversal\n' +
  '5. Implementation Patterns (200+ lines) — Conventions, idioms, gotchas specific to this codebase\n' +
  '6. Known Bugs and Limitations (200+ lines) — What is broken, what is workaround, what is accepted\n' +
  '7. Operational Knowledge (200+ lines) — Build commands, deploy steps, container testing, debugging\n' +
  '8. Compaction Recovery Guide (200+ lines) — "Read this first after context loss." Recovery checklist.\n\n' +
  'CRITICAL: This is a 2000+ LINE document. Do NOT abbreviate. EVERY section FULLY developed. ' +
  'A fresh agent reads ONLY this document and understands the ENTIRE project.';

// ── Phase 5: Brief Builders ──

interface ContextBlocks {
  whatWasBuilt: string;
  bugsFound: string;
  architectureDecisions: string;
  filesChanged: string;
  testResults: string;
}

function buildReportBrief(
  projectName: string, version: string, targetPath: string, distSha: string,
  distSizeMB: string, stats: { files: number; lines: number; tsFiles: number; mdFiles: number },
  ctx: ContextBlocks,
): string {
  return `# BUILD REPORT GENERATION TASK — ${projectName} v${version}

## DETERMINISTIC PROJECT DATA (read from disk — VERIFIED FACTS)
- **Project:** ${projectName}
- **Version:** ${version}
- **Build SHA:** ${distSha}
- **Bundle Size:** ${distSizeMB} MB
- **Source Files:** ${stats.tsFiles} .ts, ${stats.mdFiles} .md, ${stats.files} total
- **Source Lines:** ${stats.lines.toLocaleString()}
- **Project Root:** ${targetPath}
- **Build Command:** \`bun build src/index.ts --outdir dist --target bun --format esm --bundle\`

## WHAT WAS BUILT (agent-provided — PRIMARY SOURCE OF TRUTH)
${ctx.whatWasBuilt}

## FILES CHANGED (agent-provided)
${ctx.filesChanged}

## TEST RESULTS (agent-provided)
${ctx.testResults}

## GENERATION INSTRUCTIONS
Write a COMPLETE BUILD REPORT following the BUILD REPORT STRUCTURE in the system prompt.
The report MUST be at LEAST 2000 lines. Use ALL the context above.
Every claim traces to provided context. NEVER fabricate.`;
}

function buildDebugLogBrief(projectName: string, ctx: ContextBlocks): string {
  return `# DEBUG LOG GENERATION TASK — ${projectName}

## BUGS FOUND (agent-provided — PRIMARY SOURCE OF TRUTH)
${ctx.bugsFound}

## ARCHITECTURE DECISIONS (agent-provided)
${ctx.architectureDecisions}

## GENERATION INSTRUCTIONS
Write a COMPLETE DEBUG LOG following the DEBUG LOG STRUCTURE in the system prompt.
The log MUST be at LEAST 1000 lines. Document EVERY bug with FULL diagnosis chain.`;
}

function buildFullContextBrief(
  projectName: string, version: string, targetPath: string, distSha: string,
  distSizeMB: string, stats: { files: number; lines: number; tsFiles: number; mdFiles: number },
  ctx: ContextBlocks,
): string {
  return `# FULL BUILD CONTEXT GENERATION TASK — ${projectName} v${version}

## DETERMINISTIC PROJECT DATA
- **Project:** ${projectName}
- **Version:** ${version}
- **Build SHA:** ${distSha}
- **Bundle Size:** ${distSizeMB} MB
- **Source:** ${stats.tsFiles} .ts files, ${stats.lines.toLocaleString()} lines

## WHAT WAS BUILT
${ctx.whatWasBuilt}

## BUGS FOUND
${ctx.bugsFound}

## ARCHITECTURE DECISIONS
${ctx.architectureDecisions}

## FILES CHANGED
${ctx.filesChanged}

## TEST RESULTS
${ctx.testResults}

## GENERATION INSTRUCTIONS
Write a COMPLETE COMPACTION-PROOF CONTEXT DOCUMENT following the FULL CONTEXT STRUCTURE.
The document MUST be at LEAST 2000 lines. Document EVERYTHING. Every section self-contained.
Include Compaction Recovery Guide in section 8.`;
}

// ── Tool Definition ──

export function createShipPackageTool() {
  return tool({
    description: 'Ship Package Generator: validates build, copies ENTIRE project (src/dist/configs), generates SHIP_MANIFEST + DEPLOY.sh + README + BUILD_REPORT + DEBUG_LOG + FULL_BUILD_CONTEXT in parallel via LLM, writes MASTER_INDEX. Default output: Trident_Agent/Ship_Packages/{projectName}/. All 5 context blocks MANDATORY (>8000 chars each — this is FULL BUILD CONTEXT capture, same tier as DP/CS structured args).',
    args: {
      targetPath: z.string().describe('Absolute path to project root containing src/ and dist/'),
      projectName: z.string().optional().describe('Package name. Defaults from package.json or targetPath basename'),
      distSha: z.string().optional().describe('Expected dist/index.js SHA256. Validated against actual'),
      outputPath: z.string().optional().describe('Custom output directory. Defaults to Ship_Packages/{projectName}/'),
      blocksFile: z.string().optional().describe('Path to a JSON file containing the 5 context blocks (whatWasBuilt, bugsFound, architectureDecisions, filesChanged, testResults). REQUIRED when the function-calling payload limit prevents passing 40K+ chars inline. File fields override inline args.'),
      whatWasBuilt: z.string().optional().describe('What changed, how, why. Runtime: >8000 chars. Full narrative — every component, every integration, every wire. Same tier as DP components arg. May be supplied via blocksFile.'),
      bugsFound: z.string().optional().describe('Every bug found and fixed. Runtime: >8000 chars. Symptom → root cause → diagnosis → fix → verification → lesson for EACH bug. Same tier as DP knownGaps. May be supplied via blocksFile.'),
      architectureDecisions: z.string().optional().describe('Decisions with rationale + rejected alternatives. Runtime: >8000 chars. Same tier as DP designDecisions. May be supplied via blocksFile.'),
      filesChanged: z.string().optional().describe('Every modified file with description of changes. Runtime: >8000 chars. Same tier as DP fileInventory. May be supplied via blocksFile.'),
      testResults: z.string().optional().describe('Test evidence with pass/fail and metrics. Runtime: >8000 chars. Container test results, Phase E checks, SHA proofs, stream evidence. May be supplied via blocksFile.'),
    },
    execute: async (args: {
      targetPath: string; projectName?: string; distSha?: string; outputPath?: string; blocksFile?: string;
      whatWasBuilt?: string; bugsFound?: string; architectureDecisions?: string;
      filesChanged?: string; testResults?: string;
    }) => {
      try {
        // ═══ BLOCKSFILE MERGE (before validation) ═══
        // The function-calling payload limit truncates 40K+ inline args. The 5
        // mandatory context blocks (5 × 8000 chars) can arrive via a JSON file
        // instead. File fields override inline args. Same pattern as DP inputFile.
        if (args.blocksFile) {
          try {
            const fsSync = await import('fs');
            const fileContent = fsSync.readFileSync(args.blocksFile, 'utf-8');
            const fileFields = JSON.parse(fileContent);
            const BLOCK_KEYS = ['whatWasBuilt', 'bugsFound', 'architectureDecisions', 'filesChanged', 'testResults'];
            for (const k of BLOCK_KEYS) {
              if (typeof fileFields[k] === 'string' && fileFields[k].length > 0) {
                (args as any)[k] = fileFields[k];
              }
            }
            tridentLog('INFO', 'spg', `blocksFile: merged blocks from ${args.blocksFile}`);
          } catch (fileErr) {
            return `BLOCKS FILE ERROR: could not read/parse ${args.blocksFile}: ${fileErr instanceof Error ? fileErr.message : String(fileErr)}`;
          }
        }

        // ═══ RUNTIME INPUT VALIDATION ═══
        // Same tier as DP/CS structured args. SPG captures FULL BUILD CONTEXT —
        // 1000 chars produces garbage 200-line wank documents. 8000 chars minimum
        // ensures the LLM has enough context to generate 2000+ line docs.
        const SPG_MIN = 8000;
        const ctxArgs: Record<string, string | undefined> = {
          whatWasBuilt: args.whatWasBuilt, bugsFound: args.bugsFound,
          architectureDecisions: args.architectureDecisions, filesChanged: args.filesChanged,
          testResults: args.testResults,
        };
        const failures: string[] = [];
        for (const [key, val] of Object.entries(ctxArgs)) {
          if (typeof val !== 'string' || val.length < SPG_MIN) {
            failures.push(`'${key}' ${typeof val === 'string' ? val.length : 0}c need ${SPG_MIN}+. Full build context.`);
          }
        }
        if (failures.length > 0) {
          return `❌ SPG ARGUMENT VALIDATION FAILED:\n${failures.map(f => `  - ${f}`).join('\n')}\n\nAll 5 context blocks must be >= ${SPG_MIN} chars. These blocks generate BUILD_REPORT, DEBUG_LOG, and FULL_BUILD_CONTEXT — each targeting 2000+ lines. Garbage in = garbage out.`;
        }

        const pkg = await readPackageJson(args.targetPath);
        const projectName = args.projectName || pkg.name || path.basename(args.targetPath) || 'unnamed-project';
        const version = pkg.version || 'unknown';

        // ── Phase 1: Validate ──
        tridentLog('INFO', 'spg', `Phase 1: Validating ${projectName} at ${args.targetPath}`);
        const errors = await validateBuild(args.targetPath, args.distSha);
        if (errors.length > 0) {
          let msg = `SHIP PACKAGE BLOCKED — ${errors.length} ERROR${errors.length === 1 ? '' : 'S'}:\n\n`;
          errors.forEach((e, i) => { msg += `${i + 1}. ${e}\n`; });
          msg += '\nFix ALL errors, then retry.';
          return msg;
        }

        const distPath = path.join(args.targetPath, 'dist', 'index.js');
        const actualSha = sha256(distPath);
        const distSizeMB = (fsSync.statSync(distPath).size / (1024 * 1024)).toFixed(2);
        tridentLog('INFO', 'spg', `Validation passed. SHA: ${actualSha.substring(0, 16)}..., Size: ${distSizeMB} MB`);

        // ── Collect project stats ──
        const stats = await countSourceLines(path.join(args.targetPath, 'src'));
        tridentLog('INFO', 'spg', `Project stats: ${stats.tsFiles} .ts, ${stats.mdFiles} .md, ${stats.lines} lines`);

        // ── Phase 2: Find existing package or create new ──
        // DETERMINISTIC: Same source project = same package directory. Always update, never duplicate.
        const existingDir = await findExistingPackage(args.targetPath);
        const libDir = args.outputPath || existingDir || path.join(SHIP_PACKAGES_BASE, projectName);
        const isUpdate = existingDir !== null;
        await fs.mkdir(libDir, { recursive: true });
        tridentLog('INFO', 'spg', `${isUpdate ? 'UPDATING' : 'CREATING'} package: ${libDir}${isUpdate ? ' (existing package detected for same source)' : ''}`);

        // ── Phase 3: Copy entire project ──
        tridentLog('INFO', 'spg', 'Phase 3: Copying project files');
        // src/
        await copyDir(path.join(args.targetPath, 'src'), path.join(libDir, 'src'));
        // dist/
        const distDest = path.join(libDir, 'dist');
        await fs.mkdir(distDest, { recursive: true });
        await fs.copyFile(distPath, path.join(distDest, 'index.js'));
        const mapPath = path.join(args.targetPath, 'dist', 'index.js.map');
        if (fsSync.existsSync(mapPath)) {
          await fs.copyFile(mapPath, path.join(distDest, 'index.js.map'));
        }
        // Root config files
        for (const cfgFile of ROOT_CONFIG_FILES) {
          const src = path.join(args.targetPath, cfgFile);
          if (fsSync.existsSync(src)) {
            try { await fs.copyFile(src, path.join(libDir, cfgFile)); } catch { /* skip */ }
          }
        }
        // docs/ and specs/ directories if they exist in source
        for (const extraDir of ['docs', 'specs', '.trident']) {
          const srcDir = path.join(args.targetPath, extraDir);
          if (fsSync.existsSync(srcDir)) {
            try { await copyDir(srcDir, path.join(libDir, extraDir)); } catch { /* skip */ }
          }
        }

        // ── Phase 4: Generate deterministic files ──
        tridentLog('INFO', 'spg', 'Phase 4: Writing deterministic files');
        const ctx: ContextBlocks = {
          whatWasBuilt: args.whatWasBuilt,
          bugsFound: args.bugsFound,
          architectureDecisions: args.architectureDecisions,
          filesChanged: args.filesChanged,
          testResults: args.testResults,
        };

        const manifest = generateShipManifest(projectName, version, actualSha, distSizeMB, stats, ctx, args.targetPath);
        await fs.writeFile(path.join(libDir, 'SHIP_MANIFEST.md'), manifest, 'utf-8');

        const deployScript = generateDeployScript(projectName, actualSha);
        await fs.writeFile(path.join(libDir, 'DEPLOY.sh'), deployScript, 'utf-8');

        const readme = generateReadme(projectName, version, actualSha, distSizeMB, stats);
        await fs.writeFile(path.join(libDir, 'README.md'), readme, 'utf-8');

        // ── Phase 5: Parallel LLM Generation ──
        tridentLog('INFO', 'spg', 'Phase 5: Firing 3 PARALLEL LLM generations (target: 2000+ lines each)');

        interface SpgJob { name: string; brief: string; system: string; fileName: string; }
        const jobs: SpgJob[] = [
          { name: 'BUILD_REPORT', brief: buildReportBrief(projectName, version, args.targetPath, actualSha, distSizeMB, stats, ctx), system: SPG_BUILD_REPORT_SYSTEM, fileName: 'BUILD_REPORT.md' },
          { name: 'DEBUG_LOG', brief: buildDebugLogBrief(projectName, ctx), system: SPG_DEBUG_LOG_SYSTEM, fileName: 'DEBUG_LOG.md' },
          { name: 'FULL_BUILD_CONTEXT', brief: buildFullContextBrief(projectName, version, args.targetPath, actualSha, distSizeMB, stats, ctx), system: SPG_FULL_CONTEXT_SYSTEM, fileName: 'FULL_BUILD_CONTEXT.md' },
        ];

        const results = await Promise.allSettled(
          jobs.map(async (job) => {
            tridentLog('INFO', 'spg', `[${job.name}] LLM call starting`);
            const content = await generateSpecViaLLM(job.brief, undefined, false, job.system, true);
            const footer = `\n\n---\n*END OF ${projectName} ${job.name} — Compaction-proof build artifact. Generated ${new Date().toISOString()}.*\n`;
            const finalContent = content + footer;
            const lines = finalContent.split('\n').length;
            const filePath = path.join(libDir, job.fileName);
            await fs.writeFile(filePath, finalContent, 'utf-8');
            tridentLog('INFO', 'spg', `[${job.name}] DONE — ${lines} lines -> ${filePath}`);
            return { name: job.name, path: filePath, lines };
          }),
        );

        await drainPendingSessions();

        // Collect results
        const specs: Array<{ name: string; path: string; lines: number; status: string }> = [];
        for (let i = 0; i < results.length; i++) {
          const r = results[i];
          if (r.status === 'fulfilled') {
            specs.push({ ...r.value, status: 'OK' });
          } else {
            const errMsg = r.reason instanceof Error ? r.reason.message : String(r.reason);
            tridentLog('ERROR', 'spg', `[${jobs[i].name}] FAILED: ${errMsg}`);
            specs.push({ name: jobs[i].name, path: '', lines: 0, status: `FAILED: ${errMsg}` });
          }
        }

        // ── Phase 6: Write MASTER_INDEX.md ──
        const okSpecs = specs.filter(s => s.status === 'OK');
        const totalDocLines = okSpecs.reduce((sum, s) => sum + s.lines, 0);
        let index = `# Ship Package — ${projectName}\n\n`;
        index += `**Version:** ${version}\n`;
        index += `**Build SHA:** \`${actualSha}\`\n`;
        index += `**Bundle Size:** ${distSizeMB} MB\n`;
        index += `**Source:** ${stats.tsFiles} .ts files, ${stats.lines.toLocaleString()} lines\n`;
        index += `**Generated:** ${new Date().toISOString()}\n`;
        index += `**Location:** \`${libDir}\`\n\n`;
        index += `## Generated Documents\n\n`;
        index += `| # | Document | Lines | Status |\n`;
        index += `|---|----------|-------|--------|\n`;
        for (let i = 0; i < specs.length; i++) {
          index += `| ${i + 1} | ${specs[i].name} | ${specs[i].lines} | ${specs[i].status} |\n`;
        }
        index += `\n**Total documentation:** ${totalDocLines} lines across ${okSpecs.length} docs\n\n`;
        index += `## Package Contents\n\n`;
        index += `| Path | Description |\n|------|-------------|\n`;
        index += `| \`src/\` | Full source code (${stats.tsFiles} .ts files) |\n`;
        index += `| \`dist/index.js\` | Compiled bundle (${distSizeMB} MB) |\n`;
        index += `| \`BUILD_REPORT.md\` | What was built, how, why |\n`;
        index += `| \`DEBUG_LOG.md\` | Every bug with root cause and fix |\n`;
        index += `| \`FULL_BUILD_CONTEXT.md\` | Compaction-proof context |\n`;
        index += `| \`SHIP_MANIFEST.md\` | Build metadata |\n`;
        index += `| \`DEPLOY.sh\` | Deployment script |\n`;
        index += `| \`README.md\` | Quick overview |\n`;
        index += `| \`MASTER_INDEX.md\` | This file |\n`;
        // List config files
        for (const cfg of ROOT_CONFIG_FILES) {
          if (fsSync.existsSync(path.join(libDir, cfg))) index += `| \`${cfg}\` | Project config |\n`;
        }
        // List extra dirs
        for (const extra of ['docs', 'specs', '.trident']) {
          if (fsSync.existsSync(path.join(libDir, extra))) index += `| \`${extra}/\` | Additional documentation |\n`;
        }

        await fs.writeFile(path.join(libDir, 'MASTER_INDEX.md'), index, 'utf-8');

        tridentLog('INFO', 'spg', `SHIP PACKAGE COMPLETE: ${projectName} — ${okSpecs.length}/${specs.length} docs, ${totalDocLines} doc lines, ${stats.tsFiles} src files`);

        return `SHIP PACKAGE COMPLETE — ${projectName} v${version}

Build SHA: ${actualSha}
Bundle Size: ${distSizeMB} MB
Source: ${stats.tsFiles} .ts files, ${stats.lines.toLocaleString()} lines
Location: ${libDir}

Generated Documents:
${specs.map(s => `  ${s.status === 'OK' ? '✅' : '❌'} ${s.name}: ${s.lines} lines [${s.status}]`).join('\n')}

Total documentation: ${totalDocLines} lines
Package includes: src/, dist/, configs, SHIP_MANIFEST, DEPLOY.sh, README, MASTER_INDEX

📄 Package: ${libDir}`;

      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        tridentLog('ERROR', 'spg', `SHIP PACKAGE FAILED: ${errMsg}`);
        return `SHIP PACKAGE ERROR: ${errMsg}`;
      }
    },
  });
}
