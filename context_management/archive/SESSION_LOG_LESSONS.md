# SESSION LOG & LESSONS — TRIDENT v4.4.2 FINAL POLISH
# ============================================================
# CANON context doc. The session narrative + every hard-won lesson,
# expanded for compaction survival. Read these lessons BEFORE touching
# code — they encode the failures that shaped the current design.
# Updated 2026-07-31.
# ============================================================

## 1. SESSION SUMMARY

### 1.1 What happened (2026-07-31)
The deployed trident-container-test tool's switch-model action was broken in
production. The operator surfaced that the TUI did not actually switch models,
and that the tool claimed verified:true anyway. This session:
1. Audited switch-model and found THREE distinct bugs (param mismatch,
   config-ID typing, false-positive verification).
2. Fixed all three, added three new actions (switch-agent, verify-model,
   verify-agent), and a parseStatusBar helper.
3. Audited SSTF v3 — found 5 design flaws with live misfire evidence.
4. Audited DP L1/L2 — found test plans were never generated in the planning
   pipeline.
5. Wrote two overhaul specs (SSTF v4, DP test-plan-first).
6. Rebuilt and hash-verified both projects (v4.4.2 → 5a6d5729, 408 modules;
   v4.4.3 → 37fc2580, 330 modules).
7. Wrote the full canon context doc set for compaction survival.

### 1.2 Where the build stands
- GATE-A (container verify the 4 new actions): **PENDING** — code built, no
  container evidence yet.
- GATE-B (SSTF v4): spec done, **PENDING implementation**.
- GATE-C (DP test-plan-first): spec done, **PENDING implementation**.
- GATE-D (v4.4.3 Phase 1 container test): blocked on A→C.

---

## 2. THE SWITCH-MODEL ROOT CAUSE ANALYSIS (the deepest lesson)

The switch-model failure was NOT one bug. It was a chain of three independent
failures that each masked the next. This is the canonical example of why this
project insists on re-reading the TUI instead of trusting tool output.

### 2.1 Bug chain (each one hides the others)
1. **Param mismatch**: code read `params.modelName`, schema exposed `model`.
   A caller passing `model` got undefined → the tool behaved as if no model was
   requested → no switch path even executed properly.
2. **Config-ID typing**: even when a model value reached the switch logic, it
   was typed as a config ID (`opencode-zen/deepseek-v4-flash-free`) into the
   /models picker — which matches DISPLAY names (`MiMo V2.5 OpenCode Go`).
   Config IDs never match the picker → the picker silently selected nothing.
3. **False-positive verification**: the tool then checked whether the "Ask
   anything" prompt reappeared. The modal closing — whether or not a switch
   happened — re-shows the prompt. So the tool returned verified:true on a
   no-op.

**The three bugs stacked so the tool was confidently, silently wrong.** Each
bug on its own would have produced a visible error; together they produced a
lie. Only a ground-truth re-read (pane capture showing `Build · MiMo V2.5
OpenCode Go` unchanged) exposed the truth.

### 2.2 The root-cause rule (canon)
**A tool that reports success without reading back the ground truth is a liar
by construction.** Every success claim in this codebase must be traceable to a
mechanical re-read of the system that was supposedly changed. For the TUI: the
status bar. For builds: the SHA. For container tests: the stream evidence.

### 2.3 The fix (what real verification looks like)
- Type DISPLAY names (what the TUI actually shows) as ONE string after /models.
- After the switch, capture the pane, strip ANSI, parse the status bar, and
  confirm the model changed. If the status bar did not change, the switch
  FAILED — regardless of what the picker seemed to do.
- The parse is bottom-up because the status bar renders at the bottom of the
  TUI pane and the capture includes scrolling history above it.

---

## 3. THE CONFIG-CHANGE-DOESN'T-EQUAL-TUI-CHANGE LESSON

### 3.1 The incident
An attempt was made to switch the model by editing the config file:
- `sed` changed config.json's model field to `opencode-go/deepseek-v4-flash-free`.
- `grep` verified the file DID change.
- The TUI still displayed `Nano Banana Pro Google` — the OLD model.

### 3.2 Why this matters
A config edit is not a runtime switch. Either the OpenCode Go service ignores
the config field for the live session, or the display name in the config does
not map to what the TUI renders. Either way: **the file changing is evidence
the file changed — nothing more.** The TUI is the runtime truth.

### 3.3 The generalizable law
When two representations of state exist (config file vs live UI), the LIVE UI
is the ground truth for what the user/agent actually experiences. Always
verify against the representation that drives behavior, not the one that is
easiest to write to. This is why verify-model reads the pane, not the config.

---

## 4. THE DEPLOYED-TOOL-IS-THE-CONTRACT LESSON

### 4.1 The principle
The dist that runs in the container is the only contract that matters.
`src/` is the intent; `dist/index.js` is the behavior. The two have diverged
and been re-synced multiple times across the v4.4.2/v4.4.3 split.

### 4.2 Consequences
- Never test the source and claim the tool works — deploy the dist, then test.
- Always record the dist hash at deploy time; the same source can produce
  different behavior in a stale container.
- If a container shows behavior the source doesn't have, the container is
  running a stale/other dist — check the deployed hash first.
- The v4.4.2 dist (`5a6d5729...`) is what production runs. The v4.4.3 source
  (`37fc2580...` live) may differ from what's deployed. Verify, don't assume.

---

## 5. THE SSTF v3 MISFIRE LESSONS (5 flaws, live evidence)

### 5.1 Flaw 1 — User-word intent poisoning
v3 derived "verification intent" from the USER's chat words. When the user
asked "verify that the code audit tool works correctly", every subsequent read
was blocked as a "verification attempt". The user's words do not describe what
the AGENT is doing — they describe what the user WANTS. Basing enforcement on
user words makes enforcement trivially poisonable (ask to "verify" → blocked;
avoid the word → unblocked).

### 5.2 Flaw 2 — Verb classification never ran for read/grep
The classifyVerb logic only ran for some tools. read and grep — the two tools
that MATTER for smoke detection — were never classified. So the smoke path was
effectively unenforced while legit work got collateral damage.

### 5.3 Flaw 3 — No read-to-modify vs read-to-verify distinction
Reading a file to MODIFY it (prep work) is legitimate. Reading a file to
CLAIM it works (verification) is the enforcement target. v3 treated all reads
the same, so legit modification prep was blocked while verification claims
sailed through un-gated.

### 5.4 Flaw 4 — grep on source is the canonical smoke path
The operator: "grep should have been blocked harder than the others as that is
the primary mechanism of smoke test garbage." grep/rg on the bundle is exactly
how agents fake verification (grep for a symbol, claim it works). v3 allowed
it. In v4 it is the HARDEST gate (inspect_bundle → VERIFY_INSPECT BLOCK),
while grep on source for gathering stays allowed.

### 5.5 Flaw 5 — VerificationStateTracker was stubs
`setVerificationClaimed = void; void` — the methods did nothing. There was no
state tracking whether an agent made a claim or whether a container test ran.
Without state, there can be no enforcement.

### 5.6 The v4 inversion (the payoff)
**Block the CLAIM, not the WORK.** Information gathering is ALWAYS allowed —
it is never the problem. The claim ("it works", "verified", "passed") is the
enforcement target, gated in tool.execute.after by mutating output.output
(never throwing — the work continues, but the claim is visibly gated until a
real container test ran). The real VerificationStateTracker tracks
hasClaimWithoutContainerTest.

---

## 6. THE DP L1/L2 LESSON — TEST DESIGNS MUST EXIST BEFORE IMPLEMENTATION

### 6.1 The finding
`validateTestPlan` (input-validation.ts) validates plans passed TO the
container-test tool — 2000+ chars, 6 sections, theatrical-marker rejection.
But NOTHING in the planning pipeline generates test designs. Planning produces
specs; tests were improvised after implementation.

### 6.2 The problem with improvised tests
Post-implementation testing is biased: the implementer tests what they built,
not what could break it. The operator's adversarial mandate ("5+ different
angles", "no primary agent FULLY OWNS the ENTIRE container testing process")
requires the test angles to be defined UP FRONT, before code, by a design that
assumes the implementation is broken.

### 6.3 The v2 principle
DP L1/L2 outputs MUST include a "## CONTAINER TEST PLAN" section with 5+
adversarial angles (12-angle ADVERSARIAL_ANGLE_LIBRARY, keyword-selected by
selectAnglesForContext), evidence requirements, and pass criteria. L2 adds an
EXACT scenario table (# / Scenario / Feature / Prompt / Pass / Fail /
Evidence). validateEmbeddedTestPlan rejects outputs that skip it.

---

## 7. THE CORE PRINCIPLES (distilled — memorize these)

### 7.1 "Type what the TUI displays, verify by re-reading what the TUI displays."
The /models picker matches DISPLAY names, not config IDs. The status bar is
the ground truth. Type display names; confirm by parsing the status bar.
Generalizes to every system: input the native representation, verify by
reading back the ground truth representation.

### 7.2 "Block the CLAIM, not the WORK."
Information gathering is always allowed. Unverified claims are the enforcement
target — gated in tool.execute.after via output mutation, never thrown.

### 7.3 "The deployed tool is the only contract."
Test the dist, not the source. Record hashes at deploy. Check the deployed
hash before trusting container behavior.

### 7.4 "No fallbacks and force it to work in the overhauled infra or fail."
A fallback path is a hiding place for the bug. The old false-positive
verification was effectively a "fallback" — it reported success instead of
admitting the switch failed. Real verification fails loudly when it cannot
confirm.

### 7.5 "No primary agent FULLY OWNS the ENTIRE container testing process."
Testing is adversarial, 5+ angles minimum, designed before implementation.

### 7.6 "Poseidon needs to have built in intelligence to know when a task
requires workflows and when it can just directly execute."
Task classification is a first-class God Loop responsibility.

---

## 8. THE GATE ORDER DISCIPLINE

### 8.1 Why strict order
The gates are NOT independent:
- GATE-B (SSTF v4) tests depend on container-test actions being correct — if
  switch-model/verify are broken, the 9 SSTF scenarios can't be run cleanly.
- GATE-C (DP test-plan-first) scenarios are container tests too — same
  dependency.
- GATE-D (Phase 1 God Loop) is a full container test of v4.4.3 — it assumes
  the tooling from A-C is trustworthy.

**A → B → C → D.** Skipping a gate means building on unverified tools. The
operator's "no fallbacks" ruling means a failed gate is a failed gate — report
it, fix the root cause, re-run. Never claim a gate passed on partial runs.

### 8.2 GATE-A recap (the immediate next work)
- A1 deploy 5a6d5729 to v443-converged-test
- A2 verify-model → status-bar parse
- A3 switch-model (DISPLAY names) → follow-up verify-model confirms change
- A4 verify-agent / switch-agent / verify back
- A5 regression (alive, read, send, check)
- Record the exact JSON + pane tails. Only then GATE-A is cleared.

### 8.3 The evidence gate
Every gate requires recorded mechanical evidence:
- The exact command run
- The exact output (JSON / pane tail)
- A one-line verdict with the pass criterion it met
This evidence goes into EVIDENCE_STATE.md and clears the PENDING tier.

---

## 9. THE OPERATOR'S DECISION-MAKING PATTERNS (from the earlier Kimi K3
analysis — how the operator thinks, so the build can anticipate them)

### 9.1 Go to ground truth
When told the model switched, the operator did not accept the tool's
verified:true. They had the pane captured and read the actual status bar. The
operator's default is: **claim → challenge → re-read the ground truth.**
Pattern: always find the lowest-level observable and check it.

### 9.2 Trace causal chains
When the switch failed, the operator expected a root-cause analysis, not a
patch. The three-bug chain (param → display name → verification) only
surfaced because the analysis went back past the first failure. Pattern:
don't fix the symptom; find the causal chain and fix each link.

### 9.3 Redefine abstractions
The operator reframed the whole problem: not "fix the param" but "type what
the TUI displays, verify by re-reading what the TUI displays." A better
abstraction made the three bugs obvious. Pattern: when a fix is fragile,
redefine the mental model until the fix is forced.

### 9.4 Verify against edge cases
The provider-list additions (Alibaba Token Plan, Zhipu AI Coding Plan, Kimi
For Coding) and the agent-switch mandate came from considering cases the
original design didn't handle. Pattern: probe the design with the cases the
implementer didn't think of — multi-word providers, "idiot proof" verify steps.

### 9.5 Expect the operator to reject theatrical output
"no blanket /poseidon activate. reject this output and force a proper goal
task." The operator rejects output that LOOKS like progress (a poseidon
activation) without being a defined task. Pattern: every deliverable must
carry a goal, acceptance criteria, and evidence — not a gesture.

---

## 10. REJECTED PATHS (why they lost — do not re-attempt)

| Path | Why it lost |
|------|-------------|
| Typing config IDs into /models | display-name picker never matches — silent no-op |
| "Ask anything" as verification | modal close ≠ switch; proved false with pane capture |
| Fixing only the param mismatch | display-name bug was the real no-op cause — 2 bugs would remain |
| Config-file edits to switch model | config change ≠ TUI change (documented) |
| Fully automated (single-owner) container testing | adversarial mandate: 5+ angles, no single owner |
| Blanket /poseidon activate | rejected — must be a proper goal task |
| Mechanical fallback for unverified success | hides the bug; "force it to work or fail" |
| Blocking information gathering (v3) | blocked legit work, allowed the smoke path — inverted in v4 |

---

## 11. WHAT THE NEXT SESSION MUST DO (the handoff)

1. Read COMPACTION_SURVIVAL.md first, then the doc map (all 9 docs + the two
   v4.4.3 specs).
2. Prove context: 5-line state summary (v4.4.2 hash 5a6d5729; what's BUILDING
   vs SPEC-ONLY; the 3 overhaul tasks; the gate order A→B→C→D; the
   deployed-tool-is-the-contract law).
3. Execute NEXT_STEPS.md Wave A (GATE-A) with the verification battery in
   EVIDENCE_STATE.md §5. Record real JSON + pane tails.
4. On pass: update EVIDENCE_STATE.md (PENDING → VERIFIED with evidence),
   CHANGELOG.md (clear disclosures), then Wave B (SSTF v4), Wave C (DP), Wave D
   (Phase 1).
5. On any gate fail: systematic-debugging — trace the causal chain, fix the
   root cause, re-run. Never skip to the next gate.
6. Do NOT re-open frozen machinery (18-layer audit, identity, 3-layer
   firewall, input-validation, globalThis agent-state, C1-C8, Kraken
   0→94/100 machinery). Do NOT re-litigate settled doctrine. Do NOT embellish
   stats — report the TRUE state.
