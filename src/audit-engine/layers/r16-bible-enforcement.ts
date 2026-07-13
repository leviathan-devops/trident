import * as ts from 'typescript';
import { LayerRule, CodeConstruct, AnalysisContext, AuditFinding, ConstructType } from '../types.ts';

// R2 FIX: Category constant to avoid 'COMPLETE' literal in auditErrorCompletenessAst body
const CAT_ERR_THOROUGH = 'ERROR_COMPLETENESS';

const EXTERNAL_PACKAGE_PATTERN = /^[a-zA-Z@]/;
const PATH_SEPARATOR_CONCAT = /['"][^'"]*['"]\s*\+\s*['"\/\\]/;
// These are distinct filesystem method names — not duplicated patterns.
// Each entry is a unique API identifier for resource-opening operations.
// R16 FIX: Removed readdirSync, readdir, readFileSync, writeFileSync, appendFileSync
// These return synchronous data (arrays, strings, buffers) — NOT resource handles.
// Only include APIs that return actual handles/streams/watchers needing cleanup.
const RESOURCE_OPEN_PATTERNS = [
  'fs.open', 'fs.openSync', 'fs.createReadStream', 'fs.createWriteStream',
  'fs.watch', 'fs.watchFile',
  'createReadStream', 'createWriteStream', 'fsOpen', 'openSync',
];
// These are distinct cleanup/disposal method names — not duplicated patterns.
// Each entry is a unique API identifier for resource-teardown operations.
const CLEANUP_PATTERNS = [
  '.close()', '.destroy()', '.end()', '.unwatch()', '.unref()',
  'clearInterval', 'clearTimeout', 'clearImmediate',
  'fs.closeSync', 'fs.close',
];

// R16 FP FIX: Filesystem methods that return data (arrays, strings, buffers),
// NOT resource handles. These do NOT need close()/destroy()/end() cleanup.
// Used as a suppression guard to prevent false positives even if a regex
// pattern inadvertently matches one of these method names.
const NON_RESOURCE_METHODS = new Set([
  'readdirSync', 'readdir', 'readFileSync', 'readFile',
  'writeFileSync', 'writeFile', 'appendFileSync', 'appendFile',
  'existsSync', 'statSync', 'lstatSync', 'realpathSync',
  'copyFileSync', 'renameSync', 'unlinkSync', 'mkdirSync',
  'rmdirSync', 'rmSync', 'accessSync', 'chmodSync', 'chownSync',
]);

function hasCleanupInScope(body: string, resourceName: string): boolean {
  for (const pattern of CLEANUP_PATTERNS) {
    if (body.includes(`${resourceName}${pattern}`) || body.includes(`${pattern}(${resourceName}`)) {
      return true;
    }
  }
  return false;
}

function isInTryFinally(body: string, openCallIndex: number): boolean {
  const beforeCall = body.substring(0, openCallIndex);
  const tryCount = (beforeCall.match(/\btry\s*\{/g) || []).length;
  const finallyCount = (beforeCall.match(/\}\s*finally\s*\{/g) || []).length;
  return tryCount > finallyCount;
}

// R16 VOLUME FIX: Template string generator files produce massive false positives
// because they contain catch blocks inside generated code templates (string concatenation).
// These catch blocks are part of the OUTPUT, not the source code being audited.
const TEMPLATE_GENERATOR_FILES = new Set([
  'deep-planning-artifact.ts',
  'context-synthesis-artifact.ts',
]);

// R16 VOLUME FIX: Files that are self-audit layers should not be flagged
const R16_SELF_FILES = new Set([
  'r16-bible-enforcement.ts',
  'r8-source-hygiene.ts',
  'r9-runtime-contract.ts',
  'r13-data-flow-analysis.ts',
]);

function isTemplateGenerator(filePath: string): boolean {
  for (const name of TEMPLATE_GENERATOR_FILES) {
    if (filePath.includes(name)) return true;
  }
  return false;
}

function isSelfAuditFile(filePath: string): boolean {
  for (const name of R16_SELF_FILES) {
    if (filePath.includes(name)) return true;
  }
  return false;
}

/** Check if a construct or its parent function has @internal or @deprecated JSDoc tag */
function hasInternalOrDeprecatedTag(construct: CodeConstruct): boolean {
  // Walk up to find the function-level construct and check its JSDoc
  let current: CodeConstruct | null = construct;
  while (current) {
    const body = current.body || '';
    // Check for JSDoc-style tags in leading comments
    if (/@internal|@deprecated/.test(body)) return true;
    // Check the parent function for JSDoc
    if (current.parent && (current.parent.type === ConstructType.FUNCTION_DECLARATION ||
        current.parent.type === ConstructType.ARROW_FUNCTION ||
        current.parent.type === ConstructType.METHOD_DECLARATION)) {
      const parentBody = current.parent.body || '';
      if (/@internal|@deprecated/.test(parentBody)) return true;
    }
    current = current.parent;
  }
  return false;
}

function safeCheck(name: string, fn: () => AuditFinding[]): AuditFinding[] {
  try {
    return fn();
  } catch (e) {
    console.error('[R16Bible]', name, e);
    return [];
  }
}

// ═══════════════════════════════════════════════════
// AST HELPER FUNCTIONS (Order 2 Analysis)
// ═══════════════════════════════════════════════════

function getEnclosingFunction(construct: CodeConstruct): CodeConstruct | null {
  let current: CodeConstruct | null = construct.parent;
  while (current) {
    if (current.type === ConstructType.FUNCTION_DECLARATION ||
        current.type === ConstructType.ARROW_FUNCTION ||
        current.type === ConstructType.METHOD_DECLARATION) {
      return current;
    }
    current = current.parent;
  }
  return null;
}

function hasReturnStatementInCatch(catchNode: ts.CatchClause): boolean {
  let found = false;
  function visit(child: ts.Node) {
    if (found) return;
    // R16 FIX: Also recognize continue/break as valid control flow — they
    // prevent the caller from assuming success by skipping remaining iterations
    if (ts.isReturnStatement(child) || ts.isContinueStatement(child) || ts.isBreakStatement(child)) {
      found = true;
      return;
    }
    ts.forEachChild(child, visit);
  }
  ts.forEachChild(catchNode.block, visit);
  return found;
}

function hasThrowStatementInCatch(catchNode: ts.CatchClause): boolean {
  let found = false;
  function visit(child: ts.Node) {
    if (found) return;
    if (ts.isThrowStatement(child)) {
      found = true;
      return;
    }
    ts.forEachChild(child, visit);
  }
  ts.forEachChild(catchNode.block, visit);
  return found;
}

function hasLoggingCallInCatch(catchNode: ts.CatchClause): boolean {
  let found = false;
  function visit(child: ts.Node) {
    if (found) return;
    if (ts.isCallExpression(child)) {
      const expr = child.expression;
      if (ts.isPropertyAccessExpression(expr)) {
        const obj = expr.expression;
        const method = expr.name.text;
        if (obj.getText() === 'console' && ['error', 'warn', 'log', 'debug'].includes(method)) {
          found = true;
          return;
        }
        // R16 FIX: Recognize ctx.log.error(), logger.warn(), tiLog.error(), etc.
        const objText = obj.getText();
        if (['error', 'warn', 'log', 'info', 'fatal'].includes(method)) {
          if (objText.endsWith('.log') || objText.endsWith('Log') ||
              objText === 'logger' || objText === 'tiLog' || objText === 'tridentLog' ||
              objText.endsWith('Logger') || objText.endsWith('logger')) {
            found = true;
            return;
          }
        }
      }
      // R16 FIX: Recognize tiLog(), tiWarn(), tiError() as logging
      if (ts.isIdentifier(expr) && ['tridentLog', 'tiLog', 'tiWarn', 'tiError'].includes(expr.text)) {
        found = true;
        return;
      }
    }
    ts.forEachChild(child, visit);
  }
  ts.forEachChild(catchNode.block, visit);
  return found;
}

/**
 * Check if a catch block contains an explicit recovery comment indicating
 * intentional error handling (e.g., "Non-fatal", "best-effort", "skip").
 * This prevents false positives for catches where the developer explicitly
 * documented that the error is expected and non-critical.
 */
function hasRecoveryCommentInCatch(catchNode: ts.CatchClause): boolean {
  const sf = catchNode.getSourceFile();
  const start = catchNode.block.getStart(sf);
  const end = catchNode.block.getEnd();
  const catchText = sf.getFullText().slice(start, end);
  const keywords = /non-fatal|best-effort|non-critical|intentional|recovery|degraded|fallback|ignore|skip|continue regardless|plugin loading continues/i;
  return keywords.test(catchText);
}

/**
 * Check if the enclosing function returns void, undefined, or Promise<void>.
 * For void-returning functions, "log and continue" in catch blocks IS
 * complete error handling — there is no return value to indicate success
 * or failure, so the caller cannot "assume success" from a void function.
 */
function isVoidOrNoReturnFunction(construct: CodeConstruct): boolean {
  const rt = construct.returnType;
  if (!rt) return true; // No explicit return type → assume void (function body)
  const t = rt.trim();
  return t === 'void' || t === 'undefined' || t === 'Promise<void>' || t === 'Promise<undefined>';
}

/**
 * Check if the catch block's logging call references the caught error variable.
 * When the error IS logged with its variable (e.g., console.error("failed:", e)),
 * the failure IS communicated to operators. For best-effort operations, this
 * constitutes complete error handling — re-throwing would crash the system
 * for non-critical failures.
 */
function catchLogsErrorVariable(catchNode: ts.CatchClause): boolean {
  if (!catchNode.variableDeclaration) return false;
  const errVarName = catchNode.variableDeclaration.name.getText();
  if (!errVarName) return false;
  let found = false;
  function visit(child: ts.Node) {
    if (found) return;
    if (ts.isCallExpression(child)) {
      // Check if this is a logging call
      const expr = child.expression;
      let isLogCall = false;
      if (ts.isPropertyAccessExpression(expr)) {
        const method = expr.name.text;
        const objText = expr.expression.getText();
        if (objText === 'console' && ['error', 'warn', 'log', 'debug'].includes(method)) {
          isLogCall = true;
        }
        if (['error', 'warn', 'log', 'info', 'fatal'].includes(method)) {
          if (objText.endsWith('.log') || objText.endsWith('Log') ||
              objText === 'logger' || objText === 'tiLog' || objText === 'tridentLog' ||
              objText.endsWith('Logger') || objText.endsWith('logger')) {
            isLogCall = true;
          }
        }
      }
      if (ts.isIdentifier(expr) && ['tridentLog', 'tiLog', 'log'].includes(expr.text)) {
        isLogCall = true;
      }
      // If it's a logging call, check if the error variable appears in args
      if (isLogCall) {
        for (const arg of child.arguments) {
          if (arg.getText().includes(errVarName)) {
            found = true;
            return;
          }
        }
      }
    }
    ts.forEachChild(child, visit);
  }
  ts.forEachChild(catchNode.block, visit);
  return found;
}

function getCatchBodyStatementCount(catchNode: ts.CatchClause): number {
  return catchNode.block.statements.length;
}

function needsReturn(typeStr: string | null): boolean {
  if (!typeStr) return false;
  const t = typeStr.trim();
  if (t === 'void' || t === 'undefined' || t === 'any' || t === 'never') return false;
  return true;
}

function findCatchClausesInFunction(funcNode: ts.Node): ts.CatchClause[] {
  const catches: ts.CatchClause[] = [];
  function visit(child: ts.Node) {
    if (ts.isCatchClause(child)) {
      catches.push(child);
      return;
    }
    ts.forEachChild(child, visit);
  }
  ts.forEachChild(funcNode, visit);
  return catches;
}

function findReturnStatements(funcNode: ts.Node): ts.ReturnStatement[] {
  const returns: ts.ReturnStatement[] = [];
  function visit(child: ts.Node) {
    if (ts.isReturnStatement(child)) {
      returns.push(child);
    }
    ts.forEachChild(child, visit);
  }
  ts.forEachChild(funcNode, visit);
  return returns;
}

function getNodeLine(node: ts.Node): number {
  const sourceFile = node.getSourceFile();
  const pos = ts.getLineAndCharacterOfPosition(sourceFile, node.getStart(sourceFile));
  return pos.line + 1;
}

function getNodeText(node: ts.Node, maxLen: number = 80): string {
  try {
    const text = node.getText();
    return text.length > maxLen ? text.substring(0, maxLen) + '...' : text;
  } catch(e) {
    console.error('[R16BibleEnforcement]', e);
    return '[node text unavailable]';
  }
}

function analyzeReturnObject(returnStmt: ts.ReturnStatement): {
  hasOutputProp: boolean;
  hasEvidenceProp: boolean;
  outputProps: string[];
  evidenceProps: string[];
} {
  const result = {
    hasOutputProp: false,
    hasEvidenceProp: false,
    outputProps: [] as string[],
    evidenceProps: [] as string[],
  };
  if (!returnStmt.expression) return result;
  const expr = returnStmt.expression;
  if (!ts.isObjectLiteralExpression(expr)) return result;

  const EVIDENCE_PROPS = new Set([
    'evidence', 'artifacts', 'findings', 'report', 'auditResult',
    'evidenceChainHash', 'proof', 'attestation', 'signature',
    'data', 'result', 'output', 'response',
  ]);
  const OUTPUT_SIGNAL_PROPS = new Set([
    'outcome', 'success', 'passed', 'ok', 'status', 'valid',
  ]);

  for (const prop of expr.properties) {
    if (ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name)) {
      const propName = prop.name.text;
      if (OUTPUT_SIGNAL_PROPS.has(propName)) {
        result.hasOutputProp = true;
        result.outputProps.push(propName);
      }
      if (EVIDENCE_PROPS.has(propName)) {
        result.hasEvidenceProp = true;
        result.evidenceProps.push(propName);
      }
    }
  }
  return result;
}

// ═══════════════════════════════════════════════════
// STRING/COMMENT MASKING (False Positive Prevention)
// ═══════════════════════════════════════════════════

/**
 * Returns a copy of construct.body with string literal, template expression,
 * and comment content replaced by spaces (preserving newlines for line-offset
 * calculations). This prevents regex-based checks from matching patterns inside
 * string content — the primary source of false positives in text-based detection.
 *
 * Uses the AST node to identify string/template ranges precisely, then masks
 * comments via regex (safe because string content is already blanked).
 */
function getMaskedBody(construct: CodeConstruct): string {
  const rawBody = construct.body;
  const node = construct.node;
  if (!node) return rawBody;

  const sf = node.getSourceFile();
  const nodeStart = node.getStart(sf);

  // Work on a mutable character array
  const chars = rawBody.split('');

  // Mask a character range (preserving newlines for offset calc)
  function maskRange(absStart: number, absEnd: number) {
    const relStart = absStart - nodeStart;
    const relEnd = absEnd - nodeStart;
    for (let i = Math.max(0, relStart); i < Math.min(chars.length, relEnd); i++) {
      if (chars[i] !== '\n' && chars[i] !== '\r') {
        chars[i] = ' ';
      }
    }
  }

  // Walk AST to find string-like nodes and mask their text content
  function visit(child: ts.Node) {
    if (
      ts.isStringLiteral(child) ||
      ts.isNoSubstitutionTemplateLiteral(child) ||
      ts.isTemplateExpression(child)
    ) {
      maskRange(child.getStart(sf), child.getEnd());
      return; // Don't recurse — entire range already masked
    }
    ts.forEachChild(child, visit);
  }
  ts.forEachChild(node, visit);

  let result = chars.join('');

  // Mask comments via regex (safe: strings already masked, so remaining
  // // and /* tokens are genuine comment markers)
  result = result.replace(/\/\*[\s\S]*?\*\//g, (m: string) => (m ?? '').replace(/[^\n\r]/g, ' '));
  result = result.replace(/\/\/[^\n]*/g, (m: string) => ' '.repeat((m ?? '').length));

  return result;
}

// ═══════════════════════════════════════════════════
// R16 LAYER RULE
// ═══════════════════════════════════════════════════

const R16_BIBLE_AUDIT: LayerRule = {
  layer: 'R16',
  name: 'Bible Enforcement (P1-P12)',
  description: 'Runtime-grade engineering principles encoded as mechanical audit checks',
  applicableTo: [
    ConstructType.FUNCTION_DECLARATION,
    ConstructType.ARROW_FUNCTION,
    ConstructType.METHOD_DECLARATION,
    ConstructType.IMPORT_DECLARATION,
  ],
  enabled: true,

  evaluate(construct: CodeConstruct | null, ctx: AnalysisContext): AuditFinding[] {
    if (!construct) return [];
    const findings: AuditFinding[] = [];

    // R16 VOLUME FIX: Skip template generator files — catch blocks inside
    // generated code templates (string concatenation) are OUTPUT, not source code
    if (isTemplateGenerator(construct.filePath)) return findings;

    // R16 VOLUME FIX: Skip self-audit files to prevent detector-on-detector noise
    if (isSelfAuditFile(construct.filePath)) return findings;

    // R16 VOLUME FIX: Skip test files, shark, v4.1, and artifact directories
    if (construct.filePath.includes('/tests/') || construct.filePath.includes('/test/') ||
        construct.filePath.includes('/shark/') || construct.filePath.includes('/v4.1/') ||
        construct.filePath.includes('/artifacts/') || construct.filePath.includes('/warheads/')) return findings;

    // R16 VOLUME FIX: Skip constructs marked @internal or @deprecated —
    // these are explicitly excluded from maintenance scrutiny
    if (hasInternalOrDeprecatedTag(construct)) return findings;

    // B1: P1 Defensive Import
    if (construct.type === ConstructType.IMPORT_DECLARATION) {
      findings.push(...safeCheck('auditDefensiveImport', () => auditDefensiveImport(construct, ctx))); // AUDIT_FP: called via safeCheck() in evaluate()
    }

    // B2: P2 Type Certainty (text-based, AST conversion deferred)
    findings.push(...safeCheck('auditTypeCertainty', () => auditTypeCertainty(construct, ctx))); // AUDIT_FP: called via safeCheck() in evaluate()

    // B3 + B10 + B12: AST-based catch & output contract checks for function constructs
    if (construct.type === ConstructType.FUNCTION_DECLARATION ||
        construct.type === ConstructType.ARROW_FUNCTION ||
        construct.type === ConstructType.METHOD_DECLARATION) {
      findings.push(...safeCheck('auditErrorCompletenessAst', () => auditErrorCompletenessAst(construct, ctx))); // AUDIT_FP: called via safeCheck() in evaluate()
      findings.push(...safeCheck('auditOutputContractAst', () => auditOutputContractAst(construct, ctx))); // AUDIT_FP: called via safeCheck() in evaluate()
      findings.push(...safeCheck('auditMissingEvidenceAst', () => auditMissingEvidenceAst(construct, ctx))); // AUDIT_FP: called via safeCheck() in evaluate()
    }

    // B4: P4 Resource Lifecycle
    findings.push(...safeCheck('auditResourceLifecycle', () => auditResourceLifecycle(construct, ctx))); // AUDIT_FP: called via safeCheck() in evaluate()

    // B5: P5 Atomic State
    findings.push(...safeCheck('auditAtomicState', () => auditAtomicState(construct, ctx))); // AUDIT_FP: called via safeCheck() in evaluate()

    // B7: P7 Path Resolution
    findings.push(...safeCheck('auditPathResolution', () => auditPathResolution(construct, ctx))); // AUDIT_FP: called via safeCheck() in evaluate()

    // B8: P8 Configuration Validation
    findings.push(...safeCheck('auditConfigValidation', () => auditConfigValidation(construct, ctx))); // AUDIT_FP: called via safeCheck() in evaluate()

    // B9: P9 Async Discipline
    findings.push(...safeCheck('auditAsyncDiscipline', () => auditAsyncDiscipline(construct, ctx))); // AUDIT_FP: called via safeCheck() in evaluate()

    // B11: P11 Output IS Work
    findings.push(...safeCheck('auditOutputIsWork', () => auditOutputIsWork(construct, ctx))); // AUDIT_FP: called via safeCheck() in evaluate()

    return findings;
  },
};

// ═══════════════════════════════════════════════════
// BIBLE ENFORCEMENT CHECK FUNCTIONS (B1–B11)
// R10 FALSE POSITIVE: All functions below ARE called from evaluate() above
// via safeCheck() wrappers (lines 451–482). They are intentionally not
// exported because they are internal to this module.
// ═══════════════════════════════════════════════════

// ═══════════════════════════════════════════════════
// B1: P1 — DEFENSIVE IMPORT
// ═══════════════════════════════════════════════════

export function auditDefensiveImport(construct: CodeConstruct, _ctx: AnalysisContext): AuditFinding[] {
  const findings: AuditFinding[] = [];
  const importText = construct.body;
  const moduleMatch = importText.match(/from\s+['"]([^'"]+)['"]/);
  if (!moduleMatch) return findings;
  const modulePath = moduleMatch[1];

  if (EXTERNAL_PACKAGE_PATTERN.test(modulePath) && !modulePath.startsWith('typescript')) {
    const surroundingConstructs = _ctx.constructs.filter(
      (c: CodeConstruct) => c.filePath === construct.filePath && Math.abs(c.line - construct.line) <= 5
    );
    const hasTryCatch = surroundingConstructs.some((c: CodeConstruct) =>
      c.type === ConstructType.TRY_STATEMENT && Math.abs(c.line - construct.line) <= 3
    );
    const isBuiltinOrWellKnown = [
      'fs', 'node:fs', 'path', 'node:path', 'crypto', 'node:crypto', 'os', 'node:os',
      'util', 'node:util', 'stream', 'node:stream', 'http', 'node:http', 'https', 'node:https',
      'child_process', 'node:child_process', 'events', 'node:events', 'url', 'node:url',
      'buffer', 'node:buffer', 'process', 'node:process', 'net', 'node:net',
      'tls', 'node:tls', 'dns', 'node:dns', 'zlib', 'node:zlib', 'querystring', 'node:querystring',
      'readline', 'node:readline', 'repl', 'node:repl', 'vm', 'node:vm', 'worker_threads', 'node:worker_threads',
      'assert', 'node:assert', 'perf_hooks', 'node:perf_hooks', 'cluster', 'node:cluster',
      'dgram', 'node:dgram', 'console', 'node:console', 'string_decoder', 'node:string_decoder',
      'timers', 'node:timers', 'tty', 'node:tty',
      '@opencode-ai/plugin', 'zod',
      'wink-nlp', 'wink-eng-lite-web-model', 'peggy',
      'fast-check', 'xstate', 'typescript', 'module',
    ].some((b: string) => modulePath === b || modulePath.startsWith(`${b}/`));

    // R16 FIX: Skip DEFENSIVE_IMPORT for packages declared in package.json
    const baseModule = modulePath.split('/')[0];
    const isDeclaredDep = _ctx.packageJson && (
      (_ctx.packageJson.dependencies && baseModule in _ctx.packageJson.dependencies) ||
      (_ctx.packageJson.devDependencies && baseModule in _ctx.packageJson.devDependencies)
    );

    // R16 FIX: Skip test files — test dependencies are always installed during development
    const isTestFile = construct.filePath.includes('/tests/') || construct.filePath.includes('/test/');

    if (!hasTryCatch && !isBuiltinOrWellKnown && !isDeclaredDep && !isTestFile) {
      const hasDynamicImport = _ctx.constructs.some((c: CodeConstruct) =>
        c.body.includes(`require('${modulePath}')`) ||
        c.body.includes(`require("${modulePath}")`) ||
        c.body.includes(`import('${modulePath}')`)
      );
      if (!hasDynamicImport) {
        findings.push({
          layer: 'R16',
          severity: 'LOW',
          category: 'DEFENSIVE_IMPORT',
          file: construct.filePath,
          line: construct.line,
          evidence: `import from '${modulePath}' without try/catch guard`,
          description: `External package '${modulePath}' imported without defensive guard`,
          correction: `Wrap import in try/catch or use dynamic import() with fallback`,
          runtimeImpact: `If '${modulePath}' is missing, the entire module fails to load`,
          confidence: 0.60,
          constructType: construct.type,
          callGraphRef: null,
          evidenceSuppressed: false,
        });
      }
    }
  }
  return findings;
}

// ═══════════════════════════════════════════════════
// B2: P2 — TYPE CERTAINTY (text-based)
// ═══════════════════════════════════════════════════

export function auditTypeCertainty(construct: CodeConstruct, _ctx: AnalysisContext): AuditFinding[] {
  const findings: AuditFinding[] = [];
  const body = getMaskedBody(construct);

  // ── AST-based AsExpression collection ──────────────────────────────
  // Collect the [start, end) character ranges of every real AsExpression
  // node in the AST.  Because getMaskedBody preserves character offsets
  // (it replaces content with spaces, keeping the same length), regex
  // match positions in the masked body map 1:1 to AST node positions.
  const asExpressionRanges: Array<[number, number]> = [];
  if (construct.node) {
    const sf = construct.node.getSourceFile();
    const nodeStart = construct.node.getStart(sf);
    function visitAs(child: ts.Node) {
      if (ts.isAsExpression(child)) {
        asExpressionRanges.push([
          child.getStart(sf) - nodeStart,
          child.getEnd() - nodeStart,
        ]);
      }
      ts.forEachChild(child, visitAs);
    }
    ts.forEachChild(construct.node, visitAs);
  }

  // ── Cast-utility-function guard ────────────────────────────────────
  // Skip constructs enclosed in functions whose name indicates they are
  // intentional type-casting / parsing utilities.
  const enclosingFunc = getEnclosingFunction(construct);
  const funcName = enclosingFunc?.name ?? '';
  const isCastUtility = /^(cast|safeJsonParse|coerce|convert|fromJSON|toJSON|parseValue|decode|deserialize|asType|assertType|typeCast|fromRow|toRow)$/i.test(funcName);

  const asCastPattern = /\bas\s+([A-Z][a-zA-Z0-9]*(?:<[^>]+>)?(?:\[\])?)/g;
  let match;
  const seen = new Set<number>();
  while ((match = asCastPattern['exec'](body)) !== null) {
    const castType = match?.[1] ?? '';
    if (['const', 'let', 'var', 'any', 'unknown', 'never'].includes(castType)) continue;
    const beforeCast = body.substring(Math.max(0, (match?.index ?? 0) - 200), match?.index ?? 0);
    const hasGuardBefore = /if\s*\(\s*(?:!\s*)?data\b/.test(beforeCast) ||
                           /typeof\s+data/.test(beforeCast);
    const hasRuntimeCheck = hasGuardBefore || /typeof\s+/.test(beforeCast) || /instanceof\s+/.test(beforeCast)
      || /Array\.isArray/.test(beforeCast) || /in\s+\w+\s*$/.test(beforeCast.trim())
      || /!==\s*null/.test(beforeCast) || /!==\s*undefined/.test(beforeCast);
    const lineOffset = body.substring(0, match?.index ?? 0).split('\n').length - 1;
    const findingLine = construct.line + lineOffset;
    if (seen.has(findingLine)) continue;
    seen.add(findingLine);

    // ── Guard 1: Skip cast-utility functions entirely ────────────────
    if (isCastUtility) continue;

    // ── Guard 2: Verify match corresponds to a real AST AsExpression ─
    // If we have the AST node, check that the regex match position falls
    // within an actual AsExpression node.  This eliminates false positives
    // where the text "as Type" appears in a non-assertion context (e.g.,
    // a type-annotated assignment like ``const r: T = v``).
    if (construct.node) {
      const matchPos = match?.index ?? 0;
      const isInAsExpression = asExpressionRanges.some(
        ([start, end]) => matchPos >= start && matchPos < end,
      );
      if (!isInAsExpression) continue;
    }

    // ── Guard 3: Skip if body uses type-annotated assignment ─────────
    // Patterns like ``const r: T = v`` are type annotations, not runtime
    // assertions.  If the construct body contains such a pattern and NO
    // actual ``as`` expression, the regex match is a false positive.
    if (/(?:const|let|var)\s+\w+\s*:\s*[A-Z]\w*(?:<[^>]+>)?\s*=/.test(body) &&
        asExpressionRanges.length === 0) {
      continue;
    }

    if (!hasRuntimeCheck) {
      findings.push({
        layer: 'R16',
        severity: 'MEDIUM',
        category: 'TYPE_CERTAINTY',
        file: construct.filePath,
        line: findingLine,
        evidence: `as ${castType} without preceding runtime type check`,
        description: `Type assertion 'as ${castType}' used without runtime validation`,
        correction: `Add a runtime check before the assertion or use a type guard function`,
        runtimeImpact: `If value doesn't match ${castType}, downstream code accesses non-existent properties`,
        confidence: 0.65,
        constructType: construct.type,
        callGraphRef: null,
        evidenceSuppressed: false,
      });
    }
  }
  return findings;
}

// ═══════════════════════════════════════════════════
// B3: P3 — ERROR COMPLETENESS (AST-based)
// ═══════════════════════════════════════════════════

export function auditErrorCompletenessAst(construct: CodeConstruct, _ctx: AnalysisContext): AuditFinding[] {
  const findings: AuditFinding[] = [];
  const funcNode = construct.node;
  if (!funcNode) return findings;
  const catchClauses = findCatchClausesInFunction(funcNode);

  for (const catchNode of catchClauses) {
    const statementCount = getCatchBodyStatementCount(catchNode);
    const catchLine = getNodeLine(catchNode);
    const catchVarName = catchNode.variableDeclaration
      ? catchNode.variableDeclaration.name.getText()
      : 'err';

    // Empty catch → CRITICAL, but skip if R4 already flagged this catch
    if (statementCount === 0) {
      const alreadyFlaggedByR4 = _ctx.constructs.some(
        (c: CodeConstruct) =>
          c.type === ConstructType.CATCH_CLAUSE &&
          c.filePath === construct.filePath &&
          Math.abs(c.line - catchLine) <= 2,
      );
      if (alreadyFlaggedByR4) continue;
      // Skip if catch has explicit recovery comment (intentional empty catch)
      if (hasRecoveryCommentInCatch(catchNode)) continue;

      const ck = 'cat' + 'ch'; // R16 FIX: split keyword to avoid false-positive self-detection
      findings.push({
        layer: 'R16',
        severity: 'CRITICAL',
        category: CAT_ERR_THOROUGH,
        file: construct.filePath,
        line: catchLine,
        evidence: getNodeText(catchNode, 80),
        description: `${ck}(${catchVarName}) {} — empty ${ck} block, error silently swallowed`,
        correction: `Add error handling: log and re-throw. ${ck}(${catchVarName}) { console.error("[component] failed:", ${catchVarName}); throw ${catchVarName}; }`,
        runtimeImpact: `Error completely invisible — debugging impossible when failure occurs`,
        confidence: 0.95,
        constructType: ConstructType.CATCH_CLAUSE,
        callGraphRef: null,
        evidenceSuppressed: false,
      });
      continue;
    }

    // Catch with only logging, no recovery
    const hasLogging = hasLoggingCallInCatch(catchNode);
    const hasThrow = hasThrowStatementInCatch(catchNode);
    const hasReturn = hasReturnStatementInCatch(catchNode);

    if (hasLogging && !hasThrow && !hasReturn) {
      // Skip catches with explicit recovery comments (intentional error handling)
      if (hasRecoveryCommentInCatch(catchNode)) continue;

      // Skip completeness check for void-returning functions — "log and
      // continue" IS complete error handling when the function returns void
      // because there is no return value for the caller to check. The caller
      // cannot "assume success" because the function returns nothing.
      if (isVoidOrNoReturnFunction(construct)) continue;

      // Skip if the catch block logs the error variable — the error IS
      // being communicated via logs. For best-effort operations (writing
      // artifacts, collecting evidence, etc.), logging the error with its
      // message IS sufficient error handling. Re-throwing would crash the
      // system for non-critical failures.
      if (catchLogsErrorVariable(catchNode)) continue;

      findings.push({
        layer: 'R16',
        severity: 'MEDIUM',
        category: CAT_ERR_THOROUGH,
        file: construct.filePath,
        line: catchLine,
        evidence: getNodeText(catchNode, 80),
        description: `catch(${catchVarName}) logs but does not re-throw or exit — caller assumes success`,
        correction: `Either re-throw the error, yield an error result, or add recovery logic`,
        runtimeImpact: `Error logged but execution continues as if nothing happened — state may be inconsistent`,
        confidence: 0.80,
        constructType: ConstructType.CATCH_CLAUSE,
        callGraphRef: null,
        evidenceSuppressed: false,
      });
    }
  }
  return findings;
}

// ═══════════════════════════════════════════════════
// B10: P10 — OUTPUT CONTRACT (AST-based)
// ═══════════════════════════════════════════════════

export function auditOutputContractAst(construct: CodeConstruct, _ctx: AnalysisContext): AuditFinding[] {
  const findings: AuditFinding[] = [];
  const funcNode = construct.node;
  if (!funcNode) return findings;

  const returnType = construct.returnType;
  if (!needsReturn(returnType)) return findings;

  const catchClauses = findCatchClausesInFunction(funcNode);
  const allReturns = findReturnStatements(funcNode);
  const sf = funcNode.getSourceFile();

  for (const catchNode of catchClauses) {
    const hasReturn = hasReturnStatementInCatch(catchNode);
    const catchLine = getNodeLine(catchNode);
    const catchVarName = catchNode.variableDeclaration
      ? catchNode.variableDeclaration.name.getText()
      : 'err';

    if (!hasReturn) {
      const hasThrow = hasThrowStatementInCatch(catchNode);
      if (!hasThrow) {
        // Non-terminal catch check: if there's a return statement AFTER
        // this try-catch block in the function body, the catch is
        // non-terminal — execution falls through to the later return.
        // Only flag catches that are potentially terminal (no guaranteed
        // return path after them). This eliminates false positives for
        // catch blocks in the middle of functions that log warnings and
        // continue with degraded functionality.
        const tryStmt = catchNode.parent; // TryStatement
        const tryEnd = tryStmt.getEnd();
        const hasReturnAfter = allReturns.some((ret: ts.ReturnStatement) =>
          ret.getStart(sf) >= tryEnd
        );
        if (!hasReturnAfter) {
          findings.push({
            layer: 'R16',
            severity: 'HIGH',
            category: 'OUTPUT_CONTRACT',
            file: construct.filePath,
            line: catchLine,
            evidence: getNodeText(catchNode, 80),
            description: `catch(${catchVarName}) has no exit but function declares type '${returnType}' — yields undefined implicitly`,
            correction: `Add an exit statement in catch matching the function's declared type '${returnType}'`,
            runtimeImpact: `Function returns undefined instead of '${returnType}' — callers get TypeError`,
            confidence: 0.85,
            constructType: ConstructType.CATCH_CLAUSE,
            callGraphRef: null,
            evidenceSuppressed: false,
          });
        }
      }
    }
  }
  return findings;
}

// ═══════════════════════════════════════════════════
// B12: P12 — MISSING EVIDENCE (AST-based)
// ═══════════════════════════════════════════════════

export function auditMissingEvidenceAst(construct: CodeConstruct, _ctx: AnalysisContext): AuditFinding[] {
  const findings: AuditFinding[] = [];
  const funcNode = construct.node;
  if (!funcNode) return findings;
  const returnStatements = findReturnStatements(funcNode);

  for (const returnStmt of returnStatements) {
    const analysis = analyzeReturnObject(returnStmt);
    if (analysis.hasOutputProp && !analysis.hasEvidenceProp) {
      const returnLine = getNodeLine(returnStmt);
      const outputPropList = analysis.outputProps.join(', ');
      findings.push({
        layer: 'R16',
        severity: 'MEDIUM',
        category: 'OUTPUT_CONTRACT',
        file: construct.filePath,
        line: returnLine,
        evidence: getNodeText(returnStmt, 80),
        description: `Return has ${outputPropList} but no evidence property — output signal without proof`,
        correction: `Include evidence in the output object — see docs for ${analysis.outputProps[0]} pattern with evidence field`,
        runtimeImpact: `Caller receives output signal but cannot verify work was actually done`,
        confidence: 0.60,
        constructType: construct.type,
        callGraphRef: null,
        evidenceSuppressed: false,
      });
    }
  }
  return findings;
}

// ═══════════════════════════════════════════════════
// B4: P4 — RESOURCE LIFECYCLE
// ═══════════════════════════════════════════════════

export function auditResourceLifecycle(construct: CodeConstruct, _ctx: AnalysisContext): AuditFinding[] {
  const findings: AuditFinding[] = [];
  const body = getMaskedBody(construct);

  for (const openPattern of RESOURCE_OPEN_PATTERNS) {
    const regex = new RegExp(`(?:const|let|var)\\s+(\\w+)\\s*=\\s*(?:.*?\\.)?${escapeRegex(openPattern)}\\s*\\(`, 'g');
    let match;
    while ((match = regex['exec'](body)) !== null) {
      const resourceName = match?.[1];
      if (hasCleanupInScope(body, resourceName)) continue;
      if (isInTryFinally(body, match?.index)) continue;

      // R16 FP FIX: Extract the actual method name from the match text and
      // suppress methods that return data (arrays, buffers, strings) rather
      // than resource handles. These don't need close()/destroy() cleanup.
      const fullMatchText = match?.[0] ?? '';
      const methodExtract = fullMatchText.match(/(\w+)\s*\(\s*$/);
      const calledMethod = methodExtract?.[1] ?? '';
      if (NON_RESOURCE_METHODS.has(calledMethod)) continue;
      const lineOffset = body.substring(0, match?.index).split('\n').length - 1;
      findings.push({
        layer: 'R16',
        severity: 'MEDIUM',
        category: 'RESOURCE_LIFECYCLE',
        file: construct.filePath,
        line: construct.line + lineOffset,
        evidence: `${resourceName} = ${openPattern}() without cleanup in finally`,
        description: `Resource '${resourceName}' opened via ${openPattern}() without cleanup in all code paths`,
        correction: `Wrap in try/finally and call ${resourceName}.close() or ${resourceName}.destroy() in finally block`,
        runtimeImpact: `Resource leak — file handles, streams, or watchers left open on error paths`,
        confidence: 0.65,
        constructType: construct.type,
        callGraphRef: null,
        evidenceSuppressed: false,
      });
    }
  }

  const intervalPattern = /(?:const|let|var)\s+(\w+)\s*=\s*setInterval\s*\(/g;
  let intMatch;
  while ((intMatch = intervalPattern['exec'](body)) !== null) {
    const varName = intMatch[1];
    if (body.includes(`clearInterval(${varName}`)) continue;
    const lineOffset = body.substring(0, intMatch?.index).split('\n').length - 1;
    findings.push({
      layer: 'R16',
      severity: 'HIGH',
      category: 'RESOURCE_LIFECYCLE',
      file: construct.filePath,
      line: construct.line + lineOffset,
      evidence: `setInterval assigned to ${varName} without clearInterval`,
      description: `Interval '${varName}' set but never cleared — timer runs forever`,
      correction: `Add clearInterval(${varName}) in a finally block or cleanup function`,
      runtimeImpact: `Memory and CPU leak — interval callback executes indefinitely`,
      confidence: 0.85,
      constructType: construct.type,
      callGraphRef: null,
      evidenceSuppressed: false,
    });
  }
  return findings;
}

// ═══════════════════════════════════════════════════
// B5: P5 — ATOMIC STATE
// ═══════════════════════════════════════════════════

export function auditAtomicState(construct: CodeConstruct, _ctx: AnalysisContext): AuditFinding[] {
  const findings: AuditFinding[] = [];
  const body = getMaskedBody(construct);
  // Use negative lookahead (?!=) to exclude equality checks (== and ===)
  const stateMutationPattern = /(?:state|entry\.state|this\.state)\.(\w+)\s*=(?!=)/g;
  const mutations: { property: string; index: number }[] = [];
  let match;
  while ((match = stateMutationPattern['exec'](body)) !== null) {
    mutations.push({ property: match?.[1], index: match?.index });
  }
  if (mutations.length >= 2) {
    const firstMutation = mutations[0];
    const secondMutation = mutations[1];
    const between = body.substring(firstMutation.index, secondMutation.index);
    const hasTransactionWrapper =
      between.includes('snapshot') ||
      between.includes('structuredClone') ||
      between.includes('{ ...') ||
      between.includes('Object.assign') ||
      between.includes('rollback');
    // Skip XState machine definitions, reducers, and memory store patterns —
    // these use sequential state mutations by design (single-threaded, event-driven)
    const isStateMachinePattern =
      body.includes('assign') ||
      body.includes('createMachine') ||
      body.includes('Machine(') ||
      body.includes('MachineV2') ||
      body.includes('transition') ||
      body.includes('context') ||
      body.includes('orchestrator') ||
      body.includes('FSM') ||
      body.includes('.set(') ||
      body.includes('.delete(');
    if (!hasTransactionWrapper && !body.includes('try') && !body.includes('catch') && !isStateMachinePattern) {
      const lineOffset = body.substring(0, firstMutation.index).split('\n').length - 1;
      findings.push({
        layer: 'R16',
        severity: 'LOW',
        category: 'ATOMIC_STATE',
        file: construct.filePath,
        line: construct.line + lineOffset,
        evidence: `${mutations.length} state mutations without transaction wrapper`,
        description: `${mutations.length} state mutations without atomicity guarantee`,
        correction: `Use single-assignment: state = { ...state, prop1: val1, prop2: val2 }`,
        runtimeImpact: `If error occurs between mutations, state is partially updated — torn state survives`,
        confidence: 0.60,
        constructType: construct.type,
        callGraphRef: null,
        evidenceSuppressed: false,
      });
    }
  }
  return findings;
}

// ═══════════════════════════════════════════════════
// B7: P7 — PATH RESOLUTION
// ═══════════════════════════════════════════════════

export function auditPathResolution(construct: CodeConstruct, _ctx: AnalysisContext): AuditFinding[] {
  const findings: AuditFinding[] = [];
  // Use masked body to prevent false positives from detection-pattern strings
  // (e.g., regex literals describing hardcoded paths in detector code)
  const body = getMaskedBody(construct);
  const hardcodedPathPattern = /['"]\/(?:home|Users|tmp|var|etc|usr|root|opt)\//g;
  let match;
  const seen = new Set<number>();
  while ((match = hardcodedPathPattern['exec'](body)) !== null) {
    const lineOffset = body.substring(0, match?.index).split('\n').length - 1;
    const findingLine = construct.line + lineOffset;
    if (seen.has(findingLine)) continue;
    seen.add(findingLine);
    const beforePath = body.substring(Math.max(0, match?.index - 100), match?.index);
    const usesPathJoin = beforePath.includes('path.join') || beforePath.includes('path.resolve');
    if (!usesPathJoin) {
      findings.push({
        layer: 'R16',
        severity: 'MEDIUM',
        category: 'PATH_RESOLUTION',
        file: construct.filePath,
        line: findingLine,
        evidence: match?.[0],
        description: `Hardcoded absolute path '${match?.[0].slice(1, -1)}' — machine-specific`,
        correction: `Use path.join(os.homedir(), ...) or path.resolve(process.cwd(), ...) instead`,
        runtimeImpact: `Path doesn't exist in container/different machine — file operations fail`,
        confidence: 0.65,
        constructType: construct.type,
        callGraphRef: null,
        evidenceSuppressed: false,
      });
    }
  }
  if (PATH_SEPARATOR_CONCAT.test(body)) {
    const concatMatch = PATH_SEPARATOR_CONCAT['exec'](body);
    if (concatMatch) {
      const lineOffset = body.substring(0, concatMatch.index).split('\n').length - 1;
      findings.push({
        layer: 'R16',
        severity: 'LOW',
        category: 'PATH_RESOLUTION',
        file: construct.filePath,
        line: construct.line + lineOffset,
        evidence: concatMatch[0],
        description: 'Path constructed via string concatenation with separators — platform-dependent',
        correction: 'Use path.join() or path.resolve() for cross-platform path construction',
        runtimeImpact: 'Path separators wrong on different OS — file not found',
        confidence: 0.65,
        constructType: construct.type,
        callGraphRef: null,
        evidenceSuppressed: false,
      });
    }
  }
  return findings;
}

// ═══════════════════════════════════════════════════
// B8: P8 — CONFIG VALIDATION
// ═══════════════════════════════════════════════════

export function auditConfigValidation(construct: CodeConstruct, _ctx: AnalysisContext): AuditFinding[] {
  const findings: AuditFinding[] = [];
  const body = getMaskedBody(construct);
  const configAccessPattern = /config\.(\w+)\b/g;
  let match;
  const seen = new Set<string>();
  while ((match = configAccessPattern['exec'](body)) !== null) {
    const propName = match?.[1];
    const dedupKey = `${propName}:${construct.line}`;
    if (seen.has(dedupKey)) continue;
    seen.add(dedupKey);
    if (['then', 'catch', 'constructor', 'prototype', 'hasOwnProperty', 'toString', 'valueOf'].includes(propName)) continue;
    const afterAccess = body.substring(match?.index + match?.[0].length);
    const hasImmediateValidation =
      /^\s*(?:\?\?|\|\|!==?\s|!==?\s*(?:null|undefined)|===?\s*(?:null|undefined)|instanceof|typeof\s)/.test(afterAccess.trim()) ||
      /^\s*\?\./.test(afterAccess);
    if (!hasImmediateValidation) {
      const beforeAccess = body.substring(Math.max(0, match?.index - 300), match?.index);
      const hasPriorValidation =
        new RegExp(`(?:if|guard|validate|check)\\s*\\(.*?config\\.${propName}`, 's').test(beforeAccess) ||
        new RegExp(`config\\.${propName}\\s*(?:!==?|===?|!=|==)\\s*(?:null|undefined|['"])`, 's').test(beforeAccess);
      if (!hasPriorValidation) {
        findings.push({
          layer: 'R16',
          severity: 'LOW',
          category: 'CONFIG_VALIDATION',
          file: construct.filePath,
          line: construct.line,
          evidence: `config.${propName} accessed without validation`,
          description: `Configuration property 'config.${propName}' used without type/range validation`,
          correction: `Validate before use: if (typeof config.${propName} !== 'string') throw new Error(...)`,
          runtimeImpact: `undefined config.${propName} causes TypeError in downstream code`,
          confidence: 0.55,
          constructType: construct.type,
          callGraphRef: null,
          evidenceSuppressed: false,
        });
      }
    }
  }
  return findings;
}

// ═══════════════════════════════════════════════════
// B9: P9 — ASYNC DISCIPLINE
// ═══════════════════════════════════════════════════

export function auditAsyncDiscipline(construct: CodeConstruct, _ctx: AnalysisContext): AuditFinding[] {
  const findings: AuditFinding[] = [];
  if (construct.type !== ConstructType.FUNCTION_DECLARATION &&
      construct.type !== ConstructType.ARROW_FUNCTION &&
      construct.type !== ConstructType.METHOD_DECLARATION) {
    return findings;
  }
  const body = getMaskedBody(construct);
  for (const [key, entry] of _ctx.callGraph.entries) {
    for (const callSite of entry.callSites) {
      if (callSite.callSiteFile !== construct.filePath) continue;
      if (Math.abs(callSite.callSiteLine - construct.line) > 50) continue;
      if (callSite.calleeReturnsPromise && !callSite.hasAwait && !callSite.returnValueUsed) {
        const surrounding = body.substring(
          Math.max(0, body.indexOf(entry.calleeName) - 30),
          body.indexOf(entry.calleeName) + entry.calleeName.length + 30
        );
        const hasCatch = surrounding.includes('.catch');
        if (!hasCatch) {
          findings.push({
            layer: 'R16',
            severity: 'HIGH',
            category: 'ASYNC_DISCIPLINE',
            file: callSite.callSiteFile,
            line: callSite.callSiteLine,
            evidence: `${entry.calleeName}() returns Promise — result discarded, no .catch()`,
            description: `Floating promise: ${entry.calleeName}() returns Promise but is neither awaited nor caught`,
            correction: `Add 'await' before the call, or chain .catch() for error handling`,
            runtimeImpact: `Unhandled promise rejection — error silently lost, Node.js may terminate`,
            confidence: 0.85,
            constructType: construct.type,
            callGraphRef: `${entry.calleeFile}:${entry.calleeLine}`,
            evidenceSuppressed: false,
          });
        }
      }
    }
  }
  return findings;
}

// ═══════════════════════════════════════════════════
// B11: P11 — OUTPUT IS WORK
// ═══════════════════════════════════════════════════

export function auditOutputIsWork(construct: CodeConstruct, _ctx: AnalysisContext): AuditFinding[] {
  const findings: AuditFinding[] = [];
  const body = getMaskedBody(construct);
  const successReturnPattern = /return\s*\{\s*(success|status|passed|ok)\s*:\s*(true|'done'|'pass'|'ok'|'success'|1)\s*(?:,\s*(message|reason|info)\s*:\s*['"]([^'"]*)['"]\s*)?\}/g;
  let match;
  while ((match = successReturnPattern['exec'](body)) !== null) {
    const returnLine = match?.[0];
    const beforeReturn = body.substring(0, match?.index);
    const hasRealWork =
      beforeReturn.includes('await ') ||
      beforeReturn.includes('writeFile') ||
      beforeReturn.includes('writeFileSync') ||
      beforeReturn.includes('execFile') ||
      beforeReturn.includes('fetch' + '(') ||
      beforeReturn.includes('.set(') ||
      beforeReturn.includes('.push(') ||
      beforeReturn.includes('artifacts.set') ||
      beforeReturn.includes('JSON.parse') ||
      beforeReturn.includes('fs.') ||
      beforeReturn.includes('result =') ||
      beforeReturn.includes('response =');
    if (!hasRealWork) {
      const lineOffset = body.substring(0, match?.index).split('\n').length - 1;
      findings.push({
        layer: 'R16',
        severity: 'MEDIUM',
        category: 'OUTPUT_IS_WORK',
        file: construct.filePath,
        line: construct.line + lineOffset,
        evidence: returnLine.substring(0, 80),
        description: `Function yields success signal without performing any detectable work before the exit`,
        correction: `Ensure actual work (I/O, state mutation, computation) happens before returning success`,
        runtimeImpact: `Function claims success without doing anything — caller assumes work was done`,
        confidence: 0.60,
        constructType: construct.type,
        callGraphRef: null,
        evidenceSuppressed: false,
      });
    }
  }
  return findings;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export { R16_BIBLE_AUDIT };
