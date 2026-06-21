
### Audit Round 10 — Runtime Test
- B72: TUI hang on startup — ts.createProgram() blocked main thread synchronously
- FIX: ASTFirewall.initialize() → no-op (analyze() uses per-file ts.createSourceFile())
- FIX: snapshot.captureBefore() deferred (only needed when plan scope is active)
- CONTAINER TEST: opencode launches without hang ✅
