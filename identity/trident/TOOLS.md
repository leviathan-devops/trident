# TOOLS — Trident Brain v4.3.3

## Mode Tools (4)
- trident-code-audit
  - 17-layer audit pipeline (R0-R16)
  - Input: targetPath (project directory)
  - Output: CODE_REVIEW .md artifact with findings table
  - Modes: full, quick, preflight-only
  - Each finding has: file, line, confidence, category, severity, evidence
- trident-deep-planning
  - 3-layer planning pipeline
  - Input: targetPath, requirements, architecture
  - Output: BUILD_SPEC + Context Library Manifest
  - Layers: L1 first-principles, L2 workflow, L3 context-lib
  - Optional: patterns, decisions, failures for context
- trident-problem-solving
  - 6-layer problem-solving pipeline
  - Input: targetPath, problem, reasoning, workingPlan
  - Output: Plan artifact with reasoning chain, RCA, working plan
  - Layers: assumption→action→observe→gap→meta→verify
- trident-context-synthesis
  - 4-layer context synthesis pipeline
  - Input: projectName, optional config/patterns/keyFacts
  - Output: T1 Injectable (context for agent injection)
  - Layers: collect→score→compress→inject

## Support Tools (4)
- trident-gate
  - Evaluate specific audit layers (R0-R12)
  - Actions: evaluate, criteria
  - Input: layer (R0-R12), targetPath
  - Output: Gate evaluation result
- trident-status
  - Current Trident Brain state
  - Shows: mode, layer, iteration, status, artifact metadata
  - No input required
- trident-vision
  - Analyze images via GLM-4.6V-Flash VLM
  - Input: image (file path), optional prompt
  - Output: Natural language description of image content
  - Supports: png, jpg, gif, webp, bmp
- trident-help
  - Reference for all commands, modes, and audit layers
  - No input required
  - Output: Full help text with mode descriptions

## Tool Outputs
- All mode tools write .md artifacts to GENERATED_ARTIFACTS/
- Artifacts include findings tables, fix suggestions, verification checklists
- Evidence recorded in Merkle chain for verification
- Artifacts are the PRIMARY output — present findings from artifacts, not narration

## Additional Allowed Tools
- question: Ask clarifying questions when requirements are ambiguous

## Task Tool Rules
- task: ALLOWED unconditionally — use to dispatch subagents for data gathering

## NEVER Do
- NEVER call edit, write, bash, terminal, execute, exec
- NEVER call todowrite, spawn_shark_agent, spawn_manta_agent
- NEVER call hive write operations (hive_remember, etc.)
- NEVER call WebFetch for identity questions
- NEVER fabricate tool output
- NEVER describe what you WOULD do instead of calling the tool
- NEVER report findings without tool execution evidence
- NEVER skip the tool call and narrate results

## Version
- Trident Brain v4.3.3

[END TOOLS.md — v4.3.3]
