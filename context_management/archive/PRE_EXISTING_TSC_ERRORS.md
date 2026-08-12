# Pre-Existing TSC Errors — Do NOT Fix These

## Summary
52 TypeScript errors exist in the v4.4.1 baseline. These are PRE-EXISTING and do NOT affect the esbuild bundle. esbuild ignores type errors — it only transpiles.

## Error Categories

### 1. Zod v4 Typing (40 errors)
```
TS2322: Type 'ZodOptional<ZodString>' is not assignable to type '$ZodType<unknown, unknown, $ZodTypeInternals<unknown, unknown>>'
```
These appear on every `z.string().optional()` and `z.array(z.string()).optional()` call in tool definitions.
They exist because zod v4 changed the generic type hierarchy. The runtime behavior is correct.
**Do NOT try to fix these.** The zod library needs a version update, not individual type patches.

### 2. TypeScript 6.0 `parent` Read-Only Property (1 error)
```
TS2540: Cannot assign to 'parent' because it is a read-only property.
```
In `code-classifier.ts:989`: `(node as ts.Node).parent = parent ?? node.parent;`
TS 6.0 made `ts.Node.parent` read-only. This assignment was valid in TS 5.x.
**Do NOT fix this.** The esbuild bundle works correctly. The assignment is needed for downstream AST analysis.

### 3. test-plan-generator.ts Optional Fields (3 errors)
```
TS18048: 'f.runtimeImpact' is possibly 'undefined'.
```
Fixed in v4.4.1-DP-OVERHAUL with `(f.runtimeImpact || '').includes(...)` pattern.
If these reappear, apply the same null-coalescing guard.

## Rule
If `bun run build` succeeds (exit code 0, produces dist/index.js), the build is GOOD.
TSC errors are advisory. They do NOT affect the runtime bundle.
Only fix TSC errors if they cause a runtime crash (they won't — esbuild strips types).
