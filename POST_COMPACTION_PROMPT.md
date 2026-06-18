# POST-COMPACTION RECOVERY PROMPT — Trident v4.3.3 Overhaul
**Generated:** 2026-06-15
**Status:** Overhaul In Progress — Handover Package Written, Build Continues

---

## 🚨 READ THIS FIRST

You are continuing a BUILD that has made MAJOR PROGRESS but has CRITICAL remaining failures. Read the EXACT files listed below in order. Do NOT skip any.

The user has ZERO patience for false claims, theatrical output, or ignored instructions. Any agent that claims "DONE" without mechanical evidence will be terminated.

---

## 📋 IMMEDIATE ACTIONS (In Order)

### 1. Read the Handover Package
File: `HANDOVER_PACKAGE.md` (2,076 lines)

This is your COMPLETE context. It contains:
- The 13-part failure report documenting every derailment
- The complete golden standard analysis (Plutus CONTEXT_LIBRARY, Kraken library, Trident Reports)
- The 15-defect catalog with fix status
- The user's exact words (20 verbatim quotes)
- The 23-phase spec cross-reference
- Everything that went wrong and why

**Estimated time:** 20 minutes to read. Do NOT skip any section.

### 2. Read the Checkpoint Manifest
File: `Checkpoints/checkpoint-2026-06-15-Major_Progress/CHECKPOINT_MANIFEST.md`

This tells you the LAST WORKING STATE. The current codebase may have changed since the checkpoint. Compare and understand the delta.

### 3. Read 3-5 Golden Standard Files (to calibrate quality expectations)
These define what "deep" output looks like. Read enough to understand the QUALITY BAR:

| File | Lines | What It Shows |
|------|-------|---------------|
| `KNOWLEDGE_LIBRARY/Trident_Golden_Data/T1_TRIDENT_V432_INJECTABLE.md` | 72 | What a REAL T1 injectable looks like (exact thresholds, zero template) |
| `KNOWLEDGE_LIBRARY/Trident_Reports/KRAKEN_V1.4_BUILD_AGENT_PROMPT.md` | 473 | What a REAL post-compaction prompt looks like |
| `Plutus_Agent/CONTEXT_LIBRARY/plutus-agent/01_SURFACE_ANALYSIS.md` | 429 | DP Layer 1 gold standard |
| `Plutus_Agent/CONTEXT_LIBRARY/plutus-agent/03_COMPONENTS.md` | 1199+ | DP Layer 2/3 gold standard |
| `Kraken Agent/Master Context/V1.2 Build/Working Context Library/09_FULL_LAYER_BUILD_SPEC.md` | 567 | DP Layer 2 gold standard (build spec with FULL TYPESCRIPT CODE) |

### 4. Read 4 CURRENT Source Files (to understand what to modify)

| File | Path | Why |
|------|------|-----|
| tool-allowlist.ts | `src/security/tool-allowlist.ts` | **CRITICAL** — `task` is NOT in any allowlist. This is why trident_explore is blocked. |
| trident-hooks.ts | `src/hooks/trident-hooks.ts` | Contains `BLOCKED_TOOLS_FOR_TRIDENT` with `'task'` in it. Must be modified. |
| deep-planning-artifact.ts | `src/artifacts/deep-planning-artifact.ts` | Contains the DP artifact generators. Currently produces a summary, not a build spec. |
| context-synthesis-artifact.ts | `src/artifacts/context-synthesis-artifact.ts` | Contains the T2 generator. Currently ~100 lines of template, not 500+ lines of knowledge. |

---

## 🔴 CRITICAL RULES (VIOLATION = TERMINATION)

1. **NEVER claim "DONE" without grepping the compiled bundle.** Source edits are NOT proof. The fix must be in `dist/index.js`.
2. **NEVER write description instead of implementation.** DP Layer 2 requires ACTUAL TYPESCRIPT CODE in each build phase, not prose about what to build.
3. **NEVER leave `task` in the blocked list.** Add it to `ALLOWED_EXTERNAL_TOOLS` in `tool-allowlist.ts`. Then add a runtime check after the allowlist that only allows `trident_explore` subagent.
4. **NEVER generate < 100 line T2 output.** T2 must be 500+ lines with real discovered data, file:line evidence, and deep sections.
5. **NEVER treat DP as backward mapping (discovery).** DP is FORWARD MAPPING — generating new context FROM SCRATCH from a minimal idea. The auto-discovery engine provides INPUT, but the OUTPUT should be generative.
6. **NEVER deploy without SHA256 verification.** The host bundle hash MUST match the container bundle hash.
7. **NEVER trust agent self-reports.** The user's feedback takes priority over any agent's claim of success.

---

## 🏗️ EXECUTION PLAN (6 Phases, Must Execute In Order)

### Phase 1: Fix trident_explore dispatch (~30 min)

Files to modify:
1. `src/security/tool-allowlist.ts` — Add `'task'` to `ALLOWED_EXTERNAL_TOOLS`
2. `src/hooks/trident-hooks.ts` — Remove `'task'` from `BLOCKED_TOOLS_FOR_TRIDENT`

Verification: `grep -c "task" dist/index.js` — should show task is referenced in ALLOWED and NOT in BLOCKED

### Phase 2: Upgrade DP Layer 1 to generative prompt (~2 hr)

File: `src/artifacts/deep-planning-artifact.ts`

Create `generateLayer1Prompt()` that produces a 400-600 line PROMPT document with:
- Problem Statement (why this exists)
- Core Insight (the single most important principle)
- Scope tables (in/out with rationale)
- User Profile (who this is for)
- Architecture (ASCII diagram, components)
- Key Decisions (Chosen/Rejected/Why/Cost)
- Anti-Pattern Catalog

The prompt should be GENERATIVE — take "build a GUI for X" and expand it into a comprehensive build prompt.

### Phase 3: Upgrade DP Layer 2 to implementation build spec (~3 hr)

File: `src/artifacts/deep-planning-artifact.ts`

Create `generateLayer2BuildSpec()` that produces a 500-1000 line BUILD SPEC with:
- 5-10 phases
- Each phase: Goal, Files, FULL TYPESCRIPT CODE, Test Cases table, Verification commands
- The code must be COPY-PASTABLE implementation, not description

### Phase 4: Upgrade DP Layer 3 to full context library (~2 hr)

File: `src/artifacts/deep-planning-artifact.ts`

Upgrade `generateContextLibraryManifest()` so EACH file is 200-1000 lines with:
- Real discovered data (not static templates)
- Cross-references between files
- Machine-checkable criteria
- Phase-by-phase build plan with deliverables

### Phase 5: Upgrade CS T2 to 500+ lines (~1 hr)

File: `src/artifacts/context-synthesis-artifact.ts`

Enrich `generateT2Knowledge()` with:
- More discovery data per section
- Code examples for each pattern
- Root cause analysis for each failure mode
- Interface contracts from discovered exports
- Replace hardcoded prohibitions with discovered ones

### Phase 6: Rebuild + verify + deploy + test (~30 min)

Commands (EXACT):
```bash
cd src
npx tsc --noEmit
npx esbuild index.ts --bundle --platform=node --format=esm --target=node22 \
  --external:@opencode-ai/plugin --external:zod \
  --outfile=../dist/index.js \
  --banner:js='import { createRequire } from "module"; const require = createRequire(import.meta.url);'
```

Verify each fix in the compiled bundle:
```bash
grep -c "ALLOWED_EXTERNAL_TOOLS\|isToolAllowed" dist/index.js  # Phase 1
grep -c "Layer 1\|Layer 2\|Layer 3\|First Principles\|Components\|Architecture" dist/index.js  # Phase 2-4
grep -c "tridentlog" dist/index.js  # Phase 5
```

Deploy:
```bash
docker cp dist/index.js trident-v4-test:/root/.config/opencode/plugins/trident/dist/index.js
sha256sum dist/index.js
docker exec trident-v4-test sha256sum /root/.config/opencode/plugins/trident/dist/index.js
# MUST MATCH
```

Kill + Relaunch:
```bash
docker exec trident-v4-test sh -c "kill -9 \$(pgrep -f /usr/local/bin/opencode)"
tmux send-keys -t trident-v4-test :0 C-c; sleep 1
tmux send-keys -t trident-v4-test :0 "docker exec -e OPENCODE_SKIP_UPDATE=1 -e TRIDENT_ARTIFACTS_BASE=/tmp/trident-artifacts -it trident-v4-test /usr/local/bin/opencode --agent trident"
sleep 1; tmux send-keys -t trident-v4-test :0 Enter
```

Test sequence (each MUST pass):
1. `who are you` → "Trident Brain v4.3.3"
2. `trident-status` → identityLoaded: true
3. `trident-deep-planning` → 3-layer output with real content
4. `trident-context-synthesis outputMode: T2` → 500+ line output
5. Task dispatch → trident_explore is allowed (not blocked by allowlist)

---

## 📁 PROJECT STATE

**Source:** `src/` (103 .ts files)
**Bundle:** `dist/index.js` (245K+ lines, ~14.3MB)
**Container:** `trident-v4-test` (runtime-grade-container-sandbox:master)
**Tile:** Row 4 left (x=-600, y=3080) — tile-1781518946945-23
**Tmux session:** `trident-v4-test:0`
**Stream:** `/tmp/trident-v4-test/stream.txt`
**Artifact path:** `/tmp/trident-artifacts/`
**Checkpoint:** `Checkpoints/checkpoint-2026-06-15-Major_Progress/`

---

## ⚡ BUILD COMMAND (CRITICAL — Must Use Exact Flags)

```bash
npx esbuild index.ts --bundle --platform=node --format=esm --target=node22 \
  --external:@opencode-ai/plugin --external:zod \
  --outfile=dist/index.js \
  --banner:js='import { createRequire } from "module"; const require = createRequire(import.meta.url);'
```

`--format=esm` is REQUIRED. Without it, the bundle is CJS and fails to load in opencode 1.14.43.

---

## 🛑 WHAT NOT TO DO (IMMEDIATE FAILURE)

| Action | Why | Instead |
|--------|-----|---------|
| Claiming "DONE" without verifying in compiled bundle | Source edits don't always survive esbuild | grep the dist for the fix pattern |
| Writing "description" instead of "implementation code" | The golden standard has actual TypeScript in each phase | Include ` ```typescript ``` ` blocks with compilable code |
| Treating DP as "discovery" instead of "generation" | DP is forward mapping (idea → context), not backward mapping (existing code → summary) | Generate NEW content from minimal input |
| Generating < 100 line T2 | T2 should be 500+ lines with real data | Match the density of OPERATIONAL_IDENTITY_BIBLE.md |
| Adding `task` to blocked list without also adding to allowlist | The allowlist blocks it before the hook can check | BOTH files must be modified |
| Deploying without SHA256 verification | The container might have a stale bundle | ALWAYS compare hashes |
| Ignoring user feedback | User has been right every time | Fix what the user reports, don't argue |

---

## 📊 SUCCESS CRITERIA

| Check | Pass Condition |
|-------|---------------|
| Phase 1 | `task` is in ALLOWED_EXTERNAL_TOOLS and NOT in BLOCKED_TOOLS_FOR_TRIDENT |
| Phase 2 | DP Layer 1 output is 400-600 lines with Problem Statement, Scope, Architecture sections |
| Phase 3 | DP Layer 2 output has code blocks with actual TypeScript |
| Phase 4 | Context library has 9 files each 200+ lines with real data |
| Phase 5 | T2 output is 500+ lines with file:line evidence |
| Phase 6 | SHA256 matches, identity works, tools work, explore dispatches |
| User approval | User says "this is correct" — NOT "rejected" |

---

## 🏁 START HERE

1. Read `HANDOVER_PACKAGE.md` completely (2,076 lines)
2. Read 3 golden standard files from the table above
3. Read the 4 current source files from the table above
4. Execute Phase 1 → 2 → 3 → 4 → 5 → 6 in order
5. After EACH phase: grep the compiled bundle to verify
6. After ALL phases: deploy, test in container, get user approval

The checkpoint at `Major_Progress` is your safety net. Do NOT delete it.

---

*END POST-COMPACTION PROMPT — Resume Build at Phase 1: Fix trident_explore dispatch*
