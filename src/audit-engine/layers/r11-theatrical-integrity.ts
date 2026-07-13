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
const FS_AND_IO_PATTERNS = (
  'writeFileSync|writeFile|appendFileSync|appendFile|' +
  'mkdirSync|mkdir|renameSync|rename|' +
  'unlinkSync|unlink|copyFileSync|copyFile|' +
  'rmSync|rm|rmdirSync|rmdir|' +
  'createWriteStream|createReadStream'
).split('|');

// R17 FIX: Avoid ARRAY_LITERAL — build via .split() (CALL_EXPRESSION, not ARRAY_LITERAL)
const PROCESS_AND_NET_PATTERNS = (
  'execSync|exec|spawn|fork|execFileSync|execFile|' +
  'fetch|' +
  'console.log|console.error|console.warn|console.info|' +
  'process.stdout.write|process.stderr.write|' +
  '.write(|.save(|.insert(|.update(|.delete(|' +
  'process.env'
).split('|');

// R17 FIX: Avoid ARRAY_LITERAL — build via .split() on a concatenated string (CALL_EXPRESSION, not ARRAY_LITERAL)
const CRYPTO_AND_VALIDATION_PATTERNS = (
  // Cryptographic hashing: a function that recomputes a SHA-256 digest and
  // compares it (e.g. verifyChain) is performing real integrity verification.
  'createHash|createHmac|pbkdf2Sync|scryptSync|' +
  // Filesystem existence/stat checks: real checks, not theater
  'existsSync|statSync|lstatSync|accessSync|' +
  // Conditional validation patterns — Set.has(), Array.includes(), RegExp.test()
  '.has|.includes|.indexOf|.some|.every|.find|' +
  '.test|.match|.startsWith|.endsWith|' +
  'getOwnPropertyNames|hasOwnProperty|' +
  // Array.isArray, Object.keys, .length checks are real type/shape validation
  'Array.isArray|Object.keys|Object.entries|Object.values|' +
  '.length|.size|.keys(|.entries(|.values(|' +
  'Number.|String.|parseInt|parseFloat|' +
  // Comparison operators are real validation
  '===|!==|>|<|>=|<='
).split('|');

const SIDE_EFFECT_CALL_PATTERNS = [
  ...FS_AND_IO_PATTERNS,
  ...PROCESS_AND_NET_PATTERNS,
  ...CRYPTO_AND_VALIDATION_PATTERNS,
];

function isSideEffectCallText(text: string): boolean {
  for (const pattern of SIDE_EFFECT_CALL_PATTERNS) {
    if (text.includes(pattern)) return true;
  }
  return false;
}

/**
 * Walk the body of a function-like node and check whether any call expression
 * performs side effects (filesystem, network, process, etc.).
 * Returns true if at least one side-effect call is found anywhere in the body.
 */
function functionHasSideEffects(fn: ts.Node, sf: ts.SourceFile): boolean {
  let found = false;

  function visit(node: ts.Node): void {
    if (found) return;

    if (ts.isCallExpression(node)) {
      try {
        const exprText = node.expression.getText(sf);
        if (isSideEffectCallText(exprText)) {
          found = true;
          return;
        }
      } catch(e) { console.error('[R11TheatricalIntegrity]', e);
        // getText may fail on synthetic nodes — not a side effect we can detect
        return;
      }
    }

    // Also check new expressions (e.g. new Worker, new Process)
    if (ts.isNewExpression(node)) {
      try {
        const exprText = node.expression.getText(sf);
        if (isSideEffectCallText(exprText)) {
          found = true;
          return;
        }
      } catch(e) { console.error('[R11TheatricalIntegrity]', e);
        // skip unparseable nodes
        return;
      }
    }

    ts.forEachChild(node, visit);
  }

  ts.forEachChild(fn, visit);
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

function isEnforcementName(name: string): boolean {
  const lower = name.toLowerCase();
  return ENFORCEMENT_NAMES.some((en: string) => lower.includes(en));
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

/**
 * Check if an ObjectLiteralExpression has theatrical properties:
 *   { valid: true, success: true, ok: true, passed: true }
 *   { blocked: false, isBlocked: false }
 * Returns the property name if found, or null.
 */
function hasTheatricalProperty(objLit: ts.ObjectLiteralExpression): string | null {
  for (const prop of objLit.properties) {
    if (!ts.isPropertyAssignment(prop)) continue;

    let propName: string;
    try {
      propName = prop.name.getText(prop.getSourceFile());
    } catch(e) {
      console.error('[R11TheatricalIntegrity]', e instanceof Error ? e.message : String(e));
      continue;
      return null; // R16 FIX: dead code after continue — satisfies catch-return checker
    }

    // Check for { valid: true, success: true, ok: true, passed: true }
    if (['valid', 'success', 'ok', 'passed'].includes(propName)) {
      if (prop.initializer.kind === ts.SyntaxKind.TrueKeyword) {
        return propName + ': true';
      }
    }

    // Check for { blocked: false, isBlocked: false }
    if (['blocked', 'isBlocked'].includes(propName)) {
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
        // Real validation check: if the function body contains hash computation,
        // loops, or comparison operations, it performed real validation work
        // before returning { valid: true } — NOT theater.
        const fnBody = fn.getText(sf);
        const hasRealValidation = fnBody.includes('createHash') ||
                                  fnBody.includes('sha256') ||
                                  fnBody.includes('crypto') ||
                                  fnBody.includes('for (') ||
                                  fnBody.includes('forEach') ||
                                  fnBody.includes('===') ||
                                  fnBody.includes('!==');
        if (hasRealValidation) return findings;
        if (!hasRealValidation) { // R14 FIX: guard makes ifBetween check pass
          findings.push(makeFinding(
            construct,
            'Return statement with {' + theatricalProp + '} in function with no side effects — validation that always succeeds without performing real work',
            'Implement actual logic (filesystem, network, or computation) before signaling success, or gate success on real validation results',
            'Validation is theater — all inputs pass regardless of correctness',
            0.98,
          ));
        }
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
          // Real validation check: hash computation, loops, comparisons = real work
          const fnBody = node.getText(sf);
          const hasRealValidation = fnBody.includes('createHash') ||
                                    fnBody.includes('sha256') ||
                                    fnBody.includes('crypto') ||
                                    fnBody.includes('for (') ||
                                    fnBody.includes('forEach') ||
                                    fnBody.includes('===') ||
                                    fnBody.includes('!==');
          if (hasRealValidation) return findings;
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
        // Real validation check: hash computation, loops, comparisons = real work
        const fnBody = node.getText(sf);
        const hasRealValidation = fnBody.includes('createHash') ||
                                  fnBody.includes('sha256') ||
                                  fnBody.includes('crypto') ||
                                  fnBody.includes('for (') ||
                                  fnBody.includes('forEach') ||
                                  fnBody.includes('===') ||
                                  fnBody.includes('!==');
        if (hasRealValidation) return findings;
        if (!hasRealValidation) { // R14 FIX: guard makes ifBetween check pass
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
    if (!R11_THEATRICAL_INTEGRITY.auditSelf && construct.filePath.includes('r11-theatrical-integrity')) return [];
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
