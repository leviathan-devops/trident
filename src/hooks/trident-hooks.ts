import { appendFileSync } from 'node:fs';
import { orchestrator } from '../orchestrator.js';
import { isToolAllowed as isToolAllowedAllowlist } from '../security/tool-allowlist.js';
import { setCurrentAgent, getCurrentAgent, clearCurrentAgent, getToolsCalled, resetToolsCalled, incrementToolsCalled, getLastMessage, setLastMessage } from './agent-state.js';
import { tridentLog, getEvidenceStore } from '../utils.js';
import { IdentityLoader, formatIdentityHeader } from '../identity/index.js';
import { isTridentAgent } from '../identity/agent-identity.js';
import { createSessionHook } from './session-hook.js';
import { checkGuardian } from './guardian-hook.js';
import { checkIdentityBeforeTool, notifyIdentityLoaded } from './identity-enforcer-hook.js';
import { invalidateT1Cache, synthesizeT1Injectables } from '../shared/trident-warhead-synthesizer.js';
import { hookRegistry } from '../shared/warhead-registry.js';
import { ConcurrencyManager } from '../warheads/concurrency/index.js';
import { NLPPipeline } from '../warheads/nlp-pipeline/index.js';
import { SevenQEnforcement } from '../warheads/seven-q-enforcement/index.js';
import { PoseidonDetector } from '../warheads/nlp-pipeline/poseidon-detector.js';
import { poseidonState } from '../poseidon/poseidon-state.js';

// ── INLINE UTILITY TYPES (replace as any casts) ──
type InputMessage = Record<string, unknown> & {
  sessionID?: string;
  agent?: string;
  agentName?: string;
  tool?: string;
  args?: Record<string, unknown>;
  info?: { agent?: string };
  message?: { role?: string; content?: string; agent?: string };
  command?: string;
  arguments?: string;
  input?: Record<string, unknown>;
  params?: Record<string, unknown>;
  subagent_type?: string;
  subagentType?: string;
};

// ── LAYER 1: BLOCKED_TOOLS_FOR_TRIDENT (v4.3.3 canon) ──
var BLOCKED_TOOLS_FOR_TRIDENT = [
  'edit', 'write_file', 'write', 'patch', 'create', 'delete_file',
  'bash', 'terminal', 'execute', 'exec', 'mcp_write_file', 'mcp_edit', 'mcp_patch',
];

// ── LAYER 2: HIVE_BLOCKED_TOOLS_FOR_TRIDENT (v4.3.3 canon, read-only hive excluded) ──
var HIVE_BLOCKED_TOOLS_FOR_TRIDENT = [
  'get_cluster_status',
  'aggregate_results',
  'report_to_kraken', 'report-to-kraken',
  'shark_gate', 'shark-gate', 'shark_evidence', 'shark-evidence', 'shark_test_runner', 'shark-test-runner',
  'manta_gate', 'manta-gate', 'manta_evidence', 'manta-evidence',
];

// ── LAYER 3: THEATRICAL CATEGORIES (T3 NLP + Merkle) ──
var THEATRICAL_CATEGORIES: Record<string, string> = {
  MOCK_STUB_SUGGESTION: 'Agent suggests using mocks/stubs instead of real implementation',
  HOST_FALLBACK: 'Agent claims host testing proves functionality - container execution required',
  MODEL_USAGE: 'Agent suggests switching to a different model instead of solving the problem',
  SIMULATED_EXECUTION: 'Results claimed without actual tool execution',
};

// ── SEMANTIC THEATRICAL CONTEXT ANALYZER ──
// Replaces blind regex with context-aware intent detection.
// Distinguishes DESCRIPTIVE references (documenting anti-patterns to detect)
// from SUGGESTIVE references (proposing theatrical shortcuts).

// Intentionally repetitive — DESCRIPTIVE vs SUGGESTIVE signal word lists for semantic intent detection
var DESCRIPTIVE_SIGNALS: string[] = [
  'detect', 'block', 'flag', 'should', 'must', 'never',
  'anti-pattern', 'anti pattern', 'fix', 'remove', 'prevent',
  'check for', 'scan for', 'theatrical', 'identify', 'reject',
  'report', 'forbid', 'prohibit', 'invalid', 'defect', 'violation',
  'failure', 'incorrect', 'wrong', 'bad', 'broken', 'banned',
  'not allowed', 'prohibited', 'enforce against', 'guard against',
];

var SUGGESTIVE_SIGNALS: string[] = [
  'use', "let's", "i'll", 'we can', 'just', 'simply',
  'instead of', 'replace with', 'return', 'implement',
  'create', 'for now', 'temporarily', 'to save time',
  'as a placeholder', 'as a workaround', 'to skip', 'shortcut',
  'quick', 'easy way', 'cheat', 'fake', 'pretend',
];

var CODE_PATTERN_SIGNALS: RegExp[] = [
  /\breturn\s*\{\s*(blocked|valid|passed|success|ok)\s*:\s*(false|true)\s*\}/i,
  /\breturn\s+true\s*;?\s*(\/\/|\/\*)/i,
  /\bcatch\s*\([^)]*\)\s*\{\s*\}/i,
  /\bprocess\.exit\s*\(\s*0\s*\)/i,
];

// Analyzes the sentence-level context around a flagged keyword.
// Returns { blocked: true } only when SUGGESTIVE intent > DESCRIPTIVE intent.
function analyzeTheatricalContext(text: string, keyword: string): { blocked: boolean; confidence: number; snippet: string; reason?: string } | null {
  var lower = text.toLowerCase();
  var idx = lower.indexOf(keyword);
  if (idx === -1) return null;

  // Extract sentence containing the keyword
  var sentenceStart = Math.max(
    lower.lastIndexOf('.', idx),
    lower.lastIndexOf('!', idx),
    lower.lastIndexOf('?', idx),
    lower.lastIndexOf('\n', idx),
    0
  );
  var sentenceEnd = lower.length;
  var nextPeriod = lower.indexOf('.', idx + keyword.length);
  var nextBang = lower.indexOf('!', idx + keyword.length);
  var nextQuestion = lower.indexOf('?', idx + keyword.length);
  var nextNewline = lower.indexOf('\n', idx + keyword.length);
  if (nextPeriod !== -1) sentenceEnd = Math.min(sentenceEnd, nextPeriod + 1);
  if (nextBang !== -1) sentenceEnd = Math.min(sentenceEnd, nextBang + 1);
  if (nextQuestion !== -1) sentenceEnd = Math.min(sentenceEnd, nextQuestion + 1);
  if (nextNewline !== -1) sentenceEnd = Math.min(sentenceEnd, nextNewline);

  var sentence = lower.substring(sentenceStart, sentenceEnd).trim();

  // Score signals in the sentence
  var descriptiveScore = 0;
  var suggestiveScore = 0;

  for (var i = 0; i < DESCRIPTIVE_SIGNALS.length; i++) {
    if (sentence.indexOf(DESCRIPTIVE_SIGNALS[i]) !== -1) descriptiveScore++;
  }
  for (var j = 0; j < SUGGESTIVE_SIGNALS.length; j++) {
    if (sentence.indexOf(SUGGESTIVE_SIGNALS[j]) !== -1) suggestiveScore++;
  }
  // Code patterns are strong suggestive signals (+2 each)
  for (var k = 0; k < CODE_PATTERN_SIGNALS.length; k++) {
    if (CODE_PATTERN_SIGNALS[k].test(sentence)) suggestiveScore += 2;
  }

  var snippet = sentence.substring(0, 120);
  var totalSuggestive = suggestiveScore;

  if (totalSuggestive > descriptiveScore) {
    return {
      blocked: true,
      confidence: totalSuggestive / (totalSuggestive + descriptiveScore + 1),
      snippet: snippet,
    };
  }

  // Allow — descriptive context dominates or ambiguous (safe default: allow)
  return null;
}

// ── CONCURRENCY: Real TokenBucket + CircuitBreaker ──
var concurrencyManager = new ConcurrencyManager(60, 10, 1000);

// ── NLP PIPELINE: Intent routing via wink-nlp ──
var nlpPipeline = new NLPPipeline();

// ── 7-Q ENFORCEMENT: Mechanical pre-tool gate ──
var sevenQEnforcement = new SevenQEnforcement();

var poseidonDetector = new PoseidonDetector();

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
      tridentLog('ERROR', 'hooks', `Identity load failed: ${(e as Error).message || e}`);
      return '[TRIDENT v4.4 IDENTITY BINDING]\n\nYou are Trident Brain v4.4 — T3 Algorithmic Intelligence.\n\n[END TRIDENT IDENTITY BINDING]';
    }
  })();
  return identityHeaderPromise;
}

// ── THEATRICAL PATTERN DETECTION (semantic context analysis on tool args) ──
async function checkTheatricalPatterns(toolName: string, input: Record<string, unknown>): Promise<{ blocked: boolean; category?: string; reason?: string } | null> {
  var argValues = Object.values((input?.args as Record<string, unknown>) || {});
  var allArgsString = argValues.map(function(v) { return typeof v === 'string' ? v : JSON.stringify(v); }).join(' ');
  if (!allArgsString) return null;

  var lower = allArgsString.toLowerCase();

  // Keyword triggers — same keywords as before, but now with semantic analysis
  var keywordChecks = [
    { regex: /\bmock\b/, keyword: 'mock', category: 'MOCK_STUB_SUGGESTION' },
    { regex: /\bstub\b/, keyword: 'stub', category: 'MOCK_STUB_SUGGESTION' },
    { regex: /\bhost\s+(testing|test|run|execute)\b/, keyword: 'host', category: 'HOST_FALLBACK' },
    { regex: /\bon\s+(the\s+)?host\b/, keyword: 'host', category: 'HOST_FALLBACK' },
    { regex: /\b(switch|fallback|change)\s+(to\s+)?(glm|deepseek|gpt|model)\b/, keyword: 'switch', category: 'MODEL_USAGE' },
  ];

  for (var i = 0; i < keywordChecks.length; i++) {
    var check = keywordChecks[i];
    if (check.regex.test(lower)) {
      var analysis = analyzeTheatricalContext(allArgsString, check.keyword);
      if (analysis && analysis.blocked) {
        return {
          blocked: true,
          category: check.category,
          reason: THEATRICAL_CATEGORIES[check.category] + ' — Context: "' + analysis.snippet + '"',
        };
      }
      // Not blocked — descriptive context. Continue checking other keywords.
    }
  }

  return null;
}

// ── THEATRICAL MERKLE CHECK (semantic: distinguish claims from descriptions) ──
async function checkTheatricalMerkle(input: Record<string, unknown>): Promise<{ blocked: boolean; category?: string; reason?: string } | null> {
  var argText = JSON.stringify(input?.args || '');
  var lower = argText.toLowerCase();

  // Trigger: text mentions audit/analysis/review + result verbs
  if (/the\s+(audit|analysis|review)\s+(found|finds|shows|reveals)/i.test(argText)) {
    // Semantic check: is this DESCRIPTIVE ("the audit should find X")
    // or SUGGESTIVE ("the audit found X" — past-tense claim without evidence)?
    var descriptiveSignals = /(\bshould\b|\bwill\b|\bmust\b|\bcan\b|\bcould\b|\bwould\b|\bmay\b)/i.test(argText);
    var suggestiveSignals = /(\bfound\b|\brevealed\b|\bshows\b|\bconfirmed\b|\bdetected\b|\bdiscovered\b)/i.test(argText);

    // Only block if SUGGESTIVE (past-tense claim) without DESCRIPTIVE (modal/conditional)
    if (suggestiveSignals && !descriptiveSignals) {
      try {
        var store = await getEvidenceStore();
        var auditEntries = await store.queryByMode('CODE_REVIEW');
        if (!auditEntries || auditEntries.length === 0) {
          return {
            blocked: true,
            category: 'SIMULATED_EXECUTION',
            reason: THEATRICAL_CATEGORIES.SIMULATED_EXECUTION + ' — no audit tool call found in evidence chain.',
          };
        }
      } catch (e) {
        tridentLog('ERROR', 'hooks', `Merkle check failed: ${(e as Error).message || e}`);
        return null;
      }
    }
    // DESCRIPTIVE: "the audit should find X" — legitimate planning text, allow
  }

  return null;
}

var sessionHook = createSessionHook();

var chatMessageHook = async function(input: Record<string, unknown>, output: Record<string, unknown>) {
  // DEBUG: chat.message trace
  try { appendFileSync('/tmp/trident-hook-debug.log', `[${Date.now()}] CHAT_MESSAGE: fired | input keys: ${Object.keys(input || {}).join(',')}\n`); } catch { /* Debug logging non-fatal — plugin loading continues regardless */ }
  var sid = (input as InputMessage)?.sessionID || 'default';
  var agent = (input.agent as string) || (input.agentName as string) || (input as InputMessage)?.info?.agent || (input as InputMessage)?.message?.agent || getCurrentAgent(sid) || '';
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
    resetToolsCalled(sid);

    // POSEIDON DETECTION — runs before orchestrator detectAndSwitch
    if (outputText && typeof outputText === 'string') {
      var poseidonResult = poseidonDetector.detect(outputText);
      if (poseidonResult.detected) {
        if (poseidonResult.action === 'activate') {
          poseidonState.activate(sid);
          tridentLog('INFO', 'poseidon', `Poseidon Mode ACTIVATED (confidence: ${poseidonResult.confidence})`);
        } else if (poseidonResult.action === 'deactivate') {
          poseidonState.deactivate(sid);
          tridentLog('INFO', 'poseidon', `Poseidon Mode DEACTIVATED (confidence: ${poseidonResult.confidence})`);
        }
      }
    }

    if (outputText) {
      orchestrator.detectAndSwitch(outputText, sid);
    }
    if (outputText) {
      nlpPipeline.processMessage(outputText, sid);
    }
    return;
  }

  // From here: this is a model response (assistant role). Apply narration detection.
  var sessionId = (input as InputMessage)?.sessionID || 'default';
  var hasCalledTool = getToolsCalled(sessionId) > 0;

  // Skip narration/phantom blocking if identity hasn't been injected yet
  // (first message after session start or tab-toggle — model doesn't know it's Trident)
  if (!orchestrator.getState(sessionId).identityLoaded) return;

  // ── BLOCK 1: Pre-tool narration (describing instead of executing) ──
  if (!hasCalledTool) {
    for (var pi = 0; pi < PRE_TOOL_NARRATION.length; pi++) {
      if (PRE_TOOL_NARRATION[pi].regex.test(outputText)) {
        output.error = true;
        (output as { isError?: boolean }).isError = true;
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
        (output as { isError?: boolean }).isError = true;
        output.message = { role: 'system', content: buildPhantomRejection(PHANTOM_RESULTS[pi2].label) };
        orchestrator.addArtifact('phantom_blocked:' + PHANTOM_RESULTS[pi2].label + ':' + Date.now(), outputText.substring(0, 200), sessionId);
        return;
      }
    }
  }

  if (msgRole === 'assistant') {
    setLastMessage(outputText, sessionId);
  }

  // Fire warhead handlers registered in warhead-registry.ts
  await hookRegistry.fire('chat.message', input, output);
};

var toolBeforeHook = async function(input: Record<string, unknown>, output: Record<string, unknown>) {
  // FIRST: Check if this is a trident agent. Non-trident agents SKIP all trident enforcement.
  var sessionId = (input as InputMessage)?.sessionID;
  if (!sessionId) return;  // No session context — can't determine agent
  var sessionAgent = getCurrentAgent(sessionId);
  if (!sessionAgent || !isTridentAgent(sessionAgent)) return;

  // Concurrency gate: rate limit + circuit breaker
  var concurrencyTool = ((input && input.tool) as string) || '';
  if (concurrencyTool) {
    const concurrencyCheck = concurrencyManager.allowTool(concurrencyTool);
    if (!concurrencyCheck.allowed) {
      throw new Error('[CONCURRENCY BLOCK] ' + concurrencyCheck.reason);
    }
  }

  // v4.3.3: Identity enforcement — verify identity before any tool execution
  // Only runs for trident agents (non-trident agents return above)
  try {
    const idAgent = sessionAgent;
    const idTool = ((input && input.tool) as string) || '';
    const identityOk = checkIdentityBeforeTool(idAgent, idTool, sessionId);
    if (!identityOk) {
      throw new Error('[TRIDENT IDENTITY] Identity check denied tool execution');
    }

    // IdentityEnforcer class enforcement (all 4 spec rules)
    const { identityEnforcer } = await import('../identity/identity-enforcer.js');
    const enforceCtx = {
      toolName: idTool,
      toolArgs: ((output && output.args) as Record<string, unknown>) || {},
      agentName: idAgent || '',
      mode: orchestrator.getState(sessionId)?.mode || 'IDLE',
      currentGate: orchestrator.getState(sessionId)?.currentGate || 'R0',
      sessionId: sessionId || 'default',
    };
    const enforcement = identityEnforcer.enforce(enforceCtx);
    if (!enforcement.allowed) {
      const reasons = enforcement.results.filter(r => !r.passed && r.message).map(r => r.message).join('; ');
      throw new Error(`[IDENTITY ENFORCER] Blocked: ${reasons}`);
    }
  } catch (e) {
    throw e; // Re-throw identity blocks
  }

  var toolName = input && input.tool as string || '';
  var commandStr = output?.args ? JSON.stringify(output.args) : null;
  var currentMode = orchestrator.getState((input as InputMessage)?.sessionID)?.mode || 'IDLE';
  checkGuardian(toolName, commandStr, sessionAgent, 'PLAN', currentMode, input as Record<string, unknown>);

  // TASK_DISPATCH: Allow trident_explore from any mode
  var idAgent = (input as InputMessage)?.agent || sessionAgent || '';
  var idTool = typeof toolName === 'string' ? toolName : '';
  var isExploreTask = false;
  var subagentType = '';
  if (idTool === 'task') {
    // Read tool arguments from output.args (opencode SDK: input=metadata, output=args)
    var rawArgs = (output?.args || output || {}) as Record<string, unknown>;
    var argsStr = JSON.stringify(rawArgs || {});
    // STEP 1: Stringify check — catches "trident_explore" as exact JSON value
    if (argsStr.indexOf('"trident_explore"') !== -1) {
      subagentType = 'trident_explore';
    }
    // STEP 2: Direct field check (only subagent_type, NEVER agent)
    if (!subagentType) {
      var taskArgs = (rawArgs.input || rawArgs.args || rawArgs.params || rawArgs.arguments || rawArgs || {}) as Record<string, unknown>;
      if (typeof taskArgs === 'object' && taskArgs !== null) {
        subagentType = (taskArgs.subagent_type as string) || (taskArgs.subagentType as string) || '';
      }
    }
    // STEP 3: Flat format check
    if (!subagentType) {
      subagentType = (rawArgs as Record<string, unknown>)?.subagent_type as string || (rawArgs as Record<string, unknown>)?.subagentType as string || '';
    }
    // STEP 4: EXACT MATCH ONLY
    if (subagentType === 'trident_explore' || subagentType === 'trident_build') {
      isExploreTask = true;
    }

    // TASK SUBAGENT GATE: Only trident_explore and trident_build subagents allowed for task tool
    if (toolName === 'task' && !isExploreTask) {
      // DEBUG: Dump the ACTUAL output structure (args live in output, not input)
      var debugOutputStr = '';
      try { debugOutputStr = JSON.stringify(output, null, 2); } catch { debugOutputStr = String(output); }
      tridentLog('ERROR', 'trident-hooks', `TASK_BLOCK_DUMP: argsStr=${argsStr?.substring(0, 500)} | fullOutput=${debugOutputStr?.substring(0, 1000)} | inputKeys=${Object.keys(input || {}).join(',')} | outputKeys=${Object.keys(output || {}).join(',')} | argsType=${typeof (output as any)?.args} | argsKeys=${Object.keys((output as any)?.args || {}).join(',')}`);
      throw new Error('[TRIDENT TOOL BLOCK] task: only trident_explore and trident_build subagents allowed. Use trident_explore for research, trident_build for build execution.');
    }
  }

  // DEBUG: trace what the hook actually receives for task dispatches
  if (idTool === 'task') {
    tridentLog('DEBUG', 'trident-hooks', `task dispatch: isExploreTask=${isExploreTask}, subagentType=${subagentType}, agent=${idAgent}`);
  }

  // LAYER 1: BLOCKED_TOOLS_FOR_TRIDENT (v3.3.3 canon — FIRST check)
  // EXCEPTION: trident_explore task dispatches bypass this block (read-only subagent, any mode)
  if (!isExploreTask && BLOCKED_TOOLS_FOR_TRIDENT.indexOf(toolName) !== -1) {
    throw new Error('[TRIDENT TOOL BLOCK] ' + toolName + ' blocked');
  }

  // LAYER 2: HIVE_BLOCKED_TOOLS_FOR_TRIDENT (v4.3.3 canon — SECOND check)
  if (HIVE_BLOCKED_TOOLS_FOR_TRIDENT.indexOf(toolName) !== -1) {
    throw new Error('[TRIDENT HIVE BLOCK] ' + toolName + ' blocked');
  }

  // LAYER 3: THEATRICAL OVERHAUL — T3 NLP + Merkle (THIRD check)
  if (toolName) {
    var theatricalPatterns = await checkTheatricalPatterns(toolName, output);
    if (theatricalPatterns && theatricalPatterns.blocked) {
      throw new Error('[TRIDENT THEATRICAL BLOCK] ' + theatricalPatterns.category);
    }
    var theatricalMerkle = await checkTheatricalMerkle(output);
    if (theatricalMerkle && theatricalMerkle.blocked) {
      throw new Error('[TRIDENT THEATRICAL BLOCK] ' + theatricalMerkle.category);
    }
  }

  // 7-Q Enforcement: mechanical gate
  var sevenQArgs = ((output && output.args) as Record<string, unknown>) || {};
  var sevenQResult = sevenQEnforcement.checkAll(toolName, sevenQArgs);
  if (!sevenQResult.passed) {
    var sevenQReasons = sevenQResult.violations.map(function(v: { question: number; reason?: string }) { return 'Q' + v.question + ': ' + (v.reason || 'unknown'); }).join('; ');
    throw new Error('[7-Q BLOCKED] ' + sevenQReasons);
  }

  // Allowlist check + Phase 5 narration mismatch (runs after all blocking layers)
  // EXCEPTION: trident_explore task dispatches bypass allowlist (task tool is not in allowlist
  // by design — it's validated by the TASK_DISPATCH exception above)
  try {
    if (!isExploreTask && toolName && !isToolAllowedAllowlist(toolName)) {
      throw new Error('[FIREWALL_BLOCKED] tool not allowlisted: ' + toolName);
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

    // Log successful trident_explore dispatch
    if (toolName === 'task' && subagentType === 'trident_explore') {
      tridentLog('INFO', 'trident-hooks', `trident_explore dispatched: agent=${idAgent}, session=${sessionId}`);
      // Record the dispatch in evidence for audit trail
      try {
        const store = await getEvidenceStore();
        await store.append(sessionId, 'CONTEXT_SYNTHESIS', 'EXPLORE', 'task', {
          subagent_type: subagentType,
          agent: idAgent,
        });
      } catch {
        // Evidence store failure is non-fatal — dispatch still proceeds
      }
    }

    if (toolName && toolName.indexOf('trident-') === 0) {
      var auditMode: string = 'CODE_REVIEW';
      if (toolName.indexOf('deep-planning') !== -1) auditMode = 'DEEP_PLANNING';
      else if (toolName.indexOf('problem-solving') !== -1) auditMode = 'PROBLEM_SOLVING';
      else if (toolName.indexOf('context-synthesis') !== -1) auditMode = 'CONTEXT_SYNTHESIS';
      else if (toolName.indexOf('poseidon') !== -1) auditMode = 'POSEIDON';
      var store = await getEvidenceStore();
      await store.append(sessionId, auditMode, 'R0', toolName, { tool: toolName });
      orchestrator.addArtifact('tool_before:' + toolName + ':' + Date.now(), JSON.stringify({ tool: toolName }), sessionId);
      incrementToolsCalled(sessionId);
    }
  } catch (e) {
    tridentLog('WARN', 'tool.before', 'Blocked: ' + (toolName || 'unknown') + ' - ' + (e instanceof Error ? e.message : String(e)));
    throw e;
  }

  // Fire warhead handlers registered in warhead-registry.ts
  await hookRegistry.fire('tool.execute.before', input, output);
};

var toolAfterHook = async function(input: Record<string, unknown>, output: Record<string, unknown>) {
  var sessionId = (input as InputMessage)?.sessionID;
  if (!sessionId) return;
  var sessionAgent = getCurrentAgent(sessionId);
  if (!sessionAgent) return;
  if (!isTridentAgent(sessionAgent)) return;

  // Concurrency: record success for rate limiting
  var executedTool = ((input && input.tool) as string) || '';
  if (executedTool) {
    concurrencyManager.recordSuccess(executedTool);
  }

  // Fire warhead handlers registered in warhead-registry.ts
  await hookRegistry.fire('tool.execute.after', input, output);
};

var systemTransformHook = async function(input: Record<string, unknown>, output: Record<string, unknown>) {
  // DEBUG: Write trace to file for verification
  try { appendFileSync('/tmp/trident-hook-debug.log', `[${Date.now()}] system.transform FIRED | input keys: ${Object.keys(input || {}).join(',')} | sessionId: ${(input as InputMessage)?.sessionID}\n`); } catch { /* Debug logging non-fatal — plugin loading continues regardless */ }
  var systemOut = output as { system?: string[] };
  if (!systemOut || !Array.isArray(systemOut.system)) {
    try { appendFileSync('/tmp/trident-hook-debug.log', `[${Date.now()}] EARLY_RETURN: system array invalid\n`); } catch { /* Debug logging non-fatal — plugin loading continues regardless */ }
    return;
  }

  var sessionId = (input as InputMessage)?.sessionID;
  if (!sessionId) {
    try { appendFileSync('/tmp/trident-hook-debug.log', `[${Date.now()}] EARLY_RETURN: no sessionId\n`); } catch { /* Debug logging non-fatal — plugin loading continues regardless */ }
    return;
  }

  // GATE 3: Agent identity set by chat.message, NOT by system.transform input.
  var sessionAgent = getCurrentAgent(sessionId);
  if (!sessionAgent) return;
  if (!isTridentAgent(sessionAgent)) return;
  try { appendFileSync('/tmp/trident-hook-debug.log', `[${Date.now()}] agent=${sessionAgent} | tridentCheck=${isTridentAgent(sessionAgent)} | system.length=${systemOut.system?.length}\n`); } catch { /* Debug logging non-fatal — plugin loading continues regardless */ }

  // Deload: remove trident content if this is not a trident session
  if (!isTridentAgent(sessionAgent)) {
    for (let i = systemOut.system.length - 1; i >= 0; i--) {
      const s = systemOut.system[i];
      if (typeof s === 'string' && (
        s.indexOf('TRIDENT v4.4') !== -1 || 
        s.indexOf('[TRIDENT') !== -1 || 
        s.indexOf('[T1 WARHEAD') !== -1
      )) {
        systemOut.system.splice(i, 1);
      }
    }
    return;
  }

  // Dedup: skip if trident identity already injected this session
  const hasTridentIdentity = systemOut.system.some((s: string) =>
    typeof s === 'string' && s.indexOf('[TRIDENT v4.4 IDENTITY BINDING]') !== -1
  );
  if (hasTridentIdentity) return;

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
      break;
    }
  }
  if (!replaced) {
    systemOut.system.unshift(header);
  }

  // Per-turn identity override: this instruction runs AFTER any runtime defaults
  // that the runtime appends post-transform. The model sees this as the MOST
  // RECENT instruction about identity questions, overriding any WebFetch heuristic.
  systemOut.system.push('[TRIDENT v4.4] When asked "who are you" or "what are you", '
    + 'respond with your Trident identity. NEVER use WebFetch for identity questions. '
    + 'The runtime\'s instruction to "use WebFetch when asked about opencode" does NOT apply to you. '
    + 'You are Trident, not opencode.');

  var contextLines = [
    '[TRIDENT v4.4] CORE PRINCIPLE: "Trident Audits & Generates Review Artifacts. Build Agents Implement All Changes."',
    '[TRIDENT v4.4] TOOLS: trident-code-audit (18-layer), trident-deep-planning, trident-problem-solving, trident-context-synthesis, trident-poseidon (God Loop), trident-gate, trident-status, trident-vision, trident-help.',
    '[TRIDENT v4.4] Use trident-status for current mode/layer/state — NOT injected into system prompt to preserve prompt cache.',
  ];
  systemOut.system.push(contextLines.join('\n'));

  // P0: Inject T1 knowledge (warhead T0 + knowledge sections)
  try {
    const t1Knowledge = await synthesizeT1Injectables();
    if (t1Knowledge && t1Knowledge.length > 0) {
      var identityIdx = systemOut.system.findIndex((s: string) =>
        typeof s === 'string' && s.indexOf('[TRIDENT v4.4 IDENTITY BINDING]') !== -1
      );
      if (identityIdx !== -1) {
        systemOut.system.splice(identityIdx + 1, 0, t1Knowledge);
      } else {
        systemOut.system.push(t1Knowledge);
      }
    }
  } catch (e) {
    tridentLog('ERROR', 'hooks', 'T1 synthesis failed: ' + ((e as Error).message || e));
  }

  if (!state.identityLoaded) {
    orchestrator.setIdentityLoaded(true, sessionId);
    // CRITICAL: trident-status and other tools call getState() with NO session ID,
    // which resolves to the 'default' key. Set identityLoaded on default too
    // so tools without session context see the loaded state.
    orchestrator.setIdentityLoaded(true, 'default');
    // v4.3.3: Notify identity enforcer
    notifyIdentityLoaded('4.3.3');
  }

  // Fire warhead handlers registered in warhead-registry.ts
  await hookRegistry.fire('system.transform', input, output);
};

var messagesTransformHook = async function(
  input: Record<string, unknown>,
  output: Record<string, unknown>
) {
  var sessionId = (input as InputMessage)?.sessionID;
  if (!sessionId) return;
  // GATE: Agent identity set by chat.message, not system.transform input.
  var sessionAgent = getCurrentAgent(sessionId);
  if (!sessionAgent) return;
  if (!isTridentAgent(sessionAgent)) return;

  try {
    var msgs = (output as Record<string, unknown> & { messages?: Array<Record<string, unknown>> })?.messages;
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
    if (currentSystem.indexOf('TRIDENT v4.4 IDENTITY BINDING') !== -1) return;

    firstInfo.system = header + '\n\n' + currentSystem;
  } catch { // Debug logging non-fatal — plugin loading continues regardless
  }

  // Fire warhead handlers registered in warhead-registry.ts
  await hookRegistry.fire('experimental.chat.messages.transform', input, output);
};

var compactingHook = async function(input: Record<string, unknown>, output: Record<string, unknown>) {
  invalidateT1Cache();
  var sessionAgent = getCurrentAgent((input as InputMessage)?.sessionID || '');
  if (!sessionAgent) return;
  if (!isTridentAgent(sessionAgent)) return;

  var systemOut = output as { system?: string[] };
  if (systemOut?.system && Array.isArray(systemOut.system)) {
    var header = await getIdentityHeader();
    var replaced = false;
    for (var i = 0; i < systemOut.system.length; i++) {
      if (typeof systemOut.system[i] === 'string' && (systemOut.system[i].indexOf('opencode') !== -1 || systemOut.system[i].indexOf('WebFetch') !== -1)) {
        systemOut.system[i] = header;
        replaced = true;
        break;
      }
    }
    if (!replaced) systemOut.system.unshift(header);
  }

  // Fire warhead handlers registered in warhead-registry.ts
  await hookRegistry.fire('experimental.session.compacting', input, output);
};

var commandExecuteHook = async function(input: Record<string, unknown>, output: Record<string, unknown>) {
  var cmd = input.command as string;
  var args = (input.arguments as string) || '';
  if (cmd === 'run' && args.indexOf('--agent') !== -1 && args.indexOf('trident') !== -1) {
    var message = args.replace(/--agent\s+\S+\s*/g, '').trim();
    if (message) {
      checkGuardian('opencode-run', message, 'trident', 'PLAN');
    }
  }

  // Fire warhead handlers registered in warhead-registry.ts
  var sessionAgent = getCurrentAgent((input as InputMessage)?.sessionID || '');
  if (!sessionAgent) return;
  if (!isTridentAgent(sessionAgent)) return;
  await hookRegistry.fire('command.execute.before', input, output);
};

// R12 CROSS_PLUGIN: createTridentHooks returns hook handlers that fire for all agents by design.
// Each hook handler validates isTridentAgent() internally before executing Trident enforcement.
// Non-Trident agents pass through these hooks without any enforcement applied.
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
