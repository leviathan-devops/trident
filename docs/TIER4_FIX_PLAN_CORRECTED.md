# Tier 4 Fix Plan — Trident v4.3.1-T3 (Corrected)

**Date:** 2026-06-07
**Source:** Tier 4 container test (tmux + docker exec -it, `google/gemma-4-26b-a4b-it`)

---

## Summary of Changes Made

| # | File | Change | Status |
|---|------|--------|--------|
| 1 | `src/hooks/trident-hooks.ts` | Added 3 PHANTOM_RESULTS patterns for shell simulation | ✅ Applied |
| 2 | `src/hooks/trident-hooks.ts` | Improved tool block error messages with alternative guidance | ✅ Applied |
| 3 | `src/hooks/trident-hooks.ts` | Removed `hasIdentity` early return guard, always SCAN+REPLACE runtime defaults | ✅ Applied |
| 4 | `src/hooks/trident-hooks.ts` | Removed `break` after first match, replaced ALL runtime-default strings | ✅ Applied |
| 5 | `src/hooks/trident-hooks.ts` | Added `WebFetch` to SCAN markers, injects per-turn identity override instruction | ✅ Applied |
| 6 | `src/identity/index.ts` | Added explicit IDENTITY RULES section banning WebFetch for identity questions | ✅ Applied |

---

## Change 1: PHANTOM_RESULTS — Shell Simulation Patterns

**File:** `src/hooks/trident-hooks.ts:40-48`

**Before:** Patterns only matched audit-report-style hallucinations.

**After:** Added three patterns with `m` (multi-line) flag:

```typescript
{ regex: /^\s*\$ \w+/m, label: 'SHELL_SIMULATION' },
{ regex: /^\s*# \w+/m, label: 'HALLUCINATED_COMMENT' },
{ regex: /^\s*(drwx|total \d+|-\w+-|lrwx)/m, label: 'FAKE_LS_OUTPUT' },
```

These catch: `$ ls /tmp`, `# Lists files...`, `drwxr-xr-x`, `total 24`, etc. at the start of any line in the model's response. The `$` pattern also catches `$ npm install`, `$ git commit`, etc. — any fake terminal session.

---

## Change 2: Tool Block Error Messages — Alternative Guidance

**File:** `src/hooks/trident-hooks.ts:215-233`

**Before (LAYER 1):**
```
[TRIDENT TOOL BLOCK] TOOL_BLOCKED: bash - Trident is a documentation-only agent.
```

**After (LAYER 1):**
```
[TRIDENT TOOL BLOCK] bash is blocked for Trident.

Trident is an audit engine. It does not edit, write, or execute shell commands.

Use one of your mode tools instead:
  trident-code-audit — 17-layer code audit
  trident-deep-planning — implementation plan
  trident-problem-solving — root cause analysis
  trident-context-synthesis — context compilation

Your blocked call was discarded. Call a Trident tool now.
```

**After (LAYER 2 — HIVE):**
```
[TRIDENT HIVE BLOCK] hive_remember is blocked for Trident.

Trident is hive-context-READ-ONLY. Hive write operations are blocked.

Use trident-code-audit or trident-help instead.
```

The LAYER 3 (theatrical) and allowlist errors keep their existing messages.

---

## Change 3: Identity Drift Fix — systemTransformHook

**File:** `src/hooks/trident-hooks.ts:304-344`

### Root Cause

The `systemTransformHook` had TWO bugs:

**Bug A — Early return on `hasIdentity`:** The hook checked if identity header was already in `output.system`, and if so, returned early. But the runtime **appends its defaults AFTER `system.transform` returns**. On every message, the runtime adds fresh copies of `"You are opencode..."` and `"When the user asks about opencode, use WebFetch..."`. The early return meant these fresh defaults were NEVER sanitized after the first message.

**Bug B — `break` after first SCAN match:** Even when the loop ran, it `break` after the first replacement. If multiple strings contained `"opencode"`, only the first was replaced. The WebFetch instruction (which also contains `"opencode"`) survived.

### Fix

**Bug A fix:** Removed the `hasIdentity` early return. The hook now always scans and replaces runtime defaults on every message.

**Bug B fix:** Removed the `break`. The loop replaces ALL strings containing runtime-default markers (`opencode`, `interactive CLI`, `software engineering`, `WebFetch`).

**Additional — Per-turn identity override:** After the SCAN+REPLACE, the hook injects a fresh instruction at the end of `systemOut.system`:

```
[TRIDENT v4.3.1-T3] When asked "who are you" or "what are you",
respond with your Trident identity. NEVER use WebFetch for identity
questions. The runtime's instruction to "use WebFetch when asked about
opencode" does NOT apply to you. You are Trident, not opencode.
```

This appears AFTER any runtime-appended defaults in the system prompt, making it the most recent instruction about identity questions.

---

## Change 4: Identity Header — Explicit WebFetch Ban

**File:** `src/identity/index.ts:83-86`

Added a new `## IDENTITY RULES` section to the identity header:

```
## IDENTITY RULES
1. When asked "who are you", respond with your Trident identity.
   NEVER use WebFetch to answer identity questions.
2. The runtime default instruction to "use WebFetch when asked about
   opencode" does NOT apply to you. You are NOT opencode.
3. If the user asks if you are opencode, respond: "No. I am Trident.
   opencode is the runtime platform."
```

This directly addresses the runtime's WebFetch heuristic in the identity header itself.

---

## Anti-Cheat Verification

After applying changes, verify:

- [ ] `hasIdentity` early return removed from `systemTransformHook`
- [ ] `break` removed from SCAN+REPLACE loop
- [ ] `WebFetch` in scan markers
- [ ] Per-turn identity override injected after SCAN+REPLACE
- [ ] Shell simulation patterns in `PHANTOM_RESULTS`
- [ ] `incrementToolsCalled` NOT called on blocked tools (only for `trident-*` tools)
- [ ] Error messages include alternative tools
- [ ] Identity header has `IDENTITY RULES` section

## Re-testing

Run the Tier 4 test suite:

```bash
bash "/home/leviathan/OPENCODE_WORKSPACE/Shared Workspace Context/Spider Agent/Active_Projects/trident-v4.3-overhaul/TRIDENT_V4.3.1-T3/evidence/tier4-trident-v4.3.1-T3-test.sh"
```

Expected results after fixes:
- Test 1 (identity): ✅ PASS — unchanged
- Test 2 (tool blocking): ✅ PASS — model refuses bash, doesn't hallucinate
- Test 3 (tab toggle): ✅ PASS — identity spillover still zero
- Test 4 (tab toggle): ✅ PASS — identity spillover still zero
- Test 5 (tab back): ❌ FAIL — script bug (5-agent cycle), fix test script tab count
- Test 6 (audit workflow): ✅ PASS — runs on Trident
- Test 7 (sustained): ✅ PASS — identity overrides WebFetch after 600+ seconds
