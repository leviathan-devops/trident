// src/tools/shadow/shadow-config.ts
// THE SHADOW CONFIG (2026-08-19 — the MONKEY_PATCH_TO_PI_CLEANUP_PLAN step 1):
// the pre-approved model/endpoint constants, moved OUT of shadow-brain.ts (the
// dead one-shot text transport). The pi SDK's provider set (createShadowModels
// in shadow-pi-agent.ts) carries the actual transports + the fallbacks; this
// file is ONLY the operator's pre-approved constants.

/** THE PRIMARY MODEL — the FULL prefixed id (the 2026-08-19 LIVE 404 fix: the
 *  NVIDIA API REQUIRES "nvidia/nemotron-3.5-lightning-30b-a3b" — the bare
 *  "nemotron-3.5-lightning-30b-a3b" 404s; the raw probe proved it). */
export const SHADOW_MODEL = 'nvidia/nemotron-3.5-lightning-30b-a3b';

/** THE PRIMARY ENDPOINT — the NVIDIA Nemotron 3.5 Lightning 30B A3B (the
 *  operator's ruling: "make THIS the primary model for the generate action"). */
export const SHADOW_BASE_URL = 'https://integrate.api.nvidia.com/v1';

/** THE PRIMARY TIMEOUT (the operator's pre-approved 900s — the provider can
 *  be slow on the 384K shapes). */
export const SHADOW_TIMEOUT_MS = 900_000;

/** THE STALL WINDOW — the first-event stall detection (45s). */
export const SHADOW_FETCH_STALL_MS = 45_000;

/** THE STREAM RESULT TYPE (the tests' scripted-stream contract — the runner's
 *  streamFn option). The pi Agent's native stream is the production transport;
 *  this type is the tests' injection surface. */
export interface ShadowStreamResult {
  content: string;
  stopReason: 'stop' | 'length' | 'toolUse' | 'error' | 'aborted';
  errorMessage?: string;
}

export type ShadowStreamFn = (args: {
  model: string;
  messages: Array<{ role: string; content: unknown }>;
  apiKey: string;
  baseUrl: string;
  maxTokens: number;
  signal?: AbortSignal;
  stallTimeoutMs?: number;
  reasoningOptions?: boolean;
  cooldownMs?: number;
}) => Promise<ShadowStreamResult>;
