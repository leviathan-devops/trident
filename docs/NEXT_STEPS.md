# NEXT STEPS — Warhead Overhaul (Shark→Trident Duplication)

**Goal:** Duplicate Shark v4.9's 20-warhead identity infrastructure for Trident, giving it full agent self-awareness, L5 anti-derailment, gate chain, zone protection, evidence gate, T2→T1 synthesis, and 9-canon doc system.

**Current Stack Grade:**
- Runtime behavior (deployed bundle): A+ (7/7 TUI tests)
- Source code hygiene: F (0/100, 542 findings)
- Identity self-awareness: F (model knows name but cannot describe own architecture)
- Warhead coverage: 3/14 present (SCAN+REPLACE identity, 3-layer blocking, agent-gated hooks)

---

## 10-Phase Build Plan

### Phase 1: Identity File System
**Files to create:** `identity/trident/TRIDENT.md`, `IDENTITY.md`, `EXECUTION.md`, `QUALITY.md`, `TOOLS.md`, `FIREWALL_CONTEXT.md`
**Verification:** `ls identity/trident/ | wc -l` = 6, each file >50 lines
**How:** Each file is a markdown document with clear section headers and bullet-point rules. They are read by IdentityLoader.loadForRole('trident').

### Phase 2: Plugin Identity System
**Files to create:** `src/identity/agent-identity.ts`
**Files to modify:** `src/hooks/trident-hooks.ts` (replace inline isTridentAgent)
**Verification:** `grep -c "isTridentAgent" trident-hooks.ts` = 0 (all usage imported from agent-identity.ts)
**Pattern:** Follow Shark's `src/shared/agent-identity.ts` but rename for Trident

### Phase 3: Session Lifecycle Hook
**Files to create:** `src/hooks/session-hook.ts`
**Files to modify:** `src/index.ts` (register session hook), `src/hooks/trident-hooks.ts` (delegate event handling)
**Verification:** eventHook handles both session.created and session.ended, tab-toggle correctly clears stale state
**Reference:** Identity Architecture Bible Part 1.3

### Phase 4: Guardian Hook
**Files to create:** `src/hooks/guardian-hook.ts`
**Components:** F1 cross-agent isolation, L5.1-L5.19 anti-derailment, zone write protection, contextual firewall
**Verification:** Non-Trident agents calling trident tools get [F1 BLOCKED], model claiming "trust me it works" gets L5.2 block
**Pattern:** Follow Shark's guardian-hook.ts patterns

### Phase 5: Gate Chain
**Files to create:** `src/shared/gates.ts`
**Verification:** GateManager.save() writes to .trident/gate-state.json, GateManager.load() restores state
**Gates:** PLAN→BUILD→TEST→VERIFY→AUDIT→DELIVERY

### Phase 6: Evidence Gate
**Files to create:** `src/shared/evidence-gate.ts`
**Verification:** hasContainerTestEvidence() returns true when .trident/evidence/delivery/ContainerTestResult.json exists with passRate >= 0.96

### Phase 7: T2→T1 Synthesis Engine
**Files to create:** `src/shared/t2-loader.ts`
**Verification:** synthesizeT1Injectables() returns <5K chars with 7 T1 headers (RULES, PROHIBITIONS, DELEGATION, CONTEXT_MGMT, ALLOWLIST, COMPACTION, DERAILMENT)

### Phase 8: Missing Hook Registrations
**Files to create:** Hook handlers in trident-hooks.ts or new files
**Hooks:** experimental.session.compacting, command.execute.before
**Verification:** compacting hook invalidates T2 cache and re-injects identity, command.execute.before catches opencode run with trident agent

### Phase 9: Wiring
**Files to modify:** `src/index.ts`, `src/hooks/trident-hooks.ts`
**Verification:** createTridentHooks() includes all 8+ hooks, config callback registers tool isolation, trident-tools.ts includes F1 tool set

### Phase 10: Agent Self-Awareness
**Files to create:** `identity/trident/AGENT_AWARENESS.md`
**Files to modify:** `src/identity/index.ts` (update formatIdentityHeader to include architecture section)
**Verification:** Ask "describe your architecture" → model lists >= 8 of: hook wiring, 3-layer blocking, session management, gate chain, F1 isolation, L5 anti-derailment, zone protection, evidence gate, T2→T1 synthesis, 9-canon docs

---

## Anti-Derailment Rules

### Do NOT:
- Skip phases — each depends on the previous
- Write identity files as prose — use bullet-point rules and section headers
- forget to update index.ts hook registration — new hooks don't work until registered
- Use `any` types in new code — the audit found 150 CRIT for type-any patterns
- Leave empty catch blocks — the audit flagged this as CRIT in R4
- Forget to import from agent-identity.ts — inline isTridentAgent creates duplication

### Do:
- `src/index.ts` is the entry point — all hooks must be registered there
- Test each phase with `tsc --noEmit` before moving to next
- Run `trident-code-audit action=preflight-only` after each phase to verify build chain
- Follow Shark v4.9 reference at `../SHARK_V4.9.9/Ship_Packages/SHARK_v4.9.9_PLANNING_BRAIN/src/`
- Follow the 3 bibles at `KNOWLEDGE_LIBRARY/Agent_Identity_Architecture/`
- Each identity file must be standalone — IdentityLoader reads them individually
- session-hook.ts MUST be registered BEFORE other hooks in index.ts

## Verification After Each Phase

After each phase, run:
```bash
npx tsc --noEmit                     # Type check
trident-status                        # Verify tools still work
trident-help                          # Verify help output is intact
```

After Phase 10, run the full Tier 4 TUI test suite:
```bash
bash "/home/leviathan/OPENCODE_WORKSPACE/Shared Workspace Context/Spider Agent/Active_Projects/trident-v4.3-overhaul/TRIDENT_V4.3.1-T3/evidence/tier4-trident-v4.3.1-T3-test.sh"
```
