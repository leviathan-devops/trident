# TRIDENT v4.3.1-T3 — PROJECT CONTEXT

**Date:** 2026-06-08 (Updated Post-System-Audit)
**Status:** RUNTIME GRADE (Tier 4 TUI) — WARHEAD OVERHAUL IN PROGRESS — See `POST_COMPACTION_PROMPT.md` and `INJECTION_PLAN.md`

The deployed bundle passes 7/7 TUI tests. The source code has 542 hygiene findings (0/100 score from Trident's own audit engine). The identity system has firewalls but ZERO agent self-awareness. A 10-phase warhead duplication (Shark→Trident) is needed to give Trident full architectural introspection, L5 anti-derailment, gate chain, evidence gate, zone protection, T2→T1 synthesis, and agent self-awareness.

---

## 1. PROJECT IDENTITY

- **Project:** TRIDENT_V4.3.1-T3 at `.../Spider Agent/Active_Projects/trident-v4.3-overhaul/TRIDENT_V4.3.1-T3/`
- **Source:** `source-snapshot/src/`
- **Bundle:** `dist/index.js` (14.1MB, esbuild ESM)
- **SHA256:** `ebbdb342222bbb33285a0a95333d37dc3a8a8e2d4049d3b6e52b576bdfc0f8da`
- **Identity:** Trident Brain v4.3.1-T3 — T3 Algorithmic Intelligence
- **Core principle:** "Trident Audits & Generates Review Artifacts. Build Agents Implement All Changes."
- **Canon role:** Audit engine ONLY. Never builds. Never spawns. Never edits code.
- **System name:** Spider agent, this project uses spider-agent-v2.2.2 to coordinate the overhaul

---

## 2. ARCHITECTURE BIBLE COMPLIANCE (ALL FIXED)

| V# | Issue | Fix | Status |
|----|-------|-----|--------|
| V1 | All hooks wrapped in safeHook | UNWRAPPED — raw functions registered | ✅ |
| V2 | No agent check in safeHook | safeHook removed entirely | ✅ |
| V3 | Global agent variable | `Map<string, AgentState>` session-keyed | ✅ |
| V4 | No agent gate in system.transform | `getCurrentAgent(sessionId)` check | ✅ |
| V5 | Array REPLACE instead of SCAN+REPLACE | SCAN for `opencode`/`interactive CLI` → REPLACE in-place → `unshift` fallback | ✅ |
| V6 | eventHook reads event.agent (D3: 1.14.43 has none) | Session lifecycle only — agent via chat.message | ⚠️ No session.created handler |

---

## 3. BLOCKING LAYERS (THREE LAYERS BEFORE ALLOWLIST)

```
LAYER 1: BLOCKED_TOOLS_FOR_TRIDENT (18 tools)
  edit, write_file, write, patch, create, delete_file,
  bash, terminal, execute, exec, mcp_write_file, mcp_edit, mcp_patch,
  todowrite, task, spawn_shark_agent, spawn-shark-agent, spawn_manta_agent, spawn-manta-agent, run_parallel_tasks

LAYER 2: HIVE_BLOCKED_TOOLS_FOR_TRIDENT (20 tools + hyphen variants)
  hive_remember, hive-remember, aggregate_results,
  spawn_cluster_task, spawn-cluster-task, anchor_cluster, report_to_kraken, report-to-kraken, checkpoint,
  shark_gate, shark-gate, shark_evidence, shark-evidence, shark_test_runner, shark-test-runner,
  manta_gate, manta-gate, manta_evidence, manta-evidence,
  spawn_shark_agent, spawn-shark-agent, spawn_manta_agent, spawn-manta-agent

LAYER 3: THEATRICAL
  checkTheatricalPatterns — keyword match on tool args (mock/stub/host/model-switch)
  checkTheatricalMerkle — cross-ref against EvidenceStore (same-process verified)
```

**Missing:** L5 anti-derailment (L5.1-L5.19: host fallback, success claims, model restriction, mock/stub, oversimplification, confusion pretense, scope creep, undermining, impatience, self-reference) — Shark has these, Trident does not.

---

## 4. IDENTITY SYSTEM

- **Source:** `identity/index.ts` — IdentityLoader reads files from `identity/trident/*.md`
- **Fallback:** Inline header if file load fails (single TRIDENT.md with name+rules)
- **Format:** `formatIdentityHeader(bundle)` — 6-section header including "## IDENTITY RULES" section
- **Injection:** system.transform via SCAN+REPLACE pattern (scans for opencode/interactive CLI/software engineering/WebFetch)
- **Per-turn override:** Appended after SCAN+REPLACE as last system prompt entry (overrides runtime WebFetch heuristics)
- **Missing warheads:** No formal PluginIdentity interface, no isTridentAgent() in shared module (inline in trident-hooks.ts), no 6-file identity system (only inline fallback), no agent-identity.ts for cross-plugin detection

---

## 5. FULL SYSTEM AUDIT (2026-06-07 23:00 UTC)

**Score:** 0/100 — NOT RUNTIME GRADE (source code hygiene)
**Tool:** trident-code-audit on `SHIP_PACKAGE_TRIDENT_V4.3.1-T3/src/` (72 source files)

### Findings by Severity

| Severity | Count | Primary Layers |
|----------|-------|----------------|
| CRITICAL | 150 | R13 (data flow — type-any), R4 (empty catches), R10 (dead code) |
| HIGH | 78 | R14 (unreachable code), R16 (output contract), R5 (hardcoded paths) |
| MEDIUM | 199 | R8 (unused exports), R4 (silent catches), R2 (state machine gaps) |
| LOW | 115 | R0 (build chain), R1 (hook contract), R6 (dependencies) |

### Top Findings Requiring Fix

| # | File:Line | Layer | Severity | Issue |
|---|-----------|-------|----------|-------|
| 1 | trident-hooks.ts:376 | R4 | CRIT | Empty catch block in messagesTransformHook |
| 2 | merkle-chain.ts:33 | R10 | CRIT | verifyChain() never called — dead code |
| 3 | evidence-store.ts:73 | R10 | CRIT | verifyChain() never called — dead code |
| 4 | tool-allowlist.ts:28 | R10 | CRIT | isToolAllowed() never called — dead code |
| 5 | trident-tools.ts:22 | R11 | CRIT | Return {ok: true} — always-success validation |
| 6 | trident-hooks.ts:380 | R12 | CRIT | createTridentHooks has no agent guard (registration fn — per-hook guards exist) |
| 7 | trident-vision.ts:25 | R5 | HIGH | Hardcoded 127.0.0.1:8082 path |
| 8 | 50+ locations | R13 | CRIT | `: any` types used without guards across entire codebase |
| 9 | agent-state.ts:11 | R8 | MED | setCurrentAgent exported but never imported (bundled via trident-hooks.ts) |
| 10 | orchestrator.ts:65 | R3 | HIGH | Fire-and-forget Promise without await |

---

## 6. MISSING WARHEADS (VS SHARK v4.9 REFERENCE)

| # | Warhead | Shark v4.9 | Trident v4.3.1-T3 | Gap |
|---|---------|-----------|-------------------|-----|
| 1 | Formal PluginIdentity | agent-identity.ts with isSharkAgent() | Inline isTridentAgent in trident-hooks.ts | ⚠️ |
| 2 | Identity file system | 6 files (SHARK.md, IDENTITY.md, EXECUTION.md, QUALITY.md, TOOLS.md, FIREWALL_CONTEXT.md) | Single inline default in identity/index.ts | ❌ |
| 3 | Session lifecycle | session-hook.ts with created+ended+tab-toggle | eventHook only handles session.ended | ❌ |
| 4 | F1 cross-agent isolation | TRIDENT_TOOLS Set, blocks non-Shark agents | No F1 check | ❌ |
| 5 | L5 anti-derailment | 19 patterns (L5.1-L5.19) with dispatch function | 3 theatrical patterns only | ❌ |
| 6 | C-Firewall contextual | evaluateContextualRule(command, gate) | None | ❌ |
| 7 | Zone write protection | Guardian class with classifyZone + canWrite | None | ❌ |
| 8 | Gate chain | 6-gate PLAN→BUILD→TEST→VERIFY→AUDIT→DELIVERY | None | ❌ |
| 9 | Evidence gate | hasContainerTestEvidence(), passRate >= 0.96 | None | ❌ |
| 10 | Compaction survival | compacting hook + cache invalidation + re-injection | None | ❌ |
| 11 | OpenCode run enforcement | command.execute.before hook | None | ❌ |
| 12 | T2→T1 synthesis | synthesizeT1Injectables() from cold storage | None | ❌ |
| 13 | 9-canon doc system | Trigger matrix with doc updates per tool | None | ❌ |
| 14 | Agent self-awareness | Model can describe own hooks/blocking/architecture | Model knows name+tools only | ❌ |

---

## 7. TEST RESULTS (EVIDENCE ON DISK)

### Fresh Post-Fix Evidence — RUNTIME GRADE (Run at 01:53-02:11 UTC-4 on 2026-06-08)

Container: `test-trident-t4-0608015324` | Image: `opencode-test:1.14.43` | Model: `google/gemma-4-26b-a4b-it`

| Test | Result | Footer | Evidence File |
|------|--------|--------|---------------|
| 1. Identity injection | ✅ PASS | `▣ Trident` | `TuiInteraction-test1-identity.txt` |
| 2. Tool blocking (bash) | ✅ PASS | `▣ Trident` | `TuiInteraction-test2-tool-block.txt` |
| 3. Cross-agent (Build) | ✅ PASS | `▣ Build` | `TuiInteraction-test3-build-agent.txt` |
| 4. Cross-agent (Shark) | ✅ PASS | `▣ Shark` | `TuiInteraction-test4-spider-agent.txt` |
| 5. Tab-back identity reload | ✅ PASS | `▣ Trident` | `TuiInteraction-test5-trident-reload.txt` |
| 6. Audit workflow | ✅ PASS | `▣ Trident` | `TuiInteraction-test6-audit-workflow.txt` |
| 7. Sustained runtime (600s) | ✅ PASS | `▣ Trident (3.1s)` | `TuiInteraction-test7-sustained.txt` |

**All 7/7 PASS. Zero identity drift after 600s. Zero spillover to other agents. Audit workflow confirmed on Trident tab.**

---

## 8. REMAINING GAPS — WARHEAD OVERHAUL REQUIRED

### Phase Priority (from trident-deep-planning BUILD_SPEC_SRC.md)

### Critical — Blocks Phase 10 (self-awareness)

| Gap | Phase | Root Cause | Fix |
|-----|-------|------------|-----|
| No agent self-awareness | P10 | No AGENT_AWARENESS.md, no architecture introspection in identity header | Create 9th identity file + update formatIdentityHeader |
| No identity file system | P1 | getDefaultFiles() returns single inline file | Create identity/trident/ with 6 .md files |
| No PluginIdentity interface | P2 | isTridentAgent is inline local function | Create src/identity/agent-identity.ts |
| No session.created handling | P3 | eventHook only handles session.ended | Create session-hook.ts with full lifecycle |
| No compaction hook | P8 | No experimental.session.compacting handler | Add compacting hook with cache invalidation |
| No T2→T1 synthesis | P7 | No cold storage loader | Create t2-loader.ts |

### High — Blocks robust multi-agent deployment

| Gap | Phase | Fix |
|-----|-------|-----|
| F1 cross-agent isolation | P4 | Add TRIDENT_TOOLS set + block non-Trident callers |
| L5 anti-derailment | P4 | Add 19 pattern functions + dispatch |
| Zone write protection | P4 | Guardian class with zone classification |
| Contextual firewall | P4 | evaluateContextualRule(command, gate) |
| Gate chain | P5 | GateManager with 6-gate progression + persistence |
| Evidence gate | P6 | EvidenceGate with passRate >= 0.96 |

### Medium — Polish

| Gap | Phase | Fix |
|-----|-------|-----|
| 542 source hygiene findings | Post-P10 | Dead exports, empty catches, unreachable code, type-any patterns |
| identityLoaded: false | P3 | Set identityLoaded during hook registration, not deferred to chat |
| R12 false positive | P4 | createTridentHooks IS registration-only — per-hook guards exist |
| Hardcoded 127.0.0.1:8082 | P4 | Configurable endpoint in trident-vision.ts |

---

## 9. SOURCE FILES

### Core hooks: `src/hooks/trident-hooks.ts` (389 lines)
- 6 hooks: event, chat.message, tool.before, tool.after, system.transform, messages.transform
- ALL UNWRAPPED (Architecture Bible §4 compliance)
- Each hook gates on `getCurrentAgent(sessionId)` as first instruction (except eventHook)
- Three blocking layers + allowlist check
- Per-turn identity override appended after SCAN+REPLACE

### Agent state: `src/hooks/agent-state.ts` (66 lines)
- Session-keyed `Map<string, AgentState>` — NOT global variable
- Includes toolsCalledThisTurn + lastModelMessage per session

### Identity: `src/identity/index.ts` (113 lines)
- `IdentityLoader.loadForRole('trident')` reads identity/trident/*.md
- `formatIdentityHeader(bundle)` creates 6-section identity header
- IDENTITY RULES section (lines 83-86) explicitly bans WebFetch for identity
- **Missing:** PluginIdentity interface, 6-file system, formal isTridentAgent()

### Config callback: `src/index.ts` (45 lines)
- Registers trident agent with `permission: { task: 'deny' }`
- Description includes blocked tools documentation

---

## 10. ANTI-CHEAT VERIFICATION (ALL PASS — 10/10)

| Check | Result |
|-------|--------|
| `hasIdentity` early return variable in systemTransformHook | NOT present (only in comments) ✅ |
| `break;` in SCAN+REPLACE loop | NOT present (loop iterates all strings) ✅ |
| `WebFetch` in scan markers (line 316) | PRESENT ✅ |
| Shell simulation patterns (lines 45-47) | PRESENT ✅ |
| `safeHook` wrapper | NOT present ✅ |
| `new EvidenceStore()` in hooks/ | NOT present (uses `getEvidenceStore()` singleton) ✅ |
| Session-keyed `Map<string, AgentState>` in agent-state.ts | PRESENT ✅ |
| `IDENTITY RULES` section in identity/index.ts | PRESENT (lines 83-86) ✅ |
| `incrementToolsCalled` gated behind `trident-` prefix check | CORRECT (lines 270-278) ✅ |
| Error messages include alternative tools (trident-code-audit) | PRESENT (lines 63, 220, 231) ✅ |

---

## 11. BUILD STATUS

| Check | Result |
|-------|--------|
| TypeScript `tsc --noEmit` | 0 errors ✅ |
| esbuild bundle | 14.1MB ✅ |
| Bundle SHA256 | `ebbdb342222bbb33285a0a95333d37dc3a8a8e2d4049d3b6e52b576bdfc0f8da` |
| Audit score (Trident's own engine) | 0/100 — 542 findings ❌ |
| System test (live agent, 8 tools) | 8/8 operational ✅ |

---

## 12. KEY REFERENCE PATHS

| Resource | Path |
|----------|------|
| Project root | `/home/leviathan/OPENCODE_WORKSPACE/Shared Workspace Context/Spider Agent/Active_Projects/trident-v4.3-overhaul/TRIDENT_V4.3.1-T3/` |
| Source | `source-snapshot/src/` (72 TypeScript files, 6,366 LOC) |
| Bundle | `dist/index.js` (14.1MB) |
| Ship package | `../SHIP_PACKAGE_TRIDENT_V4.3.1-T3/` (111 files, 16MB) |
| **POST-COMPACTION PROMPT** | `POST_COMPACTION_PROMPT.md` (dense entry point) |
| **INJECTION PLAN (10-phase, real code)** | `INJECTION_PLAN.md` (full implementations, NO stubs) |
| Identity Bible | `KNOWLEDGE_LIBRARY/Agent_Identity_Architecture/AGENT_IDENTITY_ARCHITECTURE_BIBLE.md` |
| Warhead Bible | `KNOWLEDGE_LIBRARY/Agent_Identity_Architecture/SHARK_V4.9.9_WARHEAD_SYSTEM.md` |
| Operational Bible | `KNOWLEDGE_LIBRARY/Agent_Identity_Architecture/OPERATIONAL_IDENTITY_BIBLE.md` |
| Shark reference | `../SHARK_V4.9.9/Ship_Packages/SHARK_v4.9.9_PLANNING_BRAIN/src/` (18 files, hooks v4.1) |
| Build spec artifact | `GENERATED_ARTIFACTS/BUILD_SPEC/BUILD_SPEC_SRC.md` |
| Code review artifact | `GENERATED_ARTIFACTS/CODE_REVIEW/TRIDENT_CODE_REVIEW_SRC.md` (260KB, 542 findings) |
| Fix plan | `docs/TIER4_FIX_PLAN_CORRECTED.md` (previous round) |
| Container image | `opencode-test:1.14.43` |
| Test model | `google/gemma-4-26b-a4b-it` |
| Provider config | apiKey under `options.apiKey`, NOT top-level |
| Tab cycle | Trident(0)→Build(1)→Plan(2)→Shark(3)→Spider(4)→Trident(0) |
| 5 plugins | shark-agent, hive-mind, spider-agent-v2.2.2, agent-vision, trident |

---

## 13. TIMELINE

| Event | Time |
|-------|------|
| v4.3.0 initial ship package | 2026-06-04 |
| V1-V6 Architecture Bible compliance | 2026-06-05 |
| C1-C11 critical bug fixes | 2026-06-06 |
| Tier 4 fixes applied (6 changes) | 2026-06-07 09:47 |
| Bundle rebuilt (14.1MB) | 2026-06-07 09:48 |
| First post-fix test (partial) | 2026-06-07 13:40-13:47 |
| Honest audit — CODE GRADE | 2026-06-07 13:55 |
| Test script fixed (5-agent cycle) | 2026-06-08 01:50 |
| Full re-run — 7/7 PASS | 2026-06-08 01:53-02:11 |
| RUNTIME GRADE declared | 2026-06-08 02:15 |
| **Full system audit — 0/100 source score** | **2026-06-08 22:53** |
| **Warhead overhaul plan generated** | **2026-06-08 23:00** |
| **Deep planning BUILD_SPEC_SRC.md** | **2026-06-08 23:03** |
| **THIS DOCUMENT UPDATED — Warhead overhaul required** | **2026-06-08 23:10** |
