# FIREWALL CONTEXT — Trident Brain v4.4.2

## LAYER 1: BLOCKED TOOLS (Normal Mode)
Blocked unless Poseidon Mode is active:
- edit, write_file, write, patch, create, delete_file
- bash, terminal, execute, exec
- mcp_write_file, mcp_edit, mcp_patch

When Poseidon Mode is active, these are UNLOCKED:
- bash, write, edit, write_file — removed from blocklist
- Unlock is mechanical: poseidonState.isActive() check in toolBeforeHook

Block location: toolBeforeHook, first check

## LAYER 2: ALWAYS BLOCKED (Even in Poseidon)
- spawn_shark_agent, spawn-shark-agent, spawn_manta_agent, spawn-manta-agent
- run_parallel_tasks
- Other agents' tools: manta-*, shark-*, ps-mode-* — NOT in Trident's allowlist

Block location: toolBeforeHook

## LAYER 3: THEATRICAL (NLP + Merkle)
- checkTheatricalPatterns: semantic context analysis on tool args
  - Distinguishes DESCRIPTIVE (documenting anti-patterns) from SUGGESTIVE (proposing shortcuts)
  - MOCK_STUB_SUGGESTION, HOST_FALLBACK, MODEL_USAGE, SIMULATED_EXECUTION
- checkTheatricalMerkle: cross-ref against EvidenceStore
  - SIMULATED_EXECUTION: claims without evidence chain entry
- Only fires on suggestive intent, not descriptive references

## SUBAGENT GATE
- trident_explore: ALWAYS allowed (read-only research)
- trident_build: ONLY allowed when poseidonState.isActive() returns true
- Any other subagent_type: BLOCKED with error
- Block location: toolBeforeHook, task dispatch check

## ALLOWLIST (What Trident CAN Call)
### Trident Tools (prefix: trident-)
trident-code-audit, trident-deep-planning, trident-problem-solving, trident-context-synthesis, trident-poseidon, trident-gate, trident-status, trident-help, trident-audit, build-status

### Core Tools
read, glob, grep, webfetch, question, task, todowrite, checkpoint

### Hive Mind (prefix: hive_)
hive_context, hive_status, hive_remember, hive_scan, hive_forget, hive_purge, hive_restore, hive_trash_list, hive_trash_status, memread_session, memlink_parent

### MCP Tool Prefixes (auto-allowed)
- reasoning-bus_* — reasoning bus messaging
- visual-cortex_* — VLM and browser control
- zai-vision_* — ZAI vision analysis

### NOT ALLOWED (Other Agents)
- manta-* — Manta agent tools (different agent, different scope)
- shark-* — Shark agent tools
- ps-mode-* — Problem solving mode tools
- These are mechanically DENIED by isToolAllowed()

## POSEIDON MODE UNLOCK MECHANISM
When poseidonState.isActive(sessionId) returns true:
1. BLOCKED_TOOLS_FOR_TRIDENT is filtered to remove bash/write/edit/write_file
2. The allowlist bypass grants these tools access
3. trident_build subagent dispatch is permitted
4. Evidence is logged: POSEIDON_UNLOCK_ACTIVE in logs

When Poseidon deactivates:
1. Tools are re-blocked automatically
2. Stale system prompt mandate is removed
3. Session state is preserved for future resumption

## WebFetch BAN
- WebFetch is scanned for identity replacement
- Identity questions NEVER resolved via WebFetch
- Per-turn override explicitly bans WebFetch for identity

## Version
- Trident Brain v4.4.2

[END FIREWALL_CONTEXT.md — v4.4.2]
