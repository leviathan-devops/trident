import * as ts from 'typescript';
import { LayerRule, CodeConstruct, AnalysisContext, AuditFinding, ConstructType } from '../types.ts';

const EXTERNAL_PACKAGE_PATTERN = /^[a-zA-Z@]/;
const PATH_SEPARATOR_CONCAT = /['"][^'"]*['"]\s*\+\s*['"\/\\]/;
const PATH_SEPARATOR_IN_STRING = /['"]\/|['"]\\/;
const RESOURCE_OPEN_PATTERNS = [
  'fs.open', 'fs.openSync', 'fs.createReadStream', 'fs.createWriteStream',
  'fs.readdir', 'fs.readdirSync', 'fs.watch', 'fs.watchFile',
  'createReadStream', 'createWriteStream', 'fsOpen', 'openSync',
  'readFileSync', 'writeFileSync', 'appendFileSync',
];
const CLEANUP_PATTERNS = [
  '.close()', '.destroy()', '.end()', '.unwatch()', '.unref()',
  'clearInterval', 'clearTimeout', 'clearImmediate',
  'fs.closeSync', 'fs.close',
];

function hasCleanupInScope(body: string, resourceName: string): boolean {
  for (const pattern of CLEANUP_PATTERNS) {
    if (body.includes(`${resourceName}${pattern}`) || body.includes(`${pattern}(${resourceName}`)) {
      return true;
    }
  }
  return false;
}

function isInTryFinally(body: string, openCallIndex: number): boolean {
  const beforeCall = body.substring(0, openCallIndex);
  const tryCount = (beforeCall.match(/\btry\s*\{/g) || []).length;
  const finallyCount = (beforeCall.match(/\}\s*finally\s*\{/g) || []).length;
  return tryCount > finallyCount;
}

const R16_BIBLE_ENFORCEMENT: LayerRule = {
  layer: 'R16',
  name: 'Bible Enforcement (P1-P11)',
  description: 'Runtime-grade engineering principles encoded as mechanical audit checks',
  applicableTo: [
    ConstructType.FUNCTION_DECLARATION,
    ConstructType.ARROW_FUNCTION,
    ConstructType.METHOD_DECLARATION,
    ConstructType.IMPORT_DECLARATION,
  ],
  enabled: true,

  evaluate(construct: CodeConstruct | null, ctx: AnalysisContext): AuditFinding[] {
    if (!construct) return [];
    const findings: AuditFinding[] = [];
    const body = construct.body;

    // B1: P1 Defensive Import — check external imports without guards
    if (construct.type === ConstructType.IMPORT_DECLARATION) {
      findings.push(...checkDefensiveImport(construct, ctx));
    }

    // B2: P2 Type Certainty — check `as` casts without runtime guards
    findings.push(...checkTypeCertainty(construct, ctx));

    // B3: P3 Error Completeness — enhanced empty catch detection
    if (construct.type === ConstructType.CATCH_CLAUSE ||
        body.includes('catch') ||
        body.includes('.catch(')) {
      findings.push(...checkErrorCompleteness(construct, ctx));
    }

    // B4: P4 Resource Lifecycle — check open/create without cleanup
    findings.push(...checkResourceLifecycle(construct, ctx));

    // B5: P5 Atomic State — check multi-line state mutations
    findings.push(...checkAtomicState(construct, ctx));

    // B7: P7 Path Resolution — check hardcoded paths and string concatenation
    findings.push(...checkPathResolution(construct, ctx));

    // B8: P8 Configuration Validation — check config access without validation
    findings.push(...checkConfigValidation(construct, ctx));

    // B9: P9 Async Discipline — check floating promises
    findings.push(...checkAsyncDiscipline(construct, ctx));

    // B10: P10 Output Contract — check missing returns in catch blocks
    findings.push(...checkOutputContract(construct, ctx));

    // B11: P11 Output IS Work — check success returns without side effects
    findings.push(...checkOutputIsWork(construct, ctx));

    return findings;
  },
};

function checkDefensiveImport(construct: CodeConstruct, _ctx: AnalysisContext): AuditFinding[] {
  const findings: AuditFinding[] = [];
  const importText = construct.body;
  const moduleMatch = importText.match(/from\s+['"]([^'"]+)['"]/);
  if (!moduleMatch) return findings;
  const modulePath = moduleMatch[1];

  if (EXTERNAL_PACKAGE_PATTERN.test(modulePath) && !modulePath.startsWith('typescript')) {
    const surroundingConstructs = _ctx.constructs.filter(
      c => c.filePath === construct.filePath && Math.abs(c.line - construct.line) <= 5
    );
    const hasTryCatch = surroundingConstructs.some(c =>
      c.type === ConstructType.TRY_STATEMENT && Math.abs(c.line - construct.line) <= 3
    );
    const isBuiltinOrWellKnown = [
      'fs', 'node:fs', 'path', 'node:path', 'crypto', 'node:crypto', 'os', 'node:os',
      'util', 'node:util', 'stream', 'node:stream', 'http', 'node:http', 'https', 'node:https',
      'child_process', 'node:child_process', 'events', 'node:events', 'url', 'node:url',
      'buffer', 'node:buffer', 'process', 'node:process', 'net', 'node:net',
      'tls', 'node:tls', 'dns', 'node:dns', 'zlib', 'node:zlib', 'querystring', 'node:querystring',
      'readline', 'node:readline', 'repl', 'node:repl', 'vm', 'node:vm', 'worker_threads', 'node:worker_threads',
      'assert', 'node:assert', 'perf_hooks', 'node:perf_hooks', 'cluster', 'node:cluster',
      'dgram', 'node:dgram', 'console', 'node:console', 'string_decoder', 'node:string_decoder',
      'timers', 'node:timers', 'tty', 'node:tty',
      '@opencode-ai/plugin', 'zod',
    ].some(b => modulePath === b || modulePath.startsWith(`${b}/`));

    if (!hasTryCatch && !isBuiltinOrWellKnown) {
      const hasDynamicImport = _ctx.constructs.some(c =>
        c.body.includes(`require('${modulePath}')`) ||
        c.body.includes(`require("${modulePath}")`) ||
        c.body.includes(`import('${modulePath}')`)
      );
      if (!hasDynamicImport) {
        findings.push({
          layer: 'R16',
          severity: 'LOW',
          category: 'DEFENSIVE_IMPORT',
          file: construct.filePath,
          line: construct.line,
          evidence: `import from '${modulePath}' without try/catch guard`,
          description: `External package '${modulePath}' imported without defensive guard — module may not exist in target environment`,
          correction: `Wrap import in try/catch or use dynamic import() with fallback for optional dependencies`,
          runtimeImpact: `If '${modulePath}' is missing, the entire module fails to load — no graceful degradation`,
          confidence: 0.60,
          constructType: construct.type,
          callGraphRef: null,
          evidenceSuppressed: false,
        });
      }
    }
  }
  return findings;
}

function checkTypeCertainty(construct: CodeConstruct, _ctx: AnalysisContext): AuditFinding[] {
  const findings: AuditFinding[] = [];
  const body = construct.body;

  const asCastPattern = /\bas\s+([A-Z][a-zA-Z0-9]*(?:<[^>]+>)?(?:\[\])?)/g;
  let match;
  const seen = new Set<number>();
  while ((match = asCastPattern.exec(body)) !== null) {
    const castType = match[1];
    if (['const', 'let', 'var', 'any', 'unknown', 'never'].includes(castType)) continue;

    const beforeCast = body.substring(Math.max(0, match.index - 200), match.index);
    const hasRuntimeCheck =
      /typeof\s+/.test(beforeCast) ||
      /instanceof\s+/.test(beforeCast) ||
      /Array\.isArray/.test(beforeCast) ||
      /in\s+\w+\s*$/.test(beforeCast.trim()) ||
      /\!\==\s*null/.test(beforeCast) ||
      /\!\==\s*undefined/.test(beforeCast);

    const lineOffset = body.substring(0, match.index).split('\n').length - 1;
    const findingLine = construct.line + lineOffset;
    const dedupKey = findingLine;
    if (seen.has(dedupKey)) continue;
    seen.add(dedupKey);

    if (!hasRuntimeCheck) {
      findings.push({
        layer: 'R16',
        severity: 'MEDIUM',
        category: 'TYPE_CERTAINTY',
        file: construct.filePath,
        line: findingLine,
        evidence: `as ${castType} without preceding runtime type check`,
        description: `Type assertion 'as ${castType}' used without runtime validation — value may not match asserted type at runtime`,
        correction: `Add a runtime check before the assertion: if (typeof val === 'object' && val !== null) or use a type guard function`,
        runtimeImpact: `If value doesn't match ${castType}, downstream code will access non-existent properties — TypeError at runtime`,
        confidence: 0.75,
        constructType: construct.type,
        callGraphRef: null,
        evidenceSuppressed: false,
      });
    }
  }
  return findings;
}

function checkErrorCompleteness(construct: CodeConstruct, _ctx: AnalysisContext): AuditFinding[] {
  const findings: AuditFinding[] = [];
  const body = construct.body;

  const catchBlockPattern = /catch\s*\(\s*(\w+)\s*\)\s*\{([^}]*(?:\{[^}]*\}[^}]*)*)\}/g;
  let match;
  while ((match = catchBlockPattern.exec(body)) !== null) {
    const catchVar = match[1];
    const catchBody = match[2].trim();

    if (catchBody.length === 0) {
      const lineOffset = body.substring(0, match.index).split('\n').length - 1;
      findings.push({
        layer: 'R16',
        severity: 'HIGH',
        category: 'ERROR_COMPLETENESS',
        file: construct.filePath,
        line: construct.line + lineOffset,
        evidence: `catch(${catchVar}) {} — empty catch block`,
        description: `Empty catch block for variable '${catchVar}' — error silently swallowed with no handling`,
        correction: `Add error handling: log, recover, or re-throw. catch(${catchVar}) { console.error("[component] failed:", ${catchVar}); }`,
        runtimeImpact: `Error completely invisible — debugging impossible when failure occurs`,
        confidence: 0.95,
        constructType: construct.type,
        callGraphRef: null,
        evidenceSuppressed: false,
      });
      continue;
    }

    const catchBodyLower = catchBody.toLowerCase();
    const hasOnlyLog =
      (catchBodyLower.includes('console.error') || catchBodyLower.includes('console.warn') || catchBodyLower.includes('console.log')) &&
      !catchBodyLower.includes('throw') &&
      !catchBodyLower.includes('return') &&
      !catchBodyLower.includes('recover') &&
      !catchBodyLower.includes('retry') &&
      !catchBodyLower.includes('fallback');

    if (hasOnlyLog) {
      const lineOffset = body.substring(0, match.index).split('\n').length - 1;
      findings.push({
        layer: 'R16',
        severity: 'MEDIUM',
        category: 'ERROR_COMPLETENESS',
        file: construct.filePath,
        line: construct.line + lineOffset,
        evidence: `catch(${catchVar}) logs but doesn't re-throw or recover`,
        description: `Catch block only logs '${catchVar}' without re-throwing or recovering — caller assumes success`,
        correction: `Either re-throw the error after logging, return an error result, or add recovery logic`,
        runtimeImpact: `Error logged but execution continues as if nothing happened — state may be inconsistent`,
        confidence: 0.80,
        constructType: construct.type,
        callGraphRef: null,
        evidenceSuppressed: false,
      });
    }
  }
  return findings;
}

function checkResourceLifecycle(construct: CodeConstruct, _ctx: AnalysisContext): AuditFinding[] {
  const findings: AuditFinding[] = [];
  const body = construct.body;

  for (const openPattern of RESOURCE_OPEN_PATTERNS) {
    const regex = new RegExp(`(?:const|let|var)\\s+(\\w+)\\s*=\\s*(?:.*?\\.)?${escapeRegex(openPattern)}\\s*\\(`, 'g');
    let match;
    while ((match = regex.exec(body)) !== null) {
      const resourceName = match[1];
      if (hasCleanupInScope(body, resourceName)) continue;
      if (isInTryFinally(body, match.index)) continue;

      const lineOffset = body.substring(0, match.index).split('\n').length - 1;
      findings.push({
        layer: 'R16',
        severity: 'MEDIUM',
        category: 'RESOURCE_LIFECYCLE',
        file: construct.filePath,
        line: construct.line + lineOffset,
        evidence: `${resourceName} = ${openPattern}() without cleanup in finally`,
        description: `Resource '${resourceName}' opened via ${openPattern}() without cleanup in all code paths`,
        correction: `Wrap in try/finally and call ${resourceName}.close() or ${resourceName}.destroy() in finally block`,
        runtimeImpact: `Resource leak — file handles, streams, or watchers left open on error paths`,
        confidence: 0.75,
        constructType: construct.type,
        callGraphRef: null,
        evidenceSuppressed: false,
      });
    }
  }

  const intervalPattern = /(?:const|let|var)\s+(\w+)\s*=\s*setInterval\s*\(/g;
  let intMatch;
  while ((intMatch = intervalPattern.exec(body)) !== null) {
    const varName = intMatch[1];
    if (body.includes(`clearInterval(${varName}`) || body.includes(`clearInterval(${varName}`)) continue;
    const lineOffset = body.substring(0, intMatch.index).split('\n').length - 1;
    findings.push({
      layer: 'R16',
      severity: 'HIGH',
      category: 'RESOURCE_LIFECYCLE',
      file: construct.filePath,
      line: construct.line + lineOffset,
      evidence: `setInterval assigned to ${varName} without clearInterval`,
      description: `Interval '${varName}' set but never cleared — timer runs forever`,
      correction: `Add clearInterval(${varName}) in a finally block or cleanup function`,
      runtimeImpact: `Memory and CPU leak — interval callback executes indefinitely even after component unmount`,
      confidence: 0.85,
      constructType: construct.type,
      callGraphRef: null,
      evidenceSuppressed: false,
    });
  }
  return findings;
}

function checkAtomicState(construct: CodeConstruct, _ctx: AnalysisContext): AuditFinding[] {
  const findings: AuditFinding[] = [];
  const body = construct.body;

  const stateMutationPattern = /(?:state|entry\.state|this\.state)\.(\w+)\s*=/g;
  const mutations: { property: string; index: number }[] = [];
  let match;
  while ((match = stateMutationPattern.exec(body)) !== null) {
    mutations.push({ property: match[1], index: match.index });
  }

  if (mutations.length >= 2) {
    const firstMutation = mutations[0];
    const secondMutation = mutations[1];
    const between = body.substring(firstMutation.index, secondMutation.index);
    const hasTransactionWrapper =
      between.includes('snapshot') ||
      between.includes('structuredClone') ||
      between.includes('{ ...') ||
      between.includes('Object.assign') ||
      between.includes('rollback');

    if (!hasTransactionWrapper && !body.includes('try') && !body.includes('catch')) {
      const lineOffset = body.substring(0, firstMutation.index).split('\n').length - 1;
      findings.push({
        layer: 'R16',
        severity: 'LOW',
        category: 'ATOMIC_STATE',
        file: construct.filePath,
        line: construct.line + lineOffset,
        evidence: `${mutations.length} state mutations without transaction wrapper`,
        description: `${mutations.length} state mutations without atomicity guarantee — partial state if operation between mutations fails`,
        correction: `Use single-assignment: state = { ...state, prop1: val1, prop2: val2 } or wrap in snapshot/rollback pattern`,
        runtimeImpact: `If an error occurs between mutations, state is partially updated — torn state survives`,
        confidence: 0.60,
        constructType: construct.type,
        callGraphRef: null,
        evidenceSuppressed: false,
      });
    }
  }
  return findings;
}

function checkPathResolution(construct: CodeConstruct, _ctx: AnalysisContext): AuditFinding[] {
  const findings: AuditFinding[] = [];
  const body = construct.body;

  const hardcodedPathPattern = /['"]\/(?:home|Users|tmp|var|etc|usr|root|opt)\//g;
  let match;
  const seen = new Set<number>();
  while ((match = hardcodedPathPattern.exec(body)) !== null) {
    const lineOffset = body.substring(0, match.index).split('\n').length - 1;
    const findingLine = construct.line + lineOffset;
    if (seen.has(findingLine)) continue;
    seen.add(findingLine);

    const beforePath = body.substring(Math.max(0, match.index - 100), match.index);
    const usesPathJoin = beforePath.includes('path.join') || beforePath.includes('path.resolve');
    if (!usesPathJoin) {
      findings.push({
        layer: 'R16',
        severity: 'MEDIUM',
        category: 'PATH_RESOLUTION',
        file: construct.filePath,
        line: findingLine,
        evidence: match[0],
        description: `Hardcoded absolute path '${match[0].slice(1, -1)}' — machine-specific, breaks in containers and other environments`,
        correction: `Use path.join(os.homedir(), ...) or path.resolve(process.cwd(), ...) instead`,
        runtimeImpact: `Path doesn't exist in container/different machine — file operations fail silently or crash`,
        confidence: 0.85,
        constructType: construct.type,
        callGraphRef: null,
        evidenceSuppressed: false,
      });
    }
  }

  if (PATH_SEPARATOR_CONCAT.test(body)) {
    const concatMatch = PATH_SEPARATOR_CONCAT.exec(body);
    if (concatMatch) {
      const lineOffset = body.substring(0, concatMatch.index).split('\n').length - 1;
      findings.push({
        layer: 'R16',
        severity: 'LOW',
        category: 'PATH_RESOLUTION',
        file: construct.filePath,
        line: construct.line + lineOffset,
        evidence: concatMatch[0],
        description: 'Path constructed via string concatenation with separators — platform-dependent',
        correction: 'Use path.join() or path.resolve() for cross-platform path construction',
        runtimeImpact: 'Path separators wrong on different OS — file not found in Windows vs Linux',
        confidence: 0.65,
        constructType: construct.type,
        callGraphRef: null,
        evidenceSuppressed: false,
      });
    }
  }
  return findings;
}

function checkConfigValidation(construct: CodeConstruct, _ctx: AnalysisContext): AuditFinding[] {
  const findings: AuditFinding[] = [];
  const body = construct.body;

  const configAccessPattern = /config\.(\w+)\b/g;
  let match;
  const seen = new Set<string>();
  while ((match = configAccessPattern.exec(body)) !== null) {
    const propName = match[1];
    const dedupKey = `${propName}:${construct.line}`;
    if (seen.has(dedupKey)) continue;
    seen.add(dedupKey);

    if (['then', 'catch', 'constructor', 'prototype', 'hasOwnProperty', 'toString', 'valueOf'].includes(propName)) continue;

    const afterAccess = body.substring(match.index + match[0].length);
    const hasImmediateValidation =
      /^\s*(?:\?\?|\|\|!==?\s|!==?\s*(?:null|undefined)|===?\s*(?:null|undefined)|instanceof|typeof\s)/.test(afterAccess.trim()) ||
      /^\s*\?\./.test(afterAccess);

    if (!hasImmediateValidation) {
      const beforeAccess = body.substring(Math.max(0, match.index - 300), match.index);
      const hasPriorValidation =
        new RegExp(`(?:if|guard|validate|check)\\s*\\(.*?config\\.${propName}`, 's').test(beforeAccess) ||
        new RegExp(`config\\.${propName}\\s*(?:!==?|===?|!=|==)\\s*(?:null|undefined|['"])`, 's').test(beforeAccess);

      if (!hasPriorValidation) {
        findings.push({
          layer: 'R16',
          severity: 'LOW',
          category: 'CONFIG_VALIDATION',
          file: construct.filePath,
          line: construct.line,
          evidence: `config.${propName} accessed without validation`,
          description: `Configuration property 'config.${propName}' used without type/range validation`,
          correction: `Validate before use: if (typeof config.${propName} !== 'string') throw new Error('config.${propName} required')`,
          runtimeImpact: `undefined config.${propName} causes TypeError in downstream code — unclear what was misconfigured`,
          confidence: 0.55,
          constructType: construct.type,
          callGraphRef: null,
          evidenceSuppressed: false,
        });
      }
    }
  }
  return findings;
}

function checkAsyncDiscipline(construct: CodeConstruct, _ctx: AnalysisContext): AuditFinding[] {
  const findings: AuditFinding[] = [];

  if (construct.type !== ConstructType.FUNCTION_DECLARATION &&
      construct.type !== ConstructType.ARROW_FUNCTION &&
      construct.type !== ConstructType.METHOD_DECLARATION) {
    return findings;
  }

  const body = construct.body;

  for (const [key, entry] of _ctx.callGraph.entries) {
    for (const callSite of entry.callSites) {
      if (callSite.callSiteFile !== construct.filePath) continue;
      if (Math.abs(callSite.callSiteLine - construct.line) > 50) continue;

      if (callSite.calleeReturnsPromise && !callSite.hasAwait && !callSite.returnValueUsed) {
        const surrounding = body.substring(
          Math.max(0, body.indexOf(entry.calleeName) - 30),
          body.indexOf(entry.calleeName) + entry.calleeName.length + 30
        );
        const hasCatch = surrounding.includes('.catch');
        if (!hasCatch) {
          findings.push({
            layer: 'R16',
            severity: 'HIGH',
            category: 'ASYNC_DISCIPLINE',
            file: callSite.callSiteFile,
            line: callSite.callSiteLine,
            evidence: `${entry.calleeName}() returns Promise — result discarded, no .catch()`,
            description: `Floating promise: ${entry.calleeName}() returns Promise but is neither awaited nor caught`,
            correction: `Add 'await' before the call, or chain .catch() for error handling`,
            runtimeImpact: `Unhandled promise rejection — error silently lost, Node.js may terminate with unhandled rejection`,
            confidence: 0.85,
            constructType: construct.type,
            callGraphRef: `${entry.calleeFile}:${entry.calleeLine}`,
            evidenceSuppressed: false,
          });
        }
      }
    }
  }
  return findings;
}

function checkOutputContract(construct: CodeConstruct, _ctx: AnalysisContext): AuditFinding[] {
  const findings: AuditFinding[] = [];
  const body = construct.body;

  if (!body.includes('catch') && !body.includes('try')) return findings;

  const returnType = construct.returnType;
  if (!returnType || returnType === 'void') return findings;

  const catchPattern = /catch\s*\([^)]*\)\s*\{/g;
  let catchMatch;
  while ((catchMatch = catchPattern.exec(body)) !== null) {
    const catchStart = catchMatch.index + catchMatch[0].length;
    const afterCatch = body.substring(catchStart);

    let braceDepth = 1;
    let catchEnd = 0;
    for (let i = 0; i < afterCatch.length && braceDepth > 0; i++) {
      if (afterCatch[i] === '{') braceDepth++;
      if (afterCatch[i] === '}') braceDepth--;
      if (braceDepth === 0) catchEnd = i;
    }
    const catchBody = afterCatch.substring(0, catchEnd);

    if (!catchBody.includes('return')) {
      const lineOffset = body.substring(0, catchMatch.index).split('\n').length - 1;
      findings.push({
        layer: 'R16',
        severity: 'HIGH',
        category: 'OUTPUT_CONTRACT',
        file: construct.filePath,
        line: construct.line + lineOffset,
        evidence: `catch block with no return statement — function return type is ${returnType}`,
        description: `Catch block has no return statement but function declares return type '${returnType}' — returns undefined implicitly`,
        correction: `Add a return statement in the catch block matching the function's return type`,
        runtimeImpact: `Function returns undefined instead of declared type — callers get TypeError on property access`,
        confidence: 0.85,
        constructType: construct.type,
        callGraphRef: null,
        evidenceSuppressed: false,
      });
    }
  }
  return findings;
}

function checkOutputIsWork(construct: CodeConstruct, _ctx: AnalysisContext): AuditFinding[] {
  const findings: AuditFinding[] = [];
  const body = construct.body;

  const successReturnPattern = /return\s*\{\s*(success|status|passed|ok)\s*:\s*(true|'done'|'pass'|'ok'|'success'|1)\s*(?:,\s*(message|reason|info)\s*:\s*['"]([^'"]*)['"]\s*)?\}/g;
  let match;
  while ((match = successReturnPattern.exec(body)) !== null) {
    const returnLine = match[0];
    const beforeReturn = body.substring(0, match.index);

    const hasRealWork =
      beforeReturn.includes('await ') ||
      beforeReturn.includes('writeFile') ||
      beforeReturn.includes('writeFileSync') ||
      beforeReturn.includes('execFile') ||
      beforeReturn.includes('fetch(') ||
      beforeReturn.includes('.set(') ||
      beforeReturn.includes('.push(') ||
      beforeReturn.includes('artifacts.set') ||
      beforeReturn.includes('JSON.parse') ||
      beforeReturn.includes('fs.') ||
      beforeReturn.includes('result =') ||
      beforeReturn.includes('response =');

    if (!hasRealWork) {
      const lineOffset = body.substring(0, match.index).split('\n').length - 1;
      findings.push({
        layer: 'R16',
        severity: 'MEDIUM',
        category: 'OUTPUT_IS_WORK',
        file: construct.filePath,
        line: construct.line + lineOffset,
        evidence: returnLine.substring(0, 80),
        description: `Function returns success signal (${returnLine.substring(0, 50)}) without performing any detectable work before the return`,
        correction: `Ensure actual work (I/O, state mutation, computation) happens before returning success. Otherwise return a meaningful error.`,
        runtimeImpact: `Function claims success without doing anything — caller assumes work was done when nothing happened`,
        confidence: 0.70,
        constructType: construct.type,
        callGraphRef: null,
        evidenceSuppressed: false,
      });
    }
  }
  return findings;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export { R16_BIBLE_ENFORCEMENT };
