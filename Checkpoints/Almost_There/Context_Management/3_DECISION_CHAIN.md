# DECISION CHAIN — TRIDENT v4.3.3

## Critical Decisions (Latest First)

1. **Validators must check generated artifacts** — Raw user input has no ## headings, so heading-structure validators always fail. The generated artifacts DO have ## headings. Fix: validate the artifact, not the input.

2. **T2 must be dense like hive bibles** — 68 lines is a template, not knowledge. T2 must call discoverProject() and generate 500+ lines with real file:line evidence. Target: same quality as OPERATIONAL_IDENTITY_BIBLE.md.

3. **12 warheads not 10** — warhead-dynamic-state.ts exports 3 warheads (Focus, Recovery, AuditState). Count instances in synthesizer array, not files.

4. **trident_explore must work from ANY mode** — TASK_BLOCK exception must check both args.agent AND args.subagent_type fields. The dispatch must be verified in container.

5. **State machine must NEVER throw on sequential calls** — startMode auto-resets from any non-IDLE state. advanceLayer auto-resets from ERROR/TIMEOUT. fail() is idempotent.

6. **Config must be wildcard allow at ROOT level** — `"permission": {"*": {"*": "allow"}}` at root of opencode.json. NOT at agent level. Plugin hooks enforce actual restrictions.

7. **Identity loads via system.transform hook** — NOT via config instructions. The hook reads agent from input with 'trident' fallback. Sets identityLoaded on both session AND default.

## Failure Log (What Went Wrong)

| # | Failure | Impact | Lesson |
|---|---------|--------|--------|
| F1 | Reported 10 warheads (actually 12) | Misleading count | Count instances in array, not files |
| F2 | Validators checked raw input | ALL validations always fail | Validate artifact, not input |
| F3 | T2 was 68-line template | Not dense knowledge | Call discoverProject, use file:line refs |
| F4 | Context library 4/9 files | Incomplete output | Write ALL 9 files |
| F5 | TASK_BLOCK still blocks explore | Can't dispatch subagents | Fix must be verified in bundle |
| F6 | State machine fix deployed 4x | Kept crashing | Verify fix in compiled .js, not just .ts |
| F7 | Identity hook took 5 rounds | identityLoaded always false | Fix ALL layers of the bug chain |
| F8 | Config permissions 6 rounds | Kept prompting | Root level wildcard, not agent level |
