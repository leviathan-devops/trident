# FULL E2E WORKFLOW — Trident v4.3.3 to 90% Runtime Grade

## Overview

This is a 20-phase sequential workflow to bring Trident v4.3.3 from its current state to **90% Runtime Grade**. The workflow is organized into 4 waves of parallel execution.

**Bundle Target:** `dist/index.js` — 249,877 lines, 14.4MB, ESM format
**SHA256:** `7bb5d295c595fead3190f108ca0176e1cadd9045329d6e4e6a6e76d27006d72b`
**Source:** `src/` (102+ .ts files)

---

## WAVE 1 — Phases 1-10 (10 Parallel Agents)

Wave 1 deploys 10 independent agents, each working on a separate file or file set. All phases in Wave 1 can execute in parallel — no source dependencies between them.

### Phase 1: Build Scoring Fix (package.json + preflight.ts)

**Files:** `package.json`, `preflight.ts`
**Scope:** Fix the build scoring mechanism. Ensure package.json fields correctly map to runtime-grade scoring criteria in preflight.ts.
**Verification:** `grep` the compiled bundle for corrected scoring patterns.

### Phase 2: Wire IdentityEnforcer.enforce()

**Files:** `trident-hooks.ts`
**Scope:** Ensure `IdentityEnforcer.enforce()` is actually called at the correct interception point. Currently defined but may not be invoked on every tool execution path.
**Verification:** Bundle contains `IdentityEnforcer.enforce` call site.

### Phase 3: Engineer toolResultOk() to runtime-grade

**Files:** `trident-tools.ts`
**Scope:** Upgrade `toolResultOk()` helper to runtime-grade standards — proper error typing, consistent return structure, observable side effects for audit.
**Verification:** Bundle shows runtime-grade `toolResultOk` implementation.

### Phase 4: Fix async fire-and-forget bugs (7 sites)

**Files:** `orchestrator.ts`, `utils.ts`
**Scope:** 7 identified sites where async operations are fire-and-forget (no `await`, no `.catch()`, no error handling). Add proper promise tracking.
**Verification:** All 7 sites have `await` or `.catch()` in bundle.

### Phase 5: Replace require() in ESM (7 sites)

**Files:** `trident-hooks.ts`, `session-hook.ts`
**Scope:** 7 sites use `require()` which is invalid in ESM context. Replace with `createRequire` or native ESM imports.
**Verification:** Bundle shows zero `require()` calls outside the banner.

### Phase 6: Engineer empty debug catch blocks (11 sites)

**Files:** `index.ts`, `trident-hooks.ts`, `session-hook.ts`
**Scope:** 11 catch blocks with empty or `// TODO` bodies. Add proper error logging, rethrow or handle each.
**Verification:** Bundle shows all 11 catch blocks have substantive bodies.

### Phase 7: Add agent identity guard to t2-loader.ts

**Files:** `t2-loader.ts`
**Scope:** Ensure the T2 knowledge loader verifies agent identity before loading context. Prevents cross-agent context leakage.
**Verification:** Bundle shows identity check in T2 load path.

### Phase 8: Engineer R14 scanner false positive edge cases

**Files:** `r14-control-flow-graph.ts`
**Scope:** Fix remaining false positive edge cases in the R14 unreachable-code scanner. The AST-based fix handled catch blocks; handle other edge cases (conditional returns, switch-case fallthrough).
**Verification:** Bundle shows AST-based detection with edge case handling.

### Phase 9: Fix JSON.parse() without type assertion (6 sites)

**Files:** 5 files, 6 JSON.parse sites
**Scope:** Every `JSON.parse()` call must have a type assertion or schema validation. Fix 6 sites that return `any`.
**Verification:** Bundle shows typed `JSON.parse` at all 6 sites.

### Phase 10: Fix trident-vision.ts hardcoded localhost

**Files:** `trident-vision.ts`
**Scope:** Replace hardcoded `localhost:7860` with configurable endpoint from plugin config or environment.
**Verification:** Bundle shows configurable endpoint, no hardcoded localhost.

---

## WAVE 2 — Phases 11-15 (After Wave 1 tsc passes)

Wave 2 requires Wave 1 to compile cleanly first. These phases address deeper patterns across more files.

### Phase 11: Fix R16 catch-no-return pattern (40+ sites)

**Files:** ~20 files, 40+ sites
**Scope:** R16 requires that every catch block either returns a typed value or rethrows. Fix 40+ sites across ~20 files where catch blocks have no return statement.
**Verification:** Bundle grep shows all catch blocks have return or throw.

### Phase 12: Fix R4 MEDIUM catch blocks (50+ sites)

**Files:** ~10+ files, 50+ sites
**Scope:** R4 checks for proper error handling. 50+ catch blocks scored MEDIUM because they don't use structured logging or error classification. Add `tridentLog` calls with appropriate severity.
**Verification:** Bundle shows `tridentLog` in all formerly-silent catch blocks.

### Phase 13: Fix R13 lambda `any` parameters (~158 sites)

**Files:** ~15+ files, ~158 sites
**Scope:** R13 flags lambda/arrow function parameters typed as `any`. Replace with proper types across ~158 sites.
**Verification:** Bundle shows zero `any`-typed lambda parameters.

### Phase 14: Fix orchestrator.ts async pattern consistency

**Files:** `orchestrator.ts`
**Scope:** Ensure consistent async patterns — all async functions handle errors, no mixing of `.then()` and `await`, proper return types.
**Verification:** Bundle shows consistent async pattern usage.

### Phase 15: Fix deep-planning R12 false positives

**Files:** `deep-planning-artifact.ts`
**Scope:** R12 flags certain annotation patterns as false positives. Fix the scanner or the artifact to eliminate ~15-20 false findings.
**Verification:** Bundle shows corrected annotations.

---

## WAVE 3 — Phases 16-18 (After Wave 2 tsc passes)

Wave 3 wires remaining dispatch and coverage paths.

### Phase 16: Wire trident_explore dispatch into CS tool

**Files:** Context-synthesis tool entry
**Scope:** The explorer dispatch template exists but is never called from the `trident-context-synthesis` tool. Wire the `buildExplorerDispatchTemplate()` call into the synthesis pipeline.
**Verification:** Bundle shows explorer dispatch is called during CS execution.

### Phase 17: Complete remaining R16 return coverage (~9 sites)

**Files:** ~5 files, ~9 sites
**Scope:** After Phase 11, ~9 remaining R16 sites that were missed. Fix these for full R16 compliance.
**Verification:** Bundle shows 100% R16 catch block compliance.

### Phase 18: Wire trident_explore final dispatch path

**Files:** Dispatch path wiring
**Scope:** Ensure the complete dispatch path works end-to-end: tool call → allowlist check → identity gate → explore dispatch → response.
**Verification:** Container test: `trident-context-synthesis` with explore mode dispatches successfully.

---

## WAVE 4 — Phases 19-20 (After Wave 3 tsc passes)

### Phase 19: Rebuild + full audit

**Scope:**
1. `cd src && npx tsc --noEmit` — must produce 0 errors
2. `npx esbuild index.ts --bundle --platform=node --format=esm --target=node22 --external:@opencode-ai/plugin --external:zod --outfile=dist/index.js --banner:js='import { createRequire } from "module"; const require = createRequire(import.meta.url);'`
3. `sha256sum dist/index.js` — record hash
4. Deploy to container: `docker cp dist/index.js trident-v4-test:/root/.config/opencode/plugins/trident/dist/index.js`
5. Verify SHA256 matches on container
6. Run full 17-layer audit against bundle

**Verification:** SHA256 hash matches host=container, audit score >= 90/100.

### Phase 20: Grep-verify all fixes + context doc update

**18 Verification Checks:**
1. Wave 1 Phase 1: Scoring fix present
2. Wave 1 Phase 2: IdentityEnforcer.enforce() call present
3. Wave 1 Phase 3: toolResultOk() runtime-grade
4. Wave 1 Phase 4: async fire-and-forget fixed (7 sites)
5. Wave 1 Phase 5: require() replaced in ESM (7 sites)
6. Wave 1 Phase 6: empty catch blocks fixed (11 sites)
7. Wave 1 Phase 7: Identity guard in t2-loader
8. Wave 1 Phase 8: R14 edge cases handled
9. Wave 1 Phase 9: JSON.parse typed (6 sites)
10. Wave 1 Phase 10: Hardcoded localhost removed
11. Wave 2 Phase 11: R16 catch-no-return fixed (40+ sites)
12. Wave 2 Phase 12: R4 catch blocks fixed (50+ sites)
13. Wave 2 Phase 13: R13 lambda any fixed (~158 sites)
14. Wave 2 Phase 14: Async pattern consistency
15. Wave 2 Phase 15: R12 false positives fixed
16. Wave 3 Phase 16: Explorer dispatch wired into CS
17. Wave 3 Phase 17: Remaining R16 sites fixed (~9)
18. Wave 3 Phase 18: Explorer final dispatch path wired

**Context Doc Update:** Refresh all 5 compaction-survival docs:
- `BUILD_STATE.md` — phase table, wave status, bundle info
- `TASK_QUEUE.md` — done/in-progress/next per wave
- `DECISION_CHAIN.md` — rolling reasoning trail
- `EVIDENCE_STATE.md` — evidence for each phase
- `COMPACTION_SURVIVAL.md` — stream anchor + recovery protocol

---

## Success Criteria

| Metric | Target |
|--------|--------|
| tsc --noEmit | 0 errors |
| Bundle build | Success (ESM format) |
| SHA256 host = container | Match |
| 17-layer audit | >= 90/100 |
| Container identity | "Trident Brain v4.3.3" |
| trident_explore dispatch | Successful (no TASK_BLOCK) |
| All 18 grep checks | Pass |

---

*END WORKFLOW — Execute Wave 1 → Wave 2 → Wave 3 → Wave 4 sequentially.*
