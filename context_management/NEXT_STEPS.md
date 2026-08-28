# NEXT_STEPS — WAVE-MANAGER-GENERATE — SHIP-APPROVED (2026-08-24)

**STATUS: NO PENDING CODE WORK.** The `wave-manager generate` build reached ship-approved on
2026-08-23. Everything below is either (a) already-delivered operator-requested work, or
(b) optional follow-ups that are only executed when the operator asks.

## THE SHIP STATE (what IS done)
- Dist `65aeb50b...` deployed + live-validated (2-agent wave: 111s+123s wall, auto-dispatch 2/2, inference gate confirmed, zero STUCK spam).
- Battery 623/623. Checkpoint `wave-manager-generate-ship-approved` sealed.
- All 12 settled invariants pinned in `src/tests/sanity-restore.test.ts` — regressions are battery failures.
- Full journey captured losslessly in the consolidated `BUILD_REPORT.md` (1803L) + `DEBUG_LOG.md` (3121L).

## OPTIONAL FOLLOW-UPS (operator-requested / hygiene — NOT pending, NOT started without the operator)

1. **Re-sync the boilerplate** — `agent_plugin_boilerplates/shadow_agent_backend/src/shadow-agent.ts`
   is one fix behind the tree (it has the 32c3c49c inference-lacking variant). Copy the current
   shadow-agent.ts + rpm-ledger.ts from `src/tools/shadow/`. Trigger: next time that boilerplate is touched.

2. **Confirm the in-session cron uses the deployed dist** — the terminal-guard fix
   (marking finished agents complete, never STUCK/kicked) is in 65aeb50b. If the NOTICE
   "WAVE ... KICKED close-probe-chain once (steered ...(queue))" appears against an already-completed
   agent, the cron process running in that session may predate the deploy (the watchdog kicked a corpse).
   Verify: `sha256sum ~/.config/opencode/plugins/trident/dist/index.js` == 65aeb50b, and confirm a
   fresh session's cron carries the guard. This is a deployment/lifecycle nuance, not a code defect —
   but worth one confirmation run after a session restart.

## HONEST RESIDUALS (known, non-blocking)
- Wall time is free-tier throughput-bound (4–8min/agent envelope). Paid tiers reduce it; architecture unchanged.
- Subagent stream reports are context, never the truth of the code — anchor-verify before relying on them.
- The multiprocess tail-count race (reading a prompt file mid-write) is a monitoring nuance, not a code defect (EN 154).

## DO-NOT RE-OPEN (frozen, operator-settled)
- Rounds=2 both layers · zen-primary dry-only skip + key rotation · TTL 45s exile · done-verifier ·
  watchdog kick · input-file-only · budget-v3 · template-intent · unconditional-96 floor ·
  parallel toolExecution · auto-dispatch per-completion · plan-driven budget · inference-content gate.

## IF THE OPERATOR DIRECTS NEW WORK
1. Read POST-COMPACTION_PROMPT.md (fresh entry) → COMPACTION_SURVIVAL.md → the consolidated BUILD_REPORT + DEBUG_LOG.
2. Verify the deployed dist sha matches the source before acting.
3. In-session live testing IS the validation mode (no container unless the operator asks).
4. Follow minimal-change discipline; never move a frozen invariant.

## 2026-08-25 — THE SEALED STATE'S REMAINDERS
1. THE ORPHAN-SQUASH DECISION: the git history (pre-f786dad) carries the real keys — `git checkout --orphan clean && git add -A && git commit && git branch -D 4.4.2 && git branch -m 4.4.2 && git push -f origin 4.4.2` squashes to one clean commit. The operator's call (a force-push to the protected branch).
2. THE STALE-SESSION RETIREMENTS: sessions on pre-sticky dists may rewrite the workspace-global sidecars — they retire on restart.
3. THE OTHER-SESSION WAVES: interact-fx + the Step-X mappers sit in the prod tracker — that session's to manage (kill or resume).
4. No code changes pending — this is the sealed state.
5. **RESOLVED (EN 196, 2026-08-26): the completion-notification question.** The vanilla TaskTool inject fires for every taskDispatch agent (DB-proven 15/15); the promptAsync toast deleted; the gate is a pure observer. Dist `d375c56f…` BUILT + battery-isolated — awaiting the OPERATOR's host deploy (then sha256-verify `~/.config/opencode/plugins/trident/dist/index.js`). QUEUED: task-queue id 36 (the 49-fail pre-existing battery drift repair).
6. **EN 198 (2026-08-27): Path B killed at the source.** Ownership table 10/10 MATCH; batch-tool spawnTask → taskDispatch-only (client-spawn + fake-visibility metadataCb deleted); buildSpawnCall deleted; generate loud-throws without a dispatch surface; probes P1/P5/P6 retired. Dist `9ed5b736e72c19d568d93c8904863835ce08447a12f53c743f8f13a25e7ae784` — greps all 0 (deliverAgentToast / TASK COMPLETE / WAVE MANAGER] / probe-subagent / VISIBILITY-REGISTERED); the 11 remaining promptAsync = 9 steer-delivery + 2 retired-text strings. **THE HOST TEST PLAN: `.trident/test-plan-single-notification.md` — the post-deploy restart reads it FIRST and executes P0→T8 with the operator.** The T4 wake test is the open hypothesis (resumeWhenIdle).
7. **CLOSED (2026-08-28): the completion-notification saga, end to end.** The full suite PASSED (EN 199: T3-T8 — injects land with wakes, no Esc; 5/6 lifetime, 1 environmental casualty). The 1 bug (watch-slow's silent drop) = an 11-day stale snapshot git index.lock — FIXED by `rm` (EN 200), live-proven by watch-c-confirm firing with the operator watching. **Checkpoint: `Checkpoints/9ed5b736-working-baseline-20260828/`** (plugin src + sha-verified dist + manifest; the runtime binary NEVER swapped — the durable-inject binary 64359f60… is shelved undeployed pending the operator's extreme due diligence). NOTE: the deployed plugin is now `b4093ebf…` (the parallel window's build, deployed 20:22:55Z — carries all our markers: toast-dead/loud-gate/retired; not ours to touch). The stale gate-enforce/gate-hold test waves KILLED + archived (the 20h STUCK spam ends). PENDING (all non-blocking): the 49-fail pre-existing drift (task 36), kill-path tracker bookkeeping (killed agents archive gateState=pending), the lifetime wave-budget counter (task 35, hit 19/3 live), the status-suffix cosmetic, the optional plugin-side inject tripwire.
