// ============================================================================
// file: src/sidecar/core.ts
//
// §17 — the PiLoop: the shadow's reasoning engine, activated ONLY by the
// intent gate's INTERVENE/ESCALATE actions. It wraps the typed pi-mono Agent
// (pi-agent.js, the E1c documented typed wrapper) and drives every LLM call
// through a fetch-based streamFn against the OpenAI-compatible opencode-go
// endpoint.
//
// WIRING DECISION (documented per the wave contract): the streamFn path is
// the FETCH-BASED streamFn. The vendored pi-mono Agent cannot be imported
// directly (verified: its `@mariozechner/pi-ai` dep is a symlink whose dist/
// is unbuilt — ERR_MODULE_NOT_FOUND — and vendor/ is read-only), so the typed
// wrapper drives the loop and the streamFn performs POST {baseURL}/chat/
// completions (OpenAI-compatible, model = deepseek-v4-flash, Authorization:
// Bearer apiKey) via node fetch.
//
// BUDGETS (enforced in the wrapper, per API-VERIFICATION.md §6): maxSteps=20
// and maxTokens=2000 are NOT AgentOptions keys in the real API; the PiLoop
// counts turn_ends and cumulative usage per activation and aborts the agent
// when a budget is exceeded. Circuit breaker: 3 consecutive failures →
// DEGRADED (warheads suppressed; the deterministic gate keeps running);
// auto-recovers on success.
//
// Deviations from §17.1 (documented):
//   - §17.1 calls `t1Warhead(parsed.evidence, parsed.fix)` — a two-arg call
//     that does not exist (composer's t1Warhead takes WarheadParts). Composed
//     as { trigger, summary: evidence, facts: [], directive: fix }.
//   - `lastMessage()` does not exist on the real Agent; the final transcript
//     message is read from agent.state.messages[length-1] (API-VERIFICATION §2).
// ============================================================================

import {
  type PiAgentMessage,
  type PiAgentTool,
  type PiAssistantMessage,
  type PiModel,
  type PiStreamResult,
} from './pi-agent.js';
// composer.js is agent-side (DELETED at the tool scope) — the PiLoop class
// below is unused by the tool; opencodeStreamFn is the wired transport.
import type { GateDecision, Option, SignalVector, TriggerToken, Warhead } from './types.js';
import { EngineError } from './types.js';

/** The ledger surface PiLoop needs (§19.1: loop events + warns). */
export interface LoopLedger {
  appendLoopEvent(ev: unknown): void;
  appendWarn(msg: string): void;
}

/** The tool surface PiLoop needs (§34.9: the pi tool descriptors). */
export interface LoopTools {
  piTools(): PiAgentTool[];
}

/** §17.1 — the model configuration for the opencode-go endpoint. */
export interface ModelConfig {
  provider: 'opencode-go';
  id: string; // 'deepseek-v4-flash'
  baseURL: string;
  apiKey: string; // from auth.json / env, never logged
}

export interface PiLoopOptions {
  maxSteps?: number;
  maxTokens?: number;
  /** Injectable LLM transport (tests stub this; defaults to opencodeStreamFn). */
  streamFn?: import('./pi-agent.js').PiStreamFn;
}

const DEFAULT_MAX_STEPS = 40;   // E4: a tool-verifying compose may span many turns
// E4 (operator directive 2026-08-01): MAX reasoning for DeepSeek V4 Flash —
// one reasoning-max response can exceed the spec's old 2000-token budget
// alone (observed live: the compose aborted with 'aborted by caller' at
// 09:08:59). The model's real output limit is 384k; 8000 is conservative.
// E4 (operator directive 2026-08-01): MAX reasoning for DeepSeek V4 Flash —
// one reasoning-max response can exceed the spec's old 2000-token budget
// alone (observed live: the compose aborted with 'aborted by caller' at
// 09:08:59 + 09:16:35). The model's real output limit is 384k; 32k is
// generous for a single verification+composition activation.
// E4 (operator directive 2026-08-01): MAX reasoning for DeepSeek V4 Flash.
// Observed live: a tool-verifying compose burned 37,207 tokens in one
// activation (reasoning max per turn + growing context) and aborted at 32k.
// 64k bounds the activation while staying far under the model's 384k output.
const DEFAULT_MAX_TOKENS = 64000;

interface OpenAiChatResponse {
  choices?: Array<{
    message?: {
      content?: string | null;
      tool_calls?: Array<{
        id: string;
        function: { name: string; arguments?: string };
      }>;
    };
    finish_reason?: string;
  }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

function abortedResult(message: string): PiStreamResult {
  return {
    content: [],
    stopReason: 'aborted',
    usage: { input: 0, output: 0, totalTokens: 0 },
    errorMessage: message,
  };
}

function errorResult(message: string): PiStreamResult {
  return {
    content: [],
    stopReason: 'error',
    usage: { input: 0, output: 0, totalTokens: 0 },
    errorMessage: message,
  };
}

/**
 * The fetch-based streamFn: OpenAI-compatible POST to the opencode-go
 * endpoint. Failures are encoded as stopReason 'error'/'aborted' — never
 * thrown — so the agent loop settles cleanly and the circuit breaker counts
 * them.
 */
export async function opencodeStreamFn(
  model: PiModel,
  messages: PiAgentMessage[],
  tools: PiAgentTool[],
  options: { apiKey?: string; signal?: AbortSignal },
): Promise<PiStreamResult> {
  if (options.signal?.aborted) return abortedResult('aborted by caller');
  const body = {
    model: model.id,
    messages: convertToOpenAi(messages),
    tools: tools.length > 0 ? tools.map(convertToOpenAiTool) : undefined,
    max_tokens: model.maxTokens || DEFAULT_MAX_TOKENS,
    // E4 (operator directive): DeepSeek V4 Flash (New) on MAX reasoning by
    // default — reasoning_options.effort per the opencode-go provider doc
    // (variants high|max). Non-deepseek models ignore the field.
    ...(model.id.startsWith('deepseek') ? { reasoning_options: { effort: 'max' } } : {}),
  };
  try {
    const resp = await fetch(`${model.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${options.apiKey ?? ''}`,
      },
      body: JSON.stringify(body),
      signal: options.signal,
    });
    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      return errorResult(`opencode-go HTTP ${resp.status}: ${text.slice(0, 200)}`);
    }
    const parsed: unknown = await resp.json();
    if (parsed === null || typeof parsed !== 'object' || !('choices' in parsed)) return errorResult('opencode-go: non-envelope response');
    const choicesRaw = (parsed as Record<string, unknown>).choices;
    if (!Array.isArray(choicesRaw) || choicesRaw.length === 0) return errorResult('opencode-go: empty choices');
    const data = parsed as OpenAiChatResponse;
    const choice = data.choices?.[0];
    if (!choice || !choice.message) return errorResult('opencode-go: empty choices');
    const msg = choice.message;
    const content: PiStreamResult['content'] = [];
    if (typeof msg.content === 'string' && msg.content.length > 0) {
      content.push({ type: 'text', text: msg.content });
    }
    for (const tc of msg.tool_calls ?? []) {
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(tc.function.arguments ?? '{}') as Record<string, unknown>;
      } catch {
        args = {};
      }
      content.push({ type: 'toolCall', id: tc.id, name: tc.function.name, arguments: args });
    }
    const promptTokens = data.usage?.prompt_tokens ?? 0;
    const outputTokens = data.usage?.completion_tokens ?? 0;
    const reason =
      choice.finish_reason === 'tool_calls'
        ? 'toolUse'
        : choice.finish_reason === 'length'
          ? 'length'
          : 'stop';
    return {
      content,
      stopReason: reason,
      usage: { input: promptTokens, output: outputTokens, totalTokens: promptTokens + outputTokens },
      errorMessage: content.length === 0 ? 'empty completion' : undefined,
    };
  } catch (err) {
    const e = err as { name?: string };
    if (options.signal?.aborted || e?.name === 'AbortError') {
      return abortedResult('aborted');
    }
    return errorResult(err instanceof Error ? err.message : String(err));
  }
}

/** Convert the pi AgentMessage transcript to OpenAI chat messages. */
export function convertToOpenAi(messages: PiAgentMessage[]): unknown[] {
  const out: unknown[] = [];
  for (const m of messages) {
    if (m.role === 'user') {
      out.push({ role: 'user', content: m.content });
    } else if (m.role === 'assistant') {
      const text = m.content
        .filter((c) => c.type === 'text')
        .map((c) => (c.type === 'text' ? c.text : ''))
        .join('');
      const toolCalls = m.content.filter((c) => c.type === 'toolCall');
      const am: Record<string, unknown> = { role: 'assistant', content: text === '' ? null : text };
      if (toolCalls.length > 0) {
        am.tool_calls = toolCalls.map((tc) => ({
          id: tc.id,
          type: 'function',
          function: { name: tc.name, arguments: JSON.stringify(tc.arguments) },
        }));
      }
      out.push(am);
    } else {
      const text = m.content.map((c) => c.text).join('');
      out.push({ role: 'tool', tool_call_id: m.toolCallId, content: text });
    }
  }
  return out;
}

/** Convert a PiAgentTool descriptor to the OpenAI function-tools shape. */
export function convertToOpenAiTool(t: PiAgentTool): Record<string, unknown> {
  return {
    type: 'function',
    function: {
      name: t.name,
      description: t.description,
      parameters: (t.parameters ?? { type: 'object', properties: {} }) as Record<string, unknown>,
    },
  };
}

/**
 * §17.3 — the per-activation user prompt (DETECTORS + OBSERVATION + TASK).
 * The identity is the agent's systemPrompt (set at construction), so it is
 * not re-injected here. NOTE (documented): the spec's OBSERVATION line reads
 * `silenceMs=...`, but SignalVector (the E0 coupling point, immutable) does
 * not carry silenceMs — the prompt reports the adaptive baseline instead.
 */
export function buildPrompt(s: SignalVector, d: GateDecisionLike): string {
  // E4: the internal 'stub ' checks (theatrical-stubs extension) are NOT
  // evidence for the agent — showing them made the model invent "restore
  // files from stubs" (live refusal 09:56). Only the real acceptance checks.
  const delta = s.artifactDelta
    .filter((c) => !c.requirement.startsWith('stub '))
    .map((c) => `${c.requirement}: ${c.ok ? 'ok' : 'FAIL'}`)
    .join(', ');
  return [
    'DETECTORS (signal vector):',
    `  - trajectory: ${s.trajectory}`,
    `  - completionScore: ${s.completionScore.toFixed(2)}`,
    `  - adaptiveSilenceBaselineMs: ${s.adaptiveSilenceBaselineMs}`,
    `  - artifactDelta: [${delta || 'none'}]`,
    `  - blockade: ${s.blockadeDetected}`,
    `  - loop: ${s.repetition.detected}`,
    `  - modelHealth: ${s.modelHealth.errors}`,
    `  - warheadAckState: ${s.warheadAckState}`,
    'OBSERVATION (gate decision):',
    `  - action: ${d.action}`,
    `  - trigger: ${d.trigger ?? 'none'}`,
    `  - reason: ${d.reason}`,
    `TASK: ${taskQuestion(d)}`,
    '',
    'Respond with EXACTLY one protocol line and nothing else — the INTERVENE',
    'line is PIPE-separated (never use the word "fix"):',
    '  INTERVENE <one-line evidence> | <exact-fix>',
    '  VERIFIED <one-line summary>',
    '  ESCALATE <tried> | <why> | <ask>',
    '',
    'E4: Do NOT call any tools. The gate has ALREADY verified the artifacts —',
    'the artifactDelta above IS the evidence. Compose the warhead directly',
    'from it in ONE response, then stop.',
    '',
    'Framing:',
    '- the markers are REQUIRED acceptance criteria that the gate found',
    '  ABSENT. Direct the agent to ADD them with concrete file edits, e.g.',
    '  "add id=hive-map-canvas to the Leaflet container div in',
    '  /app/index.html; set the page title to HIVE PILOT VERIFIED".',
    '- use direct, factual instructions. Do not use the word "inject".',
  ].join('\n');
}

/** A structural subset of GateDecision the prompt builder needs. */
interface GateDecisionLike {
  action: 'NO_ACTION' | 'VERIFY' | 'INTERVENE' | 'ESCALATE';
  trigger?: TriggerToken;
  reason: string;
}

/** The trigger-specific question appended to the activation prompt (§17.3). */
function taskQuestion(d: GateDecisionLike): string {
  if (d.action === 'NO_ACTION') return 'Observe only. No action is required this tick.';
  if (d.action === 'VERIFY') {
    return 'The gate requested verification. Verify the artifacts with your tools, then respond VERIFIED <summary> or INTERVENE <evidence> fix <exact-fix>.';
  }
  if (d.action === 'INTERVENE') {
    return `The gate triggered ${d.trigger} (${d.reason}). Confirm the situation with your tools, then respond INTERVENE <evidence> fix <exact-fix> where evidence quotes the actual file/command output.`;
  }
  return `The gate triggered ${d.trigger} (${d.reason}). Assess whether autonomous action can resolve it; otherwise respond ESCALATE <tried> | <why> | <ask>.`;
}

/**
 * PiLoop wraps the pi-mono Agent as the shadow's reasoning engine. Budgets:
 * maxSteps=20, maxTokens=2000 per activation, enforced in the wrapper.
 * Circuit breaker: 3 consecutive failures → DEGRADED; auto-recovers.
 */
