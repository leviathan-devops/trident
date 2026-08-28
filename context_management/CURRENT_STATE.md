# CURRENT_STATE — WAVE-MANAGER-GENERATE — SHIP-APPROVED-v2 + THE INTEGRITY LEXICON (2026-08-25)

**Status:** SHIP-APPROVED-v2, 0-trust-audited clean — the GO-primary chain, the complete live-proven control plane, and the return-integrity lexicon all sealed.
**Dist:** f41153fb9cb22d66b900a1db0fc99401875dc50d233224e23178142091be43b7 (18.60 MB, bun build) — deployed + container-verified.
**Battery:** 633 pass / 0 fail / 2,524 expect (39 files) · tsc clean on production files.
**Checkpoint:** `Checkpoints/wave-manager-generate-SHIP-APPROVED-v2/` — fully synced (src + dist + docs + logs).
**Git:** github.com/leviathan-devops/trident @ 4.4.2, HEAD `f786dad` — the public-repo key scrub applied (zero real keys in the tree; the history carries them pre-scrub — the orphan-squash pending the operator's call).
**Consolidated docs:** DEBUG_LOG.md (3,587L, EN 1-183) · BUILD_REPORT.md (1,858L, the v2 addendum).

---

## ONE-PARAGRAPH ORIENTATION

The wave-manager is the only subagent-dispatch path: the spec file (`.trident/wave-spec.json`, session-scoped to the codebase root) is the sole input; `action=generate` runs the shadow pipeline on the GO-primary chain (opencode-go/mimo-v2.5 PAID rung 1, only-if-dead fallbacks) and AUTO-DISPATCHES each agent the moment its prompt validates. The control plane is complete and live-proven: steer soft/hard (STEER-ONLY mode, the spillover gate), pause = pure interrupt, kill ×3 forms, resume-all with tracker state sync. The return-integrity lexicon closes the truncated-return class — `complete` means terminated, the `returnTruncated` flag means whole. The identity carries 23 warheads incl. [CRITICAL] W16 (the CTO orchestration law) + W22 (red-team-by-default).

## THE VERIFIED STATE (every row live-proven on deployed dists)

| System | Verdict | The proof |
|---|---|---|
| GO-primary generation | ✅ | 15/15 calls rung 1, zero fallbacks (104s/2 agents); 3-agent wave 114-188s |
| GO/ZEN env split | ✅ | the vendored provider reads OPENCODE_GO_API_KEY (its own slot); zen slot poisoned mid-run — GO unaffected |
| Subagent pins | ✅ | explore + build on opencode-go/muse-spark (high/xhigh) |
| steer soft/hard | ✅ | soft queues; hard aborts then delivers — both as the session's OWN agent |
| mode-spillover gate | ✅ | action=status + mode=hard → the [MODE] STEER-ONLY block (live in the container TUI) |
| pause | ✅ | session.abort ONLY, no chat message |
| kill (3 forms) | ✅ | session-scoped / agent+waveId / kill-wave — tracker row syncs on every path |
| resume (taskIds or ALL) | ✅ | delivered agent-correct + the row flips killed→running + un-archives |
| stream read | ✅ | wave-read / status sessionId — the part stream + live flag |
| return-integrity lexicon | ✅ | the live incident's exact string flags L-TRUNC-3; the no-misfire set clean; returnTruncated:false on a legitimate 8-section live report |
| telemetry honesty | ✅ | generationTelemetry {status:'generated', agentStatus:'dispatched'} — never read as run completion |
| session scoping | ✅ | workdir-anchored + the session-sticky cache; the stale globals purged |
| tracker isolation | ✅ | BUN_TEST auto-detection — the battery can never touch the prod DB |
| container verification | ✅ | lexicon-verify-ct: the deployed tool surface + the doctrine quoted verbatim by the container agent |

## PER-MODULE STATUS (the load-bearing anchors)

- **shadow-agent.ts** (~790L): the chain (opencode-go/mimo-v2.5 → zen×5 → nvidia → openrouter → inferx), the RPM ledger gate, the event-aware stall guard, the batch read/edit tools, thinkingLevel medium, the env-only key contract.
- **wave-dispatch.ts** (~1,590L): the spec-file generate flow, auto-dispatch, the full control plane (steer/pause/kill/resume + the mode-spillover gate), the session-sticky scope resolver (the cache), resume-all.
- **wave-status.ts** (~700L): THE RETURN-INTEGRITY LEXICON (the PatternFamily L-TRUNC-1..5, DANGLING_CONNECTIVE_LEXICON ~110 members, classifyReturnIntegrity state machine, the evidence triads) + abortSession + the status session branch (returnTruncated wired).
- **wave-read.ts** (~250L): the liveness instrument — the integrity fields + the tool-description law.
- **wave-tracker.ts** (~500L): markResumed/markKilled/findWaveBySession + the BUN_TEST auto-isolation + the env-gated clear.
- **definitions.ts**: the muse-spark pins.

## THE KNOWLEDGE LAYER (updated this session)

- **The skills**: hydra-orchestrator (wave-manager first-class + the telemetry guard) · deep-container-testing v2.0 (PART II: the host-live loop, the 33-row anti-pattern ledger) · warhead-writing (the chronology-pollution anti-pattern).
- **The boilerplate**: KNOWLEDGE_LIBRARY/agent_plugin_boilerplates/shadow_agent_backend — the working architecture, plug-and-play (zero embedded secrets).
- **The README** (github): the wave sections surgically rewritten to the v2 reality.

## HONEST GAPS (non-blocking)

1. The git HISTORY carries the real keys pre-scrub (`f786dad` is clean; `3101ca6`..`443525b` are not) — the orphan-squash force-push awaits the operator's call.
2. Other sessions still running pre-sticky dists may rewrite the workspace-global sidecars until they restart.
3. The wave-plan budget is count-based (WAVES: 16 currently) — raise the line per session as needed.

## NEXT (only operator-requested)

- No code changes pending — this is the sealed state.
- The remaining actions: the orphan-squash decision + the stale-session retirements.
