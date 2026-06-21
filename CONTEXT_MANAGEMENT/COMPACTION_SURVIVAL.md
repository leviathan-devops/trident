# COMPACTION SURVIVAL — Trident v4.4

## Session Anchor
- Project: Trident v4.4 Poseidon Mode
- Workspace: /home/leviathan/OPENCODE_WORKSPACE/Shared Workspace Context/Manta Agent/Active_Projects/Tridnet_v4.4/
- Baseline: v4.3.3-LIGHTWEIGHT (cloned into src/)
- Spec: POSEIDON_BUILD_SPEC.md (1,366 lines, 12 sections)

## Recovery Protocol
1. Read BUILD_STATE.md for current phase
2. Read DECISION_CHAIN.md for context
3. Read POSEIDON_BUILD_SPEC.md Section 12 for implementation order
4. Continue from where last left off

## Key Files
- src/hooks/trident-hooks.ts — main hook file (755 lines, has semantic theatrical fix)
- src/tools/trident-tools.ts — tool registration
- src/fsm/orchestrator-machine-v2.ts — state machine
- src/orchestrator.ts — orchestrator wrapper
- src/poseidon/god-loop.ts — God Loop with CycleTracker integration
- src/poseidon/cycle-tracker.ts — NEW: Finding lifecycle tracking
- src/subagents/trident-build/firewall/ — NEW: BuildFirewall (5 files)
- src/subagents/trident-build/hooks/guardian-hook.ts — Firewall integration point
