# POSEIDON ARCHITECTURE — Trident v4.4

## Component Map
- PoseidonDetector: Semantic activation/deactivation from user messages
- PoseidonState: Session-scoped activation state
- GodLoopOrchestrator: audit → plan → execute → re-audit loop (96% threshold)
- trident-poseidon tool: Locked by default, requires user activation
- Trident_Build subagent: Build execution with CODE-enforced quality gates

## Data Flow
User says "Poseidon Mode Activate" → PoseidonDetector detects → poseidonState.activate()
→ User/agent calls trident-poseidon tool → lock check passes → GodLoopOrchestrator.runLoop()
→ AuditEngine.audit() → score < 96% → generatePlan() → dispatchToBuildAgent()
→ Trident_Build executes fixes → re-audit → loop until 96%+ → container test → auto-lock
