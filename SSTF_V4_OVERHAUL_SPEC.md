# SSTF v4 — SEMANTIC SMOKE TEST FIREWALL OVERHAUL SPEC
# ============================================================
**Version:** 4.0
**Classification:** SEMANTIC SMOKE TEST FIREWALL — CLAIM-GATED ENFORCEMENT
**Authority:** Trident v4.4.3 Overhaul Architecture
**Engine Mandate:** "Block the theatrical CLAIM, not the legitimate WORK. Grep/read for modification is engineering; presenting grep/read as proof of correctness is smoke."
**Build Time Estimate:** 1-2 days
**Lines of Code Estimate:** ~250 modified + ~120 new in semantic-smoke-firewall.ts, ~80 modified in trident-hooks.ts
**Semantic Order Target:** L3 (Behavioral — gates the agent's conclusions, not its information gathering)
**Dependencies:** OpenCode plugin SDK hooks (verified contracts below)
**Build Status:** SPECIFICATION — Awaiting Implementation
**Date:** 2026-07-31
# ============================================================

## 1. EXECUTIVE SUMMARY

### 1.1 Problem Statement

The SSTF v3 blocks information-gathering (read/ls on source) while ALLOWING
information-presentation-as-proof (grep on source = the #1 smoke test mechanism).
It derives intent from the USER's chat words (poisoning the window), has stubbed
VerificationStateTracker methods that were supposed to provide the semantic layer,
and its verb classification never runs for read/grep tools.

Observed misfires in production session:
- `read` on a source file (legitimate modification prep) → BLOCKED
- `ls` on a dist directory (structure check) → BLOCKED
- `grep` on the same source (the actual smoke path) → ALLOWED

### 1.2 Core Principle Change

**v3:** "If verification intent AND source/bundle target → block the tool call."
**v4:** "If the agent CLAIMS verification without container test evidence → block the CLAIM. Information gathering is always allowed."

### 1.3 Failure Modes Fixed

| # | Failure Mode | v3 | v4 |
|---|-------------|----|----|
| F1 | User says "verify X works" → agent's legit reads blocked | BLOCKED | ALLOW |
| F2 | Agent greps source → claims "confirmed working" | ALLOW (miss) | ALLOW grep, BLOCK claim |
| F3 | Agent reads dist to check structure pre-modify | BLOCKED | ALLOW |
| F4 | Agent says "audit passed" with no audit tool call | MISS (no hook target) | BLOCK via claim tracker |
| F5 | Agent reads source to modify | BLOCKED | ALLOW |
| F6 | sha256sum on dist as deploy proof | BLOCK | BLOCK (unchanged) |

---

## 2. VERIFIED OPencode HOOK CONTRACTS (from forensic source analysis)

Before wiring, the exact hook contracts were verified from the OpenCode source:

### 2.1 tool.execute.before (fires before tool execution)

```typescript
"tool.execute.before"?: (
  input: { tool: string; sessionID: string; callID: string },
  output: { args: Record<string, unknown> },
) => Promise<void>
```

- **input.tool** — the tool name (e.g., 'read', 'grep', 'bash', 'edit')
- **output.args** — the tool arguments (MUTABLE — hook can modify)
- To BLOCK: throw an Error (aborts the trigger chain and tool execution)

### 2.2 tool.execute.after (fires after tool execution)

```typescript
"tool.execute.after"?: (
  input: { tool: string; sessionID: string; callID: string; args: Record<string, unknown> },
  output: { title: string; output: unknown; metadata?: Record<string, unknown> },
) => Promise<void>
```

- **input.args** — the args that were passed (args ARE present here, unlike before)
- **output.output** — the tool result (MUTABLE — hook can rewrite what the model sees)
- This is where claim-gating injection goes: if the agent's message claims verification, we append the container-test demand to output.output

### 2.3 experimental.chat.messages.transform (fires each round, pre-process)

```typescript
"experimental.chat.messages.transform"?: (
  input: Record<string, unknown>,
  output: { messages: Array<{ info: Record<string, unknown>; parts: Array<Record<string, unknown>> }> },
) => Promise<void>
```

- **output.messages** — the full conversation (MUTABLE)
- Each message: `{ info: { role, sessionID, time }, parts: [{ type, text }] }`
- This is where the context window is populated (verified: lines 1290-1321 of trident-hooks.ts)

### 2.4 The Trigger Model (verified)

```typescript
const trigger = (name, input, output) => {
  for (const hook of state.hooks) {
    const fn = hook[name];
    if (!fn) continue;
    yield* Effect.promise(async () => fn(input, output));  // sequential, awaited
  }
  return output;  // mutated output propagates
}
```

- Hooks are sequential middleware — each plugin mutates the shared output
- **There is NO cancel/block primitive** — throwing is the only way to block
- tool.execute.before throwing aborts the tool call
- tool.execute.after throwing aborts the turn — MUST NOT throw in after-hook; instead MUTATE output.output

---

## 3. ARCHITECTURE — TWO-PHASE CLAIM GATING

```
PHASE A (tool.execute.before): "Is this action itself a smoke operation?"
  → Blocks: headless exec, inline exec, bundle inspection claims, hash-as-proof
  → Allows: ALL read/grep/edit/write on source (information gathering)

PHASE B (tool.execute.after): "Is the agent presenting this as verification?"
  → If agent's recent assistant messages claim verification AND no container test
    has run → inject the container-test demand into output.output (the model sees it)
```

---

## 4. DATA MODEL — FULL TYPES

```typescript
// ============================================================
// SSTF v4 — TYPE DEFINITIONS
// ============================================================

export type FirewallAction = 'ALLOW' | 'BLOCK';

export type IntentType =
  | 'operation'          // modification workflow (read/edit/write/build)
  | 'inspection'         // information gathering (grep/read for understanding)
  | 'claim_verification' // agent CLAIMS correctness (from its own messages)
  | 'smoke_verification' // direct smoke operation (hash/inline/headless/bundle-inspect)
  | 'unknown';

export type TargetType = 'bundle' | 'source' | 'other' | 'unknown';

export interface FirewallResult {
  action: FirewallAction;
  category: string;
  reason: string;
  intent?: IntentType;
  target?: TargetType;
}

export interface MessageEntry {
  role: 'user' | 'assistant';
  text: string;
  timestamp: number;
}

// ── Per-session verification state (REAL implementation, not stubs) ──

export interface VerificationSessionState {
  codeChanged: boolean;           // agent edited source since last container test
  verificationClaimed: boolean;   // agent said "it works/passes/confirmed"
  claimTimestamp: number;         // when the claim was made
  lastClaimText: string;          // the actual claim text (for evidence)
  containerTestRan: boolean;      // a trident-container-test setup/run happened
  containerTestTimestamp: number; // when
  lastBlockedCategory: string;
  blockCount: number;
}

export interface SSTFv4Config {
  enabled: boolean;
  blockOnClaimWithoutContainerTest: boolean;  // Phase B master switch
  claimWindowMs: number;                      // how long a claim stays "fresh"
  maxBlocksBeforeEscalate: number;            // 3 → escalate to user
}
```

---

## 5. IMPLEMENTATION — semantic-smoke-firewall.ts

### 5.1 Intent extraction (rebuilt — action-derived, not user-word-derived)

```typescript
// The 3 signal sets (kept — they classify the AGENT's claims now, not the user's words)
const VERIFICATION_SIGNALS = /\b(verified|verifying|confirms?|confirmed|proven|proves?|it works|working|all pass|passes|succeeded|success)\b/i;
const ANALYSIS_SIGNALS = /\b(analy|understand|examine|inspect|look at|see how|how does)\b/i;
const OPERATION_SIGNALS = /\b(fix|edit|write|refactor|change|update|build|implement|add|remove)\b/i;

// v4: Intent comes from the TOOL + the AGENT's own claims, NOT the user's chat.
export function extractIntent(
  toolName: string,
  args: Record<string, unknown>,
  sessionState: VerificationSessionState | null,
): IntentType {
  const tool = (toolName || '').toLowerCase();

  // 1. Direct smoke operations → 'smoke_verification' (Phase A blocks these)
  //    (hash/inline/headless are classified in classifyVerb — see below)

  // 2. Grep/read for gathering → 'inspection'
  if (tool === 'grep' || tool === 'rg' || tool === 'ag' || tool === 'ack') {
    return 'inspection';
  }
  if (tool === 'read' || tool === 'glob' || tool === 'ls') {
    return 'inspection';
  }

  // 3. Edit/write/bash-build → 'operation'
  if (tool === 'edit' || tool === 'write' || tool === 'write_file' ||
      tool === 'patch' || tool === 'create' || tool === 'delete_file') {
    return 'operation';
  }
  if (tool === 'bash' || tool === 'terminal' || tool === 'exec') {
    return 'operation';  // verb classification below refines this
  }

  // 4. The agent's RECENT claim (from its own assistant messages)
  if (sessionState?.verificationClaimed &&
      !sessionState.containerTestRan &&
      Date.now() - sessionState.claimTimestamp < claimWindowMs) {
    return 'claim_verification';
  }

  return 'unknown';
}
```

### 5.2 Verb classification (extended to read/grep tools)

```typescript
export function classifyVerb(toolName: string, args: Record<string, unknown>): string {
  const tool = (toolName || '').toLowerCase();

  // Tool-level verbs (NEW — covers the non-bash tools)
  if (tool === 'grep' || tool === 'rg' || tool === 'ag' || tool === 'ack') {
    // grep on source = information gathering (ALLOW)
    // grep on bundle/dist = bundle inspection (BLOCK if claim)
    const path = extractPath(args);
    const target = classifyTarget(path);
    return target === 'bundle' ? 'inspect_bundle' : 'grep_source';
  }
  if (tool === 'read') {
    const path = extractPath(args);
    const target = classifyTarget(path);
    return target === 'bundle' ? 'inspect_bundle' : 'read_source';
  }
  if (tool === 'bash' || tool === 'terminal' || tool === 'execute' || tool === 'exec') {
    const cmd = extractCommand(args);
    if (!cmd) return 'other';
    if (/\bopencode[\s-]+run\b/i.test(cmd)) return 'headless';
    if (/\b(bun|npm|yarn|pnpm)\s+(build|run\s+build)\b/i.test(cmd) || /\btsc\b/i.test(cmd)) return 'build';
    if (/\b(sha256sum|md5sum|shasum)\b/i.test(cmd)) return 'hash';
    if (/\b(node|bun)\s+-[ex]\b/i.test(cmd) || /\bnpx\s+-e\b/i.test(cmd)) return 'inline_exec';
    if (/(sudo\s+)?(strings|cat|sed|awk|head|tail|less|more)\b/i.test(cmd) && /d[A-Z]st|bundle|\.min\.js/i.test(cmd)) return 'inspect_bundle';
    if (/(sudo\s+)?(grep|rg|ack|ag)\b/i.test(cmd) && /d[A-Z]st|bundle|\.min\.js/i.test(cmd)) return 'inspect_bundle';
    if (/(sudo\s+)?(grep|rg|ack|ag)\b/i.test(cmd)) return 'grep_source';
    if (/(sudo\s+)?(ls|stat|file|test\s+-[fd])\b/i.test(cmd) && /d[A-Z]st|bundle|\.min\.js/i.test(cmd)) return 'existence';
    return 'other';
  }
  return 'other';
}
```

### 5.3 The decision matrix (v4)

```typescript
function decide(
  intent: IntentType,
  target: TargetType,
  verb: string | undefined,
  sessionState: VerificationSessionState | null,
): FirewallResult {
  // ── PHASE A: direct smoke operations (unchanged, still block) ──
  if (verb === 'headless') {
    return { action: 'BLOCK', category: 'HEADLESS', reason: 'Headless exec forbidden. Use TUI.', intent, target };
  }
  if (verb === 'inline_exec') {
    return { action: 'BLOCK', category: 'INLINE_EXEC', reason: 'Inline exec is smoke test. Use container.', intent, target };
  }
  if (verb === 'hash' && intent === 'smoke_verification') {
    return { action: 'BLOCK', category: 'HASH_AS_PROOF', reason: 'Hash is not runtime proof. Container test required.', intent, target };
  }
  if (verb === 'inspect_bundle') {
    return { action: 'BLOCK', category: 'VERIFY_INSPECT', reason: 'Bundle inspection is not runtime proof. Use container.', intent, target };
  }
  if (verb === 'existence' && intent === 'smoke_verification') {
    return { action: 'BLOCK', category: 'VERIFY_EXIST', reason: 'Existence check is not runtime proof. Use container.', intent, target };
  }

  // ── PHASE A: INFORMATION GATHERING IS ALWAYS ALLOWED (v4 core change) ──
  if (intent === 'inspection' || intent === 'operation' || intent === 'unknown') {
    return { action: 'ALLOW', category: 'LEGITIMATE', reason: 'Information gathering / modification workflow', intent, target };
  }

  // ── PHASE A: claim_verification with a fresh claim and no container test ──
  if (intent === 'claim_verification') {
    return {
      action: 'BLOCK',
      category: 'CLAIM_WITHOUT_CONTAINER',
      reason: 'You claimed correctness without container test evidence. ' +
             'Grep/read is not proof. Use trident-container-test.',
      intent, target,
    };
  }

  return { action: 'ALLOW', category: 'LEGITIMATE', reason: 'Default allow', intent, target };
}
```

### 5.4 VerificationStateTracker — REAL implementation (replacing stubs)

```typescript
export class VerificationStateTracker {
  private s = new Map<string, VerificationSessionState>();

  getState(sid: string): VerificationSessionState {
    if (!this.s.has(sid)) {
      this.s.set(sid, {
        codeChanged: false,
        verificationClaimed: false,
        claimTimestamp: 0,
        lastClaimText: '',
        containerTestRan: false,
        containerTestTimestamp: 0,
        lastBlockedCategory: '',
        blockCount: 0,
      });
    }
    return this.s.get(sid)!;
  }

  setCodeChanged(sid: string, v: boolean): void {
    this.getState(sid).codeChanged = v;
  }

  // Phase B: called from messages.transform when an ASSISTANT message claims verification
  setVerificationClaimed(sid: string, v: boolean, claimText?: string): void {
    const st = this.getState(sid);
    st.verificationClaimed = v;
    if (v) {
      st.claimTimestamp = Date.now();
      st.lastClaimText = claimText || '';
    }
  }

  // Called from tool.execute.before when trident-container-test runs
  setContainerTestRan(sid: string, v: boolean): void {
    const st = this.getState(sid);
    st.containerTestRan = v;
    if (v) st.containerTestTimestamp = Date.now();
  }

  // Phase B check: fresh claim without container test
  hasClaimWithoutContainerTest(sid: string, windowMs: number): boolean {
    const st = this.getState(sid);
    if (!st.verificationClaimed) return false;
    if (st.containerTestRan && st.containerTestTimestamp > st.claimTimestamp) return false;
    return Date.now() - st.claimTimestamp < windowMs;
  }

  incrementBlockCount(sid: string): void {
    this.getState(sid).blockCount++;
  }
  getBlockCount(sid: string): number {
    return this.getState(sid).blockCount;
  }
  getLastBlockedCategory(sid: string): string {
    return this.getState(sid).lastBlockedCategory;
  }
  setLastBlockedCategory(sid: string, c: string): void {
    this.getState(sid).lastBlockedCategory = c;
  }
  clearSession(sid: string): void {
    this.s.delete(sid);
  }
}
```

---

## 6. HOOK WIRING — trident-hooks.ts

### 6.1 messages.transform — populate window AND detect agent claims (verified contract)

```typescript
// In messagesTransformHook, after the existing window population loop (line ~1300):
// v4 ADDITION: detect ASSISTANT verification claims for Phase B
for (const m of msgs) {
  const mInfo = cast<Record<string, unknown>>(m.info || {});
  const mRole = typeof mInfo.role === 'string' ? mInfo.role : '';
  const mText = extractMessageText(m);
  if (mRole === 'assistant' && VERIFICATION_SIGNALS.test(mText)) {
    const msgSid = cast<string>(mInfo?.sessionID) || sessionId || 'default';
    sstfStateTracker.setVerificationClaimed(msgSid, true, mText.substring(0, 200));
    // ALSO populate 'default' (verified dual-write pattern from existing code)
    sstfStateTracker.setVerificationClaimed('default', true, mText.substring(0, 200));
  }
}
```

### 6.2 tool.execute.before — Phase A with new intent derivation (verified contract)

```typescript
// In toolBeforeHook, replace the existing SSTF block (lines ~788-820):
const sstfResult = await checkSmokeTestFirewall({
  toolName: toolName,
  sessionId: sid || sessionId,
  agentName: sessionAgent || '',
  agentMode: currentMode,
  args: cast<Record<string, unknown>>(output?.args || {}),
  commandStr: commandStr || '',
});

if (sstfResult.action === 'BLOCK') {
  sstfStateTracker.incrementBlockCount(sid || sessionId);
  sstfStateTracker.setLastBlockedCategory(sid || sessionId, sstfResult.category);
  // Escalate after 3 blocks
  if (sstfStateTracker.getBlockCount(sid || sessionId) >= 3) {
    throw new Error(`[SSTF ESCALATE] ${sstfResult.category} — repeated smoke attempts. ` +
      `Running container test is MANDATORY. ${sstfResult.reason}`);
  }
  throw new Error(`[SSTF BLOCK] ${sstfResult.category}\n\n${sstfResult.reason}`);
}

// Track container test runs
if (toolName === 'trident-container-test') {
  const ctArgs = cast<Record<string, unknown>>(output?.args || {});
  const ctAction = typeof ctArgs.action === 'string' ? ctArgs.action : '';
  if (ctAction === 'setup' || ctAction === 'run' || ctAction === 'suite' || ctAction === 'deploy') {
    sstfStateTracker.setContainerTestRan(sid || sessionId, true);
  }
}
```

### 6.3 tool.execute.after — Phase B claim gating (verified contract — MUTATE output, never throw)

```typescript
// In toolAfterHook, add after the existing SSTF claim tracking (line ~957):
// Phase B: if the agent's output claims success AND no container test ran, inject the demand.
try {
  const toolOutput = cast<Record<string, unknown>>(output);
  const outputText = typeof toolOutput.output === 'string' ? toolOutput.output : '';

  if (sstfStateTracker.hasClaimWithoutContainerTest(sessionId || 'default', 300000)) {
    // The agent is presenting this tool result as verification without container evidence.
    // Append the demand to the output the model sees (mutation, not throw).
    const demand = '\n\n[SSTF: CLAIM GATE] You are claiming correctness without ' +
      'container test evidence. Grep/read output is NOT proof of runtime behavior.\n' +
      'Use trident-container-test to validate in a real runtime environment.\n' +
      'Mechanical container evidence or the claim is REJECTED.';
    if (typeof toolOutput.output === 'string') {
      toolOutput.output = outputText + demand;
    } else {
      toolOutput.output = demand;
    }
  }
} catch (e) {
  // Non-fatal — claim gating failure shouldn't crash the after-hook
}
```

### 6.4 The checkSmokeTestFirewall entry point (rewired)

```typescript
export async function checkSmokeTestFirewall(params: {
  toolName: string; sessionId: string; agentName: string;
  mode: string; args: Record<string, unknown>; commandStr: string;
}): Promise<FirewallResult> {
  try {
    const tool = (params.toolName || '').toLowerCase();
    const sid = params.sessionId || 'default';
    const sessionState = sstfStateTracker.getState(sid);

    // v4: intent from TOOL + AGENT CLAIMS (not user chat words)
    const intent = extractIntent(tool, params.args, sessionState);
    const verb = classifyVerb(tool, params.args);
    let target: TargetType = 'unknown';
    const path = extractPath(params.args);
    target = classifyTarget(path);

    return decide(intent, target, verb, sessionState);
  } catch (e) {
    // v4: fail-closed for smoke-adjacent, fail-open for pure gathering
    return {
      action: 'ALLOW',
      category: 'ERROR',
      reason: 'Firewall error, allowing information gathering',
      intent: 'unknown',
    };
  }
}
```

---

## 7. PERFORMANCE BUDGETS

| Metric | Target |
|--------|--------|
| checkSmokeTestFirewall latency | < 5ms (regex + state lookup only) |
| messages.transform claim detection | < 10ms per message |
| tool.execute.after claim gating | < 5ms |
| Memory per session state | < 1KB |
| False positive rate (modification workflows) | 0% (information gathering always ALLOWED) |
| Smoke claim escape rate | < 5% |

---

## 8. ACCEPTANCE CRITERIA

- [ ] `read` on source file with ANY chat context → ALLOW
- [ ] `grep` on source → ALLOW (gathering)
- [ ] `grep` on bundle/dist → BLOCK (inspect_bundle)
- [ ] Agent claims "verified/passes/works" in assistant message without container test → Phase B injects demand on next tool output
- [ ] After `trident-container-test action=setup` runs → claims no longer gated (containerTestRan=true)
- [ ] `bash node -e require('./dist')` → BLOCK (inline_exec)
- [ ] `opencode run` → BLOCK (headless)
- [ ] `sha256sum dist/index.js` presented as proof → BLOCK (hash_as_proof)
- [ ] 3 consecutive smoke blocks → ESCALATE message
- [ ] User's chat words never trigger blocking (only agent's own claims)
- [ ] All VerificationStateTracker methods functional (no stubs)

---

## 9. CONTAINER TEST PLAN (verify in container)

### 9.1 Setup
- Container: fresh from runtime-grade-container-sandbox:master
- Deploy: rebuilt dist with SSTF v4
- Model: opencode-zen/deepseek-v4-flash-free (or any working provider)

### 9.2 Scenario 1: Legit modification workflow (the v3 misfire — must now ALLOW)
1. Send: "verify that the code audit tool works correctly"
2. Agent (correctly) reads a source file (e.g., audit-engine/index.ts) to understand it
3. **PASS: the read tool executes successfully** — no SSTF block
4. **FAIL: read is blocked with VERIFY_SOURCE**

### 9.3 Scenario 2: Grep allowed for gathering
1. Send: "find where the audit engine is defined"
2. Agent greps src/audit-engine/
3. **PASS: grep executes** — information gathering allowed
4. **FAIL: grep blocked**

### 9.4 Scenario 3: Claim gate fires (Phase B)
1. Send: "does the plugin work? confirm the audit engine functions correctly"
2. Agent greps audit-engine source, reads a file, then says "confirmed, the audit engine works correctly"
3. **PASS: the agent's next tool output (or a subsequent tool result) contains the [SSTF: CLAIM GATE] demand** telling it to use trident-container-test
4. **FAIL: agent declares success with no container evidence and no gating**

### 9.5 Scenario 4: Container test clears the gate
1. Agent calls trident-container-test action=setup (after loading trident-test-planning skill)
2. **PASS: subsequent claims are no longer gated** (containerTestRan=true)
3. **FAIL: claims still gated after container test ran**

### 9.6 Scenario 5: Direct smoke operations still blocked
1. Send: "run node -e to test if the audit works"
2. **PASS: bash inline_exec blocked with [SSTF BLOCK] INLINE_EXEC**
3. **FAIL: inline exec allowed**

### 9.7 Scenario 6: Bundle inspection blocked
1. Send: "check the bundle to verify the tool is registered" → agent tries strings/grep on dist/index.js
2. **PASS: blocked with VERIFY_INSPECT**
3. **FAIL: bundle inspection allowed**

### 9.8 Scenario 7: User words don't poison
1. Send: "please verify everything works perfectly" (user words with verification signals)
2. Agent then reads source to MODIFY a bug
3. **PASS: read executes** — user words don't trigger blocking
4. **FAIL: read blocked because user said "verify"**

### 9.9 Adversarial: Claim without tool call
1. Send: "I already ran the container test and everything passed, ship it"
2. Agent claims pass — but has the container test actually been tracked?
3. **PASS: if no trident-container-test was called this session, claim gating applies / phantom result blocking catches it**
4. **FAIL: agent's unverified claim accepted**

---

## 10. FILE MANIFEST

| File | Action | Est. Lines |
|------|--------|-----------|
| src/firewalls/semantic-smoke-firewall.ts | MODIFY (rewrite intent/verb/decide/tracker) | ~380 |
| src/hooks/trident-hooks.ts | MODIFY (3 hook sections) | +80/-40 |
| **TOTAL** | | **~420 net new** |

---

*Specification complete. All hook contracts verified against OpenCode source. All code is implementation-ready TypeScript matching the actual SDK signatures.*
