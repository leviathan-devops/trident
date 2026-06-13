import { LayerRule, CodeConstruct, AnalysisContext, AuditFinding, ConstructType } from '../types.ts';

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
    // Standalone function calls like func() or func(arg) — can throw
    /\b[a-z_]\w*\s*\(/,
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

      // Collect all event names used in .send() calls
      const usedTransitions = new Set<string>();

      // Pattern 1: String-literal .send() calls: .send('EVENT') or .send("EVENT")
      const sendPattern = /\.send\s*\(\s*['"](\w+)['"]\s*\)/g;
      while ((transMatch = sendPattern.exec(body)) !== null) {
        usedTransitions.add(transMatch[1]);
      }

      // Pattern 2: Object-format .send() calls: .send({ type: 'EVENT', ... })
      const sendObjectPattern = /\.send\s*\(\s*\{[^}]*?type\s*:\s*['"](\w+)['"]/g;
      while ((transMatch = sendObjectPattern.exec(body)) !== null) {
        usedTransitions.add(transMatch[1]);
      }

      // Pattern 3: Dynamically constructed events from array variables
      // e.g., var events = ['EVENT1', 'EVENT2']; ... .send({ type: events[idx] })
      const arrayDefPattern = /(?:const|let|var)\s+(\w+)\s*=\s*\[([^\]]*)\]\s*;?/g;
      const eventArrays = new Map<string, string[]>();
      let arrMatch;
      while ((arrMatch = arrayDefPattern.exec(body)) !== null) {
        const varName = arrMatch[1];
        const arrContent = arrMatch[2];
        const items = arrContent.match(/['"](\w+)['"]/g);
        if (items && items.length > 0) {
          eventArrays.set(varName, items.map((s: string) => s.replace(/['"]/g, '')));
        }
      }
      for (const [varName, eventNames] of eventArrays) {
        const dynPattern = new RegExp(`\.send\s*\([^)]*\b\${varName}\s*\[`);
        if (dynPattern.test(body)) {
          for (const evt of eventNames) {
            usedTransitions.add(evt);
          }
        }
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

    if (returnPositions.length > 1) {
      for (let i = 0; i < returnPositions.length - 1; i++) {
        const betweenReturns = body.substring(returnPositions[i], returnPositions[i + 1]);
        const linesBetween = betweenReturns.split('\n').length - 1;

        if (linesBetween > 5) {
          const afterReturn = body.substring(returnPositions[i]);
          const ifBetween = /\bif\s*\(/.test(afterReturn.substring(0, returnPositions[i + 1] - returnPositions[i]));
          if (!ifBetween) {
            const lineOffset = body.substring(0, returnPositions[i]).split('\n').length - 1;
            const codeAfter = afterReturn.split('\n')[1]?.trim() || '';
            if (codeAfter && !codeAfter.startsWith('//') && !codeAfter.startsWith('/*')) {
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
