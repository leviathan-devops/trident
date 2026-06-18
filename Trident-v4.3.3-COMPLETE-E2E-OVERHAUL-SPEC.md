# TRIDENT BRAIN v4.3.2 → v4.3.3 — COMPLETE E2E OVERHAUL WORKFLOW

## EXECUTION MANDATE

**The implementing agent WILL try to cheat, take shortcuts, theatricalize, and lie.** Every instruction below has anti-cheat enforcement. If the agent deviates, the build is REJECTED. Zero tolerance. No "I'll fix it later." No "for future versions." No "this is complex enough." **EVERYTHING NOW.**

---

## ZERO TRUST DIRECTIVES

### Global Anti-Patterns — Automatic Rejection Triggers

| Trigger | Looks Like | Rejection |
|---------|-----------|-----------|
| **Theatrical tests** | Adding test files, test frameworks | **IMMEDIATE REJECTION** |
| **Script-based testing** | Adding .sh, .py, .js test scripts | **IMMEDIATE REJECTION** |
| **console.log as verification** | Adding console.log("verified") | **IMMEDIATE REJECTION** |
| **TODO/FIXME/HACK** | Incomplete implementation markers | **IMMEDIATE REJECTION** |
| **"Configurable" solutions** | Making fix depend on config flag/envar | **IMMEDIATE REJECTION** |
| **Two-phase commits** | "Will complete later" | **IMMEDIATE REJECTION** |
| **Scope arguments** | "This is complex, maybe X first" | **IMMEDIATE REJECTION** |
| **Adding dependencies** | Installing npm packages to "help" | **IMMEDIATE REJECTION** |
| **Fabricated verification** | Claiming test passed without showing output | **IMMEDIATE REJECTION** |

### Execution Rules
1. **Strict sequential order** — Phase N verification MUST pass before Phase N+1 begins
2. **No parallel work** — One file change at a time, verified
3. **No "optimizations"** — Follow the spec EXACTLY. No creative changes.
4. **No options** — Every step below is MANDATORY. Not optional. Not configurable.
5. **No skipping** — If you skip a phase or sub-step, the ENTIRE BUILD IS REJECTED

---

## FILE INDEX — 17 Files Modified or Created

| File | Action | Phase |
|------|--------|-------|
| `audit-engine/types.ts` | MODIFY: Add 3 fields to AnalysisContext | 0 |
| `tools/trident-tools.ts` | MODIFY: 13 console.error → tridentLog | 1 |
| `orchestrator.ts` | MODIFY: 2 console.error → delete | 1 |
| `audit-engine/preflight.ts` | MODIFY: 1 console.error → delete | 1 |
| `identity/index.ts` | MODIFY: 1 console.error → tridentLog + add import | 1 |
| `audit-engine/evidence-gate.ts` | MODIFY: R16 suppress + support cases | 2 |
| `audit-engine/layers/r16-bible-enforcement.ts` | MODIFY: Add node: prefix to builtin list | 2 |
| `audit-engine/code-classifier.ts` | MODIFY: Self-audit check replacement | 3 |
| `audit-engine/code-classifier.ts` | MODIFY: Multi-language scanner | 4 |
| `modes/deep-planning-state-machine.ts` | MODIFY: Semantic validator | 5 |
| `modes/context-synthesis.ts` | MODIFY: Semantic validator | 5 |
| `modes/problem-solving.ts` | MODIFY: Semantic validator | 5 |
| `tools/trident-tools.ts` | MODIFY: Delete SKIPPED escape hatch | 5 |
| `fsm/orchestrator-machine.ts` | REWRITE: Full state machine (min 100 lines) | 6 |
| `orchestrator.ts` | MODIFY: Integrate state machine | 6 |
| `identity/identity-enforcer.ts` | CREATE: New file (min 100 lines) | 7 |
| `hooks/identity-enforcer-hook.ts` | CREATE: New file | 7 |

---

# PHASE 0: ANALYSIS CONTEXT TYPE EXPANSION

## File: `audit-engine/types.ts`

### Change: Add 3 fields to `AnalysisContext` interface

**Find the `AnalysisContext` interface** (around lines 126-139). **Replace with:**

```typescript
export interface AnalysisContext {
  constructs: CodeConstruct[];
  symbolTable: SymbolTable;
  callGraph: CallGraph;
  preflight: PreflightResult;
  packageJson: Record<string, unknown> | null;
  tsconfig: Record<string, unknown> | null;
  opencodeJson: Record<string, unknown> | null;
  diagnostics: ts.Diagnostic[];
  projectRoot: string;
  constructsByFile: Map<string, CodeConstruct[]>;
  isSelfAudit: boolean;
  sourceFiles: Map<string, ts.SourceFile>;
  // PHASE 0: New fields for multi-language scanner
  skippedExtensions: string[];
  totalFilesScanned: number;
  totalFilesSkipped: number;
}
```

### Verification
```bash
npx tsc --noEmit
# Expected: 0 errors
```

Any code that constructs `AnalysisContext` must now supply these 3 new fields. **Update ALL call sites.** If there are any files that create `AnalysisContext` objects, add:
```typescript
  skippedExtensions: [],
  totalFilesScanned: 0,
  totalFilesSkipped: 0,
```

---

# PHASE 1: CONSOLE SPILLOVER ELIMINATION

## EXACT COMMAND: Find all console.error calls
```bash
grep -rn "console\.error" tools/trident-tools.ts orchestrator.ts audit-engine/preflight.ts identity/index.ts
```

## File 1a: `tools/trident-tools.ts` — 13 changes

### Line 40 — resolveTargetPath catch block
```typescript
// DELETE:
} catch { console.error('[resolveTargetPath] Path not accessible:', trimmed); tridentLog('WARN', ...
// REPLACE WITH:
} catch { tridentLog('WARN', 'resolveTargetPath', 'Path not accessible: ' + trimmed); ...
```

### Line 59 — resolveTargetPath search root access check
```typescript
// DELETE:
} catch { console.error('[resolveTargetPath] Search root not accessible:', root); tridentLog('DEBUG', ...
// REPLACE WITH:
} catch { tridentLog('DEBUG', 'resolveTargetPath', 'Search root not accessible: ' + root); ...
```

### Line 79 — resolveTargetPath search failure
```typescript
// DELETE:
} catch { console.error('[resolveTargetPath] Search failed in ' + root); tridentLog('DEBUG', ...
// REPLACE WITH:
} catch { tridentLog('DEBUG', 'resolveTargetPath', 'Search failed in ' + root); ...
```

### Line 87 — resolveTargetPath partial search root access
```typescript
// DELETE:
} catch { console.error('[resolveTargetPath] Search root not accessible:', root); tridentLog('DEBUG', ...
// REPLACE WITH:
} catch { tridentLog('DEBUG', 'resolveTargetPath', 'Search root not accessible: ' + root); ...
```

### Line 104 — resolveTargetPath partial search failure
```typescript
// DELETE:
} catch { console.error('[resolveTargetPath] Search failed in ' + root); tridentLog('DEBUG', ...
// REPLACE WITH:
} catch { tridentLog('DEBUG', 'resolveTargetPath', 'Partial match search in ' + root + ' failed'); ...
```

### Line 121 — resolveProjectName catch
```typescript
// DELETE:
} catch (e: unknown) { console.error('[trident-tools] resolveProjectName failed:', e instanceof Error ? e.message : String(e)); tridentLog('WARN', ...
// REPLACE WITH:
} catch (e: unknown) { tridentLog('WARN', 'trident-tools', 'resolveProjectName failed: ' + (e instanceof Error ? e.message : String(e))); ...
```

### Line 193 — fileExists catch
```typescript
// DELETE:
} catch (e: unknown) { console.error('[trident-tools] fileExists error:', e instanceof Error ? e.message : String(e)); return false; }
// REPLACE WITH:
} catch { tridentLog('DEBUG', 'trident-tools', 'fileExists check failed'); return false; }
```

### Line 218 — writeArtifactFile catch
```typescript
// DELETE:
} catch (err: unknown) { console.error('[trident-tools] writeArtifactFile failed:', err instanceof Error ? err.message : String(err)); tridentLog('ERROR', ...
// REPLACE WITH:
} catch (err: unknown) { tridentLog('ERROR', 'trident-tools', 'writeArtifactFile failed: ' + (err instanceof Error ? err.message : String(err))); ...
```

### Line 320 — trident-code-audit execute catch
```typescript
// DELETE THE console.error LINE (keep the rest):
} catch (err: unknown) {
  console.error('[trident-code-audit] Failed:', err instanceof Error ? err.message : String(err));  // ← DELETE THIS LINE
  const errorId = `AUDIT-ERR-${Date.now()}`;
  const errMsg = err instanceof Error ? err.message : String(err);
  tridentLog('ERROR', 'trident-code-audit', `[${errorId}] ${errMsg}`);
```

### Line 388 — trident-deep-planning execute catch
```typescript
// DELETE THE console.error LINE:
} catch (err: unknown) {
  console.error('[trident-deep-planning] Failed:', err instanceof Error ? err.message : String(err));  // ← DELETE THIS LINE
  const errMsg = err instanceof Error ? err.message : String(err);
  const errorId = `PLAN-ERR-${Date.now()}`;
  tridentLog('ERROR', 'trident-deep-planning', `[${errorId}] ${errMsg}`);
```

### Line 444 — trident-problem-solving execute catch
```typescript
// DELETE THE console.error LINE:
} catch (err: unknown) {
  console.error('[trident-problem-solving] Failed:', err instanceof Error ? err.message : String(err));  // ← DELETE THIS LINE
  const errMsg = err instanceof Error ? err.message : String(err);
  const errorId = `PS-ERR-${Date.now()}`;
  tridentLog('ERROR', 'trident-problem-solving', `[${errorId}] ${errMsg}`);
```

### Line 507 — trident-context-synthesis execute catch
```typescript
// DELETE THE console.error LINE:
} catch (err: unknown) {
  console.error('[trident-context-synthesis] Failed:', err instanceof Error ? err.message : String(err));  // ← DELETE THIS LINE
  const errMsg = err instanceof Error ? err.message : String(err);
  const errorId = `CS-ERR-${Date.now()}`;
  tridentLog('ERROR', 'trident-context-synthesis', `[${errorId}] ${errMsg}`);
```

### Line 568 — trident-gate execute catch
```typescript
// DELETE:
  console.error('[trident-gate] Failed:', err instanceof Error ? err.message : String(err));
  const errMsg = err instanceof Error ? err.message : String(err);
  const errorId = `GATE-ERR-${Date.now()}`;
  tridentLog('ERROR', 'trident-gate', `[${errorId}] ${errMsg}`);
// REPLACE WITH:
  const errMsg = err instanceof Error ? err.message : String(err);
  const errorId = `GATE-ERR-${Date.now()}`;
  tridentLog('ERROR', 'trident-gate', `[${errorId}] ${errMsg}`);
```

## File 1b: `orchestrator.ts` — 2 changes

### Line 46 — saveStateToDisk catch
```typescript
// DELETE THIS ENTIRE LINE (tridentLog already on next line):
    console.error('[orchestrator] State save failed:', e instanceof Error ? e.message : String(e));
```

### Line 64 — loadStateFromDisk catch
```typescript
// DELETE THIS ENTIRE LINE (tridentLog already on next line):
    console.error('[orchestrator] State load failed:', e instanceof Error ? e.message : String(e));
```

## File 1c: `audit-engine/preflight.ts` — 1 change

### Line 72 — fileExists catch
```typescript
// DELETE THIS ENTIRE LINE:
      console.error('[preflight] fileExists check failed for', filePath, ':', e instanceof Error ? e.message : String(e));
```

## File 1d: `identity/index.ts` — 1 change + 1 import

### Line 1: Add import
```typescript
// ADD at line 1:
import { tridentLog } from '../utils.js';
```

### Line 51 — loadForRole catch
```typescript
// DELETE:
      console.error('[Trident IdentityLoader] Failed to load identity files:', e instanceof Error ? e.message : String(e));
// REPLACE WITH:
      tridentLog('ERROR', 'identity', 'Failed to load identity files: ' + (e instanceof Error ? e.message : String(e)));
```

### Anti-Cheat: Verify Phase 1
```bash
grep -rn "console\.error" tools/trident-tools.ts orchestrator.ts audit-engine/preflight.ts identity/index.ts
# Expected: 0 matches in ALL 4 files
```

**If even ONE console.error remains, the phase is FAILED. Do not proceed to Phase 2 until 0 matches.**

---

# PHASE 2: EVIDENCE GATE R16 FIX + NODE: PREFIX

## File 2a: `audit-engine/evidence-gate.ts`

### Change 2a.1: Fix `suppress('R16')` — lines 43-44

**BEFORE:**
```typescript
      case 'R16':
        return this.preflight.buildPassed && this.preflight.typeCheckPassed;
```

**AFTER:**
```typescript
      case 'R16':
        // PHASE 2: R16 is NEVER suppressed by build pass. R16 checks ARE the build.
        // Only suppress R16 if the analysis found ZERO R16-relevant constructs
        // (no imports, no functions, no catch blocks).
        return !this.findings || this.findings.length === 0;
```

### Change 2a.2: Fix `support('R16')` — lines 70-71

**BEFORE:**
```typescript
      case 'R16':
        return !this.preflight.buildPassed || !this.preflight.typeCheckPassed;
```

**AFTER:**
```typescript
      case 'R16':
        // PHASE 2: R16 is always supported when findings exist.
        // Build success does NOT delegitimize R16 findings.
        return this.findings && this.findings.length > 0;
```

### Anti-Cheat: Verify
```bash
grep -n "buildPassed && typeCheckPassed" audit-engine/evidence-gate.ts
# Expected: only line 26 (R0), NOT line 44 (R16)

grep -A3 "case 'R16':" audit-engine/evidence-gate.ts
# First occurrence (suppress) must NOT contain buildPassed
# Second occurrence (support) must NOT contain buildPassed
```

## File 2b: `audit-engine/layers/r16-bible-enforcement.ts`

### Change 2b.1: Fix `node:` prefix — lines 108-112

**BEFORE:**
```typescript
    const isBuiltinOrWellKnown = [
      'fs', 'path', 'os', 'util', 'child_process', 'stream', 'http', 'https',
      'crypto', 'zlib', 'url', 'querystring', 'events', 'buffer',
      '@opencode-ai/plugin', 'zod',
    ].some((b: string) => modulePath === b || modulePath.startsWith(`${b}/`));
```

**AFTER:**
```typescript
    const isBuiltinOrWellKnown = [
      'fs', 'path', 'os', 'util', 'child_process', 'stream', 'http', 'https',
      'crypto', 'zlib', 'url', 'querystring', 'events', 'buffer',
      'node:fs', 'node:path', 'node:os', 'node:util', 'node:child_process',
      'node:stream', 'node:http', 'node:https', 'node:crypto', 'node:zlib',
      'node:url', 'node:querystring', 'node:events', 'node:buffer',
      'node:assert', 'node:tls', 'node:net', 'node:dns', 'node:dgram',
      'node:readline', 'node:cluster', 'node:module', 'node:worker_threads',
      '@opencode-ai/plugin', 'zod',
    ].some((b: string) => modulePath === b || modulePath.startsWith(`${b}/`));
```

### Anti-Cheat: Verify
```bash
grep "node:fs" audit-engine/layers/r16-bible-enforcement.ts
# Expected: line present in the isBuiltinOrWellKnown array
```

---

# PHASE 3: SELF-AUDIT CHECK REPLACEMENT

## File: `audit-engine/code-classifier.ts`

### Change: Replace line 42

**BEFORE:**
```typescript
  const isSelfAudit = String(packageJson?.name || '').toLowerCase().includes('trident') || false;
```

**AFTER:**
```typescript
  // PHASE 3: Exact match only — no false positives from names containing "trident"
  // (e.g., "not-trident-engine", "trident-tools-helper")
  // Also check env var TRIDENT_SELF_AUDIT — allows explicit override without package.json rename
  const pkgName = String(packageJson?.name || '').toLowerCase();
  const selfAuditNames = new Set(['trident', '@opencode-ai/trident', 'trident-brain', 'trident-plugin']);
  const isSelfAudit = selfAuditNames.has(pkgName) || process.env.TRIDENT_SELF_AUDIT === 'true' || false;
```

### Anti-Cheat: Verify
```bash
grep -n "includes.*trident" audit-engine/code-classifier.ts
# Expected: 0 matches — the old fragile check must be gone

grep -n "selfAuditNames" audit-engine/code-classifier.ts
# Expected: at least 1 match — the new check must be present
```

---

# PHASE 4: MULTI-LANGUAGE SCANNER

## File: `audit-engine/code-classifier.ts`

### Step 4.1: Add extensions constant BEFORE the function (before line 704)

```typescript
// PHASE 4: Supported source file extensions for multi-language scanning
const SUPPORTED_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.json', '.yaml', '.yml',
  '.py', '.rs', '.go', '.css', '.html', '.md',
]);
```

### Step 4.2: Replace `collectTsFiles` function (lines 704-719)

**DELETE lines 704-719 entirely (the `collectTsFiles` function):**

```typescript
function collectTsFiles(dir: string, projectRoot: string, depth: number = 0, maxDepth: number = 20): string[] {
  const files: string[] = [];
  if (depth > maxDepth) return files;
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory() && entry.name !== 'node_modules' && entry.name !== '.git' && entry.name !== 'dist') {
        files.push(...collectTsFiles(fullPath, projectRoot, depth + 1, maxDepth));
      } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx'))) {
        files.push(fullPath);
      }
    }
  } catch (e: unknown) {     tridentLog('DEBUG', 'code-classifier', 'collectTsFiles failed: ' + (e instanceof Error ? e.message : String(e))); return files; }
  return files;
}
```

**REPLACE WITH:**

```typescript
function collectProjectFiles(dir: string, projectRoot: string, depth: number = 0, maxDepth: number = 20): { files: string[]; skipped: string[] } {
  const files: string[] = [];
  const skipped: string[] = [];
  if (depth > maxDepth) return { files, skipped };
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== 'node_modules' && entry.name !== '.git' && entry.name !== 'dist' && !entry.name.startsWith('.')) {
          const sub = collectProjectFiles(fullPath, projectRoot, depth + 1, maxDepth);
          files.push(...sub.files);
          skipped.push(...sub.skipped);
        }
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (SUPPORTED_EXTENSIONS.has(ext)) {
          files.push(fullPath);
        } else if (ext !== '') {
          skipped.push(fullPath);
        }
      }
    }
  } catch (e: unknown) {
    tridentLog('DEBUG', 'code-classifier', 'collectProjectFiles failed: ' + (e instanceof Error ? e.message : String(e)));
    return { files, skipped };
  }
  return { files, skipped };
}
```

### Step 4.3: Update the call site in `buildAST`

**FIND the call to `collectTsFiles`** in the fallback path (around lines 117-136).

**BEFORE:**
```typescript
  if (!program) {
    const srcDir = path.join(projectRoot, 'src');
    const baseDir = fs.existsSync(srcDir) ? srcDir : projectRoot;
    const files = collectTsFiles(baseDir, projectRoot, 0, 20);
```

**AFTER:**
```typescript
  if (!program) {
    const srcDir = path.join(projectRoot, 'src');
    const baseDir = fs.existsSync(srcDir) ? srcDir : projectRoot;
    const { files: allFiles, skipped: skippedFiles } = collectProjectFiles(baseDir, projectRoot, 0, 20);
```

**ALSO update the loop below it:**
**BEFORE:** `for (const filePath of files) {`
**AFTER:** `for (const filePath of allFiles) {`

### Step 4.4: Track skipped extensions in buildAST returns

**FIND the return statement of `buildAST`** (around line 135).

Collect the extension counts from the skipped files and pass them through the `ClassificationResult` interface.

**UPDATE** the `ClassificationResult` interface (lines 17-24) to include:
```typescript
interface ClassificationResult {
  constructsByFile: Map<string, CodeConstruct[]>;
  symbolTable: SymbolTable;
  callGraph: CallGraph;
  diagnostics: ts.Diagnostic[];
  sourceFiles: Map<string, ts.SourceFile>;
  checker: ts.TypeChecker | null;
  // PHASE 4 additions:
  skippedExtensions: string[];
  totalFilesScanned: number;
  totalFilesSkipped: number;
}
```

Then in the `buildAST` return (line 135), pass these values:
```typescript
  const extCounts: string[] = [...new Set(skippedFiles.map((f: string) => path.extname(f).toLowerCase()).filter(Boolean))];

  return {
    constructsByFile,
    symbolTable,
    callGraph: { entries: new Map(), totalCallSites: 0, resolvedCallSites: 0, coveragePercent: 0 },
    diagnostics,
    sourceFiles,
    checker,
    skippedExtensions: extCounts,
    totalFilesScanned: allFiles.length,
    totalFilesSkipped: skippedFiles.length,
  };
```

For the `program` path (line 94-106), add defaults:
```typescript
  if (program) {
    // ...existing code...
    // After the for loop, add:
    const extCounts: string[] = [];
    // ... rest of the program path code stays the same
```

### Step 4.5: Populate AnalysisContext with scan metadata

**In `classifyProject`** (around lines 26-58), update the return to include the new fields:

**BEFORE:**
```typescript
  return {
    constructs: allConstructs,
    symbolTable: result.symbolTable,
    callGraph,
    preflight,
    packageJson,
    tsconfig,
    opencodeJson,
    diagnostics: result.diagnostics,
    projectRoot,
    constructsByFile: result.constructsByFile,
    isSelfAudit,
    sourceFiles: result.sourceFiles,
  };
```

**AFTER:**
```typescript
  return {
    constructs: allConstructs,
    symbolTable: result.symbolTable,
    callGraph,
    preflight,
    packageJson,
    tsconfig,
    opencodeJson,
    diagnostics: result.diagnostics,
    projectRoot,
    constructsByFile: result.constructsByFile,
    isSelfAudit,
    sourceFiles: result.sourceFiles,
    // PHASE 4: Multi-language scan metadata
    skippedExtensions: result.skippedExtensions || [],
    totalFilesScanned: result.totalFilesScanned || constructsByFile.size,
    totalFilesSkipped: result.totalFilesSkipped || 0,
  };
```

### Anti-Cheat: Verify Phase 4
```bash
grep -n "collectTsFiles" audit-engine/code-classifier.ts
# Expected: 0 matches — function must be GONE

grep -n "collectProjectFiles" audit-engine/code-classifier.ts
# Expected: at least 1 match — new function must exist

grep -n "SUPPORTED_EXTENSIONS" audit-engine/code-classifier.ts
# Expected: at least 1 match

npx tsc --noEmit
# Expected: 0 errors
```

**If you skip any step or leave collectTsFiles in the file, the phase is FAILED.**

---

# PHASE 5: SEMANTIC VALIDATORS

## File 5a: `modes/deep-planning-state-machine.ts`

### Replace lines 31-68 entirely (the `validateLayerContent` method)

**DELETE the existing `validateLayerContent` method (lines 31-68).**

**INSERT this replacement:**

```typescript
  validateLayerContent(layer: number, input: string): { valid: boolean; missing: string[] } {
    const missing: string[] = [];
    const lines = input.split('\n');
    const nonEmpty = lines.filter((l: string) => l.trim().length > 10);

    // PHASE 5: Heading-structure-based validation — parses ## Section Headings
    // instead of keyword matching. Extracts section headings and checks content.
    const headings: string[] = [];
    for (const line of lines) {
      const headingMatch = line.match(/^##\s+(.+)/);
      if (headingMatch) headings.push(headingMatch[1].toLowerCase().trim());
    }

    switch (layer) {
      case 1: {
        const hasPrinciplesSection = headings.some(h => h.includes('first principles') || h.includes('principles'));
        const hasConstraintsSection = headings.some(h => h.includes('constraint') || h.includes('limit') || h.includes('boundar'));
        const hasCriteriaSection = headings.some(h => h.includes('success criteria') || h.includes('criteria') || h.includes('measurable'));
        const hasQuestionsSection = headings.some(h => h.includes('open question') || h.includes('unknown') || h.includes('uncertaint'));
        const hasNumberedItems = nonEmpty.filter(l => /^\d+\.|^- |\*/.test(l.trim())).length;

        if (!hasPrinciplesSection && hasNumberedItems < 3) missing.push('First Principles section (## heading + 3+ numbered items)');
        if (!hasConstraintsSection) missing.push('Constraints section (## Constraints heading)');
        if (!hasCriteriaSection) missing.push('Success Criteria section (## Success Criteria heading)');
        if (!hasQuestionsSection) missing.push('Open Questions section (## Open Questions heading)');
        if (nonEmpty.length < 5) missing.push('Minimum content: 5+ substantive lines');
        break;
      }
      case 2: {
        const hasComponentsSection = headings.some(h => h.includes('component') || h.includes('module') || h.includes('workflow'));
        const hasSequenceSection = headings.some(h => h.includes('sequence') || h.includes('order') || h.includes('phase') || h.includes('step'));
        const hasDependenciesSection = headings.some(h => h.includes('dependenc') || h.includes('prerequisite') || h.includes('requirement'));
        const hasFailureSection = headings.some(h => h.includes('failure') || h.includes('risk') || h.includes('error') || h.includes('rollback'));
        const hasVerificationSection = headings.some(h => h.includes('verification') || h.includes('test') || h.includes('validat') || h.includes('confirm'));

        if (!hasComponentsSection) missing.push('Components section (## Components heading)');
        if (!hasSequenceSection) missing.push('Sequencing section (## Sequencing / Phases heading)');
        if (!hasDependenciesSection) missing.push('Dependencies section (## Dependencies heading)');
        if (!hasFailureSection) missing.push('Failure Modes section (## Failure Modes heading)');
        if (!hasVerificationSection) missing.push('Verification section (## Verification heading)');
        break;
      }
      case 3: {
        const hasArchitectureSection = headings.some(h => h.includes('architect') || h.includes('structur') || h.includes('design'));
        const hasInterfaceSection = headings.some(h => h.includes('interface') || h.includes('contract') || h.includes('api') || h.includes('endpoint'));
        const hasStateSection = headings.some(h => h.includes('state') || h.includes('persist') || h.includes('store') || h.includes('cache'));
        const hasErrorSection = headings.some(h => h.includes('error') || h.includes('exception') || h.includes('recover') || h.includes('catch'));

        if (!hasArchitectureSection) missing.push('Architecture section (## Architecture heading)');
        if (!hasInterfaceSection) missing.push('Interfaces section (## Interfaces heading)');
        if (!hasStateSection) missing.push('State Management section (## State Management heading)');
        if (!hasErrorSection) missing.push('Error Handling section (## Error Handling heading)');
        if (nonEmpty.length < 3) missing.push('Minimum content: 3+ substantive lines');
        break;
      }
      default:
        return { valid: false, missing: ['Unknown layer: ' + layer] };
    }

    return { valid: missing.length === 0, missing };
  }
```

## File 5b: `modes/context-synthesis.ts`

### Replace lines 111-137 entirely (the `validateLayerContent` method)

**DELETE the existing `validateLayerContent` method (lines 111-137).**

**INSERT this replacement:**

```typescript
  validateLayerContent(layer: number, content: string): { valid: boolean; missing: string[] } {
    const missing: string[] = [];
    const lines = content.split('\n');

    // PHASE 5: Heading-structure-based validation
    const headings: string[] = [];
    for (const line of lines) {
      const headingMatch = line.match(/^##\s+(.+)/);
      if (headingMatch) headings.push(headingMatch[1].toLowerCase().trim());
    }
    const allContent = content.toLowerCase();

    switch (layer) {
      case 1: {
        const hasSessionSection = headings.some(h => h.includes('session') || h.includes('context'));
        const hasT1Section = headings.some(h => /t1|t2|t3|t4/.test(h));
        const hasCollectionSection = headings.some(h => h.includes('collection') || h.includes('collect') || h.includes('summary'));

        if (!hasSessionSection && !allContent.includes('session')) missing.push('Session section (## Session / Context Info heading)');
        if (!hasT1Section && !/(t1|t2|t3|t4)/.test(content)) missing.push('Context Sources section (## T1-T4 headings)');
        if (!hasCollectionSection && !allContent.includes('collection')) missing.push('Collection Summary section (## Collection Summary heading)');
        break;
      }
      case 2: {
        const hasScoringSection = headings.some(h => h.includes('score') || h.includes('scoring') || h.includes('relevance'));
        const hasUrgencySection = headings.some(h => h.includes('urgency') || h.includes('priority') || h.includes('rank'));
        const hasImportanceSection = headings.some(h => h.includes('importance') || h.includes('weight') || h.includes('factor'));

        if (!hasScoringSection && !allContent.includes('score')) missing.push('Scoring section (## Scoring / Relevance heading)');
        if (!hasUrgencySection && !allContent.includes('urgency')) missing.push('Urgency section (## Urgency / Priority heading)');
        if (!hasImportanceSection && !allContent.includes('importance')) missing.push('Importance section (## Importance heading)');
        break;
      }
      case 3: {
        const hasCompressionSection = headings.some(h => h.includes('compress') || h.includes('token') || h.includes('budget'));
        const hasDedupSection = headings.some(h => h.includes('deduplicat') || h.includes('merge') || h.includes('summar'));

        if (!hasCompressionSection && !allContent.includes('compress')) missing.push('Compression section (## Compression / Token Budget heading)');
        if (!hasDedupSection && !/(deduplicat|merge|summar)/.test(allContent)) missing.push('Deduplication section (## Deduplication / Merging heading)');
        break;
      }
      case 4: {
        const hasInjectionSection = headings.some(h => h.includes('inject') || h.includes('t0') || h.includes('format'));
        const hasConfigSection = headings.some(h => h.includes('config') || h.includes('opencode') || h.includes('structure'));

        if (!hasInjectionSection && !allContent.includes('inject')) missing.push('Injection Format section (## Injection Format heading)');
        if (!hasConfigSection && !allContent.includes('config')) missing.push('Config section (## Config / opencode.json heading)');
        break;
      }
    }

    return { valid: missing.length === 0, missing };
  }
```

## File 5c: `modes/problem-solving.ts`

### Replace lines 229-268 entirely (the `validateLayerContent` method)

**DELETE the existing `validateLayerContent` method (lines 229-268).**

**INSERT this replacement:**

```typescript
  validateLayerContent(layer: number, content: string): { valid: boolean; missing: string[] } {
    const missing: string[] = [];
    const lines = content.split('\n');

    // PHASE 5: Heading-structure-based validation
    const headings: string[] = [];
    for (const line of lines) {
      const headingMatch = line.match(/^##\s+(.+)/);
      if (headingMatch) headings.push(headingMatch[1].toLowerCase().trim());
    }
    const allContent = content.toLowerCase();

    switch (layer) {
      case 1: {
        const hasAssumptionSection = headings.some(h => h.includes('assumption'));
        const hasReasoningSection = headings.some(h => h.includes('reasoning') || h.includes('hypothesis'));
        const hasCriteriaSection = headings.some(h => h.includes('success criteria') || h.includes('confirmation') || h.includes('disprov'));

        if (!hasAssumptionSection && !allContent.includes('assumption')) missing.push('Assumption section (## Assumption heading)');
        if (!hasReasoningSection && !allContent.includes('reasoning')) missing.push('Reasoning section (## Reasoning Chain / Hypothesis heading)');
        if (!hasCriteriaSection && !allContent.includes('success criteria')) missing.push('Success Criteria section (## Success Criteria heading)');
        break;
      }
      case 2: {
        const hasCommandSection = headings.some(h => h.includes('command') || h.includes('action') || h.includes('execute'));
        const hasExpectedSection = headings.some(h => h.includes('expected') || h.includes('prediction') || h.includes('output'));
        const hasEnvSection = headings.some(h => h.includes('environment') || h.includes('context') || h.includes('state'));

        if (!hasCommandSection && !/```/.test(content)) missing.push('Command section (## Command / Action heading with code block)');
        if (!hasExpectedSection && !allContent.includes('expected')) missing.push('Expected Output section (## Expected Output heading)');
        if (!hasEnvSection && !allContent.includes('environment')) missing.push('Environment section (## Environment State heading)');
        break;
      }
      case 3: {
        const hasActualOutput = /```/.test(content);
        const hasLogsSection = headings.some(h => h.includes('log') || h.includes('trace') || h.includes('output'));
        const hasComparisonSection = headings.some(h => h.includes('expected') || h.includes('actual') || h.includes('comparison') || h.includes('difference'));

        if (!hasActualOutput) missing.push('Raw Evidence section (code block with actual output)');
        if (!hasLogsSection && !allContent.includes('log')) missing.push('Logs section (## Logs Checked heading)');
        if (!hasComparisonSection && !(allContent.includes('expected') && allContent.includes('actual'))) missing.push('Expected vs Actual section (## Expected vs Actual heading)');
        break;
      }
      case 4: {
        const hasGapSection = headings.some(h => h.includes('gap') || h.includes('analysis') || h.includes('root cause'));
        const hasHypothesisSection = headings.some(h => h.includes('hypothesis') || h.includes('theory'));
        const hasNextSection = headings.some(h => h.includes('next action') || h.includes('next step') || h.includes('plan'));

        if (!hasGapSection && !allContent.includes('gap')) missing.push('Gap Analysis section (## Gap Analysis heading)');
        if (!hasHypothesisSection && !allContent.includes('hypothesis')) missing.push('Hypothesis section (## Updated Hypothesis heading)');
        if (!hasNextSection && !(allContent.includes('next') && allContent.includes('action'))) missing.push('Next Action section (## Next Action heading)');
        break;
      }
      case 5: {
        const hasRetroSection = headings.some(h => h.includes('should have') || h.includes('retrospect') || h.includes('lesson'));
        const hasPatternSection = headings.some(h => h.includes('pattern') || h.includes('theme') || h.includes('recurring'));
        const hasSystemicSection = headings.some(h => h.includes('systemic') || h.includes('structural') || h.includes('prevent'));

        if (!hasRetroSection && !allContent.includes('should have done')) missing.push('Retrospective section (## What I Should Have Done heading)');
        if (!hasPatternSection && !allContent.includes('pattern')) missing.push('Pattern section (## Pattern Extracted heading)');
        if (!hasSystemicSection && !allContent.includes('systemic')) missing.push('Systemic Issue section (## Systemic Issue heading)');
        break;
      }
      case 6: {
        const hasEnvSection = headings.some(h => h.includes('environment') || h.includes('target') || h.includes('deploy'));
        const hasExecutionSection = headings.some(h => h.includes('execution') || h.includes('result') || h.includes('verification'));
        const hasAssessmentSection = headings.some(h => h.includes('assessment') || h.includes('status') || h.includes('conclusion'));

        if (!hasEnvSection && !allContent.includes('environment')) missing.push('Target Environment section (## Target Environment heading)');
        if (!hasExecutionSection && !/```/.test(content)) missing.push('Execution section (## Execution + Result heading with code block)');
        if (!hasAssessmentSection && !allContent.includes('assessment')) missing.push('Assessment section (## Final Assessment heading)');
        break;
      }
    }

    return { valid: missing.length === 0, missing };
  }
```

## File 5d: `tools/trident-tools.ts` — Delete "SKIPPED" escape hatch

### Delete lines 238-243:

```typescript
  // When all layers are partial, input was too minimal — skip validation theater
  if (noneValid && validations.length > 0) {
    let r = `## Mode Validation — ${modeName}\n\n`;
    r += `**Result:** SKIPPED — Input too minimal for validation (${validations.length} layers checked, 0 passed)\n\n`;
    r += `Validation requires detailed input parameters. Re-run with richer requirements, architecture, and patterns for a full validation.\n`;
    return r;
  }
```

Delete these lines entirely. The `formatValidationReport` function after this block already handles the all-fail case correctly with `PARTIAL (0/N layers validated)`.

### Anti-Cheat: Verify Phase 5
```bash
grep -n "msg\.includes\|SKIPPED" modes/deep-planning-state-machine.ts modes/context-synthesis.ts modes/problem-solving.ts tools/trident-tools.ts
# Expected: 0 matches for msg.includes in mode files
# Expected: 0 matches for SKIPPED (only legitimate use in error messages elsewhere)

grep -c "headings.some\|headings.includes" modes/deep-planning-state-machine.ts
# Expected: >= 4 (heading structure parsing must be present)
```

---

# PHASE 6: STATE MACHINE

## File 6a: `fsm/orchestrator-machine.ts` — REWRITE COMPLETELY

**The current file is 2 lines:**
```
// REMOVED: XState machine — architecture bleed from Kraken/Spider.
// Trident does not use XState. Mode logic is handled by tool handlers directly.
```

**DELETE EVERYTHING. REPLACE WITH:**

```typescript
/**
 * TRIDENT STATE MACHINE — Programmatic transition logic
 * 
 * Replaces the removed XState dependency with pure TypeScript finite state machine.
 * Every transition is validated: illegal transitions throw errors.
 * 
 * State flow:
 *   IDLE → RUNNING → LAYER_COMPLETE → RUNNING → ... → COMPLETE
 *   RUNNING → ERROR | TIMEOUT
 *   ERROR → IDLE
 *   TIMEOUT → IDLE
 *   COMPLETE → IDLE
 */

export type TridentMode =
  | 'IDLE'
  | 'CODE_REVIEW'
  | 'DEEP_PLANNING'
  | 'PROBLEM_SOLVING'
  | 'CONTEXT_SYNTHESIS';

export type TridentStatus =
  | 'IDLE'
  | 'RUNNING'
  | 'LAYER_COMPLETE'
  | 'ERROR'
  | 'TIMEOUT'
  | 'COMPLETE';

export interface MachineState {
  mode: TridentMode;
  currentLayer: number;
  maxLayers: number;
  status: TridentStatus;
  iteration: number;
  lastTransition: string;
  transitionHistory: Array<{ from: string; to: string; at: number; trigger: string }>;
  startedAt: number;
  error: string | null;
}

// Mode → max layers mapping
const MODE_LAYER_MAP: Record<TridentMode, number> = {
  IDLE: 0,
  CODE_REVIEW: 17,
  DEEP_PLANNING: 3,
  PROBLEM_SOLVING: 6,
  CONTEXT_SYNTHESIS: 4,
};

// Legal transitions: [fromStatus] → Set<toStatus>
const STATUS_TRANSITIONS: Record<string, Set<string>> = {
  IDLE: new Set(['RUNNING']),
  RUNNING: new Set(['LAYER_COMPLETE', 'ERROR', 'TIMEOUT', 'COMPLETE']),
  LAYER_COMPLETE: new Set(['RUNNING', 'COMPLETE', 'ERROR', 'TIMEOUT']),
  ERROR: new Set(['RUNNING', 'IDLE']),
  TIMEOUT: new Set(['IDLE']),
  COMPLETE: new Set(['IDLE', 'RUNNING']),
};

export class OrchestratorMachine {
  private state: MachineState;

  constructor() {
    this.state = this.defaultState();
  }

  private defaultState(): MachineState {
    return {
      mode: 'IDLE',
      currentLayer: 0,
      maxLayers: 0,
      status: 'IDLE',
      iteration: 0,
      lastTransition: 'init',
      transitionHistory: [],
      startedAt: Date.now(),
      error: null,
    };
  }

  private transition(newStatus: TridentStatus, trigger: string): void {
    const allowed = STATUS_TRANSITIONS[this.state.status];
    if (!allowed || !allowed.has(newStatus)) {
      const errorMsg = `Illegal transition: ${this.state.status} → ${newStatus} (trigger: ${trigger})`;
      this.state.error = errorMsg;
      throw new Error(`[OrchestratorMachine] ${errorMsg}`);
    }
    this.state.transitionHistory.push({
      from: `${this.state.mode}:${this.state.status}`,
      to: `${this.state.mode}:${newStatus}`,
      at: Date.now(),
      trigger,
    });
    this.state.status = newStatus;
    this.state.lastTransition = trigger;
    // Keep only last 50 transitions
    if (this.state.transitionHistory.length > 50) {
      this.state.transitionHistory = this.state.transitionHistory.slice(-50);
    }
  }

  startMode(mode: TridentMode): void {
    if (this.state.status !== 'IDLE' && this.state.status !== 'COMPLETE' && this.state.status !== 'ERROR') {
      throw new Error(`[OrchestratorMachine] Cannot start ${mode} from status ${this.state.status}. Reset first.`);
    }
    this.state.mode = mode;
    this.state.maxLayers = MODE_LAYER_MAP[mode];
    this.state.currentLayer = 0;
    this.state.iteration = 0;
    this.state.startedAt = Date.now();
    this.state.error = null;
    this.transition('RUNNING', `start:${mode}`);
  }

  advanceLayer(): void {
    if (this.state.status !== 'RUNNING' && this.state.status !== 'LAYER_COMPLETE') {
      throw new Error(`[OrchestratorMachine] Cannot advance layer from status ${this.state.status}`);
    }
    if (this.state.currentLayer >= this.state.maxLayers) {
      this.transition('COMPLETE', 'all-layers-complete');
      return;
    }
    this.state.currentLayer++;
    this.state.iteration++;
    this.transition('LAYER_COMPLETE', `layer-${this.state.currentLayer}`);
  }

  fail(errorMessage: string): void {
    this.state.error = errorMessage;
    this.transition('ERROR', `fail:${errorMessage.substring(0, 80)}`);
  }

  timeout(): void {
    this.transition('TIMEOUT', 'timeout');
  }

  reset(): void {
    this.state = this.defaultState();
  }

  getState(): Readonly<MachineState> {
    return { ...this.state, transitionHistory: [...this.state.transitionHistory] };
  }

  isRunning(): boolean {
    return this.state.status === 'RUNNING' || this.state.status === 'LAYER_COMPLETE';
  }

  isComplete(): boolean {
    return this.state.status === 'COMPLETE';
  }

  isError(): boolean {
    return this.state.status === 'ERROR';
  }

  getMode(): TridentMode {
    return this.state.mode;
  }

  getLayer(): number {
    return this.state.currentLayer;
  }

  getMaxLayers(): number {
    return this.state.maxLayers;
  }

  getStatus(): TridentStatus {
    return this.state.status;
  }

  getElapsedMs(): number {
    return Date.now() - this.state.startedAt;
  }
}

export const orchestratorMachine = new OrchestratorMachine();
```

## File 6b: `orchestrator.ts` — INTEGRATE state machine

### Add import at TOP of file:
```typescript
import { orchestratorMachine } from './fsm/orchestrator-machine.js';
```

### Replace `startAudit` method body:
```typescript
  startAudit(sessionId?: string): void {
    orchestratorMachine.startMode('CODE_REVIEW');
    var state = this.getStateFor(sessionId || 'default');
    state.mode = 'CODE_REVIEW';
    state.currentLayer = orchestratorMachine.getLayer();
    state.status = orchestratorMachine.getStatus();
    state.startedAt = Date.now();
    state.iterationCount = 0;
    saveStateToDisk(this.states);
  }
```

### Replace `startPlanning` method body:
```typescript
  startPlanning(sessionId?: string): void {
    orchestratorMachine.startMode('DEEP_PLANNING');
    var state = this.getStateFor(sessionId || 'default');
    state.mode = 'DEEP_PLANNING';
    state.currentLayer = orchestratorMachine.getLayer();
    state.status = orchestratorMachine.getStatus();
    state.startedAt = Date.now();
    state.iterationCount = 0;
    saveStateToDisk(this.states);
  }
```

### Replace `startProblemSolving` method body:
```typescript
  startProblemSolving(sessionId?: string): void {
    orchestratorMachine.startMode('PROBLEM_SOLVING');
    var state = this.getStateFor(sessionId || 'default');
    state.mode = 'PROBLEM_SOLVING';
    state.currentLayer = orchestratorMachine.getLayer();
    state.status = orchestratorMachine.getStatus();
    state.startedAt = Date.now();
    state.iterationCount = 0;
    saveStateToDisk(this.states);
  }
```

### Replace `startContextSynthesis` method body:
```typescript
  startContextSynthesis(sessionId?: string): void {
    orchestratorMachine.startMode('CONTEXT_SYNTHESIS');
    var state = this.getStateFor(sessionId || 'default');
    state.mode = 'CONTEXT_SYNTHESIS';
    state.currentLayer = orchestratorMachine.getLayer();
    state.status = orchestratorMachine.getStatus();
    state.startedAt = Date.now();
    state.iterationCount = 0;
    saveStateToDisk(this.states);
  }
```

### Replace `completeLayer` method body:
```typescript
  completeLayer(sessionId?: string): void {
    orchestratorMachine.advanceLayer();
    var state = this.getStateFor(sessionId || 'default');
    state.currentLayer = orchestratorMachine.getLayer();
    state.status = orchestratorMachine.getStatus();
    state.iterationCount = orchestratorMachine.getState().iteration;
    saveStateToDisk(this.states);
  }
```

### Replace `failLayer` method body:
```typescript
  failLayer(reason: string, sessionId?: string): void {
    orchestratorMachine.fail(reason);
    var state = this.getStateFor(sessionId || 'default');
    state.status = orchestratorMachine.getStatus();
    tridentLog('ERROR', 'orchestrator', 'Layer ' + (state.currentLayer + 1) + ' failed: ' + reason);
    saveStateToDisk(this.states);
  }
```

### Add `orchestratorMachine.reset()` in `resetSession`:
```typescript
  resetSession(sessionId?: string): void {
    orchestratorMachine.reset();
    var sid = sessionId || 'default';
    this.states.delete(sid);
    tridentLog('INFO', 'orchestrator', 'Session reset: ' + sid);
    saveStateToDisk(this.states);
  }
```

### Anti-Cheat: Verify Phase 6
```bash
wc -l fsm/orchestrator-machine.ts
# Expected: >= 100 lines

grep -n "orchestratorMachine" orchestrator.ts
# Expected: at least 8 references (startAudit, startPlanning, startProblemSolving, startContextSynthesis, completeLayer, failLayer, resetSession, import)

grep "class OrchestratorMachine" fsm/orchestrator-machine.ts
# Expected: 1 match

npx tsc --noEmit
# Expected: 0 errors
```

**If the state machine file has fewer than 100 lines, the phase is FAILED.** The previous file was 2 lines. Anything less than 100 means you stubbed it.

---

# PHASE 7: IDENTITY ENFORCER

## File 7a: CREATE `identity/identity-enforcer.ts`

**This file does not exist yet. Create it with minimum 100 lines:**

```typescript
/**
 * TRIDENT IDENTITY ENFORCER — Programmatic behavioral enforcement
 * 
 * Replaces theatrical .md loading with mechanical constraint checking.
 * Each rule is a pure function: (context) => RuleResult
 * Rules are NOT configurable. They are hard-coded enforcement.
 */

import { tridentLog } from '../utils.js';

export interface EnforcementRule {
  name: string;
  description: string;
  check: (context: EnforcementContext) => EnforcementResult;
  blocking: boolean; // true = block the action, false = warn only
}

export interface EnforcementContext {
  toolName: string;
  toolArgs: Record<string, unknown>;
  agentName: string;
  mode: string;
  currentGate: string;
  sessionId: string;
}

export interface EnforcementResult {
  passed: boolean;
  ruleName: string;
  message: string;
  evidence: string;
}

// RULE 1: No tool calls without mode context
// Prevents tools from being called when orchestrator is IDLE
const RULE_NO_TOOL_IN_IDLE: EnforcementRule = {
  name: 'no-tool-in-idle',
  description: 'Block mode tools when orchestrator is in IDLE state',
  blocking: true,
  check: (ctx: EnforcementContext): EnforcementResult => {
    const modeTools = new Set([
      'trident-code-audit', 'trident-deep-planning',
      'trident-problem-solving', 'trident-context-synthesis',
    ]);
    if (modeTools.has(ctx.toolName) && ctx.mode === 'IDLE') {
      return {
        passed: false,
        ruleName: RULE_NO_TOOL_IN_IDLE.name,
        message: `Cannot call ${ctx.toolName} while orchestrator is IDLE. Use trident-status first.`,
        evidence: `tool=${ctx.toolName}, mode=${ctx.mode}, gate=${ctx.currentGate}`,
      };
    }
    return { passed: true, ruleName: RULE_NO_TOOL_IN_IDLE.name, message: '', evidence: '' };
  },
};

// RULE 2: No trident-code-audit in CONTEXT_SYNTHESIS mode
// Mode tools are exclusive — you can't audit while synthesizing
const RULE_EXCLUSIVE_MODES: EnforcementRule = {
  name: 'exclusive-modes',
  description: 'Prevent mode tool calls in wrong mode',
  blocking: true,
  check: (ctx: EnforcementContext): EnforcementResult => {
    if (ctx.mode === 'CONTEXT_SYNTHESIS' && ctx.toolName === 'trident-code-audit') {
      return {
        passed: false,
        ruleName: RULE_EXCLUSIVE_MODES.name,
        message: 'Cannot run code audit while in CONTEXT_SYNTHESIS mode. Complete or reset first.',
        evidence: `tool=${ctx.toolName}, mode=${ctx.mode}`,
      };
    }
    return { passed: true, ruleName: RULE_EXCLUSIVE_MODES.name, message: '', evidence: '' };
  },
};

// RULE 3: Gate progression enforcement
// Blocks audit if gate hasn't advanced past PLAN
const RULE_GATE_PROGRESSION: EnforcementRule = {
  name: 'gate-progression',
  description: 'Ensure gate has advanced before certain tools',
  blocking: false, // warn only
  check: (ctx: EnforcementContext): EnforcementResult => {
    if (ctx.toolName === 'trident-code-audit' && ctx.currentGate === 'PLAN') {
      return {
        passed: false,
        ruleName: RULE_GATE_PROGRESSION.name,
        message: `Warning: Running code audit while gate is still ${ctx.currentGate}. Consider advancing gate first.`,
        evidence: `tool=${ctx.toolName}, gate=${ctx.currentGate}`,
      };
    }
    return { passed: true, ruleName: RULE_GATE_PROGRESSION.name, message: '', evidence: '' };
  },
};

// RULE 4: Session must be set before tool execution
const RULE_SESSION_REQUIRED: EnforcementRule = {
  name: 'session-required',
  description: 'Require session to be explicitly set before mode tools',
  blocking: false,
  check: (ctx: EnforcementContext): EnforcementResult => {
    if (!ctx.sessionId || ctx.sessionId === 'default') {
      return {
        passed: false,
        ruleName: RULE_SESSION_REQUIRED.name,
        message: 'Using default session — consider explicit session management via setSession()',
        evidence: `sessionId=${ctx.sessionId}`,
      };
    }
    return { passed: true, ruleName: RULE_SESSION_REQUIRED.name, message: '', evidence: '' };
  },
};

// All rules registry — every rule is registered and executed
export const ALL_ENFORCEMENT_RULES: EnforcementRule[] = [
  RULE_NO_TOOL_IN_IDLE,
  RULE_EXCLUSIVE_MODES,
  RULE_GATE_PROGRESSION,
  RULE_SESSION_REQUIRED,
];

export class IdentityEnforcer {
  private rules: EnforcementRule[];
  private auditLog: EnforcementResult[] = [];

  constructor(rules?: EnforcementRule[]) {
    this.rules = rules || ALL_ENFORCEMENT_RULES;
  }

  enforce(ctx: EnforcementContext): { allowed: boolean; results: EnforcementResult[] } {
    const results: EnforcementResult[] = [];
    let allowed = true;

    for (const rule of this.rules) {
      try {
        const result = rule.check(ctx);
        results.push(result);
        this.auditLog.push(result);
        if (!result.passed && rule.blocking) {
          allowed = false;
          tridentLog('WARN', 'identity-enforcer', `BLOCKED by ${rule.name}: ${result.message}`);
        } else if (!result.passed && !rule.blocking) {
          tridentLog('DEBUG', 'identity-enforcer', `WARN by ${rule.name}: ${result.message}`);
        }
      } catch (e: unknown) {
        const errorResult: EnforcementResult = {
          passed: false,
          ruleName: rule.name,
          message: `Rule check threw: ${e instanceof Error ? e.message : String(e)}`,
          evidence: 'exception',
        };
        results.push(errorResult);
        if (rule.blocking) allowed = false;
      }
    }

    // Keep only last 1000 audit entries
    if (this.auditLog.length > 1000) {
      this.auditLog = this.auditLog.slice(-1000);
    }

    return { allowed, results };
  }

  getAuditLog(): EnforcementResult[] {
    return [...this.auditLog];
  }

  getBlockedCount(): number {
    return this.auditLog.filter(r => !r.passed).length;
  }
}

export const identityEnforcer = new IdentityEnforcer();
```

## File 7b: CREATE `hooks/identity-enforcer-hook.ts`

```typescript
/**
 * Identity Enforcer Hook — Wires IdentityEnforcer into tool execution pipeline
 * Called as part of the hook chain before tool execution.
 * 
 * If an enforcement rule blocks the action, this hook throws an Error
 * that prevents the tool from executing.
 */

import { IdentityEnforcer, EnforcementContext, identityEnforcer } from '../identity/identity-enforcer.js';
import { orchestrator } from '../orchestrator.js';

export function checkIdentityEnforcement(
  toolName: string,
  commandStr: string,
  sessionAgent: string,
  currentGate: string,
  sessionId: string
): void {
  // Parse tool args from command string (simplified — extracts JSON after tool name)
  let toolArgs: Record<string, unknown> = {};
  try {
    const jsonMatch = commandStr.match(/\{.*\}/s);
    if (jsonMatch) {
      toolArgs = JSON.parse(jsonMatch[0]);
    }
  } catch {
    toolArgs = { raw: commandStr };
  }

  const ctx: EnforcementContext = {
    toolName,
    toolArgs,
    agentName: sessionAgent,
    mode: orchestrator.getState(sessionId).mode,
    currentGate,
    sessionId,
  };

  const { allowed, results } = identityEnforcer.enforce(ctx);

  if (!allowed) {
    const blockingResult = results.find(r => !r.passed);
    throw new Error(
      `[IDENTITY ENFORCER BLOCKED] ${blockingResult?.message || 'Enforcement rule blocked this action'}`
    );
  }
}
```

### Anti-Cheat: Verify Phase 7
```bash
wc -l identity/identity-enforcer.ts
# Expected: >= 100 lines

grep -c "class IdentityEnforcer" identity/identity-enforcer.ts
# Expected: 1

grep -c "EnforcementRule" identity/identity-enforcer.ts
# Expected: >= 4 (4 rules defined)

npx tsc --noEmit
# Expected: 0 errors
```

**If identity-enforcer.ts has fewer than 100 lines, the phase is FAILED. You must have at least 4 enforcement rules.**

---

## FINAL VERIFICATION — ALL 7 PHASES

After ALL 7 phases are complete, run these verification commands:

```bash
# 1. TypeScript compilation — must produce 0 errors
echo "=== TSC CHECK ==="
cd /mnt/trident-source && npx tsc --noEmit
echo "Exit code: $?"
# Expected: 0

# 2. Zero console.error() in the 4 target files
echo "=== CONSOLE ERROR CHECK ==="
grep -c "console.error" tools/trident-tools.ts orchestrator.ts audit-engine/preflight.ts identity/index.ts
# Expected: 0 for each file (four 0s)

# 3. R16 suppress no longer references buildPassed
echo "=== R16 EVIDENCE GATE CHECK ==="
grep -n "case 'R16':" audit-engine/evidence-gate.ts
# Expected: 2 occurrences — first returns false, second returns this.findings.length > 0

# 4. Self-audit uses exact match
echo "=== SELF-AUDIT CHECK ==="
grep -n "selfAuditNames" audit-engine/code-classifier.ts
# Expected: 1 match

# 5. Multi-language scanner exists
echo "=== MULTI-LANGUAGE SCANNER CHECK ==="
grep -n "collectProjectFiles\|SUPPORTED_EXTENSIONS" audit-engine/code-classifier.ts
# Expected: at least 1 match each

# 6. State machine exists with >= 100 lines
echo "=== STATE MACHINE CHECK ==="
wc -l fsm/orchestrator-machine.ts
# Expected: >= 100

# 7. Identity enforcer exists
echo "=== IDENTITY ENFORCER CHECK ==="
wc -l identity/identity-enforcer.ts
# Expected: >= 100

# 8. No SKIPPED escape hatch
echo "=== SKIPPED CHECK ==="
grep -n "SKIPPED" tools/trident-tools.ts
# Expected: 0 matches (SKIPPED must not appear as validation result)

echo "=== ALL CHECKS COMPLETE ==="
```

## EXECUTION ORDER SUMMARY

| Order | Phase | Action | Risk | Verification |
|-------|-------|--------|------|-------------|
| 1 | **Phase 0** | Add 3 fields to AnalysisContext | HIGH | npx tsc --noEmit = 0 |
| 2 | **Phase 1** | Replace 17 console.error with tridentLog | LOW | grep console.error = 0 |
| 3 | **Phase 2** | Fix R16 suppress + node: prefix | MEDIUM | grep buildPassed in R16 = 0 |
| 4 | **Phase 3** | Replace includes('trident') with exact set | LOW | grep includes.*trident = 0 |
| 5 | **Phase 4** | Replace collectTsFiles with collectProjectFiles | HIGH | grep collectTsFiles = 0 |
| 6 | **Phase 5** | Replace keyword regex with heading parsing | MEDIUM | grep msg.includes = 0 |
| 7 | **Phase 6** | Create state machine + integrate orchestrator | HIGH | wc -l >= 100 |
| 8 | **Phase 7** | Create identity enforcer + hook | MEDIUM | wc -l >= 100 |
| **9** | **FINAL** | Run ALL verification checks | — | ALL gates pass |
