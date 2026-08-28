# THE COMPLETION NOTIFICATION PROBLEM — WHAT WE'RE TRYING TO DO, WHAT'S BROKEN, WHAT WE NEED

## THE CONTEXT

We run a wave-manager plugin for opencode that dispatches subagent "waves" — batches of build agents that work in parallel. The dispatch mechanism works correctly:

```
trident-wave-manager action=generate
  → generates prompts via a shadow-agent pipeline
  → auto-dispatches each agent via extra.taskDispatch({
      description: agentName,
      prompt: promptFileContent,
      subagent_type: 'trident_build' | 'trident_explore',
      background: true,
    })
  → the agents spawn as background tasks, work, and complete
```

The `background: true` flag is the key — it's the same mechanism the vanilla task tool uses for background dispatch.

## THE PROBLEM

When a background-dispatched agent completes its work, the ORCHESTRATOR (the primary session that dispatched it) needs to be notified so it can:
1. Read the agent's result
2. Audit it against the acceptance criteria
3. Update the build state / canon docs
4. Fire the next wave

The vanilla task tool already does this perfectly. When a background task completes, the runtime:
1. **Injects a synthetic part** into the orchestrator's session: `{type:"text", synthetic:true, text:"Background task completed: <name>\ntask_id: <id>\nstate: completed\n\n<task_result>..."}`
2. **Wakes the session** so the next generation sees the completion and acts on it

We observed these synthetic parts arriving in the orchestrator's session DB — the mechanism works. We SEE the "Background task completed" messages in our TUI.

## WHAT WE DID INSTEAD (AND WHY IT'S WRONG)

We couldn't figure out how to trigger the vanilla completion notification from the plugin side, so we built our own notification using `client.session.promptAsync()`:

```typescript
await client.session.promptAsync({
  path: { id: orchestratorSessionId },
  body: {
    agent: orchestratorAgent,
    parts: [{ type: 'text', text: '[WAVE MANAGER] agentName — TASK COMPLETE\nwave: waveId' }],
  },
});
```

This WORKS functionally — the orchestrator wakes up and sees the message. But it's wrong because:

1. **It renders as a chat message**, not as a notification — because `promptAsync` IS a prompt from the runtime's perspective
2. **It triggers a new generation turn**, which may interrupt or queue behind the orchestrator's current work
3. **It duplicates the vanilla mechanism** — if the runtime's bg-job completion already fires for our dispatched agents, we're double-notifying
4. **It's a hack around a surface we should be using properly**

## WHAT WE NEED TO FIGURE OUT

### Question 1: Does the runtime's vanilla bg-job completion notification already fire for agents dispatched via `extra.taskDispatch` with `background: true`?

We see synthetic "Background task completed" parts in the orchestrator session's DB, but we're not sure if:
- (a) These are from OUR dispatched agents (meaning the vanilla mechanism works and we should REMOVE our promptAsync toast), or
- (b) These are from OTHER vanilla task calls (manual `task` tool invocations by the orchestrator), and our auto-dispatched agents DON'T get the vanilla notification

### Question 2: If the vanilla mechanism DOES fire for our agents, why did we think it didn't?

We originally built the promptAsync toast because the orchestrator seemed to "not notice" completions. Possible explanations:
- The orchestrator was mid-generation and the synthetic part didn't wake it (the runtime's kick may only fire when the session is idle)
- The orchestrator DID see the completion but didn't act on it (a prompt/behavior issue, not a notification issue)
- The completion parts were arriving but the orchestrator's context was already too large to notice them

### Question 3: If the vanilla mechanism does NOT fire for `extra.taskDispatch` agents, how do we make it fire?

The `taskDispatch` function we call is the runtime's own task-spawn mechanism (exposed to plugins via `context.extra.taskDispatch`). It creates background tasks that show in the TUI. But maybe:
- The completion notification is only wired for tasks dispatched through the task TOOL (the model-facing tool call), not through the plugin's `extra.taskDispatch` path
- There's a flag or parameter we're missing that enables the completion callback
- There's a different API surface for registering a completion callback on a dispatched task

### Question 4: Is there a way to inject a synthetic part (not a prompt) into a session from the plugin side?

If the vanilla notification can't be triggered for our agents, the next-best fix is to inject the completion as a synthetic part (`synthetic: true`) rather than as a promptAsync message. The DB shows the runtime does this internally. Is there an API surface for it?

## WHAT WE'VE VERIFIED

1. **The synthetic parts exist in the DB** — `{type:"text", synthetic:true, text:"Background task completed: ..."}` in the orchestrator's session part stream
2. **Our promptAsync toast also works** — it delivers the message and wakes the orchestrator
3. **Both mechanisms are firing simultaneously** — which means either double-notification (if the vanilla mechanism covers our agents) or correct behavior (if it doesn't)
4. **The runtime's binary contains the synthetic injection code** — we found the strings in the compiled binary
5. **No plugin-facing API for synthetic injection exists in the documented surface** — the client API exposes `session.promptAsync`, `session.abort`, `session.create`, etc., but nothing like `session.injectPart` or `session.notifyCompletion`

## THE DESIRED END STATE

1. Agents dispatched via `extra.taskDispatch({background:true})` get the VANILLA completion notification (the synthetic part + the session kick) — no custom toast needed
2. If that's impossible, we inject a synthetic part (not a promptAsync message) — same visual as the vanilla notification
3. The completion notification fires ONLY ONCE per agent (no double-notification)

## OUR DISPATCH CODE (for reference)

```typescript
// wave-dispatch.ts — the auto-dispatch call
const dr = await opts.taskDispatch({
  description: spec.name,           // e.g. "tetris-builder"
  prompt: content,                   // the full generated prompt text
  subagent_type: resolveSubagentType(spec.template),  // 'trident_build' or 'trident_explore'
  background: true,
});
// dr = { sessionId: 'ses_...' }
```

The `taskDispatch` function comes from the plugin hook context: `context.extra.taskDispatch`. It's the runtime's own task-spawn surface, exposed to plugins.

## WHAT WE NEED FROM YOU

You solved the dispatch mechanism (getting `extra.taskDispatch` to work with background agents). We need you to figure out:

1. How the runtime's bg-job completion notification is wired — specifically, does it fire for tasks dispatched via `extra.taskDispatch`?
2. If not, how to make it fire — or how to replicate the synthetic-part injection from the plugin side
3. Whether there's a completion-callback or event surface on the dispatched task that we can subscribe to

The goal: the orchestrator gets the exact same "Background task completed" notification for our wave-dispatched agents as it gets for vanilla task-tool agents. No hacks, no promptAsync chat messages.

---

## THE ANSWER (2026-08-26 — RESOLVED, mechanically)

**Q1: Does the vanilla notification fire for `extra.taskDispatch` agents? YES — PROVEN.**
The opencode.db probe (read-only, LIMIT-bounded): 15 newest synthetic injects
`{type:"text",synthetic:true,"Background task completed: <name> | task_id: <child ses_> | state: completed | <task_result>"}` — ALL are wave-dispatched agents, in their dispatching orchestrator sessions: calc-builder (wave-1787720204493, this session), util-builder, machine-surgery/gate-strategies/evidence-persistence/gate-core (the gold-standard session), b4-verify-update/b5-hunter-rewire/b6-batchb-layers/s4-runner/s5-battery/a5-rewire (the parallel session). Mechanism: `taskDispatch` → `makeTaskDispatch` → `TaskTool.execute({background:true})` (task.ts byte-identical to vanilla) → the background branch's `inject` = the synthetic part (noReply:true) + `resumeWhenIdle` → ops.loop. Same function, same inject, both paths.

**Q2: Why did we think it didn't?** Behavioral + detection gaps, never a missing inject: the pre-entry-190 cron never detected auto-dispatched completions (no taskIds), and the orchestrator's misses were mid-generation queuing / not-acting. The toast papered over it.

**Q3: How to make it fire?** Nothing to make — it always fired. (Preconditions for anyone re-verifying: `background: true` passed through, real promptOps on the fork, child actually finishing.)

**Q4: Plugin-side synthetic inject API?** None documented — and none needed: the vanilla inject IS the notification for taskDispatch agents.

**THE FIX LANDED (2026-08-26):** `deliverAgentToast` DELETED from wave-cron.ts (function + 4 call sites; 87-line surgical diff). `routeCompletionGate` is a pure observer (bookkeeping + remediation steer; NEVER promptAsync on the owner session). Single notification per agent = the vanilla inject. Gate verdicts surface via the inject's task_result + status polls. One nuance documented: the inject fires at child terminal — a gate-HOLD remediation round continues the session AFTER the inject; the final post-remediation state surfaces via the orchestrator's polls (the W16 rhythm), not a second notification.

**Evidence:** DEBUG_LOG ENTRY 196; dist `d375c56f…`; completion-gate-enforcement 34/0 + script suite 23/0; the three-way battery isolation (49 pre-existing fails proven unrelated — the drift repair is queued separately).

---

## THE LIVE-PROBE ADDENDUM (2026-08-27 — EN 197): the surface qualifier

The live probe (nb-notifier) returned a NUANCE the DB history could not show: **the vanilla inject covers FORK-SURFACE dispatches only.** The card matrix is now canonical: every inject in the DB correlates 1:1 with a `tool:"task"` card part (the fork's `createLiveToolPart` → `TaskTool.execute({background:true})` → `BackgroundJob` → completion inject). A client-side spawn (create + promptAsync — used by non-fork runtime instances) produces a real child with parentID, NO card, NO BackgroundJob, **NO inject** — its only completion signal is the cron's reminders (which fired correctly: the tier-1 "WAVE … COMPLETE" rode the orchestrator's tool result).

Implications: (1) the toast deletion stays correct — the fork path (the sanctioned path) has the inject; the client path has the reminders; NEITHER needs the chat-shaped promptAsync double-kick. (2) The generate's silent-skip when `extra.taskDispatch` is missing was a phantom-wave generator — now LOUD (EN 197): the result, title, checkIn, and telemetry all scream NOT DISPATCHED + the re-fire remedy. (3) Fire waves only from fork-runtime sessions (`.npm-global` opencode); the `/usr/local` install is vanilla (no dispatch surface — zero fork strings in the binary).
