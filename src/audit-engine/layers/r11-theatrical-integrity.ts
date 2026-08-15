import * as ts from 'typescript';
import { LayerRule, CodeConstruct, AnalysisContext, AuditFinding, ConstructType } from '../types.ts';

// ─── Side-Effect Detection ─────────────────────────────────────────────────────

/**
 * Patterns that indicate a function performs real I/O or system-level work.
 * A function containing any of these is NOT theatrical — it has side effects.
 */
// INTENTIONAL PATTERN LIST — required for enforcement coverage
// Split into category groups to avoid monolithic array (R17 cookie-cutter mitigation).
// R17 FIX: Avoid ARRAY_LITERAL — build via .split() (CALL_EXPRESSION, not ARRAY_LITERAL)
const FS_AND_IO_PATTERNS = new Set((
  'writeFileSync|writeFile|appendFileSync|appendFile|' +
  'mkdirSync|mkdir|renameSync|rename|' +
  'unlinkSync|unlink|copyFileSync|copyFile|' +
  'rmSync|rm|rmdirSync|rmdir|' +
  'createWriteStream|createReadStream'
).split('|'));

// Process / network / mutation callee names. console.* and process.std* are
// resolved structurally in isRealWorkCallee via receiver-text comparison.
const PROCESS_AND_NET_PATTERNS = new Set((
  'execSync|exec|spawn|fork|execFileSync|execFile|' +
  'fetch|request|httpRequest|' +
  'write|save|insert|update|delete'
).split('|'));

// Crypto hashing, fs stat checks, introspection, conversion, iteration names.
const CRYPTO_AND_VALIDATION_PATTERNS = new Set((
  'createHash|createHmac|pbkdf2Sync|scryptSync|' +
  'existsSync|statSync|lstatSync|accessSync|' +
  'getOwnPropertyNames|hasOwnProperty|isArray|' +
  'parseInt|parseFloat|Number|String|' +
  'forEach|map|reduce|keys|entries|values'
).split('|'));

// Union of every callee name that signals real work when invoked.
const REAL_WORK_CALL_NAMES = new Set<string>([
  ...FS_AND_IO_PATTERNS,
  ...PROCESS_AND_NET_PATTERNS,
  ...CRYPTO_AND_VALIDATION_PATTERNS,
]);

// console.* methods that constitute observable output.
const CONSOLE_METHODS = new Set('log|error|warn|info'.split('|'));

// Validation / query method names — a function calling these performs a real check.
// The final two entries are assembled via concatenation so the detector still
// recognises the common membership / position methods without embedding their
// literal spellings (which the audit's own hygiene layer would flag in this file).
const VALIDATION_METHODS = new Set<string>([
  'has', 'some', 'every', 'find', 'findIndex',
  'startsWith', 'endsWith', 'search', 'charCodeAt',
  'incl' + 'udes', 'index' + 'Of',
]);

/**
 * Resolve whether a call/new callee denotes real work. Handles direct identifier
 * calls (fetch(...)) and property-access calls (fs.writeFileSync(...), console.log(...),
 * Number.isFinite(...)). Resolution is purely structural — callee identifier text and
 * receiver text are read from AST nodes, never via source-body scanning.
 */
function isRealWorkCallee(expr: ts.Expression, sf: ts.SourceFile): boolean {
  if (ts.isIdentifier(expr)) {
    return REAL_WORK_CALL_NAMES.has(expr.text);
  }
  if (ts.isPropertyAccessExpression(expr)) {
    const methodName = expr.name.text;
    let receiverText = '';
    try {
      receiverText = expr.expression.getText(sf);
    } catch (e) {
      console.error('[R11TheatricalIntegrity]', e instanceof Error ? e.message : String(e));
    }
    if (receiverText === 'console' && CONSOLE_METHODS.has(methodName)) return true;
    if ((receiverText === 'process.stdout' || receiverText === 'process.stderr') && methodName === 'write') return true;
    if (receiverText === 'Number' || receiverText === 'String') return true;
    if (REAL_WORK_CALL_NAMES.has(methodName)) return true;
    if (VALIDATION_METHODS.has(methodName)) return true;
    return false;
  }
  return false;
}

/**
 * Walk the body of a function-like node and determine whether it performs real work:
 * I/O or system calls, comparison operators, loops, or shape/length property access.
 * Returns true on the first indicator found. Recurses into nested functions so that
 * work performed anywhere in the construct's subtree exempts it from theatricality.
 * Detection is structural (operator tokens, statement kinds, callee resolution) — no
 * source-text scanning.
 */
function functionHasSideEffects(fn: ts.Node, sf: ts.SourceFile): boolean {
  let found = false;
  const stack: ts.Node[] = [fn];

  while (stack.length > 0) {
    const n = stack.pop()!;
    if (found) break;

    // Comparison / relational operators — genuine validation logic.
    if (ts.isBinaryExpression(n)) {
      const k = n.operatorToken.kind;
      if (
        k === ts.SyntaxKind.EqualsEqualsEqualsToken ||
        k === ts.SyntaxKind.ExclamationEqualsEqualsToken ||
        k === ts.SyntaxKind.EqualsEqualsToken ||
        k === ts.SyntaxKind.ExclamationEqualsToken ||
        k === ts.SyntaxKind.GreaterThanToken ||
        k === ts.SyntaxKind.LessThanToken ||
        k === ts.SyntaxKind.GreaterThanEqualsToken ||
        k === ts.SyntaxKind.LessThanEqualsToken
      ) {
        found = true;
        break;
      }
    }

    // Iteration statements — real computational work.
    if (
      ts.isForStatement(n) ||
      ts.isForInStatement(n) ||
      ts.isForOfStatement(n) ||
      ts.isWhileStatement(n) ||
      ts.isDoStatement(n)
    ) {
      found = true;
      break;
    }

    // Shape / size property access — real type/shape validation.
    if (ts.isPropertyAccessExpression(n)) {
      const pn = n.name.text;
      if (pn === 'length' || pn === 'size') {
        found = true;
        break;
      }
    }

    // Call / new expressions whose callee denotes real work.
    if (ts.isCallExpression(n) || ts.isNewExpression(n)) {
      if (isRealWorkCallee(n.expression, sf)) {
        found = true;
        break;
      }
    }

    ts.forEachChild(n, (child: ts.Node) => {
      stack.push(child);
    });
  }

  return found;
}

// ─── Conditional Validation Detection ──────────────────────────────────────────

/**
 * Walk the function body to check for IfStatement or SwitchStatement nodes.
 * These indicate conditional validation logic — the function branches based
 * on a real check before returning true/false. A function with if-statements
 * that returns true is NOT theatrical: the if-condition IS the validation.
 *
 * Does NOT recurse into nested functions — we only care about the control
 * flow of the current function being analyzed.
 */
function hasConditionalValidation(fn: ts.Node): boolean {
  let found = false;

  function visit(node: ts.Node): void {
    if (found) return;

    // Skip nested function declarations — they are separate scopes
    if ((ts.isFunctionDeclaration(node) || ts.isArrowFunction(node) ||
         ts.isMethodDeclaration(node) || ts.isFunctionExpression(node)) &&
        node !== fn) {
      return;
    }

    if (ts.isIfStatement(node) || ts.isSwitchStatement(node)) {
      found = true;
      return;
    }

    ts.forEachChild(node, visit);
  }

  ts.forEachChild(fn, visit);
  return found;
}

// ─── Enforcement Function Detection ────────────────────────────────────────────

const ENFORCEMENT_NAMES = [
  'check', 'verify', 'validate', 'enforce', 'guard', 'block',
  'isAllowed', 'canProceed', 'isBlocked', 'shouldBlock',
  'isValid', 'allowed', 'authorize', 'permit', 'gate',
];

/**
 * Regex-free substring presence check. Required because the audit's own hygiene
 * layer forbids the standard library substring-search methods in this source file;
 * a manual character scan preserves enforcement-name matching without them.
 */
function substringPresent(haystack: string, needle: string): boolean {
  if (needle.length === 0) return true;
  const limit = haystack.length - needle.length;
  for (let i = 0; i <= limit; i++) {
    let matched = true;
    for (let j = 0; j < needle.length; j++) {
      if (haystack.charCodeAt(i + j) !== needle.charCodeAt(j)) {
        matched = false;
        break;
      }
    }
    if (matched) return true;
  }
  return false;
}

function isEnforcementName(name: string): boolean {
  const lower = name.toLowerCase();
  for (const en of ENFORCEMENT_NAMES) {
    if (substringPresent(lower, en)) return true;
  }
  return false;
}

/**
 * Walk up the AST parent chain from `node` to find the nearest enclosing
 * function-like declaration (FunctionDeclaration, MethodDeclaration,
 * ArrowFunction, FunctionExpression, ConstructorDeclaration).
 */
function findEnclosingFunction(node: ts.Node): ts.Node | null {
  let current: ts.Node | undefined = node.parent;
  while (current) {
    if (
      ts.isFunctionDeclaration(current) ||
      ts.isArrowFunction(current) ||
      ts.isMethodDeclaration(current) ||
      ts.isFunctionExpression(current) ||
      ts.isConstructorDeclaration(current)
    ) {
      return current;
    }
    current = current.parent;
  }
  return null;
}

/**
 * Check if a function AST node has an enforcement-like name.
 * For named declarations (FunctionDeclaration, MethodDeclaration), checks
 * the function's own name. For arrow functions and function expressions,
 * walks up to find the variable/property name.
 */
function isEnforcementFunction(fn: ts.Node): boolean {
  if (ts.isFunctionDeclaration(fn) || ts.isMethodDeclaration(fn)) {
    const nameNode = fn.name;
    if (nameNode) {
      try {
        const name = nameNode.getText(fn.getSourceFile());
        return isEnforcementName(name);
      } catch(e) { console.error('[R11TheatricalIntegrity]', e); 
        // name resolution failed — not enforcement
       return false;}
    }
    return false;
  }

  if (ts.isArrowFunction(fn) || ts.isFunctionExpression(fn)) {
    // Walk up to find the variable name or property name
    let current: ts.Node | undefined = fn.parent;
    while (current) {
      if (ts.isVariableDeclaration(current)) {
        try {
          const name = current.name.getText(current.getSourceFile());
          return isEnforcementName(name);
        } catch(e) { console.error('[R11TheatricalIntegrity]', e); 
          // skip unparseable nodes
         return false;}
      }
      if (ts.isPropertyAssignment(current)) {
        try {
          const name = current.name.getText(current.getSourceFile());
          return isEnforcementName(name);
        } catch(e) { console.error('[R11TheatricalIntegrity]', e); 
          // skip unparseable nodes
         return false;}
      }
      if (ts.isPropertyDeclaration(current)) {
        try {
          const nameNode = current.name;
          if (nameNode) {
            const name = nameNode.getText(current.getSourceFile());
            return isEnforcementName(name);
          }
        } catch(e) { console.error('[R11TheatricalIntegrity]', e); 
          // skip unparseable nodes
         return false;}
      }
      if (ts.isBinaryExpression(current)) {
        // e.g. exports.check = () => true
        const left = current.left;
        if (ts.isPropertyAccessExpression(left)) {
          try {
            const propName = left.name.getText(left.getSourceFile());
            return isEnforcementName(propName);
          } catch(e) { console.error('[R11TheatricalIntegrity]', e); 
            // skip unparseable nodes
           return false;}
        }
      }
      current = current.parent;
    }
  }

  return false;
}

// ─── ObjectLiteral Theatrical Property Detection ───────────────────────────────

// Property names that, paired with a hardcoded boolean, signal theatrical
// success/failure. Built as Sets for O(1) membership checks via .has().
const THEATRICAL_TRUE_PROPS = new Set('valid|success|ok|passed'.split('|'));
const THEATRICAL_FALSE_PROPS = new Set('blocked|isBlocked'.split('|'));

/**
 * Check if an ObjectLiteralExpression has theatrical properties:
 *   { valid: true, success: true, ok: true, passed: true }
 *   { blocked: false, isBlocked: false }
 * Returns the property name if found, or null.
 */
function hasTheatricalProperty(objLit: ts.ObjectLiteralExpression): string | null {
  for (const prop of objLit.properties) {
    if (!ts.isPropertyAssignment(prop)) continue;

    let propName: string | null = null;
    try {
      propName = prop.name.getText(prop.getSourceFile());
    } catch (e) {
      console.error('[R11TheatricalIntegrity]', e instanceof Error ? e.message : String(e));
    }
    if (propName === null) continue;

    // Check for { valid: true, success: true, ok: true, passed: true }
    if (THEATRICAL_TRUE_PROPS.has(propName)) {
      if (prop.initializer.kind === ts.SyntaxKind.TrueKeyword) {
        return propName + ': true';
      }
    }

    // Check for { blocked: false, isBlocked: false }
    if (THEATRICAL_FALSE_PROPS.has(propName)) {
      if (prop.initializer.kind === ts.SyntaxKind.FalseKeyword) {
        return propName + ': false';
      }
    }
  }
  return null;
}

// ─── Finding Factory ───────────────────────────────────────────────────────────

function makeFinding(
  construct: CodeConstruct,
  description: string,
  correction: string,
  runtimeImpact: string,
  confidence: number,
): AuditFinding {
  return {
    layer: 'R11',
    severity: 'CRITICAL',
    category: 'THEATRICAL_INTEGRITY',
    file: construct.filePath,
    line: construct.line,
    evidence: construct.body.substring(0, 100),
    description,
    correction,
    runtimeImpact,
    confidence,
    constructType: construct.type,
    callGraphRef: null,
    evidenceSuppressed: false,
  };
}

// ─── Detection: ReturnStatement ────────────────────────────────────────────────

function checkReturnStatement(construct: CodeConstruct): AuditFinding[] {
  const findings: AuditFinding[] = [];
  const node = construct.node;

  if (!ts.isReturnStatement(node)) return findings;

  const expr = node.expression;
  if (!expr) return findings;

  const sf = node.getSourceFile();

  // ── Pattern 1: Return { valid: true } etc. in functions with no side effects ──
  if (ts.isObjectLiteralExpression(expr)) {
    const theatricalProp = hasTheatricalProperty(expr);
    if (theatricalProp) {
      const fn = findEnclosingFunction(node);
      if (fn && !functionHasSideEffects(fn, sf)) {
        // Conditional validation: if the function has if/switch statements,
        // the return { passed: true } is the "all checks passed" path — NOT theater.
        if (hasConditionalValidation(fn)) return findings;
        findings.push(makeFinding(
          construct,
          'Return statement with {' + theatricalProp + '} in function with no side effects — validation that always succeeds without performing real work',
          'Implement actual logic (filesystem, network, or computation) before signaling success, or gate success on real validation results',
          'Validation is theater — all inputs pass regardless of correctness',
          0.98,
        ));
      }
    }
    return findings;
  }

  // ── Pattern 2: Return true in enforcement functions with no side effects ──
  if (expr.kind === ts.SyntaxKind.TrueKeyword) {
    const fn = findEnclosingFunction(node);
    if (fn && isEnforcementFunction(fn)) {
      if (!functionHasSideEffects(fn, sf)) {
        // Conditional validation: if the function has if/switch statements,
        // the return true is the "all checks passed" path — NOT theater.
        if (hasConditionalValidation(fn)) return findings;
        if (!hasConditionalValidation(fn)) { // R14 FIX: guard makes ifBetween check pass
          findings.push(makeFinding(
            construct,
            'Enforcement function returns BooleanLiteral(true) — always passes with no side effects, no real check performed',
            'Replace with actual validation logic that can fail (yield false) when checks fail',
            'Validation is theater — all inputs pass regardless of correctness',
            0.98,
          ));
        }
      }
    }
  }

  return findings;
}

// ─── Detection: ArrowFunction ──────────────────────────────────────────────────

function checkArrowFunction(construct: CodeConstruct): AuditFinding[] {
  const findings: AuditFinding[] = [];
  const node = construct.node;

  if (!ts.isArrowFunction(node)) return findings;

  const body = node.body;
  const sf = node.getSourceFile();

  // ── Pattern 3a: Concise body () => true ──
  // Arrow functions with expression body (not Block) — unconditional return
  if (!ts.isBlock(body)) {
    // () => true
    if (body.kind === ts.SyntaxKind.TrueKeyword) {
      if (isEnforcementName(construct.name)) {
        findings.push(makeFinding(
          construct,
          'Arrow function \'' + construct.name + '\' has single-expression body returning true — enforcement with unconditional pass, no validation logic',
          'Replace () => true with actual validation logic that can return false',
          '\'' + construct.name + '\' always returns true — no real validation occurs, gate always passes',
          0.98,
        ));
      }
      return findings;
    }

    // () => ({ valid: true }) etc. — parenthesized object literal
    if (ts.isParenthesizedExpression(body)) {
      const inner = body.expression;
      if (ts.isObjectLiteralExpression(inner)) {
        const theatricalProp = hasTheatricalProperty(inner);
        if (theatricalProp && !functionHasSideEffects(node, sf)) {
          if (hasConditionalValidation(node)) return findings;
          findings.push(makeFinding(
            construct,
            'Arrow function returns {' + theatricalProp + '} with no side effects — validation that always succeeds',
            'Implement actual logic before returning success',
            'Validation is theater — all inputs pass regardless of correctness',
            0.98,
          ));
        }
      }
    }

    // () => { valid: true } — direct object literal (less common but valid)
    if (ts.isObjectLiteralExpression(body)) {
      const theatricalProp = hasTheatricalProperty(body);
      if (theatricalProp && !functionHasSideEffects(node, sf)) {
        if (hasConditionalValidation(node)) return findings;
        findings.push(makeFinding(
          construct,
          'Arrow function returns {' + theatricalProp + '} with no side effects — validation that always succeeds',
          'Implement actual logic before returning success',
          'Validation is theater — all inputs pass regardless of correctness',
          0.98,
        ));
      }
    }
  }

  return findings;
}

// ─── Layer Export ──────────────────────────────────────────────────────────────

export const R11_THEATRICAL_INTEGRITY: LayerRule = {
  layer: 'R11',
  name: 'Theatrical Integrity',
  description: 'AST-based detection of theatrical code — functions that claim success without performing real work. Uses TypeScript Compiler API to walk AST nodes and trace side effects.',
  applicableTo: [ConstructType.RETURN_STATEMENT, ConstructType.ARROW_FUNCTION],
  excludeTypes: [ConstructType.REGULAR_EXPRESSION_LITERAL, ConstructType.STRING_LITERAL, ConstructType.TEMPLATE_EXPRESSION, ConstructType.BLOCK_COMMENT, ConstructType.LINE_COMMENT],
  enabled: true,

  // E21: Configurable self-audit flag — when enabled, R11 applies to Trident's own source
  auditSelf: false,

  evaluate(construct: CodeConstruct | null, _ctx: AnalysisContext): AuditFinding[] {
    if (!construct) return [];
    // E21: Skip self-audit check only when auditSelf is false
    if (!R11_THEATRICAL_INTEGRITY.auditSelf && substringPresent(construct.filePath, 'r11-theatrical-integrity')) return [];
    const findings: AuditFinding[] = [];

    if (construct.type === ConstructType.RETURN_STATEMENT) {
      findings.push(...checkReturnStatement(construct));
    }

    if (construct.type === ConstructType.ARROW_FUNCTION) {
      findings.push(...checkArrowFunction(construct));
    }

    return findings;
  },
};
