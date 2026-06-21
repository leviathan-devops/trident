// Gate hook — tool.execute.after evidence tracking for Trident_Build

import { EvidencePipeline } from '../harness/evidence-pipeline.js';
import { isTridentBuildAgent } from '../identity/agent-identity.js';
import { getCurrentAgent } from '../../../hooks/agent-state.js';
import { tridentLog } from '../../../utils.js';

export function createGateHook() {
  var evidencePipeline = new EvidencePipeline();

  return async function(input: Record<string, unknown>, output: Record<string, unknown>): Promise<void> {
    var agent = getCurrentAgent(input.sessionID as string);
    if (!isTridentBuildAgent(agent)) return;

    var toolName = input.tool as string || '';
    // Record every tool execution in the Merkle chain
    // Check for actual error state instead of hardcoding true
    var hasError = !!(output?.error || (output as Record<string, unknown>)?.stderr || (output as Record<string, unknown>)?.exitCode);
    evidencePipeline.record(toolName, (output?.args as Record<string, unknown>) || {}, !hasError);

    // Periodically verify chain integrity (every 10 records)
    if (evidencePipeline.getChainLength() % 10 === 0 && evidencePipeline.getChainLength() > 0) {
      var chainValid = evidencePipeline.verifyChainIntegrity();
      if (!chainValid) {
        tridentLog('ERROR', 'gate', 'Evidence chain integrity FAILED — tampering detected');
      }
    }
  };
}
