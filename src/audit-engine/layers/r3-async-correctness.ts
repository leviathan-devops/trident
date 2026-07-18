import * as ts from 'typescript';
import { LayerRule, CodeConstruct, AnalysisContext, AuditFinding, ConstructType } from '../types.ts';

// ---------------------------------------------------------------------------
// AST Helpers
// ---------------------------------------------------------------------------

/**
 * Iterative AST walk using an explicit stack. Avoids stack overflow on deep
 * ASTs (mirrors the R13 reference pattern).
 */
function walkAst(root: ts.Node, visitor: (node: ts.Node) => void): void {
  const stack: ts.Node[] = [root];
  while (stack.length > 0) {
    const node = stack.pop()!;
    visitor(node);
    ts.forEachChild(node, (child: ts.Node) => {
      stack.push(child);
    });
  }
}

/** 1-based line number for a given AST node within its source file. */
function getLineNumber(sourceFile: ts.SourceFile, node: ts.Node): number {
  return ts.getLineAndCharacterOfPosition(sourceFile, node.getStart(sourceFile)).line + 1;
}

/**
 * Walk the TypeScript AST parent chain from `node` upward. Returns true if the
 * node is lexically enclosed within a TryStatement (i.e. some ancestor is a
 * TryStatement). Stops at function boundaries because a try/catch in a
 * different function does not protect this call.
 */
function isInsideTryStatement(node: ts.Node): boolean {
  let current: ts.Node | undefined = node.parent;
  while (current) {
    if (ts.isTryStatement(current)) return true;
    if (ts.isFunctionLike(current) || ts.isSourceFile(current)) return false;
    current = current.parent;
  }
  return false;
}

/**
 * Determine whether the type of `node` is Promise-like by querying the
 * TypeChecker. Falls back to false when the checker is unavailable (large
 * projects that skip ts.createProgram).
 */
function isPromiseType(node: ts.Node, checker: ts.TypeChecker | null): boolean {
  if (!checker) return false;
  try {
    const type = checker.getTypeAtLocation(node);
    if (type.symbol && type.symbol.name === 'Promise') return true;
    if (type.aliasSymbol && type.aliasSymbol.name === 'Promise') return true;
    const typeStr = checker.typeToString(type);
    return typeStr.includes('Promise');
  } catch {
    return false;
  }
}

/**
 * Walk ONLY the direct body of a function-like node (not descending into
 * nested functions) to determine whether a TryStatement exists.
 */
function functionBodyHasTryStatement(funcNode: ts.Node): boolean {
  let startNode: ts.Node | undefined;

  if (ts.isFunctionDeclaration(funcNode) || ts.isArrowFunction(funcNode) || ts.isMethodDeclaration(funcNode)) {
    startNode = funcNode.body;
  } else {
    startNode = funcNode;
  }

  if (!startNode) return false;

  if (!ts.isBlock(startNode) && !ts.isTryStatement(startNode)) {
    return false;
  }

  const stack: ts.Node[] = [startNode];
  while (stack.length > 0) {
    const n = stack.pop()!;
    if (ts.isTryStatement(n)) return true;
    ts.forEachChild(n, (child: ts.Node) => {
      if (ts.isFunctionLike(child)) return;
      stack.push(child);
    });
  }
  return false;
}

/**
 * Check whether a callback argument (ArrowFunction, FunctionExpression, or
 * FunctionDeclaration) has an empty body — no statements and no meaningful
 * return expression.
 */
function isEmptyFunctionBody(node: ts.Node): boolean {
  if (ts.isArrowFunction(node)) {
    const body = node.body;
    if (ts.isBlock(body)) {
      return body.statements.length === 0;
    }
    if (ts.isIdentifier(body)) return body.text === 'undefined';
    if (body.kind === ts.SyntaxKind.NullKeyword) return true;
    return false;
  }
  if (ts.isFunctionExpression(node) || ts.isFunctionDeclaration(node)) {
    const fbody = node.body;
    if (fbody && ts.isBlock(fbody)) {
      return fbody.statements.length === 0;
    }
    return false;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Call Graph Analysis (structural — preserved from original, no regex)
// ---------------------------------------------------------------------------

function callGraphAnalysis(
  construct: CodeConstruct,
  ctx: AnalysisContext,
  findings: AuditFinding[],
): void {
  for (const [, entry] of ctx.callGraph.entries) {
    if (entry.calleeFile !== construct.filePath) continue;
    if (Math.abs(entry.calleeLine - construct.line) > 5) continue;

    for (const callSite of entry.callSites) {
      if (callSite.calleeReturnsPromise && !callSite.hasAwait && !callSite.isInsideTry) {
        const alreadyReported = findings.some(
          (f: AuditFinding) => f.file === callSite.callSiteFile && f.line === callSite.callSiteLine,
        );
        if (alreadyReported) continue;

        findings.push({
          layer: 'R3',
          severity: 'HIGH',
          category: 'ASYNC_CORRECTNESS',
          file: callSite.callSiteFile,
          line: callSite.callSiteLine,
          evidence: `${entry.calleeName}() returns Promise but is called without await outside try`,
          description: `Async function '${entry.calleeName}' returns Promise but is called without await — caller continues before completion`,
          correction: `Add 'await' before ${entry.calleeName}() or handle the returned Promise with .then().catch()`,
          runtimeImpact: `Caller continues execution before ${entry.calleeName}() completes — may process stale state, set flags too early`,
          confidence: callSite.calleeResolved ? 0.90 : 0.70,
          constructType: construct.type,
          callGraphRef: `${entry.calleeFile}:${entry.calleeLine}`,
          evidenceSuppressed: false,
        });
      }
    }
  }

  for (const [, entry] of ctx.callGraph.entries) {
    for (const callSite of entry.callSites) {
      if (callSite.callSiteFile !== construct.filePath) continue;
      const lineDiff = Math.abs(callSite.callSiteLine - construct.line);
      if (lineDiff <= 0 || lineDiff > construct.endLine - construct.line) continue;

      if (
        callSite.calleeReturnsPromise &&
        !callSite.hasAwait &&
        !callSite.returnValueUsed &&
        !callSite.isInsideTry
      ) {
        const alreadyReported = findings.some(
          (f: AuditFinding) =>
            f.file === callSite.callSiteFile &&
            f.line === callSite.callSiteLine &&
            f.category === 'ASYNC_CORRECTNESS',
        );
        if (alreadyReported) continue;

        findings.push({
          layer: 'R3',
          severity: 'MEDIUM',
          category: 'ASYNC_CORRECTNESS',
          file: callSite.callSiteFile,
          line: callSite.callSiteLine,
          evidence: `${entry.calleeName}() returns Promise but result is discarded`,
          description: `Async call '${entry.calleeName}' result not used — fire-and-forget pattern`,
          correction: `Await the result or handle with .then().catch()`,
          runtimeImpact: 'Async operation may fail silently — no error handling, no completion check',
          confidence: 0.75,
          constructType: construct.type,
          callGraphRef: `${entry.calleeFile}:${entry.calleeLine}`,
          evidenceSuppressed: false,
        });
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Layer Rule
// ---------------------------------------------------------------------------

export const R3_ASYNC_CORRECTNESS: LayerRule = {
  layer: 'R3',
  name: 'Async Correctness',
  description: 'Detects async/await patterns that silently fail at runtime using TypeScript AST analysis',
  applicableTo: [ConstructType.FUNCTION_DECLARATION, ConstructType.ARROW_FUNCTION, ConstructType.METHOD_DECLARATION],
  requireAsync: true,
  enabled: true,

  evaluate(construct: CodeConstruct | null, ctx: AnalysisContext): AuditFinding[] {
    if (!construct) return [];
    const findings: AuditFinding[] = [];

    const node = construct.node;
    const checker = ctx.checker ?? null;

    if (!node) {
      callGraphAnalysis(construct, ctx, findings);
      return findings;
    }

    const sourceFile = node.getSourceFile();
    if (!sourceFile) {
      callGraphAnalysis(construct, ctx, findings);
      return findings;
    }

    try {
      // ===================================================================
      // DETECTION 1 + 2: Async function without try/catch AND unprotected
      // await expressions.
      // ===================================================================

      const hasTry = functionBodyHasTryStatement(node);

      let hasAnyAwait = false;
      let firstUnprotectedAwaitNode: ts.AwaitExpression | null = null;
      let unprotectedAwaitLine = construct.line;

      {
        let walkRoot: ts.Node | undefined;
        if (ts.isFunctionDeclaration(node) || ts.isArrowFunction(node) || ts.isMethodDeclaration(node)) {
          walkRoot = node.body;
        } else {
          walkRoot = node;
        }

        if (walkRoot) {
          const awaitStack: ts.Node[] = [walkRoot];
          while (awaitStack.length > 0) {
            const n = awaitStack.pop()!;

            if (ts.isAwaitExpression(n)) {
              hasAnyAwait = true;
              if (!hasTry && !firstUnprotectedAwaitNode) {
                firstUnprotectedAwaitNode = n;
                unprotectedAwaitLine = getLineNumber(sourceFile, n);
              }
            }

            ts.forEachChild(n, (child: ts.Node) => {
              if (ts.isFunctionLike(child)) return;
              awaitStack.push(child);
            });
          }
        }
      }

      if (hasAnyAwait && !hasTry && firstUnprotectedAwaitNode) {
        const awaitText = firstUnprotectedAwaitNode.getText(sourceFile);
        findings.push({
          layer: 'R3',
          severity: 'HIGH',
          category: 'ASYNC_CORRECTNESS',
          file: construct.filePath,
          line: unprotectedAwaitLine,
          evidence: awaitText,
          description: `Async function '${construct.name}' contains await expressions but has no try/catch — rejected promises will be unhandled`,
          correction: `Wrap await calls in try/catch, or chain .catch() on the promise`,
          runtimeImpact: `Unhandled promise rejection — process may crash (Node 15+) or error silently swallowed`,
          confidence: 0.85,
          constructType: construct.type,
          callGraphRef: null,
          evidenceSuppressed: false,
        });
      }

      // ===================================================================
      // DETECTION 3: .then() without .catch() (including empty callbacks).
      // ===================================================================

      walkAst(node, (child: ts.Node) => {
        if (!ts.isCallExpression(child)) return;
        const expr = child.expression;
        if (!ts.isPropertyAccessExpression(expr)) return;

        const methodName = expr.name.text;

        if (methodName === 'then') {
          const parent = child.parent;
          const isChainedWithCatch =
            ts.isPropertyAccessExpression(parent) && parent.name.text === 'catch';
          const isIntermediateThen =
            ts.isPropertyAccessExpression(parent) && parent.name.text === 'then';

          if (!isChainedWithCatch && !isIntermediateThen) {
            const receiverText = expr.expression.getText(sourceFile);
            findings.push({
              layer: 'R3',
              severity: 'HIGH',
              category: 'ASYNC_CORRECTNESS',
              file: construct.filePath,
              line: getLineNumber(sourceFile, child),
              evidence: `${receiverText}.then(...) without .catch()`,
              description: `.then() without .catch() — promise rejection will be unhandled`,
              correction: `Chain .catch() after .then(), or use async/await with try/catch`,
              runtimeImpact: `If the promise rejects, the rejection is unhandled — may crash process or silently fail`,
              confidence: 0.90,
              constructType: construct.type,
              callGraphRef: null,
              evidenceSuppressed: false,
            });
          }

          if (child.arguments.length > 0 && isEmptyFunctionBody(child.arguments[0])) {
            findings.push({
              layer: 'R3',
              severity: 'MEDIUM',
              category: 'ASYNC_CORRECTNESS',
              file: construct.filePath,
              line: getLineNumber(sourceFile, child),
              evidence: child.getText(sourceFile),
              description: 'Empty .then() callback — async result silently discarded',
              correction: 'Handle the async result properly — await it or add meaningful .then()/.catch() handlers',
              runtimeImpact: 'Async result silently discarded — errors never caught, completion never verified',
              confidence: 0.95,
              constructType: construct.type,
              callGraphRef: null,
              evidenceSuppressed: false,
            });
          }
        }

        if (methodName === 'catch') {
          if (child.arguments.length > 0 && isEmptyFunctionBody(child.arguments[0])) {
            findings.push({
              layer: 'R3',
              severity: 'MEDIUM',
              category: 'ASYNC_CORRECTNESS',
              file: construct.filePath,
              line: getLineNumber(sourceFile, child),
              evidence: child.getText(sourceFile),
              description: 'Empty .catch() callback — errors silently discarded',
              correction: 'Add error handling in .catch() or use try/catch with await',
              runtimeImpact: 'Rejection silently consumed — error evidence lost',
              confidence: 0.95,
              constructType: construct.type,
              callGraphRef: null,
              evidenceSuppressed: false,
            });
          }
        }
      });

      // ===================================================================
      // DETECTION 4: void operator applied to a Promise.
      // ===================================================================

      walkAst(node, (child: ts.Node) => {
        if (!ts.isVoidExpression(child)) return;
        const operand = child.expression;
        if (!operand) return;

        if (isPromiseType(operand, checker)) {
          findings.push({
            layer: 'R3',
            severity: 'MEDIUM',
            category: 'ASYNC_CORRECTNESS',
            file: construct.filePath,
            line: getLineNumber(sourceFile, child),
            evidence: child.getText(sourceFile),
            description: 'void operator applied to Promise — explicitly discarding promise, errors will be unhandled',
            correction: 'Await the promise with try/catch, or chain .then().catch() instead of void',
            runtimeImpact: 'Promise rejection is explicitly discarded — errors lost, no crash protection',
            confidence: 0.90,
            constructType: construct.type,
            callGraphRef: null,
            evidenceSuppressed: false,
          });
        }
      });

      // ===================================================================
      // DETECTION 5: Floating promise — CallExpression returning a Promise
      // type that is not awaited, returned, or chained.
      // ===================================================================

      walkAst(node, (child: ts.Node) => {
        if (!ts.isCallExpression(child)) return;
        if (!checker) return;

        if (!isPromiseType(child, checker)) return;

        const parent = child.parent;

        if (ts.isAwaitExpression(parent)) return;
        if (ts.isReturnStatement(parent)) return;
        if (ts.isPropertyAccessExpression(parent)) return;
        if (ts.isVoidExpression(parent)) return;
        if (ts.isVariableDeclaration(parent)) return;
        if (ts.isBinaryExpression(parent)) return;
        if (ts.isCallExpression(parent)) return;
        if (ts.isConditionalExpression(parent)) return;
        if (ts.isArrayLiteralExpression(parent)) return;
        if (ts.isNewExpression(parent)) return;

        if (ts.isExpressionStatement(parent)) {
          const calleeText = child.expression.getText(sourceFile);
          const callLine = getLineNumber(sourceFile, child);

          const dup = findings.some(
            (f: AuditFinding) => f.line === callLine && f.file === construct.filePath && f.category === 'ASYNC_CORRECTNESS',
          );
          if (dup) return;

          findings.push({
            layer: 'R3',
            severity: 'MEDIUM',
            category: 'ASYNC_CORRECTNESS',
            file: construct.filePath,
            line: callLine,
            evidence: `${calleeText}() returns Promise but result is not awaited or handled`,
            description: `Floating promise — '${calleeText}' returns a Promise but result is discarded`,
            correction: `Add 'await' before the call, or handle with .then().catch()`,
            runtimeImpact: 'Async operation may fail silently — no error handling, no completion check',
            confidence: 0.80,
            constructType: construct.type,
            callGraphRef: null,
            evidenceSuppressed: false,
          });
        }
      });

      // ===================================================================
      // Call-graph-based cross-function analysis (structural, not regex).
      // ===================================================================

      callGraphAnalysis(construct, ctx, findings);
    } catch (e) {
      console.error('[R3AsyncCorrectness]', e);
    }

    return findings;
  },
};
