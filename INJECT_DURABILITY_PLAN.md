# INJECT DURABILITY PLAN — retry-until-landed (2026-08-27, operator-approved)

THE INCIDENT (DEBUG_LOG EN 200): watch-a-slow's completion inject died
silently — the one-shot ops.prompt hit a failing workspace snapshot (an
11-day-old stale git index.lock), Effect.ignore swallowed the failure, the
job still reported completed. The notification was lost with zero trace in
the inject path itself.

THE FIX (operator-approved design): injectDurable in fork task.ts —
attempt → verify-landed → loud-fail → capped-backoff → repeat, until the
part exists in the parent. The wake attaches to LANDED, not attempted.

## THE RAM-SAFETY CONTRACT (the operator's explicit requirement)

No open holes that can blow up RAM, ever:
1. The body string is built ONCE, outside the loop (no per-attempt rebuild).
2. A plain while-loop — no recursion, no accumulated arrays, no growing
   closures. The loop state is two numbers (attempt, delayMs).
3. THE PROBE IS TAIL-BOUNDED: sessions.messages({sessionID, limit: 50})
   scanned newest-first — NEVER a full-transcript scan, no matter how many
   attempts or how long the retry lives (the parent has 46,009+ parts; a
   full scan per attempt at 30s cadence would be the blow-up hole).
4. Backoff capped at 30s (2s → 4s → 8s → 16s → 30s → 30s …): bounded retry
   rate forever; each waiting cycle costs one bounded probe + one log line.
5. Fibers: one per pending inject, sleeping via interruptible Effect.sleep
   — dies cleanly with the instance scope (background/job.ts:187); no fiber
   leaks.
6. Logs are disk-bound lines; no in-memory buffering.
7. The undeliverable terminal: if the PARENT session itself is missing
   (deleted), retrying is pointless-forever — log ERROR once, return. Every
   OTHER failure retries forever (the notification is never dropped).

## THE MECHANICS (fork task.ts)

- backgroundMessage stays verbatim; key = body.slice(0,160) (contains
  description + task_id + state — unique per child+state).
- findLanded(key): messages({limit:50}) newest-first scan for a synthetic
  text part starting with key. Returns the message id or undefined.
- injectDurable(state, text):
    while(true):
      landed = findLanded(key)          # idempotency probe (bounded)
      if landed → continueIfIdle(landed) → return
      result = ops.prompt(noReply).pipe(Effect.either)   # never ignored
      if Right → verified = findLanded(key) (the WAKE attaches to landed)
              → continueIfIdle(verified ?? Right.id) → return
      log WARN "inject attempt N failed for <child>: <err>"
      if parent-missing → log ERROR once → return (undeliverable)
      Effect.sleep(delayMs); delayMs = min(delayMs*2, 30_000)
- Call sites :277 + :278-282: inject(...) → injectDurable(...); the outer
  Effect.ignore stays as the impossible-net only.
- Probe/write/get failures ALL count as attempts (either-ified) — nothing
  reaches the net silently.

## VERIFICATION

1. Unit (fork test dir, injected deps — probe/attempt/log/sleep stubs):
   (a) fail 3× then land → one part, 3 WARNs, wake once
   (b) write commits but throws → probe finds it → NO double post, wake once
   (c) never lands → still looping at attempt 20, WARN each, bounded probes
   (d) parent missing → ERROR once, terminal return
2. bun typecheck from packages/opencode (the fork's law).
3. Runtime binary rebuild + sha → operator deploys → live re-run of the
   exact incident recipe (file-writing agent, parent idle) + the adversarial
   stale-lock replay: recreate a lock mid-run, watch the WARNs, watch the
   inject land within seconds of the lock clearing.

## HONEST SCOPE

Tier 1 (this): in-process retry-forever — survives every observed failure
class. Tier 2 (not built; named gap): a disk journal for pending injects
would survive a runtime RESTART mid-retry; build only when a real incident
lands in that window.
