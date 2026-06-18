import * as ts from 'typescript';
import { LayerRule, CodeConstruct, AnalysisContext, AuditFinding, ConstructType } from '../types.ts';

/**
 * FIX 3b (v2): AST-based catch-clause detection — replaces the fragile
 * text-based brace matching in isReturnInsideCatchBlock().
 *
 * The old text-based approach walked backwards through source lines counting
 * braces and looking for 'catch'. This generated ~47 false positives because:
 *  - It couldn't handle nested try/catch blocks
 *  - It couldn't handle arrow functions inside catch blocks
 *  - It counted braces incorrectly in multi-line blocks
 *  - It treated ANY return inside a catch block as exempt, even when the
 *    code after it WAS genuinely unreachable
 *
 * The AST approach walks the TypeScript compiler's parent chain from each
 * ReturnStatement node, giving precise structural information about whether
 * a return is inside a catch clause and whether the "unreachable" code is
 * genuinely unreachable (same block after return) or reachable (after the
 * try/catch/finally — the try block may succeed without throwing).
 */

/**
 * Build a map of body-relative text positions → ReturnStatement AST nodes.
 *
 * The R14 scanner finds return statements via regex on construct.body text.
 * This map bridges text positions back to AST nodes so we can walk parent
 * chains for structural analysis.
 *
 * Position mapping: construct.body = node.getText(sf), which starts at
 * node.getStart(sf). So body-relative position = retNode.getStart(sf) -
 * funcNode.getStart(sf), which exactly matches the regex match index.
 */
function buildReturnNodeMap(funcNode: ts.Node): Map<number, ts.ReturnStatement> {
  const map = new Map<number, ts.ReturnStatement>();
  const sf = funcNode.getSourceFile();
  if (!sf) return map;
  let bodyStart: number;
  try {
    bodyStart = funcNode.getStart(sf);
  } catch {
    return map;
  }

  function visit(node: ts.Node): void {
    if (ts.isReturnStatement(node)) {
      try {
        const retStart = node.getStart(sf);
        const bodyRelative = retStart - bodyStart;
        map.set(bodyRelative, node);
      } catch {
        // Node may be synthetic/missing — skip
      }
    }
    ts.forEachChild(node, visit);
  }
  ts.forEachChild(funcNode, visit);
  return map;
}

/**
 * Walk up the AST parent chain to find an enclosing CatchClause.
 * Stops at function-like boundaries — a catch clause outside the
 * containing function is structurally irrelevant.
 *
 * Returns null if the node is not inside a catch clause.
 */
function findEnclosingCatchClause(node: ts.Node): ts.CatchClause | null {
  let current: ts.Node | undefined = node.parent;
  while (current) {
    if (ts.isCatchClause(current)) {
      return current;
    }
    if (ts.isFunctionDeclaration(current) ||
        ts.isFunctionExpression(current) ||
        ts.isArrowFunction(current) ||
        ts.isMethodDeclaration(current) ||
        ts.isConstructorDeclaration(current) ||
        ts.isGetAccessorDeclaration(current) ||
        ts.isSetAccessorDeclaration(current)) {
      return null;
    }
    current = current.parent;
  }
  return null;
}

/**
 * Walk up the AST parent chain to find an enclosing TryStatement.
 * Stops at function-like boundaries.
 *
 * Returns null if the node is not inside a try statement.
 */
function findEnclosingTryStatement(node: ts.Node): ts.TryStatement | null {
  let current: ts.Node | undefined = node.parent;
  while (current) {
    if (ts.isTryStatement(current)) {
      return current;
    }
    if (ts.isFunctionDeclaration(current) ||
        ts.isFunctionExpression(current) ||
        ts.isArrowFunction(current) ||
        ts.isMethodDeclaration(current) ||
        ts.isConstructorDeclaration(current) ||
        ts.isGetAccessorDeclaration(current) ||
        ts.isSetAccessorDeclaration(current)) {
      return null;
    }
    current = current.parent;
  }
  return null;
}

/**
 * AST-based analysis of a return statement's catch-clause context.
 *
 * Given a ReturnStatement node and the body-relative position of the next
 * code/return being checked for unreachability, determines:
 *
 *  - insideCatch: whether the return is lexically inside a catch clause
 *  - codeAfterIsReachable: if insideCatch, whether the "unreachable" code
 *    at nextBodyPos is genuinely unreachable (false) or reachable (true)
 *
 * Reachability rules:
 *  - Code AFTER the try/catch/finally block → reachable (try may succeed)
 *  - Code INSIDE the same catch clause after the return → genuinely unreachable
 *  - Code in the try block or finally block → reachable (different path)
 */
function analyzeReturnInCatchContext(
  retNode: ts.ReturnStatement,
  nextBodyPos: number,
  funcNode: ts.Node,
): { insideCatch: boolean; codeAfterIsReachable: boolean } {
  const catchClause = findEnclosingCatchClause(retNode);
  if (!catchClause) {
    return { insideCatch: false, codeAfterIsReachable: false };
  }

  // Find the TryStatement enclosing this catch clause
  const tryStmt = findEnclosingTryStatement(catchClause);
  if (!tryStmt) {
    // Catch clause not inside a try statement — unusual, be conservative
    return { insideCatch: true, codeAfterIsReachable: false };
  }

  const sf = funcNode.getSourceFile();
  if (!sf) {
    return { insideCatch: true, codeAfterIsReachable: false };
  }

  let bodyStart: number;
  try {
    bodyStart = funcNode.getStart(sf);
  } catch {
    return { insideCatch: true, codeAfterIsReachable: false };
  }

  const tryEndBodyRelative = tryStmt.getEnd() - bodyStart;
  const catchEndBodyRelative = catchClause.getEnd() - bodyStart;

  // If the next code is after the entire try/catch/finally block,
  // it IS reachable — the try block may complete without throwing.
  if (nextBodyPos >= tryEndBodyRelative) {
    return { insideCatch: true, codeAfterIsReachable: true };
  }

  // If the next code is inside the same catch clause (after the return),
  // it IS genuinely unreachable — no conditional can skip the return.
  if (nextBodyPos < catchEndBodyRelative) {
    return { insideCatch: true, codeAfterIsReachable: false };
  }

  // Next code is in the try block, finally block, or a different catch —
  // reachable via a different execution path
  return { insideCatch: true, codeAfterIsReachable: true };
}

function extractTryBlocks(body: string): { tryStart: number; catchStart: number; finallyStart: number; tryEnd: number }[] {
  const blocks: { tryStart: number; catchStart: number; finallyStart: number; tryEnd: number }[] = [];
  const tryPattern = /\btry\s*\{/g;
  let tryMatch: RegExpExecArray | null;

  while ((tryMatch = tryPattern.exec(body)) !== null) {
    let braceCount = 0;
    let tryBodyEnd = -1;
    let catchPos = -1;
    let finallyPos = -1;
    let endPos = -1;

    for (let i = tryMatch.index + tryMatch[0].length - 1; i < body.length; i++) {
      if (body[i] === '{') braceCount++;
      else if (body[i] === '}') {
        braceCount--;
        if (braceCount === 0) {
          if (tryBodyEnd === -1) {
            tryBodyEnd = i;
            const afterTry = body.substring(i + 1).trimStart();
            const catchMatch = afterTry.match(/^catch\s*(?:\([^)]*\))?\s*\{/);
            if (catchMatch) {
              catchPos = i + 1 + body.substring(i + 1).indexOf(catchMatch[0]);
            }
            const finallyMatch = afterTry.match(/^finally\s*\{/);
            if (finallyMatch) {
              finallyPos = i + 1 + body.substring(i + 1).indexOf(finallyMatch[0]);
            }
            if (catchPos === -1 && finallyPos === -1) {
              endPos = i;
              break;
            }

            let searchFrom = catchPos > finallyPos ? catchPos : finallyPos;
            if (catchPos > -1 && finallyPos > -1) {
              searchFrom = Math.max(catchPos, finallyPos);
            }

            braceCount = 0;
            for (let j = searchFrom; j < body.length; j++) {
              if (body[j] === '{') braceCount++;
              else if (body[j] === '}') {
                braceCount--;
                if (braceCount === 0) {
                  const afterBlock = body.substring(j + 1).trimStart();
                  const nextCatch = afterBlock.match(/^catch\s*(?:\([^)]*\))?\s*\{/);
                  const nextFinally = afterBlock.match(/^finally\s*\{/);

                  if (nextCatch) {
                    catchPos = j + 1 + body.substring(j + 1).indexOf(nextCatch[0]);
                    searchFrom = catchPos;
                    continue;
                  }
                  if (nextFinally) {
                    finallyPos = j + 1 + body.substring(j + 1).indexOf(nextFinally[0]);
                    searchFrom = finallyPos;
                    continue;
                  }
                  endPos = j;
                  break;
                }
              }
            }
            break;
          }
        }
      }
    }

    if (tryBodyEnd > -1) {
      blocks.push({
        tryStart: tryMatch.index,
        catchStart: catchPos,
        finallyStart: finallyPos,
        tryEnd: endPos > -1 ? endPos : tryBodyEnd,
      });
    }
  }

  return blocks;
}

function canThrowInBlock(blockBody: string): boolean {
  const throwingPatterns = [
    /\bthrow\b/,
    /\.exec\s*\(/,
    /JSON\.parse\s*\(/,
    /parseInt\s*\(/,
    /parseFloat\s*\(/,
    /fs\.\w+\s*\(/,
    /fetch\s*\(/,
    /new\s+\w+\s*\(/,
    /\w+\.\w+\s*\(/,
    /await\s+/,
    /\.shift\s*\(\)/,
    /\.pop\s*\(\)/,
    /\.access\s*\(/,
  ];

  for (const pattern of throwingPatterns) {
    if (pattern.test(blockBody)) return true;
  }
  return false;
}

function isEmptyBlock(blockBody: string): boolean {
  const stripped = blockBody.replace(/\{|\}/g, '').replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '').trim();
  return stripped.length === 0;
}

function extractCatchBody(body: string, catchStart: number): string {
  if (catchStart < 0 || catchStart >= body.length) return '';
  let braceCount = 0;
  let started = false;
  let startIdx = -1;
  for (let i = catchStart; i < body.length; i++) {
    if (body[i] === '{') {
      braceCount++;
      if (!started) {
        started = true;
        startIdx = i + 1;
      }
    } else if (body[i] === '}') {
      braceCount--;
      if (braceCount === 0 && started) {
        return body.substring(startIdx, i);
      }
    }
  }
  return '';
}

function extractTryBody(body: string, tryStart: number): string {
  let braceCount = 0;
  let started = false;
  let startIdx = -1;
  for (let i = tryStart; i < body.length; i++) {
    if (body[i] === '{') {
      braceCount++;
      if (!started) {
        started = true;
        startIdx = i + 1;
      }
    } else if (body[i] === '}') {
      braceCount--;
      if (braceCount === 0 && started) {
        return body.substring(startIdx, i);
      }
    }
  }
  return '';
}

const ALWAYS_TRUE_CONDITIONS = [
  /\btrue\b/,
  /!\s*false/,
  /typeof\s+\w+\s*===?\s*['"](\w+)['"]/,
];

const ALWAYS_FALSE_CONDITIONS = [
  /\bfalse\b/,
  /!\s*true/,
];

export const R14_CONTROL_FLOW_GRAPH: LayerRule = {
  layer: 'R14',
  name: 'Control Flow Graph',
  description: 'Determines path reachability, identifies dead error handlers and unreachable state transitions',
  applicableTo: [ConstructType.FUNCTION_DECLARATION, ConstructType.ARROW_FUNCTION, ConstructType.METHOD_DECLARATION, ConstructType.TRY_STATEMENT, ConstructType.CATCH_CLAUSE],
  requireHasBody: true,
  enabled: true,

  evaluate(construct: CodeConstruct | null, ctx: AnalysisContext): AuditFinding[] {
    if (!construct) return [];
    const findings: AuditFinding[] = [];
    const body = construct.body;

    const tryBlocks = extractTryBlocks(body);

    for (const tryBlock of tryBlocks) {
      const tryBody = extractTryBody(body, tryBlock.tryStart);
      const tryCanThrow = canThrowInBlock(tryBody);

      if (tryBlock.catchStart > -1 && !tryCanThrow) {
        const catchBody = extractCatchBody(body, tryBlock.catchStart);
        if (!isEmptyBlock(catchBody)) {
          const lineOffset = body.substring(0, tryBlock.catchStart).split('\n').length - 1;
          findings.push({
            layer: 'R14',
            severity: 'HIGH',
            category: 'CONTROL_FLOW',
            file: construct.filePath,
            line: construct.line + lineOffset,
            evidence: `catch block at offset ${tryBlock.catchStart} — try block cannot throw`,
            description: 'Unreachable error handler — try block contains no operations that can throw, catch block is dead code',
            correction: 'Remove the try/catch if the operations are truly safe, or add operations that can actually fail',
            runtimeImpact: 'Dead catch block hides bugs — developer thinks errors are handled but the handler never executes',
            confidence: 0.80,
            constructType: construct.type,
            callGraphRef: null,
            evidenceSuppressed: false,
          });
        }
      }

      if (tryBlock.catchStart > -1) {
        const catchBody = extractCatchBody(body, tryBlock.catchStart);
        if (catchBody && isEmptyBlock(catchBody)) {
          const lineOffset = body.substring(0, tryBlock.catchStart).split('\n').length - 1;
          findings.push({
            layer: 'R14',
            severity: 'MEDIUM',
            category: 'CONTROL_FLOW',
            file: construct.filePath,
            line: construct.line + lineOffset,
            evidence: 'empty catch block',
            description: 'Empty catch block — error swallowed with no handling',
            correction: 'Add error logging, recovery, or re-throw: console.error("[Context] failed:", err);',
            runtimeImpact: 'Errors silently consumed — no evidence of failure, debugging impossible',
            confidence: 0.95,
            constructType: construct.type,
            callGraphRef: null,
            evidenceSuppressed: false,
          });
        }
      }
    }

    const ifPattern = /\bif\s*\(([^)]+)\)\s*\{/g;
    let ifMatch: RegExpExecArray | null;
    while ((ifMatch = ifPattern.exec(body)) !== null) {
      const condition = ifMatch[1].trim();

      for (const alwaysTrue of ALWAYS_TRUE_CONDITIONS) {
        if (alwaysTrue.test(condition) && !condition.includes('||') && !condition.includes('&&')) {
          const lineOffset = body.substring(0, ifMatch.index).split('\n').length - 1;
          findings.push({
            layer: 'R14',
            severity: 'MEDIUM',
            category: 'CONTROL_FLOW',
            file: construct.filePath,
            line: construct.line + lineOffset,
            evidence: `if (${condition})`,
            description: `Always-true condition: "if (${condition})" — else branch is unreachable dead code`,
            correction: 'Remove the condition if it is always true, or fix the logic if the condition should be dynamic',
            runtimeImpact: 'Dead code in else branch — developer thinks both paths are tested but only one executes',
            confidence: 0.85,
            constructType: construct.type,
            callGraphRef: null,
            evidenceSuppressed: false,
          });
          break;
        }
      }

      for (const alwaysFalse of ALWAYS_FALSE_CONDITIONS) {
        if (alwaysFalse.test(condition) && !condition.includes('||') && !condition.includes('&&')) {
          const lineOffset = body.substring(0, ifMatch.index).split('\n').length - 1;
          findings.push({
            layer: 'R14',
            severity: 'MEDIUM',
            category: 'CONTROL_FLOW',
            file: construct.filePath,
            line: construct.line + lineOffset,
            evidence: `if (${condition})`,
            description: `Always-false condition: "if (${condition})" — if branch is unreachable dead code`,
            correction: 'Remove the condition if it is always false, or fix the logic if the condition should be dynamic',
            runtimeImpact: 'Dead code in if branch — developer thinks both paths are tested but only else executes',
            confidence: 0.85,
            constructType: construct.type,
            callGraphRef: null,
            evidenceSuppressed: false,
          });
          break;
        }
      }
    }

    const stateMachinePatterns = [
      /(?:const|let|var)\s+(\w+)\s*:\s*StateMachine/,
      /(?:const|let|var)\s+(\w+)\s*=\s*createStateMachine/,
      /(?:const|let|var)\s+(\w+)\s*=\s*new\s+StateMachine/,
      /states\s*:\s*\{/,
    ];

    let hasStateMachine = false;
    for (const smp of stateMachinePatterns) {
      if (smp.test(body)) {
        hasStateMachine = true;
        break;
      }
    }

    if (hasStateMachine) {
      const transitionPattern = /(?:transition|on|event)\s*:\s*['"](\w+)['"]/g;
      const definedTransitions = new Set<string>();
      let transMatch: RegExpExecArray | null;
      while ((transMatch = transitionPattern.exec(body)) !== null) {
        definedTransitions.add(transMatch[1]);
      }

      const sendPattern = /\.send\s*\(\s*['"](\w+)['"]\s*\)/g;
      const usedTransitions = new Set<string>();
      while ((transMatch = sendPattern.exec(body)) !== null) {
        usedTransitions.add(transMatch[1]);
      }

      for (const trans of definedTransitions) {
        if (!usedTransitions.has(trans)) {
          findings.push({
            layer: 'R14',
            severity: 'HIGH',
            category: 'CONTROL_FLOW',
            file: construct.filePath,
            line: construct.line,
            evidence: `transition "${trans}" defined but never triggered`,
            description: `State machine transition "${trans}" is defined but no code path triggers it — unreachable transition`,
            correction: `Add .send("${trans}") call or remove the transition if unused`,
            runtimeImpact: 'Unreachable transition — state machine can never reach the target state, logic is incomplete',
            confidence: 0.75,
            constructType: construct.type,
            callGraphRef: null,
            evidenceSuppressed: false,
          });
        }
      }
    }

    const returnPattern = /\breturn\b/g;
    const returnPositions: number[] = [];
    let retMatch: RegExpExecArray | null;
    while ((retMatch = returnPattern.exec(body)) !== null) {
      returnPositions.push(retMatch.index);
    }

    // FIX 3b (v2): Build AST-based return node map for precise catch-clause
    // analysis. Maps body-relative text positions to ReturnStatement AST nodes
    // so we can walk parent chains instead of counting braces in text.
    const returnNodeMap = construct.node
      ? buildReturnNodeMap(construct.node)
      : new Map<number, ts.ReturnStatement>();

    if (returnPositions.length > 1) {
      for (let i = 0; i < returnPositions.length - 1; i++) {
        // FIX 3b (v2): AST-based catch-clause detection replaces text-based
        // brace matching. If the return is inside a catch clause, determine
        // whether the "unreachable" code is genuinely unreachable (inside the
        // same catch block after the return) or reachable (after the
        // try/catch/finally — the try block may succeed without throwing).
        const retNode = returnNodeMap.get(returnPositions[i]);
        if (retNode && construct.node) {
          const analysis = analyzeReturnInCatchContext(
            retNode,
            returnPositions[i + 1],
            construct.node,
          );
          if (analysis.insideCatch && analysis.codeAfterIsReachable) {
            // Return inside catch, and code after try/catch IS reachable —
            // this is a false positive, skip it
            continue;
          }
          // If insideCatch && !codeAfterIsReachable: genuinely unreachable
          // code in the same catch block — fall through to normal detection.
          // If !insideCatch: return is NOT in a catch clause — fall through.
        }

        const betweenReturns = body.substring(returnPositions[i], returnPositions[i + 1]);
        const linesBetween = betweenReturns.split('\n').length - 1;

        if (linesBetween > 5) {
          const afterReturn = body.substring(returnPositions[i]);
          const ifBetween = /\bif\s*\(/.test(afterReturn.substring(0, returnPositions[i + 1] - returnPositions[i]));
          if (!ifBetween) {
            const lineOffset = body.substring(0, returnPositions[i]).split('\n').length - 1;
            const codeAfter = afterReturn.split('\n')[1]?.trim() || '';
            if (codeAfter && !codeAfter.startsWith('//') && !codeAfter.startsWith('/*')) {
              // FIX (Phase 8 R14 switch-case): skip false positives for
              // closing braces, switch-case labels, and hoisted declarations.
              // These are structural or hoisted constructs — not unreachable code.
              if (codeAfter === '}' ||
                  /^case\b/.test(codeAfter) ||
                  /^default\s*:/.test(codeAfter) ||
                  /^function\b/.test(codeAfter)) {
                continue;
              }
              findings.push({
                layer: 'R14',
                severity: 'HIGH',
                category: 'CONTROL_FLOW',
                file: construct.filePath,
                line: construct.line + lineOffset + 1,
                evidence: `code after return: "${codeAfter}"`,
                description: 'Unreachable code after return statement — code will never execute',
                correction: 'Remove the unreachable code or fix the control flow',
                runtimeImpact: 'Dead code — developer thinks this code runs but it never executes',
                confidence: 0.90,
                constructType: construct.type,
                callGraphRef: null,
                evidenceSuppressed: false,
              });
            }
          }
        }
      }
    }

    return findings;
  },
};
