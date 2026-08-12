# DEBUG LOG V4 — Trident v4.4.2 Container Test Tool Development

## Session: 2026-07-18 to 2026-07-19

---

### ISSUE 1: Container test tool "Runtime error" inside container
**Symptom:** Tool returned "Runtime error" with "internal module resolution" when called from container TUI.
**Root Cause:** Inline `require('node:child_process')` doesn't work in bun ESM bundle.
**Fix:** Replaced all inline require() with top-level ES imports (`import { execSync } from 'child_process'`).
**Status:** ✅ FIXED

### ISSUE 2: Container test tool "broken promise chain"
**Symptom:** Tool returned "broken async call" / "promise chain is broken".
**Root Cause:** `execute` function was synchronous but `dispatch` returned a Promise. The result was a Promise object being JSON.stringify'd.
**Fix:** Made `execute` async with try/catch, await dispatch.
**Status:** ✅ FIXED

### ISSUE 3: Setup fails — tmux_install_failed
**Symptom:** Setup spawned container but failed at tmux installation.
**Root Cause:** `execInContainer` wraps every command with `cd ~/OPENCODE_WORKSPACE && ${cmd}`. The workspace directory doesn't exist in a fresh container. The `cd` fails, `&&` blocks, nothing executes.
**Fix:** Changed wrapper to `mkdir -p ~/OPENCODE_WORKSPACE 2>/dev/null; cd ~/OPENCODE_WORKSPACE 2>/dev/null || cd ~; ${cmd}`. Also added explicit `docker exec mkdir -p /root/OPENCODE_WORKSPACE` right after container spawn.
**Status:** ✅ FIXED

### ISSUE 4: Setup fails — config_patch_failed (Python SyntaxError)
**Symptom:** Python config patch fails with "unexpected character" SyntaxError.
**Root Cause:** JS template literal string interpolation `${STATE.pluginName}` inside a bash heredoc inside a JSON.stringify'd command — quoting hell.
**Fix:** Replaced heredoc with single-line Python command using literal string values (no template interpolation needed for config path).
**Status:** ✅ FIXED

### ISSUE 5: Setup completes but prompt not detected
**Symptom:** Container spawned, opencode launched, "Ask anything" visible in stream, but pollSync returns false.
**Root Cause:** Prompt detection regex `/(^|\n)\s*Ask anything(\s|$)/` too strict — ANSI escape codes fragment the text so the pattern doesn't match.
**Fix:** Simplified to `/Ask anything/i` (simple case-insensitive substring match).
**Status:** ✅ FIXED

### ISSUE 6: Suite action blocks TUI for 5-15 minutes
**Symptom:** Suite runs 3 tests sequentially, each polling for 60-120s. TUI frozen entire time.
**Root Cause 1:** `pollSync` used `execSync('sleep 0.5')` which blocks the entire Node event loop.
**Fix 1:** Replaced with `pollAsync` using `await new Promise(resolve => setTimeout(resolve, ms))`.
**Root Cause 2:** Even with async polling, suite total duration (3-5 min) exceeds opencode's tool execution timeout (~60-120s).
**Fix 2:** Suite now returns dispatch instructions (like L3). Agent runs each test individually via send→read→check.
**Status:** ✅ FIXED

### ISSUE 7: send with waitForCompletion blocks TUI
**Symptom:** send action with waitForCompletion=true polls for "Ask anything" in spawned container. Takes 10-30s, sometimes exceeds timeout.
**Root Cause:** Polling inside tool call blocks the tool from returning.
**Fix:** send ALWAYS returns immediately (fire-and-forget). Agent uses read/check to poll for response separately.
**Status:** ✅ FIXED

### ISSUE 8: Files action fails on /tmp listing
**Symptom:** `ls -la /tmp/*.txt` returns nothing. Files action reports failure.
**Root Cause:** Test script used glob expansion that didn't match. Files action's ls parsing skipped 'total' line incorrectly.
**Fix:** Parse all lines (not just slice(1)). Check stdout content not just exitCode. Handle 'total' prefix lines.
**Status:** ✅ FIXED

### ISSUE 9: Restart fails — prompt not detected
**Symptom:** Restart kills opencode, relaunches, but prompt not seen within poll window.
**Root Cause:** pipe-pane re-attachment sequence wrong — truncate happened before detach/reattach, losing initial output. Launch command included C-c in same send-keys batch as launch command.
**Fix:** Sequence: kill → Ctrl-C → truncate stream FIRST → detach old pipe-pane → reattach new → launch opencode → poll.
**Status:** ✅ FIXED

### ISSUE 10: Atomics.wait blocks Node event loop
**Symptom:** sleep() and pollSync() used Atomics.wait which blocks ALL Node events including TUI rendering.
**Root Cause:** Atomics.wait is a true blocking call at the OS level.
**Fix:** Replaced with setTimeout-based async sleep. All methods converted to async.
**Status:** ✅ FIXED

### ISSUE 11: writeArtifactFile writes to wrong path
**Symptom:** Artifacts going to global "Trident Agent/GENERATED_ARTIFACTS" instead of project directory. outputPath sometimes treated as file path, sometimes as directory.
**Root Cause:** Three confusing branches in writeArtifactFile. Second branch treated outputPath as a file and did `path.dirname(outputPath)`. Config hardcoded global path.
**Fix:** Simplified to: outputPath ALWAYS = directory. If file, use its dirname. Config changed to `process.cwd()/GENERATED_ARTIFACTS`.
**Status:** ✅ FIXED

### ISSUE 12: CS T1 produces wrong content
**Symptom:** Context synthesis generated content about topic Y when asked for topic X. "Produced generic PLUTUS temporal rules instead of TTE macro shapes."
**Root Cause:** CS T1 had no anti-hallucination system prompt. L1 has strict 5-rule system prompt; CS didn't. CS also lacked contextFiles parameter for first-hand context.
**Fix:** Added CS_T1_SYSTEM with same anti-hallucination rules as L1. Added contextFiles parameter to CS schema.
**Status:** ✅ FIXED

### ISSUE 13: CS schema has duplicate/redundant path params
**Symptom:** CS has targetPath (singular) AND targetPaths (plural). Has outputPath but no fileName. outputName deprecated but still used in calls.
**Root Cause:** Schema evolved without cleanup.
**Fix:** Removed targetPaths. Added outputPath + fileName. All CS calls now use fileName.
**Status:** ✅ FIXED

### ISSUE 14: L2 hangs for 30-40 minutes with nothing on disk
**Symptom:** L2 tool call runs for 30+ minutes. When interrupted, zero content on disk.
**Root Cause:** L2 only writes to disk AFTER the full loop completes. If iteration hangs, all work is lost.
**Fix:** L2 now writes partial content after EACH iteration and on error. Partial files named with _ITER suffix.
**Status:** ✅ FIXED (partial write). Root cause of 30min hang unknown — could be model rate limiting or session API issues.

### ISSUE 15: Omni-vision MAX_FILE_SIZE undefined
**Symptom:** "MAX_FILE_SIZE is not defined" error when calling omni-vision.
**Root Cause:** Constant was orphaned during require() → import cleanup.
**Fix:** Defined MAX_FILE_SIZE_NON_VIDEO (50MB) and MAX_FILE_SIZE_VIDEO (300MB) matching actual MiMo API limits.
**Status:** ✅ FIXED
