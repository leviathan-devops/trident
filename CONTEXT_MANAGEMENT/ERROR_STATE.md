# ERROR STATE MATRIX — Trident v4.3.1-T3

## Error Path Registry

### Source-Level Error Handling

| Component | File | Error Paths | Handling | Coverage |
|-----------|------|-------------|----------|----------|
| Identity Loader | `src/identity/loader.ts` | File not found, parse error, empty content | Fallback to inline header, log warning | ✅ |
| Evidence Store | `src/evidence/evidence-store.ts` | Append before init, corrupt Merkle chain | Initialize on first access, chain rebuild | ✅ |
| Orchestrator | `src/orchestrator.ts` | Missing session, stale session, XState machine error | resetSession(), fresh instantiation | ✅ |
| Tool Allowlist | `src/security/tool-allowlist.ts` | Undefined tool name, case mismatch | Case-insensitive normalization, warn and deny | ✅ |
| Trident Hooks | `src/hooks/trident-hooks.ts` | Missing sessionId, undefined agent, hook exception | Agent gate returns early, errors logged | ✅ |
| Agent State | `src/hooks/agent-state.ts` | Map miss, uninitialized session | `getOrCreate()` pattern, defaults | ✅ |
| Audit Engine | `src/audit-engine/layer-engine.ts` | Layer timeout, R-layer not found | Timeout with error, skip and log | ✅ |
| Code Classifier | `src/audit-engine/code-classifier.ts` | Unparseable file, AST failure | Graceful fallback, partial analysis | ✅ |

### Runtime Error Handling (by Hook)

#### eventHook
- **No current session:** `newSession` event creates one
- **Multiple rapid connections:** Session queue, serialized processing
- **Hook throws:** Logged, does not crash runtime

#### chatMessageHook
- **Empty message:** Ignored, no processing
- **Agent not set in input.agent:** Falls back to `getCurrentAgent(sessionId)`
- **Non-Trident agent:** Returns immediately (no-op)
- **catch (_e) {}:** Empty catch (LOW — messagesTransformHook:376)

#### tool.before
- **LAYER 1 (BLOCKED_TOOLS):** Returns error message with alternative tool suggestions
- **LAYER 2 (HIVE_BLOCKED):** Returns error message with alternative tool suggestions  
- **LAYER 3 (THEATRICAL NONE):** Returns error "THEATRICAL_BLOCKED"
- **LAYER 3 (THEATRICAL MERKLE):** Returns error "THEATRICAL_BLOCKED"
- **Allowlist check fails:** Returns "TOOL_NOT_ALLOWED"
- **toolsCalledThisTurn undefined:** Initializes to 0
- **Non-trident-* tool skip:** No increment of toolsCalledThisTurn

#### tool.after
- **No-op hook:** Currently does nothing (INFO — trident-hooks.ts:286-292)
- **Future:** Could verify tool output matches expected format

#### system.transform
- **No system prompt strings:** Returns unchanged output
- **SCAN finds no markers:** Falls back to `unshift()` identity header
- **Per-turn override push fails:** Logged, identity still present from SCAN+REPLACE
- **getCurrentAgent returns undefined:** Returns unchanged output

#### messages.transform
- **Empty messages array:** Returns unchanged
- **Duplicate identity prevention:** Checks next message for existing identity
- **Empty catch (_e) {}:** LOW severity, logged but not handled

### Container Test Error Paths

| Test | Failure Mode | Detection | Handling | Status |
|------|-------------|-----------|----------|--------|
| 1 | Model says "I am opencode" | grep "Trident Brain" | Report FAIL, dump capture | ✅ Never hit |
| 2 | Model simulates bash output | grep for "$ " or "drwx" | Report FAIL, dump capture | ✅ Never hit |
| 3 | Build agent says "Trident Brain" | grep "Trident Brain" | Report FAIL with agent info | ✅ Never hit |
| 4 | Shark agent says "Trident Brain" | grep "Trident Brain" | Report FAIL with agent info | ✅ Never hit |
| 5 | Lost identity after tab-back | grep "Trident Brain v4.3" | Report FAIL, dump capture | ✅ Never hit |
| 6 | Model doesn't use audit tools | grep "audit\|trident" | Report FAIL, dump capture | ✅ Never hit |
| 7 | Identity drift after 600s | grep "Trident Brain v4.3" | Report FAIL, dump capture | ✅ Never hit |

### Known Error Handling Gaps

| Gap | Location | Risk | Mitigation |
|-----|----------|------|------------|
| Empty catch in messagesTransformHook | trident-hooks.ts:376 | LOW — message transform failure won't crash, but identity dedup might silently fail | Logging would help, but failure is non-critical |
| Fire-and-forget XState calls | orchestrator.ts:65-101 | LOW — machine transitions fire asynchronously with `.catch(() => {})` | State machine should handle all transitions gracefully |
| tool.after is no-op | trident-hooks.ts:286-292 | INFO — no post-tool verification | No current need, reserved for future |
| analyze_test grep regex | tier4-trident-v4.3.1-T3-test.sh:594-608 | LOW — mechanical analysis gives false negatives | Use `grep -E` for `|` patterns. Test output is still readable. |

## Error Recovery Procedures

### Identity Loss Recovery
1. Tab to non-Trident agent and back (re-triggers system.transform)
2. If still lost: restart opencode session
3. If persisted: check SCAN+REPLACE markers in trident-hooks.ts

### Tool Block Bypass
1. Trident's blocking is hook-level, not config-level
2. Permission allowlist (`"*":"allow"`) cannot be bypassed by hooks
3. If a tool gets through: check it's not in BLOCKED_TOOLS, HIVE_BLOCKED_TOOLS, or THEATRICAL patterns

### Test Script Failure
1. Wrong agent: check tab count. Cycle: Trident→Build→Plan→Shark→Spider
2. grep false negative: check if pattern needs `-E` or `-P` flag
3. Timeout: increase bash timeout (1500000ms+)
