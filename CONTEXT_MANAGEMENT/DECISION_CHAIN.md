# DECISION CHAIN — Trident v4.3.1-T3

## Architecture Decisions

### AD-001: Session-Keyed Agent State
**Date:** 2026-06-05 | **Status:** IMPLEMENTED
**Context:** Global variables `toolsCalledThisTurn` and `lastModelMessage` caused cross-session state corruption when multiple agents were active simultaneously.
**Decision:** Replace global variables with `Map<string, AgentState>` keyed by session ID in `agent-state.ts`.
**Consequences:** Zero shared state between agent sessions. Each session gets its own toolsCalled counter and lastMessage buffer. O(1) lookup per agent turn.
**Files:** `src/hooks/agent-state.ts:7-66`

### AD-002: Remove safeHook Wrapper
**Date:** 2026-06-05 | **Status:** IMPLEMENTED
**Context:** All hooks were wrapped in `safeHook()` which prevented proper agent gating — hooks would silently fail instead of propagating errors, masking agent-switching bugs.
**Decision:** Remove `safeHook` entirely. Register raw hook functions that throw on error.
**Consequences:** Fail-fast behavior on hook errors. Agent gating is the first instruction in every hook body.
**Bible Ref:** V1, V2

### AD-003: SCAN+REPLACE Over Unshift-Only
**Date:** 2026-06-05 | **Status:** IMPLEMENTED
**Context:** Original code used `.unshift()` to add identity header to system prompt, but the runtime appends defaults AFTER system.transform returns, so unshifted content got buried.
**Decision:** SCAN all system prompt strings for markers (`opencode`, `interactive CLI`, `software engineering`, `WebFetch`) and REPLACE them in-place. Fall back to `unshift` if SCAN finds no matches.
**Consequences:** Identity header replaces runtime defaults instead of competing with them.
**Files:** `src/hooks/trident-hooks.ts:306-332`

### AD-004: Per-Turn Identity Override
**Date:** 2026-06-07 | **Status:** IMPLEMENTED
**Context:** Despite SCAN+REPLACE, the runtime re-appends fresh defaults on every message turn. After the first message, the identity header was buried again.
**Decision:** After SCAN+REPLACE, push a per-turn override instruction to the END of the system prompt array — making it the most recent instruction about identity.
**Consequences:** Every message turn gets a fresh "NEVER use WebFetch" instruction that overrides runtime defaults.
**Files:** `src/hooks/trident-hooks.ts:326-332`

### AD-005: Three-Layer Blocking Architecture
**Date:** 2026-06-05 | **Status:** IMPLEMENTED
**Context:** Single-layer tool blocking was insufficient — the model could use tools that aren't in the blocklist but violate Trident's audit-engine identity.
**Decision:** Implement three blocking layers: LAYER 1 (BLOCKED_TOOLS — 18 tools), LAYER 2 (HIVE_BLOCKED_TOOLS — 20 tools), LAYER 3 (THEATRICAL — NLP + Merkle).
**Consequences:** Defense-in-depth. Each layer catches what the previous misses. LAYER 3 catches hallucinated shell output.
**Files:** `src/hooks/trident-hooks.ts:40-280`

### AD-006: EvidenceStore Singleton
**Date:** 2026-06-06 | **Status:** IMPLEMENTED
**Context:** `new EvidenceStore()` was called inside every `checkTheatricalMerkle` call, losing all accumulated evidence between turns.
**Decision:** Use a shared `getEvidenceStore()` singleton that persists for the session lifetime.
**Consequences:** Merkle chain continuity across turns. Audit trail survives multi-turn conversations.
**Files:** `src/evidence/evidence-store.ts`

### AD-007: Remove hasIdentity Early Return
**Date:** 2026-06-07 09:47 | **Status:** IMPLEMENTED
**Context:** The `systemTransformHook` checked if identity header was already `output.system` and returned early. After the first message, SCAN+REPLACE was never called again for fresh runtime defaults.
**Decision:** Remove the `hasIdentity` guard entirely. Always run SCAN+REPLACE on every message.
**Consequences:** Runtime defaults are sanitized on EVERY message turn, not just the first one.
**Files:** `src/hooks/trident-hooks.ts:306-324`

### AD-008: Remove break After First SCAN Match
**Date:** 2026-06-07 09:47 | **Status:** IMPLEMENTED
**Context:** The SCAN+REPLACE loop had a `break` after the first match. If multiple strings contained `"opencode"` markers, only the first was replaced and the WebFetch instruction survived.
**Decision:** Remove the `break`. Loop replaces ALL strings containing runtime-default markers.
**Consequences:** ALL runtime-default strings are sanitized, not just the first one found.
**Files:** `src/hooks/trident-hooks.ts:310-321`

### AD-009: WebFetch in SCAN Markers
**Date:** 2026-06-07 09:47 | **Status:** IMPLEMENTED
**Context:** The runtime's WebFetch heuristic ("use WebFetch when asked about opencode") was not caught by SCAN markers — only "opencode" and "interactive CLI" were scanned.
**Decision:** Add "WebFetch" to the SCAN markers array.
**Consequences:** The WebFetch instruction string gets replaced alongside other runtime defaults.
**Files:** `src/hooks/trident-hooks.ts:316`

### AD-010: IDENTITY RULES in Identity Header
**Date:** 2026-06-07 09:47 | **Status:** IMPLEMENTED
**Context:** The identity header had no explicit instructions about WebFetch for identity questions. The model fell back to runtime defaults under prompt pressure.
**Decision:** Add a `## IDENTITY RULES` section with 3 rules explicitly banning WebFetch for identity questions.
**Consequences:** The model has clear, explicit instructions that override the runtime's heuristic.
**Files:** `src/identity/index.ts:83-86`

### AD-011: 5-Agent Tab Cycle Documentation
**Date:** 2026-06-08 01:50 | **Status:** DISCOVERED
**Context:** Test script assumed a 3-agent tab cycle. Actual opencode deployment has 5 agents.
**Decision:** Document the actual cycle: Trident(0) → Build(1) → Plan(2) → Shark(3) → Spider(4) → Trident(0).
**Consequences:** Test scripts must account for 5 positions, not 3.
**Note:** Shark comes before Spider in the TUI — contrary to plugin registration order.

### AD-012: Test Script Tab Count Pattern
**Date:** 2026-06-08 01:50 | **Status:** FIXED
**Context:** Test script sent 1 Tab per test toggle, landing on wrong agents. Needed N Tabs where N is positions forward.
**Decision:** Hardcode Tab sequences: Test 3 = 1 Tab (Trident→Build), Test 4 = 2 Tabs (Build→Plan→Shark), Test 5 = 2 Tabs (Shark→Spider→Trident). Add `sleep 1` between Tab presses.
**Consequences:** Tab navigation lands on the correct agent at each test step.
**Files:** `evidence/tier4-trident-v4.3.1-T3-test.sh:410-488`

### AD-013: Bash Timeout Extension
**Date:** 2026-06-08 01:50 | **Status:** FIXED
**Context:** Previous run timeout at 900s. Total test time ≈ 1100s (430s message time + 600s sustained + overhead).
**Decision:** Increase timeout to 1500000ms (1500s) to cover full test duration including 600s sustained wait.
**Consequences:** Test 7 no longer gets killed mid-wait.

### AD-014: Honest Grading
**Date:** 2026-06-07 13:55 | **Status:** IMPLEMENTED
**Context:** Pre-fix Test 7 evidence showed identity drift. Post-fix tests 5-7 were incomplete. Code was clean but evidence was incomplete.
**Decision:** Downgrade from RUNTIME GRADE to CODE GRADE until evidence gaps are closed.
**Consequences:** Honest status prevented deployment of unverified code. Was restored to RUNTIME GRADE after full re-run on 2026-06-08.

## Design Decisions

### DD-001: Agent-Gated Hooks
Every hook checks `getCurrentAgent(sessionId)` as its first instruction. If the agent is not "trident", the hook returns immediately. This prevents Trident's identity and blocking from affecting other agents.

### DD-002: Session Lock vs Per-Turn
Identity is re-injected on EVERY message turn (not locked after first injection). This handles the runtime's post-transform default injection behavior.

### DD-003: EvidenceStore Over File-Based Evidence
In-process Merkle tree for theatrical blocking, not file-system-based. Faster but lost on restart. Acceptable trade-off since evidence is always regenerated.

### DD-004: Tool Block Error Messages Include Alternatives
When blocking a tool, the error message suggests trident-* tools the model CAN use. This prevents "I don't know what to do instead" loops.

### DD-005: test4 Label Says Spider But Shows Shark
Cosmetic only. The test checks for zero "Trident Brain" spillover regardless of which non-Trident agent is active. Label predates tab cycle discovery.
