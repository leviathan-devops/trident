# COMPACTION-SURVIVAL — THE RESUME ANCHOR (2026-08-08 — the wave-generator final + the theatrical-overhaul spec ready)

**THE DIST SHA: 06ac7d22b4edce3f0124da4a1047845e9a73f4a32736b8baaffb01c8044212bc** (the host deployed + verified; the checkpoint + the ship package at the same SHA with the full 206-file src — three-way verified, 0 mismatches).

## THE STATE AT A GLANCE (the one-paragraph orientation)

Trident v4.4.2 is at its most stable state since the session began: the wave generator (trident-wave-generator — the ONLY subagent dispatch path) is GENERATOR-ONLY (the shadow pipeline → the prompt files → the batch form; the orchestrator dispatches the returned batch via the batch tool — the tool NEVER spawns). All the 2026-08-07/08 fixes are shipped: the reasoning-token contamination fix, the 384K truncation root-cause, the no-mechanical-fallback (the [SHADOW INFERENCE] is the model's brief or nothing), the loud-fail law (WARHEAD 10), the parallel generation + the atomic seq (WARHEAD 11), the CT-tool fixes (the DCS-swallow, the cursors, the SQLite session state), the token-cap sweep, the task firewall RE-ENABLED ([NO LAZY PROMPTS] + the either/or gate), the SSTF claim-arming fix, the backend stall detector (the provider is intermittent — verified working now), the hallucination-fuel purge, the task-preflight tool removed. The battery: 162/0/582. THE NEXT BUILD is PLANNED + SPEC'D but NOT implemented: the theatrical firewall overhaul (THEATRICAL_FIREWALL_OVERHAUL_SPEC.md, 759 lines — the operator's major catch: a mock server fabricated a container test; the three holes found; the spec awaits the operator's go).

## THE OPERATING LAWS (the full set — each with the rationale)

1. **THE LOUD-FAIL-OR-CLEAR-PASS LAW (WARHEAD 10, 2026-08-07):** "EITHER A LOUD FUCKING ERROR OR IT WORKS... EVERYTHING IS EITHER A LOUD FAIL OR A CLEAR PASS. DO NOT CREATE BULLSHIT FALLBACKS THAT CREATE FALSE SUCCESS AND DERAIL PROJECTS." The fallback test: does the fallback produce what the primary produces, differing only in quality? if NO — false success, banned. The failure pattern: the error manifest (ready:false, the error named, NO file, NO memory row). WHY: the false-success class is the most dangerous bug (the pipeline consumes the fake, the real failure is invisible) — the ct-final-1 + the host-gen-a artifacts proved it live.
2. **THE ASYNC-PARALLEL-DEFAULT LAW (WARHEAD 11, 2026-08-07):** async/parallel is the DEFAULT; the sequential-only exception is a TRUE data dependency; INTELLIGENT async (allSettled, per-unit failure capture, the results collected) never fire-and-forget slop. WHY: the sequential generation was the live 20-minute hang; the parallel Promise.allSettled + the atomic seq fixed it.
3. **THE NO-MECHANICAL-FALLBACK RULE (2026-08-07):** the [SHADOW INFERENCE] section is the model's OWN brief after the ~~~~~~~~~~~ delimiter or NOTHING; the mechanical inference.text is the brain's DEMAND input only. WHY: the operator: "NO MECHANICAL FALLBACK... EITHER THE REAL MODEL BRIEF WORKS OR IT IS JUST THE PROMPT".
4. **THE TOKEN-CAP POLICY (2026-08-07):** deepseek → 384000 (the operator: "380k actually. deepseek has a max tokens of 384,000"), everything else → 128000; the 8K slop purged everywhere. WHY: the 8192 cap was the truncation root cause (the "- READ-" dangling bullet at ~123 lines).
5. **THE EITHER/OR GATE (2026-08-08):** the [NO LAZY PROMPTS] gate passes when the session has used the wave generator tool OR loaded the templates skill — "dont hardcode the skill". The message frames the two paths by use: "Use the skill for surgical dispatching with extreme context precision, and wave generator for efficient batch wave dispatch."
6. **THE GENERATOR-ONLY BASELINE (2026-08-07):** the wave generator NEVER spawns — the description says so verbatim; the return carries the batch form; the orchestrator dispatches it. WHY: the 15-deep recursion catastrophe (the direct subtask parts went into the main session as USER messages — the empty shells + the re-triggering).
7. **THE M4 HOOK-SURFACE REALITY (2026-08-03):** agent-message logic wires into experimental.text.complete; chat.message is the user-input surface. WHY: the claim gates wired into chat.message's assistant branch NEVER fired — the phantom infrastructure.
8. **THE M5 AUTONOMY LAW (2026-08-03):** a gate NEVER erases/replaces an agent's outgoing message; corrections APPEND. WHY: the text.complete replacement killed the session (the model finished, the turn ended, the report erased).
9. **THE SSTF CLAIM-ARMING RULE (2026-08-08):** the claim tracker arms ONLY from the agent's COMPLETED message via isCompletionClaim — NEVER from tool outputs. WHY: the old bare-word tool-output scan made agents learn to dismiss the gate as noise (a live subagent: "I'll treat them as noise").
10. **THE STALL-DETECTOR RULE (2026-08-08):** the fetch's own response-wait (45s) fails a silent provider instantly; the outer clock (90s) is the ceiling. WHY: the old 240s clock × 4 rounds = 16 silent minutes per agent — "the timeout is a stupid fucking clock timer that runs the full timeout length regardless of what happens".
11. **THE THEATRICAL INVARIANT (2026-08-08 — the operator's catch):** a claim about TARGET X using evidence that exercised STAND-IN X' = theatrical. The distinguisher: the claim-subject (REAL vs CODE) + the substitute-shape (SERVER vs FUNCTION) + the session chain. The jest exemption is SCOPED TO CODE-UNIT CLAIMS, never blanket.

## THE DOC MAP (what each canon doc contains + the path)

| Doc | Path | What it contains |
|---|---|---|
| POST-COMPACTION_PROMPT.md | context_management/ | The entry sequence: the mission, the TRUE SHA, the session's complete work, the key files, the resume order, the evidence table, the do-not list |
| COMPACTION_SURVIVAL.md | context_management/ | THIS doc — the operating laws, the state at a glance, the doc map, the fresh-agent entry rules |
| CURRENT_STATE.md | context_management/ | The per-module status (built/solid/broken/open) with the file:line + SHA + the proven-machinery inventory + the architecture as it ACTUALLY is |
| BUILD_STATE.md | context_management/ | The checkpoint structure, the SHA chain, the verified results (the behavioral passTokens), the module inventory, the build command, the frozen list |
| DECISION_CHAIN.md | context_management/ | The operator's rulings VERBATIM (the D-series + the laws) with the context + the rationale + the alternatives rejected |
| EVIDENCE_STATE.md | context_management/ | The dist SHA chain, the per-scenario behavioral passTokens, the container-run provenance, what's proven vs claimed |
| NEXT_STEPS.md | context_management/ | The wave plan: the theatrical overhaul (the spec's Tasks 1-7), the container re-verification, the queued items |
| TASK_QUEUE.md | context_management/ | The gates, the active/completed/backlog/blocked items |
| CHANGELOG.md | context_management/ | The per-session entry: what was accomplished, the decisions, the failures, the debugging journey |

## THE FRESH-AGENT ENTRY RULES (the exact first-5-actions)

1. Read POST-COMPACTION_PROMPT.md (the entry document — the mission + the TRUE SHA 06ac7d22).
2. Read COMPACTION_SURVIVAL.md (this — the shape) + CURRENT_STATE.md (the exact per-module state) + DECISION_CHAIN.md (the rulings verbatim).
3. Read THEATRICAL_FIREWALL_OVERHAUL_SPEC.md (759 lines — the next build's contract: the theatrical firewall overhaul, Tasks 1-7).
4. THE GATE: the theatrical overhaul's IMPLEMENTATION awaits the operator's explicit go. The PLAN is approved; the build is not. Do NOT implement without the go.
5. On the go: implement the spec's Tasks 1-4 → 5 (the 12 tests) → the battery → 6 (the container suite) → 7 (the ship + the checkpoint + the package sync) — then the container re-verification (the provider's health permitting) + the batched-dispatch end-to-end.

## THE OPERATING-RULES QUICK REFERENCE

- Evidence or nothing: every claim carries a sha256sum / the battery output / the container stream / the container-test-results.json — prose is NOT evidence.
- The container test IS the test: the unit battery is the pre-flight; the container (trident-container-test with a validated plan) is the proof.
- The binary is the only contract: the tool description describes the ACTUAL execute — never the intended one.
- The provider: opencode-go (DeepSeek V4 Flash via the embedded key — verified working; intermittent — the stall detector fails fast).
- Minimal change discipline: the surgical edit touches ONLY the specified region; "while I was in there" is banned.
- The wave generator: the ONLY subagent dispatch path — the batch form dispatched via the batch tool; never a hand-written thin prompt ([NO LAZY PROMPTS] blocks).
- The checkpoint + the package: sync EVERY ship (the dist + the changed src + the tests + the README) — the three-way hash check.
