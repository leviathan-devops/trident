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
    // Skip property assignments (XState guards like `guard: ({ context }) => ...`)
    if (construct.parent && construct.parent.type === ConstructType.PROPERTY_ASSIGNMENT) return [];
    // Skip local variables that are not functions
    if (construct.type !== ConstructType.FUNCTION_DECLARATION && construct.type !== ConstructType.METHOD_DECLARATION && construct.type !== ConstructType.ARROW_FUNCTION) return [];
    const findings: AuditFinding[] = [];

    const fnName = construct.name;
    // Skip if name is too generic (likely a local variable, not enforcement)
    if (fnName.length < 4) return [];
    if (!isEnforcementFunction(fnName, construct)) return findings;

    const callSites = findCallSites(fnName, ctx);
    const isExported = construct.modifiers.includes('export');
    const isPrivate = construct.modifiers.includes('private') || construct.modifiers.includes('protected');
    const callGraphSize = ctx.callGraph.entries.size;
    const callGraphReliable = callGraphSize >= 50;

    if (isPrivate) return findings;

    if (callSites.length === 0 && !isExported) {
      // Check if this function is called transitively (through an aggregator)
      const transitivelyCalled = checkTransitiveCall(fnName, construct, ctx);
      if (transitivelyCalled) return findings;
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

function isEnforcementFunction(name: string, construct?: CodeConstruct): boolean {
  const lower = name.toLowerCase();
  
  // Skip property assignments (XState guards like `guard: ({ context }) => ...`)
  if (construct?.parent?.type === ConstructType.PROPERTY_ASSIGNMENT) return false;
  
  // Only match exact or prefix matches, NOT substring matches
  // This prevents 'filtered' from matching 'filter' and 'guardian' from matching 'guard'
  const keywords = [
    'check', 'verify', 'validate', 'enforce', 'guard', 'block',
    'isallowed', 'canproceed', 'shouldblock',
    'authorize', 'sanitize', 'restrict', 'assert', 'deny',
  ];
  return keywords.some((en: string) => lower === en || lower.startsWith(en + '_') || lower.startsWith(en + '.'));
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

// Check if a function is called transitively through an aggregator function.
// Looks for cases where fnName appears in a function body that is itself called.
function checkTransitiveCall(fnName: string, construct: CodeConstruct, ctx: AnalysisContext): boolean {
  const filePath = construct.filePath;
  // Search all constructs in the same file for a function call that includes fnName
  for (const [key, entry] of ctx.callGraph.entries) {
    // Skip if it's the function itself
    if (entry.calleeName === fnName) continue;
    // Check if any call site in this entry references fnName
    for (const cs of entry.callSites) {
      if (cs.callSiteFile === filePath) {
        // Found a call site in the same file that could be the aggregator
        // The aggregator function is entry.calleeName - if it has callers, transitively alive
        for (const [key2, entry2] of ctx.callGraph.entries) {
          for (const cs2 of entry2.callSites) {
            if (entry2.calleeName === entry.calleeName || entry2.calleeName.endsWith(`.${entry.calleeName}`)) {
              return true; // Aggregator is called, so fnName is transitively called
            }
          }
        }
      }
    }
  }
  return false;
}
