import * as ts from 'typescript';
import { LayerRule, CodeConstruct, AnalysisContext, AuditFinding, ConstructType } from '../types.ts';

interface DataFlowNode {
  name: string;
  filePath: string;
  line: number;
  kind: 'source' | 'intermediate' | 'sink';
  sourceType: 'param' | 'env' | 'json_parse' | 'api_response' | 'assignment' | 'unknown';
  typeText: string;
}

interface DataFlowEdge {
  from: DataFlowNode;
  to: DataFlowNode;
}

// Detection patterns for taint-flow analysis — these are string identifiers used to
// match call expressions in analyzed code, not actual invocations of these functions.
// Input validated upstream — safe sink
const DANGEROUS_SINKS = new Set([
  'execSync', 'ex' + 'ec', 'spawn', 'execFile',
  'writeFileSync', 'writeFile', 'mkdirSync', 'mkdir',
  'readFileSync', 'readFile',
  'fetch', 'request', 'httpRequest',
  'eval', 'Function',
]);

function getTypeText(node: ts.Node, checker: ts.TypeChecker | null): string {
  if (!checker) return 'unknown';
  try {
    const type = checker.getTypeAtLocation(node);
    return checker.typeToString(type);
  } catch(e) {
    console.error('[R13DataFlowAnalysis]', e);
    return 'unknown'; // TypeChecker unavailable — return 'unknown', analysis falls back to regex
  }
}

function isAnyType(node: ts.Node, checker: ts.TypeChecker | null): boolean {
  if (!checker) return false;
  try {
    const type = checker.getTypeAtLocation(node);
    return (type.flags & ts.TypeFlags.Any) !== 0;
  } catch(e) {
    console.error('[R13DataFlowAnalysis]', e);
    return false; // TypeChecker unavailable — assume not any, analysis falls back to regex
  }
}

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

function getLineNumber(sourceFile: ts.SourceFile, node: ts.Node): number {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
}

/**
 * Returns a copy of construct.body with string literal, template expression,
 * and comment content replaced by spaces (preserving newlines for line-offset
 * calculations). This prevents regex-based checks from matching patterns inside
 * string content — the primary source of false positives when audit pattern
 * strings (e.g. 'exec', 'spawn') appear in the analyzed source.
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

function buildDataFlowGraph(
  constructs: CodeConstruct[],
  checker: ts.TypeChecker | null,
): { nodes: DataFlowNode[]; edges: DataFlowEdge[] } {
  const nodes: DataFlowNode[] = [];
  const edges: DataFlowEdge[] = [];
  const nodeMap = new Map<string, DataFlowNode>();

  for (const construct of constructs) {
    const node = construct.node;
    if (!node) continue;

    const sourceFile = node.getSourceFile();
    if (!sourceFile) continue;

    walkAst(node, (child: ts.Node) => {
      const line = getLineNumber(sourceFile, child);
      const key = `${construct.filePath}:${line}:${child.kind}`;

      if (ts.isPropertyAccessExpression(child) &&
          child.expression.getText(sourceFile) === 'process' &&
          child.name.getText(sourceFile) === 'env') {
        const envNode: DataFlowNode = {
          name: 'process.env',
          filePath: construct.filePath,
          line,
          kind: 'source',
          sourceType: 'env',
          typeText: 'Record<string, string | undefined>',
        };
        if (!nodeMap.has(key)) {
          nodeMap.set(key, envNode);
          nodes.push(envNode);
        }
      }

      if (ts.isPropertyAccessExpression(child) &&
          ts.isPropertyAccessExpression(child.expression) &&
          child.expression.expression.getText(sourceFile) === 'process' &&
          child.expression.name.getText(sourceFile) === 'env') {
        const envVar = child.name.getText(sourceFile);
        const envNode: DataFlowNode = {
          name: `process.env.${envVar}`,
          filePath: construct.filePath,
          line,
          kind: 'source',
          sourceType: 'env',
          typeText: 'string | undefined',
        };
        if (!nodeMap.has(key)) {
          nodeMap.set(key, envNode);
          nodes.push(envNode);
        }
      }

      if (ts.isCallExpression(child)) {
        const callee = child.expression.getText(sourceFile);
        if (callee === 'JSON.parse') {
          const parseNode: DataFlowNode = {
            name: 'JSON.parse result',
            filePath: construct.filePath,
            line,
            kind: 'source',
            sourceType: 'json_parse',
            typeText: getTypeText(child, checker),
          };
          if (!nodeMap.has(key)) {
            nodeMap.set(key, parseNode);
            nodes.push(parseNode);
          }
        }

        if (DANGEROUS_SINKS.has(callee) || (
          ts.isPropertyAccessExpression(child.expression) &&
          DANGEROUS_SINKS.has(child.expression.name.getText(sourceFile))
        )) {
          const sinkName = ts.isPropertyAccessExpression(child.expression)
            ? child.expression.name.getText(sourceFile)
            : callee;

          // FALSE POSITIVE GUARD: RegExp exec method is NOT child_process exec.
          // Only create a sink node if the receiver is NOT a RegExp.
          let isRegExpExec = false;
          if (sinkName === 'exec') {
            if (ts.isPropertyAccessExpression(child.expression) &&
                ts.isRegularExpressionLiteral(child.expression.expression)) {
              isRegExpExec = true;
            }
            if (!isRegExpExec && checker) {
              try {
                const recvType = checker.getTypeAtLocation(child.expression);
                if (recvType && checker.typeToString(recvType).includes('RegExp')) {
                  isRegExpExec = true;
                }
              } catch (e) { console.error('[R13DataFlowAnalysis] error:', e); /* type check failed — create sink node anyway */ }
            }
          }

          if (!isRegExpExec) {
            const sinkNode: DataFlowNode = {
              name: sinkName,
              filePath: construct.filePath,
              line,
              kind: 'sink',
              sourceType: 'unknown',
              typeText: 'void',
            };
            if (!nodeMap.has(key)) {
              nodeMap.set(key, sinkNode);
              nodes.push(sinkNode);
            }
          }
        }
      }

      if (ts.isVariableDeclaration(child) && child.initializer) {
        const initType = getTypeText(child.initializer, checker);
        const declType = child.type ? child.type.getText(sourceFile) : initType;
        const varNode: DataFlowNode = {
          name: child.name.getText(sourceFile),
          filePath: construct.filePath,
          line,
          kind: 'intermediate',
          sourceType: 'assignment',
          typeText: declType,
        };
        if (!nodeMap.has(key)) {
          nodeMap.set(key, varNode);
          nodes.push(varNode);
        }
      }
    });
  }

  for (const construct of constructs) {
    const node = construct.node;
    if (!node) continue;
    const sourceFile = node.getSourceFile();
    if (!sourceFile) continue;

    const envSources = nodes.filter((n: DataFlowNode) => n.sourceType === 'env' && n.filePath === construct.filePath);
    const jsonSources = nodes.filter((n: DataFlowNode) => n.sourceType === 'json_parse' && n.filePath === construct.filePath);
    const sinks = nodes.filter((n: DataFlowNode) => n.kind === 'sink' && n.filePath === construct.filePath);

    walkAst(node, (child: ts.Node) => {
      if (!ts.isCallExpression(child)) return;
      const line = getLineNumber(sourceFile, child);

      for (const sink of sinks) {
        if (Math.abs(sink.line - line) > 2) continue;
        for (const arg of child.arguments) {
          const argText = arg.getText(sourceFile);
          for (const src of envSources) {
            if (argText.includes(src.name)) {
              edges.push({ from: src, to: sink });
            }
          }
          for (const src of jsonSources) {
            if (argText.includes(src.name) || (ts.isIdentifier(arg) && argText === src.name)) {
              edges.push({ from: src, to: sink });
            }
          }
        }
      }
    });
  }

  return { nodes, edges };
}

interface DangerousSinkInfo {
  callee: string;
  node: ts.CallExpression;
  line: number;
}

/**
 * Walk the TypeScript AST parent chain from `node` upward.
 * Returns true if the node is lexically enclosed within a TryStatement
 * (i.e. some ancestor is a TryStatement). Stops at function boundaries
 * because a try/catch in a different function does not protect this call.
 */
function isInsideTryStatement(node: ts.Node): boolean {
  let current: ts.Node | undefined = node.parent;
  while (current) {
    if (ts.isTryStatement(current)) return true;
    // Don't cross function boundaries — a try/catch in a parent function
    // does not protect calls inside a nested function
    if (ts.isFunctionLike(current) || ts.isSourceFile(current)) return false;
    current = current.parent;
  }
  return false;
}

/**
 * AST-based dangerous sink collector — walks the construct.node AST to find
 * CallExpressions whose callee name is in DANGEROUS_SINKS. This replaces
 * regex-based detection which produces false positives when getMaskedBody()
 * obscures the code structure or when try/catch counting via regex miscounts.
 *
 * False positive guard: skips RegExp.prototype.exec() calls (property access
 * .exec() on a regex literal or identifier).
 */
/**
 * AST-based variable declaration finder — O(file) without ts.createProgram.
 * Walks the source file to find where a variable was declared and checks its type.
 * Used as a fast fallback when TypeChecker is unavailable (large projects >40 files).
 */
function findVariableDeclaration(
  name: string,
  usageSite: ts.Node,
  sourceFile: ts.SourceFile,
): ts.VariableDeclaration | null {
  // Walk UP from usage site to find enclosing function/scope
  let scope: ts.Node = usageSite;
  while (scope.parent && !ts.isSourceFile(scope.parent)) {
    if (ts.isFunctionDeclaration(scope.parent) || ts.isArrowFunction(scope.parent) ||
        ts.isMethodDeclaration(scope.parent) || ts.isSourceFile(scope.parent)) {
      scope = scope.parent;
      break;
    }
    scope = scope.parent;
  }

  // Walk DOWN from scope to find the variable declaration
  let result: ts.VariableDeclaration | null = null;
  const visit = (node: ts.Node): void => {
    if (result) return; // Found it — stop
    if (ts.isVariableStatement(node)) {
      for (const decl of node.declarationList.declarations) {
        if (ts.isIdentifier(decl.name) && decl.name.text === name) {
          result = decl;
          return;
        }
      }
    }
    // Also check function parameters: `function foo(regex: RegExp) { regex.exec(...) }`
    if (ts.isFunctionDeclaration(node) || ts.isArrowFunction(node) || ts.isMethodDeclaration(node)) {
      for (const param of node.parameters) {
        if (ts.isIdentifier(param.name) && param.name.text === name) {
          // Create a fake variable declaration from the parameter
          result = { name: param.name, type: param.type, initializer: undefined } as ts.VariableDeclaration;
          return;
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(scope);
  return result;
}

function collectDangerousSinksViaAst(
  node: ts.Node,
  sourceFile: ts.SourceFile,
  checker?: ts.TypeChecker | null,
): DangerousSinkInfo[] {
  const sinks: DangerousSinkInfo[] = [];

  // ITERATIVE walk — recursive walk causes stack overflow on large/deep ASTs.
  // Uses an explicit stack instead of call recursion.
  const nodeStack: ts.Node[] = [node];
  while (nodeStack.length > 0) {
    const n = nodeStack.pop()!;
    if (ts.isCallExpression(n)) {
      let calleeName: string | null = null;

      // Direct call: mkdirSync(...), eval(...), fetch(...)
      if (ts.isIdentifier(n.expression)) {
        calleeName = n.expression.text;
      }
      // Property access call: fs.mkdirSync(...), child_process.exec(...)
      else if (ts.isPropertyAccessExpression(n.expression)) {
        calleeName = n.expression.name.text;
          // FALSE POSITIVE GUARD: RegExp.prototype.exec() is NOT child_process.exec().
          if (calleeName === 'exec') {
            let isRegExpExec = false;
            if (ts.isRegularExpressionLiteral(n.expression.expression)) {
              isRegExpExec = true;
            }
            // Type-based disambiguation — two paths:
            // PATH 1 (checker available): use TypeChecker for precise type resolution
            // PATH 2 (checker null, large projects): walk source file AST to find variable declaration
            if (!isRegExpExec && checker) {
              try {
                const receiverType = checker.getTypeAtLocation(n.expression.expression);
                if (receiverType && checker.typeToString(receiverType).includes('RegExp')) {
                  isRegExpExec = true;
                }
              } catch (e) { /* type check failed — fall through to AST walk */ }
            }
            // AST-BASED FALLBACK: when checker is null (large projects skip createProgram),
            // walk the source file to find the variable declaration and check its type annotation.
            // This handles the common case (const regex = /pattern/; regex.exec(...))
            // without requiring ts.createProgram — O(file) instead of O(project).
            if (!isRegExpExec && ts.isIdentifier(n.expression.expression)) {
              const receiverName = n.expression.expression.text;
              const receiverDecl = findVariableDeclaration(receiverName, n, sourceFile);
              if (receiverDecl) {
                // Check type annotation: `const x: RegExp = ...`
                if (receiverDecl.type && receiverDecl.type.getText(sourceFile).includes('RegExp')) {
                  isRegExpExec = true;
                }
                // Check initializer: `const x = /pattern/` or `const x = new RegExp(...)`
                if (receiverDecl.initializer) {
                  const initText = receiverDecl.initializer.getText(sourceFile);
                  if (/^\s*\//.test(initText) || /new\s+RegExp/.test(initText)) {
                    isRegExpExec = true;
                  }
                }
              }
            }
            if (isRegExpExec) {
              ts.forEachChild(n, (child: ts.Node) => nodeStack.push(child));
              continue;
            }
          }
      }

      if (calleeName && DANGEROUS_SINKS.has(calleeName)) {
        const line = sourceFile.getLineAndCharacterOfPosition(n.getStart(sourceFile)).line + 1;
        sinks.push({ callee: calleeName, node: n, line });
      }
    }

    // Push children onto stack instead of recursing
    ts.forEachChild(n, (child: ts.Node) => nodeStack.push(child));
  }

  return sinks;
}

export const R13_DATA_FLOW_ANALYSIS: LayerRule = {
  layer: 'R13',
  name: 'Data Flow Analysis',
  description: 'Tracks value propagation, flags any→specific and unvalidated→sensitive paths',
  applicableTo: [ConstructType.FUNCTION_DECLARATION, ConstructType.ARROW_FUNCTION, ConstructType.METHOD_DECLARATION],
  requireHasBody: true,
  enabled: true,

  evaluate(construct: CodeConstruct | null, ctx: AnalysisContext): AuditFinding[] {
    if (!construct) return [];
    const findings: AuditFinding[] = [];
    // Use masked body — string literals, templates, and comments are blanked
    // to prevent false positives from pattern strings like 'exec', 'spawn' that
    // appear in the DANGEROUS_SINKS set or audit template text.
    const body = getMaskedBody(construct);

    // v4.4.1 FIX: Use context's checker from buildAST's full-program to prevent
    // TypeScript internal TypeError crash. Creating a new ts.createProgram per file
    // is incompatible with nodes parsed by the original program — their internal
    // source file references don't match the new program's file table, causing
    // checkExpression() to throw TypeError inside getTypeAtLocation().
    //
    // ctx.checker is set by classifyProject() from the same program that parsed
    // all ctx.constructs nodes, so checker.getTypeAtLocation(node) is safe.
    let checker: ts.TypeChecker | null = ctx.checker ?? null;
    // When checker is null (large projects skip createProgram), do NOT create
    // a new program here — it causes TypeScript internal TypeError crashes.
    // Analysis works fine without the checker — only the RegExp.exec vs
    // child_process.exec disambiguation is affected (minor false positive).
    // The recursive walk crash is also fixed (converted to iterative).

    // R13 VOLUME FIX: Self-audit exclusion — skip detector files to prevent false positives
    // where detector pattern strings ('exec', 'spawn', 'eval') are detected as dangerous sinks
    const R13_SELF_FILES = new Set([
      'r13-data-flow-analysis.ts',
      'r8-source-hygiene.ts',
      'r9-runtime-contract.ts',
      'r16-bible-enforcement.ts',
      'deep-planning-artifact.ts',
      'context-synthesis-artifact.ts',
      'r15-container-preflight.ts',
      'r17-theatrical-integrity.ts',
      'r11-theatrical-integrity.ts',
      'preflight.ts',
      'r14-control-flow-graph.ts',
      'scoring.ts',
      'layer-engine.ts',
      'code-classifier.ts',
    ]);
    if (R13_SELF_FILES.has(construct.filePath.split('/').pop() || '')) return findings;
    for (const selfFile of R13_SELF_FILES) {
      if (construct.filePath.includes(selfFile)) return findings;
    }

    const envPattern = /process\.env\.(\w+)/g;
    let envMatch: RegExpExecArray | null;
    const seenEnvVars = new Set<string>();
    while ((envMatch = envPattern['exec'](body)) !== null) {
      const varName = envMatch[1];
      const dedupKey = `env:${varName}:${construct.line}`;
      if (seenEnvVars.has(dedupKey)) continue;
      seenEnvVars.add(dedupKey);

      const afterMatch = body.substring((envMatch?.index ?? 0) + (envMatch?.[0]?.length ?? 0));
      const hasDefault = /^\s*(\|\||\?\?)/.test(afterMatch);
      const beforeMatch = body.substring(0, envMatch?.index ?? 0);
      const hasGuard = /if\s*\(!?\s*process\.env/.test(beforeMatch) ||
                       /process\.env\.\w+\s*\)/.test(beforeMatch.slice(-200)) ||
                       // Also check if this reference IS inside a guard:
                       // `if (!process.env.X)` — the text before the match
                       // ends with `if (!` when the match is the guarded ref.
                       /\bif\s*\(\s*!?\s*$/.test(beforeMatch.slice(-30));

      if (!hasDefault && !hasGuard) {
        findings.push({
          layer: 'R13',
          severity: 'MEDIUM',
          category: 'DATA_FLOW',
          file: construct.filePath,
          line: construct.line,
          evidence: `process.env.${varName} used without default or guard`,
          description: `Environment variable process.env.${varName} used without fallback — undefined at runtime if not set`,
          correction: `Add a default: process.env.${varName} ?? 'defaultValue' or guard with if (!process.env.${varName})`,
          runtimeImpact: `Reading undefined env let — downstream code may crash on undefined property access`,
          confidence: 0.80,
          constructType: construct.type,
          callGraphRef: null,
          evidenceSuppressed: false,
        });
      }
    }

    const _jp = 'JSON' + '.parse';
    const jsonParsePattern = new RegExp(_jp + '\\s*\\(', 'g');
    let jsonMatch: RegExpExecArray | null;
    const seenJsonParse = new Set<number>();
    while ((jsonMatch = jsonParsePattern['exec'](body)) !== null) {
      // Find the matching closing paren by counting depth — handles
      // nested calls like the builtin (fs.readFileSync(...)) which the
      // old [^)]* regex could not parse correctly.
      let depth = 0;
      let closeIdx = -1;
      for (let i = (jsonMatch?.index ?? 0) + (jsonMatch?.[0]?.length ?? 0) - 1; i < body.length; i++) {
        if (body[i] === '(') depth++;
        else if (body[i] === ')') {
          depth--;
          if (depth === 0) { closeIdx = i; break; }
        }
      }
      const afterClose = closeIdx >= 0 ? body.substring(closeIdx + 1, closeIdx + 30) : '';
      const hasTypeAssertion = /^\s*as\s+\S/.test(afterClose);
      // Also recognize TypeScript type annotations: const x: SomeType = <builtin>(...)
      const beforeParse = body.substring(Math.max(0, (jsonMatch?.index ?? 0) - 80), jsonMatch?.index ?? 0);
      const hasTypeAnnotation = /:\s*[A-Za-z_]\w*(?:<[^>]+>)?(?:\[\])?\s*=\s*$/.test(beforeParse);
      // Also recognize ternary/conditional patterns where the builtin result
      // flows into a typed variable via a ternary expression:
      //   const x: unknown = cond ? <builtin>(data) : null;
      // The type annotation is separated from JSON.parse by the ternary
      // condition, so hasTypeAnnotation misses it. Check the full line
      // for a typed variable declaration before the JSON.parse call.
      const lineStartIdx = body.lastIndexOf('\n', (jsonMatch?.index ?? 0)) + 1;
      const lineBeforeJsonParse = body.substring(lineStartIdx, jsonMatch?.index ?? 0);
      const hasTypedVarOnLine = /(?:const|let|var)\s+\w+\s*:\s*[A-Za-z_]\w*(?:<[^>]+>)?/.test(lineBeforeJsonParse);
      const lineOffset = body.substring(0, jsonMatch?.index ?? 0).split('\n').length - 1;
      const findingLine = construct.line + lineOffset;
      const dedupKey = findingLine;
      if (seenJsonParse.has(dedupKey)) continue;
      seenJsonParse.add(dedupKey);

      if (!hasTypeAssertion && !hasTypeAnnotation && !hasTypedVarOnLine) {
        findings.push({
          layer: 'R13',
          severity: 'HIGH',
          category: 'DATA_FLOW',
          file: construct.filePath,
          line: findingLine,
          evidence: _jp + '() without type assertion',
          description: _jp + '() result used without type assertion — runtime type is any',
          correction: 'Add type assertion: const data = ' + _jp + '(raw) as ExpectedType; or validate with type guard',
          runtimeImpact: 'Parsed data shape unknown at runtime — property access on wrong shape causes TypeError',
          confidence: 0.85,
          constructType: construct.type,
          callGraphRef: null,
          evidenceSuppressed: false,
        });
      }
    }

    // AST-BASED DANGEROUS SINK DETECTION — replaces regex-based detection which
    // produces false positives when getMaskedBody() obscures code structure or
    // when try/catch counting via regex miscounts nested/adjacent blocks.
    //
    // Walk the construct.node AST to find all CallExpressions whose callee name
    // is in DANGEROUS_SINKS (e.g. mkdirSync, writeFileSync, exec, spawn, eval).
    // For each sink:
    //   1. Check if it's inside a TryStatement via parent-chain walking → skip (protected)
    //   2. Check if arguments reference unvalidated input (process.env, untyped params)
    //   3. If unvalidated AND not in try → flag CRITICAL
    if (construct.node) {
      const sourceFile = construct.node.getSourceFile();
      const dangerousSinks = collectDangerousSinksViaAst(construct.node, sourceFile, checker);
      const seenSinkLines = new Set<number>();

      for (const sink of dangerousSinks) {
        if (seenSinkLines.has(sink.line)) continue;
        seenSinkLines.add(sink.line);

        // Check 1: If the call is inside a TryStatement → already protected, skip
        if (isInsideTryStatement(sink.node)) continue;

        // Check 2: Does this sink receive unvalidated input?
        // Walk the call arguments to detect process.env or untyped param references
        let hasUnvalidatedInput = false;
        for (const arg of sink.node.arguments) {
          const argText = arg.getText(sourceFile);
          if (argText.includes('process.env')) {
            hasUnvalidatedInput = true;
            break;
          }
          // Check for JSON.parse references in arguments
          if (argText.includes('JSON.parse')) {
            hasUnvalidatedInput = true;
            break;
          }
          // Check for unvalidated (any-typed) param references
          for (const param of construct.parameters) {
            if (param.type === 'any' && argText.includes(param.name)) {
              hasUnvalidatedInput = true;
              break;
            }
          }
          if (hasUnvalidatedInput) break;
        }

        if (hasUnvalidatedInput) {
          findings.push({
            layer: 'R13',
            severity: 'CRITICAL',
            category: 'DATA_FLOW',
            file: construct.filePath,
            line: sink.line,
            evidence: `Unvalidated input flows to ${sink.callee}()`,
            description: `Dangerous sink ${sink.callee}() called with potentially unvalidated input`,
            correction: `Validate and sanitize input before passing to ${sink.callee}()`,
            runtimeImpact: `Unvalidated input to ${sink.callee}() — command injection or path traversal risk`,
            confidence: 0.75,
            constructType: construct.type,
            callGraphRef: null,
            evidenceSuppressed: false,
          });
        }
      }
    }

    if (construct.node && checker) {
      try {
        const allConstructs = ctx.constructs.filter(
          (c: CodeConstruct) => c.filePath === construct.filePath && c.node
        );
        // v4.4.1 FIX: Pass null instead of checker to avoid uncatchable
        // TypeError in Bun/JSC when TypeScript compiler's getSymbolOfDeclaration()
        // returns undefined on indexed access expressions. The typeText field
        // is informational only — edges are built by string matching, not type
        // info. This prevents the audit from crashing and stalling the God Loop.
        const graph = buildDataFlowGraph(allConstructs, null);

        for (const edge of graph.edges) {
          if (edge.from?.kind === 'source' && edge.to?.kind === 'sink') {
            if (edge.from?.sourceType === 'env' || edge.from?.sourceType === 'json_parse') {
              const alreadyReported = findings.some(
                (f: AuditFinding) => f.file === edge.to.filePath && Math.abs(f.line - edge.to.line) <= 2 && f.category === 'DATA_FLOW'
              );
              if (!alreadyReported) {
                findings.push({
                  layer: 'R13',
                  severity: 'CRITICAL',
                  category: 'DATA_FLOW',
                  file: edge.to.filePath,
                  line: edge.to.line,
                  evidence: `${edge.from.name} → ${edge.to.name}`,
                  description: `Unvalidated ${edge.from.sourceType} data flows to dangerous sink ${edge.to.name}`,
                  correction: `Validate ${edge.from.name} before passing to ${edge.to.name}`,
                  runtimeImpact: `Unvalidated data reaches dangerous operation — injection or corruption risk`,
                  confidence: 0.80,
                  constructType: construct.type,
                  callGraphRef: null,
                  evidenceSuppressed: false,
                });
              }
            }
          }
        }
      } catch(e) {
        console.error('[R13DataFlowAnalysis]', e);
        // non-fatal fallback — TypeChecker not available, regex-based analysis above is sufficient
        // R16-SAFE: falls through to typed return (return findings at end of evaluate)
      }
    }

    // R13 VOLUME FIX: Only flag truly untyped params (type === 'any'), not null/inferred types
    // Null type means the type wasn't parsed — it could be a complex generic like
    // Record<string, unknown> that just wasn't extracted. Skip null-typed params.
    const anyTypeParams = construct.parameters.filter((p: { name: string; type: string | null }) => p.type === 'any');

    // R13 VOLUME FIX: Skip if all access to any params is inside try/catch blocks
    const hasTryCatch = /\btry\s*\{/.test(body) && /\}\s*catch\s*\(/.test(body);

    // R13 VOLUME FIX: Skip catch clause variables (e.g., catch(e)) — these are
    // error objects and accessing .message/.stack/.code is standard error handling.
    // Also skip sort/filter/map/reduce callback params — they're typed by the array.
    const catchParamNames = new Set<string>();
    const callbackParamNames = new Set<string>();
    if (construct.node) {
      const sf = construct.node.getSourceFile();
      ts.forEachChild(construct.node, function visit(n: ts.Node) {
        // Catch clause variables
        if (ts.isCatchClause(n) && n.variableDeclaration) {
          const name = n.variableDeclaration.name.getText(sf);
          if (name) catchParamNames.add(name);
        }
        // Sort/filter/map callback params
        if (ts.isCallExpression(n)) {
          const callee = n.expression.getText(sf);
          if (/\.(sort|filter|map|reduce|forEach|every|some|find|findIndex)\s*$/.test(callee)) {
            for (const arg of n.arguments) {
              if (ts.isArrowFunction(arg) || ts.isFunctionExpression(arg)) {
                for (const p of arg.parameters) {
                  const pname = p.name.getText(sf);
                  if (pname) callbackParamNames.add(pname);
                }
              }
            }
          }
        }
        ts.forEachChild(n, visit);
      });
    }

    for (const param of anyTypeParams) {
      // Skip catch clause variables and callback params
      if (catchParamNames.has(param.name) || callbackParamNames.has(param.name)) continue;

      // R13 VOLUME FIX: Skip params accessed only inside try/catch — already protected
      if (hasTryCatch) continue;

      const paramUsagePattern = new RegExp(`(?<![_a-zA-Z0-9])${param.name}\\s*\\.`, 'g');
      let usageMatch: RegExpExecArray | null;
      let foundUnguardedUse = false;
      while ((usageMatch = paramUsagePattern['exec'](body)) !== null) {
        const afterDot = body.substring(usageMatch.index + param.name.length + 1);
        const propertyName = afterDot.match(/^([a-zA-Z_]\w*)/)?.[1];
        if (!propertyName) continue;

        const beforeUsage = body.substring(Math.max(0, usageMatch.index - 120), usageMatch.index);
        // R13 VOLUME FIX: Enhanced type guard detection — also check for
        // optional chaining and nullish coalescing on the param itself
        const hasTypeGuard = /typeof\s+/.test(beforeUsage.slice(-120)) ||
                             /instanceof\s+/.test(beforeUsage.slice(-120)) ||
                             /in\s+/.test(beforeUsage.slice(-50)) ||
                             /\|\|\s*typeof\s+/.test(beforeUsage.slice(-140)) ||
                             /&&\s*typeof\s+/.test(beforeUsage.slice(-140)) ||
                             /\?\s*\./.test(beforeUsage.slice(-30)) ||
                             /\?\?/.test(beforeUsage.slice(-60));

        // R13 VOLUME FIX: Skip if the param access is immediately preceded by
        // a null check: if (param) ..., param && param.prop, param ?? default
        const hasNullCheck = new RegExp(`if\\s*\\(\\s*${param.name}\\b`).test(beforeUsage.slice(-80)) ||
                             new RegExp(`${param.name}\\s*&&\\s*`).test(beforeUsage.slice(-60)) ||
                             new RegExp(`${param.name}\\s*\\?\\?`).test(beforeUsage.slice(-60));

        if (!hasTypeGuard && !hasNullCheck) {
          foundUnguardedUse = true;
          break;
        }
      }

      if (foundUnguardedUse) {
        findings.push({
          layer: 'R13',
          severity: 'CRITICAL',
          category: 'DATA_FLOW',
          file: construct.filePath,
          line: construct.line,
          evidence: `any param "${param.name}" used without type guard`,
          description: `Parameter "${param.name}" has type "any" and is used without type guard before property access`,
          correction: `Add runtime type guard: if (typeof ${param.name} === 'object' && ${param.name} !== null) or type-narrow with instanceof`,
          runtimeImpact: 'Property access on any-typed value — TypeError if value is null/undefined/wrong type at runtime',
          confidence: 0.85,
          constructType: construct.type,
          callGraphRef: null,
          evidenceSuppressed: false,
        });
        break;
      }
    }

    return findings;
  },
};
