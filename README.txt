╔══════════════════════════════════════════════════════════════════╗
║          TRIDENT BRAIN v4.3.3 — SHIP PACKAGE                    ║
║          Build Date: 2026-06-16                                 ║
║          Bundle SHA256: 1978c895f330702c2001e1a8eafb883f64ea4cd9cfe0ae29ffd8dfa3c3c1740c                           ║
╚══════════════════════════════════════════════════════════════════╝

WHAT'S INCLUDED
════════════════
  dist/index.js              — Plugin bundle (250025 lines, 14 MB)
  src/                       — Full TypeScript source (104 files)
  src/package.json           — Dependencies + build scripts
  src/tsconfig.json          — TypeScript configuration
  src/package-lock.json      — Lockfile for reproducible builds
  identity/trident/          — 13 identity markdown docs
  Checkpoints/               — Almost_There, Almost_There_2, Almost_There_3 (full)
  Ship_Packages/             — CHANGELOG, RELEASE_NOTES, SHIP_MANIFEST, BUILD_REPORT, COMPLETE_DEBUG_LOG
  opencode.json              — Sample opencode config for deployment
  SHIP_MANIFEST.json         — Machine-parseable ship metadata
  HANDOVER_PACKAGE.md        — Complete handover (2,076 lines, 13-part failure report)
  AGENT_BRIEF.md             — Agent identity brief
  POST_COMPACTION_PROMPT.md  — Recovery prompt
  TRIDENT_v4.3.3_*.md        — Full spec + workflow documents

DEPLOYMENT (New Container)
════════════════════════
  1. docker run -d --name trident-v4-test \
       runtime-grade-container-sandbox:master sleep infinity
  2. mkdir -p /root/.config/opencode/plugins/trident/dist
  3. docker cp dist/index.js trident-v4-test:/root/.config/opencode/plugins/trident/dist/index.js
  4. docker cp opencode.json trident-v4-test:/root/.config/opencode/opencode.json
  5. docker cp src/identity/trident/ trident-v4-test:/root/.config/opencode/plugins/trident/src/identity/trident/
  6. docker exec -it trident-v4-test /usr/local/bin/opencode --agent trident

DEPLOYMENT (Existing Container)
══════════════════════════════
  docker cp dist/index.js trident-v4-test:/root/.config/opencode/plugins/trident/dist/index.js
  docker cp src/identity/trident/ trident-v4-test:/root/.config/opencode/plugins/trident/identity/trident/
  docker cp opencode.json trident-v4-test:/root/.config/opencode/opencode.json
  docker exec trident-v4-test sh -c "kill -9 \$(pgrep -f /usr/local/bin/opencode)"
  docker exec -it trident-v4-test /usr/local/bin/opencode --agent trident

BUILD FROM SOURCE
══════════════════
  cd src
  npm install
  npx tsc --noEmit
  npx esbuild index.ts --bundle --platform=node --format=esm --target=node22 \
    --external:@opencode-ai/plugin --external:zod \
    --outfile=../dist/index.js \
    --banner:js='import { createRequire } from "module"; const require = createRequire(import.meta.url);'

KEY FIX (12 Iterations)
════════════════════════
  Root Cause: The opencode SDK tool.execute.before hook passes tool arguments
  in output.args, NOT input.args. input only has {tool, sessionID, callID}.

  task(subagent_type="trident_explore") → ALLOWED
  task(subagent_type=anything else)     → BLOCKED

CERTIFIED: leviathan@LeviathanLocal | 2026-06-16
