# DEBUG LOG V5 — Trident v4.4.2 Full Session

## Session: 2026-07-18 to 2026-07-20

---

### ISSUE 1: Container test tool "Runtime error" — module resolution
**Symptom:** "Runtime error, internal module resolution, a required package wasn't included at build time"
**Root Cause:** Inline `require('node:child_process')` doesn't work in bun ESM bundle.
**Fix:** Replaced all inline require() with top-level ES imports.
**Status:** ✅ FIXED

### ISSUE 2: Container test tool "broken promise chain"
**Symptom:** "broken async call, broken promise chain"
**Root Cause:** execute() was synchronous but dispatch() returned a Promise.
**Fix:** Made execute() async with try/catch, await dispatch().
**Status:** ✅ FIXED

### ISSUE 3: Setup fails — tmux_install_failed
**Symptom:** Container spawned but tmux install failed.
**Root Cause:** execInContainer wraps with `cd ~/OPENCODE_WORKSPACE && cmd`. Directory doesn't exist in fresh container. `cd` fails, `&&` blocks everything.
**Fix:** Changed to `mkdir -p ~/OPENCODE_WORKSPACE 2>/dev/null; cd ~/OPENCODE_WORKSPACE 2>/dev/null || cd ~; cmd`. Added explicit mkdir after spawn.
**Status:** ✅ FIXED

### ISSUE 4: Setup fails — config_patch_failed (Python SyntaxError)
**Symptom:** Python config patch fails with "unexpected character" SyntaxError.
**Root Cause:** JS template literal `${STATE.pluginName}` inside bash heredoc inside JSON.stringify — quoting collision.
**Fix:** Single-line Python with literal values, no template interpolation. Added `os.path.exists()` check for missing config.json.
**Status:** ✅ FIXED

### ISSUE 5: Prompt not detected after setup
**Symptom:** "Ask anything" visible in stream but pollSync returns false.
**Root Cause:** Regex `/(^|\n)\s*Ask anything(\s|$)/` too strict — ANSI codes fragment text.
**Fix:** Simplified to `/Ask anything/i`.
**Status:** ✅ FIXED

### ISSUE 6: Suite blocks TUI for 5-15 minutes
**Symptom:** Suite runs 3 tests sequentially, TUI frozen entire time.
**Root Cause 1:** pollSync used execSync('sleep') blocking Node event loop.
**Fix 1:** Replaced with pollAsync using setTimeout.
**Root Cause 2:** Suite total duration exceeds opencode tool execution timeout (~60s).
**Fix 2:** Suite returns dispatch instructions. Agent runs each test individually.
**Status:** ✅ FIXED

### ISSUE 7: send with waitForCompletion blocks TUI
**Symptom:** send action polls for 10-30s, exceeds timeout.
**Fix:** send ALWAYS returns immediately. Agent uses read/check to poll.
**Status:** ✅ FIXED

### ISSUE 8: Files action fails on /tmp listing
**Symptom:** ls output parsing failed.
**Fix:** Parse all lines, handle 'total' prefix, check stdout not just exitCode.
**Status:** ✅ FIXED

### ISSUE 9: Restart fails — prompt not detected
**Symptom:** Restart kills opencode, pipe-pane re-attachment timing wrong.
**Fix:** Sequence: kill → Ctrl-C → truncate FIRST → detach → reattach → launch.
**Status:** ✅ FIXED

### ISSUE 10: Atomics.wait blocks Node event loop
**Fix:** Replaced with setTimeout-based async sleep. All methods async.
**Status:** ✅ FIXED

### ISSUE 11: writeArtifactFile writes to wrong path
**Symptom:** Artifacts going to global "Trident Agent/GENERATED_ARTIFACTS". outputPath sometimes treated as file, sometimes directory.
**Fix:** outputPath ALWAYS = directory. Config changed to process.cwd()/GENERATED_ARTIFACTS.
**Status:** ✅ FIXED

### ISSUE 12: CS T1 produces wrong content
**Symptom:** Context synthesis generated content about topic Y when asked for topic X.
**Root Cause:** CS T1 had no anti-hallucination system prompt. No contextFiles param.
**Fix:** Added CS_T1_SYSTEM with 5 anti-hallucination rules. Added contextFiles param.
**Status:** ✅ FIXED

### ISSUE 13: CS schema has redundant path params
**Fix:** Removed targetPaths. Added outputPath + fileName. Fixed targetLines (360 for T1, 3000 for T2).
**Status:** ✅ FIXED

### ISSUE 14: L2 hangs for 30-40 minutes with nothing on disk
**Fix:** L2 writes partial content after EACH iteration and on error.
**Status:** ✅ FIXED (partial write). Root cause of 30min hang unknown.

### ISSUE 15: Omni-vision MAX_FILE_SIZE undefined
**Fix:** Set to MiMo limits: 50MB non-video, 300MB video.
**Status:** ✅ FIXED

### ISSUE 16: Omni-vision detectMediaType missing
**Symptom:** "detectMediaType is not defined" — constants lost during require() → import cleanup.
**Fix:** Restored IMAGE_EXTS, VIDEO_EXTS, AUDIO_EXTS, PDF_EXTS, MIME_MAP, MediaType, detectMediaType, getMime, MIMO_ENDPOINT, MIMO_API_KEY, MIMO_MODEL.
**Status:** ✅ FIXED

### ISSUE 17: Container skill gate false positive on workspace paths
**Symptom:** Commands containing "OPENCODE_WORKSPACE" in path triggered container testing gate.
**Root Cause:** isContainerTestingCommand matched substring "opencode" in workspace path.
**Fix:** Gate rewired to block specific docker/tmux actions (run, exec, cp, stop, rm, kill, send-keys, attach, pipe-pane, kill-session), not substring matching.
**Status:** ✅ FIXED

### ISSUE 18: Container skill gate references skill instead of tool
**Symptom:** Gate message says "Call skill('container-testing') FIRST" — should reference the tool.
**Fix:** Gate rewired to isContainerToolUsed. Error message: "Call trident-container-test FIRST."
**Status:** ✅ FIXED

### ISSUE 19: exec action rejects prompt param
**Symptom:** exec action requires `command` param but model passes `prompt`.
**Fix:** exec now accepts command, cmd, prompt, text as aliases.
**Status:** ✅ FIXED

### ISSUE 20: cp action param confusion
**Symptom:** cp uses source/destination but model passes path/outputPath.
**Fix:** cp now accepts source/from/containerPath/path + destination/to/dest/hostPath/outputPath.
**Status:** ✅ FIXED

### ISSUE 21: check returns massive output
**Symptom:** Matched lines include entire stream content (100KB+).
**Fix:** Truncate matched lines to 200 chars.
**Status:** ✅ FIXED

### ISSUE 22: trident-help references old vision tools
**Symptom:** Help text says "zai-vision_* / visual-cortex_*" instead of trident-omni-vision.
**Fix:** Updated to list trident-omni-vision, trident-container-test, execute_omni_canvas.
**Status:** ✅ FIXED

### ISSUE 23: ContextLines reference "container-testing skill"
**Symptom:** ContextLine says "Use the container-testing skill" instead of the tool.
**Fix:** Changed to "Use the trident-container-test tool."
**Status:** ✅ FIXED
