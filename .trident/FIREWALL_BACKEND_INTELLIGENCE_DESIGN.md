# THE FIREWALL-BACKEND INTELLIGENCE DESIGN — TASK #25 (THE APPROVED + REVISED)

**THE STATUS: the operator's GATE-2 APPROVED (2026-08-15) with the refinements incorporated. THE EXECUTION follows this document.**
**THE PRINCIPLE: a block whose remedy requires reverse-engineering is a block with a broken remedy. The firewall is mechanical INTELLIGENCE — it tells the agent WHAT IT DID WRONG + HOW TO DO IT RIGHT, in a simple context bullet, with the backend state machines doing the heavy lifting. NO derailment fuel.**

---

## 1. THE PROBLEM — the live wave derailment (2026-08-14, the 4-agent wave)

A live 4-agent wave dispatch derailed through TWO dumb-blocker failures:

1. **THE INLINE-PROMPT DISPATCH:** the model typed the prompts INLINE (a bunch of tokens — a written prompt) instead of passing the promptFile PATH (the single-token workspace path). The [WAVE VERBATIM] firewall blocked with "the SHA mismatch — DISPATCH the batch form's task call with the promptFile param VERBATIM" — a remedy WITHOUT the shape, forcing the model to reverse-engineer the call form from the raw tool output. Turns burned, errors, re-blocks.
2. **THE PARTIAL-DISPATCH DEAD-END:** after the re-attempts, 1 call got through + 3 blocked. The [WAVE BATCH] gate: "the wave has 4 agents — a SINGLE task dispatch is the derailment pattern. REGENERATE." The blind regenerate would KILL the 1 running agent — the wave fragmented, the model looped.

THE MECHANISM: the firewalls were DUMB BLOCKERS — binary checks (waveAgentExists / tebHadPromptFile) with no state machine, no input classification, no actionable remedy. The fix: every firewall becomes a T.E.B. machine — the input classifier + the state machine + the SIMPLE remedy bullet.

---

## 2. THE DESIGN — the 4-part fix

### PART 1 — THE T.E.B. INPUT CLASSIFIER (the intelligent "path vs prompt" lexicon)

**THE WHAT:** a lexicon + state machine that classifies the dispatch input BEFORE the firewall decisions: is the input a FILEPATH (the single-token, workspace-root-anchored string) or a PROMPT (the multi-token written text)? The PROMPT class is REJECTED with the simple remedy; the PATH class proceeds to the loader.

**THE LEXICON (the detection layer — the operator's exact spec):**
- THE WORKSPACE-ROOT ANCHOR: the path's first 3 branches match the workspace root (`/home/<user>/OPENCODE_WORKSPACE/` — the TRIDENT_TMP_DIR's parent).
- THE TOKEN-SHAPE: a PATH is ONE LONG STRING TOKEN (the slashes + no spaces — the token count is LOW); a PROMPT is a BUNCH OF TOKENS (whitespace-separated words — the token count is HIGH).
- THE CLASSIFIER (classifyDispatchInput):
  - `PATH_CLASS`: the input contains the workspace-root anchor + is a single path-shaped token (no internal whitespace beyond the path's own structure) → ALLOW (the loader injects).
  - `PROMPT_CLASS`: the input is multi-token text (a written prompt — the whitespace token count exceeds the path shape) → BLOCK with the remedy bullet.
  - `MIXED_CLASS`: the input has the path + trailing prose → BLOCK (the prompt text is derailment fuel — pass the path ONLY).

**THE REMEDY BULLET (the simple context bullet — the operator's exact words):**
```
YOUR INPUT WAS A PROMPT, NOT A PATH. The task input is a FILEPATH and
nothing else — pass the ACTUAL PATH of the prompt file the wave manager
generated (the promptFile), do NOT write the prompt text. The wave manager
already generated the payload; you only pass its path.
```

**THE MECHANICAL GUARANTEE:** the model cannot slip a written prompt past the classifier — the path-shape vs the prompt-shape is a mechanical fact (the workspace-root anchor + the token count), not a judgment. THE GLM-compression derailment dies at the INPUT classification, before the firewall even needs to compare anything.

### PART 2 — THE STATE-MACHINE-BACKED FIREWALLS (the logic flow)

**THE WHAT:** the surviving binary firewalls (the wave-mandate + the promptFile firewall) gain the state-machine backing — each becomes a T.E.B. machine (the classifier + the state + the remedy bullet). THE OPERATOR: "why is there not an intelligent state machine behind each of these like we have on the other t.e.b machines?"

**THE LOGIC FLOW (the state machine every dispatch runs through):**
```
THE DISPATCH INPUT
  │
  ├─ 1 THE INPUT SHAPE (classifyDispatchInput — Part 1)
  │    PATH_CLASS → proceed      PROMPT_CLASS/MIXED → [WAVE VERBATIM] bullet
  │
  ├─ 2 THE AUTHORITY (the wave-mandate state)
  │    waveAgentExists(desc)? NO → [WAVE MANDATE] bullet:
  │      "generate the wave with trident-wave-manager, then pass the
  │       returned prompt file's path (a filepath and nothing else)"
  │    YES → proceed
  │
  ├─ 3 THE SOURCE (the loader's flag)
  │    tebHadPromptFile? NO → [WAVE VERBATIM] bullet (the path, not the prompt)
  │    YES → proceed
  │
  ├─ 4 THE BATCH STATE (the registry machine — Part 3)
  │    ready → allow
  │    partial (N accepted + M missing) → ADOPT the running + DISPATCH the
  │      missing (the reconcile message names the missing agents)
  │    dispatched → the re-fire protection
  │    registry absent + manifest present → DERIVE from the manifest
  │
  └─ 5 THE CONTENT (the dispatch memory screen)
       a bomb command → [DISPATCH MEMORY SCREEN] + the bounded rewrite bullet
       clean → DISPATCH
```

**THE REMEDY BULLETS (the universal shape — WHAT TO DO, in plain words, with the context bullets):**
- Every firewall block = a short context bullet: (a) what the agent did wrong (ONE line), (b) what to do instead (ONE line, the exact action), (c) the reference to the payload the wave manager already returned (the batch form's path — the firewall does NOT reiterate the JSON; the model already has it from the generate's return). NO JSON dumps, NO multi-paragraph walls, NO derailment fuel.

### PART 3 — THE BATCH GATE RECONCILES PARTIAL DISPATCHES (the registry machine)

**THE WHAT:** the [WAVE BATCH] gate, on a PARTIAL dispatch state (N accepted + M missing of the total), emits a RECONCILE action — "adopt the running agents + dispatch the missing ones" — instead of the dead-end "regenerate the wave" (the operator: "current blind regenerate is retarded").

**THE MECHANICS:**
- THE REGISTRY (`.wave-registry-<waveId>.json`) tracks per-call statuses: `{ key, status: accepted|recorded|failed }` + the wave status (ready/dispatching/dispatched).
- THE GATE'S DECISION BRANCH (the full state coverage):
  - the accepted calls = THE RUNNING SET (adopt — never block their agents).
  - the total - the accepted = THE MISSING SET.
  - a MISSING agent's dispatch → ALLOW (the wave completes).
  - an ACCEPTED agent's re-dispatch → the re-fire protection block.
  - calls.length == total && all accepted → dispatched.
- THE RECONCILE MESSAGE (the simple bullet):
```
[WAVE BATCH] the wave is PARTIALLY dispatched: <N>/<total> accepted
(the running agents: <names>). The running agents are adopted — do NOT
regenerate. Dispatch the MISSING agents (<names>): pass each one's
promptFile path (a filepath and nothing else).
```
- THE TRANSACTIONAL SAFETY (the 2026-08-12 fix preserved): the sync read-modify-write stays atomic; a runtime-rejected call's status flips to failed → RE-FIREABLE.

### PART 4 — THE MISSING-REGISTRY WAVE DERIVES FROM THE MANIFEST

**THE WHAT:** a wave generated BEFORE the registry fix (the manifest exists, the registry file absent) does NOT hit the dead-end "no registry — regenerate"; the gate DERIVES the registry from the manifest (total = agents.length, calls = [], windowStart = null) + proceeds with the reconcile logic.

**THE MECHANICS:**
- THE NEW BRANCH: `if (!tfReg)` → derive from `findWaveRecordForAgent`'s wave record (agents.length → total; calls = []; status ready) + the atomic write + the normal checks. Marked `{ derivedFromManifest: true }`.
- THE FAIL-CLOSED EDGE: a wave with NO manifest AND NO registry → the wave-mandate already blocks it.

---

## 3. THE INTERFACES (the touched surfaces)

| THE SURFACE | THE CHANGE | THE FILE |
|---|---|---|
| THE INPUT CLASSIFIER | `classifyDispatchInput(input)` — the workspace-root anchor + the token-shape lexicon (PATH/PROMPT/MIXED) | memory-read-lexicon.ts (or the new dispatch-input-lexicon.ts) |
| THE MESSAGE BULLETS | the [WAVE MANDATE]/[WAVE VERBATIM]/[WAVE BATCH] texts → the simple context bullets (what-was-wrong + what-to-do + the payload reference) | trident-hooks.ts (the throw messages) |
| THE WAVE-RECORD LOOKUP | expose the wave's agents + the prompt-file path | trident-hooks.ts (findWaveRecordForAgent / findWaveManifestEntry) |
| THE BATCH GATE | the partial-state reconcile branch (adopt-the-running + dispatch-the-missing) | src/tools/wave-registry.ts (evaluateWaveBatchGate) |
| THE REGISTRY DERIVE | the manifest-derived registry on the absent registry file | trident-hooks.ts (the [WAVE BATCH] section) |

---

## 4. THE PSEUDOCODE

```
THE T.E.B. INPUT CLASSIFIER (Part 1):
classifyDispatchInput(input):
  tokens = input.split(/\s+/).filter(non-empty)
  isPathShape = input matches the workspace-root anchor
                AND the input is a single token (no internal whitespace
                beyond the path's own structure — the token count LOW)
  if isPathShape:            return PATH_CLASS      # the loader injects
  if hasWorkspaceRoot(input): return MIXED_CLASS    # the path + trailing prose
  return PROMPT_CLASS                                # the written prompt

THE DISPATCH GATE (the full state machine):
gate(desc, input, sha):
  cls = classifyDispatchInput(input)
  if cls != PATH_CLASS:
    throw [WAVE VERBATIM] + the PATH bullet ("pass the actual path of the
      prompt file — input is a filepath and nothing else. Do NOT write the
      prompt text.")
  wave = findWaveRecordForAgent(desc, sha)
  if !wave: throw [WAVE MANDATE] + the GENERATE bullet
  reg = readWaveRegistry(wave.wave)
  if !reg:
    reg = deriveFromManifest(wave)                    # Part 4
    writeWaveRegistry(reg)
  decision = evaluateWaveBatchGate(reg, key, now, window)
  if decision == allow:
    if accepted.length == total: return OK
    return OK_REMAINING                                # the partial reconcile
  if decision == accepted: throw RE_FIRE_BLOCK + the adopted/missing bullet
  if decision == in-flight: throw IN_FLIGHT_BLOCK
  throw PARTIAL_EXPIRED_BLOCK + the reconcile bullet    # the missing calls named
```

---

## 5. THE VERIFICATION PLAN

1. **THE UNIT PINS:**
   - the input classifier: the PATH (the workspace-root single token) → ALLOW; the PROMPT (the multi-token text) → BLOCK; the MIXED (the path + prose) → BLOCK; the relative path / the non-workspace path → PROMPT/BLOCK.
   - the partial reconcile: 1 accepted + 3 missing → the missing dispatch allowed + the message names the adopted/missing.
   - the re-fire protection preserved: the accepted agent's re-dispatch → the block.
   - the derive-from-manifest: the manifest + no registry → the derived registry + the dispatch proceeds.
   - the remedy bullets: the messages contain the PATH bullet text ("a filepath and nothing else") — no JSON dump.
2. **THE BATTERY:** 461+ (the new pins), tsc 0, the build.
3. **THE CONTAINER:** S1 the input classifier (an inline-prompt dispatch → the [WAVE VERBATIM] with the PATH bullet); S2 the partial reconcile (the 4-agent wave: dispatch 2 → adopt + name the missing 2 + complete); S3 the derive-from-manifest (the stale-wave fixture); S4 the re-fire protection.
4. **THE ARTIFACT:** .trident/container-test-results.json.

---

## 6. THE SCOPE + THE DO-NOT-TOUCH

- THE TOUCH: the new input classifier + trident-hooks.ts (the bullets + the derive) + wave-registry.ts (the reconcile branch) + the wave tests.
- THE FROZEN: the T.E.B. loader mutation, the promptFile firewall's flag, the memory lexicon, the deferred wipe, the atomic registry read-modify-write, the resume channel.
- THE RISK: the reconcile must NOT weaken the one-at-a-time detection (the second-call window-expired block stays); the classifier's PATH detection must not misfire on the legit paths (the workspace-root anchor + the token-shape exclusions).

---

## 7. THE DECISION RECORD

| THE DECISION | THE ALTERNATIVES REJECTED |
|---|---|
| The input classifier (path-shape vs prompt-shape) FORCES the promptFile pass | the SHA-comparison-only (the reverse-engineering); the trust-the-model (the derailment) |
| The simple context bullets (what-was-wrong + what-to-do + the payload reference) | the copy-paste JSON dump (the derailment fuel — the wave manager already returned the payload); the multi-paragraph walls |
| The state-machine-backed firewalls (the input/authority/source/batch/content flow) | the binary checks (the dumb blockers) |
| The partial reconcile (adopt + dispatch-the-missing) | the blind regenerate (kills the running agents) |
| The derive-from-manifest | the regenerate directive (the 15-block loop) |

---

## 8. THE DESIGN AUDIT

| THE FINDING | WHAT | WHY | HOW | VERDICT |
|---|---|---|---|---|
| F1 the inline-prompt dispatch | the model typed the prompt instead of passing the path | the input shape must be classified, not compared | Part 1 — the input classifier (the workspace-root + the token-shape) | CONFIRMED |
| F2 the remedy-without-the-shape | the block named the remedy but not the HOW | the remedy must be a simple bullet | Part 2 — the PATH bullet ("a filepath and nothing else") | CONFIRMED |
| F3 the partial dead-end | the blind regenerate killed the running agents | every state needs a deterministic path | Part 3 — the reconcile | CONFIRMED |
| F4 the stale-wave dead-end | the no-registry → regenerate loop | the manifest carries the state | Part 4 — the derive | CONFIRMED |

THE VERDICT: the design is COMPLETE + the operator's refinements incorporated (the input classifier, the simple bullets, the state machines, the reconcile, the derive). THE EXECUTION follows.

<!-- DOC-COMPLETE -->
