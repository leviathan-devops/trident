# POST-COMPACTION PROMPT — Trident v4.4.3 Phase 1

## Mission
Complete Phase 1 of the God Loop Phase Intelligence Overhaul. Make 5 phases model-required instead of 1. No fallbacks.

## Workspace Root
/home/leviathan/OPENCODE_WORKSPACE/Shared Workspace Context/Trident_Agent/Active_Projects/v4.4.3

## Reading Order (read ALL before coding)
1. Context_Management/COMPACTION_SURVIVAL.md — resume point + operating laws
2. Context_Management/CURRENT_STATE.md — what's built, what's pending
3. Context_Management/TASK_QUEUE.md — exact Phase 1 tasks
4. Context_Management/DECISION_CHAIN.md — operator rulings (CANON)
5. Context_Management/EVIDENCE_STATE.md — verified test results
6. TRIDENT_V4.4.3_OVERHAUL_SPEC.md — Part 1 (God Loop Phase Intelligence)
7. TRIDENT_DECISION_MAKING_TOOL_SPEC.md — decision engine dependency
8. src/poseidon/phase-intelligence.ts — ALREADY CREATED, contains context generators

## Verified State
- Base: v4.4.3 converged (hash: 7461c3d3...)
- 168 source files, 329 modules
- phase-intelligence.ts CREATED with:
  - generateDecideContext, generatePlanContext, generateVerifyContext
  - generateContainerTestContext, generateProblemSolveContext
  - PHASE_ACTIONS map + validatePhaseAction
- Toy project: 8/8 PASS
- Kraken: Score 0→94/100

## Phase 1 Tasks (Execute These)
1. Modify src/poseidon/god-loop.ts:
   - DECIDE: use generateDecideContext(), set requiresModelAction=true, expectedAction='decide'
   - PLAN: use generatePlanContext(), set requiresModelAction=true, expectedAction='plan'
   - VERIFY: use generateVerifyContext(), set requiresModelAction=true, expectedAction='verify'
   - CONTAINER_TEST: use generateContainerTestContext(), FULLY MANUAL
   - PROBLEM_SOLVE: use generateProblemSolveContext(), set requiresModelAction=true, expectedAction='solve'
   - Mechanical phases (INIT, AUDIT, SCORE, COLLECT, AUDIT_RECHECK): UNCHANGED

2. Modify src/tools/trident-poseidon.ts:
   - Add action=decide (process model's DECIDE decision)
   - Add action=plan (process model's PLAN strategies)
   - Add action=verify (process model's VERIFY verdicts)
   - Add action=diagnose (process model's CONTAINER_TEST diagnosis)
   - Add action=solve (process model's PROBLEM_SOLVE solution)
   - Add validatePhaseAction() call to reject wrong actions at each phase

3. Add container test quality gates (5 gates from spec Appendix B)

4. Rebuild: bun build src/index.ts --outdir dist --target bun --format esm --bundle

5. Deploy to container v443-converged-test and test on Kraken

## Critical Doctrine (CANON)
- NO FALLBACKS — phase-appropriate action enforcement only
- Container test is FULLY MANUAL with 5+ adversarial angles
- Do NOT modify v4.4.2 frozen features (SSTF, input-validation, globalThis, intent gate)
- Do NOT start Phase 2 or Phase 3 — only Phase 1

## Operating Rules
- Every claim verified mechanically (SHA256, stream evidence, artifacts)
- Container test or nothing — no smoke tests
- Minimal change discipline — only touch what Phase 1 requires
- Do NOT stop between tasks — drive through to rebuild + test

## First Action
Read phase-intelligence.ts (already created). Then modify god-loop.ts to import and use its functions. Then modify trident-poseidon.ts to add the 5 new actions. Then rebuild and test.
