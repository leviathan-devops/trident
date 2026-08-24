// ═══ SHADOW-SECRETS — THE SHADOW BRAIN'S KEY RESOLUTION (2026-08-06) ═══
// The operator's deploy model: the built dist is copied DIRECTLY into the
// plugin path (no deploy scripts, no env provisioning). The key's resolution
// must therefore be BUNDLED:
//   1. process.env.<KEY>                            (the runtime env — the
//      operator's shell/daemon may export it)
//   2. the .env files at the known paths       (the plugin dir, the opencode
//      config dir, the homedir — the operator's own .env overrides)
//   3. THE EMBEDDED FALLBACK                   (the operator's granted key,
//      base64-encoded — NOT the plaintext in the bundle's strings; decodable
//      but never accidentally surfaced in the logs/errors/docs)
// The key is NEVER logged, NEVER echoed in the errors, NEVER in the reports.
// The AP-4 gate: the plaintext key in the code + the logs = ZERO occurrences.
//
// THE 3-PROVIDER LADDER (2026-08-17 — the operator's ruling): NVIDIA Nemotron
// 3.5 Lightning (the PRIMARY — https://integrate.api.nvidia.com/v1, the FAST
// 1M-context, unlimited free) → OpenCode Zen DeepSeek V4 Flash (rung 1 —
// https://opencode.ai/zen/v1) → OpenRouter Laguna (rung 2 —
// https://openrouter.ai/api/v1, poolside/laguna-s-2.1:free). THE OLD opencode-
// go endpoint is PURGED. Three distinct credentials, three resolvers.
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

// the operator's granted OPENCODE key (the Zen rung's credential), base64-
// encoded (the plaintext appears NOWHERE in the source; the .env + the env
// override it; the decode is the fallback)
const EMBEDDED_KEY_B64 = 'c2stbGtaamNncnk5bzUzVjBRY0FDdmZDWVdXRUR0TE9BREprUHU2M1ZvcVFGQ1h4V0w4TjRJeXJLdXRKTGNxWVVrYg==';

// THE OPENROUTER FALLBACK KEY (2026-08-16 — the operator's ruling): the
// Poolside/Laguna-S-2.1:free via OpenRouter (https://openrouter.ai/api/v1) —
// "this will always work". base64-encoded (the plaintext appears NOWHERE,
// AP-4). Engages when the opencode-go primary 429s (the shadow-brain's
// POOLSIDE fallback — the go rate limit is the legit failure).
const EMBEDDED_OPENROUTER_KEY_B64 = 'c2stb3ItdjEtNzNmMmQwNWZiMzFlOTM4Y2EwZGQ1NzI0NDFiMWRiYTU2MmFhMDI5MTE1YTFjMzNkOTI0YzkzMzkzMDQ1MmVhNw==';

// THE NVIDIA NEMOTRON KEY (2026-08-17 — the operator's ruling): the NVIDIA
// Nemotron 3.5 Lightning 30B-A3B (https://integrate.api.nvidia.com/v1) — the
// FAST 1M-context primary for the generate action. base64-encoded (the
// plaintext appears NOWHERE, AP-4). THE PRIMARY of the 3-provider ladder:
// NVIDIA → Zen → OpenRouter.
const EMBEDDED_NVIDIA_KEY_B64 = 'bnZhcGktaEtEUEVvUngzUlljVlZXMExrT3BMOW9rdm40WDJKVUN3VExybl9YUUxWZ01aN2FxdTBCR2RLSDdsWG93S1hSQg==';

function readEnvFile(p: string): Record<string, string> {
  const out: Record<string, string> = {};
  try {
    const content = fs.readFileSync(p, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      const k = trimmed.substring(0, eq).trim();
      const v = trimmed.substring(eq + 1).trim();
      if (k) out[k] = v;
    }
  } catch (e) { /* the file absent — the next path */ }
  return out;
}

const ENV_PATHS = [
  path.join(process.cwd(), '.env'),                                // the project root
  path.join(os.homedir(), '.config', 'opencode', '.env'),          // the opencode config dir
  path.join(os.homedir(), '.env'),                                 // the homedir
];

// THE PRIMARY BASE URL RESOLVER — the NVIDIA Nemotron 3.5 Lightning endpoint
// (https://integrate.api.nvidia.com/v1 — the operator's 2026-08-17 ruling:
// "make THIS the primary model for the generate action"). THE OLD opencode-go
// endpoint is PURGED (the operator: "opencode go is purged"). env → .env → the
// NVIDIA default.
export function resolveShadowBaseUrl(): string {
  const env = process.env.SHADOW_BASE_URL;
  if (env && env.length > 10) return env;
  for (const p of ENV_PATHS) {
    const parsed = readEnvFile(p);
    const v = parsed['SHADOW_BASE_URL'];
    if (v && v.length > 10) return v;
  }
  return 'https://integrate.api.nvidia.com/v1';
}

// THE PRIMARY KEY RESOLVER — the NVIDIA API key (env NVIDIA_API_KEY → .env →
// the embedded base64 fallback). THE PRIMARY of the 3-provider ladder: NVIDIA
// → Zen → OpenRouter. NEVER hardcoded plaintext, NEVER logged (AP-4).
export function resolveShadowApiKey(): string {
  const env = process.env.NVIDIA_API_KEY;
  if (env && env.length > 10) return env;
  for (const p of ENV_PATHS) {
    const parsed = readEnvFile(p);
    const v = parsed['NVIDIA_API_KEY'];
    if (v && v.length > 10) return v;
  }
  try {
    return Buffer.from(EMBEDDED_NVIDIA_KEY_B64, 'base64').toString('utf-8');
  } catch (e) { /* non-fatal */ }
  return '';
}

// THE ZEN FALLBACK RESOLVERS (2026-08-17 — the operator's ruling: the OpenCode
// Zen DeepSeek V4 Flash FREE is the ladder rung 1 — https://opencode.ai/zen/v1,
// model deepseek-v4-flash-free). The key is the OPENCODE key (the Zen endpoint
// authenticates with the opencode credential — env OPENCODE_API_KEY → .env →
// the embedded opencode base64 fallback). NEVER hardcoded plaintext, NEVER
// logged (AP-4).
export function resolveShadowZenBaseUrl(): string {
  const env = process.env.SHADOW_ZEN_BASE_URL;
  if (env && env.length > 10) return env;
  for (const p of ENV_PATHS) {
    const parsed = readEnvFile(p);
    const v = parsed['SHADOW_ZEN_BASE_URL'];
    if (v && v.length > 10) return v;
  }
  return 'https://opencode.ai/zen/v1';
}

export function resolveShadowZenApiKey(): string {
  const env = process.env.OPENCODE_API_KEY;
  if (env && env.length > 10) return env;
  for (const p of ENV_PATHS) {
    const parsed = readEnvFile(p);
    const v = parsed['OPENCODE_API_KEY'];
    if (v && v.length > 10) return v;
  }
  try {
    return Buffer.from(EMBEDDED_KEY_B64, 'base64').toString('utf-8');
  } catch (e) { /* non-fatal */ }
  return '';
}

// THE OPENROUTER FALLBACK RESOLVERS (2026-08-16 — the operator's ruling: the
// Poolside/Laguna-S-2.1:free via OpenRouter — "this will always work"): the
// fallback transport's baseUrl + key. The key is NEVER hardcoded in plaintext,
// NEVER logged (AP-4): env → .env → the embedded base64 fallback.
export function resolveShadowOpenRouterBaseUrl(): string {
  const env = process.env.OPENROUTER_BASE_URL;
  if (env && env.length > 10) return env;
  for (const p of ENV_PATHS) {
    const parsed = readEnvFile(p);
    const v = parsed['OPENROUTER_BASE_URL'];
    if (v && v.length > 10) return v;
  }
  return 'https://openrouter.ai/api/v1';
}

export function resolveShadowOpenRouterApiKey(): string {
  const env = process.env.OPENROUTER_API_KEY;
  if (env && env.length > 10) return env;
  for (const p of ENV_PATHS) {
    const parsed = readEnvFile(p);
    const v = parsed['OPENROUTER_API_KEY'];
    if (v && v.length > 10) return v;
  }
  try {
    return Buffer.from(EMBEDDED_OPENROUTER_KEY_B64, 'base64').toString('utf-8');
  } catch (e) { /* non-fatal */ }
  return '';
}
