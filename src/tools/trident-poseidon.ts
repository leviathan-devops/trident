import { tool } from '@opencode-ai/plugin';
import { z } from 'zod';
import { poseidonState } from '../poseidon/poseidon-state.js';
import { tridentLog } from '../utils.js';
import { godLoopOrchestrator } from '../poseidon/god-loop.js';

export const tridentPoseidonTool = tool({
  description: 'POSEIDON MODE: God Orchestrator for quality-enforced build execution. ' +
    'Dispatches work to Trident_Build subagent, audits output, loops until 96%+ runtime grade. ' +
    'AUTO-LOCKS on completion. Requires user activation via "Poseidon Mode".',

  args: {
    targetPath: z.string().describe('Absolute path to the project root to build/audit'),
    action: z.enum(['start', 'status', 'abort', 'verify'])
      .default('start')
      .describe('start=run God Loop, status=show current state, abort=cancel running loop'),
    maxCycles: z.number().min(1).max(200).default(50)
      .describe('Maximum loop iterations (safeguard against infinite loops)'),
  },

  execute: async (args: { targetPath: string; action: 'start' | 'status' | 'abort' | 'verify'; maxCycles: number }, ctx?: unknown) => {
    const sessionId = (ctx as Record<string, unknown>)?.sessionId as string || 'default';

    // LOCK CHECK: Poseidon Mode must be active
    if (!poseidonState.isActive(sessionId)) {
      return '## POSEIDON MODE: LOCKED\n\n' +
        'Poseidon Mode is not active. The user must explicitly activate it by ' +
        'saying something like "Poseidon Mode Activate" or "enable poseidon mode" ' +
        'in the chat. The agent cannot activate Poseidon Mode autonomously.';
    }

    try {
      if (args.action === 'status') {
        var metrics = poseidonState.getMetrics(sessionId);
        if (!metrics) {
          return '## POSEIDON MODE: No active session data.';
        }
        return '## POSEIDON MODE — STATUS\n\n' +
          '- Active: ' + metrics.active + '\n' +
          '- Cycles: ' + metrics.cycles + '\n' +
          '- Current Score: ' + metrics.currentScore + '/100\n' +
          '- Highest Score: ' + metrics.highestScore + '/100\n' +
          '- Target: ' + metrics.targetPath + '\n' +
          '- Abort Flag: ' + metrics.abortFlag + '\n';
      }

      if (args.action === 'abort') {
        poseidonState.setAbortFlag(sessionId, true);
        return '## POSEIDON MODE: ABORT SIGNAL SENT\n\nLoop will terminate after current cycle.';
      }

      if (args.action === 'verify') {
        tridentLog('INFO', 'trident-poseidon', `Verifying build for: ${args.targetPath}`);

        var verifyResult = await godLoopOrchestrator.verifyCycle(args.targetPath, sessionId);

        if (verifyResult.status === 'error') {
          return '## POSEIDON MODE — VERIFY FAILED\n\n' +
            'No progress detected. The God Loop is stalled.\n' +
            'Use `trident-poseidon action=abort` to reset.\n';
        }

        if (verifyResult.status === 'complete') {
          poseidonState.autoDeactivate(sessionId);
          return '## POSEIDON MODE — BUILD COMPLETE ✅\n\n' +
            '### Score: ' + verifyResult.score + '/100\n\n' +
            '### Cycle Summary\n' +
            '- Previous Score: ' + verifyResult.previousScore + '/100\n' +
            '- Findings Fixed: ' + verifyResult.findingsFixed + '\n' +
            '- Findings Remaining: ' + verifyResult.findingsRemaining + '\n\n' +
            '### Build Approved\n' +
            'The code has passed the audit at >= 96%.\n\n' +
            'Poseidon Mode has been locked.\n';
        }

        // Still looping — needs another dispatch
        return '## POSEIDON MODE — CYCLE VERIFY\n\n' +
          '### Previous Score: ' + verifyResult.previousScore + '/100\n' +
          '### Current Score: ' + verifyResult.score + '/100\n' +
          '### Findings Fixed: ' + verifyResult.findingsFixed + '\n' +
          '### Findings Remaining: ' + verifyResult.findingsRemaining + '\n\n' +
          '### Next Action: ' + (verifyResult.nextAction === 'dispatch_build' ? 'Dispatch to Trident_Build again' : 'Audit again') + '\n\n' +
          '1. Read the plan:\n' +
          '   `read path=".trident/poseidon-audits/' + sessionId + '/cycle_' + (verifyResult.cycle + 1) + '/PLAN.md"`\n' +
          '2. Dispatch to Trident_Build:\n' +
          '   `task description="Trident Build Cycle" prompt="<plan>" subagent_type="trident_build"`\n' +
          '3. After build, verify again:\n' +
          '   `trident-poseidon action=verify targetPath="' + args.targetPath + '"`\n';
      }

      // action === 'start'
      poseidonState.setTargetPath(sessionId, args.targetPath);

      tridentLog('INFO', 'trident-poseidon', `Poseidon Mode audit for: ${args.targetPath}`);

      // Run audit and generate plan
      var auditResult = await godLoopOrchestrator.auditAndPlan(args.targetPath, sessionId);

      if (auditResult.status === 'error') {
        return '## POSEIDON MODE — AUDIT FAILED\n\n' +
          'The audit encountered a fatal error (stalled or aborted).\n' +
          'Use `trident-poseidon action=status` to check state.\n' +
          'Use `trident-poseidon action=abort` to reset.\n';
      }

      if (auditResult.status === 'complete') {
        // Score >= 96% — build passed audit without needing fixes
        poseidonState.autoDeactivate(sessionId);
        return '## POSEIDON MODE — BUILD PASSED AUDIT\n\n' +
          '### Score: ' + auditResult.score + '/100 ✅\n\n' +
          'The target code passes the audit at >= 96%.\n' +
          'No fixes needed.\n\n' +
          'Poseidon Mode has been locked.\n';
      }

      // Status === 'looping' — plan generated, needs implementation
      return '## POSEIDON MODE — CYCLE ' + auditResult.cycle + ' PLAN\n\n' +
        '### Current Score: ' + auditResult.score + '/100\n\n' +
        '### Plan Generated\n' +
        'A remediation plan with ' + auditResult.findings.length + ' findings has been saved to:\n' +
        '`' + auditResult.planPath + '`\n\n' +
        '### Next Step: Dispatch to Trident_Build\n' +
        '1. Read the plan:\n' +
        '   `read path="' + auditResult.planPath + '"`\n' +
        '2. Dispatch to Trident_Build with the plan:\n' +
        '   `task description="Trident Build Cycle" prompt="<plan content>" subagent_type="trident_build"`\n' +
        '3. After build completes, verify:\n' +
        '   `trident-poseidon action=verify targetPath="' + args.targetPath + '"`\n\n' +
        '### Auto-Deactivation\n' +
        'Poseidon Mode will auto-lock when the build completes.\n';

    } catch (err: unknown) {
      var errMsg = err instanceof Error ? err.message : String(err);
      tridentLog('ERROR', 'trident-poseidon', `[POSEIDON-ERR] ${errMsg}`);
      return JSON.stringify({ error: 'Poseidon Mode failed', message: errMsg }, null, 2);
    } finally {
      // Lifecycle is managed explicitly in complete paths — no automatic deactivation
    }
  },
});
