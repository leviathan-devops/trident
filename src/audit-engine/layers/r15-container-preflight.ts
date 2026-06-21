import { LayerRule, CodeConstruct, AnalysisContext, AuditFinding, ConstructType } from '../types.ts';

const HARDCODED_PATH_PREFIXES = [
  '/usr/local/bin/',
  '/usr/bin/',
  '/usr/sbin/',
  '/opt/',
  '/home/',
  '/Users/',
  '/var/run/',
  '/etc/',
  '/tmp/',
];

const PATH_CONCAT_PATTERN = /['"]\/(?:home|usr|opt|var|etc|tmp|Users)[^'"]*['"]\s*\+/g;

const RELATIVE_IMPORT_PATTERN = /(?:import|require)\s*\(?['"]\.\/[^'"]*['"]\)?/g;

const REQUIRE_PATTERN = /\brequire\s*\(\s*['"][^'"]+['"]\s*\)/g;

const ENV_PATTERN = /process\.env\.(\w+)/g;

const PATH_LITERAL_PATTERN = /['"]\/(?:home|usr|opt|var|etc|tmp|Users)[^'"]*['"]/g;

export const R15_CONTAINER_PREFLIGHT: LayerRule = {
  layer: 'R15',
  name: 'Container Preflight',
  description: 'Catches environment-specific failures without running a container — env vars, path resolution, bundle integrity',
  applicableTo: [ConstructType.FUNCTION_DECLARATION, ConstructType.ARROW_FUNCTION, ConstructType.METHOD_DECLARATION, ConstructType.CALL_EXPRESSION, ConstructType.STRING_LITERAL, ConstructType.VARIABLE_DECLARATION],
  requireHasBody: true,
  enabled: true,

  evaluate(construct: CodeConstruct | null, ctx: AnalysisContext): AuditFinding[] {
    if (!construct) return [];
    const findings: AuditFinding[] = [];
    const body = construct.body;

    let envMatch: RegExpExecArray | null;
    const seenEnvVars = new Set<string>();
    ENV_PATTERN.lastIndex = 0;
    while ((envMatch = ENV_PATTERN.exec(body)) !== null) {
      const varName = envMatch[1];
      const dedupKey = `${construct.filePath}:${construct.line}:${varName}`;
      if (seenEnvVars.has(dedupKey)) continue;
      seenEnvVars.add(dedupKey);

      const afterEnv = body.substring(envMatch.index + envMatch[0].length);
      const hasDefault = /^\s*(\|\||\?\?)/.test(afterEnv);
      const beforeEnv = body.substring(Math.max(0, envMatch.index - 200), envMatch.index);
      const hasGuard = /if\s*\(\s*!?process\.env/.test(beforeEnv) ||
                       /if\s*\(\s*!?\s*process\.env\.\w+/.test(beforeEnv) ||
                       /process\.env\.\w+\s*\)/.test(beforeEnv.slice(-100));

      if (!hasDefault && !hasGuard) {
        findings.push({
          layer: 'R15',
          severity: 'MEDIUM',
          category: 'CONTAINER_PREFLIGHT',
          file: construct.filePath,
          line: construct.line,
          evidence: `process.env.${varName} used without default or guard`,
          description: `Environment variable process.env.${varName} has no fallback — undefined in container if not set`,
          correction: `Add default: process.env.${varName} ?? 'defaultValue' or guard: if (!process.env.${varName}) throw new Error('${varName} required')`,
          runtimeImpact: `process.env.${varName} is undefined in container — downstream code crashes on undefined access`,
          confidence: 0.80,
          constructType: construct.type,
          callGraphRef: null,
          evidenceSuppressed: false,
        });
      }
    }

    PATH_CONCAT_PATTERN.lastIndex = 0;
    let pathConcatMatch: RegExpExecArray | null;
    // RegExp.exec() — not child_process.exec() — safe sink
    while ((pathConcatMatch = PATH_CONCAT_PATTERN.exec(body)) !== null) {
      const lineOffset = body.substring(0, pathConcatMatch.index).split('\n').length - 1;
      findings.push({
        layer: 'R15',
        severity: 'HIGH',
        category: 'CONTAINER_PREFLIGHT',
        file: construct.filePath,
        line: construct.line + lineOffset,
        evidence: pathConcatMatch[0],
        description: 'Path constructed via string concatenation instead of path.resolve/path.join — breaks in container',
        correction: 'Use path.resolve(rootDir, relativePath) or path.join(__dirname, relativePath)',
        runtimeImpact: 'Concatenated paths may not exist in container filesystem — file not found errors',
        confidence: 0.85,
        constructType: construct.type,
        callGraphRef: null,
        evidenceSuppressed: false,
      });
    }

    if (construct.type === ConstructType.STRING_LITERAL) {
      const value = construct.name;
      for (const prefix of HARDCODED_PATH_PREFIXES) {
        if (value.startsWith(prefix) && value.length > prefix.length) {
          const parent = construct.parent;
          if (parent && parent.type === ConstructType.IMPORT_DECLARATION) continue;

          findings.push({
            layer: 'R15',
            severity: 'MEDIUM',
            category: 'CONTAINER_PREFLIGHT',
            file: construct.filePath,
            line: construct.line,
            evidence: value,
            description: `Hardcoded absolute path "${value}" — will not exist in container`,
            correction: 'Use path.resolve(process.cwd(), ...) or path.join(__dirname, ...) for portable paths',
            runtimeImpact: 'Path does not exist in container — file/binary not found at runtime',
            confidence: 0.85,
            constructType: construct.type,
            callGraphRef: null,
            evidenceSuppressed: false,
          });
          break;
        }
      }
    }

    if (construct.type === ConstructType.CALL_EXPRESSION && construct.name === 'require') {
      const isInsideTry = body.includes('try') && body.indexOf('try') < body.indexOf('require');
      if (!isInsideTry) {
        findings.push({
          layer: 'R15',
          severity: 'MEDIUM',
          category: 'CONTAINER_PREFLIGHT',
          file: construct.filePath,
          line: construct.line,
          evidence: construct.body.substring(0, 80),
          description: 'Unguarded require() call — will throw if module not available in container',
          correction: 'Wrap require() in try/catch or use conditional import with fallback',
          runtimeImpact: 'require() throws MODULE_NOT_FOUND if dependency missing in container — crashes on startup',
          confidence: 0.80,
          constructType: construct.type,
          callGraphRef: null,
          evidenceSuppressed: false,
        });
      }
    }

    RELATIVE_IMPORT_PATTERN.lastIndex = 0;
    let relMatch: RegExpExecArray | null;
    // RegExp.exec() — not child_process.exec() — safe sink
    while ((relMatch = RELATIVE_IMPORT_PATTERN.exec(body)) !== null) {
      const importPath = relMatch[0];
      if (importPath.includes('.ts') || importPath.includes('.js')) {
        findings.push({
          layer: 'R15',
          severity: 'MEDIUM',
          category: 'CONTAINER_PREFLIGHT',
          file: construct.filePath,
          line: construct.line,
          evidence: importPath.substring(0, 60),
          description: 'Relative import may break after bundling — esbuild may not resolve correctly',
          correction: 'Use module imports or ensure bundler handles the relative path correctly',
          runtimeImpact: 'Bundled output may have broken import — module not found at runtime',
          confidence: 0.70,
          constructType: construct.type,
          callGraphRef: null,
          evidenceSuppressed: false,
        });
      }
    }

    if (ctx.opencodeJson && construct.type === ConstructType.CALL_EXPRESSION) {
      const configAccessPatterns = [
        /config\s*\[\s*['"]/,
        /config\s*\.\s*\w+/,
      ];
      for (const pattern of configAccessPatterns) {
        if (pattern.test(body)) {
          const hasValidation = body.includes('if (') || body.includes('??') || body.includes('||') || body.includes('typeof');
          if (!hasValidation) {
            const alreadyReported = findings.some(
              (f: AuditFinding) => f.category === 'CONTAINER_PREFLIGHT' && f.file === construct.filePath && f.line === construct.line
            );
            if (!alreadyReported) {
              findings.push({
                layer: 'R15',
                severity: 'MEDIUM',
                category: 'CONTAINER_PREFLIGHT',
                file: construct.filePath,
                line: construct.line,
                evidence: body.substring(0, 80),
                description: 'Config access without validation — opencode.json config may be null/undefined',
                correction: 'Validate config exists before accessing: if (config?.key) or config.key ?? defaultValue',
                runtimeImpact: 'Config undefined in container — plugin crashes on startup when accessing missing config key',
                confidence: 0.70,
                constructType: construct.type,
                callGraphRef: null,
                evidenceSuppressed: false,
              });
            }
            break;
          }
        }
      }
    }

    return findings;
  },
};
