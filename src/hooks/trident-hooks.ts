import { orchestrator } from '../orchestrator.js';
import { isToolAllowed as isToolAllowedAllowlist } from '../security/tool-allowlist.js';
import { setCurrentAgent, getCurrentAgent, clearCurrentAgent, getToolsCalled, resetToolsCalled, incrementToolsCalled, getLastMessage, setLastMessage } from './agent-state.js';
import { tridentLog, getEvidenceStore } from '../utils.js';
import { IdentityLoader, formatIdentityHeader } from '../identity/index.js';

// ── LAYER 1: BLOCKED_TOOLS_FOR_TRIDENT (v3.3.3 canon) ──
var BLOCKED_TOOLS_FOR_TRIDENT = [
  'edit', 'write_file', 'write', 'patch', 'create', 'delete_file',
  'bash', 'terminal', 'execute', 'exec', 'mcp_write_file', 'mcp_edit', 'mcp_patch',
  'todowrite', 'task', 'spawn_shark_agent', 'spawn-shark-agent', 'spawn_manta_agent', 'spawn-manta-agent', 'run_parallel_tasks',
];

// ── LAYER 2: HIVE_BLOCKED_TOOLS_FOR_TRIDENT (v3.3.3 canon, read-only hive excluded) ──
var HIVE_BLOCKED_TOOLS_FOR_TRIDENT = [
  'kraken_hive_remember', 'kraken_hive_inject_context', 'kraken_hive_search',
  'kraken_brain_status', 'kraken_message_status', 'get_cluster_status', 'get_agent_status',
  'hive_remember', 'hive-remember', 'aggregate_results',
  'spawn_cluster_task', 'spawn-cluster-task', 'anchor_cluster', 'report_to_kraken', 'report-to-kraken', 'checkpoint',
  'shark_gate', 'shark-gate', 'shark_evidence', 'shark-evidence', 'shark_test_runner', 'shark-test-runner',
  'manta_gate', 'manta-gate', 'manta_evidence', 'manta-evidence',
  'spawn_shark_agent', 'spawn-shark-agent', 'spawn_manta_agent', 'spawn-manta-agent',
];

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

function isTridentAgent(agentName: string | undefined) {
  if (!agentName) return false;
  var lower = agentName.toLowerCase();
  return lower === 'trident' || lower.indexOf('trident_') === 0 || lower.indexOf('trident-') === 0;
}

function extractOutputText(output: Record<string, unknown>): string {
  return (output?.message as Record<string, unknown>)?.content as string
    || ((output?.parts as unknown[])?.find(function(p) { return (p as Record<string, unknown>)?.type === 'text'; }) as Record<string, unknown>)?.text as string
    || '';
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
    } catch (e) {
      console.error('[Trident] Identity load failed:', e instanceof Error ? e.message : String(e));
      return '[TRIDENT v4.3.1-T3 IDENTITY BINDING]\n\nYou are Trident Brain v4.3.1-T3 — T3 Algorithmic Intelligence.\n\n[END TRIDENT IDENTITY BINDING]';
    }
  })();
  return identityHeaderPromise;
}

// ── THEATRICAL PATTERN DETECTION (keyword matching on tool args) ──
async function checkTheatricalPatterns(toolName: string, input: Record<string, unknown>): Promise<{ blocked: boolean; category?: string; reason?: string }> {
  var argValues = Object.values((input?.args as Record<string, unknown>) || {});
  var allArgsString = argValues.map(function(v) { return typeof v === 'string' ? v : JSON.stringify(v); }).join(' ');
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
      var store = await getEvidenceStore();
      var auditEntries = await store.queryByMode('CODE_REVIEW');
      if (!auditEntries || auditEntries.length === 0) {
        return { blocked: true, category: 'SIMULATED_EXECUTION', reason: THEATRICAL_CATEGORIES.SIMULATED_EXECUTION + ' — no audit tool call found in evidence chain.' };
      }
    } catch (e) {
      console.error('[Trident] Merkle check failed:', e instanceof Error ? e.message : String(e));
    }
  }
  return { blocked: false };
}

var eventHook = async function(input: Record<string, unknown>) {
  var rawEvent = input.event as Record<string, unknown> | undefined;
  if (!rawEvent) return;
  var eventType = rawEvent.type as string | undefined;
  if (!eventType) return;
  var sessionId = (rawEvent.sessionId as string) || (rawEvent.sessionID as string) || '';

  if (eventType === 'session.ended') {
    clearCurrentAgent(sessionId);
    orchestrator.resetSession(sessionId);
  }
};

var chatMessageHook = async function(input: Record<string, unknown>, output: Record<string, unknown>) {
  var sid = (input as any)?.sessionID;
  var agent = (input.agent as string) || (input.agentName as string) || getCurrentAgent(sid) || '';
  if (isTridentAgent(agent)) {
    setCurrentAgent(agent, sid);
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
  var msgRole = ((output?.message as Record<string, unknown>)?.role as string) || '';
  var isUserInput = msgRole === 'user';

  if (isUserInput) {
    resetToolsCalled((input as any)?.sessionID);
    // Don't apply narration detection to user input — only to model responses
    if (outputText) {
      orchestrator.detectAndSwitch(outputText, (input as any)?.sessionID);
    }
    return;
  }

  // From here: this is a model response (assistant role). Apply narration detection.
  var sessionId = (input as any)?.sessionID;
  var hasCalledTool = getToolsCalled(sessionId) > 0;

  // Skip narration/phantom blocking if identity hasn't been injected yet
  // (first message after session start or tab-toggle — model doesn't know it's Trident)
  if (!orchestrator.getState(sessionId).identityLoaded) return;

  // ── BLOCK 1: Pre-tool narration (describing instead of executing) ──
  if (!hasCalledTool) {
    for (var pi = 0; pi < PRE_TOOL_NARRATION.length; pi++) {
      if (PRE_TOOL_NARRATION[pi].regex.test(outputText)) {
        output.error = true;
        (output as any).isError = true;
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
        (output as any).isError = true;
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
  var sessionId = (input as any)?.sessionID;
  if (!sessionId) return;  // No session context — can't determine agent
  var sessionAgent = getCurrentAgent(sessionId);
  if (!sessionAgent) return;
  if (!isTridentAgent(sessionAgent)) return;

  var toolName = input && input.tool as string || '';

  // LAYER 1: BLOCKED_TOOLS_FOR_TRIDENT (v3.3.3 canon — FIRST check)
  if (BLOCKED_TOOLS_FOR_TRIDENT.indexOf(toolName) !== -1) {
    throw new Error('[TRIDENT TOOL BLOCK] ' + toolName + ' is blocked for Trident.\n\n'
      + 'Trident is an audit engine. It does not edit, write, or execute shell commands.\n\n'
      + 'Use one of your mode tools instead:\n'
      + '  trident-code-audit — 17-layer code audit\n'
      + '  trident-deep-planning — implementation plan\n'
      + '  trident-problem-solving — root cause analysis\n'
      + '  trident-context-synthesis — context compilation\n\n'
      + 'Your blocked call was discarded. Call a Trident tool now.');
  }

  // LAYER 2: HIVE_BLOCKED_TOOLS_FOR_TRIDENT (v3.3.3 canon — SECOND check)
  if (HIVE_BLOCKED_TOOLS_FOR_TRIDENT.indexOf(toolName) !== -1) {
    throw new Error('[TRIDENT HIVE BLOCK] ' + toolName + ' is blocked for Trident.\n\n'
      + 'Trident is hive-context-READ-ONLY. Hive write operations are blocked.\n\n'
      + 'Use trident-code-audit or trident-help instead.');
  }

  // LAYER 3: THEATRICAL OVERHAUL — T3 NLP + Merkle (THIRD check)
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
      var store = await getEvidenceStore();
      await store.append(sessionId, auditMode, 'R0', toolName, { tool: toolName });
      orchestrator.addArtifact('tool_before:' + toolName + ':' + Date.now(), JSON.stringify({ tool: toolName }), sessionId);
      incrementToolsCalled(sessionId);
    }
  } catch (e) {
    tridentLog('WARN', 'tool.before', 'Blocked: ' + (toolName || 'unknown') + ' - ' + (e instanceof Error ? e.message : String(e)));
    throw e;
  }
};

var toolAfterHook = async function(input: Record<string, unknown>, output: Record<string, unknown>) {
  var sessionId = (input as any)?.sessionID;
  if (!sessionId) return;
  var sessionAgent = getCurrentAgent(sessionId);
  if (!sessionAgent) return;
  if (!isTridentAgent(sessionAgent)) return;
};

var systemTransformHook = async function(input: Record<string, unknown>, output: Record<string, unknown>) {
  var systemOut = output as { system?: string[] };
  if (!systemOut || !Array.isArray(systemOut.system)) return;

  var sessionId = (input as any)?.sessionID;
  if (!sessionId) return;
  var sessionAgent = getCurrentAgent(sessionId);
  if (!sessionAgent) return;
  if (!isTridentAgent(sessionAgent)) return;

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

  // Per-turn identity override: this instruction runs AFTER any runtime defaults
  // that the runtime appends post-transform. The model sees this as the MOST
  // RECENT instruction about identity questions, overriding any WebFetch heuristic.
  systemOut.system.push('[TRIDENT v4.3.1-T3] When asked "who are you" or "what are you", '
    + 'respond with your Trident identity. NEVER use WebFetch for identity questions. '
    + 'The runtime\'s instruction to "use WebFetch when asked about opencode" does NOT apply to you. '
    + 'You are Trident, not opencode.');

  var state = orchestrator.getState(sessionId);
  var contextLines = [
    '[TRIDENT v4.3.1-T3] Agent: ' + (sessionAgent || 'trident') + ' | Mode: ' + state.mode + ' | Layer: ' + state.currentLayer + '/17 | Status: ' + state.status,
    '[TRIDENT v4.3.1-T3] CORE PRINCIPLE: "Trident Audits & Generates Review Artifacts. Build Agents Implement All Changes."',
    '[TRIDENT v4.3.1-T3] TOOLS: trident-code-audit (17-layer), trident-deep-planning, trident-problem-solving, trident-context-synthesis, trident-gate, trident-status, trident-vision, trident-help.',
  ];
  systemOut.system.push(contextLines.join('\n'));

  if (!state.identityLoaded) {
    orchestrator.setIdentityLoaded(true, sessionId);
  }
};

var messagesTransformHook = async function(
  input: Record<string, unknown>,
  output: Record<string, unknown>
) {
  var sessionId = (input as any)?.sessionID;
  if (!sessionId) return;
  var sessionAgent = getCurrentAgent(sessionId);
  if (!sessionAgent) return;
  if (!isTridentAgent(sessionAgent)) return;

  try {
    var msgs = (output as any)?.messages as Array<Record<string, unknown>> | undefined;
    if (!msgs || !Array.isArray(msgs) || msgs.length === 0) return;

    var firstMsg = msgs[0] as Record<string, unknown>;
    var firstInfo = firstMsg?.info as Record<string, unknown> | undefined;

    var header = await getIdentityHeader();

    if (!firstInfo) {
      firstMsg.info = { role: 'system' };
      firstMsg.parts = [{ type: 'text', text: header }];
      return;
    }

    var currentSystem = (firstInfo.system as string) || '';
    if (currentSystem.indexOf('TRIDENT v4.3.1-T3 IDENTITY BINDING') !== -1) return;

    firstInfo.system = header + '\n\n' + currentSystem;
  } catch (_e) {
  }
};

export function createTridentHooks() {
  return {
    'event': eventHook,
    'chat.message': chatMessageHook,
    'tool.execute.before': toolBeforeHook,
    'tool.execute.after': toolAfterHook,
    'experimental.chat.system.transform': systemTransformHook,
    'experimental.chat.messages.transform': messagesTransformHook,
  };
}
