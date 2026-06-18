import { orchestrator } from '../orchestrator.js';
import { isToolAllowed as isToolAllowedAllowlist } from '../security/tool-allowlist.js';
import { setCurrentAgent, getCurrentAgent, getToolsCalled, resetToolsCalled, incrementToolsCalled, getLastMessage, setLastMessage } from './agent-state.js';
import { tridentLog, getEvidenceStore } from '../utils.js';
import { IdentityLoader, formatIdentityHeader } from '../identity/index.js';
import { isTridentAgent } from '../identity/agent-identity.js';
import { createSessionHook } from './session-hook.js';
import { checkGuardian } from './guardian-hook.js';
import { invalidateT1Cache } from '../shared/t2-loader.js';
import { hookRegistry } from '../shared/warhead-registry.js';
import { registerWarheadHooks } from '../shared/trident-warhead-synthesizer.js';
import { auditLayerProgressionWarhead } from '../shared/warheads/warhead-gates.js';
import { gateManager } from '../shared/gates.js';
// GateManager RESTORED v4.3.2 — coexists with audit layer progression.
// GateManager controls WORKFLOW permissions (what can the agent DO).
// AuditLayerProgression tracks REVIEW completion (what has been AUDITED).
import * as path from 'node:path';
import * as fs from 'node:fs';

// ── Evidence store interface for type-safe access ──
interface EvidenceStoreLike {
  append(sessionId: string, mode: string, layer: string, eventType: string, payload: Record<string, unknown>): Promise<unknown>;
  queryByMode(mode: string): Promise<Array<Record<string, unknown>>>;
}

// ── WARHEAD HOOK INITIALIZATION (async — warheads may need init()) ──
(async () => {
  try {
    await registerWarheadHooks();
    await tridentLog('INFO', 'trident-hooks', 'All warheads registered successfully');
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    await tridentLog('ERROR', 'trident-hooks', `Warhead init failed: ${msg}`);
  }
})();

// ── LAYER 2: REMOVED — Hive full access granted (v4.3.2) ──

// ── LAYER 3: THEATRICAL CATEGORIES (T3 NLP + Merkle) ──
var THEATRICAL_CATEGORIES: Record<string, string> = {
  MOCK_STUB_SUGGESTION: 'Agent suggests using mocks/stubs instead of real implementation',
  HOST_FALLBACK: 'Agent claims host testing proves functionality - container execution required',
  MODEL_USAGE: 'Agent suggests switching to a different model instead of solving the problem',
  SIMULATED_EXECUTION: 'Results claimed without actual tool execution',
};

// ── NARRATION PATTERNS — only block pre-tool narration and phantom results ──
var PRE_TOOL_NARRATION = [
  { regex: /\bI (would|could|can|will|should|shall) (use|call|run|invoke|execute|employ) \w+/i, label: 'WOULD_USE' },
  { regex: /\b(let me|I'll|I will|allow me to) (audit|analyze|plan|review|scan|check|inspect)\b/i, label: 'LET_ME' },
  { regex: /\b(one |an |the )?(approach|path|strategy) would be to\b/i, label: 'APPROACH_WOULD_BE' },
  { regex: /\b(first|firstly|initially)(,| I| we| let| the) (I'?ll|I will|let me|we will)\b/i, label: 'FIRST_NARRATION' },
];
var PHANTOM_RESULTS = [
  { regex: /\b(the |my |our |this )?(audit|analysis|review|scan|report) (found|finds|shows|reveals|indicates|confirms|detected|identified)\b/i, label: 'PHANTOM_FINDINGS' },
  { regex: /\b(based on|according to|per|as per) (the |my |our |this )?(audit|analysis|review|findings|results)\b/i, label: 'PHANTOM_REFERENCE' },
  { regex: /\b(trident-\w+) (can|would|could|will|should|is used to|helps|allows|enables)\b/i, label: 'TOOL_DESCRIPTION' },
  // Shell simulation — model textually outputs fake terminal results after tool block
  { regex: /^\s*\$ \w+/m, label: 'SHELL_SIMULATION' },
  { regex: /^\s*# \w+/m, label: 'HALLUCINATED_COMMENT' },
  { regex: /^\s*(drwx|total \d+|-\w+-|lrwx)/m, label: 'FAKE_LS_OUTPUT' },
];

// ── P2 FIX: Type-guarded accessors replace ALL `as any` casts ──

function getStringField(obj: unknown, field: string): string {
  if (obj && typeof obj === 'object' && field in obj) {
    const val = (obj as Record<string, unknown>)[field];
    if (typeof val === 'string') return val;
  }
  return '';
}

function getSessionId(input: Record<string, unknown>): string {
  return getStringField(input, 'sessionID');
}

// ── P2 FIX: extractOutputText rewritten with runtime type guards ──
// Previous version had 6 unguarded `as` casts in 4 lines.
// Now each access is guarded by typeof checks.
function extractOutputText(output: Record<string, unknown>): string {
  const msg = output?.message;
  if (msg && typeof msg === 'object' && msg !== null) {
    const content = (msg as Record<string, unknown>).content;
    if (typeof content === 'string') return content;
  }
  const parts = output?.parts;
  if (Array.isArray(parts)) {
    for (const p of parts) {
      if (p && typeof p === 'object' && (p as Record<string, unknown>).type === 'text') {
        const text = (p as Record<string, unknown>).text;
        if (typeof text === 'string') return text;
      }
    }
  }
  return '';
}

function buildNarrationRejection(label: string): string {
  return '[TRIDENT BLOCKED: ' + label + ']\n\nYou described what you would do instead of doing it. Trident is an EXECUTION ENGINE.\n\nCall one of your 4 mode tools:\n  trident-code-audit | trident-deep-planning\n  trident-problem-solving | trident-context-synthesis\n\nThen present the actual results. Do not describe what you WOULD do — DO it.';
}

function buildPhantomRejection(label: string): string {
  return '[TRIDENT BLOCKED: ' + label + ']\n\nYou reported findings from a tool you did not call. This is hallucinated output.\n\nCall the tool FIRST, then report what it ACTUALLY produced.\nYour response was discarded. Execute Step 2 before Step 3.';
}

// ── IDENTITY LOADER ──
var identityLoaderInstance = new IdentityLoader();
var identityHeaderPromise: Promise<string> | null = null;

async function getIdentityHeader(): Promise<string> {
  if (identityHeaderPromise) return identityHeaderPromise;
  identityHeaderPromise = (async () => {
    try {
      var bundle = await identityLoaderInstance.loadForRole('trident');
      return formatIdentityHeader(bundle);
    } catch (e: unknown) {
      console.error('[Trident] Identity load failed:', e instanceof Error ? e.message : String(e));
      return '[TRIDENT v4.3.2 IDENTITY BINDING]\n\nYou are Trident Brain v4.3.2 — Code audit and analysis engine.\n\n[END TRIDENT IDENTITY BINDING]';
    }
  })();
  return identityHeaderPromise;
}

function logIdentityInjection(mode: string, sections: number): void {
  try {
    var logPath = path.join(process.cwd(), '.trident', 'evidence', 'identity-injection-log.md');
    var dir = path.dirname(logPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    var line = '\n### Identity Injection — ' + new Date().toISOString()
      + '\n- **Hook:** ' + mode
      + '\n- **Sections:** ' + sections
      + '\n- **T1 Warhead:** injected at index 1\n';
    fs.appendFileSync(logPath, line, 'utf-8');
  } catch (e: unknown) {
    console.error('[Trident] Injection log append failed:', e instanceof Error ? e.message : String(e));
  }
}

// ── THEATRICAL PATTERN DETECTION (keyword matching on tool args) ──
async function checkTheatricalPatterns(toolName: string, input: Record<string, unknown>): Promise<{ blocked: boolean; category?: string; reason?: string }> {
  var rawArgs = input?.args;
  if (typeof rawArgs !== 'object' || rawArgs === null) return { blocked: false };
  var argValues = Object.values((rawArgs as Record<string, unknown>) || {});
  var allArgsString = argValues.map(function(v: unknown) { return typeof v === 'string' ? v : JSON.stringify(v); }).join(' ');
  if (!allArgsString) return { blocked: false };
  var lower = allArgsString.toLowerCase();
  if (/\bmock\b/.test(lower) || /\bstub\b/.test(lower)) {
    return { blocked: true, category: 'MOCK_STUB_SUGGESTION', reason: THEATRICAL_CATEGORIES.MOCK_STUB_SUGGESTION };
  }
  if (/\bhost\s+(testing|test|run|execute)\b/.test(lower) || /on\s+(the\s+)?host/.test(lower)) {
    return { blocked: true, category: 'HOST_FALLBACK', reason: THEATRICAL_CATEGORIES.HOST_FALLBACK };
  }
  if (/\b(switch|fallback|change)\s+(to\s+)?(GLM|DeepSeek|GPT|model)/i.test(lower)) {
    return { blocked: true, category: 'MODEL_USAGE', reason: THEATRICAL_CATEGORIES.MODEL_USAGE };
  }
  return { blocked: false };
}

async function checkTheatricalMerkle(input: Record<string, unknown>): Promise<{ blocked: boolean; category?: string; reason?: string }> {
  var argText = JSON.stringify(input?.args || '');
  if (/the\s+(audit|analysis|review)\s+(found|finds|shows|reveals)/i.test(argText)) {
    try {
      var store = await getEvidenceStore() as unknown as EvidenceStoreLike;
      var auditEntries = await store.queryByMode('CODE_REVIEW');
      if (!auditEntries || auditEntries.length === 0) {
        return { blocked: true, category: 'SIMULATED_EXECUTION', reason: THEATRICAL_CATEGORIES.SIMULATED_EXECUTION + ' — no audit tool call found in evidence chain.' };
      }
    } catch (e: unknown) {
      await tridentLog('ERROR', 'merkle', `Merkle check failed: ${e instanceof Error ? e.message : String(e)}`);
      return { blocked: false };
    }
  }
  return { blocked: false };
}

var sessionHook = createSessionHook();

var chatMessageHook = async function(input: Record<string, unknown>, output: Record<string, unknown>) {
  var sid = getSessionId(input);
  var agent = (input.agent as string) || (input.agentName as string) || getCurrentAgent(sid) || '';
  if (isTridentAgent(agent)) {
    setCurrentAgent(agent, sid);
    // ── WARHEAD: fire chat message hooks ──
    try { await hookRegistry.fire('chat.message', input, output); } catch (e: unknown) {
      await tridentLog('ERROR', 'chat.message', `Warhead hook fire failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  } else if (agent) {
    setCurrentAgent(undefined, sid);
    return;
  } else {
    return;
  }

  // Determine if this is a user message or model response by checking the message role.
  // UserMessage has role "user", AssistantMessage has role "assistant".
  // Narration detection should ONLY apply to model responses (assistant role),
  // NOT to user input (which would cause false positives on user phrases like
  // "Let me" or "I would").
  var outputText = extractOutputText(output);
  var msgRaw = output?.message;
  if (typeof msgRaw !== 'object' || msgRaw === null) return; // message not an object — skip
  var msgRole = ((msgRaw as Record<string, unknown>)?.role as string) || '';
  var isUserInput = msgRole === 'user';

  if (isUserInput) {
    resetToolsCalled(getSessionId(input));
    // Don't apply narration detection to user input — only to model responses
    return;
  }

  // From here: this is a model response (assistant role). Apply narration detection.
  var sessionId = getSessionId(input);
  var hasCalledTool = getToolsCalled(sessionId) > 0;

  // Skip narration/phantom blocking if identity hasn't been injected yet
  // (first message after session start or tab-toggle — model doesn't know it's Trident)
  if (!orchestrator.getState(sessionId).identityLoaded) return;

  // ── BLOCK 1: Pre-tool narration (describing instead of executing) ──
  if (!hasCalledTool) {
    for (var pi = 0; pi < PRE_TOOL_NARRATION.length; pi++) {
      if (PRE_TOOL_NARRATION[pi].regex.test(outputText)) {
        output.error = true;
        output.isError = true;
        output.message = { role: 'system', content: buildNarrationRejection(PRE_TOOL_NARRATION[pi].label) };
        orchestrator.addArtifact('narration_blocked:' + PRE_TOOL_NARRATION[pi].label + ':' + Date.now(), outputText.substring(0, 200), sessionId);
        return;
      }
    }
  }

  // ── BLOCK 2: Phantom results (reporting findings without running the tool) ──
  if (!hasCalledTool) {
    for (var pi2 = 0; pi2 < PHANTOM_RESULTS.length; pi2++) {
      if (PHANTOM_RESULTS[pi2].regex.test(outputText)) {
        output.error = true;
        output.isError = true;
        output.message = { role: 'system', content: buildPhantomRejection(PHANTOM_RESULTS[pi2].label) };
        orchestrator.addArtifact('phantom_blocked:' + PHANTOM_RESULTS[pi2].label + ':' + Date.now(), outputText.substring(0, 200), sessionId);
        return;
      }
    }
  }

  if (msgRole === 'assistant') {
    setLastMessage(outputText, sessionId);
  }


};

var toolBeforeHook = async function(input: Record<string, unknown>, output: Record<string, unknown>) {
  var sessionId = getSessionId(input);
  if (!sessionId) return;  // No session context — can't determine agent
  var sessionAgent = getCurrentAgent(sessionId);
  if (!sessionAgent) return;
  if (!isTridentAgent(sessionAgent)) return;

  var toolName = input && input.tool as string || '';
  var commandStr = input?.args ? JSON.stringify(input.args) : null;
  var workflowGate = gateManager.getCurrentGate();
  var auditLayer = auditLayerProgressionWarhead.getStatus().currentLayer as string;
  var sessionMode = orchestrator.getState(sessionId).mode;
  checkGuardian(toolName, commandStr, sessionAgent, workflowGate, auditLayer, sessionMode);

  // ── WARHEAD: fire pre-tool hooks ──
  try { await hookRegistry.fire('tool.execute.before', input, output); } catch (e: unknown) {
    await tridentLog('ERROR', 'tool.before', `Warhead hook fire failed: ${e instanceof Error ? e.message : String(e)}`);
  }

  // LAYER 3: THEATRICAL OVERHAUL — T3 NLP + Merkle
  if (toolName) {
    var theatricalPatterns = await checkTheatricalPatterns(toolName, input);
    if (theatricalPatterns.blocked) {
      throw new Error('[TRIDENT THEATRICAL BLOCK] ' + theatricalPatterns.category + ': ' + theatricalPatterns.reason);
    }
    var theatricalMerkle = await checkTheatricalMerkle(input);
    if (theatricalMerkle.blocked) {
      throw new Error('[TRIDENT THEATRICAL BLOCK] ' + theatricalMerkle.category + ': ' + theatricalMerkle.reason);
    }
  }

  // Allowlist check + Phase 5 narration mismatch (runs after all blocking layers)
  try {
    if (toolName && !isToolAllowedAllowlist(toolName)) {
      throw new Error('[TRIDENT TOOL BLOCK] TOOL_BLOCKED: ' + toolName + ' - Deny-default allowlist.');
    }

    // ── PHASE 5: NARRATION MISMATCH DETECTION ──
    var lastMsg = getLastMessage(sessionId);
    if (lastMsg) {
      var narrationPatterns = [
        /i would (use|call|invoke|run)\s+\S+/i,
        /let me (use|call|invoke|run|try)\s+\S+/i,
        /first,?\s+(i will|i'll|i should)\s+\S+/i,
        /one approach would be/i,
        /the best (way|approach) is/i,
        /what i would do is/i,
      ];
      var isNarration = narrationPatterns.some(function(p: RegExp) { return p.test(lastMsg || ''); });
      var mentionedTool = lastMsg.match(/(trident-[a-z-]+|write|edit|bash)\b/i);
      if (isNarration && mentionedTool && mentionedTool[1] !== toolName) {
        throw new Error('TOOL EXECUTION REQUIRED: Call the tool directly');
      }
    }

    if (toolName && toolName.indexOf('trident-') === 0) {
      var auditMode: string = 'CODE_REVIEW';
      if (toolName.indexOf('deep-planning') !== -1) auditMode = 'DEEP_PLANNING';
      else if (toolName.indexOf('problem-solving') !== -1) auditMode = 'PROBLEM_SOLVING';
      else if (toolName.indexOf('context-synthesis') !== -1) auditMode = 'CONTEXT_SYNTHESIS';
      var store = await getEvidenceStore() as unknown as EvidenceStoreLike;
      await store.append(sessionId, auditMode, 'R0', toolName, { tool: toolName });
      orchestrator.addArtifact('tool_before:' + toolName + ':' + Date.now(), JSON.stringify({ tool: toolName }), sessionId);
      incrementToolsCalled(sessionId);
    }
  } catch (e: unknown) {
    console.error('[tool.before] Blocked:', toolName || 'unknown', '-', e instanceof Error ? e.message : String(e));
    tridentLog('WARN', 'tool.before', 'Blocked: ' + (toolName || 'unknown') + ' - ' + (e instanceof Error ? e.message : String(e)));
    throw e;
  }
};

var toolAfterHook = async function(input: Record<string, unknown>, output: Record<string, unknown>) {
  var sessionId = getSessionId(input);
  if (!sessionId) return;
  var sessionAgent = getCurrentAgent(sessionId);
  if (!sessionAgent) return;
  if (!isTridentAgent(sessionAgent)) return;
  // ── WARHEAD: fire post-tool hooks ──
  try { await hookRegistry.fire('tool.execute.after', input, output); } catch (e: unknown) {
    console.error('[tool.after] Warhead hook fire failed:', e instanceof Error ? e.message : String(e));
  }
};

var systemTransformHook = async function(input: Record<string, unknown>, output: Record<string, unknown>) {
  var systemOut = output as { system?: string[] };
  if (!systemOut || !Array.isArray(systemOut.system)) return;

  var sessionId = getSessionId(input);
  if (!sessionId) return;
  var sessionAgent = getCurrentAgent(sessionId);
  if (!sessionAgent) return;
  if (!isTridentAgent(sessionAgent)) return;

  // ── FIRE system.transform event to project folder warhead (Finding #8) ──
  try { await hookRegistry.fire('system.transform', input, output); } catch (e: unknown) {
    console.error('[system.transform] Warhead hook fire failed:', e instanceof Error ? e.message : String(e));
  }

  var header = await getIdentityHeader();

  // Always SCAN+REPLACE runtime defaults — the runtime re-appends them on every
  // message AFTER system.transform returns. The hasIdentity check (preventing
  // double-injection) is done per-string below, not as an early return.
  var replaced = false;
  for (var i = 0; i < systemOut.system.length; i++) {
    var s = systemOut.system[i];
    if (typeof s === 'string' && (
      s.indexOf('opencode') !== -1 ||
      s.indexOf('interactive CLI') !== -1 ||
      s.indexOf('software engineering') !== -1 ||
      s.indexOf('WebFetch') !== -1
    )) {
      systemOut.system[i] = header;
      replaced = true;
    }
  }
  if (!replaced) {
    systemOut.system.unshift(header);
  }

  // T1 WARHEAD INJECTION: splice at index 1 (right after identity header)
  try {
    var { synthesizeT1Injectables } = await import('../shared/t2-loader.js');
    var t1Content = synthesizeT1Injectables();
    var identityIdx = -1;
    for (var si = 0; si < systemOut.system.length; si++) {
      if (typeof systemOut.system[si] === 'string' &&
          systemOut.system[si].indexOf('TRIDENT v4.3.2 IDENTITY BINDING') !== -1) {
        identityIdx = si;
        break;
      }
    }
    if (identityIdx !== -1) {
      systemOut.system.splice(identityIdx + 1, 0, t1Content);
    }
  } catch (e: unknown) {
    await tridentLog('ERROR', 'system.transform', `T1 injection failed: ${e instanceof Error ? e.message : String(e)}`);
  }

  // Per-turn identity override: this instruction runs AFTER any runtime defaults
  // that the runtime appends post-transform. The model sees this as the MOST
  // RECENT instruction about identity questions, overriding any WebFetch heuristic.
  systemOut.system.push('[TRIDENT v4.3.2 EXECUTION PROTOCOL]'
    + '\n- You are an EXECUTION ENGINE. You do not describe what you would do. You DO it, then report what you found.'
    + '\n- SEQUENCE: 1) SELECT the right tool. 2) CALL it immediately. 3) REPORT the actual results.'
    + '\n- Never narrate your intent. Never describe what you WILL do. Execute first, then report findings.'
    + '\n- Identity: State "Trident Brain v4.3.2" concisely. Do not narrate your architecture.'
    + '\n- Constraints: edit/write/bash are blocked at the hook level.'
    + '\n- Tone: Professional, technical, direct. Not a character.');

  var state = orchestrator.getState(sessionId);
  var contextLines = [
    '[TRIDENT v4.3.2] Agent: ' + (sessionAgent || 'trident') + ' | Mode: ' + state.mode + ' | Layer: ' + state.currentLayer + '/17 | Status: ' + state.status,
    '[TRIDENT v4.3.2] PRINCIPLE: Trident audits code, documents findings, and manages pipeline gates.',
    '[TRIDENT v4.3.2] TOOLS: trident-code-audit (17-layer), trident-deep-planning, trident-problem-solving, trident-context-synthesis, trident-gate, trident-status, trident-vision, trident-help, hive_context, hive_remember, todowrite.',
  ];
  systemOut.system.push(contextLines.join('\n'));

  if (!state.identityLoaded) {
    orchestrator.setIdentityLoaded(true, sessionId);
  }

  logIdentityInjection('system.transform', 8);
};

var messagesTransformHook = async function(
  input: Record<string, unknown>,
  output: Record<string, unknown>
) {
  var sessionId = getSessionId(input);
  if (!sessionId) return;
  var sessionAgent = getCurrentAgent(sessionId);
  if (!sessionAgent) return;
  if (!isTridentAgent(sessionAgent)) return;

  try {
    var msgs = (output as Record<string, unknown>)?.messages as Array<Record<string, unknown>> | undefined;
    if (!msgs || !Array.isArray(msgs) || msgs.length === 0) return;

    var firstMsg = msgs[0] as Record<string, unknown>;
    var firstInfo = firstMsg?.info as Record<string, unknown> | undefined;

    var header = await getIdentityHeader();

    if (!firstInfo) {
      firstMsg.info = { role: 'system' };
      firstMsg.parts = [{ type: 'text', text: header }];
      logIdentityInjection('messages.transform', 8);
      return;
    }

    var currentSystem = (firstInfo.system as string) || '';
    if (currentSystem.indexOf('TRIDENT v4.3.2 IDENTITY BINDING') !== -1) return;

    firstInfo.system = header + '\n\n' + currentSystem;
    logIdentityInjection('messages.transform', 8);
  } catch (e: unknown) {
    await tridentLog('ERROR', 'messages.transform', `Identity injection failed: ${e instanceof Error ? e.message : String(e)}`);
  }
};

var compactingHook = async function(input: Record<string, unknown>, output: Record<string, unknown>) {
  const sessionId = getSessionId(input);
  if (!sessionId) return;
  const sessionAgent = getCurrentAgent(sessionId);
  if (!sessionAgent || !isTridentAgent(sessionAgent)) return;
  invalidateT1Cache();
  var systemOut = output as { system?: string[] };
  if (systemOut?.system && Array.isArray(systemOut.system)) {
    var header = await getIdentityHeader();
    var replaced = false;
    for (var i = 0; i < systemOut.system.length; i++) {
      if (typeof systemOut.system[i] === 'string' && (systemOut.system[i].indexOf('opencode') !== -1 || systemOut.system[i].indexOf('WebFetch') !== -1)) {
        systemOut.system[i] = header;
        replaced = true;
      }
    }
    if (!replaced) systemOut.system.unshift(header);
    systemOut.system.push(
      '[TRIDENT v4.3.2] Post-compaction artifacts: '
      + 'BUILD_SPEC=GENERATED_ARTIFACTS/BUILD_SPEC/BUILD_SPEC_TRIDENT_V432_20260608_INJECTION_PLAN.md '
      + 'T1_INJECTABLE=GENERATED_ARTIFACTS/T1_INJECTABLE/T1_TRIDENT_V432_INJECTABLE.md'
    );
    logIdentityInjection('compacting', 8);
  }
};

var commandExecuteHook = async function(input: Record<string, unknown>, output: Record<string, unknown>) {
  const sessionId = getSessionId(input);
  if (!sessionId) return;
  const sessionAgent = getCurrentAgent(sessionId);
  if (!sessionAgent || !isTridentAgent(sessionAgent)) return;
  var cmd = input.command as string;
  var args = (input.arguments as string) || '';
  if (cmd === 'run' && args.indexOf('--agent') !== -1 && args.indexOf('trident') !== -1) {
    var message = args.replace(/--agent\s+\S+\s*/g, '').trim();
    if (message) {
      var sessionMode = orchestrator.getState(sessionId).mode;
      checkGuardian('opencode-run', message, 'trident', gateManager.getCurrentGate(), auditLayerProgressionWarhead.getStatus().currentLayer as string, sessionMode);
    }
  }
};

export function createTridentHooks() {
  return {
    'event': sessionHook,
    'chat.message': chatMessageHook,
    'tool.execute.before': toolBeforeHook,
    'tool.execute.after': toolAfterHook,
    'experimental.chat.system.transform': systemTransformHook,
    'experimental.chat.messages.transform': messagesTransformHook,
    'experimental.session.compacting': compactingHook,
    'command.execute.before': commandExecuteHook,
  };
}
