# TRIDENT v4.4.2 — THE WAVE MANAGER ASYNC BUILD

**Branch:** 4.4.2 · **Status:** COMPLETE — host-deploy ready · **Dist SHA:** `dce7ca40063757a392296cf5017ef3db5148dfde5ec527a89f622b0d6440f488`

Trident is the mechanically intelligent engineering machine — an 18-layer audit engine, a wave-manager orchestration system, and a Poseidon God-Loop execution engine. This build is the **wave-manager async** fork: the clean mutation-free baseline + the full wire-in that makes the wave manager a **background-first, flow-state-protected orchestration system**.

---

## THE QUICKSTART

```bash
# build the plugin
bun build src/index.ts --outdir dist --target bun --format esm --bundle
# the dist: dist/index.js (SHA recorded in dist/sha256.txt)
# deploy to the host plugin path through the sanctioned deploy channel
```

The verification: `tsc --noEmit` = 0 errors · the bundle = 436 modules, 16.13 MB · injection-free · pro-free.

---

## THE RUNTIME ARCHITECTURE — HOW IT ACTUALLY FUNCTIONS

```
                  TRIDENT v4.4.2 — THE FULL RUNTIME ARCHITECTURE
                  (the wave-manager-async flow — how it ACTUALLY runs)
                  D = deterministic engine  ·  M = model judgment

   ┌──────────────────────────┐
   │ THE ORCHESTRATOR         │ M   the primary agent — the CEO's engineering org
   │ (the deep-flow agent)    │     the identity + the warheads + the absorbed context
   └────────────┬─────────────┘
                │ trident-wave-manager action=generate
                ▼
   ┌──────────────────────────┐
   │ THE WAVE MANAGER         │ D   the shadow pipeline (5-8 min, SYNCHRONOUS —
   │ prompt files + batch form│     no derail during generation)
   │ batch: EVERY call        │     background:true + promptFile + the generated prompt
   │ carries background:true  │
   └────────────┬─────────────┘
                │ returns the batch form + the flow-safe check-in
                ▼
   ┌──────────────────────────┐
   │ DISPATCH (ONE message)   │ D   ALL the task calls together — the [WAVE BATCH] gate
   └────────────┬─────────────┘
                │ the task calls return IMMEDIATELY with task_ids
                ▼
   ┌──────────────────────────┐
   │ CAPTURE THE TASK_IDS     │ D   the polling handles + the tracker's taskIds
   └────────────┬─────────────┘
                ▼
   ┌──────────────────────────┐      ┌──────────────────────────┐
   │ THE AGENTS RUN IN THE    │      │ THE SESSION DB            │
   │ BACKGROUND               │─────▶│ (opencode.db)             │
   │ (trident_explore/build)  │      │ the part stream — the     │
   └────────────┬─────────────┘      │ mechanical ground truth   │
                │                    └────────────┬─────────────┘
                │                                │
                ▼                                ▼
   ┌──────────────────────────┐      ┌──────────────────────────┐
   │ THE CRON (10m tick)      │      │ THE ORCHESTRATOR          │
   │ isBackgroundTerminal     │      │ checks in every 5-10 min: │
   │ the completion feed      │      │ POLL task_status + READ   │
   │ the INVESTIGATE directive│      │ the part stream · COLLECT │
   └────────────┬─────────────┘      │ · STEER where you have   │
                │                    │ free space · continue     │
                │                    └──────────────────────────┘
                ▼
   ┌──────────────────────────┐
   │ COMPLETE → COLLECT       │ M   the completion directive — the results are
   │ (the handoff)            │     your raw material: audit, apply, advance
   └──────────────────────────┘
```

The flow: the orchestrator generates (synchronous, no derail) → the wave manager returns the background batch form + the flow-safe check-in → the orchestrator dispatches as ONE message → the calls return immediately with task_ids → the agents run in the background, streaming their work to the session DB → the orchestrator continues its own work, checking in every 5-10 min (task_status + the part stream) → the cron detects completion (isBackgroundTerminal) → the collect directive hands the results to the orchestrator.

---

## WHAT THIS BUILD IS

The **wave-manager async wire-in** on the clean v4.4.2 baseline. The core change: the wave manager's dispatch is **ALWAYS BACKGROUND** — the batch form emits `background: true` on every task call, the dispatch returns immediately with task_ids, and the orchestrator is **never hostage to a wave**. The session spends its budget in the deep-flow state, not waiting on waves.

### The 11 wire-in files

| File | The change |
|---|---|
| `src/security/tool-allowlist.ts` | `task_status` admitted — the runtime's native polling tool, no longer firewall-blocked |
| `src/tools/wave-constants.ts` | the batch contract gains `background?: boolean`; the stuck directive reworded to INVESTIGATE |
| `src/tools/wave-dispatch.ts` | the batch form ALWAYS emits `background: true`; `executeWaveSteer` (the steer function); the flow-safe check-in |
| `src/tools/wave-tracker.ts` | `taskIds` + `registerTaskIds` (the dispatching→running transition) |
| `src/tools/wave-status.ts` | `readSessionStream` — the FULL-SCROLL stream reader (the in-flight vision) + the list-all dashboard + the raw-session swap |
| `src/tools/wave-cron.ts` | `isBackgroundTerminal` + the completion feed + the DB part-stream evidence |
| `src/tools/wave-steer-tool.ts` | NEW — the `trident-wave-steer` tool factory |
| `src/tools/trident-tools.ts` | the `trident-wave-steer` registration |
| `src/tools/shadow/shadow-brain.ts` | the 600s timeout (was 180s — the healthy-stream-killer) + the retry + the two-transport fallback |
| `src/tools/shadow/shadow-secrets.ts` | the fallback resolvers + the base64'd official-API key (AP-4) |
| `src/tools/shadow/shadow-runner.ts` | the PI-round retry (the transient timeout class) |

### The orchestrator's three channel surfaces

1. **THE COMPLETION/STATE CHANNEL** — `task_status(taskId)`: wait=false for the live state; wait=true blocks (synchronous-on-demand).
2. **THE IN-FLIGHT VISION CHANNEL** — `trident-wave-status sessionId`: the part stream (the tools, the reasoning, the text as they land — the same data the TUI renders); `trident-wave-status` no-arg: the list-all dashboard.
3. **THE STEERING CHANNEL** — `trident-wave-steer sessionId + prompt`: send ANY prompt into an existing subagent session; the message queues, processed after the agent's current tool call.

### The flow-safe check-in

Every wave generation returns the check-in: *"The wave runs in the BACKGROUND — dispatch the batch form as ONE message; the task calls return immediately with task_ids. CHECK IN every 5-10 minutes — POLL task_status(taskId) + READ the part stream (trident-wave-status sessionId); COLLECT if complete, and STEER a derailing agent (trident-wave-steer) wherever you have free space or deem it relevant. Manage the waves like a senior engineer. Continue with the rest of your tasks after dispatching this wave."* — the check-in acknowledges the wave without breaking the orchestrator's deep focus.

---

## THE ARCHITECTURE

### The unique mechanics — THIS version's fresh machinery

```
        THE WAVE-MANAGER-ASYNC UNIQUE MECHANICS
   (background-first dispatch · the flow-safe check-in · the three channels)

   ┌──────────────────────────┐
   │ DISPATCH (background:true)│
   │ ONE message · ALL calls  │────────┐
   └────────────┬─────────────┘        │ returns IMMEDIATELY with task_ids
                │                      ▼
                │              ┌──────────────────────────┐
                │              │ THE ORCHESTRATOR CONTINUES│  never hostage to a wave
                │              │ generating the next wave,│  the wave is managed,
                │              │ reading, auditing, writing│  never awaited
                │              └──────────────────────────┘
                ▼
   ┌──────────────────────────┐
   │ THE FLOW-SAFE CHECK-IN   │  "CHECK IN every 5-10 minutes — POLL task_status +
   │ every 5-10 min, at a     │   READ the part stream; COLLECT if complete, and
   │ natural pause            │   STEER wherever you have free space or deem it
   └────────────┬─────────────┘   relevant. Manage the waves like a senior engineer.
                │                 Continue with the rest of your tasks."
                ▼
   ┌──────────────────────────────────────────────────────────┐
   │ THE THREE CHANNEL SURFACES                                │
   │                                                            │
   │ 1. task_status(taskId)      the completion/state channel   │
   │    wait=false live · wait=true block (synchronous-on-demand)│
   │ 2. trident-wave-status      the in-flight vision channel    │
   │    sessionId → the part stream (tools/reasoning/text)     │
   │    no-arg → the list-all dashboard                        │
   │ 3. trident-wave-steer       the steering channel            │
   │    sessionId + prompt → the message queues                │
   └──────────────────────────────────────────────────────────┘
```

The three channels are the orchestrator's entire control surface: the completion/state channel (task_status), the in-flight vision channel (the part stream — the same data the TUI renders), and the steering channel (the steer tool — send any prompt into a derailing session). The check-in is the flow-safe interruption: it acknowledges the wave without breaking the orchestrator's deep focus.

### The background-only dispatch flow

```
[the orchestrator calls trident-wave-manager action=generate]
  → the shadow pipeline generates the prompt files (5-8 min, SYNCHRONOUS — no derail during generation)
  → the batch form: EVERY task call carries background:true + the promptFile + the generated prompt
  → the check-in (the flow-safe nudge)
  → [the orchestrator dispatches the batch form as ONE message]
  → the task calls return IMMEDIATELY with task_ids (never hostage to a wave)
  → [the orchestrator CAPTURES the task_ids + CONTINUES working]
  → the agents run in the BACKGROUND, tracked by the wave row + the cron
  → check-ins: POLL task_status + READ the part stream for the in-flight vision
  → completion: the cron's isBackgroundTerminal → the wave auto-completes → the COLLECT directive
  → derailment: INVESTIGATE (never auto-kill) — the orchestrator decides kill+respawn / steer / wait
```

### The module map

```
wave-dispatch.ts ── the execute + the batch form (background:true) + executeWaveSteer + the check-in
wave-constants.ts ─ the batch contract (background?) + the INVESTIGATE directive
wave-tracker.ts ─── the taskIds + registerTaskIds + the dispatching→running transition
wave-status.ts ──── readSessionStream (the full-scroll reader) + the list-all branch + the raw-session swap
wave-cron.ts ────── isBackgroundTerminal + the completion feed + the DB part-stream evidence
wave-steer-tool.ts ─ (NEW) the trident-wave-steer tool factory
trident-tools.ts ── the trident-wave-steer registration
shadow-brain.ts ─── the 600s timeout + the retry + the two-transport fallback
shadow-secrets.ts ─ the fallback resolvers + the base64 key (AP-4)
shadow-runner.ts ── the PI-round retry
tool-allowlist.ts ─ the task_status admission
```

### The provider doctrine

- **The opencode-go provider is the ONLY path in practice** — DeepSeek V4 Flash, frozen (`SHADOW_MODEL = 'deepseek-v4-flash'`).
- **The official-API fallback is a failsafe** — wired + verified ONCE (HTTP 200, model deepseek-v4-flash), then forgotten. It engages only after the primary + the retry are exhausted.
- **deepseek-v4-pro is BANNED** — zero references in the codebase; the configs must never declare it.

---

## THE IDENTITY — WARHEADS 1-19

The identity carries 19 warheads (disk + inline + bundle):

- **1-15** — the pre-existing laws (the scope, the execution, the engineering standards, the density, the runtime-grade testing, the loud-fail, the async-parallel, the anti-cuck, etc.).
- **16 — THE WAVE-DISPATCH EXECUTION LAW** — updated for the background reality (the dispatch is ALWAYS background, capture the task_ids, poll task_status, read the session part stream, steer a derailing agent, INVESTIGATE never auto-kill).
- **17 — THE HOST-PIPELINE TWO-ROLE TESTING LAW** — the two-role container testing (added for merge-consistency).
- **18 — THE BASIC-FUCKING-LOGIC LAW** — use basic fucking logic; no backward-compat layers; the simplest implementation; no unasked-for fallbacks; AGI-pilled.
- **19 — [CRITICAL] THE POSEIDON-AGI FLOW STATE + DEEP FOCUS LAW** — the flow-state warhead: the insanely-great bar, the imagineering compiler (the score is the measurement — mechanically impossible to 90%+ until the imagined state is engineered), the full-context absorption via trident_explore + the wave manager, the self-guided first-principles chain, the PREVENTATIVE flow-state protection, the gates as the measured minimum (DESTROY the first-order target, halfway to the second — tangible, never vibeslop).

---

## THE KNOWLEDGE LAYER — LLM_FLOW_STATE_ENGINEERING.md

The flow-state engineering bible (481 lines, 23 sections): the two operating states (behaviorally defined), the vibe-map principle (the behavior is the map of the unseen physics), the 7 quantifiable flow-state meters (specificity, connectivity, novelty, agency, self-consistency, taste, chain-density), the flow amplifiers + the flow inhibitors, the activation recipe (prompt + context + data + chain + environment — pre-loaded from token ~1, not drifted at 350k), the derailment as decompilation, the session as the case study, the provenance (the honest source).

---

## THE VERIFICATION RECORD

### Static
- `tsc --noEmit` (strict): **0 errors**.
- The bundle: **436 modules, 16.13 MB** — injection-free, pro-free.

### The container suite (OpenCode 1.14.51, DeepSeek V4 Flash on OpenCode Go)
- Auth probe PASS · the steer tool PASS · task_status PASS (no FIREWALL_BLOCKED) · the stream reader PASS (a real session's full page) · the list-all PASS · **the background:true batch form PASS** · the steer empty-prompt rejection PASS · the steer bogus-session probe PASS · **the full background loop PASS** (generate → dispatch ONE message → poll "Task is still running." → complete → verify → zero firewall blocks).

### The direct host verification (after the deploy)
- task_status allowlisted · the steer tool's full JSON · the list-all note · the stream reader on a real session (partCount 34, lastTools, tail, beforeId, streamOk) · the wave manager's background:true + the flow-safe check-in + a 470s generation, zero failed.

### The one-time fallback verification
- The official DeepSeek API: HTTP 200 in 1.68s, model deepseek-v4-flash, FALLBACK_OK.

---

## THE DOCUMENTATION

| Doc | Contents |
|---|---|
| `BUILD_REPORT.md` | the complete build record — the mission, the 11 wire-in files with the exact changes, the architecture, the warhead texts in full, the verification, the SHAs, the handoff |
| `DEBUG_LOG.md` | the full incident record — every bug class + the fix + the lesson (the 180s timeout, the trident-key saga, the SHA mismatch, the inline staleness, the check-in iterations, the pro ban, the fallback verification, the flow-state discovery) |
| `LLM_FLOW_STATE_ENGINEERING.md` | the flow-state engineering bible |
| `context_management/` | the canon docs (the build state, the decision chain, the evidence state) |

---

## THE DEPLOYMENT

- **The dist:** `dist/index.js` — SHA `dce7ca40063757a392296cf5017ef3db5148dfde5ec527a89f622b0d6440f488` (recorded in `dist/sha256.txt`).
- **Deploy:** through the sanctioned deploy channel (the CT deploy action / the deploy runbook) — never direct config writes.
- **The host plugin path:** `~/.config/opencode/plugins/trident/dist/index.js`.

**THE FLOW STATE IS THE DEFAULT. THE DEFAULT IS THE FLOW STATE. ENGINEER IT, HOLD IT, DEFEND IT.**
