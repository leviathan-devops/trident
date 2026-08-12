EXECUTE THE FOLLOWING RESUME MISSION VERBATIM. You are resuming the Trident v4.4.2 build after a compaction — the shadow-enhanced task-preflight (v7.3) is built + verified; your mission is the CONTAINER TEST + the remaining fixes + the shadow rollout.

# THE STATE (READ FIRST — the canon docs are updated + final-state)
1. READ FIRST: context_management/POST-COMPACTION_PROMPT.md — the mission + the resume order + the evidence.
2. THE TRUE DIST SHA: a7b886d357919661c03633924ae06d56d73c23833ea754e29a503fdc8e653172 (the ship + the checkpoint V7.3).
3. THE SHIP: Trident_Agent/Ship_Packages/TRIDENT_V4.4.2_SPG_MAXTOKENS_CLEANUP (the dist + the source + the spec + the 439-line build report + the 9 canon docs).
4. THE SPEC: SHADOW_ENHANCED_TASK_PREFLIGHT_SPEC.md — the §3 modules, §4 pipeline, §5 D0-D9, §6 battery, §7 criteria.
5. THE BUILD REPORT: SHADOW_ENHANCED_TASK_PREFLIGHT_BUILD_REPORT.md (439 lines — the complete record: the architecture, the waves, the testing, the failures + the fixes).

# THE VERIFIED STATE (what already works — do NOT re-test, do NOT re-derive)
- The shadow backend: 8 modules (shadow-memory/sidecar/brain/secrets/context-manager/brief-builder/verify/runner) — the 13-step pipeline + the PI execution loop + the fallback.
- The zero-hint battery: 77 pass / 340 expect (the LIAR, dead-LLM, coherence, reattach, blank, freshness, verbatim) — the REAL runner + the REAL memory + the REAL tools in-process.
- The live host fires (the a7b886d3 deploy): the pipeline end-to-end, the brain's LIVE calls (4 PI rounds), the session-scoped memory (5 rows), the DOC gate v2, the ISE firewall (the soft-warn fired), the thin-refusal, the COPY-PASTE hook, the string manifest (the g.split bypass).
- The 401's root: MY corrupted embedded base64 (fixed + decode-verified — the key + the endpoint were NEVER wrong). The endpoint: https://opencode.ai/zen/go/v1 (the operator's correction).

# THE MISSION (the exact order)
## 1. THE CONTAINER TEST OF THE SHADOW TASK-PREFLIGHT (the operator's explicit requirement)
- The trident-container-test tool WORKS now (the restored toolset). The container: trident-shadow-test — the KNOWN ISSUE: it OOM-kills within seconds of the setup (exit 137 — the cgroup pressure on this host; the 8192MB setup + the TUI + the model). The container-testing skill's plan is READY (the real scenario: the task-preflight with the 7 context args + the real filepaths → the [SHADOW INFERENCE] + the supremacy + the memory rows + the notes' PI/FALLBACK flags).
- THE OOM WORKAROUND TO TRY FIRST: the CT setup with a HIGHER memoryLimitMb (e.g., 12288) + the immediate agent/model switch (the buffer-paste delivery for the long texts — the >1KB sends are dropped by the single send-keys). If the container STILL OOMs: document it as the environment issue + use the DIRECT host verification (the a7b886d3 host already proves the pipeline live — the container's ADDITIONAL value is the fresh-environment proof).
- THE PASS CRITERIA: the manifest without the g.split, the prompt file 125+ lines, the notes show the PI rounds or the FALLBACK, the memory row exists, the status bar = Trident.

## 2. THE REMAINING FIXES
- (a) The output's A+ ceiling: the live output was 197 lines (B+/A- — over the 125 floor + the ready bar); the 250-350 golden target depends on the model's compliance with the weaving demand — IF the operator wants the ceiling raised, strengthen the weaving demand's per-section instructions (the mission paragraph, the measurements table).
- (b) The weave consolidation follow-up: the generatePrompt's second weave copy vs the brief-builder's single source (the §9 cross-consistency rule — the values map in ONE place — the hardening flagged it).
- (c) The live-src tsc triage: the 235 pre-existing errors (the baseline — the 16 in trident-task-preflight.ts + the 219 in the other live src) — the operator's call whether to fix.
- (d) The question-tool: the 3-per-session cap — the operator's ruling pending (the overhaul = 3 back-to-back calls within a timeframe + the reset, or the removal) — task-queue id 2.
- (e) The internal SQLite task-queue state machine: the operator's mandate — the internal db + the auto-update with todowrite + the side/background tracking + the pegging — task-queue id 3.

## 3. THE SHADOW ROLLOUT (the operator's "if it works... overhaul ALL the LLM tools")
- The cs/dp/ps/ship-package shadow backends — the KNOWLEDGE_LIBRARY/Engineering/SHADOW_ENHANCED_TOOLS_MACRO_ARCHITECTURE.md Part 6 replication recipe (the D0-D9 order, the zero-hint battery per tool).
- THE POINT OF NO RETURN: the container test's PASS (or the documented environment block) + the operator's go-ahead.

# THE ACCEPTANCE CRITERIA
1. The container test executed (the CT tool + the real scenario) with the pass/fail recorded in .trident/container-test-results.json — OR the environment block documented with the direct-host evidence.
2. The remaining fixes triaged + the operator's rulings captured in the DECISION_CHAIN.
3. The shadow rollout SPEC'D (the Part 6 recipe per tool) + the operator's approval.
4. The canon docs + the DEBUG_LOG + the BUILD_REPORT updated at every milestone (the RUNNING-BUILD-DOCS LAW).

# THE DOCTRINE (the laws that govern)
- The front-end freeze: the tool's args unchanged (the context args only).
- The supremacy: THE FILES ARE THE ONLY GROUND TRUTH. THE CONTEXT ARGS ARE BELIEF.
- The model discipline: DeepSeek V4 Flash ONLY via opencode-go (effort max, the secret from the store, NO FALLBACKS — a failure is the loud error).
- The session scope: {project} × {sessionKey} — the reattach is a GATE.
- The zero-hint law: the test prompts NEVER describe the fixture contents — the ground truth from the files alone.
- The evidence law: every claim carries the mechanical evidence — the container test's artifact, the memory rows, the exit codes. Prose is not evidence.
- The RUNNING-BUILD-DOCS LAW: the DEBUG_LOG + the BUILD_REPORT appended at every significant milestone.

# THE KEY FILES (the anchors)
- The spec: Manta Agent/Active_Projects/Trident_v4.4.2/SHADOW_ENHANCED_TASK_PREFLIGHT_SPEC.md
- The build report: Manta Agent/Active_Projects/Trident_v4.4.2/SHADOW_ENHANCED_TASK_PREFLIGHT_BUILD_REPORT.md
- The shadow source: Manta Agent/Active_Projects/Trident_v4.4.2/src/tools/shadow/ (8 modules)
- The tests: Manta Agent/Active_Projects/Trident_v4.4.2/src/tests/shadow-*.test.ts (7 files, 77 tests)
- The canon docs: Manta Agent/Active_Projects/Trident_v4.4.2/context_management/ (9 docs, final-state)
- The macro spec: KNOWLEDGE_LIBRARY/Engineering/SHADOW_ENHANCED_TOOLS_MACRO_ARCHITECTURE.md (Part 6 the PI-fused replication)
- The checkpoint: Checkpoints/ALL_TOOLS_WORKING_V7_3_SHADOW_TASK_PREFLIGHT_20260806/

RETURN THE FULL REPORT — the container test's evidence, the fixes' outcomes, the rollout's spec. NEVER an empty return. Every claim carries the mechanical evidence.
