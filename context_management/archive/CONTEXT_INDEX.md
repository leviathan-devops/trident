# Context Index — Trident v4.4.2 God Loop Engineering

## SHIP STATUS: COMPLETE (2026-06-30)
Build PASS (14.6MB, 0 errors). Score 0/100 due to 60 CRITICAL false positives (all confirmed). Ship package at `Trident_Agent/Ship_Packages/SHIP_v4.4.2_GOD_LOOP/`. God Loop infrastructure fully built — 12 files, 10-phase state machine. Remaining work: audit engine checker improvements (R10/R14/R17) to reduce false positive rate.

## CRITICAL: Read These FIRST After Compaction

**Phase 1 — Regain full context (read in order):**
1. `STREAM_OF_CONSCIOUSNESS.md` — Complete first-hand awareness dump. THE #1 PRIORITY for regaining context.
2. `GOD_LOOP_PROGRESS.md` — Real-time score trajectory, root cause analysis, what's built, next actions.
3. `CURRENT_AUDIT_FINDINGS.md` — Breakdown of 72 CRITICAL + 185 HIGH findings by category, real vs false positive.

**Phase 2 — Engineering reference:**
4. `GOD_LOOP_ENGINEERING_SPEC.md` — The full 10-phase state machine spec + banned patterns
5. `BUILD_SPEC_POSEIDON_OVERHAUL.md` — Dense 1600-line build spec with full GodLoopOrchestrator class
6. `V4.4.1_BASELINE_STATE.md` — Baseline state: MODIFIED to v4.4.2 with God Loop (12 files built, full table)

## Implementation Details (Read Before Building Each Component)

7. `ENFORCER_HOOK_SPEC.md` — Phase-to-tool mapping, escalation ladder, static prompt pattern
8. `POSEIDON_WALL_CONTROL.md` — Bash/write/edit toggle when poseidon active (actual code from v4.4.2_FAIL)
9. `EVIDENCE_STORE_INTERFACE.md` — getEvidenceStore() singleton, meetsThreshold(0.96), Merkle chain
10. `SEMANTIC_INTELLIGENCE_REQUIREMENTS.md` — How to make PLAN and PROBLEM_SOLVE produce intelligent output, NOT generic garbage

## Port Reference (Read Before Copying from v4.4.2_FAIL)

11. `V442_FAIL_PORT_PATHS.md` — Exact absolute paths for all 9 files to port

## Operational Knowledge (Read to Avoid Known Traps)

12. `SESSION_LOG_LESSONS.md` — 5 operational traps from ses_128e (opencode.json, return; bug, etc.)
13. `NESTED_POSEIDON_PREVENTION.md` — 5 mandatory rules to prevent nested Poseidon disaster
14. `BUILD_COMMAND.md` — Exact esbuild flags, banner, externals, verification steps
15. `PRE_EXISTING_TSC_ERRORS.md` — 52 TSC errors that are NOT bugs (zod v4, TS6.0)

## Post-Build Reports (Read After Ship)

16. `BUILD_REPORT_V4.4.2_GOD_LOOP.md` (in `docs/`) — Final build report: 0 errors, 14.6MB bundle, 150 source files, God Loop complete
17. `AUDIT_ENGINE_FP_FORENSIC.md` (if it exists) — Root cause analysis of 60 CRITICAL false positives across R10/R11/R12/R13/R17

## Source Locations

- **Working project**: `Trident_v4.4.2/` (this directory)
- **v4.4.1 source (reference)**: `Trident_Agent/v4.4.1-DP-OVERHAUL/`
- **v4.4.2_FAIL (port from)**: `Active_Projects/Trident_v4.4.2_FAIL/`
- **Original POSEIDON (immutable)**: `GLOBAL NUKE RELOAD/Trident/v4.4-POSEIDON/`

## Key External Specs

- `Active_Projects/Trident_v4.4/Corrected_Poseidon_Plan.md` — Architecture decision
- `Active_Projects/Trident_v4.4/Poseidon-First-Runtime-Test-Data.md` — The "perfect" v4.4 behavior
- `Active_Projects/Trident_v4.4/V4.4.1_BUILD_SPEC.md` — Original build spec + banned patterns
- `Active_Projects/Trident_v4.4.1/GOD_LOOP_REPORT_V4.4.1_OVERHAUL_V2.md` — 12-hour success report
- `Active_Projects/Trident_v4.4.1/V4.4.1_OVERHAUL_V2.md` — Self-executing phase spec
- `Active_Projects/Trident_v4.4.2_FAIL/NESTED_POSEIDON_EVENT_REPORT.md` — Nested disaster report
