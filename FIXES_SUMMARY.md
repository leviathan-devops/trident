# TRIDENT v4.3.3 — Surgical Fixes Summary

**Reference Documents:**
- OPERATIONAL_IDENTITY_BIBLE.md v2.0
- TRIDENT_v4.3.3_FORENSIC_AUTOPSY.md

---

## Bug 1: `|| "trident"` Fallback Contamination

**Severity:** CRITICAL  
**Autopsy Ref:** Section III — Line 233212  
**Tokens Wasted:** ~4,000 per non-trident session call  

### Problem
When `experimental.chat.system.transform` fires (which NEVER carries agent info — only sessionID and model), the fallback `|| "trident"` caused `isTridentAgent("trident")` to return `true` for EVERY session, including manta-exec, manta-plan, and any other non-trident session.

### Root Cause
The event payload only contains `{ sessionID, model }`. No `agent` or `agentName` field. Every null/undefined check in the fallback chain resolves to the hardcoded `"trident"` literal.

### Fix
Changed two files:
- `src/hooks/trident-hooks.ts:412`: `|| ''` (was already correct in shipped source)
- `src/hooks/session-hook.ts:16`: `|| ''` (was `|| 'trident'` — missed in original)

### Result
`isTridentAgent('')` returns `false` (per `agent-identity.ts:7`: `if (!agentName) return false`). Non-trident sessions no longer get trident identity injected.

---

## Bug 2: Missing Identity Dedup Check

**Severity:** HIGH  
**Autopsy Ref:** Section IV — Lines 233220-233230  
**Tokens Wasted:** ~2,000 per transform (duplicate injection)  

### Problem
No check for `[TRIDENT v4.3.3 IDENTITY BINDING]` in the system array before injecting. On every `system.transform` call, trident identity was injected again, even if already present.

### Fix
Added dedup guard at `src/hooks/trident-hooks.ts:431-434`:
```typescript
const hasTridentIdentity = systemOut.system.some((s: string) =>
  typeof s === 'string' && s.indexOf('[TRIDENT v4.3.3 IDENTITY BINDING]') !== -1
);
if (hasTridentIdentity) return;
```

### Result
Identity only injected once per session. The guard is placed BEFORE the SCAN+REPLACE loop, so no unnecessary work is done.

---

## Bug 3: No Deload on Agent Switch

**Severity:** CRITICAL  
**Autopsy Ref:** Section V — Lines 233188-233252  
**Tokens Wasted:** ~2,000 persisting across agent switches  

### Problem
When the user toggles from trident to another agent (e.g., manta-exec), trident's identity content stayed in the system prompt forever. There was no cleanup mechanism.

### Fix
Added reverse-loop deload at top of `systemTransformHook` in `src/hooks/trident-hooks.ts:415-428`:
```typescript
if (!isTridentAgent(sessionAgent)) {
  for (let i = systemOut.system.length - 1; i >= 0; i--) {
    const s = systemOut.system[i];
    if (typeof s === 'string' && (
      s.indexOf('TRIDENT v4.3.3') !== -1 || 
      s.indexOf('[TRIDENT') !== -1 || 
      s.indexOf('[T1 WARHEAD') !== -1
    )) {
      systemOut.system.splice(i, 1);
    }
  }
  return;
}
```

### Result
When the active agent is not trident, all trident content is removed from the system array. The function returns early, preventing re-injection.

---

## Bug 4: Raw T2 File Embedding

**Severity:** HIGH  
**Autopsy Ref:** Section VI — Lines 232783-232787  
**Tokens Wasted:** ~1,729 per API call  

### Problem
`formatIdentityHeader()` iterated over all identity/*.md files from disk and embedded behavioral synopsis lines with `--- From <filename> (behavioral synopsis) ---` markers directly into the identity header that goes into the system prompt.

Embedded files: EXECUTION.md (2,451 chars), IDENTITY.md (1,615), QUALITY.md (924), TRIDENT.md (1,926) — 6,916 chars total.

### Violations vs OPERATIONAL_IDENTITY_BIBLE.md v2.0
- §2.3: T1 injectables must be <5K chars total — raw embedding alone exceeded this
- §4.3: Code examples, historical context, and background explanations must NEVER go into T1

### Fix
Removed the T2 file iteration loop from `src/identity/index.ts:138-152`. `formatIdentityHeader()` now returns only the clean 6-section identity header:
1. IDENTITY BINDING — who/what the agent is
2. EXECUTION PRINCIPLE — 3-step execution sequence
3. CORE PRINCIPLE — audit engine mandate
4. IDENTITY RULES — WebFetch ban, runtime override
5. 8 TOOLS — 4 mode + 4 support tools
6. ARCHITECTURE — hook system, blocking layers, session management

T1 synthesis (`synthesizeT1Injectables()`) handles all system prompt injectables separately per Operational Bible §V.

### Result
No raw T2 content in system prompt. ~1,729 fewer tokens per API call. Identity header is ~2,000 chars (under 5K budget).

---

## Verification Checklist

- [x] tsc --noEmit = 0 errors
- [x] esbuild bundle = Single ESM file (250,040 lines)
- [x] SHA256: 8c23e95f09374d9c5f1883653d1978335d97d2fc2fef6863d3c2e24e501801b5
- [x] No `|| "trident"` fallback in bundle
- [x] Dedup guard present and before SCAN+REPLACE
- [x] Deload phase present and before identity injection
- [x] No `--- From` markers in bundle
- [x] All 4 modes functional
- [x] trident_explore dispatch functional
- [x] 8 hooks registered
- [x] T1 synthesis wired
