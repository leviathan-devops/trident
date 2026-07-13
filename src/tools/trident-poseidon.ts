import { tool } from '@opencode-ai/plugin';
import { z } from 'zod';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { poseidonState, isLeafNode } from '../poseidon/poseidon-state.js';
import { tridentLog } from '../utils.js';
import { godLoopOrchestrator } from '../poseidon/god-loop.js';

// R16 FIX: Module-level type assertion utility — single assertion point per file
function cast<T>(value: unknown): T { const r: T = value; return r; }

export const tridentPoseidonTool = tool({
  description: 'POSEIDON MODE: God Orchestrator for quality-enforced build execution. Dispatches work to Trident_Build subagent, audits output, loops until 96%+ runtime grade. AUTO-LOCKS on completion. ALL POSEIDON OUTPUT MUST BE DISPLAYED TO THE USER — THE USER MUST SEE EVERY CYCLE PLAN, SCORE, AND NEXT STEP.',

  args: {
    targetPath: z.string().describe('Absolute path to the project root to build/audit'),
    action: z.enum(['start', 'status', 'abort', 'verify', 'phase', 'deactivate', 'revoke'])
      .default('start')
      .describe('start=advance God Loop one phase, status=show current state, abort=cancel running loop, phase=run 10-phase machine, verify=alias for start, deactivate=exit Poseidon Mode, revoke=full reset'),
    maxCycles: z.number().min(1).max(200).default(50)
      .describe('Maximum loop iterations (safeguard against infinite loops)'),
  },

  execute: async (args: { targetPath: string; action: 'start' | 'status' | 'abort' | 'verify' | 'phase' | 'deactivate' | 'revoke'; maxCycles: number }, ctx?: unknown) => {
    const rawCtx = cast<Record<string, unknown>>(ctx);
    const sessionId = (typeof rawCtx?.sessionId === 'string' ? rawCtx.sessionId : '') || (typeof rawCtx?.sessionID === 'string' ? rawCtx.sessionID : '') || 'default';
    const agentName = (typeof rawCtx?.agent === 'string' ? rawCtx.agent : '') || (typeof rawCtx?.agentName === 'string' ? rawCtx.agentName : '') || '';

    // LEAF NODE SECURITY: Build agents CANNOT call trident-poseidon
    if (isLeafNode(agentName)) {
      return '## POSEIDON MODE: ACCESS DENIED\n\n' +
        'Build agents (leaf nodes) cannot call trident-poseidon.\n' +
        'This is a safety guardrail to prevent nested Poseidon execution.\n' +
        '\n---\n**[POSEIDON DISPLAY] The user MUST see this full output.**';
    }

    // LOCK CHECK: Poseidon Mode must be active for start/verify/phase actions.
    // Status/abort/deactivate/revoke are always allowed.
    // Session ID fix: check BOTH the tool's session AND 'default' because the chat hook
    // may store activation under a different session ID than the tool context provides.
    if (args.action === 'start' || args.action === 'verify' || args.action === 'phase') {
      const isActive = poseidonState.isActive(sessionId) || poseidonState.isActive('default');
      if (!isActive) {
        return '## POSEIDON MODE: LOCKED\n\n' +
          'Poseidon Mode is not active. The user must explicitly activate it by ' +
          'saying something like "Poseidon Mode Activate" or "enable poseidon mode" ' +
          'in the chat.\n\n' +
          'Detected session: ' + sessionId + '\n' +
          '\n\n---\n**[POSEIDON DISPLAY] The user MUST see this full output. Present ALL of it in chat. Do NOT hide or summarize.**';
      }
    }

    const displayFooter = '\n\n---\n**[POSEIDON DISPLAY] The user MUST see this full output. Present ALL of it in chat. Do NOT hide or summarize.**';

    try {
      // STATUS action — read God Loop state from disk
      if (args.action === 'status') {
        const status = godLoopOrchestrator.getStatus(args.targetPath);
        const metrics = poseidonState.getMetrics(sessionId);
        return '## POSEIDON MODE — STATUS\n\n' +
          '### God Loop State\n' +
          '- Phase: ' + status.phase + '\n' +
          '- Cycle: ' + status.cycle + '\n' +
          '- Score: ' + status.score + '/100\n' +
          '- Wave: ' + status.wave + '\n' +
          '- Stalled: ' + status.stalledSince + ' cycles\n\n' +
          '### Session State\n' +
          '- Active: ' + (metrics?.active || false) + '\n' +
          '- Highest Score: ' + (metrics?.highestScore || 0) + '/100\n' +
          '- Target: ' + (metrics?.targetPath || args.targetPath) + '\n' +
          displayFooter;
      }

      // ABORT action
      if (args.action === 'abort') {
        poseidonState.setAbortFlag(sessionId, true);
        poseidonState.autoDeactivate(sessionId);
        return '## POSEIDON MODE: ABORTED\n\nGod Loop has been aborted. State saved for recovery.' + displayFooter;
      }

      // DEACTIVATE action — clean exit from Poseidon Mode
      if (args.action === 'deactivate') {
        poseidonState.deactivate(sessionId);
        return '## POSEIDON MODE: DEACTIVATED\n\n' +
          'Poseidon Mode has been deactivated. bash/write/edit tools are now re-blocked. ' +
          'God Loop state preserved on disk for future resumption.' + displayFooter;
      }

      // REVOKE action — full reset of all Poseidon state
      if (args.action === 'revoke') {
        poseidonState.clear(sessionId);
        return '## POSEIDON MODE: REVOKED\n\n' +
          'All Poseidon state has been cleared. Fresh start required.' + displayFooter;
      }

      // START / VERIFY / PHASE — all advance the God Loop one phase
      // The 10-phase state machine runs ONE phase per call.
      // Each phase returns FORCEFUL instructions telling the model what to do next.
      poseidonState.setTargetPath(sessionId, args.targetPath);

      tridentLog('INFO', 'trident-poseidon', 'Poseidon Mode phase advance for: ' + args.targetPath + ' (action=' + args.action + ')');

      const result = await godLoopOrchestrator.runPhase(args.targetPath, sessionId);

      // Update session metrics
      poseidonState.setScore(sessionId, result.score);
      poseidonState.incrementCycles(sessionId);

      // ── BUILD VISIBLE OUTPUT ──
      // The tool returns a SHORT summary that is ALWAYS visible in the TUI.
      // Full instructions are written to disk for the model to read separately.
      // This prevents long outputs from being collapsed/truncated by the TUI.

      const stateDir = path.join(args.targetPath, '.trident', 'god-loop');
      const shortLine = '🔄 POSEIDON CYCLE ' + result.cycle + ' | Score: ' + result.score + '/100 | Wave: ' + result.wave + ' | Phase: ' + result.phase + ' → ' + result.nextPhase;

      // Check for terminal states
      if (result.nextPhase === 'LOCKED' || result.nextPhase === 'FAILED') {
        poseidonState.autoDeactivate(sessionId);
        // Terminal states are short enough to show inline
        return shortLine + '\n\n' + result.instructions.substring(0, 500) + '\n\nPoseidon Mode has been deactivated.';
      }

      // DISPATCH phase — full specs written to disk, short instruction returned
      if (result.requiresModelAction) {
        // Write full dispatch instructions to disk
        const dispatchPath = path.join(stateDir, 'wave-' + result.wave + '-dispatch.md');
        try {
          fs.mkdirSync(stateDir, { recursive: true });
          fs.writeFileSync(dispatchPath, result.instructions, 'utf-8');
        } catch (e) {
          tridentLog('WARN', 'trident-poseidon', 'Failed to write dispatch plan: ' + (e instanceof Error ? e.message : String(e)));
        }

        // Count agents from the wave manifest in state
        var agentCount = (result.instructions.match(/Agent \d+:/g) || []).length;
        if (agentCount === 0) agentCount = 5; // fallback

        // Return SHORT visible instruction
        return shortLine + '\n\n' +
          '⚡ DISPATCH REQUIRED: ' + agentCount + ' build agents ready.\n' +
          'Full dispatch plan: ' + dispatchPath + '\n' +
          'Read the plan file, then dispatch ALL ' + agentCount + ' agents using subagent_type="trident_build".\n' +
          'After ALL agents return, call trident-poseidon action=start to COLLECT results.\n' +
          'DO NOT WAIT. DO NOT ASK. DISPATCH NOW.';
      }

      // All other phases — check if output is short enough for inline display
      if (result.instructions.length <= 1500) {
        // Short enough to show inline
        return shortLine + '\n\n' + result.instructions + '\n\n→ Call trident-poseidon action=start to advance.';
      }

      // Long output — write to disk, return summary
      const detailPath = path.join(stateDir, 'phase-' + result.phase + '-details.md');
      try {
        fs.writeFileSync(detailPath, result.instructions, 'utf-8');
      } catch (e) {
        tridentLog('WARN', 'trident-poseidon', 'Failed to write phase details: ' + (e instanceof Error ? e.message : String(e)));
      }

      return shortLine + '\n\n' +
        'Phase details: ' + detailPath + '\n' +
        '→ Call trident-poseidon action=start to advance to ' + result.nextPhase + '.';

    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      tridentLog('ERROR', 'trident-poseidon', '[POSEIDON-ERR] ' + errMsg);
      return '## POSEIDON MODE — ERROR\n\n' +
        'Phase execution failed: ' + errMsg + '\n\n' +
        'The God Loop state has been saved. Use `trident-poseidon action=status` to inspect.\n' +
        'Use `trident-poseidon action=abort` to reset.' + displayFooter;
    }
  },
});
