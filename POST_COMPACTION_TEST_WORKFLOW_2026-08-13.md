# POST-COMPACTION TEST WORKFLOW — THE FULL HOST VALIDATION (2026-08-13)

> THE RESUME ENTRY: read this + the POST-COMPACTION_PROMPT.md first. The host runs
> b2ed69d8 (the one-tool wave manager + the sqlite tracker + the compact context).
> The fork + the git repo (4.4.2 @ the latest commit) are the source of truth.
> Run these tests IN ORDER on the host — the exact commands/prompts + the pass
> criteria. The container evidence (the prior rounds) is in .trident/container-test-results.json.

## THE STATE TO VERIFY FIRST
1. `sha256sum ~/.config/opencode/plugins/trident/dist/index.js` → **b2ed69d8d946929d...**
2. `cd /home/leviathan/OPENCODE_WORKSPACE/trident && git log --oneline -1` → the 4.4.2 head (clean).
3. `cd "<fork>" && bun test src/tests/` → **410/410** + `bunx tsc --noEmit` → 0.

## THE HOST TEST BATTERY (the EXACT tests)

### T1 — THE ONE-TOOL GENERATE (the named id + the alias + the token + the compact check-in)
PROMPT: `trident-wave-manager` with agents=[1 E1 agent, filepaths=['/tmp/opencode/host-test-a1.txt'], the 7 dense context args] waveId=post-comp projectToken=post-comp-verify.
PASS:
- The wave id = `wave-post-comp-<epoch>` (the alias in the id).
- The check-in = the COMPACT two-liner: "WAVE wave-post-comp-<epoch> (1 agents) READY — DISPATCH the returned batch form as ONE message. Track it via trident-wave-manager action=status waveId=wave-post-comp-<epoch>".
- The tracker row (`~/OPENCODE_WORKSPACE/trident-tmp/trident-waves.sqlite`) carries: alias 'post-comp' + projectToken 'post-comp-verify' + status 'running'.
- The manifest shows status 'ready' + generatedAt/generationMs.
FAIL: the old wall-of-text check-in, the bare wave-<epoch> id, or a missing token.

### T2 — THE DISPATCH + THE REGISTRY CYCLE (the exact-bug fix)
PROMPT: dispatch the batch with background:"yes" (the malformed string) → the runtime must reject it (SchemaError, NOT a [WAVE BATCH] block); the registry stays 'recorded'. Then re-dispatch with background:true → the gate ALLOWS it → the subagent spawns → the registry 'accepted'/'dispatched' → EXACTLY ONE subagent session.
PASS: the schema rejection + the sanctioned re-fire + one subagent.
FAIL: a [WAVE BATCH] block on the re-fire.

### T3 — THE COMPACT STATUS (via the ONE tool)
PROMPT: `trident-wave-manager action=status waveId=<the wave id>`.
PASS: the report carries wave + alias (post-comp) + projectToken (post-comp-verify) + the per-agent ONE-liners (name/state/sessionId/taskId/lastActivity) — NO tails/parts/error-codes by default.
FAIL: the verbose dump by default.

### T4 — THE PAUSE (the non-destructive interrupt)
PROMPT: `trident-wave-manager action=pause waveId=<the wave id>`.
PASS: the tracker row → status 'paused'; the response lists the pausedAgents.
FAIL: the wave killed (the destructive path).

### T5 — THE KILL-WAVE (the destructive path on the ONE tool)
PROMPT: `trident-wave-manager action=kill-wave waveId=<the wave id>`.
PASS: the wave's row leaves the waves table + lands in the archive with status 'aborted'.
FAIL: the kill-wave errors.

### T6 — THE OLD TOOLS ARE GONE (the clean break)
PROMPT: try to call trident-wave-status + trident-wave-steer.
PASS: the tools do NOT exist in the toolset (the tool-not-found).
FAIL: the old tools respond.

### T7 — THE RELEASE-BY-ALIAS
PROMPT: `trident-wave-manager action=release waveId=post-comp` (the ALIAS).
PASS: the alias resolves → the registry resets to calls:[]/ready.
FAIL: the release errors on the alias.

### T8 — THE MULTI-PROCESS STATE (the 8-session safety — the sqlite)
CHECK: while a wave runs, a SECOND process (another TUI) calls `action=status waveId=<the wave id>` — it must see the wave (the sqlite rows are shared + the writer lock serializes).
PASS: the second process sees the wave + its state.
FAIL: the unknown_wave (the row lost).

### T9 — THE SELF-HEAL (the phantom-kick regression check)
CHECK: the host's cron ticks (every 10m) — NO phantom "continue" kicks on normal complete messages (the misfire fix). If a real provider-drop occurs, the kick should fire.
PASS: no phantom kicks in /tmp/trident-engine.log for a healthy session.
FAIL: a phantom kick.

## THE TASK QUEUE (the open items — the NEXT session)
1. **[HIGH] The host redeploy is DONE** (b2ed69d8 — the user deployed it); verify the full battery above.
2. **[MED] The ship-package reference dir** (Ship_Packages/TRIDENT_V4.4.2_LEXICON_PROMPTFILE_KEYFIX) is the PRE-today baseline — refresh it to the current fork when the operator says go.
3. **[MED] The README update** (README_UPDATES_2026-08-13.md — this file's sibling) — apply it to the GitHub README on 4.4.2.
4. **[LOW] The pause's steer-interrupt** — the runtime's non-destructive cancel for background tasks is conditional; if a true suspend primitive appears, upgrade the pause from the composite to the native interrupt.
5. **[LOW] The compact status's verbatim container capture** — the check-in/status output texts are unit-pinned + code-verified; a live verbatim capture (with denser test args) closes the last observation gap.
6. **[DONE — verify only] The full battery above** — the post-deploy validation.

## THE RECOVERY (if a test fails)
- The tracker: `~/OPENCODE_WORKSPACE/trident-tmp/trident-waves.sqlite` (the sqlite — WAL/shm/wal files).
- The wave files: `~/OPENCODE_WORKSPACE/trident-tmp/.wave-manifest-*` + `.wave-registry-*`.
- The engine log: `/tmp/trident-engine.log` (the tridentLog + the MAIN-SESSION ANCHOR + the KICK lines).
- The fork: `/home/leviathan/OPENCODE_WORKSPACE/Shared Workspace Context/Trident_Agent/v4.4.2-wave-manager-async`.
