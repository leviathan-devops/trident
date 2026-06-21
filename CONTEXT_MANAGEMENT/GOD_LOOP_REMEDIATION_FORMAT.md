# GOD LOOP — Remediation Plan Format

Every remediation plan MUST follow this structure:

## CYCLE {N} REMEDIATION PLAN
## Current Score: {score}/100

### CRITICAL FINDINGS
1. FILE: relative/path/to/file.ts LINE: 42
   ISSUE: Description of what's wrong
   SEVERITY: critical|high|medium
   FIX: Edit file at line to resolve: {instruction}

### INSTRUCTIONS
- Fix ALL findings in ONE batch
- Report every changed file with SHA256
- DO THE ABOVE AND NOTHING ELSE
