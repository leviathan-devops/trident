import * as ts from 'typescript';
import { LayerRule, CodeConstruct, AnalysisContext, AuditFinding, ConstructType } from '../types.ts';

/**
 * R4: Error Handling — AST-Based Analysis (Order 2)
 * 
 * Uses TypeScript Compiler API to walk the AST instead of regex/text matching.
 * This eliminates false positives from string literals, template expressions, and comments.
 * 
 * Per Runtime Grade Semantic Software Engineering Bible §5.1:
 * "Zero Regex on program code for semantic violation detection."
 * Per §7.2:
 * "Use the AST structure directly. No regex needed."
 */
export const R4_ERROR_HANDLING: LayerRule = {
  layer: 'R4',
  name: 'Error Handling (AST)',
  description: 'AST-based detection of error handling gaps, empty catch blocks, and theatrical success signals',
  applicableTo: [ConstructType.CATCH_CLAUSE],
  excludeTypes: [ConstructType.STRING_LITERAL, ConstructType.TEMPLATE_EXPRESSION, ConstructType.REGULAR_EXPRESSION_LITERAL, ConstructType.BLOCK_COMMENT, ConstructType.LINE_COMMENT],
  enabled: true,

  evaluate(construct: CodeConstruct | null, ctx: AnalysisContext): AuditFinding[] {
    if (!construct || !construct.node) return [];
    const node = construct.node;
    if (!ts.isCatchClause(node)) return [];
    
    const findings: AuditFinding[] = [];
    const block = node.block;
    const body = construct.body; // Used ONLY for evidence display, never for detection
    const statementCount = block.statements.length;

    // ═══ CHECK 1: Empty catch block ═══
    // AST: block.statements.length === 0 (not regex text stripping)
    if (statementCount === 0) {
      findings.push({
        layer: 'R4',
        severity: 'CRITICAL',
        category: 'ERROR_HANDLING',
        file: construct.filePath,
        line: construct.line,
        evidence: body.substring(0, 80),
        description: 'Empty catch block — errors silently swallowed with no logging',
        correction: 'Add at minimum: console.error("[Component] operation failed:", err);',
        runtimeImpact: 'When this error occurs, there is ZERO evidence — failures are invisible, debugging impossible',
        confidence: 0.98,
        constructType: construct.type,
        callGraphRef: null,
        evidenceSuppressed: false,
      });
      return findings;
    }

    // ═══ CHECK 2: Silent catch (no logging AND no throw) ═══
    // AST: Walk block for CallExpression nodes accessing console.error/warn/log or tridentLog
    //      Walk block for ThrowStatement nodes
    //      Walk block for ReturnStatement nodes with a value (error indicator)
    const hasLogging = hasLoggingCall(block);
    const hasThrow = hasThrowStatement(block);
    const hasReturnValue = hasReturnWithValue(block);

    if (!hasLogging && !hasThrow && !hasReturnValue) {
      findings.push({
        layer: 'R4',
        severity: 'MEDIUM',
        category: 'ERROR_HANDLING',
        file: construct.filePath,
        line: construct.line,
        evidence: body.substring(0, 80),
        description: 'Catch block contains no logging or re-throw — error is silently consumed',
        correction: 'Add console.error("[Component] failed:", err); or re-throw if critical',
        runtimeImpact: 'Error silently consumed — caller thinks operation succeeded, state may be inconsistent',
        confidence: 0.85,
        constructType: construct.type,
        callGraphRef: null,
        evidenceSuppressed: false,
      });
    }

    // ═══ CHECK 3: Theatrical success signal in catch ═══
    // AST: Walk block for ReturnStatement nodes with success-pattern expressions
    const successSignal = detectSuccessSignal(block);
    if (successSignal) {
      findings.push({
        layer: 'R4',
        severity: 'CRITICAL',
        category: 'ERROR_HANDLING',
        file: construct.filePath,
        line: construct.line,
        evidence: successSignal,
        description: `Catch block returns success signal (${successSignal}) — error caught and function reports success`,
        correction: 'Return an error indicator or re-throw. Errors should not produce success signals.',
        runtimeImpact: 'Failed operations report success — callers believe the operation succeeded when it did not',
        confidence: 0.95,
        constructType: construct.type,
        callGraphRef: null,
        evidenceSuppressed: false,
      });
    }

    // ═══ CHECK 4: "non-critical" comment in catch ═══
    // TEXT-BASED: Comments are not in the AST, so text matching IS the correct approach here.
    // Per Bible §5.2 Exception: regex on non-code data is acceptable.
    // Use ts.getLeadingCommentRanges()/getTrailingCommentRanges() for the catch clause to avoid matching strings.
    const sf = node.getSourceFile();
    const fullText = sf.text;
    const leadingRanges = ts.getLeadingCommentRanges(fullText, node.getFullStart()) ?? [];
    const trailingRanges = ts.getTrailingCommentRanges(fullText, node.getEnd()) ?? [];
    const allCommentText = [...leadingRanges, ...trailingRanges]
      .map((r: ts.CommentRange) => fullText.substring(r.pos, r.end))
      .join(' ');
    // Also check comments inside the block's statements
    const innerComments = extractCommentText(block);
    const allComments = allCommentText + ' ' + innerComments;
    
    if (allComments.includes('non-critical') || allComments.includes('non critical')) {
      findings.push({
        layer: 'R4',
        severity: 'CRITICAL',
        category: 'ERROR_HANDLING',
        file: construct.filePath,
        line: construct.line,
        evidence: body.substring(0, 80),
        description: 'Catch block marked "non-critical" — errors classified as non-critical without evidence',
        correction: 'If the operation can fail without consequence, prove it with evidence. Otherwise, treat it as a real error.',
        runtimeImpact: 'Catastrophic failures classified as "non-critical" — system continues in corrupted state',
        confidence: 0.95,
        constructType: construct.type,
        callGraphRef: null,
        evidenceSuppressed: false,
      });
    }

    return findings;
  },
};

// ═══════════════════════════════════════════════════════
// AST Walker Helper Functions (Order 2 Analysis)
// ═══════════════════════════════════════════════════════

/**
 * Walk AST children to find console.error/warn/log or tridentLog calls.
 * This replaces `body.includes('console.error')` which matches strings.
 */
function hasLoggingCall(startNode: ts.Node): boolean {
  let found = false;
  function visit(child: ts.Node) {
    if (found) return;
    if (ts.isCallExpression(child)) {
      const expr = child.expression;
      // Check for console.error/warn/log
      if (ts.isPropertyAccessExpression(expr)) {
        const obj = expr.expression;
        const method = expr.name.text;
        if (obj.getText() === 'console' && ['error', 'warn', 'log'].includes(method)) {
          found = true;
          return;
        }
        // Check for ctx.log.error(), tiLog.warn(), logger.error(), etc.
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
      // Check for tridentLog() or tiLog() calls
      if (ts.isIdentifier(expr) && ['tridentLog', 'tiLog', 'tiWarn', 'tiError', 'log'].includes(expr.text)) {
        found = true;
        return;
      }
    }
    ts.forEachChild(child, visit);
  }
  ts.forEachChild(startNode, visit);
  return found;
}

/**
 * Walk AST children to find ThrowStatement nodes.
 * This replaces `body.includes('throw')` which matches strings/comments.
 */
function hasThrowStatement(startNode: ts.Node): boolean {
  let found = false;
  function visit(child: ts.Node) {
    if (found) return;
    if (ts.isThrowStatement(child)) {
      found = true;
      return;
    }
    ts.forEachChild(child, visit);
  }
  ts.forEachChild(startNode, visit);
  return found;
}

/**
 * Walk AST children to find ReturnStatement nodes that return a value.
 * A catch block that returns a value (e.g., return { verified: false })
 * IS propagating an error indicator to the caller — this is valid error
 * handling, not silent swallowing.
 */
function hasReturnWithValue(startNode: ts.Node): boolean {
  let found = false;
  function visit(child: ts.Node) {
    if (found) return;
    if (ts.isReturnStatement(child) && child.expression) {
      // Return with a value — caller receives the error indicator
      found = true;
      return;
    }
    ts.forEachChild(child, visit);
  }
  ts.forEachChild(startNode, visit);
  return found;
}

/**
 * Walk AST to detect ReturnStatement nodes that return success signals.
 * Checks for:
 * - return { success: true } / { passed: true } / { valid: true } / { outcome: 'ok' }
 * - return true
 * - return 1
 * - return "pass"
 * 
 * This replaces regex patterns that match these in string literals.
 */
function detectSuccessSignal(startNode: ts.Node): string | null {
  let result: string | null = null;
  function visit(child: ts.Node) {
    if (result) return;
    if (ts.isReturnStatement(child) && child.expression) {
      const expr = child.expression;
      const text = expr.getText();
      
      // Check for object literal with success property
      if (ts.isObjectLiteralExpression(expr)) {
        for (const prop of expr.properties) {
          if (ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name)) {
            const propName = prop.name.text;
            const init = prop.initializer;
            if (init) {
              // { success/passed/valid: true }
              if (['success', 'passed', 'valid'].includes(propName) && init.kind === ts.SyntaxKind.TrueKeyword) {
                result = `return { ${propName}: true }`;
                return;
              }
              // { outcome: 'ok' } / { outcome: 'completed' }
              if (propName === 'outcome' && ts.isStringLiteral(init) && ['ok', 'completed', 'done', 'pass'].includes(init.text)) {
                result = `return { outcome: '${init.text}' }`;
                return;
              }
            }
          }
        }
      }
      
      // Check for return true (BooleanLiteral)
      if (expr.kind === ts.SyntaxKind.TrueKeyword) {
        result = 'return true';
        return;
      }
      
      // Check for return 1 (NumericLiteral)
      if (ts.isNumericLiteral(expr) && expr.text === '1') {
        result = 'return 1';
        return;
      }
      
      // Check for return "pass" (StringLiteral)
      if (ts.isStringLiteral(expr) && expr.text === 'pass') {
        result = 'return "pass"';
        return;
      }
    }
    ts.forEachChild(child, visit);
  }
  ts.forEachChild(startNode, visit);
  return result;
}

/**
 * Extract comment text from within a block of code.
 * Uses TypeScript's comment range APIs to get actual comments, not strings.
 */
function extractCommentText(node: ts.Node): string {
  const comments: string[] = [];
  const sf = node.getSourceFile();
  const fullText = sf.text;
  
  function visit(child: ts.Node) {
    // Get leading comments
    const leading = ts.getLeadingCommentRanges(fullText, child.getFullStart()) ?? [];
    for (const range of leading) {
      comments.push(fullText.substring(range.pos, range.end));
    }
    // Get trailing comments
    const trailing = ts.getTrailingCommentRanges(fullText, child.getEnd()) ?? [];
    for (const range of trailing) {
      comments.push(fullText.substring(range.pos, range.end));
    }
    ts.forEachChild(child, visit);
  }
  ts.forEachChild(node, visit);
  return comments.join(' ');
}
