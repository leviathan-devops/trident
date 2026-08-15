// src/tools/omni-vision.ts — THE OMNI-VISION V5.1.4 ADAPTER (2026-08-15)
// The trident's tool surface now returns the Omni-Vision v5.1.4 engine
// (vendored at src/tools/omni-vision-v5/) — the dual-mode media processing
// + the silent-backend pipeline (the context manager + the SQLite/TDB memory
// + the silent verify + the TDB sync) + the TRIDENT's SSE streaming transport
// (the latency re-wire: the forked non-streaming fetch → the trident's
// opencodeShadowStreamFn — the first byte ~1.0s vs the 35-50s buffering).
// The chain hook (the batch-read directive injection) is exported for the
// trident's hook layer.
//
// THE MERGE PATHWAY (executed): the vendor (the v5.1.4/src → omni-vision-v5/)
// + the transport re-wire (brain.ts's harnessCall → the trident's SSE) + the
// adapter (this file — the tool def consumed directly).

import { omniVisionToolDef, omniVisionChainHook } from './omni-vision-v5/index.js';

/**
 * The trident tool factory — returns the Omni-Vision v5.1.4 tool definition
 * (the omni_vision tool: the dual-mode + the zod schema + the execute).
 * The trident-tools.ts registry imports this as 'trident-omni-vision'.
 */
export function createOmniVisionTool(client: any) {
  return omniVisionToolDef;
}

// The chain hook (the direct-mode batch-read directive injection) — wired by
// the trident's hook layer (the tool.execute.after surface).
export { omniVisionChainHook };
