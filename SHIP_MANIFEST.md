# ═══════════════════════════════════════════════════════════════
# SHIP MANIFEST — TRIDENT v4.4.2
# ═══════════════════════════════════════════════════════════════

**Package:** Trident v4.4.2 Tool Generator Suite
**Date:** 2026-07-11
**Status:** ALL 5 TOOLS OPERATIONAL
**Build:** 414 modules, 15.48 MB

## Plugin SHA256
```
2eae193f7d24923380b0e1f79cd01ebcebcc25638135709148b94c274f0fc86c
```

## Tool Scores (Container Verified)

| Tool | Score | Lines | Time | Key Evidence |
|---|---|---|---|---|
| L1 | 9/10 | 189 | ~1 min | 8 file:line refs, real construct names, ❌ anti-patterns |
| L2 | 8/10 | 3,371 | ~20 min | 12 sections, 9 classes, 75 expect(), split gen |
| L3 | 9/10 | 13,118 | ~20 min | 4 parallel trident_planner subagents, MASTER_INDEX |
| T1 | 8.5/10 | 152 | ~1 min | 6 patterns, 7 WRONG/RIGHT pairs, 15 troubleshooting rows |
| T2 | 9/10 | 1,969 | ~15 min | 51 Iron Laws, 13 Illusions, compaction-proof |

## Package Contents

```
SHIP_PACKAGE/
├── deploy.sh                    # Automated deployment script (run: ./deploy.sh [container-name])
├── SHIP_MANIFEST.md             # This file
├── FINAL_BUILD_REPORT.md        # 742-line full build report with debug history
├── package.json                 # NPM package (for rebuild)
├── tsconfig.json                # TypeScript config (for rebuild)
├── dist/
│   ├── index.js                 # Built plugin (15 MB, 414 modules)
│   └── sha256.txt               # SHA256 checksum
├── config/
│   ├── config.json              # Container opencode config
│   └── auth.json                # API key auth
├── src/                         # Full source code (204 files)
│   ├── index.ts                 # Plugin entry point
│   ├── tools/trident-tools.ts   # All 5 tool dispatches
│   ├── hooks/trident-hooks.ts   # Guardian hook + task gate
│   ├── artifacts/               # 12 infrastructure files
│   │   ├── l1-brief-builder.ts
│   │   ├── l2-brief-builder.ts
│   │   ├── l2-llm-generator.ts
│   │   ├── l2-quality-audit.ts
│   │   ├── l2-strategy.ts
│   │   ├── l2-adversarial.ts
│   │   ├── l2-reference-library.ts
│   │   ├── l3-engine-discoverer.ts
│   │   ├── shared-llm-loop.ts
│   │   ├── t1-brief-builder.ts
│   │   └── t2-brief-builder.ts
│   └── ... (all other source files)
└── test-project-multidir/       # Multi-directory test project
    └── src/
        ├── audit/
        │   ├── auditor.ts
        │   └── types.ts
        ├── planning/
        │   ├── planner.ts
        │   └── scheduler.ts
        ├── nlp/
        │   ├── analyzer.ts
        │   └── tokenizer.ts
        └── utils.ts
```

## Quick Deploy

```bash
# Option 1: Automated (creates fresh container, deploys everything)
cd SHIP_PACKAGE
./deploy.sh trident-prod

# Option 2: Manual (existing container)
docker cp dist/index.js <container>:/root/.config/opencode/plugins/trident/dist/index.js
docker cp config/config.json <container>:/root/.config/opencode/config.json
docker cp config/auth.json <container>:/root/.local/share/opencode/auth.json
```

## Verification

After deploy, verify:
1. SHA256 match: `docker exec <container> sha256sum /root/.config/opencode/plugins/trident/dist/index.js`
2. TUI shows "Trident" in status bar (not "Build")
3. Test L1: `Run trident-deep-planning with targetPath=/root/test-project and layer=1`

## Rebuild from Source

```bash
cd SHIP_PACKAGE
bun install  # if needed
bun build src/index.ts --outdir dist --target bun --format esm --bundle
sha256sum dist/index.js | awk '{print $1}' > dist/sha256.txt
```

## Configuration

- **Container Image:** `runtime-grade-container-sandbox:master`
- **Model:** `opencode-go/deepseek-v4-flash`
- **API Key:** `sk-9BsmoeL3bz03P5TAwqUDI9BNutDLkISB7paI2OjBSKPenC3KkMKiBP7sVDmkqTWk`
- **Plugin Path:** `/root/.config/opencode/plugins/trident/dist/index.js`
- **Launch Flag:** `--agent trident`
- **Env Var:** `OPENCODE_SKIP_UPDATE=1` (MANDATORY)

## Subagent Types

| Type | Purpose |
|---|---|
| trident | Primary agent (all tools) |
| trident_build | Build execution (Poseidon required) |
| trident_planner | L3 parallel L2 spec generation |
| trident_explore | Read-only research |
