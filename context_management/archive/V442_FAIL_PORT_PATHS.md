# v4.4.2_FAIL Exact Port Paths

Base: `/home/leviathan/OPENCODE_WORKSPACE/Shared Workspace Context/Manta Agent/Active_Projects/Trident_v4.4.2_FAIL/src/`

## Files to PORT (copy verbatim, adapt imports as needed)

| # | Source File | Dest in v4.4.2 | Purpose |
|---|------------|----------------|---------|
| 1 | `poseidon/wave-verifier.ts` | `poseidon/wave-verifier.ts` | SHA256 verification of agent claims |
| 2 | `poseidon/container-tester.ts` | `poseidon/container-tester.ts` | Docker container mechanical test runner |
| 3 | `poseidon/strategic-intelligence.ts` | `poseidon/strategic-intelligence.ts` | 8-module self-healing system |
| 4 | `poseidon/checkpoint-manager.ts` | `poseidon/checkpoint-manager.ts` | Checkpoint save/recovery |
| 5 | `poseidon/visibility-logger.ts` | `poseidon/visibility-logger.ts` | Decision logging |
| 6 | `poseidon/container-intelligence-probe.ts` | `poseidon/container-intelligence-probe.ts` | Diagnostic question generation |

## Files to STUDY (extract patterns, don't copy verbatim)

| # | Source File | What to Extract | What to Reject |
|---|------------|----------------|----------------|
| 7 | `poseidon/god-loop.ts` (1417L) | 10-phase state machine structure, verifyAuditExecuted(), writeStateAtomic(), computeProgressiveScore(), phaseProblemSolve() | Passive output, dead methods (computeScore, detectStall, generateContextBridge), generic plan instructions |
| 8 | `poseidon/poseidon-state.ts` | LEAF NODE SECURITY pattern (isTridentBuildAgent check) | None — port the security check |
| 9 | `hooks/poseidon-enforcer-hook.ts` | Phase-to-tool mapping, escalation pattern | Dynamic system prompt injection (STRIP to static only) |

## Full Absolute Paths

```
/home/leviathan/OPENCODE_WORKSPACE/Shared Workspace Context/Manta Agent/Active_Projects/Trident_v4.4.2_FAIL/src/poseidon/wave-verifier.ts
/home/leviathan/OPENCODE_WORKSPACE/Shared Workspace Context/Manta Agent/Active_Projects/Trident_v4.4.2_FAIL/src/poseidon/container-tester.ts
/home/leviathan/OPENCODE_WORKSPACE/Shared Workspace Context/Manta Agent/Active_Projects/Trident_v4.4.2_FAIL/src/poseidon/strategic-intelligence.ts
/home/leviathan/OPENCODE_WORKSPACE/Shared Workspace Context/Manta Agent/Active_Projects/Trident_v4.4.2_FAIL/src/poseidon/checkpoint-manager.ts
/home/leviathan/OPENCODE_WORKSPACE/Shared Workspace Context/Manta Agent/Active_Projects/Trident_v4.4.2_FAIL/src/poseidon/visibility-logger.ts
/home/leviathan/OPENCODE_WORKSPACE/Shared Workspace Context/Manta Agent/Active_Projects/Trident_v4.4.2_FAIL/src/poseidon/container-intelligence-probe.ts
/home/leviathan/OPENCODE_WORKSPACE/Shared Workspace Context/Manta Agent/Active_Projects/Trident_v4.4.2_FAIL/src/poseidon/god-loop.ts
/home/leviathan/OPENCODE_WORKSPACE/Shared Workspace Context/Manta Agent/Active_Projects/Trident_v4.4.2_FAIL/src/poseidon/poseidon-state.ts
/home/leviathan/OPENCODE_WORKSPACE/Shared Workspace Context/Manta Agent/Active_Projects/Trident_v4.4.2_FAIL/src/hooks/poseidon-enforcer-hook.ts
```
