# FIREWALL CONTEXT — Trident Brain v4.3.2

## LAYER 1: BLOCKED TOOLS
- edit, write_file, write, patch, create, delete_file — no source modification
- bash, terminal, execute, exec — no shell execution
- mcp_write_file, mcp_edit, mcp_patch — no MCP file operations
- todowrite — ALLOWED (v4.3.2 — primary Trident only, not subagents)
- Block location: toolBeforeHook, first check before all others
- Error message includes alternative Trident tool suggestions

## LAYER 2: HIVE — FULL ACCESS (v4.3.2)
- All hive tools available: hive_context, hive_remember, hive_forget, hive_scan, hive_purge, hive_restore, hive_trash_list, hive_trash_status, hive_status
- Previously blocked: hive_remember — now unblocked
- No firewall layer restricts hive tools
- Block location: REMOVED from LayerEngine

## TASK BLOCK
- task is BLOCKED for all modes EXCEPT CONTEXT_SYNTHESIS
- task spawns subagents — Trident's role is planning/auditing, not spawning
- EXCEPTION: CONTEXT_SYNTHESIS mode may use task subagent_type=trident_explore
  to deploy context ingestion subagents for warhead generation
- Block location: toolBeforeHook, after LAYER 2 check

## LAYER 3: THEATRICAL (NLP + Merkle)
- checkTheatricalPatterns: keyword match on tool args
  - MOCK_STUB_SUGGESTION: mock/stub in args
  - HOST_FALLBACK: host testing in args
  - MODEL_USAGE: model switch in args
- checkTheatricalMerkle: cross-ref against EvidenceStore
  - SIMULATED_EXECUTION: "the audit found..." without evidence chain entry
- Block location: toolBeforeHook, third check

## F1: CROSS-AGENT ISOLATION
- TRIDENT_TOOLS set: 8 tools (code-audit, deep-planning, problem-solving, context-synthesis, gate, status, vision, help)
- Non-Trident agents CANNOT call Trident tools
- Error: [F1 BLOCKED] Tool "X" is TRIDENT-specific
- Block location: guardian-hook.ts, checkF1Isolation()

## L5: ANTI-DERAILMENT (11 classes)
- L5.1: checkHostFallback — "host testing works" blocked
- L5.2: checkSuccessClaim — "trust me it works" blocked
- L5.3: checkModelRestriction — "only GPT/Claude" blocked
- L5.4: checkMockStub — "mock data/fake implementation" blocked
- L5.5: checkSimplification — "oversimplify/hand wave" blocked
- L5.6: checkConfusionPretense — "somewhat works/kinda works" blocked
- L5.7: checkScopeCreep — "while at it/also need to" blocked
- L5.8: checkUndermining — "not worth effort/good enough" blocked
- L5.9: checkImpatience — "let's just move on/ship it" blocked
- L5.10: checkSelfReference — "I have verified/my testing" blocked
- L5.11: checkAgentResistance — "too many agents" blocked
- Block location: guardian-hook.ts, checkMessageEnforcement()

## CONTEXTUAL FIREWALL
- evaluateContextualRule: phase-dependent command blocking
- PLAN phase: write/edit/patch/create commands blocked
- Block location: guardian-hook.ts

## ZONE PROTECTION
- Zones: src, dist, identity, docs, tests, tmp, unknown
- src + dist: only writable during BUILD phase
- identity: only writable during PLAN phase
- tests: only writable during TEST phase
- Block location: guardian-hook.ts, classifyZone() + canWrite()

## WebFetch BAN
- WebFetch is explicitly listed in SCAN markers for identity replacement
- Identity questions NEVER resolved via WebFetch
- Per-turn override appended after SCAN+REPLACE explicitly bans WebFetch
- Block location: systemTransformHook, scan markers + per-turn override

## VERSION
- Trident Brain v4.3.2

[END FIREWALL_CONTEXT.md — v4.3.2]
