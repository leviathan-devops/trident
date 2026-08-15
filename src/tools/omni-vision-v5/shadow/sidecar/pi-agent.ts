// ============================================================================
// file: src/sidecar/pi-agent.ts
//
// E1c DOCUMENTED DEVIATION — "typed wrapper" for the pi-mono Agent.
//
// The E1c brief requires the PiLoop's internals to use the REAL pi-mono Agent
// API (AgentOptions.initialState, state.messages, AgentTool.execute, a
// streamFn) and says: "If pi-mono's own typecheck of agent.ts fails under our
// tsconfig (strictness), do NOT change tsconfig.json — import the agent via a
// typed wrapper in core.ts."
//
// The vendored `vendor/pi-mono/packages/agent/src/agent.ts` cannot be
// imported directly, verified mechanically:
//   1. tsc: the file lies outside tsconfig rootDir "src" (TS6059) and its
//      transitive `@mariozechner/pi-ai` resolves to a symlink
//      (node_modules/@mariozechner/pi-ai -> ../../packages/ai) whose exports
//      point at `./dist/index.js` — but `dist/` is NOT built
//      (ERR_MODULE_NOT_FOUND at runtime; no dist/index.d.ts for tsc).
//   2. Building pi-ai requires `tsgo` (not installed) and writes inside the
//      read-only vendor tree.
// Therefore core.ts drives a typed wrapper instead: this module replicates
// the CORRECTED Agent API surface (per vendor/pi-mono/API-VERIFICATION.md
// §1-§6) with a compact agent-loop, and delegates every LLM call to a
// fetch-based streamFn (the sanctioned fallback) against the OpenAI-compatible
// opencode-go endpoint. The public shape used by PiLoop (initialState,
// state.messages, prompt, waitForIdle, subscribe, abort, streamFn) matches
// the verified pi-mono API so the wiring documented in §6 of
// API-VERIFICATION.md applies unchanged.
//
// The loop is REAL: prompt → stream (LLM) → execute tool calls → feed results
// back → stream again until the model stops. It is not a stub.
// ============================================================================

export interface PiTextContent {
  type: 'text';
  text: string;
}

export interface PiToolCall {
  type: 'toolCall';
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export type PiContent = PiTextContent | PiToolCall;

export interface PiUsage {
  input: number;
  output: number;
  totalTokens: number;
}

export type PiStopReason = 'stop' | 'length' | 'toolUse' | 'error' | 'aborted';

export interface PiAssistantMessage {
  role: 'assistant';
  content: PiContent[];
  api: string;
  provider: string;
  model: string;
  usage: PiUsage;
  stopReason: PiStopReason;
  errorMessage?: string;
  timestamp: number;
}

export interface PiUserMessage {
  role: 'user';
  // TOOL-BACKEND EXTENSION (shadow-infra cleanup): media content parts
  // (image_url / video_url / input_audio — OpenAI-shaped) ride through the
  // harness transport for the vision step. convertToOpenAi passes them raw.
  content: string | PiContent[] | Array<Record<string, unknown>>;
  timestamp: number;
}

export interface PiToolResultMessage {
  role: 'toolResult';
  toolCallId: string;
  toolName: string;
  content: PiTextContent[];
  isError: boolean;
  timestamp: number;
}

export type PiAgentMessage = PiUserMessage | PiAssistantMessage | PiToolResultMessage;

/** The Model shape (API-VERIFICATION.md §6) minus the fields the shadow sets. */
export interface PiModel {
  id: string;
  name: string;
  api: string;
  provider: string;
  baseUrl: string;
  reasoning: boolean;
  input: string[];
  cost: { input: number; output: number; cacheRead: number; cacheWrite: number };
  contextWindow: number;
  maxTokens: number;
}

/** The AgentTool shape (API-VERIFICATION.md §5) with the string tools adapted. */
export interface PiAgentTool {
  name: string;
  label: string;
  description: string;
  parameters: Record<string, unknown>;
  execute(
    toolCallId: string,
    params: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<PiAgentToolResult>;
}

export interface PiAgentToolResult {
  content: PiTextContent[];
  details?: unknown;
  terminate?: boolean;
}

export type PiAgentEvent =
  | { type: 'agent_start' }
  | { type: 'agent_end'; messages: PiAgentMessage[] }
  | { type: 'turn_start' }
  | { type: 'turn_end'; message: PiAssistantMessage }
  | { type: 'message_start'; message: PiAgentMessage }
  | { type: 'message_end'; message: PiAgentMessage }
  | { type: 'tool_execution_start'; toolCallId: string; toolName: string; args: unknown }
  | { type: 'tool_execution_end'; toolCallId: string; toolName: string; result: unknown; isError: boolean };

export interface PiStreamResult {
  content: PiContent[];
  stopReason: PiStopReason;
  usage: PiUsage;
  errorMessage?: string;
}

/**
 * The stream function contract (the wrapper's own — the fetch-based
 * opencode-go streamFn is wired in core.ts). Returns the parsed completion,
 * never throws (failures are encoded as stopReason 'error'/'aborted').
 */
export type PiStreamFn = (
  model: PiModel,
  messages: PiAgentMessage[],
  tools: PiAgentTool[],
  options: { apiKey?: string; signal?: AbortSignal },
) => Promise<PiStreamResult>;

export interface PiAgentOptions {
  initialState?: {
    systemPrompt?: string;
    model?: PiModel;
    tools?: PiAgentTool[];
    messages?: PiAgentMessage[];
  };
  streamFn?: PiStreamFn;
  getApiKey?: (provider: string) => string | undefined;
  sessionId?: string;
  maxRetryDelayMs?: number;
}

interface PiAgentState {
  systemPrompt: string;
  model: PiModel;
  tools: PiAgentTool[];
  messages: PiAgentMessage[];
  isStreaming: boolean;
  errorMessage?: string;
}

const EMPTY_USAGE: PiUsage = { input: 0, output: 0, totalTokens: 0 };

const DEFAULT_MODEL: PiModel = {
  id: 'unknown',
  name: 'unknown',
  api: 'unknown',
  provider: 'unknown',
  baseUrl: '',
  reasoning: false,
  input: [],
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 0,
  maxTokens: 0,
};

/**
 * Stateful agent loop mirroring the corrected pi-mono Agent API surface.
 * One prompt runs the loop to completion: LLM turn → tool calls → results →
 * next LLM turn until the model stops (or a streamFn error/abort ends it).
 */
