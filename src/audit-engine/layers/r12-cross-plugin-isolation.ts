import { LayerRule, CodeConstruct, AnalysisContext, AuditFinding, ConstructType } from '../types.ts';

export const R12_CROSS_PLUGIN_ISOLATION: LayerRule = {
  layer: 'R12',
  name: 'Cross-Plugin Isolation',
  description: 'Detects missing agent guards in hook registrations and identity check inconsistencies',
  applicableTo: [ConstructType.FUNCTION_DECLARATION, ConstructType.ARROW_FUNCTION],
  requireHasBody: true,
  enabled: true,

  evaluate(construct: CodeConstruct | null, ctx: AnalysisContext): AuditFinding[] {
    if (!construct) return [];
    const findings: AuditFinding[] = [];
    const body = construct.body;

    const isHookHandler = body.includes('tool.execute.before') ||
                          body.includes('tool.execute.after') ||
                          body.includes('system.transform') ||
                          body.includes('chat.message') ||
                          body.includes('experimental.chat.system.transform') ||
                          body.includes('hook.register') ||
                          body.includes('registerHook');

    if (!isHookHandler) return findings;

    const hasAgentGuard = body.includes('agent') || body.includes('agentName') || body.includes('input.agent');
    if (!hasAgentGuard) {
      findings.push({
        layer: 'R12',
        severity: 'CRITICAL',
        category: 'CROSS_PLUGIN_ISOLATION',
        file: construct.filePath,
        line: construct.line,
        evidence: `Hook handler "${construct.name}" has no agent guard`,
        description: `Hook handler "${construct.name}" fires for ALL agents — no identity check isolates it to this plugin`,
        correction: 'Add agent identity check at the top: if (input?.agent !== "trident" && input?.name !== "trident") return;',
        runtimeImpact: 'Hook fires for every plugin/agent — side effects leak across plugin boundaries',
        confidence: 0.95,
        constructType: construct.type,
        callGraphRef: null,
        evidenceSuppressed: false,
      });
    }

    if (hasAgentGuard) {
      const correctFields = ['input?.agent', 'input?.name', 'input?.agentName', 'event.agent'];
      const wrongFields = ['session.agent', 'context.agent', 'state.agent', 'ctx.agent'];

      const usesCorrect = correctFields.some(f => body.includes(f));
      const usesWrong = wrongFields.some(f => body.includes(f));

      if (usesWrong && !usesCorrect) {
        findings.push({
          layer: 'R12',
          severity: 'HIGH',
          category: 'CROSS_PLUGIN_ISOLATION',
          file: construct.filePath,
          line: construct.line,
          evidence: `Agent guard uses wrong field in "${construct.name}"`,
          description: 'Agent guard uses non-existent field — correct fields are input.agent, input.name, or input.agentName',
          correction: 'Use input?.agent || input?.name || input?.agentName for agent detection',
          runtimeImpact: 'Agent identity check fails — Trident never activates or always activates',
          confidence: 0.90,
          constructType: construct.type,
          callGraphRef: null,
          evidenceSuppressed: false,
        });
      }
    }

    if (body.includes('trident_') && body.includes('trident-')) {
      findings.push({
        layer: 'R12',
        severity: 'HIGH',
        category: 'CROSS_PLUGIN_ISOLATION',
        file: construct.filePath,
        line: construct.line,
        evidence: 'Mix of underscore and hyphen in agent name prefix',
        description: 'Agent name uses both trident_ and trident- — inconsistent prefix causes identity mismatch',
        correction: 'Pick one convention: either trident- or trident_ — never mix',
        runtimeImpact: 'Identity check passes for one variant but fails for the other — inconsistent behavior',
        confidence: 0.90,
        constructType: construct.type,
        callGraphRef: null,
        evidenceSuppressed: false,
      });
    }

    const identityCheckFunctions: string[] = [];
    const checkPatterns = [
      /function\s+(isTrident|checkAgent|isAgent|verifyAgent|guardAgent)/g,
      /const\s+(isTrident|checkAgent|isAgent|verifyAgent|guardAgent)\s*=/g,
    ];
    for (const pattern of checkPatterns) {
      let m;
      while ((m = pattern.exec(body)) !== null) {
        identityCheckFunctions.push(m[1]);
      }
    }

    const uniqueFunctions = new Set(identityCheckFunctions);
    if (uniqueFunctions.size >= 3) {
      findings.push({
        layer: 'R12',
        severity: 'MEDIUM',
        category: 'CROSS_PLUGIN_ISOLATION',
        file: construct.filePath,
        line: construct.line,
        evidence: `${uniqueFunctions.size} different identity check functions: ${[...uniqueFunctions].join(', ')}`,
        description: 'Multiple different identity check functions — suggests copy-paste drift and potential inconsistency',
        correction: 'Consolidate to a single identity check function used everywhere',
        runtimeImpact: 'Different code paths may check identity differently — some bypass the guard',
        confidence: 0.80,
        constructType: construct.type,
        callGraphRef: null,
        evidenceSuppressed: false,
      });
    }

    return findings;
  },
};
