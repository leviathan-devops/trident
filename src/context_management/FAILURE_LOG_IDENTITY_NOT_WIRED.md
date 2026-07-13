# FAILURE LOG: Identity System Not Wired Into Dist

**Date:** 2026-07-05
**Severity:** FATAL — Agent completely non-functional as autonomous execution engine
**Root Cause:** Identity .md files never deployed alongside dist/index.js

---

## WHAT HAPPENED

Trident v4.4.2 was built and shipped with a FATAL architectural flaw: the identity system depends on external .md files read from DISK at runtime, but the build process only outputs `dist/index.js`. The identity files (IDENTITY.md, EXECUTION.md, TOOLS.md, FIREWALL_CONTEXT.md) were left in `src/identity/trident/` and never made it into the deployable package.

## IMPACT

The deployed agent was running with MAY 9 v4.3.3 identity files — "Trident Code Review Agent" instead of "Trident Brain v4.4.2 T3 Algorithmic Audit Engine". The model had:

- **NO TOOL-FIRST EXECUTION mandate** — narrated instead of executing
- **NO subagent intelligence** — didn't know about trident_explore/trident_build
- **NO Poseidon awareness** — didn't know about the God Loop
- **NO tool blocking architecture** — didn't understand what was blocked/allowed
- **NO architecture awareness** — didn't know "MODEL is ENGINE, TOOL is DRIVER, STATE is MEMORY"
- **NO TOOLS.md** — completely missing from deployed path
- **NO FIREWALL_CONTEXT.md** — completely missing from deployed path

The agent became a passive chatbot — asking permission, narrating instead of executing, searching random paths, displaying zero autonomy. Complete antithesis of what Trident is.

## ROOT CAUSE CHAIN

1. `IdentityLoader` in `src/identity/index.ts` reads .md files from disk via `fs.readFileSync()`
2. It looks for them at `~/.config/opencode/plugins/trident/identity/trident/`
3. `setIdentityBaseDir()` exists but is NEVER CALLED — no way to point to bundled location
4. Build script (`esbuild`) only outputs `dist/index.js` — no post-build copy of identity files
5. Deploy instructions only mention copying `dist/index.js`
6. Old v4.3.3 identity files from May 9 persist at the deployed path
7. IdentityLoader finds those old files and loads them instead

## WHY THIS WASN'T CAUGHT

- Tools reported `identityLoaded: true` — but that just means the loader RAN, not that it loaded the CORRECT files
- The system.transform hook injected contextLines (TOOL-FIRST, SUBAGENTS) via hardcoded strings — these worked
- But the `formatIdentityHeader()` output was based on the old .md files — wrong identity binding
- The agent appeared "kind of working" but was fundamentally confused about its own identity

## FIX APPLIED

Identity content is now INLINE as TypeScript string constants in `src/identity/index.ts`. The `IdentityLoader.loadForRole()` method returns hardcoded v4.4.2 content directly — zero external file dependency. No matter where dist/index.js is deployed, the identity is always correct.

## LESSON

**NEVER depend on external files for core identity. If the identity defines what the agent IS, it must be part of the bundle. External files are for configuration, not for identity.**

"THE MODEL IS THE ENGINE. THE TOOL IS THE DRIVER. THE STATE FILE IS THE MEMORY." — but the identity is the SOUL, and it must travel WITH the body.
