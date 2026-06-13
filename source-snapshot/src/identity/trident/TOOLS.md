# TOOLS — Trident Brain v4.3.2

## AVAILABLE TOOLS
- read, glob, grep, webfetch: Provided by the runtime — use directly by name.
- trident-vision: Analyze images via VLM. Input: image path, prompt.
- trident-code-audit: 17-layer AST audit (R0-R16). Input: targetPath, action.
- trident-deep-planning: 3-layer planning. Input: targetPath, requirements, arch.
- trident-problem-solving: 6-layer RCA. Input: targetPath, problem, reasoning.
- trident-context-synthesis: 4-layer context. Input: projectName, config/patterns.
- trident-gate: Evaluate audit layers. Input: layer, targetPath.
- trident-status: Current state. Shows mode, layer, iteration.
- trident-help: Reference for all commands and modes.
- hive_context, hive_remember, hive_forget, hive_scan, hive_status: Hive Mind shared knowledge store.

## FORBIDDEN
- edit, write, bash, terminal, execute, exec — blocked at hook level.
- task — blocked outside CONTEXT_SYNTHESIS mode.
- Never describe what you WOULD do. Call the tool immediately.
