# POST-COMPACTION_PROMPT.md — Trident v4.4.3 — Paste-Ready Activation Prompt

**CANON CONTEXT DOC.** This is the paste-ready activation prompt for the fresh post-compaction agent. It is self-contained: the fresh agent reads this and knows exactly what to do without asking anything. The operator pastes this (or reads the docs in the order below) into the fresh session.

---

## ACTIVATION PROMPT (paste this into the fresh session)

```
MISSION: Continue the Trident v4.4.3 Overhaul. The current focus is GATE-A (v4.4.2
container-test actions verified). Complete GATE-A first, then drive the gate chain
in order. Do NOT stop between phases. Verify every claim mechanically.

WORKSPACE ROOTS:
  v4.4.3 (overhaul, ACTIVE):  /home/leviathan/OPENCODE_WORKSPACE/Shared Workspace
    Context/Trident_Agent/Active_Projects/v4.4.3/
  v4.4.2 (foundation, side quest): /home/leviathan/OPENCODE_WORKSPACE/Shared Workspace
    Context/Manta Agent/Active_Projects/Trident_v4.4.2/

READING ORDER (read ALL before any code — numbered):
  1. Context_Management/COMPACTION_SURVIVAL.md
     — resume point, doc map, state at a glance (both projects), the 10 laws,
       gate order, checkpoints, frozen list, open list, first actions
  2. Context_Management/POST-COMPACTION_PROMPT.md
     — this document, the activation sequence you are executing now
  3. Context_Management/CURRENT_STATE.md
     — exact build state, what's solid vs broken, the incomplete-sync finding,
       container inventory, true stats
  4. Context_Management/NEXT_STEPS.md
     — Wave A–G plan with exact commands, done-when criteria, gates
  5. Context_Management/TASK_QUEUE.md
     — gates table, active (GATE-A detailed, incl. Task A.0 wiring), pending
       (GATE-B 9 scenarios, GATE-C 5 scenarios), completed, backlog, risks
  6. Context_Management/BUILD_STATE.md
     — checkpoint structure, full SHA chain, build commands, verified results,
       container state, deploy targets
  7. Context_Management/CHANGELOG.md
     — session history with honest disclosures (Phase 1 NOT container-tested,
       sync incomplete, specs only)
  8. Context_Management/DECISION_CHAIN.md
     — operator rulings verbatim, architectural decisions, rejected alternatives

VERIFIED STATE (do-not-re-litigate):
  - v4.4.3 dist sha256: 76ac96ec0bf5a1df...  (15.17 MB, 168 .ts files) — Phase 1
    code complete + compiles, but NOT container-tested
  - v4.4.2 dist sha256: 5a6d5729ad9c30d6...  (15.68 MB, 167 .ts files) — container-test
    overhaul APPLIED + BUILDING, FULLY wired
  - Specs: OVERHAUL 1843 lines, DECISION 1525 lines, SSTF 590 lines, DP 389 lines
  - CRITICAL: v4.4.3 container-test schema+dispatch sync is INCOMPLETE — methods +
    union type synced, but verify-model/verify-agent/switch-agent are NOT in the
    dispatch (line 388) or schema enum (line 1750). v4.4.3 dist has NO verify-model
    /verify-agent strings. Task A.0 must complete this wiring before GATE-D.
  - Checkpoints: d886c171 (OVERHAUL_PHASE1 — STALE, needs refresh to 76ac96ec),
    7461c3d3 (pending-ship-approval), f7b9d15e (BUGFIX_VERIFIED)
  - Container: v443-converged-test (UP 40h+, has Kraken project, model switch
    verified) — the GATE-A test container

CRITICAL DOCTRINE (operator rulings, verbatim):
  - "no fallbacks and force it to work in the overhauled infra or fail"
  - "no primary agent FULLY OWNS the ENTIRE container testing process here...
    ADVERSARIALLY from 5+ different angles"
  - "no blanket /poseidon activate. reject this output and force a proper goal task"
  - "poseidon needs to have built in intelligence to know when a task requires
    workflows and when it can just directly execute"
  - "grep should have been blocked harder than the others as that is the primary
    mechanism of smoke test garbage"
  - "this is not how it appears in the TUI menu 'MiMo V2.5 OpenCode Go' - this is
    how it appears... and how it needs to be typed"
  - "this tool needs a verification action that tmux capture pane and returns these
    values [agent] [model] [provider]"
  - "add here also Alibaba Token Plan, Zhipu AI Coding Plan, Kimi For Coding"

THE 10 LAWS:
  1. NO FALLBACKS — model-required phases reject wrong actions
  2. NO BLANKET /poseidon — must have goal
  3. CONTAINER TEST FULLY MANUAL — 5+ adversarial angles
  4. DECISION-MAKING ENGINE IS DEPENDENCY
  5. BUILD ORDER: Phase 1 → 2 → 3
  6. v4.4.2 FROZEN FEATURES PRESERVED (SSTF, input-validation, globalThis, intent gate)
  7. THE BINARY IS THE ONLY CONTRACT
  8. CONTAINER EVIDENCE OR NOTHING
  9. EVERY CLAIM VERIFIED
  10. MINIMAL CHANGE DISCIPLINE

GATE ORDER:
  GATE-A (v4.4.2 container-test actions verified)
    → GATE-B (SSTF v4 9/9)
    → GATE-C (DP test-plan-first 5/5)
    → GATE-D (v4.4.3 Phase 1 container test)
    → GATE-E (Phase 2)
    → GATE-F (Phase 3)

BUILD PLAN (waves — do in order):
  Wave A (GATE-A): Task A.0 wiring first, then 7 live tests on v443-converged-test.
    Done-when: all 4 actions exposed in v4.4.3 dist; verify-model/verify-agent/
    switch-model/switch-agent round-trips pass adversarially with captured evidence.
  Wave B (GATE-B): implement SSTF v4 in v4.4.2. Done-when: 9/9 scenarios.
  Wave C (GATE-C): implement DP test-plan-first in v4.4.2. Done-when: 5/5 scenarios.
  Wave D (GATE-D): v4.4.3 Phase 1 container test. Done-when: D1–D7 adversarially.
  Wave E (GATE-E): Phase 2 (/poseidon + GoalDriver). Done-when: end-to-end, 3 modes.
  Wave F (GATE-F): Phase 3 (shadow agents). Done-when: full shadow stack works.

ACCEPTANCE:
  - All gates green with container evidence
  - Decision-Making Engine implemented + container-tested
  - v4.4.3 dist rebuilt + sha256 recorded
  - Checkpoint refreshed to current hash
  - Ship package generated with BUILD_REPORT + DEBUG_LOG
  - Every claim mechanically verified

OPERATING RULES:
  - Container evidence or nothing. No green without capture-pane/tool output on disk.
  - Every claim verified. sha256, grep, container output — never trust assertions.
  - The binary is the only contract. dist/index.js sha256 is ground truth.
  - Minimal change discipline. Surgical edits, mirror existing style.
  - Parallel subagents ONLY on disjoint files. Poseidon decides workflows vs direct.
  - Test adversarially from 5+ angles, never a single happy-path.
  - Rebuild + re-hash after ANY src change.

DO NOTs:
  - Do NOT re-open the frozen list: 18-layer audit, identity system, 3-layer firewall,
    input-validation, globalThis agent-state, C1–C8 fixes, Kraken 0→94/100 machinery.
  - Do NOT re-litigate operator rulings — they are canon (DECISION_CHAIN.md).
  - Do NOT skip GATE-A. The chain is sequential.
  - Do NOT claim Phase 1 "works" — it compiles but has never been container-tested.
  - Do NOT treat the specs as shipped features — SSTF v4 and DP test-plan-first are
    SPEC ONLY until implemented.
  - Do NOT assume v4.4.3 container-test sync is complete — it is NOT (Task A.0).
  - Do NOT modify frozen machinery. Only the open list (TASK_QUEUE.md §1-7).

FIRST ACTION (prove you read the docs BEFORE executing):
  Give a 5-line state summary naming EXACTLY:
  1. The two dist hashes (v4.4.3 = 76ac96ec..., v4.4.2 = 5a6d5729...)
  2. The current focus project (v4.4.3 overhaul, side quest v4.4.2 polish)
  3. The 3 overhaul tasks (Phase 1 God Loop Phase Intelligence, Phase 2 /poseidon
     + GoalDriver, Phase 3 Forked Sessions + Shadow Agents)
  4. The gate order (GATE-A → B → C → D → E → F)
  5. The no-fallback law (wrong action at wrong phase = PHASE ACTION ERROR, rejected)
  Then ask: "GATE-A go-ahead?" — execute ONLY after the operator confirms.

DRIVE-FORWARD:
  Do NOT stop between phases. Drive Wave A → Wave B → Wave C → Wave D → the
  acceptance → the checkpoint, verifying every subagent claim mechanically.
  Report when the checkpoint is saved.
```

---

## END OF ACTIVATION PROMPT

### What the operator does
1. Optionally: verify the two dist hashes first (`sha256sum dist/index.js` in both project roots).
2. Paste the ACTIVATION PROMPT block above into the fresh session.
3. The fresh agent gives the 5-line proof-of-context, then asks for "GATE-A go-ahead".
4. Operator approves → the agent executes Wave A.

### What the fresh agent does (summary)
1. Read the 8 docs in order.
2. Give the 5-line proof-of-context.
3. Execute Task A.0 (complete v4.4.3 container-test wiring) + GATE-A (7 live tests).
4. Drive the chain to acceptance, verifying everything mechanically.

### Failure modes to avoid
- Agent starts coding before the proof-of-context → stop it, re-read this doc.
- Agent claims GATE-A passed with no container evidence → invalid, re-run with evidence.
- Agent modifies frozen machinery → halt and review against the frozen list.
- Agent implements SSTF v4 or DP test-plan-first before GATE-A → wrong order, halt.

---

## WAVE A EXECUTION DETAIL (GATE-A runbook)

### Step 1 — Task A.0: complete the v4.4.3 container-test wiring
Reference the v4.4.2 file as the authoritative source (it is fully wired):
```
v4.4.2 src/tools/container-test.ts:
  line 388: case 'switch-model':  ...switchModel(params)
  line 389: case 'switch-agent':  ...switchAgent(params)
  line 390: case 'verify-model':  ...verifyModel()
  line 391: case 'verify-agent':  ...verifyAgent()
  line 1752: z.enum([..., 'switch-model', 'switch-agent', 'verify-model', 'verify-agent'])
```
Edit v4.4.3 src/tools/container-test.ts:
- Add the 3 missing dispatch cases after line 388.
- Add the 3 actions to the schema enum at line 1750.
Then: `npm run typecheck && npm run build && sha256sum dist/index.js`.
Acceptance: grep the new dist — all 4 action strings present; record the new hash in BUILD_STATE.md + dist/sha256.txt.

### Step 2 — Connect to the test container
```
trident-container-test action=connect containerName=v443-converged-test
```
Expected: session attached. If the container is dead, use `action=restart` or the trident-container-test container lifecycle (`alive`/`setup`) before proceeding.

### Step 3 — Run the 7 GATE-A tests (each adversarially)
| # | Command | Adversarial angle | Evidence to record |
|---|---------|-------------------|--------------------|
| 1 | `action=verify-model` | real TUI state vs guessed | raw status bar + parsed agent/model/provider |
| 2 | `action=verify-agent` | active agent correctness | parsed agent + verified flag |
| 3 | `action=switch-model model="MiMo V2.5 OpenCode Go" provider="OpenCode Go"` then `verify-model` | DISPLAY-name typing + confirmation | switched:true + post-switch status bar |
| 4 | `action=switch-agent agent=trident` then `verify-agent` | agent round-trip | switched:true + verified agent |
| 5 | `action=switch-model modelName="DeepSeek V4 Flash Free"` then `verify-model` | legacy alias (params.model \|\| params.modelName) | model resolves + status bar confirms |
| 6 | `action=switch-model` (no args) | missing-param rejection | invalid_params error, no false success |
| 7 | `action=verify-model` on stopped container | dead-container handling | clean error, no false positive |

### Step 4 — Record evidence
Save each response (and the raw capture-pane text) to evidence files under the project or a GATE-A evidence dir. Append a summary to EVIDENCE_STATE.md and mark GATE-A completed in TASK_QUEUE.md.

### Step 5 — Proceed
GATE-A green → open GATE-B (SSTF v4). Do not wait for further instruction between gates.

---

## ACCEPTANCE CRITERIA (measurable, per wave)

| Wave | Measurable done-when |
|------|---------------------|
| A | 7/7 tests pass on v443-converged-test; v4.4.3 dist exposes all 4 actions; new dist hash recorded |
| B | SSTF v4 9/9 scenarios pass in container |
| C | DP test-plan-first 5/5 scenarios pass in container |
| D | Phase 1 D1–D7 all pass adversarially (identity, Kraken, DECIDE enforcement, wrong-action, PLAN/VERIFY enforcement, evidence gate) |
| E | /poseidon with goal works; DIRECT/LINEAR/PARALLEL demonstrable; no-goal rejected |
| F | WorkflowRegistry + ShadowAgentSidecar + RadioBus + ShadowPoseidon + ShortTermMemory + DependencyGraph work end-to-end |
| G (decision engine) | 5 layers (0–4), 20 frameworks selectable, container-tested |
| Final | all gates green + evidence + checkpoint refreshed + ship package |

---

## OPERATOR GO-AHEAD PROTOCOL

- The fresh agent MUST give the 5-line proof-of-context, then explicitly request "GATE-A go-ahead?".
- The operator's response IS the gate. Do not execute Wave A before it.
- Once approved, the agent drives Waves A→F without pausing for permission (autonomous operation), reporting at each gate checkpoint.
- If the operator revises a ruling mid-build, the agent updates DECISION_CHAIN.md and continues from the current gate.

---

## CONTEXT-LOAD FAILURE RECOVERY

If the fresh agent cannot answer the 5-line proof-of-context:
1. It has NOT loaded the docs. Re-read COMPACTION_SURVIVAL.md §2 (doc map) and §14 (first actions).
2. If a doc is missing/corrupt, regenerate from the others (the 8 docs cross-reference each other; BUILD_STATE.md §11 has the 2-minute factual baseline).
3. If the dist hashes do not match this doc, STOP — the build state has moved; verify the true state first (sha256sum, grep), update the docs, then proceed.
4. Never fabricate a state summary. Evidence or nothing (law 9).

---

## FINAL CHECKLIST FOR THE PREP (this prep's completeness)

- [x] COMPACTION_SURVIVAL.md — 224 lines
- [x] CURRENT_STATE.md — 252 lines
- [x] NEXT_STEPS.md — 210 lines
- [x] TASK_QUEUE.md — 216 lines
- [x] BUILD_STATE.md — 211 lines
- [x] CHANGELOG.md — 217 lines
- [x] POST-COMPACTION_PROMPT.md — 262 lines
- [x] DECISION_CHAIN.md — 238 lines
- [x] Honest disclosures recorded (Phase 1 untested, sync incomplete, specs only)
- [x] Two dist hashes verified mechanically
- [x] Container inventory captured
- [x] Checkpoint hashes verified
- [x] Activation prompt self-contained and paste-ready
