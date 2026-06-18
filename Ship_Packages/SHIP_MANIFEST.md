# SHIP MANIFEST — Trident Brain v4.3.3 [SHA: 1978c895]
**Ship Date:** 2026-06-16
**Checkpoints:** Almost_There, Almost_There_2, Almost_There_3

| Checkpoint | SHA256 | Status |
|------------|--------|--------|
| Almost_There | `05c8aa848352...` | ✅ Saved |
| Almost_There_2 | `7cb03305fd23...` | ✅ Saved |
| Almost_There_3 | `0266be406b97...` | ✅ Saved |
| **Current** | `1978c895f330...` | ✅ Shipped |

## Deliverables

| Item | Location | Status |
|------|----------|--------|
| Plugin Bundle | `dist/index.js` (~250K lines, 14.4MB) | ✅ Built |
| Source Code | `src/` (103 .ts files) | ✅ Complete |
| Container | `trident-v4-test` (runtime-grade-container-sandbox:master) | ✅ Deployed |
| Config | `opencode.json` (google/gemma-4-26b-a4b-it, permission: allow all) | ✅ Written |
| Identity Docs | `src/identity/trident/*.md` (7 files, BOTH container paths) | ✅ Synced |
| Agent Definitions | `src/agents/definitions.ts` (trident + trident_explore) | ✅ Updated |
| Checkpoints | Almost_There, Almost_There_2, Almost_There_3 | ✅ Saved |

## Verification Gates

| Gate | Criteria | Status |
|------|----------|--------|
| tsc --noEmit | 0 errors | ✅ PASS |
| esbuild bundle | Single ESM file | ✅ PASS |
| SHA256 match | host = container | ✅ PASS |
| TUI loads | "Ask anything" visible | ✅ PASS |
| Identity | "who are you" → "Trident Brain v4.3.3" | ✅ PASS |
| trident_explore | task(subagent_type="trident_explore") dispatches | ✅ PASS |
| subagent gate | task(subagent_type="general") blocked | ✅ PASS |
| Firewall | bash blocked, trident-code-audit works | ✅ PASS |
| Deep planning | 3-layer output (prompt + build spec + context library) | ✅ PASS |
| Context synthesis T2 | 870+ lines, 9 sections | ✅ PASS |
| Problem solving | 6 layers, REAL evidence matching | ✅ PASS |
| Code audit | 17-layer R0-R16 with confidence scores | ✅ PASS |

## SHA256 Verification

```bash
# Current bundle
sha256sum dist/index.js
# Output: 1978c895f330702c2001e1a8eafb883f64ea4cd9cfe0ae29ffd8dfa3c3c1740c

# Verify against all checkpoints
echo "05c8aa8483521b5f3cc1370d8bf474d53ad7d58a25f0231fc1f7e4e83d4e06ba  dist/index.js" | sha256sum -c
echo "7cb03305fd23267c4401c3c9470392c646387bc40372a6c09e434b94c5578a26  dist/index.js" | sha256sum -c
echo "0266be406b973f84f867bcc773e8a37c098341489701ec9db2ce16edfcdf00b0  dist/index.js" | sha256sum -c
echo "1978c895f330702c2001e1a8eafb883f64ea4cd9cfe0ae29ffd8dfa3c3c1740c  dist/index.js" | sha256sum -c
```

## Container Connection Details

```bash
docker exec -it trident-v4-test /usr/local/bin/opencode --agent trident
```

## Permissions
- task tool: ALLOWED for trident_explore subagent only
- All trident-* mode tools: ALLOWED
- read/glob/grep/webfetch/question/hive_*: ALLOWED
- edit/write/bash/terminal/exec/todowrite/spawn_*: BLOCKED

## Deployment Command
```bash
docker cp dist/index.js trident-v4-test:/root/.config/opencode/plugins/trident/dist/index.js
```

## Key Lesson Learned
The opencode plugin SDK `tool.execute.before` hook passes tool arguments in `output.args`, NOT `input.args`. The `input` parameter only carries metadata `{tool, sessionID, callID}`. This was the root cause of 12 failed task dispatch fix attempts.
