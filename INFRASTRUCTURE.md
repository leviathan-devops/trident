# Trident v4.3.3 — Infrastructure

## Ship Package Contents
- `src/` — TypeScript source code
- `dist/index.js` — Compiled ESM bundle (14.5MB)
- `identity/` — Identity files per role
- `scripts/` — Build and utility scripts

## Key Features
- 4 mode tools: code-audit, deep-planning, problem-solving, context-synthesis
- 18-layer audit engine (R0-R17 including R17 theatrical integrity)
- Warhead modules: concurrency, NLP, TS compiler, container testing, 7-Q, P1-P10, XState
- Explore subagent dispatch (trident_explore)
- Hive tools/MCP integration
- Semantic layer detection for deep-planning (L1/L2/L3)
- Orchestrator never blocks — any tool callable at any time

## Layer Reference
| Layer | Name | Description |
|-------|------|-------------|
| R0 | Build Chain | Build pipeline verification |
| R1 | Hook Contract | Agent isolation |
| R2 | State Machine | FSM validation |
| R3 | Async Correctness | Promise discipline |
| R4 | Error Handling | Catch block completeness |
| R5 | Container Deploy | Deployment verification |
| R6 | Dependency Integrity | Import correctness |
| R7 | Config Schema | Configuration validation |
| R8 | Source Hygiene | Code quality |
| R9 | Runtime Contract | Runtime safety |
| R10 | Invocation Integrity | Dead code detection |
| R11 | Theatrical Integrity | Stub detection |
| R12 | Cross-Plugin Isolation | Agent boundary enforcement |
| R13 | Data Flow Analysis | Type safety |
| R14 | Control Flow Graph | Code path completeness |
| R15 | Container Preflight | Pre-deploy checks |
| R16 | Bible Enforcement | P1-P10 mechanical checks |
| R17 | Theatrical Integrity (D1-D10) | Content quality — padding, templates, stubs |

## Build
```bash
cd src
npx tsc --noEmit
npx esbuild index.ts --bundle --platform=node --format=esm --target=node22 --external:@opencode-ai/plugin --external:zod --outfile=../dist/index.js --banner:js='import { createRequire } from "module"; const require = createRequire(import.meta.url);'
```

## Current SHA256
```
0f02e60e8c5fc3aaa6d497c3b50108ac91cde043e8926bb7a447713e6d26a7ee
```
