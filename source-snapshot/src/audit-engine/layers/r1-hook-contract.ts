import { LayerRule, CodeConstruct, AnalysisContext, AuditFinding, ConstructType } from '../types.ts';

export const R1_HOOK_CONTRACT: LayerRule = {
  layer: 'R1',
  name: 'Hook Contract',
  description: 'Validates hook handlers implement correct input/output contracts',
  applicableTo: [ConstructType.FUNCTION_DECLARATION, ConstructType.ARROW_FUNCTION],
  requireHasBody: true,
  enabled: true,

  evaluate(construct: CodeConstruct | null, ctx: AnalysisContext): AuditFinding[] {
    if (!construct) return [];
    const findings: AuditFinding[] = [];
    const body = construct.body;
    const executableBody = getExecutableBody(construct);

    // E10: After-handlers (tool.execute.after) should NOT be flagged for missing output.error
    if (executableBody.includes('tool.execute.before') || executableBody.includes('toolExecuteBefore') || (executableBody.includes('tool.execute') && !executableBody.includes('tool.execute.after') && !executableBody.includes('tool.execute.before'))) {
      const hasOutputError = executableBody.includes('output.error');
      const hasIsError = executableBody.includes('output.isError');

      if (!hasOutputError || !hasIsError) {
        findings.push({
          layer: 'R1',
          severity: 'CRITICAL',
          category: 'HOOK_CONTRACT',
          file: construct.filePath,
          line: construct.line,
          evidence: body.substring(0, 150),
          description: 'tool.execute.before handler lacks output.error + output.isError — tool blocking cannot work',
          correction: 'Add: output.error = "[BLOCK] message"; output.isError = true; in the blocking path',
          runtimeImpact: 'Tool block is declared but never enforced — all tools pass through unblocked',
          confidence: 0.85,
          constructType: construct.type,
          callGraphRef: null,
          evidenceSuppressed: false,
        });
      }

      const hasAgentCheck = executableBody.includes('agent') || executableBody.includes('agentName') || executableBody.includes('input.agent') || executableBody.includes('input.name');
      if (!hasAgentCheck) {
        findings.push({
          layer: 'R1',
          severity: 'HIGH',
          category: 'HOOK_CONTRACT',
          file: construct.filePath,
          line: construct.line,
          evidence: body.substring(0, 150),
          description: 'tool.execute.before handler lacks agent identity check — block applies to ALL agents, not just Trident',
          correction: 'Add agent check: if (input?.agent !== "trident" && input?.name !== "trident") return;',
          runtimeImpact: 'Tool block fires for every agent — non-Trident agents lose access to bash/write/edit',
          confidence: 0.90,
          constructType: construct.type,
          callGraphRef: null,
          evidenceSuppressed: false,
        });
      }
    }

    if (executableBody.includes('system.transform') || executableBody.includes('systemTransform') || executableBody.includes('chat.system.transform')) {
      const hasOutputSystem = executableBody.includes('output.system') || executableBody.includes('output.system.push');
      if (!hasOutputSystem) {
        findings.push({
          layer: 'R1',
          severity: 'CRITICAL',
          category: 'HOOK_CONTRACT',
          file: construct.filePath,
          line: construct.line,
          evidence: body.substring(0, 150),
          description: 'system.transform handler lacks output.system injection — agent identity never injected',
          correction: 'Add: output.system.push(agentInstructions); or output.system = [agentInstructions];',
          runtimeImpact: 'Agent has no identity — model behaves as generic assistant, not Trident',
          confidence: 0.85,
          constructType: construct.type,
          callGraphRef: null,
          evidenceSuppressed: false,
        });
      }
    }

    if (executableBody.includes('agent') || executableBody.includes('agentName')) {
      const correctPatterns = ['input?.agent', 'input?.name', 'input?.agentName', 'event.agent', 'ctx.agentName'];
      const hasCorrectPattern = correctPatterns.some((p: string) => executableBody.includes(p));
      const wrongPatterns = ['session.agent', 'context.agent', 'state.agent'];
      const hasWrongPattern = wrongPatterns.some((p: string) => executableBody.includes(p));

      if (hasWrongPattern && !hasCorrectPattern) {
        findings.push({
          layer: 'R1',
          severity: 'HIGH',
          category: 'HOOK_CONTRACT',
          file: construct.filePath,
          line: construct.line,
          evidence: body.substring(0, 150),
          description: 'Agent guard uses wrong field — correct fields are input.agent, input.name, or input.agentName',
          correction: 'Use input?.agent || input?.name || input?.agentName for agent detection',
          runtimeImpact: 'Agent identity check fails — Trident never activates or always activates',
          confidence: 0.90,
          constructType: construct.type,
          callGraphRef: null,
          evidenceSuppressed: false,
        });
      }
    }

    return findings;
  },
};

function getExecutableBody(construct: CodeConstruct): string {
  const excludeTypes = new Set([
    ConstructType.STRING_LITERAL,
    ConstructType.TEMPLATE_EXPRESSION,
    ConstructType.REGULAR_EXPRESSION_LITERAL,
    ConstructType.BLOCK_COMMENT,
    ConstructType.LINE_COMMENT,
  ]);
  const parts: string[] = [];
  function walk(c: CodeConstruct): void {
    if (excludeTypes.has(c.type)) return;
    if (c.children.length === 0) {
      parts.push(c.body);
    } else {
      for (const child of c.children) walk(child);
    }
  }
  walk(construct);
  return parts.join(' ');
}
