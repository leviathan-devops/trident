# HOTFIX: Workspace Path Architecture

## Problem
Build intent files stored in /tmp (wiped on restart) and hardcoded candidate paths (breaks for new projects). No separation between targetPath (code being engineered) and workspacePath (Trident's internal data).

## Solution
Session-scoped in-memory build intent + dedicated project workspace under Active_Projects/

## Flow
1. Build intent detected → stored in-memory (session-scoped via agent-state.ts)
2. Enforcement allows `question` + `trident-poseidon` only
3. Agent asks user for project name via question tool
4. Agent creates workspace: Active_Projects/{sanitized_name}/ with subdirs
5. Agent calls trident-poseidon action=start targetPath=X workspacePath=Y
6. INIT writes all canon docs + state to workspacePath
7. God Loop: ALL internal data → workspacePath, ALL engineering → targetPath

## Changes

### agent-state.ts — Add session-scoped build intent
- setBuildIntent(sessionId, targetPath) — in-memory, per-session
- getBuildIntent(sessionId) — returns {targetPath} or null
- clearBuildIntent(sessionId) — clears after God Loop starts

### trident-hooks.ts — Rewrite enforcement
- DELETE: All /tmp/trident-build-intent-* writes (6 locations)
- DELETE: All /tmp reads (10 locations)
- DELETE: readIntentTarget/readIntentActive helpers
- DELETE: Hardcoded candidate path arrays
- CHANGE: Pre-start enforcement allows `question` + `trident-poseidon`
- CHANGE: All reads use getBuildIntent(sessionId) in-memory
- CHANGE: Debug logging → workspacePath/poseidon/ instead of /tmp

### god-loop.ts — Add workspacePath
- ADD: workspacePath field to GodLoopState
- ADD: INIT Step 0 — verify workspacePath exists
- CHANGE: All internal writes (state.json, canon docs, wave-dispatch, outputs) → workspacePath
- KEEP: All engineering operations (audit, scanTsFiles, readSourceContext) → targetPath

### trident-poseidon.ts — Add workspacePath parameter
- ADD: workspacePath to tool schema
- ADD: sanitizeProjectName() helper
- DELETE: All /tmp references
- CHANGE: state.json path derived from workspacePath
- CHANGE: Intent reads use getBuildIntent(sessionId) in-memory

## Scope
- 5 files modified
- ~50 lines added (storage + workspacePath + sanitize)
- ~80 lines deleted (all /tmp + hardcoded candidates)
- ~30 lines changed (targetPath → workspacePath redirects)

## NOT Changed
- Audit/engineering code (uses targetPath — correct)
- Build intent NLP classifier (clean)
- 6 enforcement layer patterns (just redirect reads)
- WaveVerifier (uses workspacePath for agent-outputs)
- Canon doc generation logic (just redirect output path)
