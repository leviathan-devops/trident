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

const DANGEROUS_SINKS = new Set([
  'execSync', 'exec', 'spawn', 'execFile',
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
  } catch {
    return 'unknown';
  }
}

function isAnyType(node: ts.Node, checker: ts.TypeChecker | null): boolean {
  if (!checker) return false;
  try {
    const type = checker.getTypeAtLocation(node);
    return (type.flags & ts.TypeFlags.Any) !== 0;
  } catch {
    return false;
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

export const R13_DATA_FLOW_ANALYSIS: LayerRule = {
  layer: 'R13',
  name: 'Data Flow Analysis',
  description: 'Tracks value propagation, flags any→specific and unvalidated→sensitive paths',
  applicableTo: [ConstructType.FUNCTION_DECLARATION, ConstructType.ARROW_FUNCTION, ConstructType.METHOD_DECLARATION],
  requireHasBody: true,
  enabled: true,

  evaluate(construct: CodeConstruct | null, ctx: AnalysisContext): AuditFinding[] {
    if (!construct) return [];
    // Self-audit exclusion: skip audit engine layer files to prevent circular findings
    if (construct.filePath && construct.filePath.includes('/audit-engine/layers/')) return [];
    const findings: AuditFinding[] = [];
    const body = construct.body;

    let checker: ts.TypeChecker | null = null;
    try {
      const node = construct.node;
      if (node) {
        const program = node.getSourceFile()?.fileName
          ? ts.createProgram([node.getSourceFile().fileName], {})
          : null;
        if (program) {
          checker = program.getTypeChecker();
        }
      }
    } catch {
      checker = null;
    }

    const envPattern = /process\.env\.(\w+)/g;
    let envMatch: RegExpExecArray | null;
    const seenEnvVars = new Set<string>();
    while ((envMatch = envPattern.exec(body)) !== null) {
      const varName = envMatch[1];
      const dedupKey = `env:${varName}:${construct.line}`;
      if (seenEnvVars.has(dedupKey)) continue;
      seenEnvVars.add(dedupKey);

      const afterMatch = body.substring(envMatch.index + envMatch[0].length);
      const hasDefault = /^\s*(\|\||\?\?)/.test(afterMatch);
      const beforeMatch = body.substring(0, envMatch.index);
      const hasGuard = /if\s*\(!?\s*process\.env/.test(beforeMatch) ||
                       /process\.env\.\w+\s*\)/.test(beforeMatch.slice(-200));

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
          runtimeImpact: `Reading undefined env var — downstream code may crash on undefined property access`,
          confidence: 0.80,
          constructType: construct.type,
          callGraphRef: null,
          evidenceSuppressed: false,
        });
      }
    }

    const jsonParsePattern = /JSON\.parse\s*\(/g;
    let jsonMatch: RegExpExecArray | null;
    const seenJsonParse = new Set<number>();
    while ((jsonMatch = jsonParsePattern.exec(body)) !== null) {
      const afterParse = body.substring(jsonMatch.index);
      const hasTypeAssertion = /^\s*JSON\.parse\s*\([^)]*\)\s*as\s+/.test(afterParse);
      const lineOffset = body.substring(0, jsonMatch.index).split('\n').length - 1;
      const findingLine = construct.line + lineOffset;
      const dedupKey = findingLine;
      if (seenJsonParse.has(dedupKey)) continue;
      seenJsonParse.add(dedupKey);

      if (!hasTypeAssertion) {
        findings.push({
          layer: 'R13',
          severity: 'HIGH',
          category: 'DATA_FLOW',
          file: construct.filePath,
          line: findingLine,
          evidence: 'JSON.parse() without type assertion',
          description: 'JSON.parse() result used without type assertion — runtime type is any',
          correction: 'Add type assertion: const data = JSON.parse(raw) as ExpectedType; or validate with type guard',
          runtimeImpact: 'Parsed data shape unknown at runtime — property access on wrong shape causes TypeError',
          confidence: 0.85,
          constructType: construct.type,
          callGraphRef: null,
          evidenceSuppressed: false,
        });
      }
    }

    const dangerousPatterns = [
      { call: 'execSync', module: 'child_process' },
      { call: 'exec', module: 'child_process' },
      { call: 'spawn', module: 'child_process' },
      { call: 'writeFileSync', module: 'fs' },
      { call: 'writeFile', module: 'fs' },
      { call: 'mkdirSync', module: 'fs' },
      { call: 'fetch', module: 'global' },
      { call: 'eval', module: 'global' },
    ];

    for (const pattern of dangerousPatterns) {
      const callPattern = new RegExp(`(\\w+)\\s*\\(.*?${pattern.call}\\s*\\(`, 'g');
      let callMatch: RegExpExecArray | null;

      const directCallPattern = new RegExp(`(?<![_a-zA-Z0-9])${pattern.call}\\s*\\(`, 'g');
      let directMatch: RegExpExecArray | null;
      const seenCallLines = new Set<number>();

      while ((directMatch = directCallPattern.exec(body)) !== null) {
        const lineOffset = body.substring(0, directMatch.index).split('\n').length - 1;
        const findingLine = construct.line + lineOffset;
        if (seenCallLines.has(findingLine)) continue;
        seenCallLines.add(findingLine);

        const beforeCall = body.substring(0, directMatch.index);
        const hasEnvInput = beforeCall.includes('process.env') && beforeCall.length > 0;
        const hasParamInput = body.includes('JSON.parse') && construct.parameters.length > 0;

        // Check if input is sanitized before reaching the sink
        const beforeSink = body.substring(0, directMatch.index);
        const isSanitized = (
          beforeSink.includes('Sanitizer.sanitizeShell') ||
          beforeSink.includes('Sanitizer.sanitizePath') ||
          beforeSink.includes('Sanitizer.sanitizeUrl') ||
          beforeSink.includes('Sanitizer.validate') ||
          beforeSink.includes('sanitizeInput') ||
          /typeof\s+\w+\s*===\s*['"]string['"]/.test(beforeSink) ||
          /\w+\s*!==\s*(?:null|undefined)/.test(beforeSink.slice(-100))
        );

        if ((hasEnvInput || hasParamInput) && !isSanitized) {
          findings.push({
            layer: 'R13',
            severity: 'CRITICAL',
            category: 'DATA_FLOW',
            file: construct.filePath,
            line: findingLine,
            evidence: `Unvalidated input flows to ${pattern.call}()`,
            description: `Dangerous sink ${pattern.call}() called with potentially unvalidated input — no Sanitizer check found`,
            correction: `Validate and sanitize input before passing to ${pattern.call}(): Sanitizer.sanitizeShell(input) for shell commands, Sanitizer.sanitizePath(input) for file operations`,
            runtimeImpact: `Unvalidated input to ${pattern.call}() — command injection or path traversal risk`,
            confidence: 0.85,
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
        const graph = buildDataFlowGraph(allConstructs, checker);

        for (const edge of graph.edges) {
          if (edge.from.kind === 'source' && edge.to.kind === 'sink') {
            if (edge.from.sourceType === 'env' || edge.from.sourceType === 'json_parse') {
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
      } catch {
        // TypeChecker unavailable for some constructs — expected, skip
      }
    }

    const anyTypeParams = construct.parameters.filter((p: { name: string; type: string | null }) => p.type === 'any' || p.type === null);
    for (const param of anyTypeParams) {
      const paramUsagePattern = new RegExp(`(?<![_a-zA-Z0-9])${param.name}\\s*\\.`, 'g');
      let usageMatch: RegExpExecArray | null;
      while ((usageMatch = paramUsagePattern.exec(body)) !== null) {
        const afterDot = body.substring(usageMatch.index + param.name.length + 1);
        const propertyName = afterDot.match(/^([a-zA-Z_]\w*)/)?.[1];
        if (!propertyName) continue;

        const beforeUsage = body.substring(0, usageMatch.index);
        const hasTypeGuard = /typeof\s+/.test(beforeUsage.slice(-100)) ||
                             /instanceof\s+/.test(beforeUsage.slice(-100)) ||
                             /in\s+/.test(beforeUsage.slice(-50));

        if (!hasTypeGuard) {
          findings.push({
            layer: 'R13',
            severity: 'CRITICAL',
            category: 'DATA_FLOW',
            file: construct.filePath,
            line: construct.line,
            evidence: `any param "${param.name}" used without type guard: ${param.name}.${propertyName}`,
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
    }

    return findings;
  },
};
