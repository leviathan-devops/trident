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

    const callSites = findCallSites(fnName, ctx);
    const isExported = construct.modifiers.includes('export');
    const isPrivate = construct.modifiers.includes('private') || construct.modifiers.includes('protected');
    const callGraphSize = ctx.callGraph.entries.size;
    const callGraphReliable = callGraphSize >= 50;

    if (isPrivate) return findings;

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
