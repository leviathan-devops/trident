import * as ts from 'typescript';
import { LayerRule, CodeConstruct, AnalysisContext, AuditFinding, ConstructType } from '../types.ts';

// --- AST Walking Utilities ---

function walkAst(root: ts.Node, visitor: (node: ts.Node) => void): void {
  const stack: ts.Node[] = [root];
  while (stack.length > 0) {
    const current = stack.pop()!;
    visitor(current);
    ts.forEachChild(current, (child: ts.Node) => {
      stack.push(child);
    });
  }
}

function walkFunctionScope(body: ts.Block, visitor: (node: ts.Node) => void): void {
  function visit(node: ts.Node): void {
    visitor(node);
    if (
      node !== body &&
      (ts.isFunctionDeclaration(node) ||
        ts.isFunctionExpression(node) ||
        ts.isArrowFunction(node) ||
        ts.isMethodDeclaration(node))
    ) {
      return;
    }
    ts.forEachChild(node, visit);
  }
  ts.forEachChild(body, visit);
}

function getLineNumber(sourceFile: ts.SourceFile, node: ts.Node): number {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
}

function getFunctionBody(node: ts.Node): ts.Block | null {
  if (ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isMethodDeclaration(node)) {
    return node.body ?? null;
  }
  if (ts.isArrowFunction(node)) {
    return ts.isBlock(node.body) ? node.body : null;
  }
  return null;
}

// --- Return Type Analysis ---

function isVoidOrUndefinedReturnType(
  node: ts.Node,
  checker: ts.TypeChecker | null,
  fallback: string | null,
): boolean {
  let typeNode: ts.TypeNode | null = null;
  if (
    ts.isFunctionDeclaration(node) ||
    ts.isFunctionExpression(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isArrowFunction(node)
  ) {
    typeNode = node.type ?? null;
  }

  if (typeNode) {
    if (typeNode.kind === ts.SyntaxKind.VoidKeyword) return true;
    if (typeNode.kind === ts.SyntaxKind.UndefinedKeyword) return true;
    if (ts.isUnionTypeNode(typeNode)) {
      const allVoidOrUndefined = typeNode.types.every(
        (t: ts.TypeNode) =>
          t.kind === ts.SyntaxKind.VoidKeyword ||
          t.kind === ts.SyntaxKind.UndefinedKeyword,
      );
      if (allVoidOrUndefined) return true;
    }
  }

  if (checker) {
    try {
      const sig = checker.getSignatureFromDeclaration(node as ts.SignatureDeclaration);
      if (sig) {
        const retType = checker.getReturnTypeOfSignature(sig);
        const typeStr = checker.typeToString(retType);
        return typeStr === 'void' || typeStr === 'undefined';
      }
    } catch {
      // TypeChecker failed
    }
  }

  if (fallback) {
    const rt = fallback.trim();
    return rt === 'void' || rt === 'undefined';
  }

  return false;
}

// --- Logging Call Detection (AST) ---

function isLoggingCallExpression(call: ts.CallExpression): boolean {
  const expr = call.expression;
  if (!ts.isPropertyAccessExpression(expr)) return false;

  const methodName = expr.name.text;

  if (ts.isIdentifier(expr.expression) && expr.expression.text === 'console') {
    return ['log', 'error', 'warn', 'info', 'debug'].includes(methodName);
  }

  if (['error', 'warn', 'log', 'info', 'debug', 'fatal'].includes(methodName)) {
    return true;
  }

  return false;
}

// --- Enforcement Function Keyword Filter ---

function isEnforcementFunction(name: string): boolean {
  const lower = name.toLowerCase();
  const keywords = [
    'check', 'verify', 'validate', 'enforce', 'guard', 'gate', 'block',
    'isallowed', 'canproceed', 'isblocked', 'shouldblock',
    'authorize', 'permit', 'reject', 'filter', 'sanitize', 'transform',
    'restrict', 'require', 'assert', 'ensure', 'confirm',
    'authenticate', 'allow', 'deny',
  ];
  return keywords.some((en: string) => lower.includes(en));
}

// --- Call Site Lookup ---

interface CallSiteInfo {
  file: string;
  line: number;
  returnValueUsed: boolean;
}

function findCallSites(fnName: string, ctx: AnalysisContext): CallSiteInfo[] {
  const sites: CallSiteInfo[] = [];
  for (const [, entry] of ctx.callGraph.entries) {
    if (entry.calleeName === fnName || entry.calleeName.endsWith('.' + fnName)) {
      for (const cs of entry.callSites) {
        sites.push({
          file: cs.callSiteFile,
          line: cs.callSiteLine,
          returnValueUsed: cs.returnValueUsed,
        });
      }
    }
  }
  return sites;
}

// --- Indirect Invocation Detection (AST-based) ---

function isInvokedIndirectly(
  fnName: string,
  construct: CodeConstruct,
  ctx: AnalysisContext,
): boolean {
  if (isCalledViaThis(fnName, ctx)) return true;
  if (isXStateGuardReference(fnName, construct, ctx)) return true;
  if (isHookOrEventHandler(fnName, ctx)) return true;
  return false;
}

function isCalledViaThis(fnName: string, ctx: AnalysisContext): boolean {
  for (const c of ctx.constructs) {
    if (!c.node) continue;
    let found = false;
    walkAst(c.node, (child: ts.Node) => {
      if (found) return;
      if (
        ts.isPropertyAccessExpression(child) &&
        child.name.text === fnName &&
        child.expression.kind === ts.SyntaxKind.ThisKeyword
      ) {
        found = true;
      }
    });
    if (found) return true;
  }
  return false;
}

function isXStateGuardReference(
  fnName: string,
  construct: CodeConstruct,
  ctx: AnalysisContext,
): boolean {
  for (const c of ctx.constructs) {
    if (!c.node) continue;
    let found = false;
    const sf = c.node.getSourceFile();
    walkAst(c.node, (child: ts.Node) => {
      if (found) return;
      if (ts.isPropertyAssignment(child)) {
        const propName = child.name.getText(sf);
        if (
          (propName === 'guard' || propName === 'cond') &&
          ts.isIdentifier(child.initializer) &&
          child.initializer.text === fnName
        ) {
          found = true;
        }
      }
    });
    if (found) return true;
  }

  const parentNode = construct.parent?.node;
  if (parentNode) {
    const parentSf = parentNode.getSourceFile();
    let hasXStateKey = false;
    walkAst(parentNode, (child: ts.Node) => {
      if (hasXStateKey) return;
      if (ts.isPropertyAssignment(child)) {
        const name = child.name.getText(parentSf);
        if (name === 'guard' || name === 'cond' || name === 'always' || name === 'target') {
          hasXStateKey = true;
        }
      }
    });
    if (hasXStateKey) return true;
  }

  return false;
}

function isHookOrEventHandler(fnName: string, ctx: AnalysisContext): boolean {
  for (const c of ctx.constructs) {
    if (!c.node) continue;
    let found = false;
    walkAst(c.node, (child: ts.Node) => {
      if (found) return;

      if (ts.isPropertyAssignment(child)) {
        if (
          (ts.isStringLiteral(child.name) ||
            ts.isNoSubstitutionTemplateLiteral(child.name)) &&
          ts.isIdentifier(child.initializer) &&
          child.initializer.text === fnName
        ) {
          found = true;
        }
      }

      if (ts.isCallExpression(child)) {
        const args = child.arguments;
        if (
          ts.isPropertyAccessExpression(child.expression) &&
          args.length >= 2 &&
          ts.isStringLiteral(args[0]) &&
          ts.isIdentifier(args[1]) &&
          args[1].text === fnName
        ) {
          found = true;
        }
      }
    });
    if (found) return true;
  }
  return false;
}

// --- Detection 1: Dead Enforcement Function ---

function detectDeadEnforcementFunction(
  construct: CodeConstruct,
  ctx: AnalysisContext,
): AuditFinding[] {
  const fnName = construct.name;
  if (!isEnforcementFunction(fnName)) return [];

  if (construct.type === ConstructType.ARROW_FUNCTION) {
    const parentType = construct.parent?.type;
    if (
      parentType &&
      parentType !== ConstructType.VARIABLE_DECLARATION &&
      parentType !== ConstructType.PROPERTY_ASSIGNMENT
    ) {
      return [];
    }
  }

  const callSites = findCallSites(fnName, ctx);
  const isExported = construct.modifiers.includes('export');
  const isPrivate =
    construct.modifiers.includes('private') || construct.modifiers.includes('protected');
  const callGraphSize = ctx.callGraph.entries.size;
  const callGraphReliable = callGraphSize >= 50;

  if (isPrivate) return [];

  if (callSites.length === 0 && !isExported && isInvokedIndirectly(fnName, construct, ctx)) {
    return [];
  }

  if (callSites.length === 0 && !isExported) {
    const confidence = callGraphReliable ? 0.98 : 0.50;
    return [{
      layer: 'R10',
      severity: callGraphReliable ? 'CRITICAL' : 'MEDIUM',
      category: 'INVOCATION_INTEGRITY',
      file: construct.filePath,
      line: construct.line,
      evidence: 'Function ' + fnName + ' has 0 call sites and is not exported (call graph: ' + callGraphSize + ' entries)',
      description: 'Enforcement function "' + fnName + '" is never called — dead code that provides no protection',
      correction: 'Add calls to ' + fnName + '() at enforcement points, or remove if unused',
      runtimeImpact: 'Enforcement exists in source but never executes — provides zero runtime protection',
      confidence,
      constructType: construct.type,
      callGraphRef: null,
      evidenceSuppressed: false,
    }];
  }

  if (callSites.length > 0 && callGraphReliable) {
    const allDiscarded = callSites.every((cs: CallSiteInfo) => !cs.returnValueUsed);
    const returnsVoidOrUndefined = isVoidOrUndefinedReturnType(
      construct.node,
      ctx.checker,
      construct.returnType,
    );
    if (allDiscarded && !returnsVoidOrUndefined) {
      return [{
        layer: 'R10',
        severity: 'HIGH',
        category: 'INVOCATION_INTEGRITY',
        file: construct.filePath,
        line: construct.line,
        evidence: fnName + '() called ' + callSites.length + ' times — return value discarded at every call site',
        description: 'Enforcement function "' + fnName + '" returns a value but it is never checked — result ignored',
        correction: 'Capture and check the return value: const result = ' + fnName + '(); if (!result.valid) ...',
        runtimeImpact: 'Enforcement function runs but its verdict is ignored — same as not running it',
        confidence: 0.85,
        constructType: construct.type,
        callGraphRef: null,
        evidenceSuppressed: false,
      }];
    }
  }

  return [];
}

// --- Detection 2-5: Return Type Violations ---

function detectReturnTypeViolations(
  construct: CodeConstruct,
  ctx: AnalysisContext,
  node: ts.Node,
): AuditFinding[] {
  const findings: AuditFinding[] = [];
  const checker = ctx.checker;
  const fnBody = getFunctionBody(node);
  if (!fnBody) return findings;

  const returnsVoidOrUndefined = isVoidOrUndefinedReturnType(
    node,
    checker,
    construct.returnType,
  );
  if (returnsVoidOrUndefined) return findings;

  const returnStatements: ts.ReturnStatement[] = [];
  walkFunctionScope(fnBody, (child: ts.Node) => {
    if (ts.isReturnStatement(child)) {
      returnStatements.push(child);
    }
  });

  const sf = node.getSourceFile();

  // Missing return on non-void function
  if (returnStatements.length === 0) {
    findings.push({
      layer: 'R10',
      severity: 'HIGH',
      category: 'INVOCATION_INTEGRITY',
      file: construct.filePath,
      line: construct.line,
      evidence: 'Function ' + construct.name + ' has non-void return type but no ReturnStatement in body',
      description: 'Function "' + construct.name + '" declares a non-void return type but never returns a value',
      correction: 'Add a return statement with the appropriate value',
      runtimeImpact: 'Function returns undefined implicitly despite declaring a value return type',
      confidence: 0.90,
      constructType: construct.type,
      callGraphRef: null,
      evidenceSuppressed: false,
    });
    return findings;
  }

  // Return undefined on non-void
  for (const ret of returnStatements) {
    if (!ret.expression) {
      findings.push({
        layer: 'R10',
        severity: 'HIGH',
        category: 'INVOCATION_INTEGRITY',
        file: construct.filePath,
        line: getLineNumber(sf, ret),
        evidence: 'ReturnStatement with no expression in non-void function ' + construct.name,
        description: 'Function "' + construct.name + '" returns undefined via bare return despite non-void return type',
        correction: 'Return the expected value instead of a bare return;',
        runtimeImpact: 'Callers receive undefined instead of the expected typed value',
        confidence: 0.88,
        constructType: construct.type,
        callGraphRef: null,
        evidenceSuppressed: false,
      });
    }
  }

  // Inconsistent return types
  if (checker && returnStatements.length > 1) {
    const typeStrings = new Set<string>();
    for (const ret of returnStatements) {
      if (ret.expression) {
        try {
          const type = checker.getTypeAtLocation(ret.expression);
          typeStrings.add(checker.typeToString(type));
        } catch {
          // skip
        }
      }
    }
    if (typeStrings.size > 1) {
      findings.push({
        layer: 'R10',
        severity: 'MEDIUM',
        category: 'INVOCATION_INTEGRITY',
        file: construct.filePath,
        line: construct.line,
        evidence: 'Function ' + construct.name + ' returns inconsistent types: ' + Array.from(typeStrings).join(', '),
        description: 'Function "' + construct.name + '" has multiple return statements with different types',
        correction: 'Ensure all return statements return the same type',
        runtimeImpact: 'Type contract violation — callers may receive unexpected types',
        confidence: 0.75,
        constructType: construct.type,
        callGraphRef: null,
        evidenceSuppressed: false,
      });
    }
  }

  return findings;
}

// --- Detection 6-7: Catch Block Violations ---

function detectCatchBlockViolations(
  construct: CodeConstruct,
  node: ts.Node,
): AuditFinding[] {
  const findings: AuditFinding[] = [];
  const fnBody = getFunctionBody(node);
  if (!fnBody) return findings;

  const sf = node.getSourceFile();

  walkFunctionScope(fnBody, (child: ts.Node) => {
    if (!ts.isCatchClause(child)) return;

    const catchBlock = child.block;

    // Empty catch block
    if (catchBlock.statements.length === 0) {
      findings.push({
        layer: 'R10',
        severity: 'HIGH',
        category: 'INVOCATION_INTEGRITY',
        file: construct.filePath,
        line: getLineNumber(sf, child),
        evidence: 'CatchClause with empty block (0 statements)',
        description: 'Empty catch block silently swallows errors',
        correction: 'Add error handling: log, rethrow, or handle the caught error',
        runtimeImpact: 'Errors are silently swallowed — failures become invisible',
        confidence: 0.92,
        constructType: ConstructType.CATCH_CLAUSE,
        callGraphRef: null,
        evidenceSuppressed: false,
      });
      return;
    }

    // Throw inside catch without rethrow/log
    const throwStatements: ts.ThrowStatement[] = [];
    let hasLoggingCall = false;

    for (const stmt of catchBlock.statements) {
      walkAst(stmt, (inner: ts.Node) => {
        if (ts.isThrowStatement(inner)) {
          throwStatements.push(inner);
        }
        if (ts.isCallExpression(inner) && isLoggingCallExpression(inner)) {
          hasLoggingCall = true;
        }
      });
    }

    if (throwStatements.length > 0 && !hasLoggingCall) {
      const hasNewErrorThrow = throwStatements.some((t: ts.ThrowStatement) => {
        if (t.expression && ts.isNewExpression(t.expression)) {
          return true;
        }
        return false;
      });

      if (hasNewErrorThrow) {
        findings.push({
          layer: 'R10',
          severity: 'MEDIUM',
          category: 'INVOCATION_INTEGRITY',
          file: construct.filePath,
          line: getLineNumber(sf, child),
          evidence: 'CatchClause throws new error without logging original context',
          description: 'Error is caught and replaced with a new throw — original context is lost',
          correction: 'Log the original error before rethrowing, or rethrow the caught error directly',
          runtimeImpact: 'Original error context is lost — debugging becomes harder',
          confidence: 0.70,
          constructType: ConstructType.CATCH_CLAUSE,
          callGraphRef: null,
          evidenceSuppressed: false,
        });
      }
    }
  });

  return findings;
}

// --- Layer Rule ---

export const R10_INVOCATION_INTEGRITY: LayerRule = {
  layer: 'R10',
  name: 'Invocation Integrity',
  description:
    'Detects dead enforcement functions, empty catch blocks, inconsistent return types, ' +
    'missing returns, swallowed errors, and discarded return values via TypeScript AST analysis',
  applicableTo: [
    ConstructType.FUNCTION_DECLARATION,
    ConstructType.METHOD_DECLARATION,
    ConstructType.ARROW_FUNCTION,
  ],
  enabled: true,

  evaluate(construct: CodeConstruct | null, ctx: AnalysisContext): AuditFinding[] {
    if (!construct) return [];
    if (!construct.isDefinition) return [];

    try {
      const findings: AuditFinding[] = [];

      const deadCodeFindings = detectDeadEnforcementFunction(construct, ctx);
      findings.push(...deadCodeFindings);

      const node = construct.node;
      if (!node) return findings;

      const returnTypeFindings = detectReturnTypeViolations(construct, ctx, node);
      findings.push(...returnTypeFindings);

      const catchFindings = detectCatchBlockViolations(construct, node);
      findings.push(...catchFindings);

      return findings;
    } catch (e) {
      console.error('[R10InvocationIntegrity]', e);
      return [];
    }
  },
};
