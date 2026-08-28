# COMPACTION SURVIVAL — THE WAVE GENERATOR ASYNC OVERHAUL

## STATE AT A GLANCE

The wave-generator async overhaul is COMPLETE and VALIDATED. Dist `e24adec3`,
battery 592/0/2347. 8-agent natural-prompt waves complete in ~5–8 min (from 27).
All mechanical bottlenecks fixed: RPM ledger, zen key pool ×5, batch law warheads,
done-verifier self-healing, slow-lane router removed, action inference, coercion
engine, count contract, planning gate, retry pass. Container ct-ledger-forge
validated with Muse Spark orchestrator.

## OPERATING LAWS

- BATCH EVERYTHING BY DEFAULT — only sequential what tangibly needs it
- REASONING EFFORT MEDIUM on all providers — never disable reasoning entirely
- NO blind timeouts that kill successful generations — event-aware stall guard only
- MODEL IS NEVER THE PROBLEM — if calls fail, check YOUR wiring first
- NVIDIA HAS NO DAILY QUOTA — never blame permanent provider limits
- ESBUILD IS FORBIDDEN — Bun only for builds
- LOUD FAIL OR CLEAR PASS — no silent degradation, no fake fallbacks
- Minimal change discipline — touch only what the fix requires

## SETTLED DOCTRINE

- Chain order: zen primary → nvidia → openrouter → inferx (SETTLED, do not re-order)
- RPM ledger with TTL exile replaces permanent Sets (SETTLED, proven)
- toolExecution: 'parallel' (pi default; 'sequential' breaks batching)
- MAX_ROUNDS=3, MIN_MANDATORY=2 (agents self-stop at R2 via validated-break)
- agentsJson is PRIMARY input channel (models drop array entries in structured form)
- Zen key pool cycles before ANY fallback provider is used
- Planning gate fires once per session, not per-generate

## DOC MAP

| Doc | Lines | Contains |
|---|---|---|
| CURRENT_STATE.md | ~180 | Per-module status, architecture, proven machinery |
| NEXT_STEPS.md | ~200 | Remaining work + ship approval path |
| POST-COMPACTION_PROMPT.md | ~120 | Fresh agent entry sequence |
| BUILD_STATE.md | ~276 | Checkpoint tree, SHA chain, module inventory |
| DECISION_CHAIN.md | ~200 | Operator rulings verbatim |
| EVIDENCE_STATE.md | ~200 | Container evidence, SHAs, behavioral tokens |
| CHANGELOG.md | ~888 | Full session log entries 146–149 |
| TASK_QUEUE.md | varies | Live task queue |

## FRESH-AGENT ENTRY RULES

1. Read `context_management/CURRENT_STATE.md` — per-module status
2. Read `context_management/NEXT_STEPS.md` — remaining work
3. Read `context_management/DECISION_CHAIN.md` — settled doctrine (do not re-litigate)
4. Read `Checkpoints/full-wave-generator-async-VALIDATED-pending-ship-approval/CHECKPOINT.md`
5. Run `cd src && bun test` to verify battery (expect 592 pass / 0 fail)

Then EXECUTE whatever the operator directs. Do NOT re-litigate settled doctrine.
Do NOT re-open proven machinery. Do NOT ask questions the docs answer.

## KEY FILE ANCHORS

- `src/tools/shadow/shadow-agent.ts` — ShadowAgent class (~740 lines): chainedStream,
  done-verifier, zen key pool, round loop, force-bound batch tools
- `src/tools/shadow/rpm-ledger.ts` — RpmLedger class (~242 lines): token bucket,
  TTL exile, observation rings
- `src/tools/wave-dispatch.ts` — executeWaveDispatch (~1086 lines): bounded pool,
  stagger, planning gate, retry pass, ledger injection
- `src/tools/wave-pipeline.ts` — normalizeAgents (coercion engine), validateWaveCount,
  validatePipelineAgent (floor steering)
- `vendor/pi/ai/src/providers/data/*.json` — provider catalogs with reasoning compat

## SETTLED DOCTRINE (each ruling verbatim + why)

1. "BATCH EVERYTHING BY DEFAULT" — models that emit one tool call per turn waste LLM
   round-trips. pi's agent-loop natively executes N tool calls from one assistant message.
   Teaching the model to batch + setting toolExecution:'parallel' collapsed wall time from
   27 min to ~5 min per wave.

2. "REASONING EFFORT MEDIUM" — full-depth thinking floods free-tier endpoints with
   thinking_delta events (10K+ events per call). Medium effort via per-provider API
   shapes (kwargs budget for nvidia, effort param for zen/openrouter) caps thinking
   without disabling it entirely. Never set enable_thinking:false.

3. "NVIDIA HAS NO DAILY QUOTA" — nvidia integrate.api.nvidia.com serves nemotron-free
   without daily caps. RPM limits (40/min) reset every 60s. The tenant quota error
   (tn-ikt79rsv30) is a burst-rate limit, not a permanent cap.

4. "MODEL IS NEVER THE PROBLEM" — if calls fail, check YOUR wiring first. Capture-server
   probes verify what actually goes out on the wire. Config presence ≠ wire presence.

5. "ESBUILD IS FORBIDDEN" — Bun only for builds. `bun build src/index.ts --outdir dist
   --target bun --format esm --bundle --external=effect`.

6. "NO BLIND TIMEOUTS THAT KILL A SUCCESSFUL GEN" — event-aware stall guard fires only
   on NO-EVENT windows (60s). Live generations emit continuously and are never killed.

7. ZEN KEY POOL — five API keys rotate on opencode/nemotron-3.5-lightning-free before
   any fallback provider is used. process.env.OPENCODE_API_KEY is set per-call from
   ZEN_KEYS[zenKeyIndex % ZEN_KEYS.length] in chainedStream. A 429 advances zenKeyIndex.

## FROZEN MACHINERY (do NOT re-open)

- Chain order: zen → nvidia → openrouter → inferx
- RPM ledger TTL exile (EXILE_MS = 45_000)
- Done-verifier in chainedStream (degenerate done detection)
- toolExecution: 'parallel' (pi default)
- MAX_ROUNDS = 2, MIN_MANDATORY_ROUNDS = 2
- [FILL:] colon-form validator regex
- Coercion engine in normalizeAgents

## KEY FILE ANCHORS

| File | Lines | Key sections |
|---|---|---|
| src/tools/shadow/shadow-agent.ts | ~750 | chainedStream :330–500, nativeTools :260–300, round loop :540–650 |
| src/tools/shadow/rpm-ledger.ts | ~242 | admission :155, acquire :170, record429 :195, snapshot :210 |
| src/tools/wave-dispatch.ts | ~1100 | executeWaveDispatch :320, planning gate :340, bounded pool :520, auto-dispatch :530, retry pass :555, WAVE SUMMARY :570 |
| src/tools/wave-pipeline.ts | ~473 | normalizeAgents :84, coerceContextValue :60, validateWaveCount :175 |
| src/tools/wave-planning-gate.ts | ~120 | enforceWavePlanning, decidePlanning |
| src/tools/wave-spec.ts | ~180 | template shell, validateSpecFile, formatDiagnostics |
| vendor/pi/ai/src/providers/data/*.json | 3 files | reasoning budget compat shapes |

## DEPLOY CHECKLIST (F-75: always dual-path)

1. `bun build src/index.ts --outdir dist --target bun --format esm --bundle --external=effect`
2. `sha256sum dist/index.js`
3. Deploy to container: trident-container-test action=deploy
4. ALWAYS: `cp /root/OPENCODE_WORKSPACE/dist/index.js /root/.config/opencode/plugins/trident/dist/index.js`
5. Restart TUI: trident-container-test action=restart restartAgent=true
6. Switch orchestrator model: action=switch-model modelName='muse spark 1.2' provider='opencode'
7. Verify status bar shows correct model+provider
