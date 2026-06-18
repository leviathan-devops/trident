import { LayerRule, CodeConstruct, AnalysisContext, AuditFinding, ConstructType } from '../types.ts';

export const R6_DEPENDENCY_INTEGRITY: LayerRule = {
  layer: 'R6',
  name: 'Dependency Integrity',
  description: 'Detects import issues, ESM/CJS conflicts, and missing dependencies',
  applicableTo: [ConstructType.IMPORT_DECLARATION, ConstructType.CALL_EXPRESSION],
  excludeTypes: [ConstructType.TEMPLATE_EXPRESSION, ConstructType.STRING_LITERAL],
  enabled: true,

  evaluate(construct: CodeConstruct | null, ctx: AnalysisContext): AuditFinding[] {
    if (!construct) return [];
    const findings: AuditFinding[] = [];

    if (construct.type === ConstructType.IMPORT_DECLARATION) {
      const moduleSpecifier = construct.name;

      if (moduleSpecifier.endsWith('.ts') && ctx.tsconfig) {
        const tsconfig = ctx.tsconfig && typeof ctx.tsconfig === 'object' ? ctx.tsconfig as Record<string, unknown> : {};
        const compilerOptions = tsconfig && typeof tsconfig === 'object' ? (tsconfig.compilerOptions as Record<string, unknown> | undefined) : undefined;
        const allowTs = compilerOptions?.allowImportingTsExtensions;
        if (!allowTs) {
          findings.push({
            layer: 'R6',
            severity: 'MEDIUM',
            category: 'DEPENDENCY_INTEGRITY',
            file: construct.filePath,
            line: construct.line,
            evidence: `import from '${moduleSpecifier}'`,
            description: `.ts extension import without allowImportingTsExtensions in tsconfig`,
            correction: 'Set "allowImportingTsExtensions": true in tsconfig.json compilerOptions',
            runtimeImpact: 'tsc will error on build — blocks deployment pipeline',
            confidence: 0.90,
            constructType: construct.type,
            callGraphRef: null,
            evidenceSuppressed: false,
          });
        }
      }

      if (moduleSpecifier.startsWith('.') || moduleSpecifier.startsWith('/')) {
        // local import — ok
      } else if (moduleSpecifier.startsWith('@opencode-ai')) {
        // opencode plugin — ok
      } else if (moduleSpecifier.startsWith('node:')) {
        // E9: node: prefix built-in modules — skip dependency check
      } else if (!moduleSpecifier.startsWith('@opencode-ai')) {
        const NODE_BUILTINS = ['fs', 'path', 'os', 'child_process', 'crypto', 'stream', 'http', 'https', 'net', 'url', 'util', 'events', 'buffer', 'assert', 'cluster', 'dgram', 'dns', 'domain', 'inspector', 'perf_hooks', 'punycode', 'querystring', 'readline', 'repl', 'tls', 'tty', 'v8', 'vm', 'worker_threads', 'zlib', 'module', 'console', 'process', 'timers', 'timers/promises', 'node:test'];
        const BUNDLED_MODULES = ['zod', '@ai-sdk'];
        const baseModule = moduleSpecifier.split('/')[0];
        const isBuiltin = NODE_BUILTINS.includes(baseModule) || baseModule === 'node';
        const isBundled = BUNDLED_MODULES.some((b: string) => moduleSpecifier.startsWith(b));
        if (!isBuiltin && !isBundled && ctx.packageJson) {
          const deps = Object.keys(ctx.packageJson.dependencies || {});
          const devDeps = Object.keys(ctx.packageJson.devDependencies || {});
          const allDeps = [...deps, ...devDeps];
          if (!allDeps.includes(baseModule) && !allDeps.includes(moduleSpecifier)) {
            findings.push({
              layer: 'R6',
              severity: 'HIGH',
              category: 'DEPENDENCY_INTEGRITY',
              file: construct.filePath,
              line: construct.line,
              evidence: `import '${moduleSpecifier}'`,
              description: `Module "${moduleSpecifier}" imported but not in package.json dependencies`,
              correction: `Add "${baseModule}" to package.json dependencies or use a bundled alternative`,
              runtimeImpact: 'Import resolution fails at runtime — module not found error',
              confidence: 0.85,
              constructType: construct.type,
              callGraphRef: null,
              evidenceSuppressed: false,
            });
          }
        }
      }
    }

    if (construct.type === ConstructType.CALL_EXPRESSION && construct.name === 'require') {
      findings.push({
        layer: 'R6',
        severity: 'HIGH',
        category: 'DEPENDENCY_INTEGRITY',
        file: construct.filePath,
        line: construct.line,
        evidence: construct.body.substring(0, 60),
        description: 'require() call found — CJS import in ESM module breaks bundling',
        correction: 'Replace require() with ES import statement',
        runtimeImpact: 'esbuild may not bundle CJS require correctly — runtime import error',
        confidence: 0.95,
        constructType: construct.type,
        callGraphRef: null,
        evidenceSuppressed: false,
      });
    }

    return findings;
  },
};
