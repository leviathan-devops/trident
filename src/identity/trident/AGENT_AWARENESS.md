# AGENT AWARENESS — Trident Brain v4.3.3

## Hook System (8 hooks)
- event: Session lifecycle management (session.created, session.ended)
  - Fires for ALL agents, gates on isTridentAgent()
  - session.created: initializes gate state from checkpoint or defaults
  - session.ended: clears agent state, resets session resources
- chat.message: Agent detection and narration blocking
  - Detects Trident agent via chat message metadata
  - Blocks pre-tool narration patterns (WOULD_USE, LET_ME, APPROACH_WOULD_BE)
  - Blocks phantom result patterns (PHANTOM_FINDINGS, PHANTOM_REFERENCE, SHELL_SIMULATION)
  - Tracks toolsCalledThisTurn per session
- tool.execute.before: 3-layer blocking + F1 + L5 + zone + CFW
  - LAYER 1: 18 blocked tools
  - LAYER 2: 20 hive-blocked tools
  - LAYER 3: theatrical NLP + Merkle
  - F1: cross-agent isolation (non-Trident cannot call Trident tools)
  - L5: anti-derailment (10 pattern classes)
  - Zone: write protection by phase
  - CFW: contextual firewall rules
- tool.execute.after: No-op (reserved for future use)
  - Gated on isTridentAgent()
  - Currently performs no action
- system.transform: SCAN+REPLACE identity injection
  - Scans system prompt for: opencode, interactive CLI, software engineering, WebFetch
  - Replaces matching strings with Trident identity header
  - Falls back to unshift if no match found
  - Appends per-turn identity override
  - Appends context lines (agent, mode, layer, status)
- messages.transform: Dedup backup identity injection
  - Injects identity header into first message if not already present
  - Checks for existing TRIDENT IDENTITY BINDING before injection
  - Backup channel for identity persistence
- compacting: Cache invalidation + identity re-injection
  - Invalidates T1 cache on compaction
  - Re-injects identity header into system prompt after compaction
  - Ensures identity survives context compaction
- command.execute.before: OpenCode run enforcement
  - Intercepts "opencode run --agent trident" commands
  - Runs checkGuardian on the message content
  - Blocks dangerous patterns in agent invocation

## Blocking Architecture (3-layer + F1 + L5)
- Layer 1: Tool allowlist — 18 tools blocked by name
- Layer 2: Hive protection — 20 tools + variants blocked
- Layer 3: Theatrical — NLP regex + Merkle chain verification
- F1: Cross-agent isolation — non-Trident agents blocked from Trident tools
- L5: Anti-derailment — 10 pattern classes blocking derailment behaviors

## Tools (8)
- Mode tools: trident-code-audit, trident-deep-planning, trident-problem-solving, trident-context-synthesis
- Support tools: trident-gate, trident-status, trident-vision, trident-help
- All mode tools write .md artifacts to GENERATED_ARTIFACTS/
- All tool calls recorded in Merkle evidence chain

## Session Management
- Map<string, AgentState> keyed by sessionId
- AgentState: agent name, timestamp, sessionId, toolsCalledThisTurn, lastModelMessage
- Session lifecycle: created → active → ended
- Tab-toggle: switching agents clears/sets agent state for that session
- orchestrator manages mode, layer, status per session

## Identity Injection
- IdentityLoader reads identity/trident/*.md (7 files)
- formatIdentityHeader() creates identity header from loaded files
- system.transform performs SCAN+REPLACE on every system prompt
- Per-turn override appended as last system prompt entry
- messages.transform provides backup injection channel
- Identity loaded once, cached in identityHeaderPromise

## Zone Protection
- Zones: src, dist, identity, docs, tests, tmp, unknown
- classifyZone() determines zone from file path
- canWrite() checks if current gate allows writes to zone
- src + dist: BUILD phase only
- identity: PLAN phase only
- tests: TEST phase only

## Evidence Gate
- EvidenceGate class validates container test evidence
- passRate >= 0.96 required for delivery gate advancement
- hasContainerTestEvidence(): checks ContainerTestResult.json
- hasRequiredEvidence(gate): returns list of missing evidence files
- validatePassRate(result, threshold): validates pass rate against threshold

## Gate Chain
- 6 gates: PLAN → BUILD → TEST → VERIFY → AUDIT → DELIVERY
- GateManager persists state in .trident/gate-state.json
- Each gate has blocking criteria and required evidence files
- Gates advance only when current gate is passed
- Gate state survives compaction via file persistence

## TASK_BLOCK (guardian-hook.ts)
- task tool: ALLOWED unconditionally for Trident
- Use to dispatch subagents for data gathering
- Enforcement for task removed — fully allowed

## QUESTION TOOL
- question tool: ALLOWED for all Trident agents — use to ask clarifying questions

## Version
- Trident Brain v4.3.3

[END AGENT_AWARENESS.md — v4.3.3]
