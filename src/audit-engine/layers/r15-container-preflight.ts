import * as ts from 'typescript';
import { LayerRule, CodeConstruct, AnalysisContext, AuditFinding, ConstructType } from '../types.ts';

const HARDCODED_PATH_PREFIXES = [
  '/usr/local/bin/', '/usr/bin/', '/usr/sbin/', '/opt/',
  '/home/', '/Users/', '/var/run/', '/etc/', '/tmp/',
];

export const R15_CONTAINER_PREFLIGHT: LayerRule = {
  layer: 'R15',
  name: 'Container Preflight',
  description: 'Catches environment-specific failures via AST analysis — env vars without defaults, hardcoded paths, require() without guards, path concatenation',
  applicableTo: [ConstructType.FUNCTION_DECLARATION, ConstructType.ARROW_FUNCTION, ConstructType.METHOD_DECLARATION, ConstructType.CALL_EXPRESSION, ConstructType.STRING_LITERAL, ConstructType.VARIABLE_DECLARATION],
  requireHasBody: true,
  enabled: true,

  evaluate(construct: CodeConstruct | null, ctx: AnalysisContext): AuditFinding[] {
    if (!construct || !construct.node) return [];
    const findings: AuditFinding[] = [];
    const node = construct.node;
    const sf = node.getSourceFile();
    if (!sf) return [];

    const seenEnvVars = new Set<string>();

    function visit(n: ts.Node): void {
      // ── ENV VAR CHECK: process.env.X without default or guard ──
      if (ts.isPropertyAccessExpression(n) &&
          ts.isPropertyAccessExpression(n.expression) &&
          ts.isIdentifier(n.expression.expression) &&
          n.expression.expression.text === 'process' &&
          ts.isIdentifier(n.expression.name) &&
          n.expression.name.text === 'env') {
        const varName = n.name.text;
        const dedupKey = `${construct.filePath}:${construct.line}:${varName}`;
        if (seenEnvVars.has(dedupKey)) { ts.forEachChild(n, visit); return; }
        seenEnvVars.add(dedupKey);

        // Check if wrapped in default: process.env.X ?? '...' or || '...'
        const parent = n.parent;
        const hasDefault =
          (ts.isBinaryExpression(parent) &&
           (parent.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken ||
            parent.operatorToken.kind === ts.SyntaxKind.BarBarToken) &&
           (parent.left === n || (ts.isPropertyAccessExpression(parent.left) && parent.left === n))) ||
          // Check if inside conditional: if (!process.env.X)
          (ts.isPrefixUnaryExpression(parent) && parent.operator === ts.SyntaxKind.ExclamationToken);

        // Check if inside if guard
        let inGuard = false;
        let p: ts.Node | undefined = n.parent;
        while (p && p !== node) {
          if (ts.isIfStatement(p) && ts.isBinaryExpression(p.expression)) {
            // Rough check — if the if statement references process.env
          }
          p = p.parent;
        }

        if (!hasDefault && !inGuard) {
          const pos = ts.getLineAndCharacterOfPosition(sf, n.getStart(sf));
          findings.push({
            layer: 'R15', severity: 'MEDIUM', category: 'CONTAINER_PREFLIGHT',
            file: construct.filePath, line: pos.line + 1,
            evidence: `process.env.${varName} used without ?? default or if guard`,
            description: `Environment variable process.env.${varName} has no fallback — undefined in container if not set`,
            correction: `Add default: process.env.${varName} ?? 'defaultValue' or guard: if (!process.env.${varName}) throw new Error('${varName} required')`,
            runtimeImpact: `process.env.${varName} is undefined in container — downstream code crashes on undefined access`,
            confidence: 0.85, constructType: construct.type, callGraphRef: null, evidenceSuppressed: false,
          });
        }
      }

      // ── HARDCODED PATH CHECK: StringLiteral with absolute path ──
      if (ts.isStringLiteral(n)) {
        const value = n.text;
        for (const prefix of HARDCODED_PATH_PREFIXES) {
          if (value.startsWith(prefix)) {
            // Check if this is inside a require/import call (those are expected)
            let p: ts.Node | undefined = n.parent;
            let inImport = false;
            while (p && p !== node) {
              if (ts.isCallExpression(p) && ts.isIdentifier(p.expression) && p.expression.text === 'require') {
                inImport = true; break;
              }
              if (ts.isImportDeclaration(p) || ts.isExportDeclaration(p)) {
                inImport = true; break;
              }
              p = p.parent;
            }
            if (!inImport) {
              const pos = ts.getLineAndCharacterOfPosition(sf, n.getStart(sf));
              findings.push({
                layer: 'R15', severity: 'HIGH', category: 'CONTAINER_PREFLIGHT',
                file: construct.filePath, line: pos.line + 1,
                evidence: `Hardcoded path: "${value}"`,
                description: `Hardcoded absolute path "${value}" — will not exist in container`,
                correction: 'Use path.join(__dirname, relativePath) or path.resolve(process.cwd(), relativePath)',
                runtimeImpact: 'Path does not exist in container filesystem — file not found error at runtime',
                confidence: 0.90, constructType: construct.type, callGraphRef: null, evidenceSuppressed: false,
              });
            }
            break;
          }
        }
      }

      // ── PATH CONCATENATION: string + path ──
      if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.PlusToken) {
        const leftIsPath = ts.isStringLiteral(n.left) &&
          HARDCODED_PATH_PREFIXES.some(p => (n.left as ts.StringLiteral).text.startsWith(p));
        const rightIsPath = ts.isStringLiteral(n.right) &&
          HARDCODED_PATH_PREFIXES.some(p => (n.right as ts.StringLiteral).text.startsWith(p));
        if (leftIsPath || rightIsPath) {
          const pos = ts.getLineAndCharacterOfPosition(sf, n.getStart(sf));
          findings.push({
            layer: 'R15', severity: 'HIGH', category: 'CONTAINER_PREFLIGHT',
            file: construct.filePath, line: pos.line + 1,
            evidence: `Path concatenation: ${n.getText(sf).substring(0, 80)}`,
            description: 'Path constructed via string concatenation instead of path.resolve/path.join',
            correction: 'Use path.resolve(rootDir, relativePath) or path.join(__dirname, relativePath)',
            runtimeImpact: 'Concatenated paths may not exist in container filesystem',
            confidence: 0.85, constructType: construct.type, callGraphRef: null, evidenceSuppressed: false,
          });
        }
      }

      // ── REQUIRE WITHOUT TRY/CATCH ──
      if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === 'require') {
        // Check if inside a try block
        let p: ts.Node | undefined = n.parent;
        let inTry = false;
        while (p && p !== node) {
          if (ts.isTryStatement(p)) { inTry = true; break; }
          p = p.parent;
        }
        if (!inTry) {
          const pos = ts.getLineAndCharacterOfPosition(sf, n.getStart(sf));
          const arg = n.arguments[0];
          const modName = arg && ts.isStringLiteral(arg) ? arg.text : '?';
          findings.push({
            layer: 'R15', severity: 'HIGH', category: 'CONTAINER_PREFLIGHT',
            file: construct.filePath, line: pos.line + 1,
            evidence: `require('${modName}') without try/catch`,
            description: `require('${modName}') called without error handling — crashes if module missing in container`,
            correction: `Wrap in try/catch or use dynamic import() with error handling`,
            runtimeImpact: `Module '${modName}' may not be installed in container — require throws MODULE_NOT_FOUND`,
            confidence: 0.88, constructType: construct.type, callGraphRef: null, evidenceSuppressed: false,
          });
        }
      }

      // ── PROCESS.ACCESS_MUTATION: process.env.X = value ──
      if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
        if (ts.isPropertyAccessExpression(n.left) || ts.isElementAccessExpression(n.left)) {
          let root: ts.Node = n.left;
          while (ts.isPropertyAccessExpression(root) || ts.isElementAccessExpression(root)) {
            root = (root as any).expression;
          }
          if (ts.isIdentifier(root) && root.text === 'process') {
            const pos = ts.getLineAndCharacterOfPosition(sf, n.getStart(sf));
            findings.push({
              layer: 'R15', severity: 'HIGH', category: 'CONTAINER_PREFLIGHT',
              file: construct.filePath, line: pos.line + 1,
              evidence: `Mutation of ${n.left.getText(sf)}`,
              description: 'Direct mutation of process.env — breaks isolation between plugins in shared runtime',
              correction: 'Use a local config object instead of mutating process.env',
              runtimeImpact: 'Other plugins may read stale or modified env state',
              confidence: 0.90, constructType: construct.type, callGraphRef: null, evidenceSuppressed: false,
            });
          }
        }
      }

      ts.forEachChild(n, visit);
    }

    try {
      visit(node);
    } catch (err) {
      // Non-fatal — AST traversal error on one construct shouldn't crash the audit
    }

    return findings;
  },
};
