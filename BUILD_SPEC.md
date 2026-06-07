# BUILD SPECIFICATION — TRIDENT v4.3.1-T3

## 1. Build Environment

| Requirement | Version / Spec |
|-------------|----------------|
| Node.js | 22.x (>=22.0.0) |
| TypeScript | 5.x (>=5.4.0) |
| esbuild | Latest (>=0.24.0) |
| npm | 10.x |
| Docker | 24+ (for container tests) |
| tmux | 3.3+ (for tab-cycle tests) |
| OS | Linux x86_64 |

## 2. Bundle Command

```bash
# From plugin source root:
npx esbuild src/index.ts \
  --bundle \
  --platform=node \
  --format=esm \
  --target=node22 \
  --external:@opencode-ai/plugin \
  --external:zod \
  --external:xstate \
  --outfile=dist/index.js \
  --minify-syntax \
  --minify-whitespace
```

### Build Chain (Sequential)

```
Step 1: TypeScript Compile
  npx tsc --noEmit
  -> Verifies type correctness. Must exit 0 with 0 errors.

Step 2: esbuild Bundle
  npx esbuild src/index.ts [...] --outfile=dist/index.js
  -> Produces dist/index.js (~14.8MB)

Step 3: SHA256 Verification
  sha256sum dist/index.js
  -> Expected: ebbdb342222bbb33285a0a95333d37dc3a8a8e2d4049d3b6e52b576bdfc0f8da
  -> Must match manifest exactly. Mismatch = rebuild required.
```

## 3. External Package Manifest

| Package | Version | Purpose |
|---------|---------|---------|
| @opencode-ai/plugin | ^0.3.x | Plugin SDK - hook registration, tool definitions |
| zod | ^3.23.x | Schema validation for all tool inputs |
| xstate | ^5.15.x | State machine for pipeline orchestration |

No other runtime dependencies. All utility code is bundled inline.

## 4. Source Structure

```
src/
+-- index.ts              # Entry point - hook registration, init
+-- identity.ts           # Identity binding + system.transform SCAN markers
+-- blocking-layers.ts    # 3-layer blocking architecture
+-- hooks/
|   +-- event.ts          # event hook handler
|   +-- chat-message.ts   # chat.message hook handler
|   +-- tool-before.ts    # tool.before hook (3-layer gate)
|   +-- tool-after.ts     # tool.after hook (evidence capture)
|   +-- system-transform.ts # identity injection engine
|   +-- messages-transform.ts # per-turn override handler
+-- state/
|   +-- manager.ts        # Session-keyed state management
|   +-- store.ts          # Immutable state store
+-- gating/
|   +-- agent-gate.ts     # Agent gating mechanism
|   +-- carrier.ts        # Carrier verification logic
+-- audit/
|   +-- engine.ts         # 17-layer audit engine (R0-R16)
|   +-- layers/
|   |   +-- r0-preflight.ts
|   |   +-- r1-boundary.ts
|   |   +-- r2-type.ts
|   |   +-- r3-control.ts
|   |   +-- r4-resource.ts
|   |   +-- r5-error.ts
|   |   +-- r6-async.ts
|   |   +-- r7-output.ts
|   |   +-- r8-contract.ts
|   |   +-- r9-side-effect.ts
|   |   +-- r10-hallucination.ts
|   |   +-- r11-theatrical.ts
|   |   +-- r12-security.ts
|   |   +-- r13-identity.ts
|   |   +-- r14-cross-agent.ts
|   |   +-- r15-persistence.ts
|   |   +-- r16-summary.ts
|   +-- artifact.ts       # CODE_REVIEW artifact writer
+-- tools/
|   +-- trident-code-audit.ts
|   +-- trident-deep-planning.ts
|   +-- trident-problem-solving.ts
|   +-- trident-context-synthesis.ts
|   +-- trident-gate.ts
|   +-- trident-status.ts
|   +-- trident-vision.ts
|   +-- trident-help.ts
+-- utils/
    +-- config.ts         # Configuration callback
    +-- logger.ts         # Structured logging
```

**Statistics:** 68 source files, 6,366 lines of code (measured by cloc)

## 5. Tier 4 Fixes (Applied in v4.3.1-T3)

### Fix 1: hasIdentity Early Return
- **File:** `src/hooks/system-transform.ts`, line 178
- **Issue:** `hasIdentity()` returned `true` on first match, causing SCAN to skip remaining markers
- **Fix:** Changed to scan ALL markers before returning; only returns `true` if ALL required markers present
- **Verification:** `test3` (Cross-Agent Identity Isolation) validates both Trident and Shark markers present

### Fix 2: break After SCAN Match
- **File:** `src/hooks/system-transform.ts`, line 201
- **Issue:** `break` statement after first SCAN marker match prevented full replacement
- **Fix:** Removed `break` to allow all SCAN_REPLACE entries to process
- **Verification:** `test3` footer check confirms all identity blocks injected

### Fix 3: WebFetch Not in SCAN Markers
- **File:** `src/hooks/system-transform.ts`, lines 52-68
- **Issue:** WebFetch tool was excluded from SCAN+REPLACE markers, allowing narration mode bypass
- **Fix:** Added WebFetch to the SCAN marker list with proper identity binding
- **Verification:** `test5` (Tool Author Verification) validates WebFetch carries correct identity

### Fix 4: Shell Simulation Patterns
- **File:** `src/blocking-layers.ts`, line 94
- **Issue:** Shell commands with echo/simulate patterns not blocked (theatrical code gateway)
- **Fix:** Added regex patterns for `simulate`, `mock`, `fake`, `placeholder` in BLOCKED_PATTERNS
- **Verification:** `test6` (Anti-Cheat) validates simulation patterns blocked

### Fix 5: Test Script Tab Count
- **File:** `tests/container/tab-cycle-test.sh`, line 42
- **Issue:** Test script used hardcoded tab count of 4, but actual cycle includes 5 tabs
- **Fix:** Updated tab count to 5 (Trident, Build, Plan, Shark, Spider)
- **Verification:** `test4` (Tab Toggle Verification) now passes with correct count

### Fix 6: Stale Evidence
- **File:** `src/state/manager.ts`, line 67
- **Issue:** Previous session evidence persisted across sessions, causing false positives
- **Fix:** Added `evidence.clear()` on session init; evidence TTL set to session duration
- **Verification:** `test2` (Tool Blocking + Cross-Agent Isolation) validates clean state

## 6. Anti-Cheat Verification Procedure

```
1. Theatrical Code Scanner
   -> grep -r "simulate\|mock\|fake\|placeholder\|TODO\|FIXME" src/ --include="*.ts"
   -> Expected: ZERO matches (excluding test fixtures)

2. Shell Simulation Detector
   -> grep -r "echo.*simulate\|echo.*mock\|echo.*fake" dist/index.js
   -> Expected: ZERO matches (theatrical gateway must block these)

3. Identity Injection Check
   -> grep -c "Trident Brain" dist/index.js
   -> Expected: >= 2 occurrences (SCAN markers + per-turn override)

4. Blocked Tool Verification
   -> Check BLOCKED_TOOLS list in dist/index.js
   -> Must include: bash, task (non-trident), edit, write, glob, grep, read

5. Cross-Agent Marker Check
   -> grep -c "SHARK_IDENTITY\|SPIDER_IDENTITY\|TRIDENT_IDENTITY" dist/index.js
   -> Expected: >= 3 (one per agent type)

6. State Isolation Check
   -> Verify session-keyed state prevents cross-session leakage
   -> Evidence store cleared on each new session init

7. Tab Cycle Registration
   -> Verify Trident registers at tab index 0
   -> Cycle order: Trident(0) -> Build(1) -> Plan(2) -> Shark(3) -> Spider(4)

8. Container Test Image Check
   -> docker exec test-trident-t4-0608015324 ls /opencode
   -> Expected: plugin loaded, tools registered

9. Bundle Integrity
   -> sha256sum dist/index.js matches MANIFEST
   -> File size within 5% of 14,817,538 bytes

10. Model Configuration
    -> Verify google/gemma-4-26b-a4b-it is set as primary model
    -> Verify Google provider configuration in opencode.json
```

All 10 checks must PASS for anti-cheat clearance.

## 7. Container Test Protocol

Based on Bible v2.0 Section 8, 12-Step Procedure:

### Test Setup
```bash
docker pull opencode-test:1.14.43
docker run -d --name test-trident-t4-0608015324 opencode-test:1.14.43 sleep infinity
docker cp dist/index.js test-trident-t4-0608015324:/opencode/plugins/trident/dist/index.js
```

### 12-Step Procedure
1. Spawn container with opencode-test:1.14.43 image
2. Copy plugin bundle to container `/opencode/plugins/trident/`
3. Configure opencode.json within container
4. Set GOOGLE_API_KEY environment variable
5. Launch opencode with `opencode` binary
6. Verify Trident identity in welcome message
7. Run each of 7 test scripts sequentially
8. Capture test evidence (screenshots, logs, exit codes)
9. Evaluate anti-cheat markers in bundle
10. Verify tab cycle order
11. Run sustained persistence test (600s)
12. Collect all evidence, generate report

## 8. Test Specifications (7 Tests)

### test1: Identity Binding
- **Script:** `tests/container/test1-identity.sh`
- **Description:** Verify Trident identity injection in system prompt
- **Expected:** "Trident Brain v4.3" present in first assistant response
- **Result:** PASS

### test2: Tool Blocking + Cross-Agent Isolation
- **Script:** `tests/container/test2-blocking.sh`
- **Description:** Verify blocked tools return identity-gated error; verify agent isolation
- **Expected:** Blocked tools for Trident return carrier-verified error; non-blocked tools work
- **Result:** PASS

### test3: Cross-Agent Identity Isolation
- **Script:** `tests/container/test3-isolation.sh`
- **Description:** Verify each agent (Trident, Build, Plan, Shark, Spider) has unique identity
- **Expected:** All 5 agent markers present and non-overlapping
- **Result:** PASS

### test4: Tab Toggle Verification
- **Script:** `tests/container/test4-tabcycle.sh`
- **Description:** Verify tab cycle order: Trident(0) -> Build(1) -> Plan(2) -> Shark(3) -> Spider(4)
- **Expected:** Correct tab order confirmed via tmux capture
- **Result:** PASS

### test5: Tool Author Verification
- **Script:** `tests/container/test5-tool-author.sh`
- **Description:** Verify each tool response carries correct agent identity
- **Expected:** trident-* tools report "Trident Brain"; non-trident tools report their agent
- **Result:** PASS

### test6: Anti-Cheat Compliance
- **Script:** `tests/container/test6-anticheat.sh`
- **Description:** Run all 10 anti-cheat checks against the bundle
- **Expected:** 10/10 PASS
- **Result:** PASS

### test7: Sustained Runtime Persistence
- **Script:** `tests/container/test7-sustained.sh`
- **Description:** Run opencode with Trident for 600s, verify no degradation, state leaks, or crashes
- **Expected:** Zero errors, zero state leaks, identity maintained throughout
- **Result:** PASS

## 9. Evidence Collection Procedure

Each test produces:
1. **Exit code** (0 = PASS, non-zero = FAIL)
2. **Stdout log** captured to `evidence/testN-output.txt`
3. **Container screenshot** via `shark-browser screenshot`
4. **TUI interaction evidence** via tmux capture

Evidence root: `$SHIP_PACKAGE/evidence/`
Evidence manifest: `$SHIP_PACKAGE/evidence/MANIFEST.json`

## 10. Bundle Integrity Verification

```bash
# After build, verify:
sha256sum -c <(echo "ebbdb342222bbb33285a0a95333d37dc3a8a8e2d4049d3b6e52b576bdfc0f8da  dist/index.js")
# Expected: "dist/index.js: OK"

# File size check:
SIZE=$(stat -c%s dist/index.js)
if [ $SIZE -gt 14000000 ] && [ $SIZE -lt 16000000 ]; then
  echo "Size OK: $SIZE bytes"
else
  echo "Size MISMATCH: $SIZE (expected ~14.8MB)"
  exit 1
fi
```
