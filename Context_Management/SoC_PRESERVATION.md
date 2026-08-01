# SoC PRESERVATION — Stream of Consciousness

## Current Mental Model

The integration is conceptually simple but mechanically complex:

1. **The SHIP_PACKAGE is the foundation.** It's solid. All tools work. The user verified this. I should NOT second-guess its architecture.

2. **The Poseidon overlay is the upgrade.** Functioning_Poseidon_V1 has the working v4.4.3 Poseidon code. I just need to transfer the Poseidon-specific methods from there to the SHIP baseline.

3. **The risk is in the transfer.** When I replace INIT, PLAN, DISPATCH, PROBLEM_SOLVE, CONTAINER_TEST in god-loop.ts, I might accidentally consume utility methods that live BETWEEN those phases (BUG-009). This happened before — 18 methods vanished.

4. **The mitigation is verification.** After each wave, grep for all 18 methods. If any are missing, copy them back from the reference.

5. **The 5 bugs are all known.** No investigation needed. Just application.

6. **The container test is the final gate.** If the God Loop achieves PASS terminal on a dirty project, the integration is correct.

## What Could Go Wrong

- **BUG-009 recurrence:** Phase rewrites consuming utility methods. Mitigation: verify all 18 methods after Wave 1.
- **Type drift:** If GodLoopState fields don't match between god-loop.ts and consumers (strategic-intelligence.ts, container-intelligence-probe.ts). Mitigation: import from canonical.
- **Build failures from import changes:** Changing .ts to .js might break if the bundler resolves differently. Mitigation: test build after each change.
- **Leaf enforcement creating false blocks:** If isLeafNode matches too broadly, legitimate parent agent calls get blocked. Mitigation: test with actual agent names.
- **Score computation edge cases:** The BUG-007 fix has three branches (preAudit=0, postAudit=0+cycle>0, postAudit=0+cycle=0). All must be correct.

## What I'm Confident About

- The multi-wave architecture works — proven in container testing with 2-wave dispatch
- The PASS/LOOP terminal works — verified with behavioral probes
- The StrategicIntelligence.evaluate() call works — container test showed PROBLEM_SOLVE executing
- The canon doc writing works — 15 docs verified on disk inside container
- The WaveVerifier bridge works — TRUSTED verdict returned with valid claims JSON
- The leaf enforcement works — runtime assertions confirmed all 5 layers
