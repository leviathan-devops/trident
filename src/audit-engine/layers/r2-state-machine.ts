import { LayerRule, CodeConstruct, AnalysisContext, AuditFinding, ConstructType } from '../types.ts';
import * as ts from 'typescript';

export const R2_STATE_MACHINE: LayerRule = {
  layer: 'R2',
  name: 'State Machine',
  description: 'Detects state machine violations — missing advanceLayer calls before COMPLETE returns',
  applicableTo: [ConstructType.FUNCTION_DECLARATION, ConstructType.METHOD_DECLARATION],
  requireHasBody: true,
  enabled: true,

  evaluate(construct: CodeConstruct | null, ctx: AnalysisContext): AuditFinding[] {
    if (!construct) return [];
    if (construct.name === 'advanceLayer') return [];
    const findings: AuditFinding[] = [];
    const body = construct.body;

    if (!body.includes('advanceLayer') && !body.includes('COMPLETE') && !body.includes('layer')) return findings;

    const hasAdvanceLayer = body.includes('advanceLayer');
    const hasComplete = body.includes('COMPLETE');

    if (hasComplete && !hasAdvanceLayer) {
      findings.push({
        layer: 'R2',
        severity: 'HIGH',
        category: 'STATE_MACHINE',
        file: construct.filePath,
        line: construct.line,
        evidence: `Function ${construct.name} returns COMPLETE without calling advanceLayer()`,
        description: `State machine function "${construct.name}" returns COMPLETE state without advancing the layer`,
        correction: 'Call advanceLayer() before returning COMPLETE to ensure proper state transitions',
        runtimeImpact: 'State machine gets stuck — layer never advances, audit process hangs',
        confidence: 0.85,
        constructType: construct.type,
        callGraphRef: null,
        evidenceSuppressed: false,
      });
    }

    if (hasAdvanceLayer && hasComplete) {
      // E11: Use AST-level control flow analysis instead of 100-char string lookback
      const returnPaths = extractReturnPathsAST(construct);
      for (const retPath of returnPaths) {
        if (retPath.includesComplete && !retPath.pathCallsAdvanceLayer) {
          findings.push({
            layer: 'R2',
            severity: 'HIGH',
            category: 'STATE_MACHINE',
            file: construct.filePath,
            line: retPath.line,
            evidence: retPath.evidence.substring(0, 80),
            description: 'Return path to COMPLETE without advanceLayer() call — state machine skips layer',
            correction: 'Ensure advanceLayer() is called before every COMPLETE return path',
            runtimeImpact: 'State machine skips layers on certain code paths — audit is incomplete',
            confidence: 0.80,
            constructType: construct.type,
            callGraphRef: null,
            evidenceSuppressed: false,
          });
        }
      }
    }

    return findings;
  },
};

interface ReturnPathAST {
  line: number;
  evidence: string;
  includesComplete: boolean;
  pathCallsAdvanceLayer: boolean;
}

// E11: AST-level control flow analysis — walk the AST to find return statements
// and check if advanceLayer() is called in the same control flow path
function extractReturnPathsAST(construct: CodeConstruct): ReturnPathAST[] {
  const paths: ReturnPathAST[] = [];
  const node = construct.node as ts.FunctionLikeDeclaration;
  if (!node.body) return paths;

  function walk(n: ts.Node, pathHasAdvanceLayer: boolean): void {
    const sourceFile = n.getSourceFile();
    if (ts.isReturnStatement(n)) {
      const pos = sourceFile ? ts.getLineAndCharacterOfPosition(sourceFile, n.getStart(sourceFile) || n.pos) : null;
      const returnText = n.getText(sourceFile);
      const includesComplete = returnText.includes('COMPLETE');
      paths.push({
        line: construct.line + (pos ? pos.line : 0),
        evidence: returnText.substring(0, 100),
        includesComplete,
        pathCallsAdvanceLayer: pathHasAdvanceLayer,
      });
      return;
    }

    if (ts.isCallExpression(n)) {
      const calleeText = n.expression.getText(sourceFile);
      if (calleeText.includes('advanceLayer')) {
        ts.forEachChild(n, child => walk(child, true));
        return;
      }
    }

    ts.forEachChild(n, child => walk(child, pathHasAdvanceLayer));
  }

  ts.forEachChild(node.body, child => walk(child, false));
  return paths;
}

function extractReturnPathsOld(body: string): string[] {
  const paths: string[] = [];
  const lines = body.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('return ') || trimmed === 'return') {
      const startIdx = body.indexOf(trimmed);
      if (startIdx !== -1) {
        const segment = body.substring(Math.max(0, startIdx - 100), Math.min(body.length, startIdx + trimmed.length + 50));
        paths.push(segment);
      }
    }
  }
  return paths;
}
