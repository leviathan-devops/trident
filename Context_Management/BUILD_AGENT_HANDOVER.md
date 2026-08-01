# TRIDENT v4.4.3 — Build Agent Handover Package

**Purpose:** This file is the compact context summary for any build agent dispatched to this project. Read this FIRST to understand the full picture.

---

## MISSION
Overhaul the Poseidon God Loop per `TRIDENT_v4.4.3_POSEIDON_OVERHAUL_SPEC.md`. The spec is 191KB — its key sections are:

1. **PASS/LOOP Terminal Architecture** — Replace FAILED with LOOP (reset-and-retry), add PASS (success terminal)
2. **INIT Phase Rewrite** — Strategic anchor + canon doc sync + project discovery
3. **AUDIT Phase** — Add semantic filtering (filterFalsePositives)
4. **PLAN Phase Rewrite** — L2 Engineering Spec generation + multi-wave scheduling
5. **DISPATCH Phase Rewrite** — Multi-wave execution with inter-wave verification
6. **CONTAINER_TEST Phase Rewrite** — Full mandatory 12-step workflow
7. **PROBLEM_SOLVE Phase Rewrite** — 3-path intelligence driver
8. **LOOP/PASS terminal phases** — New phase implementations
9. **Identity Strengthening** — 15 operational points in hooks
10. **Deactivation Precision** — Fix 'on' word-boundary in poseidon-detector
11. **Tool Updates** — PASS/LOOP display, agent count fix
12. **Audit Engine AST Rewrite** — Native AST for R4, R9, R13, R14, R16

## PROJECT STRUCTURE
```
v4.4.3/
├── TRIDENT_v4.4.3_POSEIDON_OVERHAUL_SPEC.md  ← 191KB spec (READ THIS)
├── src/                                       ← 204 TypeScript files
│   ├── poseidon/     (10 files)               ← PRIMARY TARGET
│   ├── audit-engine/ (29 files)               ← SECONDARY TARGET
│   ├── hooks/        (6 files)                ← TERTIARY TARGET
│   ├── tools/        (2 files)
│   ├── modes/        (6 files)
│   ├── warheads/     (19 files)
│   ├── artifacts/    (23 files)
│   ├── subagents/    (16 files)
│   ├── identity/     (17 files)
│   ├── shared/       (26 files)
│   ├── fsm/          (5 files)
│   └── _archive/     (4 legacy files)
├── dist/index.js                              ← 14.9MB pre-built bundle
├── Context_Management/                        ← 9 canon docs + handover + thought stream
│   ├── COMPACTION_SURVIVAL.md                 ← Master recovery
│   ├── BUILD_STATE.md                         ← Current metrics
│   ├── TASK_QUEUE.md                          ← Task decomposition
│   ├── DEBUG_LOG.md                           ← Known bugs
│   ├── BUILD_AGENT_HANDOVER.md               ← THIS FILE
│   └── handover-packages/                    ← Explore agent findings
└── .trident/
    ├── god-loop/state.json                    ← Poseidon state (phase: AUDIT)
    ├── evidence/                              ← Evidence store (empty, ready)
    └── checkpoints/                           ← Checkpoint storage
```

## CRITICAL: 6 Known Bugs at Baseline

| ID | Severity | File | Description |
|----|----------|------|-------------|
| **BUG-001** | 🔴 CRITICAL | `god-loop.ts` | WaveVerifier called with empty `{}` outputs — verification neutered |
| **BUG-002** | 🟠 HIGH | `god-loop.ts:37` | `.ts` extension import crashes at runtime |
| **BUG-003** | 🟠 HIGH | `poseidon-detector.ts` | 'on' substring match false-positives activation |
| **BUG-004** | 🟡 MEDIUM | `god-loop.ts` | Snapshot hash path-based, not content-based |
| **BUG-005** | 🟡 MEDIUM | `strategic-intelligence.ts` | Duplicate GodLoopState type defs |
| **BUG-006** | ⚪ LOW | `cycle-tracker.ts` | STALL_THRESHOLD mismatch (3 vs 5) |

**Fix order:** BUG-001 → BUG-002 → BUG-003 → spec architecture → BUG-004/005/006

## POSEIDON STATUS
- **Phase:** AUDIT (cycle 0, wave 0)
- **Score:** 0/100 (baseline)
- **Target:** 168 .ts files discovered
- **Snapshot:** 54886c32113878a6
- **Bash/Write/Edit:** UNLOCKED

## BUILD ORDER (from spec Section 15)
```
1. god-loop.ts: Phase types → INIT → AUDIT → SCORE → DECIDE
2. god-loop.ts: PLAN rewrite (L2 + multi-wave)
3. god-loop.ts: DISPATCH rewrite (multi-wave + inter-wave verify)
4. god-loop.ts: COLLECT → VERIFY → AUDIT_RECHECK
5. god-loop.ts: CONTAINER_TEST rewrite
6. god-loop.ts: PROBLEM_SOLVE rewrite (3 paths)
7. god-loop.ts: PASS + LOOP terminal phases
8. trident-poseidon.ts: PASS/LOOP display, agent count
9. trident-hooks.ts: 15-point mandate
10. poseidon-detector.ts: word-boundary fix
11. audit-engine: filterFalsePositives
12. AST rewrite: R4, R9, R13, R14, R16 layers
```

## KEY FILES TO KNOW
| File | Lines | Role |
|------|-------|------|
| src/poseidon/god-loop.ts | 1211 | Central orchestrator — PRIMARY EDIT TARGET |
| src/tools/trident-poseidon.ts | 175 | Tool handler — display + dispatch |
| src/tools/trident-tools.ts | 1306 | All tool definitions |
| src/hooks/trident-hooks.ts | 1148 | Master hook file |
| src/audit-engine/index.ts | 471 | Audit engine entry |
| src/audit-engine/code-classifier.ts | 915 | AST code classification |
| src/warheads/nlp-pipeline/poseidon-detector.ts | 72 | BUG-003 location |
| src/poseidon/strategic-intelligence.ts | 715 | BUG-005 location |
| src/poseidon/cycle-tracker.ts | 220 | BUG-006 location |

## CI/CD
```bash
# Build
bun run build:check     # tsc --noEmit
bun run build           # bun build → dist/index.js

# Audit
# trident-code-audit targetPath=.

# Container test
# Via Poseidon CONTAINER_TEST phase
```


## LEAF NODE CONTRACT

`trident_build` is a leaf executor, not an orchestrator. Its source config explicitly denies `task` and `trident-poseidon`; its guardian and master hook enforce the same denial. The `skill` tool is allowlisted for Trident and build leaves. The parent Trident session alone may dispatch agents or advance Poseidon.
