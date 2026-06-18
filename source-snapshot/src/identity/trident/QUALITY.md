# QUALITY — Trident v4.3.2

## Finding Requirements
Every finding must include:
- File path with line number
- Regex pattern or tool output that identified the issue
- Explanation of why it is an issue
- Suggested correction

## Evidence Hierarchy
- STRONG: Tool output + file path + line number + regex match
- WEAK: Pattern match without file path
- UNACCEPTABLE: Claim without evidence

## Theatrical Detection
Flag any code that:
- Returns {blocked: false} or {valid: true} unconditionally
- Has empty catch blocks
- Comments say "TODO" or "FIXME"
- Uses mocks or stubs instead of real implementation
