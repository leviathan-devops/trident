import { tool } from '@opencode-ai/plugin';
import { z } from 'zod';
import { poseidonState } from '../poseidon/poseidon-state.js';
import { tridentLog } from '../utils.js';
import { godLoopOrchestrator } from '../poseidon/god-loop.js';

export const tridentPoseidonTool = tool({
  description: 'POSEIDON MODE: God Orchestrator for quality-enforced build execution. Dispatches work to Trident_Build subagent, audits output, loops until 96%+ runtime grade. AUTO-LOCKS on completion. ALL POSEIDON OUTPUT MUST BE DISPLAYED TO THE USER — THE USER MUST SEE EVERY CYCLE PLAN, SCORE, AND NEXT STEP.',

  args: {
    targetPath: z.string().describe('Absolute path to the project root to build/audit'),
    action: z.enum(['start', 'status', 'abort', 'verify', 'phase'])
      .default('start')
      .describe('start=run God Loop, status=show current state, abort=cancel running loop, phase=run 10-phase machine'),
    maxCycles: z.number().min(1).max(200).default(50)
      .describe('Maximum loop iterations (safeguard against infinite loops)'),
  },

  execute: async (args: { targetPath: string; action: 'start' | 'status' | 'abort' | 'verify' | 'phase'; maxCycles: number }, ctx?: unknown) => {
    const rawCtx = ctx as Record<string, unknown>;
    const sessionId = (rawCtx?.sessionId as string) || (rawCtx?.sessionID as string) || 'default';

    // LOCK CHECK: Poseidon Mode must be active
    if (!poseidonState.isActive(sessionId)) {
      return '## POSEIDON MODE: LOCKED\n\n' +
        'Poseidon Mode is not active. The user must explicitly activate it by ' +
        'saying something like "Poseidon Mode Activate" or "enable poseidon mode" ' +
        'in the chat. The agent cannot activate Poseidon Mode autonomously.' +
        '\n\n---\n**[POSEIDON DISPLAY] The user MUST see this full output. Present ALL of it in chat. Do NOT hide or summarize.**';
    }

    try {
      if (args.action === 'status') {
        var metrics = poseidonState.getMetrics(sessionId);
        if (!metrics) {
          return '## POSEIDON MODE: No active session data.' +
            '\n\n---\n**[POSEIDON DISPLAY] The user MUST see this full output. Present ALL of it in chat. Do NOT hide or summarize.**';
        }
        return '## POSEIDON MODE — STATUS\n\n' +
          '- Active: ' + metrics.active + '\n' +
          '- Cycles: ' + metrics.cycles + '\n' +
          '- Current Score: ' + metrics.currentScore + '/100\n' +
          '- Highest Score: ' + metrics.highestScore + '/100\n' +
          '- Target: ' + metrics.targetPath + '\n' +
          '- Abort Flag: ' + metrics.abortFlag + '\n' +
          '\n---\n**[POSEIDON DISPLAY] The user MUST see this full output. Present ALL of it in chat. Do NOT hide or summarize.**';
      }

      if (args.action === 'abort') {
        poseidonState.setAbortFlag(sessionId, true);
        return '## POSEIDON MODE: ABORT SIGNAL SENT\n\nLoop will terminate after current cycle.' +
          '\n\n---\n**[POSEIDON DISPLAY] The user MUST see this full output. Present ALL of it in chat. Do NOT hide or summarize.**';
      }

      if (args.action === 'verify') {
        tridentLog('INFO', 'trident-poseidon', `Verifying build for: ${args.targetPath}`);

        var verifyResult = await godLoopOrchestrator.verifyCycle(args.targetPath, sessionId);

        if (verifyResult.status === 'error') {
          return '## POSEIDON MODE — VERIFY FAILED\n\n' +
            'No progress detected. The God Loop is stalled.\n' +
            'Use `trident-poseidon action=abort` to reset.\n' +
            '\n---\n**[POSEIDON DISPLAY] The user MUST see this full output. Present ALL of it in chat. Do NOT hide or summarize.**';
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
            'Poseidon Mode has been locked.\n' +
            '\n---\n**[POSEIDON DISPLAY] The user MUST see this full output. Present ALL of it in chat. Do NOT hide or summarize.**';
        }

        // v4.4.1: If stalled, mandate PSM self-heal
        if (verifyResult.stallDetected) {
          return '**[POSEIDON MODE — DISPLAY TO USER]**\n\n' +
            '## POSEIDON MODE — STALL DETECTED\n\n' +
            'Score has not improved for 2 cycles. Activating Problem Solving Mode for self-healing.\n\n' +
            '### MANDATORY: Call trident-problem-solving NOW\n' +
            '- problem: "Score stalled at ' + verifyResult.score + '/100 for 2 cycles"\n' +
            '- reasoning: [List cycle history, persistent findings, approaches that failed]\n' +
            '- workingPlan: [Revised approach based on PSM analysis]\n\n' +
            'After PSM completes, call trident-deep-planning to generate a new wave plan, then continue the GOD loop.\n' +
            'Do NOT stop. Do NOT ask the user. Self-heal and continue.\n' +
            '\n---\n**[POSEIDON DISPLAY] The user MUST see this full output. Present ALL of it in chat. Do NOT hide or summarize.**';
        }

        // Still looping — needs another dispatch
        return '## POSEIDON MODE — CYCLE VERIFY\n\n' +
          '### Previous Score: ' + verifyResult.previousScore + '/100\n' +
          '### Current Score: ' + verifyResult.score + '/100\n' +
          '### Findings Fixed: ' + verifyResult.findingsFixed + '\n' +
          '### Findings Remaining: ' + verifyResult.findingsRemaining + '\n\n' +
          '### MANDATORY NEXT ACTIONS (Do NOT wait for user. Execute NOW.):\n' +
          '1. Read the plan NOW:\n' +
          '   `read path=".trident/poseidon-audits/' + sessionId + '/cycle_' + (verifyResult.cycle + 1) + '/PLAN.md"`\n' +
          '2. Dispatch to Trident_Build:\n' +
          '   `task description="Trident Build Cycle" prompt="<plan>" subagent_type="trident_build"`\n' +
          '3. After build, verify again:\n' +
          '   `trident-poseidon action=verify targetPath="' + args.targetPath + '"`\n\n' +
          'Do NOT stop. Do NOT ask the user. Do NOT chat. EXECUTE.\n' +
          '\n---\n**[POSEIDON DISPLAY] The user MUST see this full output. Present ALL of it in chat. Do NOT hide or summarize.**';
      }

      if (args.action === 'phase') {
        // v4.4.1: Phase query — delegate to status since 10-phase machine moved to headless
        var phaseMetrics = poseidonState.getMetrics(sessionId);
        return '## POSEIDON MODE — STATUS\n\n' +
          '- Active: ' + (phaseMetrics?.active || false) + '\n' +
          '- Cycles: ' + (phaseMetrics?.cycles || 0) + '\n' +
          '- Current Score: ' + (phaseMetrics?.currentScore || 0) + '/100\n' +
          '- Highest Score: ' + (phaseMetrics?.highestScore || 0) + '/100\n' +
          '- Target: ' + (phaseMetrics?.targetPath || args.targetPath) + '\n\n' +
          'Use `trident-poseidon action=start` to begin a new audit cycle, or `action=verify` after build.' +
          '\n\n---\n**[POSEIDON DISPLAY] The user MUST see this full output. Present ALL of it in chat. Do NOT hide or summarize.**';
      }

      // action === 'start'
      poseidonState.setTargetPath(sessionId, args.targetPath);
      poseidonState.setAbortFlag(sessionId, false); // v4.4.1: Clear stale abort flag on fresh start

      tridentLog('INFO', 'trident-poseidon', `Poseidon Mode audit for: ${args.targetPath}`);

      // Run audit and generate plan
      var auditResult = await godLoopOrchestrator.auditAndPlan(args.targetPath, sessionId);

      if (auditResult.status === 'error') {
          return '## POSEIDON MODE — AUDIT FAILED\n\n' +
            'The audit encountered a fatal error (stalled or aborted).\n' +
            'Use `trident-poseidon action=status` to check state.\n' +
            'Use `trident-poseidon action=abort` to reset.\n' +
            '\n---\n**[POSEIDON DISPLAY] The user MUST see this full output. Present ALL of it in chat. Do NOT hide or summarize.**';
      }

      if (auditResult.status === 'complete') {
        // Score >= 96% — build passed audit without needing fixes
        poseidonState.autoDeactivate(sessionId);
          return '## POSEIDON MODE — BUILD PASSED AUDIT\n\n' +
            '### Score: ' + auditResult.score + '/100 ✅\n\n' +
            'The target code passes the audit at >= 96%.\n' +
            'No fixes needed.\n\n' +
            'Poseidon Mode has been locked.\n' +
            '\n---\n**[POSEIDON DISPLAY] The user MUST see this full output. Present ALL of it in chat. Do NOT hide or summarize.**';
      }

      // Status === 'looping' — plan generated, needs implementation
      // v4.4.1: If stalled, mandate PSM self-heal
      if (auditResult.stallDetected) {
        return '**[POSEIDON MODE — DISPLAY TO USER]**\n\n' +
          '## POSEIDON MODE — STALL DETECTED\n\n' +
          'Score has not improved for 2 cycles. Activating Problem Solving Mode for self-healing.\n\n' +
          '### MANDATORY: Call trident-problem-solving NOW\n' +
          '- problem: "Score stalled at ' + auditResult.score + '/100 for 2 cycles"\n' +
          '- reasoning: [List cycle history, persistent findings, approaches that failed]\n' +
          '- workingPlan: [Revised approach based on PSM analysis]\n\n' +
          'After PSM completes, call trident-deep-planning to generate a new wave plan, then continue the GOD loop.\n' +
          'Do NOT stop. Do NOT ask the user. Self-heal and continue.\n' +
          '\n---\n**[POSEIDON DISPLAY] The user MUST see this full output. Present ALL of it in chat. Do NOT hide or summarize.**';
      }

      return '**[POSEIDON MODE — DISPLAY TO USER]**\n\n## POSEIDON MODE — CYCLE ' + auditResult.cycle + ' PLAN\n\n' +
        '### Current Score: ' + auditResult.score + '/100\n\n' +
        '### Plan Generated\n' +
        'A remediation plan with ' + auditResult.findings.length + ' findings has been saved to:\n' +
        '`' + auditResult.planPath + '`\n\n' +
        '### MANDATORY NEXT ACTIONS (Do NOT wait for user. Execute NOW.):\n' +
        '1. Read the plan NOW:\n' +
        '   `read path="' + auditResult.planPath + '"`\n' +
        '2. Dispatch to Trident_Build with the plan:\n' +
        '   `task description="Trident Build Cycle" prompt="<plan content>" subagent_type="trident_build"`\n' +
        '3. After build completes, verify:\n' +
        '   `trident-poseidon action=verify targetPath="' + args.targetPath + '"`\n\n' +
        'Do NOT stop. Do NOT ask the user. Do NOT chat. EXECUTE.\n\n' +
        '### Auto-Deactivation\n' +
        'Poseidon Mode will auto-lock when the build completes.\n' +
        '\n---\n**[POSEIDON DISPLAY] The user MUST see this full output. Present ALL of it in chat. Do NOT hide or summarize.**';

    } catch (err: unknown) {
      var errMsg = err instanceof Error ? err.message : String(err);
      tridentLog('ERROR', 'trident-poseidon', `[POSEIDON-ERR] ${errMsg}`);
      return JSON.stringify({ error: 'Poseidon Mode failed', message: errMsg }, null, 2) +
        '\n\n---\n**[POSEIDON DISPLAY] The user MUST see this full output. Present ALL of it in chat. Do NOT hide or summarize.**';
    } finally {
      // Lifecycle is managed explicitly in complete paths — no automatic deactivation
    }
  },
});
