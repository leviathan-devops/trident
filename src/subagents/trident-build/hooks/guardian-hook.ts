// Guardian hook — tool.execute.before enforcement for Trident_Build
// Delegates to TheatricalBlock, BuildFirewall, and RuntimeGradeEngineer

import { TheatricalCodeBlock } from '../harness/theatrical-block.js';
import { RuntimeGradeEngineer } from '../harness/runtime-grade.js';
import { BuildFirewall } from '../firewall/index.js';
import { isTridentBuildAgent } from '../identity/agent-identity.js';
import { getCurrentAgent } from '../../../hooks/agent-state.js';
import { EnforcementError } from '../harness/enforcement-error.js';

export function createGuardianHook() {
  var theatricalBlock = new TheatricalCodeBlock();
  var runtimeGrade = new RuntimeGradeEngineer();
  var buildFirewall = new BuildFirewall();
  // Auto-initialize with empty plan scope (all files allowed by default)
  // This activates plan scope validation, AST analysis, and evidence chain
  (async function() {
    try {
      await buildFirewall.initialize(process.cwd(), '');
    } catch (e) {
      // Non-fatal — initialize is best-effort without a plan
    }
  })();

  var beforeHook = async function(input: Record<string, unknown>, output: Record<string, unknown>): Promise<void> {
    var agent = getCurrentAgent(input.sessionID as string);
    if (!isTridentBuildAgent(agent)) return;

    var toolName = input.tool as string || '';
    var writeTools = ['write', 'edit', 'patch'];
    if (!writeTools.includes(toolName)) return;

    var filePath = (output.args as Record<string, unknown>)?.path as string || (output.args as Record<string, unknown>)?.filePath as string || '';
    var content = (output.args as Record<string, unknown>)?.content as string || (output.args as Record<string, unknown>)?.data as string || '';
    if (!content) return;

    // LAYER 1: BuildFirewall — plan scope + AST + evidence
    await buildFirewall.onBeforeWrite(toolName, filePath, content);

    // LAYER 2: TheatricalBlock — 20+ pattern scan
    var matches = theatricalBlock.scan(content);
    var critical = matches.filter(function(m) { return m.severity === 'critical'; });
    if (critical.length > 0) {
      throw new EnforcementError(
        '[THEATRICAL_BLOCK] ' + critical[0].name + ': ' + critical[0].message + ' in ' + filePath,
        critical[0].name,
        'critical'
      );
    }

    // LAYER 3: RuntimeGradeEngineer — P1-P10
    var violations = runtimeGrade.check(toolName, (output.args as Record<string, unknown>) || {}, filePath);
    var criticalViolations = violations.filter(function(v) { return v.severity === 'critical'; });
    if (criticalViolations.length > 0) {
      throw new EnforcementError(
        '[RUNTIME_BLOCK] ' + criticalViolations[0].code + ': ' + criticalViolations[0].message,
        criticalViolations[0].code,
        'critical'
      );
    }
  };

  var afterHook = async function(input: Record<string, unknown>, output: Record<string, unknown>): Promise<void> {
    var agent = getCurrentAgent(input.sessionID as string);
    if (!isTridentBuildAgent(agent)) return;
    var toolName = input.tool as string || '';
    var filePath = (output.args as Record<string, unknown>)?.path as string || (output.args as Record<string, unknown>)?.filePath as string || '';
    if (filePath && (toolName === 'write' || toolName === 'edit' || toolName === 'patch')) {
      await buildFirewall.onAfterWrite(toolName, filePath);
    }
  };

  return { beforeHook, afterHook };
}
