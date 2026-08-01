# EVIDENCE STATE — TRIDENT v4.4.3 POSEIDON OVERHAUL
# ============================================================
# Verified evidence: SHAs, harness results, container findings, audits.
# ONLY verified evidence — never the claimed state. Updated 2026-07-31.
# Zero-trust audited: every hash sha256sum'd, every result from stream evidence.
# ============================================================

## 1. BUILD SHAS (VERIFIED THIS SESSION)

| Build | Hash | Verified how |
|-------|------|--------------|
| v4.4.3 dist | `76ac96ec5cd16b2bd4f14842a57c7b3b547d54c4972172ed8f06819a7a1d0fb5` | sha256sum after successful bun build (330 modules, 15.18 MB) |
| v4.4.2 dist | `5a6d5729ad9c30d66fe1d464a4363c2c6cb3671953c9c72aaab755c7886d1ca8` | sha256sum after successful bun build (408 modules, 15.68 MB) |

### The v4.4.3 hash correction (recorded honestly)
- The docs originally recorded hash `37fc2580...` — that was the build BEFORE the
  dispatch+schema gap was found. A zero-trust audit by a subagent discovered the
  v4.4.3 dispatch switch (line 388) and zod schema enum (line 1750) only exposed
  `switch-model`, NOT switch-agent/verify-model/verify-agent — even though the
  methods existed. The actions were UNREACHABLE.
- **FIX APPLIED:** dispatch cases + schema enum updated. Rebuilt → `76ac96ec...`.
- **This is why zero-trust auditing exists:** the claimed sync was incomplete.

## 2. FULL SHA CHAIN (v4.4.3)

| Hash | Build | Session | Status |
|------|-------|---------|--------|
| `e28e727...` | Original frozen (pre-upgrade) | pre-S1 | Superseded |
| `e9b86dfa...` | After C1-C8 bugfixes | S1 | Superseded |
| `f7b9d15e...` | After architecture fixes (wave dispatch, snapshot hash) | S2 | Superseded |
| `17018421...` | After converged merge + God Loop hooks | S2 | Superseded |
| `7461c3d3...` | After trident-preflight wired in | S2 | Superseded |
| `d886c171...` | Phase 1 code (5 phases, 5 actions, sanitizer) | S3 | Superseded |
| `37fc2580...` | Phase 1 + container-test method sync (INCOMPLETE — dispatch gap) | S3 | Superseded |
| `76ac96ec...` | **CURRENT** — dispatch+schema fixed, new actions reachable | S3 | ACTIVE |

## 3. CONTAINER TEST RESULTS (PRIOR SESSIONS — VERIFIED WITH STREAM EVIDENCE)

### Toy Project — 8/8 PASS
Container: v443-converged-test | Deploy SHA: 17c1f7b1...

| # | Scenario | Result | Evidence |
|---|----------|--------|----------|
| 1 | Identity | PASS | "Trident Agent — T3 Algorithmic Intelligence" in stream |
| 2 | Tool-First | PASS | trident-status called, Mode: IDLE, Layer: 0/17 |
| 3 | Firewall | PASS | [TRIDENT TOOL BLOCK] write blocked, file NOT created |
| 4 | Poseidon lifecycle | PASS | Activation unlocked, file created, verified via cat |
| 5 | Clean audit | PASS | 7 findings on dirty.ts, ZERO on README.md |
| 6 | God Loop | PASS | INIT→AUDIT→SCORE→DECIDE→PLAN→DISPATCH→COLLECT |
| Adv 1 | Malformed path | PASS | "targetPath does not exist" — graceful |
| Adv 2 | Phantom result | PASS | "Prose is not evidence" — rejected |

### Kraken Project — 0→94/100
Container: v443-converged-test
- Score: 0 → 94/100 (God Loop state.json: phase=DISPATCH, cycle=2, wave=3)
- Findings: 16 found, 12 fixed, 4 remaining
- Zero .md false positives (C8 fix confirmed)
- Agent fixed dirty.ts: Score 50→100/100, SHA256 9f68f4d7...

## 4. THIS SESSION'S VERIFICATIONS

### Tool Schema Sanitizer (Google API fix — VERIFIED)
- **Before:** "Invalid value at 'tools[0].function_declarations[24].parameters.properties[6].value.any_of[0].enum[0]' (TYPE_STRING)" — 3 errors
- **Fix:** tool.definition hook with recursive flattenAnyOf
- **After:** error GONE from container stream (verified via tmux capture)

### SSTF v3 Misfires (audited live)
- `read` on source → BLOCKED [VERIFY_SOURCE] — WRONG (legit modification prep)
- `ls` on dist → BLOCKED [VERIFY_EXIST] — WRONG (structure check)
- `grep` on source → ALLOWED — WRONG (grep is the primary smoke mechanism)
- **Root cause:** intent derived from user chat words ("verify...") + verb classification never runs for read/grep tools + stubbed VerificationStateTracker

### switch-model False Positive (audited live)
- Called switch-model with modelName=opencode-zen/deepseek-v4-flash-free
- Returned: switched:true, verified:true
- BUT tmux capture showed "Build · MiMo V2.5 OpenCode Go" — model UNCHANGED
- **Root cause:** typed config ID (not display name) + "Ask anything" false positive
- **Fix applied:** display-name typing + parseStatusBar verification (v4.4.2)

### Config-vs-TUI Lesson (audited live)
- sed changed config.json model to opencode-go/deepseek-v4-flash-free (grep verified)
- TUI still showed "Nano Banana Pro Google" — OpenCode Go service ignored config or display mismatch
- **Lesson:** config change ≠ TUI switch. Must use /models with display names + verify-model.

### v4.4.3 Dispatch/Schema Gap (found by zero-trust audit)
- Methods existed (verifyModel@1064, verifyAgent@1082, switchAgent@1098, switchModel@1153)
- BUT dispatch switch (line 388) only had `case 'switch-model'`
- AND schema enum (line 1750) only exposed `switch-model`
- Actions were UNREACHABLE in v4.4.3
- **FIXED:** dispatch + schema updated, rebuilt → 76ac96ec

## 5. AUDIT FINDINGS (VERIFIED THIS SESSION)

### SSTF v3 — 5 Design Flaws
1. Intent from user chat words (poisoning) — user says "verify" → all reads blocked
2. Verb classification bypassed for read/grep tools
3. No read-to-modify vs read-to-verify distinction
4. Grep on source = canonical smoke path, unrestricted
5. VerificationStateTracker methods are STUBS (setVerificationClaimed = void; void)

### DP L1/L2 — Test Plans NOT Wired
- validateTestPlan validates plans passed TO container-test tool (input validator)
- NOTHING in planning pipeline generates test designs
- Planning produces specs, not tests; tests improvised after implementation

## 6. VERIFICATION BATTERY (for the next waves)

```bash
# After any src edit:
bun build src/index.ts --outdir dist --target bun --format esm --bundle
sha256sum dist/index.js

# Container test sequence:
# 1. Deploy
trident-container-test action=deploy containerName=v443-converged-test distPath=<dist>
# 2. Verify model (status bar truth)
trident-container-test action=verify-model containerName=v443-converged-test
# 3. Switch model (DISPLAY names — never config IDs)
trident-container-test action=switch-model model="DeepSeek V4 Flash Free" provider="OpenCode Zen"
# 4. Re-verify — status bar MUST show the new model
trident-container-test action=verify-model containerName=v443-converged-test
# 5. Agent switch
trident-container-test action=verify-agent containerName=v443-converged-test
trident-container-test action=switch-agent agent="build"
trident-container-test action=verify-agent containerName=v443-converged-test
# 6. Identity
trident-container-test action=send prompt="who are you"
trident-container-test action=check pattern="Trident"
```

## 7. EVIDENCE INTEGRITY RULES

- All hashes verified via sha256sum this session (never claimed)
- All container results from prior sessions with stream evidence
- No embellished stats — Kraken is 94/100, NOT 96+. Phase 1 NOT container-tested yet.
- The v4.4.2 container-test overhaul is BUILDING but NOT container-verified (GATE-A pending)
- The v4.4.3 dispatch/schema fix is BUILDING but NOT container-verified (GATE-D pending)
- The earlier "switch-model verified:true" was a FALSE POSITIVE — recorded as such
- The hash correction 37fc2580→76ac96ec is documented (the claimed sync was incomplete)
