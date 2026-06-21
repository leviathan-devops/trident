# EVIDENCE CHAIN — Poseidon Mode

## Per-Cycle Artifacts
.trident/poseidon-audits/{sessionId}/cycle_{N}/
├── AUDIT_RAW.md      — Full 17-layer audit output
├── SCORE.txt         — Extracted score (0-100)
├── PLAN.md           — Remediation plan
├── BUILD_RESULT.md   — Build agent's response
└── CHANGED_FILES.json — File paths + SHA256

## Compaction Survival
.trident/poseidon-audits/{sessionId}/
├── LOOP_STATE.md     — Current cycle, score, target
├── NEXT_STEPS.md     — What phase to resume
├── LOOP_SUMMARY.md   — Final summary
└── FINAL_SCORE.txt   — Exit score
