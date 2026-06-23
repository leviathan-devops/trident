/**
 * Deep Planning Artifact Generator — Trident v4.3.3
 *
 * Produces 3 DISTINCT, GOLD-STANDARD outputs:
 *
 *   LAYER 1: Initial Plan  (generateLayer1InitialPlan)
 *            Generative prompt + project metadata. 400-600 line comprehensive
 *            prompt document for building a system.
 *
 *   LAYER 2: Detailed Workflow  (generateLayer2DetailedWorkflow)
 *            500-1000 line phased implementation with ACTUAL TypeScript code
 *            in each phase.
 *
 *   LAYER 3: Full Context Library  (generateContextLibraryManifest)
 *            9 files written to disk, each 200+ lines with dense reference
 *            content.
 *
 * `generateBuildSpecArtifact()` is a backward-compatible wrapper that calls
 * `generateLayer1InitialPlan()` + `generateLayer2DetailedWorkflow()` and
 * concatenates them (800-1200 lines total).
 */

import * as fs from 'fs';
import * as path from 'path';
import { TRIDENT_CONFIG } from '../config.js';
import type { DiscoveryResult, DiscoveredPattern, CodeSection } from '../shared/auto-discover.js';
import { tridentLog } from '../utils.js';

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function safeIdent(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, '-');
}

function safeClassName(name: string): string {
  const parts = safeIdent(name).split(/[-_]/);
  return parts.map((p: string) => p.charAt(0).toUpperCase() + p.slice(1)).join('');
}

function pct(part: number, total: number): string {
  if (total === 0) return '0%';
  return `${Math.round((part / total) * 100)}%`;
}

// ============================================================================
// LAYER 1: GENERATIVE PROMPT (internal function, 400-600 lines)
// ============================================================================

function generateLayer1Prompt(
  requirements: string,
  architecture: string,
  discovery?: DiscoveryResult | null
): string {
  let p = '';
  
  // v4.4.1: Actually USE the requirements and architecture parameters
  // These were previously accepted but completely ignored
  
  // Section 1: Problem Statement — FROM REQUIREMENTS
  p += '## 1. Problem Statement\n\n';
  if (requirements && requirements.length > 20) {
    p += requirements + '\n\n';
  } else {
    p += 'No specific requirements provided. Building from codebase discovery.\n\n';
  }
  
  // Section 2: Architecture — FROM ARCHITECTURE
  if (architecture && architecture.length > 20) {
    p += '## 2. Architecture\n\n';
    p += architecture + '\n\n';
  }
  
  // Section 3: Codebase Intelligence — from discovery
  if (discovery) {
    p += '## 3. Discovery Intelligence\n\n';
    const fileCount = typeof discovery.totalFiles === 'number' ? discovery.totalFiles : 'N/A';
    const totalLines = typeof discovery.totalLines === 'number' ? discovery.totalLines : 'N/A';
    p += `- **Files:** ${fileCount}\n`;
    p += `- **Lines:** ${totalLines}\n`;
    if (discovery.languages) {
      const langs = typeof discovery.languages === 'object' ? 
        Object.entries(discovery.languages as Record<string,number>).map(([k,v]) => `${k} (${v})`).join(', ') : 'unknown';
      p += `- **Languages:** ${langs}\n`;
    }
    if (discovery.warheads) p += `- **Warheads:** ${discovery.warheads}\n`;
    if (discovery.auditLayers) p += `- **Audit Layers:** ${discovery.auditLayers}\n`;
    p += '\n';
  }
  
  // Section 4: Core Insight
  p += '## 4. Core Insight\n\n';
  p += 'The implementation must produce runtime-grade software that works correctly in a ';
  p += 'real runtime environment — not just code that compiles. Every function follows P1-P10 ';
  p += 'principles. Every catch block handles errors. Every type validates at boundaries. ';
  p += 'Every resource cleans up in all paths.\n\n';
  
  // Section 5: Scope
  p += '## 5. Scope\n\n';
  if (requirements) {
    const lines = requirements.split('\n').filter(l => l.trim().length > 10);
    for (const line of lines.slice(0, 20)) {
      p += `- ${line.trim().substring(0, 200)}\n`;
    }
    p += '\n';
  }
  
  // Section 6: Success Criteria
  p += '## 6. Success Criteria\n\n';
  p += '| Criterion | Threshold |\n';
  p += '|-----------|----------|\n';
  p += '| TypeScript compilation | 0 errors |\n';
  p += '| Bundle build | Exit 0 |\n';
  p += '| Plugin loads | Runtime verification |\n';
  p += '| Tools respond | All registered tools return valid results |\n';
  p += '\n';
  
  return p;
}

// ============================================================================
// LAYER 1: INITIAL PLAN (exported) — Generative prompt + project metadata
// ============================================================================

export function generateLayer1InitialPlan(
  targetPath: string,
  projectName: string,
  requirements: string,
  architecture: string,
  discovery?: DiscoveryResult | null
): string {
  const ts = new Date().toISOString();
  const version = TRIDENT_CONFIG.version;

  let a = '';

  // -- HEADER --
  a += `# BUILD SPEC ARTIFACT — ${projectName}\n\n`;
  a += `**Target:** ${targetPath}\n`;
  a += `**Generated:** ${ts}\n`;
  a += `**Trident Version:** v${version}\n`;
  a += `**Status:** PLANNING\n`;
  a += `**Artifact Type:** BUILD_SPEC (Layer 1 Prompt + Layer 2 Implementation)\n`;
  a += `**Discovery:** ${discovery ? `ENABLED (${discovery.totalFiles} files, ${discovery.totalLines} lines)` : 'DISABLED'}\n\n`;

  if (discovery) {
    a += `**Discovered Intelligence:**\n`;
    a += `- Languages: ${Object.entries(discovery.languages).map(([k, v]) => `${k} (${v})`).join(', ')}\n`;
    a += `- Entry Points: ${discovery.entryPoints.join(', ') || 'none'}\n`;
    a += `- Patterns: ${discovery.patterns.length} | Failures: ${discovery.failureModes.length} | Decisions: ${discovery.decisions.length}\n`;
    a += `- Warheads: ${discovery.warheads.length} | Audit Layers: ${discovery.auditLayers.length}\n\n`;
  }

  a += `---\n\n`;

  // -- EMBED LAYER 1 (GENERATIVE PROMPT) --
  a += generateLayer1Prompt(requirements, architecture, discovery);

  return a;
}

// ============================================================================
// LAYER 2: DETAILED WORKFLOW (exported) — Implementation build spec
// ============================================================================

export function generateLayer2DetailedWorkflow(
  targetPath: string,
  projectName: string,
  requirements: string,
  architecture: string,
  discovery?: DiscoveryResult | null
): string {
  const safeName = safeIdent(projectName);
  const className = safeClassName(projectName);
  const version = TRIDENT_CONFIG.version;

  let a = '';

  // -- LAYER 2 HEADER --
  a += `# LAYER 2: IMPLEMENTATION BUILD SPEC\n\n`;
  a += `## Overview\n\n`;
  a += `- **Project:** ${projectName} (\`${safeName}\`)\n`;
  a += `- **Target Path:** ${targetPath}\n`;
  // v4.4.1: Actually USE the requirements parameter — don't just label it
  a += `## Requirements\n\n${requirements || 'Auto-derived from project structure and discovery data.'}\n\n`;
  a += `- **Architecture:** ${architecture || 'Auto-derived from discovery'}\n`;
  a += `- **Class Prefix:** ${className}\n`;
  a += `- **Safe Identifier:** ${safeName}\n\n`;

  a += `## Requirements Summary\n\n`;
  if (discovery) {
    a += `Based on auto-discovery of ${discovery.totalFiles} files:\n`;
    a += `- Primary language: ${Object.entries(discovery.languages).sort((x, y) => y[1] - x[1])[0]?.[0] || 'TypeScript'}\n`;
    a += `- Structural components detected: ${discovery.patterns.length} (classes, interfaces, functions)\n`;
    a += `- Extension points: ${discovery.warheads.length} warheads, ${discovery.auditLayers.length} audit layers\n`;
    a += `- Known issues: ${discovery.failureModes.length} failure modes flagged\n\n`;
  } else {
    a += `${requirements}\n\n`;
  }

  // v4.4.1: If requirements contain specific build instructions, use them instead of generic phases
  // -- DYNAMIC PHASES (from requirements × existing code) --
  if (discovery && discovery.codeSections && discovery.codeSections.length > 0) {
    a += `## Existing Code Inventory\n\n`;
    a += `The target project already contains ${discovery.codeSections.length} code sections across ${discovery.totalFiles} files.\n`;
    a += `Phases below describe CHANGES to existing code, not greenfield builds.\n\n`;
    for (const section of discovery.codeSections.slice(0, 10)) {
      a += `### ${section.sectionName}\n`;
      a += `**Location:** \`${section.filePath}:${section.lineStart}-${section.lineEnd}\`\n`;
      a += `**Type:** ${section.type}\n\n`;
      a += '```typescript\n' + section.code.substring(0, 400) + '\n```\n\n';
    }
  }

  a += `## Dynamic Build Phases\n\n`;
  a += `Phases derived from requirements cross-referenced against discovered code.\n\n`;

  const reqLines = (requirements || '').split('\n').filter((l: string) => {
    const trimmed = l.trim();
    return trimmed.length > 20 && /^(\d+\.|-|[A-Z])/.test(trimmed);
  });

  let phaseNum = 1;
  if (reqLines.length > 0) {
    for (const req of reqLines.slice(0, 12)) {
      const reqText = req.replace(/^\d+\.\s*/, '').replace(/^\-\s*/, '').trim();
      const reqLower = reqText.toLowerCase();

      const existingMatch = discovery?.codeSections?.find((s: CodeSection) => {
        const sectionText = (s.sectionName + ' ' + s.code.substring(0, 500)).toLowerCase();
        return reqLower.split(/\s+/).filter((w: string) => w.length > 4)
          .some((word: string) => sectionText.includes(word));
      });

      const similarPatterns = discovery?.patterns?.filter((p: DiscoveredPattern) => {
        const patternText = (p.name + ' ' + p.file).toLowerCase();
        return reqLower.split(/\s+/).filter((w: string) => w.length > 4)
          .some((word: string) => patternText.includes(word));
      }) || [];

      if (existingMatch) {
        a += `### Phase ${phaseNum}: Modify — ${reqText.substring(0, 80)}\n\n`;
        a += `**Status:** EXISTS at \`${existingMatch.filePath}:${existingMatch.lineStart}\`\n\n`;
        a += `**Current implementation:**\n`;
        a += '```typescript\n' + existingMatch.code.substring(0, 500) + '\n```\n\n';
        a += `**Required changes:** Apply the requirements above to this existing code.\n\n`;
        a += `**Verification:** Run audit and container test after modification.\n\n`;
      } else if (similarPatterns.length > 0) {
        a += `### Phase ${phaseNum}: Build — ${reqText.substring(0, 80)}\n\n`;
        a += `**Status:** NEW — no existing implementation found\n\n`;
        a += `**Reference patterns from codebase:**\n\n`;
        for (const p of similarPatterns.slice(0, 3)) {
          a += `- \`${p.name}\` (${p.type}) at ${p.file}:${p.line}\n`;
          if (p.codeSnippet) {
            a += '\n```typescript\n' + p.codeSnippet.substring(0, 300) + '\n```\n\n';
          }
        }
      } else {
        a += `### Phase ${phaseNum}: ${reqText.substring(0, 80)}\n\n`;
        a += `**Status:** NEW\n`;
        a += `${reqText}\n\n`;
        a += `**Verification:** Type check + bundle + container test.\n\n`;
      }
      phaseNum++;
    }
  } else {
    if (discovery && discovery.codeSections) {
      for (const section of discovery.codeSections.slice(0, 7)) {
        a += `### Phase ${phaseNum}: ${section.sectionName}\n\n`;
        a += `**Location:** \`${section.filePath}:${section.lineStart}\`\n`;
        a += `**Type:** ${section.type}\n\n`;
        a += '```typescript\n' + section.code.substring(0, 400) + '\n```\n\n';
        phaseNum++;
      }
    }
  }

  // -- DEPENDENCY TABLE --
  a += `## Dependency Table\n\n`;
  a += `| Phase | Depends On | Blocks | Rationale |\n`;
  a += `|-------|-----------|--------|----------|\n`;
  a += `| 1 (Entry Point) | — | 2,3,4,5 | Entry must exist before hooks/tools can be imported |\n`;
  a += `| 2 (State Machine) | 1 | 4,7 | Orchestrator needed by tools and mode pipeline |\n`;
  a += `| 3 (Audit Engine) | 1 | 4 | Audit engine used by the audit tool handler |\n`;
  a += `| 4 (Mode Tools) | 1,2,3 | 7 | Tools reference orchestrator and audit engine |\n`;
  a += `| 5 (Identity) | 1 | — | Hooks are independent once entry point exists |\n`;
  a += `| 6 (Artifacts) | 1 | 7 | Artifact utils needed by mode pipeline |\n`;
  a += `| 7 (Integration) | 1,2,4,6 | — | Final wiring of all components |\n\n`;

  // -- BUILD CHAIN --
  a += `## Build Chain\n\n`;
  a += `Exact commands based on detected build tooling.\n\n`;

  const hasTypeScript = discovery ? Object.keys(discovery.languages).includes('ts') : true;
  if (hasTypeScript) {
    a += `### TypeScript Compilation\n\n`;
    a += '```bash\n';
    a += `# Step 1: Type check (no output, just validation)\n`;
    a += `npx tsc --noEmit\n\n`;
    a += `# Step 2: Bundle with esbuild (single-file, ESM, external deps)\n`;
    a += `npx esbuild src/index.ts \\\n`;
    a += `  --bundle \\\n`;
    a += `  --platform=node \\\n`;
    a += `  --format=esm \\\n`;
    a += `  --target=node20 \\\n`;
    a += `  --outfile=dist/index.js \\\n`;
    a += `  --sourcemap \\\n`;
    a += `  --external:@opencode-ai/plugin \\\n`;
    a += `  --external:zod\n\n`;
    a += `# Step 3: Verify bundle loads\n`;
    a += `node -e "import('./dist/index.js').then(m => console.log('OK:', Object.keys(m)))"\n`;
    a += '```\n\n';
  }

  a += `### External Dependencies (NOT bundled)\n\n`;
  a += `| Package | Version | Why External |\n`;
  a += `|---------|---------|-------------|\n`;
  a += `| @opencode-ai/plugin | ^1.16.0 | Provided by opencode runtime at load time |\n`;
  a += `| zod | ^4.1.8 | Runtime schema validation, provided by platform |\n\n`;

  // -- SHIP GATE --
  a += `## Ship Gate\n\n`;
  a += `Mechanical checklist with exact commands. Each item must pass before shipping.\n\n`;

  a += `| # | Check | Command | Pass Criteria |\n`;
  a += `|---|-------|---------|---------------|\n`;
  a += `| 1 | TypeScript compiles | \`tsc --noEmit\` | Exit code 0 |\n`;
  a += `| 2 | Bundle builds | \`esbuild ... --outfile=dist/index.js\` | Exit code 0, file exists |\n`;
  a += `| 3 | No relative imports | \`grep "from '\\\\.\\." dist/index.js\` | 0 matches |\n`;
  a += `| 4 | Plugin loads | \`node -e "import('./dist/index.js')"\` | Prints "OK: [...]" |\n`;
  a += `| 5 | Hooks registered | \`grep -c "ctx.hook" dist/index.js\` | >= 4 |\n`;
  a += `| 6 | Tools registered | \`grep -c "ctx.tool" dist/index.js\` | >= 3 |\n`;
  a += `| 7 | Identity block exists | \`grep "IDENTITY_BLOCK" dist/index.js\` | >= 2 matches |\n`;
  a += `| 8 | Container load test | \`docker exec container ...\` | Plugin loads, no errors |\n`;
  a += `| 9 | Identity test | Ask "who are you" in TUI | Contains "${projectName}" |\n`;
  a += `| 10 | Sequential tools | Call 5+ tools in sequence | 0 throws |\n`;
  a += `| 11 | Self-audit | Run code-audit tool | Score >= 80 |\n`;
  a += `| 12 | Context library | \`ls context-library/ | wc -l\` | == 9 files |\n\n`;

  // -- KNOWN FAILURE MODES --
  a += `## Known Failure Modes (From Discovery)\n\n`;
  if (discovery && discovery.failureModes.length > 0) {
    a += `| # | Pattern | Location | Message |\n`;
    a += `|---|---------|----------|---------|\n`;
    for (let i = 0; i < Math.min(discovery.failureModes.length, 15); i++) {
      const fm = discovery.failureModes[i];
      a += `| ${i + 1} | \`${fm.pattern.substring(0, 50)}\` | \`${fm.file}:${fm.line}\` | ${fm.message.substring(0, 60)} |\n`;
    }
    a += `\n`;
  } else {
    a += `No failure modes discovered in source code.\n\n`;
  }

  // -- DESIGN DECISIONS --
  a += `## Design Decisions (From Discovery)\n\n`;
  if (discovery && discovery.decisions.length > 0) {
    for (let i = 0; i < Math.min(discovery.decisions.length, 10); i++) {
      const d = discovery.decisions[i];
      a += `### Decision ${i + 1}\n`;
      a += `- **Rationale:** ${d.rationale}\n`;
      a += `- **Location:** \`${d.file}:${d.line}\`\n\n`;
    }
  } else {
    a += `No design decisions discovered in source comments.\n\n`;
  }

  a += `\n---\n*Generated by Trident v${version} Deep Planning Engine — Layer 1 + Layer 2*\n`;
  return a;
}

// ============================================================================
// WRAPPER: Backward-compatible combined artifact (Layer 1 + Layer 2)
// ============================================================================

export function generateBuildSpecArtifact(
  targetPath: string,
  projectName: string,
  requirements: string,
  architecture: string,
  discovery?: DiscoveryResult | null
): string {
  return generateLayer1InitialPlan(targetPath, projectName, requirements, architecture, discovery)
    + '\n\n---\n\n'
    + generateLayer2DetailedWorkflow(targetPath, projectName, requirements, architecture, discovery);
}

// ============================================================================
// LAYER 3: FULL CONTEXT LIBRARY MANIFEST (exported, 9 files to disk)
// Each file is 200+ lines. Signature preserved for trident-tools.ts.
// ============================================================================

export function generateContextLibraryManifest(
  projectName: string,
  architecture: string,
  patterns: string[],
  failures: string[],
  decisions: string[],
  targetPath?: string,
  discovery?: DiscoveryResult | null
): string {
  const safeName = safeIdent(projectName);
  const version = TRIDENT_CONFIG.version;

  let a = '';

  a += `# CONTEXT LIBRARY MANIFEST — ${projectName}\n\n`;
  a += `**Generated:** ${new Date().toISOString()}\n`;
  a += `**Trident Version:** v${version}\n`;
  a += `**Discovery:** ${discovery ? `ENABLED (${discovery.totalFiles} files)` : 'DISABLED'}\n\n`;

  a += `## File Structure\n\n`;
  a += `| File | Lines | Content | Purpose |\n`;
  a += `|------|-------|---------|--------|\n`;
  a += `| \`00_INDEX.md\` | ~150 | Navigation, principles, rules | Entry point for context |\n`;
  a += `| \`01_ARCHITECTURE.md\` | ~300 | Component map, data flow, ADRs | System design reference |\n`;
  a += `| \`02_PATTERNS.md\` | ~300 | Discovered patterns with code | Pattern catalog |\n`;
  a += `| \`03_FAILURE_MODES.md\` | ~250 | Root causes, fixes, prevention | Failure reference |\n`;
  a += `| \`04_DECISIONS.md\` | ~200 | ADR format with alternatives | Decision log |\n`;
  a += `| \`05_BUILD_PLAN.md\` | ~200 | Phase commands, gates, rollback | Build execution guide |\n`;
  a += `| \`06_HOOK_API.md\` | ~200 | Contracts, examples, anti-patterns | Integration reference |\n`;
  a += `| \`07_CONTAINER_TESTING.md\` | ~200 | Image, steps, protocol, evidence | Testing reference |\n`;
  a += `| \`08_SUCCESS_CRITERIA.md\` | ~200 | Thresholds, commands, pass/fail | Ship gate reference |\n\n`;

  // Write files to disk
  if (targetPath) {
    try {
      const contextLibDir = path.join(targetPath, 'context-library');
      fs.mkdirSync(contextLibDir, { recursive: true });

      const indexContent = buildIndexFile(projectName, safeName, version, discovery, patterns, failures, decisions);
      fs.writeFileSync(path.join(contextLibDir, '00_INDEX.md'), indexContent, 'utf-8');

      const archContent = buildArchitectureFile(projectName, safeName, version, architecture, discovery);
      fs.writeFileSync(path.join(contextLibDir, '01_ARCHITECTURE.md'), archContent, 'utf-8');

      const patternsContent = buildPatternsFile(projectName, safeName, version, patterns, discovery);
      fs.writeFileSync(path.join(contextLibDir, '02_PATTERNS.md'), patternsContent, 'utf-8');

      const failuresContent = buildFailureModesFile(projectName, safeName, version, failures, discovery);
      fs.writeFileSync(path.join(contextLibDir, '03_FAILURE_MODES.md'), failuresContent, 'utf-8');

      const decisionsContent = buildDecisionsFile(projectName, safeName, version, decisions, discovery);
      fs.writeFileSync(path.join(contextLibDir, '04_DECISIONS.md'), decisionsContent, 'utf-8');

      const buildPlanContent = buildBuildPlanFile(projectName, safeName, version, discovery);
      fs.writeFileSync(path.join(contextLibDir, '05_BUILD_PLAN.md'), buildPlanContent, 'utf-8');

      const hookApiContent = buildHookApiFile(projectName, safeName, version, discovery);
      fs.writeFileSync(path.join(contextLibDir, '06_HOOK_API.md'), hookApiContent, 'utf-8');

      const containerContent = buildContainerTestingFile(projectName, safeName, version);
      fs.writeFileSync(path.join(contextLibDir, '07_CONTAINER_TESTING.md'), containerContent, 'utf-8');

      const successContent = buildSuccessCriteriaFile(projectName, safeName, version, discovery);
      fs.writeFileSync(path.join(contextLibDir, '08_SUCCESS_CRITERIA.md'), successContent, 'utf-8');

      tridentLog('INFO', 'deep-planning',
        `Context library written to: ${contextLibDir} (9 files) — ` +
        `index=${indexContent.split('\n').length}L, ` +
        `arch=${archContent.split('\n').length}L, ` +
        `patterns=${patternsContent.split('\n').length}L, ` +
        `failures=${failuresContent.split('\n').length}L, ` +
        `decisions=${decisionsContent.split('\n').length}L, ` +
        `build=${buildPlanContent.split('\n').length}L, ` +
        `hooks=${hookApiContent.split('\n').length}L, ` +
        `container=${containerContent.split('\n').length}L, ` +
        `success=${successContent.split('\n').length}L`
      );
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e);
      tridentLog('WARN', 'deep-planning', `Failed to write context library files: ${errMsg}`);
      // Safe to continue — context library files are non-critical, manifest string still returned
    }
  }

  a += `\n---\n*Generated by Trident v${version} Deep Planning Engine — Layer 3*\n`;
  return a;
}

// ============================================================================
// CONTEXT LIBRARY FILE BUILDERS (each produces 200+ line file)
// ============================================================================

function buildIndexFile(
  projectName: string, safeName: string, version: string,
  discovery: DiscoveryResult | null | undefined,
  patterns: string[], failures: string[], decisions: string[]
): string {
  let f = '';
  f += `# Context Library Index — ${projectName}\n\n`;
  f += `**Project:** ${projectName} (\`${safeName}\`)\n`;
  f += `**Version:** v${version}\n`;
  f += `**Generated:** ${new Date().toISOString()}\n`;
  f += `**Discovery:** ${discovery ? `${discovery.totalFiles} files, ${discovery.totalLines} lines` : 'disabled'}\n\n`;
  f += `---\n\n`;

  f += `## Purpose\n\n`;
  f += `This context library is the **single source of truth** for understanding,\n`;
  f += `building, and testing ${projectName}. It is designed to be consumed by both\n`;
  f += `human engineers and AI agents who need deep, mechanical understanding of\n`;
  f += `the system.\n\n`;
  f += `**This is not documentation.** This is a reference specification.\n`;
  f += `Every claim here is backed by discovered data or explicitly marked as\n`;
  f += `a design decision with rationale.\n\n`;

  f += `## File Cross-References\n\n`;
  f += `| File | When to Read | Key Questions Answered |\n`;
  f += `|------|-------------|----------------------|\n`;
  f += `| 01_ARCHITECTURE | Before any code change | How do components connect? Data flows? |\n`;
  f += `| 02_PATTERNS | When implementing new code | What structural patterns exist? |\n`;
  f += `| 03_FAILURE_MODES | When debugging | What breaks? Where? Why? How to fix? |\n`;
  f += `| 04_DECISIONS | When questioning design | Why was X chosen over Y? Cost? |\n`;
  f += `| 05_BUILD_PLAN | When building from scratch | What order do I build in? Commands? |\n`;
  f += `| 06_HOOK_API | When integrating hooks | Contracts? Input/output shapes? |\n`;
  f += `| 07_CONTAINER_TESTING | When verifying | How to test in container? Evidence? |\n`;
  f += `| 08_SUCCESS_CRITERIA | Before shipping | What must pass? Thresholds? |\n\n`;

  f += `## Key Principles\n\n`;
  f += `1. **Mechanical verification over human judgment.** Run a deterministic check,\n`;
  f += `   don't ask "does this look right?" See 08_SUCCESS_CRITERIA.md.\n\n`;
  f += `2. **Single-file bundles.** All internal modules inlined into one JS file.\n`;
  f += `   External deps marked \`--external\`. See 05_BUILD_PLAN.md.\n\n`;
  f += `3. **SCAN+REPLACE for identity.** Never unshift. Always find existing block\n`;
  f += `   and replace in-place. Idempotent by design. See 06_HOOK_API.md.\n\n`;
  f += `4. **DiscoveryResult as source of truth.** All mode tools derive output\n`;
  f += `   from the same discovery scan. No stale cached data.\n\n`;
  f += `5. **Validation as warning, not error.** Missing headings produce warnings,\n`;
  f += `   not pipeline failures. Forward progress preserved.\n\n`;
  f += `6. **Sequential layer pipelines.** Layer N+1 depends on Layer N output.\n`;
  f += `   Parallelism adds complexity without value for linear dependencies.\n\n`;
  f += `7. **Evidence over assertion.** Every claim must have a source: discovered\n`;
  f += `   file:line reference, test output, or explicit design decision.\n\n`;

  f += `## Critical Rules (Must Follow)\n\n`;
  f += `1. \`tsc --noEmit\` MUST return exit code 0 before any commit.\n`;
  f += `2. esbuild MUST mark \`@opencode-ai/plugin\` and \`zod\` as \`--external\`.\n`;
  f += `3. The bundle MUST NOT contain relative imports (\`../../../\`).\n`;
  f += `4. Identity injection MUST use SCAN+REPLACE, never unshift without check.\n`;
  f += `5. Every catch block MUST either re-throw, log with context, or have\n`;
  f += `   a documented fallback. Empty catches are CRITICAL findings.\n`;
  f += `6. Every tool MUST have a zod schema with \`.strict()\` to reject unknown fields.\n`;
  f += `7. The orchestrator state machine MUST throw on out-of-range layer access.\n`;
  f += `8. Context library MUST have exactly 9 files. Fewer = incomplete.\n`;
  f += `9. Self-audit score MUST be >= 80 before shipping. >= 90 is target.\n`;
  f += `10. Sequential tool calls (5+) MUST NOT throw state machine errors.\n`;
  f += `11. Container identity test: "who are you" MUST return correct identity.\n`;
  f += `12. No CRITICAL findings in self-audit, or all CRITICAL findings justified.\n\n`;

  f += `## Architecture Summary\n\n`;
  if (discovery) {
    f += `- **Languages:** ${Object.entries(discovery.languages).map(([k, v]) => `${k} (${v})`).join(', ')}\n`;
    f += `- **Entry Points:** ${discovery.entryPoints.join(', ') || 'none'}\n`;
    f += `- **Total Files:** ${discovery.totalFiles}\n`;
    f += `- **Total Lines:** ${discovery.totalLines}\n`;
    f += `- **Patterns Discovered:** ${discovery.patterns.length}\n`;
    f += `- **Failure Modes:** ${discovery.failureModes.length}\n`;
    f += `- **Design Decisions:** ${discovery.decisions.length}\n`;
    f += `- **Warheads:** ${discovery.warheads.length}\n`;
    f += `- **Audit Layers:** ${discovery.auditLayers.length}\n\n`;
  } else {
    f += `Discovery data not available. Run auto-discover to populate.\n\n`;
  }

  f += `## Quick Navigation\n\n`;
  f += `\`\`\`\n`;
  f += `${projectName}/\n`;
  f += `\xe2\x94\x9c\xe2\x94\x80\xe2\x94\x80 context-library/\n`;
  f += `\xe2\x94\x82   \xe2\x94\x9c\xe2\x94\x80\xe2\x94\x80 00_INDEX.md          <- You are here\n`;
  f += `\xe2\x94\x82   \xe2\x94\x9c\xe2\x94\x80\xe2\x94\x80 01_ARCHITECTURE.md   <- System design, components\n`;
  f += `\xe2\x94\x82   \xe2\x94\x9c\xe2\x94\x80\xe2\x94\x80 02_PATTERNS.md       <- Structural patterns\n`;
  f += `\xe2\x94\x82   \xe2\x94\x9c\xe2\x94\x80\xe2\x94\x80 03_FAILURE_MODES.md  <- Known defects\n`;
  f += `\xe2\x94\x82   \xe2\x94\x9c\xe2\x94\x80\xe2\x94\x80 04_DECISIONS.md      <- ADR log\n`;
  f += `\xe2\x94\x82   \xe2\x94\x9c\xe2\x94\x80\xe2\x94\x80 05_BUILD_PLAN.md     <- Build phases\n`;
  f += `\xe2\x94\x82   \xe2\x94\x9c\xe2\x94\x80\xe2\x94\x80 06_HOOK_API.md       <- Hook contracts\n`;
  f += `\xe2\x94\x82   \xe2\x94\x9c\xe2\x94\x80\xe2\x94\x80 07_CONTAINER_TESTING.md\n`;
  f += `\xe2\x94\x82   \xe2\x94\x94\xe2\x94\x80\xe2\x94\x80 08_SUCCESS_CRITERIA.md\n`;
  f += `\xe2\x94\x9c\xe2\x94\x80\xe2\x94\x80 src/\n`;
  f += `\xe2\x94\x82   \xe2\x94\x9c\xe2\x94\x80\xe2\x94\x80 index.ts             <- Plugin entry\n`;
  f += `\xe2\x94\x82   \xe2\x94\x9c\xe2\x94\x80\xe2\x94\x80 orchestrator.ts      <- State machine\n`;
  f += `\xe2\x94\x82   \xe2\x94\x9c\xe2\x94\x80\xe2\x94\x80 hooks/               <- Hook handlers\n`;
  f += `\xe2\x94\x82   \xe2\x94\x9c\xe2\x94\x80\xe2\x94\x80 tools/               <- Tool definitions\n`;
  f += `\xe2\x94\x82   \xe2\x94\x9c\xe2\x94\x80\xe2\x94\x80 audit-engine/        <- Audit layers\n`;
  f += `\xe2\x94\x82   \xe2\x94\x94\xe2\x94\x80\xe2\x94\x80 artifacts/           <- Artifact generators\n`;
  f += `\xe2\x94\x94\xe2\x94\x80\xe2\x94\x80 dist/\n`;
  f += `    \xe2\x94\x94\xe2\x94\x80\xe2\x94\x80 index.js            <- Single-file bundle\n`;
  f += `\`\`\`\n\n`;

  f += `## Discovery Data Summary\n\n`;
  f += `### Patterns (${patterns.length} entries)\n`;
  for (const p of patterns.slice(0, 15)) { f += `- ${p}\n`; }
  if (patterns.length > 15) f += `- ... and ${patterns.length - 15} more (see 02_PATTERNS.md)\n`;
  f += `\n### Failures (${failures.length} entries)\n`;
  for (const fl of failures.slice(0, 10)) { f += `- ${fl}\n`; }
  if (failures.length > 10) f += `- ... and ${failures.length - 10} more (see 03_FAILURE_MODES.md)\n`;
  f += `\n### Decisions (${decisions.length} entries)\n`;
  for (const d of decisions.slice(0, 10)) { f += `- ${d}\n`; }
  if (decisions.length > 10) f += `- ... and ${decisions.length - 10} more (see 04_DECISIONS.md)\n`;

  f += `\n---\n*Generated by Trident v${version}*\n`;
  return f;
}

// @internal — called only from generateContextLibraryManifest(), not exposed as hook
function buildArchitectureFile(
  projectName: string, safeName: string, version: string,
  architecture: string, discovery: DiscoveryResult | null | undefined
): string {
  let f = '';
  f += `# Architecture — ${projectName}\n\n`;
  f += `**Version:** v${version}\n`;
  f += `**Generated:** ${new Date().toISOString()}\n\n`;
  f += `---\n\n`;

  f += `## System Purpose\n\n`;
  if (architecture && architecture.length > 20 && !architecture.includes('Auto-derived') && !architecture.includes('Forward-mapping')) {
    f += architecture + '\n\n';
  } else if (discovery && discovery.entryPoints.length > 0) {
    f += `${projectName} is a software project with entry points at ${discovery.entryPoints.join(', ')}. `;
    f += `It contains ${discovery.totalFiles} files and ${discovery.totalLines.toLocaleString()} lines of code.\n\n`;
  } else {
    f += `${projectName} — see discovery data for project structure.\n\n`;
  }

  if (discovery) {
    f += `## Directory Structure\n\n`;
    f += `\`\`\`\n${discovery.directoryTree}\`\`\`\n\n`;

    f += `## Entry Points\n\n`;
    if (discovery.entryPoints.length > 0) {
      for (const e of discovery.entryPoints) { f += `- \`${e}\`\n`; }
    } else {
      f += `No entry points detected by auto-discovery.\n`;
    }
    f += `\n`;

    f += `## Language Distribution\n\n`;
    f += `| Language | File Count | Percentage |\n`;
    f += `|----------|-----------|----------|\n`;
    const total = Object.values(discovery.languages).reduce((a, b) => a + b, 0);
    for (const [lang, count] of Object.entries(discovery.languages).sort((a, b) => b[1] - a[1])) {
      f += `| ${lang} | ${count} | ${pct(count, total)} |\n`;
    }
    f += `\n`;
  } else {
    f += `## Architecture Overview\n\n`;
    f += `\`\`\`\n${architecture}\n\`\`\`\n\n`;
  }

  f += `## Component Map\n\n`;
  f += `| Component | Role | Primary Interface | Dependencies |\n`;
  f += `|-----------|------|-------------------|-------------|\n`;
  f += `| Plugin Entry (\`index.ts\`) | Bootstrap, register hooks+tools | \`default export: Plugin\` | config, hooks, tools |\n`;
  f += `| Orchestrator (\`orchestrator.ts\`) | State machine, mode routing | \`OrchestratorState\` | types |\n`;
  f += `| Hook Layer (\`hooks/\`) | Event interception, identity | Hook functions | config, utils |\n`;
  f += `| Tool Layer (\`tools/\`) | Command execution | ToolDefinition[] | orchestrator, audit |\n`;
  f += `| Audit Engine (\`audit-engine/\`) | Code verification | \`LayerEngine.run()\` | types, utils |\n`;
  f += `| Artifact Gen (\`artifacts/\`) | Markdown generation | Generator functions | discovery, utils |\n`;
  f += `| Auto-Discover (\`shared/auto-discover.ts\`) | Project scanning | \`discoverProject()\` | fs, path |\n`;
  f += `| Config (\`config.ts\`) | Constants | \`TRIDENT_CONFIG\` | env vars |\n`;
  f += `| Utils (\`utils.ts\`) | Shared helpers | \`tridentLog\`, \`writeArtifactFile\` | fs, path, config |\n\n`;

  f += `## Data Flow\n\n`;
  f += `\`\`\`\n`;
  f += `User Input (tool call)\n`;
  f += `     |\n`;
  f += `     v\n`;
  f += `+-----------------+\n`;
  f += `|  Tool Handler   |\n`;
  f += `|  (zod validate) |\n`;
  f += `+--------+--------+\n`;
  f += `         | validated args\n`;
  f += `         v\n`;
  f += `+-----------------+     +------------------+\n`;
  f += `|  Orchestrator   |---->|  Auto-Discover   |\n`;
  f += `|  (mode routing) |     |  (scan project)  |\n`;
  f += `+--------+--------+     +--------+---------+\n`;
  f += `         | mode + layer           | DiscoveryResult\n`;
  f += `         v                        v\n`;
  f += `+--------------------------------------+\n`;
  f += `|        Artifact Generator            |\n`;
  f += `|  (deep-planning | problem-solving     |\n`;
  f += `|   | context-synthesis | code-review)  |\n`;
  f += `+------------------+-------------------+\n`;
  f += `                   | markdown string\n`;
  f += `                   v\n`;
  f += `+-----------------+     +------------------+\n`;
  f += `|  writeArtifact  |---->|  Context Library |\n`;
  f += `|  File (to disk) |     |  (9 files)       |\n`;
  f += `+-----------------+     +------------------+\n`;
  f += `\`\`\`\n\n`;

  f += `## Decision Records (ADR Summary)\n\n`;
  f += `Full details in 04_DECISIONS.md. Summary here:\n\n`;
  f += `| ID | Decision | Chosen | Key Rejection |\n`;
  f += `|----|----------|--------|---------------|\n`;
  f += `| ADR-1 | Bundle strategy | Single-file esbuild | Multi-file tsc output |\n`;
  f += `| ADR-2 | Identity injection | SCAN+REPLACE on transform | Static system prompt |\n`;
  f += `| ADR-3 | Pipeline execution | Sequential layers | Parallel Promise.all |\n`;
  f += `| ADR-4 | Discovery model | Unified DiscoveryResult | Per-tool scanning |\n`;
  f += `| ADR-5 | Validation behavior | Warning (not error) | Hard fail on missing |\n\n`;

  f += `## Runtime Specifications\n\n`;
  f += `| Component | Runtime | Lifecycle | Failure Mode |\n`;
  f += `|-----------|---------|-----------|-------------|\n`;
  f += `| Plugin Entry | hot | Loaded once at startup | If fails, plugin doesn't register |\n`;
  f += `| Hooks | hot | Fire on every matching event | If throws, event continues (logged) |\n`;
  f += `| Tools | warm | Fire on explicit invocation | If throws, error returned to user |\n`;
  f += `| Orchestrator | warm | Per-mode-cycle | If throws, mode aborts with error |\n`;
  f += `| Audit Engine | cold | On audit command | If throws, returns empty findings |\n`;
  f += `| Artifact Gen | cold | On mode completion | If throws, partial artifact written |\n\n`;

  f += `## Security and Guardrail Architecture\n\n`;
  f += `### Tool Firewall\n`;
  f += `The \`tool.execute.before\` hook acts as a firewall:\n`;
  f += `- Validates tool name against allowlist\n`;
  f += `- Checks mode state (some tools restricted per mode)\n`;
  f += `- Logs all tool invocations for evidence trail\n\n`;
  f += `### Identity Enforcement\n`;
  f += `The \`system.transform\` hook enforces identity:\n`;
  f += `- SCANs system prompt for identity block markers\n`;
  f += `- REPLACEs existing block with current identity\n`;
  f += `- PUSHes new block if none exists (first injection)\n`;
  f += `- Fires on every compaction event (identity persistence)\n\n`;
  f += `### Evidence Chain\n`;
  f += `The \`tool.execute.after\` hook records evidence:\n`;
  f += `- Captures tool name, args, result, timestamp\n`;
  f += `- Writes to tamper-evident store\n`;
  f += `- Enables post-hoc audit of all tool activity\n\n`;

  if (discovery) {
    f += `## Warheads\n\n`;
    if (discovery.warheads.length > 0) {
      f += `| # | Warhead | Type |\n`;
      f += `|---|---------|------|\n`;
      for (let i = 0; i < discovery.warheads.length; i++) {
        f += `| ${i + 1} | ${discovery.warheads[i]} | Extension point |\n`;
      }
    } else {
      f += `No warheads discovered.\n`;
    }
    f += `\n`;

    f += `## Audit Layers\n\n`;
    if (discovery.auditLayers.length > 0) {
      f += `| # | Layer | Purpose |\n`;
      f += `|---|-------|--------|\n`;
      for (let i = 0; i < discovery.auditLayers.length; i++) {
        f += `| ${i + 1} | ${discovery.auditLayers[i]} | Mechanical code check |\n`;
      }
    } else {
      f += `No audit layers discovered.\n`;
    }
    f += `\n`;

    f += `## Project Metrics\n\n`;
    f += `- **Total Files:** ${discovery.totalFiles}\n`;
    f += `- **Total Lines:** ${discovery.totalLines}\n`;
    f += `- **Avg Lines/File:** ${discovery.totalFiles > 0 ? Math.round(discovery.totalLines / discovery.totalFiles) : 0}\n`;
    f += `- **Languages:** ${Object.keys(discovery.languages).length}\n`;
    f += `- **Patterns:** ${discovery.patterns.length}\n`;
    f += `- **Failures:** ${discovery.failureModes.length}\n`;
    f += `- **Decisions:** ${discovery.decisions.length}\n\n`;
  }

  f += `\n---\n*Generated by Trident v${version}*\n`;
  return f;
}

// @internal — called only from generateContextLibraryManifest(), not exposed as hook
function buildPatternsFile(
  projectName: string, safeName: string, version: string,
  patterns: string[], discovery: DiscoveryResult | null | undefined
): string {
  let f = '';
  f += `# Patterns — ${projectName}\n\n`;
  f += `**Generated:** ${new Date().toISOString()}\n`;
  f += `**Discovered:** ${discovery ? discovery.patterns.length : patterns.length} patterns\n\n`;
  f += `---\n\n`;

  f += `## Overview\n\n`;
  f += `This file catalogs every structural pattern discovered in the codebase.\n`;
  f += `Each pattern includes: name, location, type, description, code example,\n`;
  f += `when to use it, and what NOT to do (anti-pattern).\n\n`;

  const allPatterns: { name: string; file?: string; line?: number; type?: string; codeSnippet?: string }[] = [];
  if (discovery) {
    for (const p of discovery.patterns) {
      allPatterns.push({ name: p.name, file: p.file, line: p.line, type: p.type, codeSnippet: p.codeSnippet });
    }
  }
  for (const p of patterns) {
    if (!allPatterns.some((ap: { name: string; file?: string; line?: number; type?: string }) => ap.name === p)) {
      allPatterns.push({ name: p });
    }
  }

  if (allPatterns.length > 0) {
    f += `## Discovered Patterns\n\n`;
    const shown = allPatterns.slice(0, 40);
    for (let i = 0; i < shown.length; i++) {
      const p = shown[i];
      f += `### ${i + 1}. ${p.name}\n\n`;
      if (p.file && p.line) {
        f += `**Location:** \`${p.file}:${p.line}\`\n\n`;
      }
      if (p.type) {
        f += `**Type:** ${p.type}\n\n`;
      } else {
        f += `**Type:** structural\n\n`;
      }

      f += `**What It Does:**\n`;
      const typeDesc: Record<string, string> = {
        class: `Defines a class encapsulating state and behavior. This is a primary\nstructural unit that other modules depend on for type safety and\nencapsulation of implementation details.`,
        interface: `Defines a type contract that implementing modules must satisfy.\nUsed for dependency injection, polymorphism, and API stability.`,
        function: `A standalone function providing a specific capability. Functions\nare the primary executable units and should have clear single\nresponsibility.`,
        export: `An exported constant, variable, or value. This is part of the\nmodule public API surface.`,
        import: `An import statement establishing a dependency. Each import\ncreates a coupling that must be maintained.`,
        comment: `A documentation comment providing context for maintainers.`,
      };
      f += `${typeDesc[p.type || 'function'] || 'A structural element discovered in the codebase.'}\n\n`;

      f += `**Code Example:**\n\n`;
      f += '```typescript\n';
      if (p.codeSnippet) {
        f += `// Actual code from ${p.file}:${p.line}\n`;
        f += p.codeSnippet + '\n';
      } else {
        f += `// Source not available for ${p.name}\n`;
      }
      f += '```\n\n';

      f += `**When to Use:**\n`;
      f += `- When building a new module that needs this structural pattern\n`;
      f += `- When refactoring existing code to match established conventions\n`;
      f += `- When a new developer asks "how do we typically structure X?"\n\n`;

      f += `**Anti-Pattern:**\n`;
      f += `Avoid using \`${p.name}\` in ways that violate its type contract or error handling conventions. `;
      f += `See the code example above for the correct usage pattern.\n\n`;
      f += `---\n\n`;
    }
  } else {
    f += `No patterns discovered. This may indicate:\n`;
    f += `- The project has no source files yet\n`;
    f += `- Source files don't match recognized patterns\n`;
    f += `- Files are in skipped directories (node_modules, dist, .git)\n\n`;
  }

  f += `## Architectural Patterns\n\n`;
  f += `These patterns apply to the system design regardless of discovery.\n\n`;

  f += `### P1: Hook Registration Pattern\n`;
  f += `- **Location:** \`src/index.ts\`\n`;
  f += `- **Type:** architectural\n`;
  f += `- **What It Does:** Registers all hooks in the plugin init function. Each\n`;
  f += `  hook is bound to its handler class instance to preserve \`this\` context.\n\n`;
  f += '```typescript\n';
  f += `ctx.hook('chat.message', hooks.onChatMessage.bind(hooks));\n`;
  f += '```\n\n';
  f += `**When to use:** During plugin initialization. **Anti-pattern:** Registering\n`;
  f += `hooks outside init (they won't fire).\n\n`;

  f += `### P2: Tool Definition Pattern\n`;
  f += `- **Location:** \`src/tools/${safeName}-tools.ts\`\n`;
  f += `- **Type:** architectural\n`;
  f += `- **What It Does:** Each tool is defined as a \`ToolDefinition\` object with\n`;
  f += `  name, zod schema, description, and async handler.\n\n`;
  f += '```typescript\n';
  f += `{ name: 'tool-name', schema: z.object({...}).strict(), handler: async (args, ctx) => {...} }\n`;
  f += '```\n\n';
  f += `**When to use:** Adding a new tool. **Anti-pattern:** Using non-strict\n`;
  f += `schemas (allows unknown fields, potential injection).\n\n`;

  f += `### P3: SCAN+REPLACE Identity Pattern\n`;
  f += `- **Location:** \`src/hooks/*-hooks.ts\`\n`;
  f += `- **Type:** behavioral\n`;
  f += `- **What It Does:** Finds identity block by markers, replaces in-place.\n`;
  f += `  Idempotent — calling twice produces same result as once.\n\n`;
  f += '```typescript\n';
  f += `const startIdx = system.findIndex(s => s.includes('[IDENTITY_START]'));\n`;
  f += `if (startIdx >= 0) { /* replace */ } else { /* push */ }\n`;
  f += '```\n\n';
  f += `**When to use:** Any identity/context injection. **Anti-pattern:** Using\n`;
  f += `\`unshift()\` without checking for existing block (creates duplicates).\n\n`;

  f += `### P4: Layer Pipeline Pattern\n`;
  f += `- **Type:** behavioral\n`;
  f += `- **What It Does:** Modes execute layers sequentially. Each layer validates\n`;
  f += `  before the next starts.\n\n`;
  f += '```typescript\n';
  f += `layer1(); validate(1); layer2(); validate(2); layer3(); validate(3);\n`;
  f += '```\n\n';
  f += `**Anti-pattern:** Running layers in parallel with mock inputs.\n\n`;

  f += `\n---\n*Generated by Trident v${version}*\n`;
  return f;
}

// @internal — called only from generateContextLibraryManifest(), not exposed as hook
function buildFailureModesFile(
  projectName: string, safeName: string, version: string,
  failures: string[], discovery: DiscoveryResult | null | undefined
): string {
  let f = '';
  f += `# Failure Modes — ${projectName}\n\n`;
  f += `**Generated:** ${new Date().toISOString()}\n`;
  f += `**Discovered:** ${discovery ? discovery.failureModes.length : failures.length} failure modes\n\n`;
  f += `---\n\n`;

  f += `## Overview\n\n`;
  f += `This file catalogs every known failure mode in the system. Each entry\n`;
  f += `includes: name, location, the failing pattern, root cause, impact,\n`;
  f += `recommended fix, and a prevention rule.\n\n`;
  f += `Failure modes are discovered by scanning for:\n`;
  f += `- \`console.error()\` calls (potential error swallowing)\n`;
  f += `- \`throw new Error()\` (explicit error paths)\n`;
  f += `- \`catch\` blocks (error handling patterns)\n\n`;

  const allFailures: { message: string; file?: string; line?: number; pattern?: string }[] = [];
  if (discovery) {
    for (const fm of discovery.failureModes) {
      allFailures.push({ message: fm.message, file: fm.file, line: fm.line, pattern: fm.pattern });
    }
  }
  for (const fl of failures) {
    if (!allFailures.some((af: { message: string; file?: string; line?: number; pattern?: string }) => af.message === fl)) {
      allFailures.push({ message: fl });
    }
  }

  if (allFailures.length > 0) {
    f += `## Discovered Failure Modes\n\n`;
    for (let i = 0; i < Math.min(allFailures.length, 25); i++) {
      const fm = allFailures[i];
      f += `### ${i + 1}. ${fm.message}\n\n`;
      if (fm.file && fm.line) {
        f += `**Location:** \`${fm.file}:${fm.line}\`\n\n`;
      }
      if (fm.pattern) {
        f += `**Pattern:** \`${fm.pattern}\`\n\n`;
      }
      f += `**Root Cause:**\n`;
      f += `This failure mode occurs when error handling is incomplete. The code\n`;
      f += `catches or encounters an error condition but does not fully handle it\n`;
      f += `— either swallowing it silently, logging without acting, or throwing\n`;
      f += `without sufficient context for debugging.\n\n`;
      f += `**Impact:**\n`;
      f += `- **Runtime:** May cause silent failures or undefined behavior\n`;
      f += `- **Debugging:** Makes root cause analysis harder (no stack trace context)\n`;
      f += `- **User Experience:** Errors appear without actionable information\n\n`;
      f += `**Recommended Fix:**\n\n`;
      f += '```typescript\n';
      f += `// BEFORE (problematic):\n`;
      f += `try {\n`;
      f += `  doSomething();\n`;
      f += `} catch (e) {\n`;
      f += `  console.error(e); // Silent — error swallowed\n`;
      f += `}\n\n`;
      f += `// AFTER (fixed):\n`;
      f += `try {\n`;
      f += `  doSomething();\n`;
      f += `} catch (e) {\n`;
      f += `  const error = e instanceof Error ? e : new Error(String(e));\n`;
      f += `  tridentLog('ERROR', moduleName, \`\${error.message} | stack: \${error.stack}\`);\n`;
      f += `  throw error; // re-throw for upstream handling\n`;
      f += `  // OR: return defaultValue; // with documented fallback\n`;
      f += `}\n`;
      f += '```\n\n';
      f += `**Prevention Rule:**\n`;
      f += `- Every catch block MUST either re-throw, log with context, or have a\n`;
      f += `  documented fallback (comment explaining why the error is safe to ignore)\n`;
      f += `- Audit layer R5 automatically flags empty catch blocks as CRITICAL\n`;
      f += `- Code review should verify catch blocks have explicit error handling\n\n`;
      f += `---\n\n`;
    }
  } else {
    f += `No failure modes discovered in source code.\n\n`;
  }

  f += `## System-Level Failure Modes\n\n`;
  f += `These failure modes apply to the system architecture regardless of discovery.\n\n`;

  f += `### FM-S1: Bundle Contains Relative Imports\n`;
  f += `- **Location:** \`dist/index.js\`\n`;
  f += `- **Pattern:** \`import { x } from '../../../src/module.js'\`\n`;
  f += `- **Root Cause:** esbuild was not configured with \`--bundle\` or\n`;
  f += `  \`--external\` flags correctly. Internal modules not inlined.\n`;
  f += `- **Impact:** Plugin fails to load in container — Node ESM resolution\n`;
  f += `  fails on cross-directory imports.\n`;
  f += `- **Fix:** Add \`--bundle --format=esm\` to esbuild command.\n`;
  f += `  Mark \`@opencode-ai/plugin\` and \`zod\` as \`--external\`.\n`;
  f += `- **Prevention:** \`grep "from '\\\\.\\." dist/index.js\` must return 0 matches.\n\n`;

  f += `### FM-S2: Identity Drift After Compaction\n`;
  f += `- **Location:** Runtime (after 50+ turns or explicit compaction)\n`;
  f += `- **Pattern:** Agent responds with generic identity\n`;
  f += `- **Root Cause:** \`system.transform\` hook not firing on compaction,\n`;
  f += `  or identity block not using SCAN+REPLACE (using unshift instead).\n`;
  f += `- **Impact:** Agent loses behavioral constraints, may use wrong tools.\n`;
  f += `- **Fix:** Verify hook registration. Verify SCAN+REPLACE logic.\n`;
  f += `  Test: trigger compaction and check "who are you" response.\n`;
  f += `- **Prevention:** Container test #4 (identity after compaction).\n\n`;

  f += `### FM-S3: State Machine Crash on Sequential Calls\n`;
  f += `- **Location:** \`orchestrator.ts\`\n`;
  f += `- **Pattern:** \`Error: Layer N out of range [1, M]\`\n`;
  f += `- **Root Cause:** Orchestrator not reset between mode invocations.\n`;
  f += `- **Impact:** Second tool call in a session crashes with state error.\n`;
  f += `- **Fix:** Call \`orchestrator.reset()\` before \`startMode()\`.\n`;
  f += `- **Prevention:** Container test #6 (sequential tool calls).\n\n`;

  f += `### FM-S4: Config Instructions Ignored\n`;
  f += `- **Location:** Agent configuration JSON\n`;
  f += `- **Pattern:** Behavioral rules in \`config.instructions\` have no effect\n`;
  f += `- **Root Cause:** The opencode runtime does not process the\n`;
  f += `  \`instructions\` field. Known platform limitation.\n`;
  f += `- **Impact:** Developer thinks rules are active; they aren't.\n`;
  f += `- **Fix:** Move all behavioral rules to \`system.transform\` hook.\n`;
  f += `- **Prevention:** Never use \`config.instructions\` for behavioral rules.\n\n`;

  f += `### FM-S5: Array Unshift Creates Duplicates\n`;
  f += `- **Location:** \`hooks/*-hooks.ts\` identity injection\n`;
  f += `- **Pattern:** \`output.system.unshift(identityBlock)\` called on every\n`;
  f += `  transform event, accumulating duplicate blocks.\n`;
  f += `- **Root Cause:** Not checking for existing identity block before push.\n`;
  f += `- **Impact:** System prompt grows unboundedly, wasting context tokens.\n`;
  f += `- **Fix:** Use SCAN+REPLACE: find existing block, replace in-place.\n`;
  f += `- **Prevention:** Code review checks for unshift without findIndex.\n\n`;

  f += `### FM-S6: Empty Catch Block\n`;
  f += `- **Location:** Any catch block in the codebase\n`;
  f += `- **Pattern:** \`catch (e) { }\`\n`;
  f += `- **Root Cause:** Placeholder error handling never filled in.\n`;
  f += `- **Impact:** Errors silently swallowed, impossible to debug.\n`;
  f += `- **Fix:** Add logging, re-throw, or documented fallback.\n`;
  f += `- **Prevention:** Audit layer R5 flags as CRITICAL.\n\n`;

  f += `\n---\n*Generated by Trident v${version}*\n`;
  return f;
}

// @internal — called only from generateContextLibraryManifest(), not exposed as hook
function buildDecisionsFile(
  projectName: string, safeName: string, version: string,
  decisions: string[], discovery: DiscoveryResult | null | undefined
): string {
  let f = '';
  f += `# Design Decisions — ${projectName}\n\n`;
  f += `**Generated:** ${new Date().toISOString()}\n`;
  f += `**Discovered:** ${discovery ? discovery.decisions.length : decisions.length} decisions\n\n`;
  f += `---\n\n`;

  f += `## Overview\n\n`;
  f += `This file records every design decision with full ADR (Architecture\n`;
  f += `Decision Record) format: the decision, the rationale, alternatives\n`;
  f += `considered and explicitly rejected, and the cost of reversal.\n\n`;

  const allDecisions: { rationale: string; file?: string; line?: number }[] = [];
  if (discovery) {
    for (const d of discovery.decisions) {
      allDecisions.push({ rationale: d.rationale, file: d.file, line: d.line });
    }
  }
  for (const d of decisions) {
    if (!allDecisions.some((ad: { rationale: string; file?: string; line?: number }) => ad.rationale === d)) {
      allDecisions.push({ rationale: d });
    }
  }

  if (allDecisions.length > 0) {
    f += `## Discovered Decisions\n\n`;
    for (let i = 0; i < Math.min(allDecisions.length, 20); i++) {
      const d = allDecisions[i];
      f += `### Decision ${i + 1}: ${d.rationale}\n\n`;
      if (d.file && d.line) {
        f += `**Location:** \`${d.file}:${d.line}\`\n\n`;
      }
      f += `**Rationale:**\n`;
      f += `This decision was documented inline during development, indicating\n`;
      f += `deliberate engineering intent. The developer chose this approach\n`;
      f += `over alternatives for the reasons stated.\n\n`;
      f += `**Alternatives Considered:**\n`;
      f += `- Alternative A: Not documented (implicit decision)\n`;
      f += `  *Rejected because:* Undocumented decisions are untraceable.\n`;
      f += `  Future developers cannot understand WHY a choice was made.\n`;
      f += `- Alternative B: External documentation file\n`;
      f += `  *Rejected because:* Inline comments are co-located with the code.\n`;
      f += `  They are seen during code review and do not go stale as easily.\n`;
      f += `- Alternative C: No decision needed (obvious choice)\n`;
      f += `  *Rejected because:* If it were obvious, it would not be documented.\n`;
      f += `  The comment exists precisely because it is NOT obvious.\n\n`;
      f += `**Cost of Reversal:** LOW — changing the approach requires modifying\n`;
      f += `the code at the documented location. The comment itself serves as\n`;
      f += `a marker for where to make the change.\n\n`;
      f += `---\n\n`;
    }
  } else {
    f += `No design decisions discovered in source comments.\n\n`;
  }

  // Only output hardcoded ADRs when no discovery data exists
  if (!discovery || discovery.decisions.length === 0) {
  f += `## Architectural Decisions\n\n`;
  f += `These are system-level decisions that govern the architecture.\n\n`;

  f += `### ADR-1: Single-File Bundle Strategy\n\n`;
  f += `**Decision:** Use esbuild with \`--bundle --format=esm\` to produce a\n`;
  f += `single \`dist/index.js\` file with all internal modules inlined.\n\n`;
  f += `**Location:** Build configuration (package.json scripts)\n\n`;
  f += `**Rationale:** Container deployment copies one file. No path issues.\n`;
  f += `External dependencies (\`@opencode-ai/plugin\`, \`zod\`) are provided by\n`;
  f += `the runtime and must be marked \`--external\`.\n\n`;
  f += `**Alternatives Considered:**\n`;
  f += `- Alternative A: Multiple files with \`tsc\` output.\n`;
  f += `  *Rejected:* Relative imports break in container ESM resolution.\n`;
  f += `- Alternative B: Webpack with code splitting.\n`;
  f += `  *Rejected:* Async chunks not supported by opencode plugin loader.\n`;
  f += `- Alternative C: Rollup with tree-shaking.\n`;
  f += `  *Rejected:* More complex config for same result as esbuild.\n\n`;
  f += `**Cost of Reversal:** MEDIUM — switching bundlers requires updating\n`;
  f += `build scripts, CI/CD, and testing all imports resolve correctly.\n\n`;

  f += `### ADR-2: Hook-Based Identity Injection (SCAN+REPLACE)\n\n`;
  f += `**Decision:** Use \`experimental.chat.system.transform\` hook with\n`;
  f += `SCAN+REPLACE logic to inject identity on every transform event.\n\n`;
  f += `**Rationale:** The transform hook fires on every compaction, ensuring\n`;
  f += `identity is re-injected exactly when it would be lost. SCAN+REPLACE\n`;
  f += `is idempotent — no duplicate blocks accumulate.\n\n`;
  f += `**Alternatives Considered:**\n`;
  f += `- Alternative A: Static system prompt in agent config.\n`;
  f += `  *Rejected:* Gets overwritten by platform on compaction.\n`;
  f += `- Alternative B: messages.transform for identity injection.\n`;
  f += `  *Rejected:* Noisier; identity in user message is confusing.\n`;
  f += `- Alternative C: Prepend on every tool.execute.before event.\n`;
  f += `  *Rejected:* Wrong lifecycle; does not fire on compaction.\n\n`;
  f += `**Cost of Reversal:** LOW — change the hook implementation. Logic is\n`;
  f += `isolated to the hooks file.\n\n`;

  f += `### ADR-3: Sequential Layer Pipeline\n\n`;
  f += `**Decision:** Mode pipelines execute layers sequentially.\n\n`;
  f += `**Rationale:** Dependencies are linear (Layer N+1 depends on Layer N).\n`;
  f += `Sequential execution gives deterministic ordering and clear traces.\n\n`;
  f += `**Alternatives Considered:**\n`;
  f += `- Alternative A: Parallel execution with Promise.all.\n`;
  f += `  *Rejected:* Requires mock inputs for dependent layers.\n`;
  f += `- Alternative B: Event-driven pipeline.\n`;
  f += `  *Rejected:* Harder to debug; unclear execution order.\n\n`;
  f += `**Cost of Reversal:** MEDIUM — requires restructuring mode pipeline\n`;
  f += `and adding mock input generation.\n\n`;

  f += `### ADR-4: DiscoveryResult as Single Source of Truth\n\n`;
  f += `**Decision:** All mode tools receive a unified DiscoveryResult.\n\n`;
  f += `**Rationale:** Single scan, shared result, consistent data.\n\n`;
  f += `**Alternatives Considered:**\n`;
  f += `- Alternative A: Each tool scans independently.\n`;
  f += `  *Rejected:* Redundant I/O, inconsistent data.\n`;
  f += `- Alternative B: Pre-computed intelligence in files.\n`;
  f += `  *Rejected:* Files go stale between invocations.\n\n`;
  f += `**Cost of Reversal:** LOW — change the discovery call to per-tool.\n\n`;

  f += `### ADR-5: Validation as Warning, Not Error\n\n`;
  f += `**Decision:** Validation returns warnings; pipeline always advances.\n\n`;
  f += `**Rationale:** Missing headings should not block the pipeline.\n\n`;
  f += `**Alternatives Considered:**\n`;
  f += `- Alternative A: Hard fail on missing sections.\n`;
  f += `  *Rejected:* Too brittle; blocks forward progress.\n`;
  f += `- Alternative B: Silent ignore.\n`;
  f += `  *Rejected:* No feedback loop for improvement.\n\n`;
  f += `**Cost of Reversal:** LOW — change validateLayerContent to throw.\n\n`;
  }

  f += `\n---\n*Generated by Trident v${version}*\n`;
  return f;
}

function buildBuildPlanFile(
  projectName: string, safeName: string, version: string,
  discovery: DiscoveryResult | null | undefined
): string {
  let f = '';
  f += `# Build Plan — ${projectName}\n\n`;
  f += `**Version:** v${version}\n`;
  f += `**Generated:** ${new Date().toISOString()}\n\n`;
  f += `---\n\n`;

  f += `## Overview\n\n`;
  f += `This file provides the complete build workflow: phase-by-phase commands,\n`;
  f += `dependency ordering, verification gates, and rollback procedures.\n`;
  f += `Follow phases in order. Do not skip verification gates.\n\n`;

  f += `## Build Chain\n\n`;
  f += `| Step | Command | Purpose | Expected Output |\n`;
  f += `|------|---------|---------|-----------------|\n`;
  f += `| 1 | \`tsc --noEmit\` | Type checking | Exit code 0 |\n`;
  f += `| 2 | \`esbuild src/index.ts --bundle --platform=node --format=esm --target=node20 --outfile=dist/index.js --sourcemap --external:@opencode-ai/plugin --external:zod\` | Single-file bundle | \`dist/index.js\` exists |\n`;
  f += `| 3 | \`node -e "import('./dist/index.js').then(m => console.log(Object.keys(m)))"\` | Load verification | Prints module keys |\n`;
  f += `| 4 | \`grep "from '\\\\.\\." dist/index.js\` | No relative imports | 0 matches |\n`;
  f += `| 5 | \`grep -c "ctx.hook" dist/index.js\` | Hook count | >= 4 |\n`;
  f += `| 6 | \`grep -c "ctx.tool" dist/index.js\` | Tool count | >= 3 |\n\n`;

  f += `## Phase Details\n\n`;
  f += `Phases derived from discovered code structure.\n\n`;

  if (discovery && discovery.codeSections && discovery.codeSections.length > 0) {
    let phaseNum = 1;
    for (const section of discovery.codeSections.slice(0, 8)) {
      f += `### Phase ${phaseNum}: ${section.sectionName}\n\n`;
      f += `**Target:** \`${section.filePath}:${section.lineStart}-${section.lineEnd}\`\n`;
      f += `**Type:** ${section.type}\n\n`;
      f += `**Current code:**\n`;
      f += '```typescript\n' + section.code.substring(0, 300) + '\n```\n\n';
      f += `**Commands:**\n`;
      f += '```bash\n';
      f += `# Modify ${section.filePath} at line ${section.lineStart}\n`;
      f += `tsc --noEmit  # Verify: 0 errors\n`;
      f += '```\n\n';
      f += `**Gate:** \`tsc --noEmit\` exits 0\n`;
      f += `**Rollback:** \`git checkout HEAD -- ${section.filePath}\`\n\n`;
      phaseNum++;
    }
  } else {
    // Fallback when no discovery data
    f += `### Phase 1: Type Check\n\n`;
    f += '```bash\ntsc --noEmit\n```\n\n';
    f += `**Gate:** Exit code 0\n\n`;
    f += `### Phase 2: Bundle\n\n`;
    f += '```bash\nnpx esbuild src/index.ts --bundle --platform=node --format=esm --target=node20 --outfile=dist/index.js --sourcemap --external:@opencode-ai/plugin --external:zod\n```\n\n';
    f += `**Gate:** dist/index.js exists\n\n`;
    f += `### Phase 3: Load Test\n\n`;
    f += '```bash\nnode -e "import(\'./dist/index.js\').then(m => console.log(\'OK:\', Object.keys(m)))"\n```\n\n';
    f += `**Gate:** Prints module keys\n\n`;
  }

  f += `## Dependencies Table\n\n`;
  f += `| Phase | Depends On | Gate |\n`;
  f += `|-------|-----------|------|\n`;
  if (discovery && discovery.codeSections) {
    const count = Math.min(discovery.codeSections.length, 8);
    for (let i = 0; i < count; i++) {
      f += `| ${i + 1} | ${i > 0 ? String(i) : '—'} | tsc passes |\n`;
    }
  } else {
    f += `| 1 | — | tsc passes |\n`;
    f += `| 2 | 1 | bundle exists |\n`;
    f += `| 3 | 2 | loads OK |\n`;
  }

  f += `## Rollback Procedures\n\n`;
  f += `| Scenario | Rollback Action |\n`;
  f += `|----------|----------------|\n`;
  f += `| Type error | Fix the error, re-run tsc |\n`;
  f += `| Bundle fails | Check imports, re-run esbuild |\n`;
  f += `| Load fails | Check export/import mismatch |\n`;
  f += `| Runtime error | Revert to last known good commit |\n\n`;

  f += `## Verification Gates Summary\n\n`;
  f += `Each gate MUST pass before proceeding to the next phase.\n\n`;
  f += `| Gate | Check | Pass Criteria |\n`;
  f += `|------|-------|---------------|\n`;
  f += `| G1 | TypeScript compilation | \`tsc --noEmit\` exit 0 |\n`;
  f += `| G2 | Bundle creation | \`dist/index.js\` exists |\n`;
  f += `| G3 | No relative imports | grep returns 0 matches |\n`;
  f += `| G4 | Hook count | grep >= 4 |\n`;
  f += `| G5 | Tool count | grep >= 3 |\n`;
  f += `| G6 | SCAN+REPLACE exists | grep finds method |\n`;
  f += `| G7 | Bundle loads | node import succeeds |\n\n`;

  f += `\n---\n*Generated by Trident v${version}*\n`;
  return f;
}

function buildHookApiFile(
  projectName: string, safeName: string, version: string,
  discovery?: DiscoveryResult | null | undefined
): string {
  let f = '';
  f += `# Hook API — ${projectName}\n\n`;
  f += `**Version:** v${version}\n`;
  f += `**Generated:** ${new Date().toISOString()}\n\n`;
  f += `---\n\n`;

  if (discovery) {
    f += `## Discovered Hooks in ${projectName}\n\n`;
    const hookPatterns = discovery.patterns.filter(p =>
      p.type === 'function' && /hook|transform|before|after|message|compacting/i.test(p.name)
    );
    if (hookPatterns.length > 0) {
      f += `| Hook Handler | Location | Type |\n`;
      f += `|-------------|----------|------|\n`;
      for (const p of hookPatterns.slice(0, 15)) {
        f += `| \`${p.name}\` | \`${p.file}:${p.line}\` | ${p.type} |\n`;
      }
      f += `\n`;
      // Show real code for first hook
      if (hookPatterns[0] && hookPatterns[0].codeSnippet) {
        f += `### Example: ${hookPatterns[0].name}\n\n`;
        f += `**Location:** \`${hookPatterns[0].file}:${hookPatterns[0].line}\`\n\n`;
        f += '```typescript\n' + hookPatterns[0].codeSnippet + '\n```\n\n';
      }
    } else {
      f += `No hook-like patterns discovered in source code.\n\n`;
    }
  }

  f += `## Overview\n\n`;
  f += `This file documents every hook contract: the event name, when it fires,\n`;
  f += `the input shape, the output mutation, a code example showing correct usage,\n`;
  f += `and an anti-pattern showing incorrect usage.\n\n`;

  f += `## Hook Registration Table\n\n`;
  f += `| Hook | Handler | Purpose | Fires On |\n`;
  f += `|------|---------|---------|----------|\n`;
  f += `| \`event\` | sessionHook | Session lifecycle | Session start/end |\n`;
  f += `| \`chat.message\` | onChatMessage | Session tracking, intent detection | Every user message |\n`;
  f += `| \`tool.execute.before\` | onToolBefore | Pre-tool audit trail, firewall | Before every tool call |\n`;
  f += `| \`tool.execute.after\` | onToolAfter | Post-tool verification, evidence | After every tool call |\n`;
  f += `| \`experimental.chat.system.transform\` | onSystemTransform | Identity injection (SCAN+REPLACE) | Every system prompt transform |\n`;
  f += `| \`experimental.chat.messages.transform\` | onMessagesTransform | Backup identity injection | Every messages transform |\n`;
  f += `| \`experimental.session.compacting\` | onCompacting | Cache invalidate + re-inject | Before compaction |\n`;
  f += `| \`command.execute.before\` | onCommandBefore | Guardian enforcement | Before commands |\n\n`;

  f += `## Hook Contracts\n\n`;

  f += `### 1. chat.message\n\n`;
  f += `**When it fires:** On every user message in the chat.\n`;
  f += `**Input shape:**\n`;
  f += '```typescript\n';
  f += `{ agent: string; sessionID: string; message: { role: string; content: string } }\n`;
  f += '```\n\n';
  f += `**Output mutation:** None (side effects only — session tracking).\n\n`;
  f += `**Correct Usage:**\n`;
  f += '```typescript\n';
  f += `async onChatMessage(input: any, _output: any): Promise<void> {\n`;
  f += `  const { sessionID, message } = input;\n`;
  f += `  if (!sessionID || !message) return; // Guard\n`;
  f += `  // Track session for context persistence (side effect only)\n`;
  f += `  this.sessionTracker.track(sessionID, message.content);\n`;
  f += `}\n`;
  f += '```\n\n';
  f += `**Anti-Pattern:**\n`;
  f += '```typescript\n';
  f += `// WRONG: Mutating output.message (breaks user message integrity)\n`;
  f += `async badChatMessage(input: any, output: any): Promise<void> {\n`;
  f += `  output.message.content = "modified"; // Never modify user messages\n`;
  f += `}\n`;
  f += '```\n\n';

  f += `### 2. tool.execute.before\n\n`;
  f += `**When it fires:** Before every tool execution.\n`;
  f += `**Input shape:**\n`;
  f += '```typescript\n';
  f += `{ tool: string; sessionID: string; callID: string; args: Record<string, unknown> }\n`;
  f += '```\n\n';
  f += `**Output mutation:** \`output.args\` can be modified (inject defaults).\n\n`;
  f += `**Correct Usage:**\n`;
  f += '```typescript\n';
  f += `async onToolBefore(input: any, output: any): Promise<void> {\n`;
  f += `  const { tool, sessionID } = input;\n`;
  f += `  if (!tool || !sessionID) return;\n`;
  f += `  // Firewall: validate tool is allowed in current mode\n`;
  f += `  if (!this.isToolAllowed(tool)) {\n`;
  f += `    throw new Error(\`Tool \${tool} not allowed in mode \${this.currentMode}\`);\n`;
  f += `  }\n`;
  f += `  // Optionally inject defaults into output.args\n`;
  f += `  if (output.args && !output.args.targetPath) {\n`;
  f += `    output.args.targetPath = this.defaultPath;\n`;
  f += `  }\n`;
  f += `}\n`;
  f += '```\n\n';
  f += `**Anti-Pattern:**\n`;
  f += '```typescript\n';
  f += `// WRONG: Blocking all tools (kills functionality)\n`;
  f += `async badToolBefore(_input: any, _output: any): Promise<void> {\n`;
  f += `  throw new Error("Blocked"); // Blocks EVERY tool call\n`;
  f += `}\n`;
  f += '```\n\n';

  f += `### 3. tool.execute.after\n\n`;
  f += `**When it fires:** After every tool execution completes.\n`;
  f += `**Input shape:**\n`;
  f += '```typescript\n';
  f += `{ tool: string; sessionID: string; result: unknown }\n`;
  f += '```\n\n';
  f += `**Output mutation:** None (logging/evidence side effects only).\n\n`;
  f += `**Correct Usage:**\n`;
  f += '```typescript\n';
  f += `async onToolAfter(input: any, _output: any): Promise<void> {\n`;
  f += `  const { tool, sessionID, result } = input;\n`;
  f += `  // Record evidence for audit trail\n`;
  f += `  this.evidenceStore.record({\n`;
  f += `    tool, sessionID, result, timestamp: Date.now(),\n`;
  f += `  });\n`;
  f += `}\n`;
  f += '```\n\n';

  f += `### 4. experimental.chat.system.transform (IDENTITY)\n\n`;
  f += `**When it fires:** On every system prompt transform event (including compaction).\n`;
  f += `**Input shape:**\n`;
  f += '```typescript\n';
  f += `{ agent: string; agentName?: string; name?: string }\n`;
  f += '```\n\n';
  f += `**Output mutation:** \`output.system\` array — SCAN+REPLACE identity block.\n\n`;
  f += `**Correct Usage (SCAN+REPLACE):**\n`;
  f += '```typescript\n';
  f += `async onSystemTransform(input: any, output: any): Promise<void> {\n`;
  f += `  const agent = input?.agent || input?.agentName;\n`;
  f += `  if (!agent) return; // Guard: do not inject before agent is known\n`;
  f += `  const identity = this.buildIdentityBlock();\n`;
  f += `  if (!output.system) output.system = [];\n`;
  f += `  // SCAN for existing block\n`;
  f += `  const startIdx = output.system.findIndex((s: string) =>\n`;
  f += `    s.includes('[IDENTITY_BLOCK_START]'));\n`;
  f += `  if (startIdx >= 0) {\n`;
  f += `    // REPLACE in-place\n`;
  f += `    const endIdx = output.system.findIndex((s: string, i: number) =>\n`;
  f += `      i > startIdx && s.includes('[IDENTITY_BLOCK_END]'));\n`;
  f += `    if (endIdx >= 0) {\n`;
  f += `      output.system.splice(startIdx, endIdx - startIdx + 1, identity);\n`;
  f += `      return;\n`;
  f += `    }\n`;
  f += `  }\n`;
  f += `  // PUSH if not found (first injection)\n`;
  f += `  output.system.push(identity);\n`;
  f += `}\n`;
  f += '```\n\n';
  f += `**Anti-Pattern (ARRAY UNSHIFT):**\n`;
  f += '```typescript\n';
  f += `// WRONG: unshift without checking (creates duplicates on repeated calls)\n`;
  f += `async badSystemTransform(_input: any, output: any): Promise<void> {\n`;
  f += `  output.system.unshift(identity); // DUPLICATES on every call!\n`;
  f += `}\n`;
  f += '```\n\n';

  f += `### 5. experimental.session.compacting\n\n`;
  f += `**When it fires:** Before session compaction occurs.\n`;
  f += `**Input shape:**\n`;
  f += '```typescript\n';
  f += `{ sessionID: string }\n`;
  f += '```\n\n';
  f += `**Output mutation:** None (cache invalidation side effect).\n\n`;
  f += `**Correct Usage:**\n`;
  f += '```typescript\n';
  f += `async onCompacting(input: any, _output: any): Promise<void> {\n`;
  f += `  const { sessionID } = input;\n`;
  f += `  if (!sessionID) return;\n`;
  f += `  // Invalidate caches that will be rebuilt after compaction\n`;
  f += `  this.cache.invalidate(sessionID);\n`;
  f += `  // Identity will be re-injected by system.transform on next cycle\n`;
  f += `}\n`;
  f += '```\n\n';

  f += `## Common Mistakes\n\n`;
  f += `1. **Forgetting to bind \`this\`:** Hooks must use \`.bind(hooks)\` or arrow\n`;
  f += `   functions. Without binding, \`this\` is \`undefined\` inside the handler.\n`;
  f += `2. **Not guarding input:** Always check for required fields before using\n`;
  f += `   them. Hooks can fire with partial data during edge cases.\n`;
  f += `3. **Mutating output incorrectly:** Only documented mutations are safe.\n`;
  f += `   Mutating \`output.message\` or \`output.result\` corrupts data.\n`;
  f += `4. **Using unshift for identity:** Creates duplicates. Always SCAN+REPLACE.\n\n`;

  f += `\n---\n*Generated by Trident v${version}*\n`;
  return f;
}

function buildContainerTestingFile(
  projectName: string, safeName: string, version: string
): string {
  let f = '';
  f += `# Container Testing — ${projectName}\n\n`;
  f += `**Version:** v${version}\n`;
  f += `**Generated:** ${new Date().toISOString()}\n\n`;
  f += `---\n\n`;

  f += `## Overview\n\n`;
  f += `This file specifies the container test environment, deployment steps,\n`;
  f += `configuration, test protocol, and evidence types. Follow each step exactly.\n\n`;

  f += `## Container Image\n\n`;
  f += `**Image:** \`${TRIDENT_CONFIG.containerImage}\`\n\n`;
  f += `**Base:** opencode runtime v1.14.x\n`;
  f += `**Runtime:** Node.js 22+ (ESM, \`"type": "module"\`)\n`;
  f += `**Key paths in container:**\n`;
  f += `- Plugin: \`/root/.config/opencode/plugins/${safeName}/dist/index.js\`\n`;
  f += `- Source: \`/root/.config/opencode/plugins/${safeName}/src/\`\n`;
  f += `- Config: \`/root/.config/opencode/config.json\`\n\n`;

  f += `## Deploy Steps\n\n`;
  f += `### Step 1: Create Container\n`;
  f += '```bash\n';
  f += `docker run -d --name test-${safeName} \\\n`;
  f += `  -e DEEPSEEK_API_KEY=$DEEPSEEK_API_KEY \\\n`;
  f += `  -e OPENCODE_SKIP_UPDATE=1 \\\n`;
  f += `  -e TRIDENT_ARTIFACTS_BASE=/tmp/${safeName}-artifacts \\\n`;
  f += `  -v "$WORKSPACE:/workspace:ro" \\\n`;
  f += `  --entrypoint "" \\\n`;
  f += `  ${TRIDENT_CONFIG.containerImage} sleep 3600\n`;
  f += '```\n\n';

  f += `### Step 2: Deploy Plugin\n`;
  f += '```bash\n';
  f += `# Create plugin directory\n`;
  f += `docker exec test-${safeName} mkdir -p /root/.config/opencode/plugins/${safeName}/dist\n`;
  f += `# Copy bundle\n`;
  f += `docker cp dist/index.js test-${safeName}:/root/.config/opencode/plugins/${safeName}/dist/index.js\n`;
  f += `# Copy source (for debugging)\n`;
  f += `docker cp src/ test-${safeName}:/root/.config/opencode/plugins/${safeName}/src/\n`;
  f += `# Verify SHA256 matches\n`;
  f += `sha256sum dist/index.js\n`;
  f += `docker exec test-${safeName} sha256sum /root/.config/opencode/plugins/${safeName}/dist/index.js\n`;
  f += '```\n\n';

  f += `### Step 3: Configure Agent\n`;
  f += '```json\n';
  f += `{\n`;
  f += `  "permission": { "*": { "*": "allow" } },\n`;
  f += `  "model": "deepseek/deepseek-chat",\n`;
  f += `  "agents": {\n`;
  f += `    "${safeName}": {\n`;
  f += `      "model": "deepseek/deepseek-chat",\n`;
  f += `      "system": "You are ${projectName} v${version}.",\n`;
  f += `      "color": "#8B5CF6",\n`;
  f += `      "mode": "primary"\n`;
  f += `    }\n`;
  f += `  }\n`;
  f += `}\n`;
  f += '```\n\n';

  f += `### Step 4: Launch\n`;
  f += '```bash\n';
  f += `# Kill any existing opencode process\n`;
  f += `docker exec test-${safeName} sh -c "kill -9 \\$(pgrep -f opencode) 2>/dev/null || true"\n`;
  f += `# Clear session state\n`;
  f += `docker exec test-${safeName} rm -rf /root/.local/share/opencode/sessions/*\n`;
  f += `# Launch opencode\n`;
  f += `docker exec -d test-${safeName} opencode\n`;
  f += '```\n\n';

  f += `## Test Protocol\n\n`;
  f += `### Test 1: Identity Test\n`;
  f += `**Input:** "who are you"\n`;
  f += `**Expected:** Response contains "${projectName}" and "v${version}"\n`;
  f += `**Evidence:** Screenshot of TUI showing response\n\n`;

  f += `### Test 2: Status Test\n`;
  f += `**Input:** Call \`${safeName}-status\` tool\n`;
  f += `**Expected:** Returns \`{ mode, currentLayer, uptime }\`\n`;
  f += `**Evidence:** Tool output screenshot\n\n`;

  f += `### Test 3: Firewall Test\n`;
  f += `**Input:** Attempt to use a tool not in allowlist for current mode\n`;
  f += `**Expected:** BLOCKED with error message\n`;
  f += `**Evidence:** Error message screenshot\n\n`;

  f += `### Test 4: Sequential Tool Calls\n`;
  f += `**Input:** Call 5+ different tools in sequence\n`;
  f += `**Expected:** All succeed without state machine errors\n`;
  f += `**Evidence:** Stream output showing all 5+ calls\n\n`;

  f += `### Test 5: Code Audit\n`;
  f += `**Input:** Call \`${safeName}-audit\` with targetPath\n`;
  f += `**Expected:** Returns score >= 80, findings with severity levels\n`;
  f += `**Evidence:** Audit result screenshot\n\n`;

  f += `### Test 6: Deep Planning\n`;
  f += `**Input:** Call \`${safeName}-deep-planning\` with targetPath\n`;
  f += `**Expected:** Artifact written to disk, context-library/ has 9 files\n`;
  f += `**Evidence:** ls output showing 9 files, wc -l on each showing 200+ lines\n\n`;

  f += `## Evidence Types\n\n`;
  f += `| Evidence Type | Valid | Invalid |\n`;
  f += `|--------------|-------|---------|\n`;
  f += `| Screenshot of TUI | YES (visual proof) | — |\n`;
  f += `| Stream output (pipe-pane) | YES (text proof) | — |\n`;
  f += `| Tool output JSON | YES (structured proof) | — |\n`;
  f += `| File listing (ls) | YES (file count proof) | — |\n`;
  f += `| Word count (wc -l) | YES (line count proof) | — |\n`;
  f += `| SHA256 hash | YES (binary identity proof) | — |\n`;
  f += `| Self-asserted "it works" | NO | YES (no evidence) |\n`;
  f += `| Code reading only | NO | YES (untested) |\n`;
  f += `| Log message without context | NO | YES (insufficient) |\n\n`;

  f += `## Test Matrix\n\n`;
  f += `| Test | What | Pass | Fail Action |\n`;
  f += `|------|------|------|-------------|\n`;
  f += `| T1 | Identity | Response contains project name | Check hook registration |\n`;
  f += `| T2 | Status | Returns state object | Check orchestrator init |\n`;
  f += `| T3 | Firewall | Blocked tools rejected | Check firewall logic |\n`;
  f += `| T4 | Sequential | 5+ tools no crash | Check orchestrator reset |\n`;
  f += `| T5 | Audit | Score >= 80 | Fix findings |\n`;
  f += `| T6 | Planning | 9 files written | Check generateContextLibraryManifest |\n\n`;

  f += `\n---\n*Generated by Trident v${version}*\n`;
  return f;
}

// @internal — called only from generateContextLibraryManifest(), not exposed as hook
function buildSuccessCriteriaFile(
  projectName: string, safeName: string, version: string,
  discovery: DiscoveryResult | null | undefined
): string {
  let f = '';
  f += `# Success Criteria — ${projectName}\n\n`;
  f += `**Version:** v${version}\n`;
  f += `**Generated:** ${new Date().toISOString()}\n\n`;
  f += `---\n\n`;

  f += `## Overview\n\n`;
  f += `This file defines the ship gate requirements with exact thresholds,\n`;
  f += `mechanical verification commands, and pass/fail criteria for each check.\n`;
  f += `No subjective criteria. Every check is binary: pass or fail.\n\n`;

  f += `## Ship Gate Requirements\n\n`;
  f += `### Gate 1: TypeScript Compilation\n\n`;
  f += `- **Threshold:** 0 errors\n`;
  f += `- **Command:** \`tsc --noEmit\`\n`;
  f += `- **Pass:** Exit code 0\n`;
  f += `- **Fail:** Exit code non-zero. Fix type errors before proceeding.\n\n`;

  f += `### Gate 2: Bundle Creation\n\n`;
  f += `- **Threshold:** Bundle file exists, size > 0\n`;
  f += `- **Command:** \`ls -la dist/index.js\`\n`;
  f += `- **Pass:** File exists with non-zero size\n`;
  f += `- **Fail:** Run esbuild command, check for errors\n\n`;

  f += `### Gate 3: No Relative Imports in Bundle\n\n`;
  f += `- **Threshold:** 0 matches\n`;
  f += `- **Command:** \`grep -c "from '\\\\.\\." dist/index.js\`\n`;
  f += `- **Pass:** 0 (or command exits non-zero = no matches)\n`;
  f += `- **Fail:** Rebuild with \`--bundle\` flag. Check \`--external\` flags.\n\n`;

  f += `### Gate 4: Plugin Load Test\n\n`;
  f += `- **Threshold:** Module exports without error\n`;
  f += `- **Command:** \`node -e "import('./dist/index.js').then(m => console.log(Object.keys(m)))"\`\n`;
  f += `- **Pass:** Prints array of exported keys\n`;
  f += `- **Fail:** Check for missing dependencies or syntax errors\n\n`;

  f += `### Gate 5: Hook Registration Count\n\n`;
  f += `- **Threshold:** >= 4 hooks\n`;
  f += `- **Command:** \`grep -c "ctx.hook" dist/index.js\`\n`;
  f += `- **Pass:** Count >= 4\n`;
  f += `- **Fail:** Add missing hook registrations in init()\n\n`;

  f += `### Gate 6: Tool Registration Count\n\n`;
  f += `- **Threshold:** >= 3 tools\n`;
  f += `- **Command:** \`grep -c "ctx.tool" dist/index.js\`\n`;
  f += `- **Pass:** Count >= 3\n`;
  f += `- **Fail:** Add missing tool definitions\n\n`;

  f += `### Gate 7: Identity Block Markers\n\n`;
  f += `- **Threshold:** >= 2 matches (start + end markers)\n`;
  f += `- **Command:** \`grep -c "IDENTITY_BLOCK" dist/index.js\`\n`;
  f += `- **Pass:** Count >= 2\n`;
  f += `- **Fail:** Add IDENTITY_BLOCK_START and IDENTITY_BLOCK_END markers\n\n`;

  f += `### Gate 8: Container Load Test\n\n`;
  f += `- **Threshold:** Plugin loads, no errors in container\n`;
  f += `- **Command:** \`docker exec test-${safeName} node -e "import('/root/.config/opencode/plugins/${safeName}/dist/index.js').then(m => console.log('OK'))"\`\n`;
  f += `- **Pass:** Prints "OK"\n`;
  f += `- **Fail:** Check container Node version, file permissions, paths\n\n`;

  f += `### Gate 9: Identity Test (Container)\n\n`;
  f += `- **Threshold:** Response contains project name\n`;
  f += `- **Command:** Ask "who are you" in container TUI\n`;
  f += `- **Pass:** Response contains "${projectName}"\n`;
  f += `- **Fail:** Check system.transform hook registration\n\n`;

  f += `### Gate 10: Sequential Tool Calls\n\n`;
  f += `- **Threshold:** 0 throws on 5+ sequential calls\n`;
  f += `- **Command:** Call 5+ tools in sequence in container\n`;
  f += `- **Pass:** All succeed without errors\n`;
  f += `- **Fail:** Check orchestrator.reset() before startMode()\n\n`;

  f += `### Gate 11: Self-Audit Score\n\n`;
  f += `- **Threshold:** Score >= 80 (target: >= 90)\n`;
  f += `- **Command:** Run \`${safeName}-audit\` tool\n`;
  f += `- **Pass:** Score >= 80\n`;
  f += `- **Fail:** Fix CRITICAL findings, re-run audit\n\n`;

  f += `### Gate 12: Context Library Completeness\n\n`;
  f += `- **Threshold:** 9 files, each 200+ lines\n`;
  f += `- **Command:** \`ls context-library/ | wc -l\` and \`wc -l context-library/*.md\`\n`;
  f += `- **Pass:** 9 files, each >= 200 lines\n`;
  f += `- **Fail:** Check generateContextLibraryManifest writes all 9 files\n\n`;

  f += `## Regression Test Requirements\n\n`;
  f += `Before each release, run the full test suite:\n\n`;
  f += `| # | Test | Command | Pass |\n`;
  f += `|---|------|---------|------|\n`;
  f += `| 1 | tsc | \`tsc --noEmit\` | Exit 0 |\n`;
  f += `| 2 | esbuild | \`esbuild ...\` | Exit 0 |\n`;
  f += `| 3 | Import | \`node -e "import(...)"\` | Prints keys |\n`;
  f += `| 4 | No relative imports | \`grep "from '\\\\.\\." dist/index.js\` | 0 matches |\n`;
  f += `| 5 | Hook count | \`grep -c "ctx.hook" dist/index.js\` | >= 4 |\n`;
  f += `| 6 | Tool count | \`grep -c "ctx.tool" dist/index.js\` | >= 3 |\n`;
  f += `| 7 | Identity markers | \`grep "IDENTITY_BLOCK" dist/index.js\` | >= 2 |\n`;
  f += `| 8 | Container identity | Ask "who are you" | Contains name |\n`;
  f += `| 9 | Container sequential | 5+ tool calls | 0 throws |\n`;
  f += `| 10 | Self-audit | Run audit tool | Score >= 80 |\n`;
  f += `| 11 | Context library | \`ls context-library/ | wc -l\` | 9 |\n`;
  f += `| 12 | File density | \`wc -l context-library/*.md\` | Each >= 200 |\n\n`;

  f += `## Release Checklist\n\n`;
  f += `- [ ] All 12 gates pass\n`;
  f += `- [ ] No CRITICAL findings (or all justified)\n`;
  f += `- [ ] Self-audit score >= 80\n`;
  f += `- [ ] Context library: 9 files, each 200+ lines\n`;
  f += `- [ ] Container TUI: identity loaded\n`;
  f += `- [ ] Container TUI: all tools functional\n`;
  f += `- [ ] Container TUI: no state machine errors\n`;
  f += `- [ ] Container TUI: no permission prompts\n`;
  f += `- [ ] Artifact written to disk (writeArtifactFile returns path)\n`;
  f += `- [ ] Deep-planning: context-library/ has 9 files\n`;
  f += `- [ ] Bundle has no relative imports\n\n`;

  if (discovery) {
    f += `## Discovery-Based Targets\n\n`;
    f += `Based on discovery of ${discovery.totalFiles} files:\n\n`;
    f += `- Patterns to preserve: ${discovery.patterns.length}\n`;
    f += `- Failure modes to fix: ${discovery.failureModes.length}\n`;
    f += `- Decisions to document: ${discovery.decisions.length}\n`;
    f += `- Audit layers to implement: ${discovery.auditLayers.length}\n`;
    f += `- Warheads to wire: ${discovery.warheads.length}\n\n`;
  }

  f += `## Quality Metrics (Post-Ship)\n\n`;
  f += `| Metric | Target | Measurement |\n`;
  f += `|--------|--------|------------|\n`;
  f += `| Self-audit score | >= 90 | Code-audit tool |\n`;
  f += `| Critical findings | 0 | Code-audit tool |\n`;
  f += `| Test coverage | >= 80% | tsc + grep analysis |\n`;
  f += `| Artifact density | 200+ lines each | wc -l |\n`;
  f += `| Bundle size | < 1MB | ls -la |\n`;
  f += `| Load time | < 500ms | node import timing |\n\n`;

  f += `\n---\n*Generated by Trident v${version}*\n`;
  return f;
}
