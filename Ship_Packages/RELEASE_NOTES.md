# TRIDENT v4.3.3 — RELEASE NOTES

## Summary
Trident v4.3.3 is a major overhaul focused on fixing the task subagent dispatch system, rewriting the deep planning and problem-solving engines, and bringing all outputs to runtime-grade quality.

## What's New
- **trident_explore subagent dispatch**: task tool now correctly dispatches trident_explore subagents. Root cause was reading arguments from `input` instead of `output.args`.
- **Deep Planning rewrite**: 3 distinct layers (generative prompt + build spec with TypeScript code + 9-file context library), up from 1 flat document
- **Context Synthesis T2 expansion**: 870 lines across 9 sections with code examples, dynamic prohibitions, and data flow diagrams
- **Problem-Solving rewrite**: REAL evidence cross-referencing using file paths and code identifiers, not English keyword matching

## What's Fixed
- 12 bugs in task subagent dispatch (see CHANGELOG)
- Async fire-and-forget promises (7 sites)
- require() in ESM modules (7 sites)
- Build scoring (dual-path distExists check)
- IdentityEnforcer.enforce() wired into hooks (was dead code)
- toolResultOk() now validates data (was theatrical)
- Hardcoded VLM endpoint (now configurable via env var)
- VLM_MODEL environment variable added to trident-vision.ts (configurable model selection)
- OrchestratorState.currentGate field added for IdentityEnforcer gate-checking
- R13 any-type cleanup (60+ sites across 13 files)
- R16 catch-no-return fix (7 sites across 5 files)
- R4 silent catch propagation fix (41 sites across 10+ files)
- JSON.parse() without type assertions (6 sites)
- Missing cross-plugin isolation guard (t2-loader.ts)
- Empty catch blocks documented (11 sites)
- R14 scanner false positive edge cases (AST-based detection)

## Upgrade Notes
- No breaking changes to the plugin API
- All 8 tool registrations are unchanged
- Existing opencode.json configs should continue working
- The `agent` parameter on `task` calls is ignored for subagent type detection — use `subagent_type` instead
