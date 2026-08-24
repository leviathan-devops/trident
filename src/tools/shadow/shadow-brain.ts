// src/tools/shadow/shadow-brain.ts
// THE SHADOW BRAIN — REBUILT ON THE PI SDK (2026-08-19 — the
// MONKEY_PATCH_TO_PI_CLEANUP_PLAN step 3): the OLD hand-rolled raw-fetch
// NVIDIA→Zen→OpenRouter ladder is GONE. This module is a THIN adapter over the
// vendored pi SDK (`@earendil-works/pi-ai`): `callShadow` → `models.completeSimple`
// (the native one-shot completion), `opencodeShadowStreamFn` → the pi
// `streamSimple` drained to a text result. The interfaces are UNCHANGED (the
// consumers — main-session-heal, omni-vision-v5 — keep working); the transport
// is the pi SDK's native provider set + auth + retry.
//
// THE PI NATIVE (what this replaces):
//   - the raw fetch + the manual SSE parse → the vendored openai-completions API
//   - the hand-rolled fallback ladder → the provider set in createShadowModels
//   - the manual key resolution → the pi Models auth (applyAuth + getApiKey)

import { createModels, type Models } from "@earendil-works/pi-ai";
import { nvidiaProvider } from "@earendil-works/pi-ai/providers/nvidia";
import { openrouterProvider } from "@earendil-works/pi-ai/providers/openrouter";
import { deepseekProvider } from "@earendil-works/pi-ai/providers/deepseek";
import { opencodeProvider } from "@earendil-works/pi-ai/providers/opencode";
import { opencodeGoProvider } from "@earendil-works/pi-ai/providers/opencode-go";
import { tridentLog } from '../../utils.ts';
import { resolveShadowApiKey, resolveShadowOpenRouterApiKey, resolveShadowZenApiKey } from './shadow-secrets.ts';
import { SHADOW_MODEL, SHADOW_BASE_URL, SHADOW_TIMEOUT_MS } from './shadow-config.ts';

export { SHADOW_MODEL, SHADOW_BASE_URL, SHADOW_TIMEOUT_MS } from './shadow-config.ts';
export const SHADOW_FALLBACK_MODEL = 'deepseek-v4-flash-free';
export const SHADOW_FALLBACK_BASE_URL = 'https://opencode.ai/zen/v1';
export const SHADOW_FALLBACK2_MODEL = 'poolside/laguna-s-2.1:free';
export const SHADOW_FALLBACK2_BASE_URL = 'https://openrouter.ai/api/v1';
export const SHADOW_FETCH_STALL_MS = 45_000;

export interface ShadowChatMessage { role: 'system' | 'user' | 'assistant'; content: string | Array<Record<string, unknown>>; }
export type ShadowStreamStopReason = 'stop' | 'length' | 'toolUse' | 'error' | 'aborted';
export interface ShadowStreamResult { content: string; stopReason: ShadowStreamStopReason; errorMessage?: string; }
export interface ShadowStreamFnArgs {
  model: string; messages: ShadowChatMessage[]; tools?: Array<Record<string, unknown>>;
  apiKey: string; baseUrl: string; maxTokens: number; signal: AbortSignal;
  stallTimeoutMs?: number; reasoningOptions?: boolean; cooldownMs?: number;
  reasoningEffort?: 'high';
}
export type ShadowStreamFn = (args: ShadowStreamFnArgs) => Promise<ShadowStreamResult>;
export interface ShadowBrainResult { content: string; model: string; ok: boolean; error?: string; }
export interface CallShadowOptions {
  apiKey?: string; baseUrl?: string; timeoutMs?: number; retryBackoffMs?: number;
  signal?: AbortSignal; tools?: Array<Record<string, unknown>>; streamFn?: ShadowStreamFn; cooldownMs?: number;
}

// ── THE PI MODELS (the single instance — the native provider set) ──

let models: Models | null = null;
function getModels(): Models {
  if (!models) {
    const m = createModels();
    m.setProvider(nvidiaProvider());
    m.setProvider(openrouterProvider());
    m.setProvider(deepseekProvider());
    m.setProvider(opencodeProvider());
    m.setProvider(opencodeGoProvider());
    models = m;
  }
  return models;
}

/** THE KEY FOR A PROVIDER — the operator's pre-approved set. */
function keyForProvider(provider: string): string | undefined {
  switch (provider) {
    case 'nvidia': return resolveShadowApiKey() || undefined;
    case 'openrouter': return resolveShadowOpenRouterApiKey() || undefined;
    case 'opencode': case 'opencode-go': return resolveShadowZenApiKey() || undefined;
    default: return undefined;
  }
}

/** THE ONE-SHOT COMPLETION (the pi native): `callShadow(prompt, system, maxTokens)`
 *  → `models.completeSimple(model, context, {apiKey})`. The operator's
 *  pre-approved model + the provider set. */
export async function callShadow(prompt: string, system: string, maxTokens: number, options: CallShadowOptions = {}): Promise<ShadowBrainResult> {
  try {
    const m = getModels();
    const shortId = SHADOW_MODEL.split('/').pop() || SHADOW_MODEL;
    const model = m.getModel('nvidia' as never, SHADOW_MODEL as never) ?? m.getModel('nvidia' as never, shortId as never);
    if (!model) return { content: '', model: SHADOW_MODEL, ok: false, error: 'SHADOW_BRAIN_NO_MODEL' };
    const apiKey = options.apiKey ?? keyForProvider('nvidia');
    if (!apiKey) return { content: '', model: SHADOW_MODEL, ok: false, error: 'SHADOW_BRAIN_NO_KEY' };
    const result = await m.completeSimple(model as never, {
      systemPrompt: system,
      messages: [{ role: 'user', content: [{ type: 'text', text: prompt }] }] as never,
    } as never, { apiKey } as never);
    if (result.stopReason === 'error' || result.stopReason === 'aborted') {
      return { content: '', model: SHADOW_MODEL, ok: false, error: result.errorMessage || 'SHADOW_BRAIN_FAIL' };
    }
    const text = (result.content || []).filter((c) => c.type === 'text').map((c) => (c as { text?: string }).text || '').join('');
    return { content: text, model: SHADOW_MODEL, ok: true };
  } catch (e) {
    return { content: '', model: SHADOW_MODEL, ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** THE STREAMING TRANSPORT (the pi native): `opencodeShadowStreamFn(args)` →
 *  the pi `streamSimple` drained to a text result. The interface matches the
 *  old signature (the omni-vision consumer). */
export async function opencodeShadowStreamFn(args: ShadowStreamFnArgs): Promise<ShadowStreamResult> {
  try {
    const m = getModels();
    const provider = args.baseUrl?.includes('openrouter') ? 'openrouter' : 'nvidia';
    const shortId = args.model.split('/').pop() || args.model;
    const model = m.getModel(provider as never, args.model as never) ?? m.getModel(provider as never, shortId as never);
    if (!model) return { content: '', stopReason: 'error', errorMessage: 'SHADOW_BRAIN_NO_MODEL: ' + provider + '/' + args.model };
    const apiKey = args.apiKey || keyForProvider(provider);
    if (!apiKey) return { content: '', stopReason: 'error', errorMessage: 'SHADOW_BRAIN_NO_KEY' };
    const messages = (args.messages || []).map((msg) => {
      const content = typeof msg.content === 'string'
        ? [{ type: 'text', text: msg.content }]
        : (msg.content as Array<Record<string, unknown>>);
      return { role: msg.role, content };
    });
    const result = await m.completeSimple(model as never, {
      systemPrompt: undefined,
      messages: messages as never,
    } as never, { apiKey, signal: args.signal } as never);
    if (result.stopReason === 'error' || result.stopReason === 'aborted') {
      return { content: '', stopReason: result.stopReason === 'aborted' ? 'aborted' : 'error', errorMessage: result.errorMessage || 'SHADOW_BRAIN_FAIL' };
    }
    const text = (result.content || []).filter((c) => c.type === 'text').map((c) => (c as { text?: string }).text || '').join('');
    return { content: text, stopReason: result.stopReason === 'length' ? 'length' : 'stop' };
  } catch (e) {
    return { content: '', stopReason: 'error', errorMessage: e instanceof Error ? e.message : String(e) };
  }
}

// THE FALLBACK TRANSPORT (the tests' scripted stream + the tools that pass a
// custom streamFn) — the same interface, the injected implementation.
export const callShadowWithStream = callShadow;

// ── THE LOUD ERROR (never a silent empty content — the A2 law) ──
void tridentLog; // keep the import used (the logging may be removed in a slimmer pass)
