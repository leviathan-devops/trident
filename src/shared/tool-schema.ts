// THE ZOD-4 TOOL BOUNDARY (2026-08-10 — the LSP's first harvest: 147 TS2322s).
// The plugin's `tool()` helper types its `args` with the plugin's OWN zod
// (`z.ZodRawShape` from ITS bundled zod — the zod-3-era `$ZodType<unknown,
// unknown, $ZodTypeInternals<unknown, unknown>>`) while the project runs
// zod 4.1.8 — every schema property failed the assignability check. THE FIX:
// this wrapper widens the args to the project's zod-4 shape and casts ONCE at
// the plugin boundary. The schemas themselves are UNCHANGED — the runtime
// validation is identical; the single `as` cast is the sanctioned boundary
// (the version mismatch is real, the types cannot unify).
import { tool as pluginTool } from '@opencode-ai/plugin';
import { z } from 'zod';

export function tool<Args extends Record<string, z.ZodTypeAny>>(
  input: {
    description: string;
    args: Args;
    // The 2-param execute (args + the tool context — the sessionID lives
    // there) is the FULL plugin contract; the 1-param form is a subset.
    execute: (args: any, context?: any) => unknown;
    [k: string]: unknown;
  },
): ReturnType<typeof pluginTool> {
  // The double hop is REQUIRED: the zod-3 vs zod-4 shapes don't overlap
  // (the '_zod.version.minor' 4-vs-1 incompatibility) — a direct `as` cast
  // errors with "neither type sufficiently overlaps".
  return pluginTool(input as unknown as Parameters<typeof pluginTool>[0]);
}
