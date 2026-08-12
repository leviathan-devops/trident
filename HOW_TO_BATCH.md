# THE BATCH PROCESS — THE TRIDENT EXECUTION WAVE (THE DEFINITIVE HOW-TO)

**Status: THE FIRST-CLASS EXECUTION PROCESS OF TRIDENT — 2026-08-10, mechanically verified live (the 21-grep batch).**
**The naming (LOCKED — never call this a tool):**
- **A BATCH** = the unit: ONE assistant message carrying 2-25 tool calls (the runtime's `ToolPart`s).
- **THE BATCH PROCESS** = the mechanism: the runtime's tool loop executes ALL parts of the message in ONE pass, concurrently; all results return together.
- **THE WAVE PIPELINE** = the sequence: batches chained by dependencies to complete a milestone.
- The verb: **BATCH** ("batch the calls", "fire a batch"). NEVER "the batch tool" — there is no batch tool.

---

## PART 1 — THE MECHANICS (what actually happens in code)

### 1.1 The message is the unit of execution, not the tool call
The runtime's agent loop processes an assistant message's tool parts as ONE unit before returning to the model. A message with 21 grep calls = 21 `ToolPart`s in ONE `parts[]` array. The loop executes every part's tool in a single pass — per part: `tool.execute.before` hooks → the tool's `execute` → `tool.execute.after` hooks → the result written into the part's `state.output`. All parts complete before the next model turn; all results return together.

### 1.2 THE EXACT PROCESS (verified 2026-08-10 — 21 parallel greps in one message)
1. The agent emits ONE assistant message whose `parts[]` carries N tool-call objects (N = 2-25). Each part: `{ type: "tool", tool, callID, args }`.
2. The runtime's message pipeline assigns each part its IDs (`part.id`, `sessionID`, `messageID`) and persists the message.
3. The runtime's tool loop iterates the message's parts — for EACH part: the tool.before hook chain (all plugins, the SAME args object — mutations visible), the tool's registered execute, the tool.after hook chain, the result → the part's state.
4. ALL N parts complete in that pass. The results ride the parts' `state.output` back into the agent's next turn.

### 1.3 The limits
- **2 to 25 tool calls per batch** (the runtime's hard ceiling — 25).
- **ANY mix of tools**: reads + greps + bash + tasks + writes + trident tools — all in ONE message. They do not have to be the same tool.
- A batch can carry a whole pipeline stage: read the files, grep the verify, dispatch the subagents, write the artifact — in one go.

### 1.4 The hooks fire per part
`tool.execute.before` / `tool.execute.after` fire PER tool part. The firewalls (the [WAVE VERBATIM], the [WAVE BATCH], the [TASK FIREWALL]) therefore evaluate each call individually — the batch is the concurrency container, the hooks are per-call.

---

## PART 2 — THE DOCTRINE: BATCH BY DEFAULT

### 2.1 THE RULE
**EVERYTHING is batched by default.** Reads, greps, bash commands, writes, subagent dispatches, trident tools — all execution is organized as BATCHES. A single/sequential call is the EXCEPTION, allowed ONLY when there is a TANGIBLE reason: a true data dependency (call B needs call A's OUTPUT as its input), an interactive sequence, or a runtime that cannot parallelize the calls.

### 2.2 THE MENTAL MODEL — MISSILE LAUNCH, NOT BULLET FIRE
- WRONG: one tool call at a time — "read A, then read B, then grep C, then write D" — the handgun.
- RIGHT: decompose the work into WAVES — "wave 1: batch read A+B+C, batch grep the verify targets; wave 2 (after the results): batch the edits; wave 3: batch the subagent dispatches" — the missile launcher with cluster warheads.

### 2.3 THE DECOMPOSITION — milestones → waves → calls
1. **THE MACRO MILESTONE** (a todowrite task): "build XYZ" — a high-level goal.
2. **THE WAVE PIPELINE** (the micro milestones): the sequential map of the work — wave 1 → wave 2 → wave 3 → complete. Each wave is a batch or a set of parallel batches. Independent waves run CONCURRENTLY; dependent waves wait.
3. **THE CALLS** (the components of each wave): the individual tool invocations inside the batch — reads, writes, bash, task dispatches, greps.

### 2.4 THE PLANNING REFLEX — first principles, before ANY execution
For EVERY high-level goal, produce the full decomposition BEFORE the first tool call:
- The macro milestones (the todowrite tasks, in order).
- For each milestone: the waves needed to complete it (read-context wave → dispatch wave → write wave → verify wave → ...).
- The dependencies: which waves must wait, which run in parallel.
- The calls per wave: the concrete tool invocations.
THEN fire the waves in the pipeline — each wave as ONE batch message.

### 2.5 THE WAVE DISPATCH (the subagent waves)
The wave generator's batch form (`{tools: [...]}`) is a DATA DESCRIPTION of a batch: the `tools` array maps 1:1 to the message's tool parts. DISPATCH it as: **ALL the task calls in ONE message** — the batch process. 0 ignore, 0 hand-picking, never sequential.

---

## PART 3 — THE EXAMPLES (the verified patterns)

### 3.1 THE 21-GREP BATCH (verified live 2026-08-10)
One message, 21 `grep` calls (one per file in the HOOKS folder), each with its own path/pattern. The runtime executed all 21 concurrently; all 21 results returned together. THE TEMPLATE: for any "batch grep on all of these" — ONE message with the N grep calls.

### 3.2 THE READ-CONTEXT WAVE (a milestone's wave 1)
```
BATCH:
  read fileA.ts (2500-line pass)
  read fileB.ts (2500-line pass)
  read fileC.md
  grep "interface X" src/
  glob "**/*.test.ts"
  hive_context(query=the domain)
```
All in one message. The results are the milestone's context.

### 3.3 THE DISPATCH WAVE (a milestone's dispatch wave)
```
BATCH:
  task(description=agent-1, promptFile=.../agent-1.md, subagent_type=trident_explore)
  task(description=agent-2, promptFile=.../agent-2.md, subagent_type=trident_build)
  task(description=agent-3, promptFile=.../agent-3.md, subagent_type=trident_explore)
```
All in one message — the wave generator's batch form dispatched AS the message.

### 3.4 THE MIXED WAVE (a verification stage)
```
BATCH:
  bash "bun test src/tests 2>&1 | tail -5"
  bash "npx tsc --noEmit 2>&1 | grep -c 'error TS'"
  grep "TODO" src/
  read .trident/wave-audit/wave-1786347000000.md
```
Different tools, one message, one pass.

### 3.5 WHEN SEQUENTIAL IS CORRECT (the tangible reasons)
- A call whose INPUT is another call's OUTPUT (e.g., write the prompt file, THEN dispatch with its promptFile).
- The container-test send → read → check rhythm (the stream positions advance).
- A decision point whose branch determines the next calls.

---

## PART 4 — THE SELF-CHECK (before every execution)

1. Can this be a batch? If 2+ independent calls are planned — THEY ARE A BATCH. One message.
2. Is there a tangible reason for a single/sequential call? If NO — it is a batch.
3. Am I firing bullets? If the execution is one-call-at-a-time without a dependency — STOP, decompose into waves, fire the batch.
4. Does the wave's plan precede the wave's fire? The milestone → waves → calls decomposition comes FIRST, the execution follows in waves.

---

## THE RULES OF ENGAGEMENT (the law, condensed)

1. **BATCH BY DEFAULT — 2-25 tool calls per message, any tool mix, always.**
2. **THE SEQUENTIAL EXCEPTION — only a true data dependency, an interactive rhythm, or an explicit operator instruction.**
3. **THE WAVE PIPELINE — decompose every goal into milestones → waves → calls BEFORE firing; dependent waves wait, independent waves run parallel.**
4. **THE SUBAGENT WAVES — the generator's batch form dispatches as ALL the task calls in ONE message.**
5. **NEVER "the batch tool" — it is THE BATCH PROCESS: one message, N parts, one concurrent pass.**
