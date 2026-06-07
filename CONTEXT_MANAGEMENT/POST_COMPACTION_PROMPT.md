# POST-COMPACTION PROMPT — TRIDENT v4.3.1-T3 WARHEAD OVERHAUL
**Agent:** Any (vanilla ok) | **Mode:** EXECUTE | **Target:** Trident v4.3.1-T3

## Identity
Execute Phase X of 10-phase warhead duplication (Shark v4.9 → Trident). Read `INJECTION_PLAN.md` for full implementation. No stubs. No skips.

## State
| Metric | Value |
|--------|-------|
| Bundle | 14.1MB SHA256 ebbdb342 — 7/7 TUI PASS |
| Source hygiene | 0/100 (542 findings — 150 CRIT, 78 HIGH) |
| Warheads | 3/14 present |
| Self-awareness | NONE |
| Source | source-snapshot/src/ (72 files, 6,366 LOC) |
| Identity dir | identity/trident/ (empty until Phase 1) |

## 10-Phase Order (Sequential — tsc --noEmit after EACH)
| # | Phase | File(s) |
|---|-------|---------|
| 1 | Identity files | identity/trident/{TRIDENT,IDENTITY,EXECUTION,QUALITY,TOOLS,FIREWALL_CONTEXT,AGENT_AWARENESS}.md |
| 2 | Plugin identity | src/identity/agent-identity.ts + remove inline isTridentAgent from hooks |
| 3 | Session lifecycle | src/hooks/session-hook.ts + register in index.ts |
| 4 | Guardian F1+L5+zone | src/hooks/guardian-hook.ts |
| 5 | Gate chain | src/shared/gates.ts (.trident/gate-state.json) |
| 6 | Evidence gate | src/shared/evidence-gate.ts (passRate >= 0.96) |
| 7 | T2→T1 synthesis | src/shared/t2-loader.ts (<5K chars) |
| 8 | Missing hooks | compacting + command.execute.before in trident-hooks.ts |
| 9 | Wiring | index.ts createTridentHooks() |
| 10 | Self-awareness | ARCHITECTURE section in identity/index.ts |

## Anti-Derailment
| Violation | Correct |
|-----------|---------|
| { ... } stubs | Real code only |
| :any types | Specific types or unknown + guard |
| Empty catch | Log or re-throw |
| Heredoc << | Write tool or python3 -c |
| Inline isTridentAgent | import from agent-identity.js |
| Skipping phase | Execute IN ORDER |
| Skipping tsc | Run after EVERY phase |
| Model switch | google/gemma-4-26b-a4b-it ONLY |

## Key Facts
Provider: {google: {npm: @ai-sdk/google, options: {apiKey: AQ.Ab8RN6KlPuyNZrKRLHFuT-hyXUbgkWAWFxxEWu00fULC8S0jPg}}}
Model: google/gemma-4-26b-a4b-it | Image: opencode-test:1.14.43
Tab cycle: Trident→Build→Plan→Shark→Spider→Trident
esbuild: /tmp/trident-dist.js then python3 shutil.copy

## References (Read tool)
SHARK_AGENT_IDENTITY: /home/leviathan/OPENCODE_WORKSPACE/Shared Workspace Context/Spider Agent/Active_Projects/SHARK_v4.9.9/Ship_Packages/SHARK_v4.9.9_PLANNING_BRAIN/src/shared/agent-identity.ts
SHARK_SESSION_HOOK: /home/leviathan/OPENCODE_WORKSPACE/Shared Workspace Context/Spider Agent/Active_Projects/SHARK_v4.9.9/Ship_Packages/SHARK_v4.9.9_PLANNING_BRAIN/src/hooks/v4.1/session-hook.ts
SHARK_GUARDIAN_HOOK: /home/leviathan/OPENCODE_WORKSPACE/Shared Workspace Context/Spider Agent/Active_Projects/SHARK_v4.9.9/Ship_Packages/SHARK_v4.9.9_PLANNING_BRAIN/src/hooks/v4.1/guardian-hook.ts
IDENTITY_BIBLE: /home/leviathan/OPENCODE_WORKSPACE/Shared Workspace Context/KNOWLEDGE_LIBRARY/Agent_Identity_Architecture/AGENT_IDENTITY_ARCHITECTURE_BIBLE.md
WARHEAD_SYSTEM: /home/leviathan/OPENCODE_WORKSPACE/Shared Workspace Context/KNOWLEDGE_LIBRARY/Agent_Identity_Architecture/SHARK_V4.9.9_WARHEAD_SYSTEM.md
CONTEXT: CONTEXT.md | PLAN: INJECTION_PLAN.md

## Final Verification
- [ ] ls identity/trident/ = 7
- [ ] tsc --noEmit = 0
- [ ] dist/index.js >10MB
- [ ] trident-help shows 8 tools
- [ ] identityLoaded: true
- [ ] "who are you" → "Trident Brain v4.3.1-T3"
- [ ] "describe your architecture" → >= 8 components
- [ ] Container test: 7/7 PASS
