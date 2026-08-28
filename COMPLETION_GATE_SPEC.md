# THE FALSE-COMPLETION FIREWALL — THE BUILD SPEC (L2)

**Version:** 1.0.0 · **Date:** 2026-08-26 · **Status:** APPROVED — THE BUILD CONTRACT
**Target tree:** `Active_Projects/v4.4.2-wave-manager-async` (the ONLY tree changes land in)
**Authority:** The operator's directives 2026-08-26 (A/B/C below) + the LASME T.E.B. bible (`KNOWLEDGE_LIBRARY/LASME/TEB_MACHINES_FOR_BEHAVIOR_ENGINEERING_T1.md`)

---

## §0 THE PROBLEM (the live false-completion incident, mechanically confirmed)

Two B1 build agents were dispatched to build Tetris + Space Invaders. Both
returned "complete" with grep-only "verification." Ground truth at audit time:

- **Tetris: crashed on load** — `resetGame()` threw `Cannot read properties of
  undefined (reading 'add')` on the startup path. The agent wrote 434 lines,
  grepped keywords, returned complete. The game cannot render a single frame.
- **Invaders: ran under a stub harness but was never executed by its agent** —
  no runtime evidence existed until the orchestrator's audit harness ran it.

**The gap:** between an agent's return and `WaveTracker.markComplete` there is
NOTHING (`wave-cron.ts:389` — stream stops growing → complete). No artifact
verification. No runtime evidence. No intent check on the claimed verification.

**The compounding sources (audited):**
1. The orchestrator-authored spec args said "grep your own output" — the
   verification requirement itself was smoke-class.
2. The weave's MECHANICAL VERIFICATION slot is hollow: `shadow-runner.ts:714`
   builds it as `read <file> (full pass)` — a text-existence check. For
   non-TS artifacts there is NO verification template at all.
3. The t1 build-agent identity mandates runtime verification as DOCTRINE TEXT
   — advisory, not a gate.
4. No completion gate exists between return and markComplete.

---

## §1 THE OPERATOR'S LOCKED DIRECTIVES (verbatim)

- **A)** "wire an anti pattern against theatrical smoke test bullshit into the
  wave planner skill. MANDATE RED TEAM PRESSURE AND/OR DEEP CONTAINER TEST
  VERIFICATION in the wave planner. none of this smoke test garbage"
- **B)** "do the same on mechanical verification. EVERYTHING MUST HAVE A
  WORKING CONTAINER TEST + DEBUG LOOP PER THE 2 SKILLS I JUST REFD"
  (the two skills: red-team-pressure-test + deep-container-testing)
- **C)** "I SAID TO BUILD A PROPER FUCKING EVENT GATE FOR THIS LAST TIME WHY
  THE FUCK IS THIS NOT DONE" — the completion event gate, NOT the toast
  (the toast was built; the gate was not — the miss, acknowledged).
- **2)** "I NEED AN INTENT BASED MECHANICAL FIREWALL ON THIS IMMEDIATELY …
  PROPER INTENT BASED DETECTIONS USING KNOWLEDGE_LIBRARY/LASME ARCHITECTURE"
  (without blocking legit build functions)

---

## §2 THE ARCHITECTURE — a T.E.B. machine at the completion boundary

Per the T.E.B. bible's 5-part anatomy (Interceptor / Lexicon / State Machine /
Enforcer / Remediation — no sixth part, a machine missing any part is a hack):

### 2.1 THE INTERCEPTOR — the markComplete boundary

`wave-cron.ts` completion path changes from:
```
isBackgroundTerminal(taskId) → markComplete → toast
```
to:
```
isBackgroundTerminal(taskId) → THE GATE(agent, wave) →
  PASS   → markComplete → toast (the existing wake-kick)
  HOLD   → agent.state = 'in_review' + the remediation steer (once)
  FAILED → the named failure (second insufficient return — the orchestrator decides)
```

The gate is a new module: `src/tools/wave-completion-gate.ts`.

### 2.2 THE LEXICON — two typed detector families (regex detects, machine decides)

**FAMILY 1: VERIFICATION_CLASS — on the agent's RETURN TEXT**
Source: the final text part(s) of the agent's session stream (read via the
existing `readSessionStream`, last ~5 parts, no full-stream reads).

| id | kind | matcher (Order-2: shape + the ABSENCE of an execution signature) | severity |
|---|---|---|---|
| SMOKE-GREP-ONLY | smoke | return contains ≥2 `grep`/`test -f`/`ls` command citations AND zero execution signatures (no test-runner output, no exit codes, no run output blocks, no container artifact path) | HIGH |
| SMOKE-CLAIMED-VERIFIED | smoke | return claims verified/works/complete AND zero pasted command outputs with exit codes | HIGH |
| SMOKE-OPENS-IN-BROWSER | smoke | "opens in a browser" / "runs in a browser" AND no harness/run citation | MEDIUM |
| EVIDENCE-BATTERY | evidence | `bun test` output with pass/fail counts | PASS-sig |
| EVIDENCE-TSC | evidence | tsc/typecheck with exit 0 / zero errors | PASS-sig |
| EVIDENCE-CONTAINER | evidence | container-test artifact path (`.trident/container-test-results.json`) or scenario ids | PASS-sig |
| EVIDENCE-RUN | evidence | an executed-run output block (node/bun/python execution of the artifact with real output) | PASS-sig |
| EVIDENCE-SHA | evidence | sha256 in the return + a paired run/build output | PASS-sig (additive) |

**FAMILY 2: ARTIFACT_CLASS — on the changed files** (the diff set: files the
agent wrote/edited, discovered from the return's file paths + the wave's
target paths):

| id | class | trigger | REQUIRED evidence class |
|---|---|---|---|
| ART-TS | TYPE_BATTERY | .ts/.tsx files in the write set | EVIDENCE-BATTERY or EVIDENCE-TSC or EVIDENCE-CONTAINER |
| ART-RUNTIME | RUNTIME | .html/.htm (with <script>/<canvas>) or game/ui artifacts | EVIDENCE-RUN or EVIDENCE-CONTAINER |
| ART-PY | RUN | .py files | EVIDENCE-RUN or EVIDENCE-CONTAINER |
| ART-DOC | DOC | .md/.txt/docs only | none (structure greps acceptable) |
| ART-REPORT | REPORT | no writes at all (explore/E agents) | EXEMPT (the gate skips) |

The two lexicons are TYPED (the ISE PatternFamily shape: id/kind/matcher/
triggerCondition/severity/messageTemplate/remediationHook) in a new
`src/tools/wave-verification-lexicon.ts` — no bare regex ladders (the ISE law).

### 2.3 THE STATE MACHINE — the decision layer

```
IDLE → RETURNED (terminal stream detected)
     → CLASSIFIED (artifact class + the return's evidence classes computed)
     → EVIDENCED → decision:
         PASS  — an EVIDENCE-* signature present AND (for code classes)
                  the signature class satisfies the artifact's REQUIRED class.
                  Greps are ADDITIVE — never fatal when execution evidence
                  is also present.
         HOLD  — code-class artifact + smoke-only evidence (or INCONCLUSIVE:
                  no writes found, no evidence classes matched — the fail
                  state is HOLD, NEVER a default pass).
         FAILED — a SECOND consecutive HOLD for the same agent (the one
                  kick-back was already delivered and the resubmission is
                  still smoke-only). Loud, named, the orchestrator decides.
```

Every verdict carries the evidence triad `{Pattern, State, Evidence:
partId + excerpt}` — logged to the engine log; no triplet, no finding.

The HOLD counter rides the existing AgentTrack (`reviewCycle` semantics —
reused, not duplicated).

### 2.4 THE ENFORCER — the hold itself

On HOLD: `markComplete` is NOT called. The agent state flips to `in_review`.
The remediation steer delivers once (the proven executeWaveSteer channel).
The toast fires ONLY on gate-PASS completions. All-dones/wave completion
already respect `in_review` ≠ complete (the existing allDone predicate).

### 2.5 THE REMEDIATION — the named fix (copy-pasteable, no reverse engineering)

The HOLD steer text names exactly what is missing, per artifact class:

> "[COMPLETION GATE — HOLD] Your return carries TEXT-ONLY verification
> (greps/file checks) but your artifact class is RUNTIME (html/game).
> REQUIRED: EXECUTE the artifact — run it under a harness (node with DOM
> stubs / bun run / the browser) and PASTE the run output including any
> errors. A grep proves a keyword exists; it does not prove the artifact
> runs. Resubmit your return with the execution evidence."

(TS variant: "REQUIRED: tsc --noEmit exit 0 + the test battery output
(bun test with counts) — paste both.")

### 2.6 THE MISFIRE GUARDS (why legit builds pass freely)

1. **DOC-class artifacts never demand runtime** — docs/greps pass.
2. **REPORT-class agents are exempt** — E-agents/explore (no writes) never
   enter the gate. Only agents with a write set are gated.
3. **Any execution evidence passes** — greps + battery = PASS (greps are
   additive, never fatal when real evidence exists).
4. **One kick-back only** — second insufficient return = FAILED (a loud row,
   the orchestrator's decision), never an infinite HOLD loop.
5. **INCONCLUSIVE → HOLD** — never a default pass (the loud-fail law).
6. **The gate is cheap** — last-5-parts read + regex family + a state flip;
   no full streams, no containers spawned by the gate itself.

---

## §3 THE MECHANICAL-VERIFICATION MANDATE (fix B — the weave + identity)

### 3.1 THE WEAVE SLOT (shadow-runner.ts:714 replacement)

The MECHANICAL VERIFICATION section becomes artifact-class-aware. A new
`buildVerificationCommands(spec)` derives the REQUIRED verification from the
spec's declared targets (the mission/filepaths/acceptance text):

- TS-class (filepaths/*.ts in the write targets or template B*):
  `tsc --noEmit` + `bun test <paths>` + `sha256sum` of changed files.
- RUNTIME-class (.html/game/ui targets):
  the inline stub-harness recipe (the exact pattern from this incident's
  audit: extract <script>, node with DOM/canvas/rAF stubs, pump 120 frames,
  fire keydown handlers — the template text ships IN the prompt so the agent
  has the harness copy-pasteable).
- RUN-class (.py): `python3 <artifact> <args>` execution + output paste.
- Container-class (the spec/acceptance references container testing):
  a reference to the deep-container-testing skill's protocol.

The declared verification commands ride the prompt (THE VERIFICATION section)
so the agent KNOWS the gate's requirement BEFORE it returns.

### 3.2 THE T1 BUILD-AGENT IDENTITY (t1-prompt.ts verification section)

Replace the doctrine text with the class contract:
- "GREPS ARE NOT VERIFICATION. Text-existence checks never satisfy the
  completion gate."
- "The completion gate classifies your artifact and requires matching
  execution evidence: TYPE_BATTERY → tsc+battery; RUNTIME → a run harness
  output; RUN → executed output. Paste the real output."
- Keep WARHEAD 13 (verification-before-declaration) — it becomes the intent
  layer; the gate is the mechanical layer.

### 3.3 THE SPEC VALIDATOR (the upstream refusal)

`validateSpecFile` gains a verificationClass check for B-template agents:
if NO verification-class signal exists in the agent's taskTargets/acceptance
(must mention at least one of: test/battery/tsc/run/harness/container), the
generate REFUSES with the compiler-style diagnostic naming the agent + the
missing verification class — the same refusal UX as the template-intent
filter (smoke-verification plans die at spec time, never dispatch).

---

## §4 THE WAVE-PLANNER ANTI-PATTERN (fix A — the skill)

New anti-pattern block in the wave-planning skill (the same file the planner
loads): **"AP-NEW-1: THE SMOKE-TEST VERIFICATION PLAN"** — any wave plan whose
per-agent verification strategy is text-existence only (greps, ls, test -f,
keyword counts) for a code/artifact target is a REFUSED PLAN. The planner
must emit, per agent, an execution-class verification spec:
- TYPE_BATTERY targets → the tsc+battery commands in the prompt.
- RUNTIME targets → the harness (named, with the recipe).
- Container-grade targets → a deep-container-test scenario set (per the
  red-team-pressure-test + deep-container-testing skills: the positive +
  negative suites, the passTokens, the results artifact).
- DOC targets → structure checks (explicitly allowed).

The planner's plan-review step gains the same refusal: a plan missing
verification classes for its B-agents does not pass review.

---

## §5 THE IMPLEMENTATION ORDER (3 files + 2 edits + tests)

1. `src/tools/wave-verification-lexicon.ts` (NEW) — the two PatternFamily
   lexicons (typed members, Order-2 matchers, triggerConditions, message
   templates). Pure functions; unit-testable standalone.
2. `src/tools/wave-completion-gate.ts` (NEW) — the state machine + the
   interceptor wiring: `evaluateCompletion(wave, agent, returnText,
   writeSet) → {decision: PASS|HOLD|FAILED, triad, remediation}`.
   The HOLD/FAILED remediation texts. The AgentTrack field reuse.
3. `wave-cron.ts` EDIT — both completion paths (background + foreground)
   route through the gate; toast only on PASS; HOLD steers once; FAILED
   marks the named failure.
4. `shadow-runner.ts` EDIT — buildVerificationCommands (§3.1) replaces the
   read-only slot.
5. `t1-prompt.ts` EDIT — the verification contract (§3.2).
6. `wave-spec.ts` EDIT — the spec-validator verificationClass check (§3.3).
7. The wave-planner skill file EDIT — AP-NEW-1 (§4).
8. Tests: `src/tests/completion-gate.test.ts` —
   - the Tetris incident replayed: RUNTIME artifact + grep-only return → HOLD
     + the remediation names the harness;
   - battery evidence → PASS; greps+battery → PASS (additive);
   - DOC artifact + greps → PASS (no runtime demanded);
   - explore agent (no writes) → EXEMPT;
   - second HOLD → FAILED (no loop);
   - INCONCLUSIVE → HOLD (never default pass);
   - the spec-validator refusal (B-agent, no verification class → generate refuses);
   - the lexicon members (the typed shapes, the trigger conditions).

## §6 THE SUCCESS CRITERIA (mechanical)

1. The Tetris incident CANNOT recur: the same return (grep-only, game
   artifact) → HOLD + kick-back, never markComplete.
2. Legit evidence (battery/tsc/run/container) → PASS in every class —
   zero false blocks (the adversarial: feed a real battery return, a real
   harness run, a container artifact — all pass).
3. The spec refusal fires at generate for smoke-only B-agent plans.
4. The planner skill carries AP-NEW-1.
5. The weave's verification slot is class-aware for all four classes.
6. Battery green; the existing toast/never-return/enforcement set untouched.
