# POST-COMPACTION PROMPT — THE WAVE GENERATOR — SHIP-APPROVED STATE

## THE MISSION

You are continuing the trident plugin's wave-generator build at its **SHIP-APPROVED** state.
The `wave-manager generate` action — the headless shadow-agent backend that composes
subagent dispatch prompts via a concurrent multi-provider LLM chain and auto-dispatches per
completion — is COMPLETE, live-validated, and sealed. Your mission: whatever the operator
directs next. There is NO pending cleanup. Do not re-open settled machinery.

## WORKSPACE ROOT

/home/leviathan/OPENCODE_WORKSPACE/Shared Workspace Context/Trident_Agent/Active_Projects/v4.4.2-wave-manager-async

## READING ORDER (read ALL for context BEFORE acting)

1. `context_management/COMPACTION_SURVIVAL.md` — operating laws + settled doctrine + doc map. READ FIRST.
2. `BUILD_REPORT.md` — THE CONSOLIDATED full build journey (1803 lines, V3→ship, nothing omitted).
3. `DEBUG_LOG.md` — THE CONSOLIDATED full debug record (3121 lines, every bug→root cause→fix→verification, entries 1–154 + the prior eras).
4. `context_management/CURRENT_STATE.md` — per-module status with file:line anchors.
5. `context_management/NEXT_STEPS.md` — queued work (none pending at ship; only operator-requested follow-ups).
6. `context_management/DECISION_CHAIN.md` — operator rulings VERBATIM. NEVER re-litigate.
7. `Checkpoints/wave-manager-generate-ship-approved/CHECKPOINT_MANIFEST.md` — the SEALED ship state, all 12 settled invariants, honest gaps.

## VERIFIED SHIP STATE

- **Dist:** `65aeb50b8aad4a609c528ca0bc59fcd58e5d9aba661ca49574601bab8b0f033e` (18.55 MB, bun build) — DEPLOYED + LIVE-VALIDATED.
- **Battery:** 623 pass / 0 fail / 39 files.
- **Live validation (wave-1787527789837):** 2-agent wave → 111s + 123s wall (inside the 4–8min envelope), auto-dispatch 2/2 with real sessionIds, inference-content gate confirmed (both prompts ≥2100c after the final marker), zero STUCK spam.
- **Checkpoint:** `Checkpoints/wave-manager-generate-ship-approved/` — SEALED (chattr +i).
- **Status: SHIP-APPROVED** by the operator 2026-08-23.

### THE 12 SETTLED INVARIANTS (pinned by src/tests/sanity-restore.test.ts — regressions are BATTERY FAILURES)
1. **Rounds = 2 EVERYWHERE** (PI_MAX_ROUNDS=2 runner :105, MAX_ROUNDS=2 + MIN_MANDATORY=2 agent :87-88).
2. **ZERO slowlane** — no code/labels/comments; chain label '(opencode/zen×5 → nvidia → openrouter → inferx, ledger-gated, key-pooled)'.
3. **Zen primary ×5 keys, dry-only skip** — primary runs except on hard 'dry'; key rotation (zenKeyIndex++) on 429; EXILE_MS=45_000 TTL (time-based, never permanent).
4. **Watchdog READ-AND-KICK** — wave-cron terminal-guard (finished agents marked complete, never STUCK) + exactly-once steer-kick (kickedAt/kickCount) + one escalation window before kill.
5. **Input file ONLY** — .trident/wave-spec.json is the generate action's only model-reachable input; all inline roster params deleted; template shell on disk; compiler diagnostics; reset-to-template after success.
6. **Auto-dispatch per completed agent** — taskDispatch in runOne, background:true, correct type resolution, DPL1 gate, sessionIds propagate into the result + check-in.
7. **Budget-v3** — checkWavePlanning PURE (refuses without writing); recordWaveServed ticks ONLY on real dispatch; refusals burn zero waves.
8. **Template mismatch IMPOSSIBLE** — template-intent PatternFamily + state machine in validateSpecFile, refused before generation.
9. **Inference-content gate** — validateFinalText requires ≥100c after the LAST [SHADOW INFERENCE] marker; W4 demand states the bar verbatim ×2.
10. **Floor sanity** — enforcement floor unconditional 96; research verification forms first-class; generation reference 125.
11. **Planning gate v2** — budget from the written plan (.trident/wave-plan.md, WAVES: N); no plan = refused; exhausted = edit the plan.
12. **Parallel everything except LLM rounds** — toolExecution 'parallel', bounded pool with 1–3s stagger, done-verifier routing degenerate dones, retry pass.

## CRITICAL DOCTRINE (operator rulings VERBATIM — canon, never re-litigate)

- "BATCH EVERYTHING BY DEFAULT... only do sequentially what actually tangibly NEEDS to be sequential"
- "THE ROUNDS are enforced as sequential revisions loops to clean up any mess from batching"
- "2 rounds only. we fixed this already"
- "inputFile only"
- "no slowlane bullshit"
- "5 zen key primary cycler then fallback w/ smart time based exile"
- "auto dispatch as generations complete"
- "wave manager read and kick don't sit here doing nothing"
- "NO STATIC TIMEOUTS"
- "REASONING EFFORT MEDIUM" — never disable reasoning
- "MODEL IS NEVER THE PROBLEM" / "NVIDIA HAS NO FUCKING DAILY QUOTA"
- "ESBUILD IS FORBIDDEN WE ONLY BUILD WITH BUN"
- "in session testing only — no container unless operator asks"
- "NEVER use the raw task tool for subagents — only the wave manager" (SPEC_FILE is the only input; subagents dispatch via the wave-manager)

## OPERATING RULES (current build phase)

- In-session live testing IS the validation (the operator deploys the dist, we fire the real tool in THIS session — no container unless explicitly requested).
- When the operator deploys a new dist, verify `sha256sum ~/.config/opencode/plugins/trident/dist/index.js` matches the built artifact.
- Budget-v3: refusals burn zero waves; waves tick only on actual dispatch. A refused spec = fix the fields, re-fire — no budget lost.
- Bun only builds. Minimal change discipline. Never re-open a frozen invariant.
- The consolidated BUILD_REPORT.md + DEBUG_LOG.md are APPEND-ONLY from here — new work appends entries, never rewrites the journey.

## DO NOTs

- DO NOT re-recite the fixed layers (rounds, slowlane, zen exile, watchdog, input-file, budget, template-intent, inference gate) — they are SEALED and battery-pinned.
- DO NOT change chain order, EXILE_MS, done-verifier, or toolExecution to any earlier era.
- DO NOT remove the sanity-restore pins.
- DO NOT report a wave "worked" without the in-session evidence (sessionIds, wall time, AUTO-DISPATCHED lines, inference tails ≥100c).

## FIRST ACTION (fresh-session entry check)

Read COMPACTION_SURVIVAL.md then give a 5-line state summary proving you read the docs:
(1) current dist SHA, (2) battery count, (3) the 3 cardinal rules the operator re-gave under sanity-restore
   (rounds=2 / input-file / zen-primary×5 no-slowlane), (4) the ship checkpoint name, (5) the current validation mode (in-session).
Then EXECUTE whatever the operator directs.
