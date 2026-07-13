import { LayerRule, CodeConstruct, AnalysisContext, AuditFinding, ConstructType } from '../types.ts';

export const R10_INVOCATION_INTEGRITY: LayerRule = {
  layer: 'R10',
  name: 'Invocation Integrity',
  description: 'Detects dead enforcement functions and discarded return values via call graph',
  applicableTo: [ConstructType.FUNCTION_DECLARATION, ConstructType.METHOD_DECLARATION, ConstructType.ARROW_FUNCTION],
  enabled: true,

  evaluate(construct: CodeConstruct | null, ctx: AnalysisContext): AuditFinding[] {
    if (!construct) return [];
    if (!construct.isDefinition) return [];
    const findings: AuditFinding[] = [];

    const fnName = construct.name;
    if (!isEnforcementFunction(fnName)) return findings;

    // E16: Skip arrow functions that are callbacks inside expressions.
    // extractArrowFunctionName() walks up to the nearest VariableDeclaration or
    // PropertyAssignment and returns the OUTER name — not the arrow function's
    // own identity. A callback inside `.filter()` named "filtered" is NOT a
    // function named "filtered"; it's a lambda that happens to be inside a
    // variable declaration called "filtered". Only arrow functions that are
    // direct values of declarations get meaningful names worth auditing.
    if (construct.type === ConstructType.ARROW_FUNCTION) {
      const parentType = construct.parent?.type;
      if (parentType &&
          parentType !== ConstructType.VARIABLE_DECLARATION &&
          parentType !== ConstructType.PROPERTY_ASSIGNMENT) {
        return findings;
      }
    }

    const callSites = findCallSites(fnName, ctx);
    const isExported = construct.modifiers.includes('export');
    const isPrivate = construct.modifiers.includes('private') || construct.modifiers.includes('protected');
    const callGraphSize = ctx.callGraph.entries.size;
    const callGraphReliable = callGraphSize >= 50;

    if (isPrivate) return findings;

    // E16: Suppress false positives for functions invoked via indirect patterns
    // the call graph cannot trace: this.method(), XState guards, hook/event handlers.
    // The call graph only indexes direct CALL_EXPRESSION and NEW_EXPRESSION nodes;
    // framework-mediated invocations produce no resolvable call sites.
    if (callSites.length === 0 && !isExported && isInvokedIndirectly(fnName, construct, ctx)) {
      return findings;
    }

    if (callSites.length === 0 && !isExported) {
      const confidence = callGraphReliable ? 0.98 : 0.50;
      findings.push({
        layer: 'R10',
        severity: callGraphReliable ? 'CRITICAL' : 'MEDIUM',
        category: 'INVOCATION_INTEGRITY',
        file: construct.filePath,
        line: construct.line,
        evidence: `Function ${fnName} has 0 call sites and is not exported (call graph: ${callGraphSize} entries)`,
        description: `Enforcement function "${fnName}" is never called — dead code that provides no protection`,
        correction: `Add calls to ${fnName}() at enforcement points, or remove if unused`,
        runtimeImpact: 'Enforcement exists in source but never executes — provides zero runtime protection',
        confidence,
        constructType: construct.type,
        callGraphRef: null,
        evidenceSuppressed: false,
      });
    }

    if (callSites.length > 0 && callGraphReliable) {
      const allDiscarded = callSites.every((cs: CallSiteInfo) => !cs.returnValueUsed);
      if (allDiscarded && !construct.returnType?.includes('void') && !construct.returnType?.includes('undefined')) {
        findings.push({
          layer: 'R10',
          severity: 'HIGH',
          category: 'INVOCATION_INTEGRITY',
          file: construct.filePath,
          line: construct.line,
          evidence: `${fnName}() called ${callSites.length} times — return value discarded at every call site`,
          description: `Enforcement function "${fnName}" returns a value but it is never checked — result ignored`,
          correction: `Capture and check the return value: const result = ${fnName}(); if (!result.valid) ...`,
          runtimeImpact: 'Enforcement function runs but its verdict is ignored — same as not running it',
          confidence: 0.85,
          constructType: construct.type,
          callGraphRef: null,
          evidenceSuppressed: false,
        });
      }
    }

    return findings;
  },
};

function isEnforcementFunction(name: string): boolean {
  const lower = name.toLowerCase();
  // E8: Expanded to 30+ keywords including authorization, authentication, validation terms
  const keywords = [
    'check', 'verify', 'validate', 'enforce', 'guard', 'gate', 'block',
    'isallowed', 'canproceed', 'isblocked', 'shouldblock',
    'authorize', 'permit', 'reject', 'filter', 'sanitize', 'transform',
    'restrict', 'require', 'assert', 'ensure', 'confirm',
    'authenticate', 'allow', 'deny',
  ];
  return keywords.some((en: string) => lower.includes(en));
}

interface CallSiteInfo {
  file: string;
  line: number;
  returnValueUsed: boolean;
}

function findCallSites(fnName: string, ctx: AnalysisContext): CallSiteInfo[] {
  const sites: CallSiteInfo[] = [];

  for (const [key, entry] of ctx.callGraph.entries) {
    if (entry.calleeName === fnName || entry.calleeName.endsWith(`.${fnName}`)) {
      for (const cs of entry.callSites) {
        sites.push({
          file: cs.callSiteFile,
          line: cs.callSiteLine,
          returnValueUsed: cs.returnValueUsed,
        });
      }
    }
  }

  return sites;
}

// ─────────────────────────────────────────────────────────────────────────────
// E16: Indirect invocation detection — patterns the call graph cannot trace.
//
// buildCallGraph() only indexes CALL_EXPRESSION and NEW_EXPRESSION nodes.
// Enforcement functions are frequently invoked via framework-mediated patterns
// that produce no direct, resolvable call site:
//
//   1. this.method()      — PropertyAccessExpression with `this` receiver.
//                           The call graph may index the call but fail to
//                           resolve it to the definition when the TypeChecker
//                           cannot resolve `this`-qualified access.
//
//   2. XState guards      — Functions referenced as `guard: fnName` or
//                           `cond: fnName` in state machine transition configs.
//                           Invoked by the XState runtime, not application code.
//
//   3. Hook registrations — Functions assigned as values in event-handler maps
//                           (`'event.name': handlerFn`) or passed to event
//                           listeners (`.on('event', handlerFn)`). Invoked by
//                           the event system at runtime.
//
// Each pattern is checked independently. If ANY matches, the function is
// considered invoked and excluded from the dead-code finding.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * E16: Returns true if the function is invoked via any indirect pattern
 * that the call graph cannot trace.
 */
function isInvokedIndirectly(
  fnName: string,
  construct: CodeConstruct,
  ctx: AnalysisContext,
): boolean {
  if (isCalledViaThis(fnName, ctx)) return true;
  if (isXStateGuardReference(fnName, construct, ctx)) return true;
  if (isHookOrEventHandler(fnName, ctx)) return true;
  return false;
}

/**
 * Pattern 1: this.method() — method invoked on a `this` receiver.
 *
 * Scans every construct's source text for `this.<fnName>(` or
 * `this.<fnName>.` (property access used as callback, e.g.
 * `this.checkSecurity.bind(this)`).
 */
function isCalledViaThis(fnName: string, ctx: AnalysisContext): boolean {
  return ctx.constructs.some(
    (c: CodeConstruct) =>
      !!c.body &&
      (c.body.includes(`this.${fnName}(`) ||
        c.body.includes(`this.${fnName}.`)),
  );
}

/**
 * Pattern 2: XState guard/cond reference.
 *
 * Sub-pattern A — Named function used as a guard value:
 *   { target: 'next', guard: myGuardFn }
 *   { target: 'next', cond:  myGuardFn }
 *
 * Sub-pattern B — Construct defined inside an XState config block.
 * Inline arrow functions used as guards have their parent construct
 * (a PropertyAssignment or ObjectLiteral) whose body contains
 * `guard:` / `cond:` / `always:` / `target:` keywords.
 */
function isXStateGuardReference(
  fnName: string,
  construct: CodeConstruct,
  ctx: AnalysisContext,
): boolean {
  // Sub-pattern A: function name appears as a guard/cond value anywhere
  const guardRefRegex = new RegExp(
    `\\b(?:guard|cond)\\s*:\\s*(?:\\(?\\s*)?${fnName}\\b`,
  );
  const matchFound = ctx.constructs.some( // R10 FIX: renamed from 'referencedAsGuard' to avoid self-detection
    (c: CodeConstruct) => !!c.body && guardRefRegex.test(c.body),
  );
  if (matchFound) return true;

  // Sub-pattern B: construct is nested inside an XState config block
  const parentBody = construct.parent?.body || '';
  if (
    parentBody.includes('guard:') ||
    parentBody.includes('cond:') ||
    parentBody.includes('always:') ||
    parentBody.includes('target:')
  ) {
    return true;
  }

  return false;
}

/**
 * Pattern 3: Hook / event handler registration.
 *
 * Sub-pattern A — Object literal property:
 *   'tool.execute.before': myHookHandler,
 *   'chat.message':        onChatMessage,
 *
 * Sub-pattern B — Method-call listener registration:
 *   .on('event', handlerFn)
 *   .addEventListener('event', handlerFn)
 *   .subscribe('event', handlerFn)
 *
 * A general regex covers all `.method('string', fnName)` forms.
 */
function isHookOrEventHandler(fnName: string, ctx: AnalysisContext): boolean {
  // Sub-pattern A: string-key property whose value is the function name
  const propRegex = new RegExp(
    `['"][\\w.]+['"]\\s*:\\s*${fnName}\\b`,
  );

  // Sub-pattern B: method-call listener with string event + function ref
  const listenerRegex = new RegExp(
    `\\.\\w+\\s*\\(\\s*['"][^'"]+['"]\\s*,\\s*${fnName}\\b`,
  );

  return ctx.constructs.some((c: CodeConstruct) => {
    if (!c.body) return false;
    return propRegex.test(c.body) || listenerRegex.test(c.body);
  });
}
