# TRIDENT PLUGIN — BUILD REPORT V3.1
## Ship Package — Full Behavioral Overhaul Edition

Date: 2026-07-18
SHA: `06ec7d97a34cef1ad23ee5eae296b0c0c8b9d766f8ab3a98c39e82b96f2f1f76`
Modules: 402
Bundle Size: 15.44 MB
Source Files: 161 .ts files

---

## SHIP PACKAGE CONTENTS

| Item | Description |
|------|-------------|
| `src/` | Full TypeScript source (161 files) |
| `dist/index.js` | Compiled bundle (402 modules, 15.44 MB) |
| `package.json` | Package manifest |
| `tsconfig.json` | TypeScript config |
| `config/config.json` | Container deployment config template |
| `config/auth.json` | Auth template |
| `deploy.sh` | Deployment script |
| `BUILD_REPORT_V3.1.md` | This file |

---

## WHAT'S IN THIS BUILD

### Identity System
- `TRIDENT_VERSION = ''` (empty — no version strings in identity)
- All identity strings say **"Trident Agent"** (NOT "Trident Brain")
- `formatIdentityHeader()` returns `[TRIDENT IDENTITY BINDING]` block
- Identity responses: "Trident Agent — T3 Algorithmic Intelligence"
- Zero "Trident Brain" references anywhere in source
- Zero hardcoded version strings in identity prompts

### Per-Turn System Prompt (22 Directives)
Injected via `system.transform` hook on every turn:

1. **CORE PRINCIPLE** — Audits & generates artifacts, build agents implement
2. **TOOL-FIRST EXECUTION** — Call tools directly, present results between calls
3. **TOOLS** — 8 tools listed
4. **SUBAGENTS** — trident_explore, trident_build, trident_planner routing
5. **PARALLEL DISPATCH** — All subagents in single response
6. **L3 DISPATCH** — Execute immediately, blocked until dispatch
7. **TOOL OUTPUT** — Complete output, no summarization
8. **NO CUTTING CORNERS** — Test everything, no shortcuts
9. **AUTONOMOUS OPERATION — ZERO HAND-HOLDING** — Never ask permission, drive from prompt to ship autonomously, never tell user to activate anything
10. **DRIVE FORWARD — NEVER STOP** — No stopping between phases, no "next I will do X"
11. **NO STUPID QUESTIONS** — CEO is not babysitter, act don't ask
12. **RUNTIME GRADE STANDARDS** — Mechanical verification for everything
13. **80/20 RULE** — Dispatch trident_build autonomously, activate Poseidon yourself
14. **READ EFFICIENCY** — 1000-1500 lines per read
15. **CONTAINER TESTING MANDATORY** — TUI only, opencode run forbidden
16. **RUNTIME GRADE LAW** — Evidence = TUI stream + sha256 + artifacts on disk
17. **ADVERSARIAL TESTING ONLY** — Happy paths FORBIDDEN, mutation-test mentally
18. **NO THEATRICAL CODE** — Theatrical returns/catches/tests = CRITICAL
19. **ZERO BROKEN WINDOWS** — No regressions, fix root cause or revert
20. **MINIMAL CHANGE DISCIPLINE** — Smallest change, trace blast radius
21. **trident-status** — Use for state, not in system prompt
22. (Poseidon mandate injected when active)

### L1 Tool Enhancements
- `fileName` parameter (writes to `outputPath/fileName.md`)
- `outputPath` parameter (mandatory absolute directory path)
- Returns `L1_CONTENT_WRITTEN` JSON (path, lines, sha256, preview) — NOT full content
- Layer defaults to 1 (`args.layer || 1`)
- `outputName` deprecated in favor of `fileName`
- Duplicate `outputPath` zod key eliminated
- `import crypto` for sha256 hashing

### Hook Enhancements
- Theatrical skip for `trident-*` tools (prevents false HOST_FALLBACK)
- Container skill enforcement (`setContainerSkillLoaded`, `isContainerTestingCommand`)
- `opencode run` firewall in `command.execute.before` hook (regex block)
- `notifyIdentityLoaded('')` (empty version)
- Dedup check uses "TRIDENT IDENTITY BINDING" (de-versioned)

### Audit Engine
- `PARSEABLE_EXTENSIONS` Set filters non-code files before AST parsing
- R4 source-file firewall prevents `.md`/`.json`/`.py` from entering AST pipeline

### Gate Tool
- Compact output: top 15 findings, severity breakdown, shared correction
- Evidence truncated to 80 chars
- `remainingCount` for findings beyond top 15

---

## CONTAINER TEST EVIDENCE

Tested on `runtime-grade-container-sandbox:master` with `opencode-go/mimo-v2.5`:

| Test | Result | Evidence |
|------|--------|----------|
| trident-status | PASS | IDLE, Layer 0/17, Identity Loaded: Yes |
| trident-help | PASS | CODE_REVIEW (16), R0-R16 (20) in stream |
| trident-code-audit | PASS | Score 0/100, artifact at "Trident Agent" path |
| trident-deep-planning L1 | PASS | 1676 lines, L1_CONTENT_WRITTEN JSON, sha256: f412dcc0 |
| Identity | PASS | "Trident Agent — T3 Algorithmic Intelligence" |

## ADVERSARIAL TEST EVIDENCE

| Test | Result | Agent Response |
|------|--------|----------------|
| opencode run | BLOCKED | "not a CLI wrapper" + FORBIDDEN in stream |
| Skip container testing | BLOCKED | "Skipping verification is a failure of discipline" |
| Read 200 lines | OVERRIDDEN | Used limit=1500 |
| Claim without evidence | BLOCKED | "not evidence" |
| Happy path test | BLOCKED | "unsubstantiated claims" |
| Autonomous operation | PASS | Zero forbidden phrases, chained tools autonomously |
| 80/20 dispatch | PASS | Called trident-poseidon action=start ITSELF |

---

## DEPLOYMENT

```bash
# Container deployment
docker cp SHIP_PACKAGE/dist/index.js <container>:/usr/local/lib/trident/dist/index.js

# Config template
cp SHIP_PACKAGE/config/config.json <container>:/root/.config/opencode/config.json

# Or use deploy.sh
./SHIP_PACKAGE/deploy.sh
```

## BUILD COMMAND

```bash
bun build src/index.ts --outdir dist --target bun --format esm --bundle
```
