# TRIDENT v4.3.3 — BUILD CONTEXT

**Date:** 2026-06-15
**Status:** OVERHAUL IN PROGRESS — 8-phase fix plan executing
**Version:** v4.3.3
**Source:** `src/` (102 .ts files)
**Bundle:** `dist/index.js` (245K lines, ~14.1MB)

## Architecture Overview
1. **Entry Point** (index.ts): Plugin registration, warhead init, hook/tool wiring
2. **Audit Engine** (audit-engine/): 17 layers R0-R16, AST analysis, scoring
3. **Warhead System** (shared/): 12 warhead instances across 10 files
4. **Mode Tools** (tools/trident-tools.ts): 8 tools — 4 modes + 4 support
5. **State Machine** (fsm/orchestrator-machine-v2.ts): Pure TS, 6 states
6. **Identity** (identity/): systemTransformHook SCAN+REPLACE
7. **Hooks** (hooks/): 8-hook system + identity enforcer + guardian
8. **NLP** (nlp/): wink-nlp intent parser (via warhead chain)
9. **Evidence** (evidence/): SQLite store + merkle chain
10. **Auto-Discovery** (shared/auto-discover.ts): File/pattern/failure scanner

## Warhead Registry (12 instances)
1. runtimeGradeWarhead
2. nlpPipelineWarhead
3. auditLayerProgressionWarhead
4. concurrencyWarhead
5. persistenceWarhead
6. testingWarhead
7. tsCompilerAPIWarhead
8. exploreDispatchWarhead
9. identityLayerWarhead
10. focusWarhead
11. recoveryWarhead
12. auditStateWarhead

## Cardinal Rule
ALL v4.3.2 working code MUST exist in v4.3.3. BUILD ON TOP. Zero deletions.

## Container
- Image: `runtime-grade-container-sandbox:master`
- Model: `google/gemma-4-26b-a4b-it`
- Tile: Row 4 left (x=-600, y=3080)
