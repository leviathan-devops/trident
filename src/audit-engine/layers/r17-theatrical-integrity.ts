import { LayerRule, CodeConstruct, AnalysisContext, AuditFinding, ConstructType } from '../types.ts';

/**
 * R17 — Theatrical Integrity Layer
 *
 * 10 detectors that detect content integrity patterns — code that looks real
 * but does nothing, tests that don't test, config that doesn't configure.
 */

// ─── D1: Whitespace Padding ────────────────────────────────────────────────────
/**
 * Detects string literals > 500 chars where trailing whitespace exceeds 15%
 * of total length — indicates padding to inflate apparent code volume.
 */
function detectWhitespacePadding(ctx: AnalysisContext): AuditFinding[] {
  const findings: AuditFinding[] = [];
  const seen = new Set<string>();

  for (const c of ctx.constructs) {
    if (c.type !== ConstructType.STRING_LITERAL) continue;
    const val = c.name;
    if (val.length <= 500) continue;

    const trailingWhitespace = val.length - val.trimEnd().length;
    if (trailingWhitespace / val.length > 0.15) {
      const dedupKey = `${c.filePath}:${c.line}`;
      if (seen.has(dedupKey)) continue;
      seen.add(dedupKey);

      findings.push({
        layer: 'R17',
        severity: 'CRITICAL',
        category: 'WHITESPACE_PADDING',
        file: c.filePath,
        line: c.line,
        evidence: val.substring(0, 80),
        description: `String literal (${val.length} chars) has ${trailingWhitespace} trailing whitespace chars (${(trailingWhitespace / val.length * 100).toFixed(1)}%) — likely padding to inflate code volume`,
        correction: 'Remove trailing whitespace from string literal. If padding is semantically meaningful, document why.',
        runtimeImpact: 'Code volume is artificially inflated — metric-based quality assessments are deceived',
        confidence: 0.95,
        constructType: c.type,
        callGraphRef: null,
        evidenceSuppressed: false,
      });
    }
  }

  return findings;
}

// ─── D2: Template Repetition ────────────────────────────────────────────────────
/**
 * Detects arrays of strings where elements share >70% word-overlap similarity
 * (identical structure with swapped keywords) — cookie-cutter templates.
 */
function wordOverlapSimilarity(a: string, b: string): number {
  const wordsA = new Set(a.toLowerCase().split(/\W+/).filter(Boolean));
  const wordsB = new Set(b.toLowerCase().split(/\W+/).filter(Boolean));
  if (wordsA.size === 0 && wordsB.size === 0) return 1;
  let intersection = 0;
  for (const w of wordsA) {
    if (wordsB.has(w)) intersection++;
  }
  const union = new Set([...wordsA, ...wordsB]);
  return intersection / union.size;
}

function detectTemplateRepetition(ctx: AnalysisContext): AuditFinding[] {
  const findings: AuditFinding[] = [];
  const seen = new Set<string>();

  for (const c of ctx.constructs) {
    if (c.type !== ConstructType.ARRAY_LITERAL) continue;
    const stringElements = c.children.filter(
      (child: CodeConstruct) => child.type === ConstructType.STRING_LITERAL
    );
    if (stringElements.length < 3) continue;

    for (let i = 0; i < stringElements.length; i++) {
      for (let j = i + 1; j < stringElements.length; j++) {
        const similarity = wordOverlapSimilarity(
          stringElements[i].name,
          stringElements[j].name
        );
        if (similarity > 0.70) {
          const dedupKey = `${c.filePath}:${c.line}`;
          if (seen.has(dedupKey)) continue;
          seen.add(dedupKey);

          findings.push({
            layer: 'R17',
            severity: 'CRITICAL',
            category: 'COOKIE_CUTTER_TEMPLATE',
            file: c.filePath,
            line: c.line,
            evidence: `Array with ${stringElements.length} strings, pair similarity ${(similarity * 100).toFixed(0)}%`,
            description: `Array literal contains ${stringElements.length} string elements with >70% word-overlap similarity — structures are nearly identical with swapped keywords`,
            correction: 'Consolidate into a single template with parameter substitution, or deduplicate entries',
            runtimeImpact: 'Code bloat — identical structures duplicated with minor keyword changes, maintenance cost multiplies',
            confidence: 0.90,
            constructType: c.type,
            callGraphRef: null,
            evidenceSuppressed: false,
          });
          break;
        }
      }
      if (seen.has(`${c.filePath}:${c.line}`)) break;
    }
  }

  return findings;
}

// ─── D3: Stub Return ────────────────────────────────────────────────────────────
/**
 * Detects functions that return hardcoded success objects without doing real work.
 */
function detectStubReturn(ctx: AnalysisContext): AuditFinding[] {
  const findings: AuditFinding[] = [];
  const seen = new Set<string>();

  const fnTypes = [
    ConstructType.FUNCTION_DECLARATION,
    ConstructType.ARROW_FUNCTION,
    ConstructType.METHOD_DECLARATION,
  ];

  const stubPatterns = [
    /return\s*\{\s*success\s*:\s*true\s*[^}]*\}/,
    /return\s*\{\s*blocked\s*:\s*false\s*[^}]*\}/,
    /Promise\.resolve\s*\(\s*\{/,
    /return\s*\{\s*ok\s*:\s*true\s*[^}]*\}/,
    /return\s*\{\s*status\s*:\s*['"]ok['"']/,
  ];

  for (const c of ctx.constructs) {
    if (!fnTypes.includes(c.type)) continue;
    const body = c.body;
    if (!body) continue;

    for (const pattern of stubPatterns) {
      if (!pattern.test(body)) continue;

      // Check if the function body has minimal statements besides the return
      const statementCount = countStatements(body);
      if (statementCount > 3) continue; // has other work, likely not a stub

      const dedupKey = `${c.filePath}:${c.line}:STUB_RETURN`;
      if (seen.has(dedupKey)) continue;
      seen.add(dedupKey);

      findings.push({
        layer: 'R17',
        severity: 'CRITICAL',
        category: 'STUB_RETURN',
        file: c.filePath,
        line: c.line,
        evidence: body.substring(0, 100),
        description: `Function '${c.name}' returns hardcoded success object with only ${statementCount} statement(s) — stub that claims success without doing work`,
        correction: 'Implement actual logic before returning, or remove the stub function if unused',
        runtimeImpact: 'Callers believe work was done successfully when nothing actually happened — silent data loss',
        confidence: 0.85,
        constructType: c.type,
        callGraphRef: null,
        evidenceSuppressed: false,
      });
      break;
    }
  }

  return findings;
}

function countStatements(body: string): number {
  // Rough heuristic: count semicolons and block-level keywords
  const stmtMatches = body.match(/[;{}]/g);
  return stmtMatches ? stmtMatches.length : 0;
}

// ─── D4: Silent Catch ───────────────────────────────────────────────────────────
/**
 * Detects catch blocks with empty bodies or only comment statements.
 */
function detectSilentCatch(ctx: AnalysisContext): AuditFinding[] {
  const findings: AuditFinding[] = [];
  const seen = new Set<string>();

  const catchConstructs = ctx.constructs.filter(
    (c: CodeConstruct) => c.type === ConstructType.CATCH_CLAUSE
  );

  for (const c of catchConstructs) {
    const body = c.body;
    if (!body) continue;

    // Extract the catch block body content between { and }
    const catchBodyMatch = body.match(/\{[^}]*\}$/);
    if (!catchBodyMatch) continue;

    const catchInner = catchBodyMatch[0];
    // Check if empty or only comments
    const stripped = catchInner.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '').trim();
    if (stripped === '{}' || stripped === '{' || stripped === '}' || stripped.length < 3) {
      const dedupKey = `${c.filePath}:${c.line}`;
      if (seen.has(dedupKey)) continue;
      seen.add(dedupKey);

      findings.push({
        layer: 'R17',
        severity: 'CRITICAL',
        category: 'SILENT_CATCH',
        file: c.filePath,
        line: c.line,
        evidence: body.substring(0, 80),
        description: 'Catch clause with empty or comment-only body — error silently swallowed',
        correction: 'Add error logging, recovery, or re-throw logic in the catch block',
        runtimeImpact: 'Errors are completely invisible — debugging impossible, failures silently ignored',
        confidence: 0.95,
        constructType: c.type,
        callGraphRef: null,
        evidenceSuppressed: false,
      });
    }
  }

  return findings;
}

// ─── D5: Phantom Test ───────────────────────────────────────────────────────────
/**
 * Detects test files where test functions call no assertions.
 */
function detectPhantomTest(ctx: AnalysisContext): AuditFinding[] {
  const findings: AuditFinding[] = [];
  const seen = new Set<string>();

  // Identify test files
  const testFilePaths = new Set<string>();
  for (const [filePath, constructs] of ctx.constructsByFile) {
    if (/\.(test|spec)\.(ts|js|tsx|jsx)$/i.test(filePath)) {
      testFilePaths.add(filePath);
    }
  }

  const fnTypes = [
    ConstructType.FUNCTION_DECLARATION,
    ConstructType.ARROW_FUNCTION,
    ConstructType.METHOD_DECLARATION,
  ];

  for (const [filePath, constructs] of ctx.constructsByFile) {
    if (!testFilePaths.has(filePath)) continue;

    for (const c of constructs) {
      if (!fnTypes.includes(c.type)) continue;
      const name = c.name.toLowerCase();
      const isTestFn = name.startsWith('test') || name.startsWith('it') || name.startsWith('describe');

      if (!isTestFn) continue;
      const body = c.body;
      if (!body) continue;

      // Count assertion calls
      const assertionCount = countAssertions(body);
      if (assertionCount === 0) {
        const dedupKey = `${c.filePath}:${c.line}`;
        if (seen.has(dedupKey)) continue;
        seen.add(dedupKey);

        findings.push({
          layer: 'R17',
          severity: 'CRITICAL',
          category: 'PHANTOM_TEST',
          file: c.filePath,
          line: c.line,
          evidence: body.substring(0, 100),
          description: `Test function '${c.name}' in test file contains 0 assertions — test passes without verifying anything`,
          correction: 'Add at least one assertion (expect/assert/should) to verify the test subject behavior',
          runtimeImpact: 'CI pipeline reports green but no actual verification occurs — regressions pass undetected',
          confidence: 0.85,
          constructType: c.type,
          callGraphRef: null,
          evidenceSuppressed: false,
        });
      }
    }
  }

  return findings;
}

function countAssertions(body: string): number {
  const assertionPatterns = [
    /\bexpect\s*\(/g,
    /\bassert\s*\./g,
    /\bassert\s*\(/g,
    /\bshould\b/g,
    /\btoStrictEqual\b/g,
    /\btoEqual\b/g,
    /\btoBe\b/g,
    /\btoContain\b/g,
    /\btoHaveLength\b/g,
    /\btoThrow\b/g,
    /\btoMatch\b/g,
    /\bassertion\b/g,
  ];

  let count = 0;
  for (const pattern of assertionPatterns) {
    const matches = body.match(pattern);
    if (matches) count += matches.length;
  }
  return count;
}

// ─── D6: Fire and Forget ────────────────────────────────────────────────────────
/**
 * Detects async functions that never await and have no try/catch.
 */
function detectFireAndForget(ctx: AnalysisContext): AuditFinding[] {
  const findings: AuditFinding[] = [];
  const seen = new Set<string>();

  const fnTypes = [
    ConstructType.FUNCTION_DECLARATION,
    ConstructType.ARROW_FUNCTION,
    ConstructType.METHOD_DECLARATION,
  ];

  for (const c of ctx.constructs) {
    if (!fnTypes.includes(c.type)) continue;
    if (!c.isAsync) continue;

    const body = c.body;
    if (!body) continue;

    const awaitCount = (body.match(/\bawait\b/g) || []).length;
    if (awaitCount > 0) continue;

    // Check if function creates promises (new Promise, Promise.resolve, async call)
    const createsPromise =
      /new\s+Promise\b/.test(body) ||
      /Promise\.(resolve|reject|all|race|any)\b/.test(body) ||
      /\.then\s*\(/.test(body) ||
      /\.catch\s*\(/.test(body);

    if (!createsPromise) continue;

    const hasTryCatch = /\btry\b/.test(body) && /\bcatch\b/.test(body);
    if (hasTryCatch) continue;

    const dedupKey = `${c.filePath}:${c.line}`;
    if (seen.has(dedupKey)) continue;
    seen.add(dedupKey);

    findings.push({
      layer: 'R17',
      severity: 'HIGH',
      category: 'FIRE_AND_FORGET',
      file: c.filePath,
      line: c.line,
      evidence: body.substring(0, 100),
      description: `Async function '${c.name}' is declared async but never uses await and creates promises without try/catch — promise rejections are unhandled`,
      correction: 'Add await before promise-creating calls, or add .catch() handler, or wrap in try/catch',
      runtimeImpact: 'Unhandled promise rejections — Node.js may crash on rejection, or errors silently disappear',
      confidence: 0.75,
      constructType: c.type,
      callGraphRef: null,
      evidenceSuppressed: false,
    });
  }

  return findings;
}

// ─── D7: Placeholder Code ───────────────────────────────────────────────────────
/**
 * Detects functions with TODO/FIXME/HACK comments exceeding thresholds.
 * Note: The regex below intentionally contains TODO/FIXME/HACK keywords — these are
 * detection patterns, not placeholder markers in this code. This function is complete.
 */
function detectPlaceholderCode(ctx: AnalysisContext): AuditFinding[] {
  const findings: AuditFinding[] = [];
  const seen = new Set<string>();

  const fnTypes = [
    ConstructType.FUNCTION_DECLARATION,
    ConstructType.ARROW_FUNCTION,
    ConstructType.METHOD_DECLARATION,
  ];

  for (const c of ctx.constructs) {
    if (!fnTypes.includes(c.type)) continue;
    const body = c.body;
    if (!body) continue;

    // Detection pattern — intentionally scans for these markers in target code
    const todoMatches = body.match(/\b(TODO|FIXME|HACK|XXX|WORKAROUND|HARDCODED)\b/g);
    if (!todoMatches) continue;

    const statementCount = countStatements(body);
    const todoRatio = todoMatches.length / Math.max(statementCount, 1);

    let severity: 'CRITICAL' | 'HIGH' = 'HIGH';
    if (todoRatio > 0.2) severity = 'CRITICAL';
    else if (todoRatio <= 0.1) continue;

    const dedupKey = `${c.filePath}:${c.line}`;
    if (seen.has(dedupKey)) continue;
    seen.add(dedupKey);

    findings.push({
      layer: 'R17',
      severity,
      category: 'PLACEHOLDER_CODE',
      file: c.filePath,
      line: c.line,
      evidence: `${todoMatches.length} placeholder markers in function '${c.name}' (${(todoRatio * 100).toFixed(0)}% of statements)`,
      description: `Function '${c.name}' has ${todoMatches.length} TODO/FIXME/HACK markers (${(todoRatio * 100).toFixed(0)}% of ${statementCount} statements) — code is incomplete`,
      correction: 'Implement the stubbed functionality and remove placeholder comments, or create tracked tickets for each',
      runtimeImpact: 'Incomplete code paths execute silently — edge cases produce undefined behavior',
      confidence: 0.80,
      constructType: c.type,
      callGraphRef: null,
      evidenceSuppressed: false,
    });
  }

  return findings;
}

// ─── D8: Documentation Drift ────────────────────────────────────────────────────
/**
 * Detects JSDoc comments that claim return types that don't match actual return.
 */
function detectDocumentationDrift(ctx: AnalysisContext): AuditFinding[] {
  const findings: AuditFinding[] = [];
  const seen = new Set<string>();

  const fnTypes = [
    ConstructType.FUNCTION_DECLARATION,
    ConstructType.METHOD_DECLARATION,
  ];

  const returnTypeMap: Record<string, string[]> = {
    boolean: ['boolean', 'Boolean'],
    string: ['string', 'String'],
    number: ['number', 'Number'],
    Promise: ['Promise', 'Promise<void>', 'Promise<'],
    void: ['void'],
    object: ['object', 'Object', 'Record', 'Map', 'Array', '[]'],
  };

  function normalizeType(t: string): string {
    const lower = t.toLowerCase().replace(/<.*>/, '').replace(/\[\]$/, '');
    if (lower.startsWith('promise')) return 'Promise';
    if (lower === 'boolean' || lower === 'bool') return 'boolean';
    if (lower === 'string') return 'string';
    if (lower === 'number' || lower === 'num') return 'number';
    if (lower === 'void' || lower === 'undefined') return 'void';
    if (lower === 'object' || lower === 'array' || lower === 'map' || lower === 'record' || lower === 'any') return 'object';
    return lower;
  }

  for (const c of ctx.constructs) {
    if (!fnTypes.includes(c.type)) continue;

    const body = c.body;
    if (!body) continue;

    // Extract JSDoc @returns tag
    const jsdocMatch = body.match(/\/\*\*[\s\S]*?\*\//);
    if (!jsdocMatch) continue;

    const jsdoc = jsdocMatch[0];
    const returnsMatch = jsdoc.match(/@returns?\s+\{([^}]+)\}/);
    if (!returnsMatch) continue;

    const jsdocReturnType = returnsMatch[1].trim();

    // Get actual return type from function signature or body analysis
    const signatureReturnMatch = body.match(/:\s*([A-Za-z_<>\[\]\s,|&]+)\s*(?=\{)/);
    const actualReturn = signatureReturnMatch ? signatureReturnMatch[1].trim() : inferReturnTypeFromBody(body);

    if (!actualReturn) continue;

    const normalizedJsdoc = normalizeType(jsdocReturnType);
    const normalizedActual = normalizeType(actualReturn);

    if (normalizedJsdoc !== normalizedActual) {
      const dedupKey = `${c.filePath}:${c.line}`;
      if (seen.has(dedupKey)) continue;
      seen.add(dedupKey);

      findings.push({
        layer: 'R17',
        severity: 'HIGH',
        category: 'DOCUMENTATION_DRIFT',
        file: c.filePath,
        line: c.line,
        evidence: `@returns {${jsdocReturnType}} but function returns ${actualReturn}`,
        description: `JSDoc declares @returns {${jsdocReturnType}} but the actual return type appears to be '${actualReturn}' — documentation does not match implementation`,
        correction: `Update JSDoc to @returns {${actualReturn}} or fix the function to return ${jsdocReturnType}`,
        runtimeImpact: 'API consumers rely on documented types — incorrect docs lead to type errors at integration points',
        confidence: 0.70,
        constructType: c.type,
        callGraphRef: null,
        evidenceSuppressed: false,
      });
    }
  }

  return findings;
}

function inferReturnTypeFromBody(body: string): string | null {
  const returnStmts = body.match(/return\s+(.*?);/g);
  if (!returnStmts || returnStmts.length === 0) return 'void';

  for (const stmt of returnStmts) {
    if (/\{\s*[^}]*\}\s*$/.test(stmt)) return 'object';
    if (/\btrue\b|\bfalse\b/.test(stmt)) return 'boolean';
    if (/['"]/.test(stmt)) return 'string';
    if (/\b\d+\b/.test(stmt)) return 'number';
    if (/\bnull\b|\bundefined\b/.test(stmt)) continue;
    if (/Promise\s*\./.test(stmt) || /new\s+Promise/.test(stmt)) return 'Promise';
    if (/\bawait\b/.test(stmt) || /\.then\s*\(/.test(stmt)) return 'Promise';
    return 'object'; // complex expression
  }

  return 'void';
}

// ─── D9: Config Theater ─────────────────────────────────────────────────────────
/**
 * Detects config keys that are defined but never referenced in source code.
 */
function detectConfigTheater(ctx: AnalysisContext): AuditFinding[] {
  const findings: AuditFinding[] = [];
  const seen = new Set<string>();

  // Collect all config keys from object literals likely to be config
  const configKeys: Map<string, { file: string; line: number; key: string }[]> = new Map();

  for (const c of ctx.constructs) {
    if (c.type !== ConstructType.OBJECT_LITERAL) continue;
    const parent = c.parent;
    if (!parent) continue;

    // Check if this object literal looks like a config definition
    const isConfig =
      (parent.name || '').toLowerCase().includes('config') ||
      (parent.name || '').toLowerCase().includes('setting') ||
      (parent.name || '').toLowerCase().includes('option') ||
      (parent.name || '').toLowerCase().includes('default') ||
      (parent.name || '').toLowerCase().includes('param');

    if (!isConfig) continue;

    for (const prop of c.children) {
      if (prop.type !== ConstructType.PROPERTY_ASSIGNMENT) continue;
      const keyName = prop.name;
      if (!keyName) continue;

      if (!configKeys.has(keyName)) {
        configKeys.set(keyName, []);
      }
      configKeys.get(keyName)!.push({ file: c.filePath, line: c.line, key: keyName });
    }
  }

  // Check if each key appears outside config definitions in the codebase
  for (const [keyName, locations] of configKeys) {
    let foundInSource = false;
    for (const [filePath, constructs] of ctx.constructsByFile) {
      for (const c of constructs) {
        // Check if the key name appears as a property access or usage
        const body = c.body;
        if (!body) continue;

        // Pattern: config.keyName or settings.keyName or options.keyName
        const usagePattern = new RegExp(`(?:config|settings|options|params|env)\\.${escapeRegex(keyName)}\\b`);
        if (usagePattern.test(body)) {
          foundInSource = true;
          break;
        }
      }
      if (foundInSource) break;
    }

    if (!foundInSource) {
      // Show first definition location
      const firstLoc = locations[0];
      const dedupKey = `${keyName}:CONFIG_THEATER`;
      if (seen.has(dedupKey)) continue;
      seen.add(dedupKey);

      findings.push({
        layer: 'R17',
        severity: 'MEDIUM',
        category: 'CONFIG_THEATER',
        file: firstLoc.file,
        line: firstLoc.line,
        evidence: `Config key '${keyName}' defined but never referenced`,
        description: `Configuration key '${keyName}' is defined in a config object but never accessed via config.${keyName} or similar patterns in any source file`,
        correction: `Remove unused config key '${keyName}' or add the code that consumes it`,
        runtimeImpact: 'Dead configuration — maintainers may change this value thinking it affects behavior when it does nothing',
        confidence: 0.75,
        constructType: ConstructType.PROPERTY_ASSIGNMENT,
        callGraphRef: null,
        evidenceSuppressed: false,
      });
    }
  }

  return findings;
}

// ─── D10: Pipeline Theater ──────────────────────────────────────────────────────
/**
 * Detects CI commands that intentionally no-op (exit 0, true, echo without test).
 */
function detectPipelineTheater(ctx: AnalysisContext): AuditFinding[] {
  const findings: AuditFinding[] = [];
  const seen = new Set<string>();

  const theaterPatterns = [
    /\bexit\s+0\b/,
    /\|\|\s*true\b/,
    /echo\s+['"][^'"]*['"]\s*(?:$|;)/,
    /:\s*#\s*no-op/,
    /:\s*;\s*#/,
  ];

  for (const c of ctx.constructs) {
    if (c.type !== ConstructType.STRING_LITERAL) continue;

    const val = c.name;
    if (!val) continue;

    // Only flag strings that look like CI/command values
    const looksLikeCommand =
      val.includes('exit') ||
      val.includes('echo') ||
      val.includes('true') ||
      val.includes('false') ||
      val.includes('&&') ||
      val.includes('||') ||
      val.includes(';');

    if (!looksLikeCommand) continue;

    for (const pattern of theaterPatterns) {
      if (!pattern.test(val)) continue;

      // Skip if it contains actual test commands
      if (/\b(test|npm test|jest|mocha|vitest|ava|tap|nyc|coverage)\b/.test(val) &&
          !/exit\s+0/.test(val.replace(/\b(test|npm test|jest|mocha|vitest|ava|tap|nyc|coverage)\b.*/, ''))) {
        continue;
      }

      const dedupKey = `${c.filePath}:${c.line}`;
      if (seen.has(dedupKey)) continue;
      seen.add(dedupKey);

      findings.push({
        layer: 'R17',
        severity: 'HIGH',
        category: 'PIPELINE_THEATER',
        file: c.filePath,
        line: c.line,
        evidence: val.substring(0, 100),
        description: `String contains no-op pattern '${val.substring(0, 60)}' — CI command that does nothing useful`,
        correction: 'Replace with an actual test command or meaningful CI step. If intentionally empty, use a comment explaining why.',
        runtimeImpact: 'CI pipeline appears to have steps but they are no-ops — deployment proceeds without real validation',
        confidence: 0.80,
        constructType: c.type,
        callGraphRef: null,
        evidenceSuppressed: false,
      });
      break;
    }
  }

  return findings;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ─── Layer Export ───────────────────────────────────────────────────────────────

export const R17_THEATRICAL_INTEGRITY: LayerRule = {
  layer: 'R17',
  name: 'Theatrical Integrity (D1-D10)',
  description: 'Detects content integrity patterns — whitespace padding, cookie-cutter templates, stub returns, silent catches, phantom tests, fire-and-forget async, placeholder code, documentation drift, config theater, pipeline theater',
  applicableTo: [],
  enabled: true,

  evaluate(_construct: CodeConstruct | null, ctx: AnalysisContext): AuditFinding[] {
    const findings: AuditFinding[] = [];

    findings.push(...detectWhitespacePadding(ctx));
    findings.push(...detectTemplateRepetition(ctx));
    findings.push(...detectStubReturn(ctx));
    findings.push(...detectSilentCatch(ctx));
    findings.push(...detectPhantomTest(ctx));
    findings.push(...detectFireAndForget(ctx));
    findings.push(...detectPlaceholderCode(ctx));
    findings.push(...detectDocumentationDrift(ctx));
    findings.push(...detectConfigTheater(ctx));
    findings.push(...detectPipelineTheater(ctx));

    return findings;
  },
};
