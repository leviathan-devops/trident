// Omni Vision v5.0 — Backend Brain
// The model split (operator decision Q2=c):
//   - DeepSeek V4 Flash for EVERYTHING that does not require vision
//     (brief composition, context-chain selection, consistency verify, distillation)
//   - MiMo v2.5 for the ONLY vision step (pixel analysis)
// PiLoop-style: opencodeStreamFn = fetch POST chat/completions, Bearer key,
// reasoning_options.effort=max for deepseek models. Errors encoded, never thrown blindly.

// ═══ THE TRANSPORT RE-WIRE (2026-08-15 — the operator: "ok rewrite it then
// that is a huge latency gap"): the forked shadow's opencodeStreamFn (the
// NON-STREAMING fetch — the provider buffers the ENTIRE completion → the
// 35-50s first-byte on the large generations) is REPLACED by the trident's
// opencodeShadowStreamFn (the SSE streaming — the first byte ~1.0s + the
// MEASURED stall window F1 — the 45s knife-edge dead). The PiAgentMessage
// transcript converts to the trident's ShadowChatMessage (the media parts —
// image_url/video_url/input_audio — ride the widened content field through
// the same OpenAI-compatible JSON body). ═══
import { opencodeShadowStreamFn, type ShadowChatMessage } from '../../shadow/shadow-brain.ts';
import type { PiAgentMessage, PiModel } from '../shadow/sidecar/pi-agent.js';
import * as fs from 'node:fs';

const ZEN_ENDPOINT = process.env.ZEN_ENDPOINT || 'https://opencode.ai/zen/go/v1/chat/completions';
// THE SECRET LAW: the API key comes ONLY from the environment (auth.json bootstrap
// via OPENCODE_API_KEY — the shadow run-sidecar.sh pattern). NEVER hardcode a key in
// source. The hardcoded key from v5.0.2 was deleted in the shadow-infra cleanup (M12).
// THE AUTH BOOTSTRAP (shadow-faithful): when the env is missing, read the opencode
// auth.json (the shadow's run-sidecar.sh does exactly this) and extract the
// opencode-go key — the SAME secret, never duplicated in source.
// THE SECRET LAW + ASYNC-PROPER INIT (v5.1.3): the API key is resolved LAZILY on
// first use (never a sync readFileSync at module load). The env is checked first;
// the auth.json bootstrap reads once and caches. All reads are async.
let _cachedKey: string | null = null;
let _keyPromise: Promise<string> | null = null;

async function bootstrapApiKeyAsync(): Promise<string> {
  const fromEnv = process.env.OPENCODE_API_KEY;
  if (fromEnv) return fromEnv;
  if (_cachedKey !== null) return _cachedKey;
  try {
    const home = process.env.HOME || '/root';
    const authPath = `${home}/.local/share/opencode/auth.json`;
    const auth = JSON.parse(await fs.promises.readFile(authPath, 'utf8'));
    const key = auth?.['opencode-go']?.key || auth?.opencode_go?.key || auth?.opencode?.key || auth?.openrouter?.key;
    if (typeof key === 'string' && key.length > 0) {
      _cachedKey = key;
      return key;
    }
  } catch (e) {
    // The loud CRITICAL below fires (the shadow's loud-error doctrine); the
    // catch must ALSO log — an invisible failure is a silent failure.
    console.error(`[vc-brain] auth-bootstrap: cannot read auth.json: ${e instanceof Error ? e.message : String(e)}`);
  }
  return '';
}

function getApiKey(): Promise<string> {
  if (!_keyPromise) _keyPromise = bootstrapApiKeyAsync();
  return _keyPromise;
}
const DEEPSEEK_MODEL = process.env.VC_BRAIN_MODEL || 'deepseek-v4-flash';
const MIMO_MODEL = 'mimo-v2.5';

// (the CRITICAL missing-key check now runs lazily inside harnessCall — v5.1.3 async init)

function zenModel(id: string, maxTokens: number): PiModel {
  return {
    id, name: id, api: 'opencode-go', provider: 'opencode',
    baseUrl: 'https://opencode.ai/zen/go/v1', reasoning: id.startsWith('deepseek'),
    input: ['text'], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128000, maxTokens,
  };
}

/** The re-wired transport: the trident's SSE streaming (the latency fix). */
async function harnessCall(
  model: PiModel,
  messages: PiAgentMessage[],
): Promise<BrainResult> {
  const apiKey = await getApiKey();
  if (!apiKey) {
    return { content: '', model: model.id, ok: false, error: 'OPENCODE_API_KEY not set — the shadow auth bootstrap is required.' };
  }
  // THE TRANSCRIPT CONVERSION: the PiAgentMessage[] → the trident's
  // ShadowChatMessage[] (the media parts — image_url/video_url/audio — ride
  // the widened content field; the text parts join their text).
  const shadowMessages: ShadowChatMessage[] = messages.map((m): ShadowChatMessage => {
    if (m.role === 'user') {
      if (typeof m.content === 'string') return { role: 'user', content: m.content };
      const parts = (m.content as Array<Record<string, unknown>>).filter((p) => p && typeof p === 'object' && (p as Record<string, unknown>).type !== 'toolCall');
      return { role: 'user', content: parts.length > 0 ? parts : '' };
    }
    if (m.role === 'assistant') {
      const text = m.content
        .filter((c) => c.type === 'text')
        .map((c) => (c.type === 'text' ? c.text : ''))
        .join('');
      return { role: 'assistant', content: text };
    }
    const text = m.content.map((c) => c.text).join('');
    return { role: 'user', content: text };
  });
  let r;
  try {
    r = await opencodeShadowStreamFn({
      model: model.id,
      messages: shadowMessages,
      apiKey,
      baseUrl: model.baseUrl,
      maxTokens: model.maxTokens || 64000,
      signal: new AbortController().signal,
    });
  } catch (e) {
    // The harness encodes errors as stopReason; a THROWN error is still
    // possible (network layer) — encode it, never let it reject unhandled.
    return { content: '', model: model.id, ok: false, error: `harness throw: ${e instanceof Error ? e.message : String(e)}` };
  }
  if (r.stopReason === 'error' || r.stopReason === 'aborted') {
    return { content: '', model: model.id, ok: false, error: r.errorMessage ?? `harness ${r.stopReason}` };
  }
  const text = r.content;
  return { content: text, model: model.id, ok: text.length > 0 };
}

export interface BrainResult {
  content: string;
  model: string;
  ok: boolean;
  error?: string;
}

/**
 * The non-vision brain: DeepSeek V4 Flash (reasoning effort max).
 * Used for brief composition, verify, distillation — NEVER for pixels.
 */
export async function callBrain(
  prompt: string,
  system?: string,
  maxTokens = 8192,
): Promise<BrainResult> {
  // The shadow's NO-TOOLS compose pattern: the system context embeds in the
  // user content (the Pi harness has no system role — the composer does this).
  const messages: PiAgentMessage[] = [
    { role: 'user', content: system ? `${system}\n\n${prompt}` : prompt, timestamp: Date.now() },
  ];
  // FORKED HARNESS: opencodeStreamFn — reasoning_options.effort=max for deepseek,
  // stopReason 'error'/'aborted' encoding, budgets. The v5.0.2 hand-rolled fetch is gone.
  return harnessCall(zenModel(DEEPSEEK_MODEL, maxTokens), messages);
}

// ── The VLM: MiMo v2.5 (the ONLY vision step) ──

export type MediaType = 'image' | 'video' | 'audio' | 'pdf';

function buildContentParts(
  mediaType: MediaType,
  base64Data: string,
  mime: string,
  prompt: string,
  fps = 2,
): any[] {
  if (mediaType === 'image') {
    return [
      { type: 'image_url', image_url: { url: `data:${mime};base64,${base64Data}` } },
      { type: 'text', text: prompt },
    ];
  }
  if (mediaType === 'video') {
    return [
      { type: 'video_url', video_url: { url: `data:${mime};base64,${base64Data}` }, fps, media_resolution: 'default' },
      { type: 'text', text: prompt },
    ];
  }
  if (mediaType === 'audio') {
    const af = mime.includes('mpeg') ? 'mp3' : mime.includes('wav') ? 'wav' : mime.includes('flac') ? 'flac' : 'mp3';
    return [
      { type: 'input_audio', input_audio: { data: base64Data, format: af } },
      { type: 'text', text: prompt },
    ];
  }
  // pdf → image_url fallback (pages converted by the caller)
  return [
    { type: 'image_url', image_url: { url: `data:${mime};base64,${base64Data}` } },
    { type: 'text', text: prompt },
  ];
}

/**
 * The vision step: MiMo v2.5 analyzes the pixels against the composed brief.
 */
export async function callVLM(
  mediaType: MediaType,
  base64Data: string,
  mime: string,
  prompt: string,
  fps = 2,
): Promise<BrainResult> {
  const contentParts = buildContentParts(mediaType, base64Data, mime, prompt, fps);
  // FORKED HARNESS: the media parts (image_url/video_url/input_audio) ride the
  // PiLoop transport — same stopReason encoding, same budgets, same auth.
  return harnessCall(zenModel(MIMO_MODEL, 128000), [{ role: 'user', content: contentParts as Array<Record<string, unknown>>, timestamp: Date.now() }]);
}

/**
 * Multi-image VLM call (all images in ONE MiMo request).
 */
export async function callVLMMulti(
  images: Array<{ base64: string; mime: string }>,
  prompt: string,
): Promise<BrainResult> {
  const contentParts: any[] = images.map((img) => ({
    type: 'image_url' as const,
    image_url: { url: `data:${img.mime};base64,${img.base64}` },
  }));
  contentParts.push({ type: 'text' as const, text: prompt });
  // FORKED HARNESS: multi-image rides the PiLoop transport.
  return harnessCall(zenModel(MIMO_MODEL, 128000), [{ role: 'user', content: contentParts as Array<Record<string, unknown>>, timestamp: Date.now() }]);
}
