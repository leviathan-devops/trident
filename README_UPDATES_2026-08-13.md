# README UPDATES — TRIDENT v4.4.2 (2026-08-13) — THE FULL ENHANCEMENT RECORD

> This file is the dense source for the GitHub README update on the 4.4.2 branch.
> Everything below reflects the deployed state (dist b2ed69d8) — the one-tool
> wave manager, the sqlite tracker, the compact context, the dispatch-authorization
> fix, and all the 2026-08-12/13 rulings.

## 1. THE HEADLINE (the new top section)

### THE ONE-TOOL WAVE MANAGER (2026-08-13)
Trident's wave management is now **ONE tool — `trident-wave-manager`** — with **all**
the actions. The old `trident-wave-status` and `trident-wave-steer` are **removed
entirely** (the clean break — no backward compatibility). The model navigates with
**two in-memory vars per wave** — the **wave hash** (the id, e.g.
`wave-host-full-1786637477755`) and the **alias token** (e.g. `host-full`) — and
everything else (the per-agent states, the tails, the ETA) is **retrieved on demand**
through the tool, so the model context is never bloated.

**The actions:**
```
generate      the shadow pipeline → the prompt files + the manifest + the registry + the batch form
              (returns the COMPACT two-line check-in — the anti-derailment design)
status        the per-wave/per-agent summary — the COMPACT default (wave + alias + projectToken
              + per-agent one-liners: name/state/sessionId/taskId/lastActivity);
              the full tails/parts/error-codes behind verbose:true
kill          the DESTRUCTIVE abort of ONE agent (the runtime abort + the tracker mark + the directive)
kill-wave     the DESTRUCTIVE abort of ALL + the archive
steer         the queue/interrupt into a live session
pause         the NON-DESTRUCTIVE interrupt (the double-esc equivalent): the steer-interrupt
              when the runtime exposes it, else the abort + the 'paused' tracker state + the resume path
resume        the interrupted-session continuation (task_ids)
release       the dispatch-authorization reset (the alias-resolving safety valve)
```

### THE SQLITE TRACKER (the multi-session hardening)
The wave tracker persists to `trident-waves.sqlite` (in the shared trident-tmp) with:
**WAL + busy_timeout 5000** (the canonical multi-process pair) + **row-keyed upserts**
(each process upserts ITS wave's row — no whole-file clobber) + **the write-retry**
(3 attempts — the busy timeout is a bounded wait, never a silent write loss) +
**the cached health-checked handle** + **the schema-setup retry** + **the stale-row
prune** (24h — the anti-slop). Each parallel TUI session is its own process with
its own plugin + its own tracker instance — all writing the same sqlite — the
SQLite writer lock serializes, and every session sees every wave (the multi-wave
per-session context with individual agent manageability). **Container-proven: two
concurrent processes → both rows survive.**

### THE WAVE-LEVEL LIFE (the key changes this session)
- **The dispatch-authorization fix** (BUGREPORT_wave-manager-dispatch-authorization.md):
  the [WAVE BATCH] gate's authorization is now a **transactional state machine** —
  a runtime-rejected dispatch is RE-FIREABLE (never consumed); a confirmed dispatch
  blocks re-fires; the release action resets a stuck wave by alias.
- **The named wave ids**: `wave-<sanitized-alias>-<epoch>` — the operator's alias
  token rides IN the id (e.g. `waveId=host-full` → `wave-host-full-1786637477755`)
  — the distinguishable context token, never hash slop.
- **The honest manifest**: `status:"ready"` + `generatedAt`/`generationMs` — the
  shadow-generation timings are never dressed as agent-run telemetry.
- **The compact context**: the two-line check-in + the compact status default —
  the anti-derailment + the anti-context-bloat.

## 2. THE QUICKSTART (the wave workflow)

```
1. GENERATE:   trident-wave-manager (agents=[...] waveId=<alias> projectToken=<project>)
               → WAVE wave-<alias>-<epoch> (N agents) READY — DISPATCH the batch form as
                 ONE message. Track via action=status waveId=<id>.
2. DISPATCH:   the batch form's task calls as ONE message (background:true) — the
               task_ids return immediately.
3. TRACK:      action=status waveId=<id> → the COMPACT summary (the wave + the alias +
               the projectToken + the per-agent one-liners).
4. MANAGE:     kill <agent> (destructive) | kill-wave (all) | steer <sessionId> <prompt>
               | pause (non-destructive) | resume <taskIds> | release (reset the auth).
```

## 3. THE CHANGE LOG (the 2026-08-12/13 session)

### 2026-08-12 — THE DISPATCH-AUTHORIZATION TRANSACTIONAL FIX
- The registry state machine (src/tools/wave-registry.ts): per-call
  recorded→accepted|failed; wave-level ready→dispatching→dispatched; the gate
  blocks ONLY accepted/in-flight/derailment; a failed/stale-recorded call is
  re-fireable; the tool.after hook confirms the runtime's acceptance/rejection.
- The honest manifest (status ready + generatedAt/generationMs) + the shrunk batch
  form (the placeholder + the promptFile channel — the 168KB truncation fix) +
  the release action (the alias-resolving safety valve).
- The unit battery 21/21 (the exact bug + 10 variations) + the container 8/8.

### 2026-08-13 — THE RULINGS + THE SELF-HEAL + THE CONTROL SURFACE
- THE RULINGS: the generation pool 15 (a cap — splice(0,15)), the shadow retries
  up-to-3 (the same backoff — never exponential), the timeout 15m, the
  stuck-detector directive IDs (the real agent name + the session/task ids), the
  v4-flash pin on BOTH providers (the fallback was deepseek-chat — the pin ruling).
- THE MAIN-SESSION SELF-HEAL (src/tools/main-session-heal.ts): the dropped-generation
  detector (the incompletion lexicon + the END-SIGNAL finalized check — a streaming
  text is never finalized, the phantom-kick fix) + the minimal "continue" kick via
  the TUI input + the 10m cooldown. The multi-session anchor (the session.created
  tether + the stick-once — each process heals ITS OWN session).
- THE PRUNE SORT FIX (found by the host): the WAVE-RECORD PRUNE's over-cap removed
  the NEWEST records; the ascending sort keeps the newest + removes the oldest.
- THE ONE-TOOL CONSOLIDATION (this update's headline — see §1).
- THE SQLITE TRACKER (see §1) + the evidence-db WAL/busy-timeout (the db-lock fix).

### THE VERIFICATION STATE
- Unit suite **410/410**, tsc 0, container-verified (the exact-bug cycle, the
  self-heal loops, the prune-direct, the multi-process collision, the one-tool
  actions, the clean break), host-verified (the exact-bug cycle, the anchor, the
  re-fire protection, the prune survival, the release-by-alias, the named ids).
- The host runs b2ed69d8 (the full one-tool stack).
