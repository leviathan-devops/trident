# FIREWALL CONTEXT — Trident Brain v4.3.3

## LAYER 1: BLOCKED TOOLS (17 tools)
- edit, write_file, write, patch, create, delete_file
- bash, terminal, execute, exec
- mcp_write_file, mcp_edit, mcp_patch
- todowrite
- spawn_shark_agent, spawn-shark-agent, spawn_manta_agent, spawn-manta-agent
- run_parallel_tasks
- Block location: toolBeforeHook, first check before all others
- Error message includes alternative tool suggestions
- task is NOT blocked — allowed unconditionally for Trident

## LAYER 2: HIVE BLOCKED (20 tools + hyphen variants)
- kraken_hive_remember, kraken_hive_inject_context, kraken_hive_search
- kraken_brain_status, kraken_message_status
- get_cluster_status, get_agent_status
- hive_remember, hive-remember, aggregate_results
- spawn_cluster_task, spawn-cluster-task, anchor_cluster
- report_to_kraken, report-to-kraken, checkpoint
- shark_gate, shark-gate, shark_evidence, shark-evidence
- shark_test_runner, shark-test-runner
- manta_gate, manta-gate, manta_evidence, manta-evidence
- Block location: toolBeforeHook, second check
- Trident is hive-context-READ-ONLY

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

## L5: ANTI-DERAILMENT (10 classes)
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

## TASK_BLOCK RULES
- task tool: ALLOWED unconditionally for Trident
- Use task(subagent_type="...", prompt="...") to dispatch subagents for data gathering
- Enforcement removed — task is fully allowed

## ALLOWED QUESTION TOOL
- question tool: ALLOWED for Trident agents to ask clarifying questions
- Not blocked — use when requirements are ambiguous

## VERSION
- Trident Brain v4.3.3

[END FIREWALL_CONTEXT.md — v4.3.3]
