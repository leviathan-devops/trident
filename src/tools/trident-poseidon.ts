import { tool } from '@opencode-ai/plugin';
import { z } from 'zod';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { poseidonState, isLeafNode, getGodLoopPhase } from '../poseidon/poseidon-state.js';
import { tridentLog } from '../utils.js';
import { godLoopOrchestrator } from '../poseidon/god-loop.js';
import { validatePhaseAction } from '../poseidon/phase-intelligence.js';

function cast<T>(value: unknown): T { const r: T = value; return r; }

export const tridentPoseidonTool = tool({
  description: 'POSEIDON MODE: God Orchestrator for quality-enforced build execution. ' +
    'v4.4.3 Overhaul: 6 model-required phases (DECIDE, PLAN, DISPATCH, VERIFY, CONTAINER_TEST, PROBLEM_SOLVE). ' +
    'Each phase requires its specific action. action=start is REJECTED at model-required phases. ' +
    'Mechanical phases (INIT, AUDIT, SCORE, COLLECT, AUDIT_RECHECK) advance with action=start. ' +
    'ALL POSEIDON OUTPUT MUST BE DISPLAYED TO THE USER.',

  args: {
    targetPath: z.string().describe('Absolute path to the project root to build/audit'),
    action: z.enum(['start', 'status', 'abort', 'decide', 'plan', 'verify', 'diagnose', 'solve', 'phase', 'deactivate', 'revoke'])
      .default('start')
      .describe('start=advance mechanical phase, decide=submit DECIDE decision, plan=submit PLAN strategies, ' +
        'verify=submit VERIFY verdicts, diagnose=submit CONTAINER_TEST failure diagnosis, ' +
        'solve=submit PROBLEM_SOLVE solution, status=show state, abort=cancel, ' +
        'phase=alias for start, deactivate/revoke=user-chat only'),
    maxCycles: z.number().min(1).max(200).default(50),
    // Payload for model-required phases
    decision: z.string().optional().describe('For action=decide: PLAN | PROBLEM_SOLVE | ACCEPT_RISK'),
    reasoning: z.string().optional().describe('For action=decide/solve: your reasoning chain'),
    payload: z.string().optional().describe('JSON payload for action=plan/verify/diagnose (fileStrategies, agentVerdicts, diagnosis)'),
  },

  execute: async (args: {
    targetPath: string;
    action: 'start' | 'status' | 'abort' | 'decide' | 'plan' | 'verify' | 'diagnose' | 'solve' | 'phase' | 'deactivate' | 'revoke';
    maxCycles: number;
    decision?: string;
    reasoning?: string;
    payload?: string;
  }, ctx?: unknown) => {
    const rawCtx = cast<Record<string, unknown>>(ctx);
    const sessionId = (typeof rawCtx?.sessionId === 'string' ? rawCtx.sessionId : '') ||
      (typeof rawCtx?.sessionID === 'string' ? rawCtx.sessionID : '') || 'default';
    const agentName = (typeof rawCtx?.agent === 'string' ? rawCtx.agent : '') ||
      (typeof rawCtx?.agentName === 'string' ? rawCtx.agentName : '') || '';

    // LEAF NODE SECURITY
    if (isLeafNode(agentName)) {
      return '## POSEIDON MODE: ACCESS DENIED\n\nBuild agents cannot call trident-poseidon.\n\n---\n**[POSEIDON DISPLAY]**';
    }

    const displayFooter = '\n\n---\n**[POSEIDON DISPLAY] The user MUST see this full output.**';

    // Non-advancing actions (no Poseidon activation required)
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
        displayFooter;
    }

    if (args.action === 'abort') {
      poseidonState.setAbortFlag(sessionId, true);
      return '## POSEIDON GOD LOOP: ABORTED\n\nState saved for recovery.' + displayFooter;
    }

    if (args.action === 'deactivate' || args.action === 'revoke') {
      return '## POSEIDON MODE: STATE UNCHANGED\n\n' +
        'Mode changes only via user chat ("poseidon deactivate").' + displayFooter;
    }

    // ── PHASE-ADVANCING ACTIONS ──
    // All require Poseidon Mode active
    const isActive = poseidonState.isActive(sessionId) || poseidonState.isActive('default');
    if (!isActive) {
      return '## POSEIDON MODE: LOCKED\n\nPoseidon Mode is not active.' + displayFooter;
    }

    // Map 'phase' to 'start' for backward compat
    const effectiveAction = args.action === 'phase' ? 'start' : args.action;

    // ── PHASE VALIDATION (v4.4.3 Overhaul: no fallbacks) ──
    const currentPhase = getGodLoopPhase(args.targetPath);
    if (currentPhase) {
      const validation = validatePhaseAction(currentPhase, effectiveAction);
      if (!validation.valid) {
        tridentLog('WARN', 'trident-poseidon',
          'Phase action rejected: phase=' + currentPhase + ' action=' + effectiveAction);
        return '## ' + validation.error + displayFooter;
      }
    }

    // ── HANDLE MODEL-REQUIRED ACTIONS (store payload, then advance) ──
    if (effectiveAction === 'decide') {
      const payload = {
        decision: args.decision || 'PLAN',
        reasoning: args.reasoning || '',
      };
      godLoopOrchestrator.setPhasePayload(args.targetPath, payload);
      tridentLog('INFO', 'trident-poseidon', 'DECIDE payload stored: ' + payload.decision);
    }

    if (effectiveAction === 'plan') {
      let parsed: unknown = null;
      try { parsed = args.payload ? JSON.parse(args.payload) : { fileStrategies: [] }; }
      catch { parsed = { fileStrategies: [], raw: args.payload }; }
      godLoopOrchestrator.setPhasePayload(args.targetPath, parsed);
      tridentLog('INFO', 'trident-poseidon', 'PLAN payload stored');
    }

    if (effectiveAction === 'verify') {
      let parsed: unknown = null;
      try { parsed = args.payload ? JSON.parse(args.payload) : { agentVerdicts: [] }; }
      catch { parsed = { agentVerdicts: [], raw: args.payload }; }
      godLoopOrchestrator.setPhasePayload(args.targetPath, parsed);
      tridentLog('INFO', 'trident-poseidon', 'VERIFY payload stored');
    }

    if (effectiveAction === 'diagnose') {
      let parsed: unknown = null;
      try { parsed = args.payload ? JSON.parse(args.payload) : { diagnosis: [] }; }
      catch { parsed = { diagnosis: [], raw: args.payload }; }
      godLoopOrchestrator.setPhasePayload(args.targetPath, parsed);
      tridentLog('INFO', 'trident-poseidon', 'DIAGNOSE payload stored');
    }

    if (effectiveAction === 'solve') {
      const payload = {
        rootCause: args.reasoning || '',
        proposal: args.payload || '',
        nextPhase: 'LOOP',
      };
      godLoopOrchestrator.setPhasePayload(args.targetPath, payload);
      tridentLog('INFO', 'trident-poseidon', 'SOLVE payload stored');
    }

    // ── ADVANCE THE GOD LOOP ──
    poseidonState.setTargetPath(sessionId, args.targetPath);
    tridentLog('INFO', 'trident-poseidon',
      'Phase advance: ' + args.targetPath + ' action=' + effectiveAction);

    const result = await godLoopOrchestrator.runPhase(args.targetPath, sessionId);

    poseidonState.setScore(sessionId, result.score);
    poseidonState.incrementCycles(sessionId);

    const stateDir = path.join(args.targetPath, '.trident', 'god-loop');
    const shortLine = '🔄 POSEIDON CYCLE ' + result.cycle + ' | Score: ' + result.score +
      '/100 | Wave: ' + result.wave + ' | Phase: ' + result.phase + ' → ' + result.nextPhase;

    // Terminal states
    if (result.nextPhase === 'PASS' || result.nextPhase === 'LOOP') {
      return shortLine + '\n\n' + result.instructions.substring(0, 800) + displayFooter;
    }

    // DISPATCH — write full plan to disk, return short instruction
    if (result.requiresModelAction && result.phase === 'DISPATCH') {
      const dispatchPath = path.join(stateDir, 'wave-' + result.wave + '-dispatch.md');
      try {
        fs.mkdirSync(stateDir, { recursive: true });
        fs.writeFileSync(dispatchPath, result.instructions, 'utf-8');
      } catch (e) {
        tridentLog('WARN', 'trident-poseidon', 'Dispatch write failed: ' + (e instanceof Error ? e.message : String(e)));
      }
      return shortLine + '\n\n⚡ DISPATCH REQUIRED. Full plan: ' + dispatchPath +
        '\nDispatch ALL agents, then call trident-poseidon action=start.' + displayFooter;
    }

    // Model-required phases (DECIDE, PLAN, VERIFY, CONTAINER_TEST, PROBLEM_SOLVE)
    // Show full context inline — it's the intelligence the model needs
    if (result.requiresModelAction) {
      return shortLine + '\n\n' + result.instructions + displayFooter;
    }

    // Mechanical phases — short inline
    if (result.instructions.length <= 1500) {
      return shortLine + '\n\n' + result.instructions +
        '\n\n→ Call trident-poseidon action=start to advance.' + displayFooter;
    }

    // Long output — write to disk
    const detailPath = path.join(stateDir, 'phase-' + result.phase + '-details.md');
    try { fs.writeFileSync(detailPath, result.instructions, 'utf-8'); }
    catch (e) { tridentLog('WARN', 'trident-poseidon', 'Details write failed'); }

    return shortLine + '\n\nPhase details: ' + detailPath +
      '\n→ Call trident-poseidon action=start to advance to ' + result.nextPhase + '.' + displayFooter;
  },
});
