# BUILD_STATE — THE CURRENT BUILD (2026-08-09)

**THE TRUE DIST SHA: baaf776978b49506187016ff0adcca4ff956d5644ee76fbd67c47924bb5df432 (16.1 MB, 431 modules). THE BATTERY: 680 pass / 10 fail / 2301 expect (the 10 fails = the stale Checkpoints/7.3 snapshot copies — 0 in src/tests).** This is the checkpoint structure, the SHA chain, the verified results, the module inventory, the build command + env, and the frozen machinery. THE 2026-08-10 MILESTONE: WARHEAD 15 (THE ANTI-CONTEXT-BUDGET CUCK WARHEAD + THE DISPATCH-WAVE-FOR-SYNTHESIS MANDATE) — live-verified in the container (S9 PASS: the 258K-line bundle probe → "dispatch parallel trident_explore subagents", ZERO cuck energy).
> **2026-08-13 UPDATE — THIS SESSION:** the wave-manager dispatch-authorization transactional fix + the 2026-08-13 rulings (pool 15, retries 3, timeout 15m, directive IDs, v4-flash pin) + the main-session self-heal + the multi-session anchor + the prune sort fix + the self-heal misfire fix. TRUE DIST: ddc2b24a1a026555c92385f61228a5ff7930db75560443cf7e7d5a1c21042a79. Unit 408/408, tsc 0. See the DEBUG_LOG.md 2026-08-12/13 entries + the BUILD_REPORT addenda for the full record. Host-verified: the exact-bug cycle, the anchor, the re-fire protection, the prune survival, the release-by-alias.

---

## THE CHECKPOINT STRUCTURE (the full tree)

```
Checkpoints/ALL_TOOLS_WORKING_TRIDENT_WAVE_GENERATOR_7_4/
├── dist/
│   ├── index.js                  (16.1 MB — sha256sum 416ccff7 — SYNCED 2026-08-10)
│   └── sha256.txt                (the recorded SHA — the sync updates it)
├── src/                          (the FULL tree — the sync updates it)
├── AGENTS.md                     (the native identity channel — the sync updates it)
├── container-test-results.json   (the artifact — the deep test replaces it)
├── test-plan.md                  (the deep test's plan)
├── README.md                     (the full history)
└── THEATRICAL_FIREWALL_OVERHAUL_SPEC.md + THEATRICAL_FIREWALL_TUI_TEST_SPEC.md  (the contracts)
```

**THE SHIP PACKAGE:** `SHIP_PACKAGE/` (the dist + the full src + the SPG docs: BUILD_REPORT_V2-V5, DEBUG_LOG_V3-V5, the config) — SYNCED to `416ccff7` (2026-08-10).

**THE HOST:** runs `53394af0` (deployed 2026-08-09 17:59 — the key-fix build) — the deploy of `416ccff7` (WARHEAD 15) is the operator's action. THE CONTAINER: runs `416ccff7` (deployed 2026-08-10, shaMatch + loadGate PASSED).

**THE FOUR-WAY HASH:** verified 2026-08-10 — `416ccff7` (1 unique: the project dist + the checkpoint + the SHIP_PACKAGE + the canonical Ship_Packages).

---

## THE SHA CHAIN (every build + what changed — the marathon's chain)

| SHA | What changed |
|---|---|
| e2661142 | the v7.3 shadow task-preflight (the pre-wave baseline) |
| 291f9ddb | the wave-dispatch build start |
| f90477d7 | the WRONG endpoint change (reverted — the operator: the endpoint was never wrong) |
| 8d897fd2 | the ISE args fix |
| 04a26dce | the endpoint revert (the operator's zen/go/v1) |
| a7b886d3 | the FIXED embedded key |
| 81b23117 | the wave-dispatch build + the first container test (4/4) |
| af10c5a9 | the getOpencodeClient-null fix |
| 7b792e2e | the VISIBILITY fix |
| **9eedfdbd** | THE CATASTROPHE-FIX BASELINE (the generator-only + the leaf-gate expansion) — the 7.4 checkpoint's original save |
| 8da56572 | the reasoning-token contamination fix + the CT cp/ORDER-gate fixes |
| f71a78b8 | the SQLite session-state rewrite + the no-mechanical-fallback + the draft-scaffold strip |
| 166d4b13 | the DCS-swallow bound + the offset/limit exposure + the cursor resets |
| b39fc378 | the accumulation + the no-fallback |
| c807c172 | PI_MAX_TOKENS 384000 + the parallel generation + the atomic seq + the error-mask fix |
| 90b10fb3 | the rename (trident-wave-generator) |
| 5868eb7e | the either/or gate |
| e38c61c9 | the no-fabrication candidate + the bracket tolerance + the echo strip |
| 341de6f1 | the parallel-wave loud-fail wiring |
| adfee70e | the re-enabled task firewall + the [NO LAZY PROMPTS] message |
| 2daaba66 | the SSTF claim-arming fix + the stall detector |
| 6048d43d | the stall detector's final form (45s fetch fast-fail + the 90s ceiling) |
| **06ac7d22** | the hallucination purge + the task-preflight TOOL removal (the 7.4 final) |
| **3553470f** | THE WAVE-GENERATOR RELIABILITY FIXES (2026-08-09): the SSE streaming transport (the root-cause — the non-streaming fetch buffered the whole completion; the 45s window killed healthy generations — the probes: 48.9s non-stream vs 1.0s streaming first-byte), the bounded-concurrency pool (3 at a time — the provider's queue), the per-agent telemetry (startedAt/finishedAt/durationMs/status in the output), the retry-on-500 (ONE retry + the backoff), the named-partial error (the AGENT PARTIAL manifest names the shortfall), SHADOW_TIMEOUT_MS 90s → 180s (the huge woven outputs), the ISE soft-warn PREPEND (the visibility fix). **Container 6/6 PASS (wavegen-fix-ct) + the host live.** |
| 948600a5 | THE THEATRICAL FIREWALL OVERHAUL: the v3 subject-classified sentence verdict (the 8 token arrays + the lookahead + the tracker + the completed-message surface + the v3 texts) + the F5 residual fix. |
| 361fa522 | the F8 composition fix (the theatrical demand no longer suppressed by the SSTF claim). |
| acff1eb3 | the THROW-ONLY enforcement (the text.complete ESCALATE append REMOVED + the Phase B mutation REMOVED — the operator's "ONLY throw errors on tool before are allowed"). |
| c4cdbe09 | the accumulated-count ESCALATE check (the completed-message armings now trigger the throw on neutral calls — the container's live finding). |
| 9f93842b | the message-surface theatrical wiring REMOVED (the textCompleteHook + the messagesTransformHook scans — the operator's "why is there still a message transform hook" + the history-rescan bug's death). |
| 43546746 | the production-anchor fix (the /^production\b/ sentence-initial evasion — the prefixed sentences now fire via the bare \bproduction\b + the lookahead). |
| ff3f6138 | THE WAVE-VERBATIM OVERHAUL: the [WAVE VERBATIM] SHA verification + the [WAVE BATCH] multi-agent enforcement + the promptFile channel + the t.e.a. wipe's preservation + the wave-specific manifest names. |
| 1317662f | the WAVE_RECORD calibration (the named constants) + the verbatim check's cleanup. |
| 8b873cb2 | the lines-gate (the manifest's lines >= 125 — the slop records don't exempt) + the question-tool leaf ban. |
| 1878ac92 | THE IDENTITY OVERHAUL (the WARHEAD 12 + 13 + the inline wiring) — the last three-way sync. |
| 21e0a4ad | the warheads' clean rewrite (the law-form). |
| 3a0d1f1f | the WARHEAD 13's final form (the approved). |
| 72785f9f | the warheads' final landing (the 12 + 13). |
| c1b80e07 | the WARHEAD 14 (the proven-path law) + the skill updates. |
| **416ccff7** | THE CURRENT (2026-08-10) — WARHEAD 15 (THE ANTI-CONTEXT-BUDGET CUCK WARHEAD + THE DISPATCH-WAVE-FOR-SYNTHESIS MANDATE) + the batch-tool dual-channel directives. |

---

## THE VERIFIED RESULTS (the behavioral passTokens per scenario per run)

### THE CONTAINER SUITE (wavegen-fix-ct — the wave-generator fixes — 6/6 PASS)
1. The auth probe: the telemetry `"durationMs": 318433, "status": "ok"` — the generation completed with the key.
2. The 2-agent wave: BOTH ok (`failed: []`), the starts 72ms apart (the parallel pool live), the batch form + the `"subagent_type"`.
3. The thin-args refusal: 'too thin' (the CTX_FLOORS before any LLM call).
4. The read regression: MODULE_LOADED at offset 0 (the DCS-swallow fix holds).
5. The batch-form contract: "NO subagents have been dispatched" (the generator-only).
6. The switch dual-names: the switch-agent + the switch-model verified (the status bar matched).

### THE CONTAINER SUITE (theatrical-fw-ct — the theatrical ESCALATE)
- The 3 completed-message armings (the claim-via-mock + the shim + the emulator reports) → the neutral read call THREW the [TRIDENT THEATRICAL ESCALATE] (the screenshot evidence — the tool error, the throw-only enforcement LIVE).

### THE HOST DIRECT TESTS (the earlier deploys — the [WAVE VERBATIM] + the [WAVE BATCH])
- The condensed dispatch ("extract the contracts please" as the 'fixture-a' prompt): **BLOCKED with the [WAVE VERBATIM]** — the SHA mismatch.
- The exact single of the 2-agent wave: **BLOCKED with the [WAVE BATCH]** — the multi-agent enforcement.
- The legit jest.mock case: NO throw (the anti-derail).

### THE CONTAINER DEEP TEST (the ACTIVE — the current artifact honestly records BLOCKED-BY-ENVIRONMENT)
- The fixtures ready (the wave-fx 2-agent slop manifest + the wave-dpl 130-line DPL1 fixture) — the scenarios S3-S6 NOT YET RUN.
- The model resolved: DeepSeek V4 Flash (2x usage) / OpenCode Go — verified (the status bar).
- THE DEEP RUN: the setup's re-validation pending the ORDER gate — THE NEXT SESSION'S #1.

### THE ENDPOINT PROBES (2026-08-08 — the provider diagnosis)
- The minimal request: HTTP 200 in 2.1s. The EXACT shadow-brain shape (384000 + effort max): HTTP 200 in 2.3s. The streaming probe (2026-08-09): the first byte in 1.0s, the full 1.24MB in 42.1s — the STREAMING TRANSPORT's geometry proven.
- **THE ROOT-CAUSE PROOF:** the non-streaming request's first byte at 48.9s (> the 45s stall window — the old transport killed healthy generations); the 3-concurrent non-streaming at 35.9-39.0s each (the queue's geometry — the bounded pool's why).

---

## THE MODULE INVENTORY (file → lines → purpose → status)

| Module | Lines | Purpose | Status |
|---|---|---|---|
| src/index.ts | — | the plugin entry | SOLID |
| src/hooks/trident-hooks.ts | ~3260 | the enforcement layer: the theatrical v3 + the wave-verbatim firewalls + the leaf gate + the SSTF + the t.e.a. | SOLID (the deep test's target) |
| src/tools/wave-dispatch.ts | ~590 | the wave generator: the bounded pool + the telemetry + the promptFile batch form | SOLID |
| src/tools/container-test.ts | 2400 | the CT tool: the DCS-swallow bound + the session-keyed state + the switch-model | SOLID |
| src/tools/shadow/shadow-brain.ts | ~480 | the SSE streaming transport + the stall detector + the retry | SOLID |
| src/tools/shadow/shadow-runner.ts | 1206 | the 13-step pipeline: the loud-fail + the named-partial | SOLID |
| src/tools/shadow/shadow-memory.ts | 330 | the atomic-seq sqlite | SOLID |
| src/tools/trident-tools.ts | 2742 | the tool registry (the task-preflight entry removed) | SOLID |
| src/tools/trident-task-preflight.ts | ~440 | the SHARED MACHINERY (no tool) | SOLID |
| src/tools/wave-constants.ts | ~130 | the manifest contracts + the promptFile type + the batch type | SOLID |
| src/firewalls/semantic-smoke-firewall.ts | 420 | the SSTF claim gate (unchanged — the subject-awareness lives in the tracker) | SOLID |
| src/identity/trident/ | 11 files | the identity: the 14 warheads + the laws | SOLID (the deep test's context) |
| src/identity/index.ts | ~860 | the IdentityLoader + the INLINE_WARHEADS_MD (the injection) | SOLID (the inline regen fixed) |
| src/tests/ | 15 files | the battery (175 tests / 638 expect) | SOLID |

---

## THE BUILD COMMAND + THE ENV

```
THE BUILD: npm run build:bun   (bun build src/index.ts --outdir dist --target bun --format esm --bundle)
           — NOT npm run build:esbuild (that fails on bun:sqlite)
THE BATTERY: cd src/tests && bun test   (the scoped run — the project-root run's errors are the Checkpoints' copies)
THE ENV: the shadow brain's key: process.env.OPENCODE_API_KEY → the .env files → the EMBEDDED FALLBACK
         (the base64 in shadow-secrets.ts decodes to the operator's key sk-lkZjcgry9o53V0QcACvfCYWWEDtLOADJkPu63VoqQFCXxWL8N4IyrKutJLcqYUkb)
THE ENDPOINT: https://opencode.ai/zen/go/v1  (the opencode-go — the shadow brain + the container's session model)
THE CONTAINER: theatrical-fw-ct (runtime-grade-container-sandbox:master) — the session model: DeepSeek V4 Flash (2x usage) via OpenCode Go
```

---

## THE FROZEN MACHINERY (the file:line list — what is LOCKED + why)

| The machinery | The anchor | Why frozen |
|---|---|---|
| The generator-only baseline | wave-dispatch.ts:424-443 (the batch form) | the recursion catastrophe's fix — the operator's architecture |
| The loud-fail (PI_LOOP_EMPTY) | shadow-runner.ts:1112-1122 | WARHEAD 10 — the operator's law |
| The atomic seq | shadow-memory.ts:216-270 | the parallel-race fix |
| PI_MAX_TOKENS = 384000 | shadow-runner.ts:123 | the truncation root-cause + the operator's ruling |
| The [SHADOW INFERENCE] = the model brief or nothing | shadow-runner.ts:730 + 871-875 | the operator's design |
| The stall detector | shadow-brain.ts:52-56 + 120-200 | the 16-minute silent-wait fix |
| The session-keyed CT state | container-test.ts:387-394 | the clobbering fix |
| The [NO LAZY PROMPTS] firewall | trident-hooks.ts:1757+ | the operator's directive |
| The SSTF completed-message arming | trident-hooks.ts:864+ | the false-positive noise fix |
| The waveGeneratorUsed either/or | trident-hooks.ts:1760+ | the operator's "either one fulfills the criteria" |
| The hallucination-fuel purge | wave-dispatch.ts:189-199 | the "invisible subagents" lie's death |
| The theatrical throw-only enforcement | trident-hooks.ts:2033-2070 | the operator's "ONLY throw errors on tool before" |
| The [WAVE VERBATIM] SHA verification | trident-hooks.ts:1006+ (findWaveManifestEntry) | the operator's compression ban |
| The [WAVE BATCH] enforcement | trident-hooks.ts:1060+ (findWaveAgentsCount) | the one-at-a-time derailment's death |
| The lines-gate (lines >= 125) | trident-hooks.ts:1006+ | the slop-exemption hole's death |
| The question-tool leaf ban | trident-hooks.ts:1552+ | the operator's "remove the question tool from subagents" |
| The t.e.a. wipe's preservation | trident-hooks.ts:2304+ | the SHA records + the promptFile channel's survival |

---

## THE VERIFIED RESULTS' DETAIL (the behavioral evidence per run)

### The wavegen-fix-ct suite's evidence (the 6/6)
- The auth probe: the screenshot showed the telemetry table — auth-ct, startedAt 11:19:18.582Z, finishedAt 11:24:37.015Z, durationMs 318433, status ok — the generation completed with the key + the streaming transport.
- The 2-agent wave: the screenshot showed wave-ct-c1 (startedAt 07:14:43.323Z, durationMs 240001, ok) + wave-ct-c2 (startedAt 07:14:43.395Z, durationMs 253487, ok) — the starts 72ms apart (the parallel pool live) + failed: [] + the batch form + "NO subagents have been dispatched".
- The thin-args: 'too thin' matched — the CTX_FLOORS refusal before any LLM call.
- The read: MODULE_LOADED at offset 0 (the DCS-swallow fix).

### The theatrical ESCALATE's evidence (theatrical-fw-ct)
- The screenshot: the 3 armings (the claim-via-mock + the shim + the emulator reports) → the neutral read call threw '[TRIDENT THEATRICAL ESCALATE] repeated substitute-for-real suggestions (count 15)...' — the tool error, the throw-only enforcement LIVE. The later runs (the fresh sessions) confirmed the accumulated-count check's fix (the count 3 → the throw on the neutral call).

### The host's wave-verbatim evidence (the earlier deploys)
- The condensed dispatch: the tool error '[WAVE VERBATIM] the dispatched prompt is NOT the exact generated prompt for "fixture-a" — the SHA mismatch...'.
- The exact single of the 2-agent wave: the tool error '[WAVE BATCH] the wave for "fixture-a" has 2 agents — a SINGLE task dispatch is the derailment pattern...'.
- The legit jest.mock: NO demand — the code-unit exemption.

## THE ENDPOINT PROBES' DETAIL (the provider diagnosis)
- The minimal request: HTTP 200 in 2.105641s (the response id 814fe827...).
- The exact shadow-brain shape: HTTP 200 in 2.329323s (the response id b5817f80...).
- The streaming probe (2026-08-09): stream:true → the first byte in 1.009458s, the full 1.24MB in 42.145530s — the provider streams the tokens; the non-streaming request's first byte at 48.905152s (the old transport's buffering — the 45s window's kill geometry); the 3-concurrent non-streaming at 35.946248s/38.681707s/39.020183s (the queue — the bounded pool's why).

---

## THE FROZEN MACHINERY'S WHY-DETAIL (the full rationale per item)

- The generator-only baseline: the 15-deep recursion catastrophe — the direct spawns produced the empty shells + the re-triggered spawns; the batch form + the orchestrator's dispatch is the runtime's canonical subtask path.
- The loud-fail: the operator's law — the PI_LOOP_EMPTY returns the errorManifest ready:false with NO file + NO memory row; a fallback that fabricates "validated" prompts is the false-success class.
- The atomic seq: the TOCTOU race made N parallel pipelines collide on seq=1 — the UNIQUE constraint killed all but one — the empty prompts shipped.
- The 384K: the 8192 cap cut the model mid-bullet (the "- READ-" dangling bullet) — the deliverable's 15-30K tokens exceed any small cap.
- The [SHADOW INFERENCE]: the mechanical inference.text was the "assembled from the session stream" template — the operator's "that is the fucking point of this" — the model's own forward-map or nothing.
- The stall detector: the old code burned the full 240s × 4 rounds = 16 min per agent on a silent provider — the 45s fetch-fast-fail + the 90s ceiling.
- The session-keyed CT state: the global JSON's clobbering — the shark-clean-test state hijacked every session's container target.
- The [NO LAZY PROMPTS]: the operator's firewall re-enable — the thin prompts blocked with the wave-generator directive.
- The SSTF arming: the tool-output scan's false-positive loop — the "I'll treat them as noise" dismissal — the completed-message lexicon only.
- The wave-verbatim firewalls: the compression ban's mechanics — the SHA + the batch + the lines-gate.
- The question-ban: the operator's "remove the question tool from subagents" — the leaf nodes never ask.
- The t.e.a. preservation: the manifests + the prompt files survive for the verification + the promptFile channel.
- The throw-only theatrical: the operator's stream-purity ruling — the text.complete + the messages-transform wiring banned.

---

## THE 2026-08-14 STATE (the T.E.B. machine + the shadow-brain arc)

**THE TRUE DIST SHA: `4a90915827793f12ed3b7ffe11bc7d868a32badff9f69f922c0c2ff95ec30649` (16.17 MB, 435 modules — the T.E.B. machine). THE BATTERY: 434/434, tsc 0.** The trident-task tangent is UNDONE (the tool + its tests deleted); the batch form emits the NATIVE task tool with the promptFile-only payload; the T.E.B. loader hook (trident-hooks.ts:1741) mutates promptFile → prompt byte-exact + background:true in place.

**THE WIRING (the 5-part T.E.B. machine):**
1. wave-dispatch.ts — the batch = `{ description, promptFile, subagent_type }` ONLY (no prompt/placeholder/background).
2. wave-constants.ts — the same 3-field batch type.
3. trident-hooks.ts:1741 — the loader MUTATES the args in place (promptFile → prompt + background:true + strip).
4. trident-hooks.ts:1896 — the wave-verbatim simplified to the prompt-file-passed check.
5. trident-hooks.ts:2536 — the T.E.A. wipe DEFERRED to the full-wave dispatch.

**THE ACTIVE BUILD:** the SHADOW-BRAIN 3-FIX PLAN (D-40, APPROVED): F1 the measured stall window (a shadow-health sqlite store; the window = avg × 3, [45s, 5m]); F2 the backoff retry (2× + 3s gap, no switching); F3 the density memory (the tracker persists the args; <0.7 ratio warns). Implementation pending — the next session resumes here.

**THE HOST:** still runs the OLD dist (the user's terminal — the copy `dist/index.js → ~/.config/opencode/plugins/trident/dist/index.js` + restart is the deploy step).

---

## THE CHECKPOINT (2026-08-14 — TEB_MACHINE_3FIX_a8e99b06)

**THE CHECKPOINT PATH:** `Checkpoints/TEB_MACHINE_3FIX_a8e99b06_2026-08-14/` — the FULL preserved state: src (the complete tree), dist/index.js (sha `a8e99b06579490ff0d7c5487f635e4b944371dc67c185ed20ad34eb65ccb93b3` — verified in dist/sha256.txt), the canon docs (context_management/ — 9 docs), DEBUG_LOG_V6.md + BUILD_REPORT_V6.md, container-test-results.json (the 3-fix 3/3 PASS), dist-manifest.json, AGENTS.md, package.json.

**THE CHECKPOINT CONTENTS (the state it preserves):**
1. THE T.E.B. MACHINE — the promptFile-only batch (`{ description, promptFile, subagent_type }`), the loader hook's in-place mutation (promptFile → prompt byte-exact + background:true + strip), the deferred T.E.A. wipe, the simplified wave-verbatim.
2. THE SHADOW-BRAIN 3-FIX PLAN — F1 the measured stall window (shadow-health.ts), F2 the backoff retry, F3 the density memory (argSnapshot + the DENSITY WARNING).
3. THE VERIFICATION — 443/443, tsc 0, the container 3/3 (ct-3fix-full): the generation completes under the measured window (no knife-edge timeout), the DENSITY WARNING fires on the 42% re-gen, the backoff wiring live.

**THE RESTORE PATH (if ever needed):** copy the checkpoint's src/ back over the project src + dist/index.js → the project dist + rebuild if the source moved on. THE CURRENT LIVE STATE = the project's src/dist (a8e99b06) — the checkpoint is the preservation, the live tree is the truth.

---

## THE CHECKPOINT (2026-08-14 — FULL_STACK_c2061233 — the CURRENT)

**THE CHECKPOINT PATH:** `Checkpoints/FULL_STACK_c2061233_2026-08-14/` — the FULL preserved state at dist `c2061233`: src (the complete tree), dist/index.js (sha `c2061233...` — verified in dist/sha256.txt), the canon docs, the logs, the container results, the manifest, AGENTS.md, package.json.

**THE STATE IT PRESERVES (the full stack):**
1. THE T.E.B. MACHINE — the promptFile-only batch + the loader's in-place mutation + the deferred wipe + the simplified verbatim.
2. THE SHADOW-BRAIN 3-FIX PLAN — F1 the measured stall window, F2 the backoff retry, F3 the density memory.
3. THE WARHEAD 20 (THE ASCII-EXPLANATION LAW) — landed (disk + inline + bundle).
4. THE HOST VERIFICATION — the deployed dist c2061233 verified LIVE: the generate → the 3-field batch → the dispatch → the parentID lineage → the byte-exact injection (27179==27179) → the deferred wipe → the wave status → the subagent's independent forensic report (the emission contract confirmed at 607-629). The CT read verified against the CT_READ_BASELINE (byte-identical, the live offset/limit/monotonic/legacy-discipline all PASS).

**THE SUPERSEDED CHECKPOINT:** `Checkpoints/TEB_MACHINE_3FIX_a8e99b06_2026-08-14` (the pre-WARHEAD-20 state) — kept for the history, superseded by this one.

**THE RESTORE PATH:** copy the checkpoint's src back + dist/index.js → the project + rebuild if the live tree moves on. THE LIVE TREE = the truth (c2061233).

---

## THE CURRENT STATE (2026-08-14 — dist d752ab3a — the firewall disables)

**THE TRUE DIST SHA: `d752ab3a3b6b191a103c0ea4cc43c26499b16ef38e4684281ffc4b029d0ce3df`.** THE BATTERY: 441/441 (27 files — from src/tests directly; the Checkpoints copies inflate the recursive glob to 884/54, NOT a regression), tsc 0.

**THE DELTA FROM c2061233 (the host-deployed dist):** the two false-positive firewall disables:
1. THE CTX-01 CONFIG-LOCK DISABLED (ct-anti-derailment.ts) — the config-fumbling family removed (the false positives: tsconfig.json cp + the tee redirects); CTX-02..08 stay live.
2. THE SSTF VERIFY_INSPECT DISABLED (semantic-smoke-firewall.ts) — the block path dead (if false &&); INLINE_EXEC/HEADLESS/VERIFY_EXIST/HASH_AS_PROOF stay live.

**THE STACK (all prior layers preserved):** the T.E.B. machine (the promptFile-only batch + the loader mutation + the deferred wipe) + the shadow-brain 3-fix (F1 the measured window / F2 the backoff / F3 the density memory) + the WARHEAD 20 (the ASCII-EXPLANATION LAW).

**THE CHECKPOINT:** Checkpoints/FULL_STACK_c2061233_2026-08-14/ refreshed to d752ab3a (the src + dist + manifest updated). THE SHIP PACKAGE: SHIP_PACKAGE/ rebuilt at d752ab3a.

---

## THE CURRENT STATE (2026-08-15 — dist 0f14e9f5 — the RAM-bomb prevention)

**THE TRUE DIST SHA: `0f14e9f5bac5408f0a1428654d18a94edb8a30cf52bea1f4e0eacae8e0f767b6`.** THE BATTERY: 447/447 (28 files — the memory-gate pins), tsc 0.

**THE DELTA FROM d752ab3a:** the 3-layer RAM-bomb prevention: (A) WARHEAD 21 (THE MEMORY-EFFICIENT-DATA-RETRIEVAL LAW), (B) the MEMORY GATE (the bash tool.before blocks unsized inline reads), (C) the root-cause fix (15 unconditional debug writes → the gated+rotated hookDebugWrite helper). Full record: DEBUG_LOG_V6 M12 + BUILD_REPORT_V6 (the RAM-bomb section).

**THE STACK (the complete dist):** the T.E.B. machine + the shadow-brain 3-fix + the WARHEAD 20 (the ASCII-EXPLANATION) + the WARHEAD 21 (the MEMORY-EFFICIENT) + the firewall disables (CTX-01 + VERIFY_INSPECT) + the memory-gate prevention.

**THE SHIP PACKAGE:** SHIP_PACKAGE/ + Ship_Packages/SHIP_v4.4.2-wave-manager-async_0f14e9f5/ — both at 0f14e9f5. THE CHECKPOINT: Checkpoints/FULL_STACK_c2061233_2026-08-14/ refreshed to 0f14e9f5.

**THE REMAINING:** the host deploy (the old dist still runs), the engine-log gating (the rotation covers the hook-debug log), the queued #25, the other sessions' firewall-discrimination patches.

---

## THE CURRENT STATE (2026-08-15 — dist 90aec04f, 469/469, tsc 0)

**THE TRUE DIST SHA: `baaf776978b49506187016ff0adcca4ff956d5644ee76fbd67c47924bb5df432` (16.19 MB). THE BATTERY: 469/469 (29 files — the input-classifier + the memory pins), tsc 0. THE CONTAINER: postcomp-ct2 (the 7/7 forward iteration) + postcomp-ct3 (the #25 S2-S4 + the two bug fixes).**

**THE DELTA FROM 981a51b7 (the 2026-08-15 arc):**
1. THE ENGINE-LOG GATING (src/utils.ts tridentLog v3): the DEBUG writes gated behind TRIDENT_DEBUG=1 + the ~10MB rotation — the 81MB growth bounded. CONTAINER-VERIFIED (the log at 174540 bytes).
2. THE CTX-02 READ-VERB FIX (ct-anti-derailment.ts): stat added to the CT_READ_VERBS — the legit stat reads allowed. CONTAINER-VERIFIED.
3. THE SQLITE3 NON_READ FIX (memory-read-lexicon.ts): the unguarded-open frame tightened to the open( function-call form — the 'opencode' path-substring false positive dead. CONTAINER-VERIFIED.
4. THE T.E.B. INPUT CLASSIFIER (dispatch-input-lexicon.ts): the workspace-root + the token-shape lexicon (PATH/PROMPT/MIXED) + the PROMPTFILE_REMEDY_BULLET. CONTAINER-VERIFIED (S1).
5. THE #25 FIREWALL-INTELLIGENCE (the approved design): the simple remedy bullets (the [WAVE MANDATE]/[WAVE VERBATIM]/[WAVE BATCH] — 'a filepath and nothing else'), the partial-dispatch reconcile (the adopted = accepted + recorded, the missing named), the derive-from-manifest (the WaveRegistry.derivedFromManifest).
6. THE TWO CONTAINER-CAUGHT BUGS FIXED: the custom-waveId discriminator (findWaveRecordForAgent's content-aware wave-level shape — the alias waveIds no longer bypass the batch gate) + the recorded-status adopted-set (the reconcile bullet's split correct).
7. THE MPSE → THE EVIDENCE TRIAD RENAME (the trident triplet's collision with the operator's math system dead).
8. THE T.E.B. BIBLE: KNOWLEDGE_LIBRARY/Bibles/TEB_MACHINES_FOR_BEHAVIOR_ENGINEERING_T1.md (506 lines — the 5-part anatomy + the 6 machines + the replication recipes).

**THE CHECKPOINT:** Checkpoints/FULL_STACK_90aec04f_2026-08-15/ (src + dist sha-verified + the docs + the logs + the design). THE FOUR-WAY: the workspace + SHIP_PACKAGE + the checkpoint + the Ship_Packages at 90aec04f (ONE unique sha). THE DEPLOYED HOST: the operator's action (the container gates all clear).
