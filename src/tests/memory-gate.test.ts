// ═══ THE MEMORY-READ LEXICON TESTS (2026-08-15 — TOOL_PATHOLOGY_readlines_RAM_BOMB
// + the Lexicon_Grade_Intelligent_Systems_Engineering_Bible.md rebuild) ═══
// The intent-savvy classifier (the Poseidon model): the matchers DETECT, the
// state machine DECIDES. THE INTENT CLASSES: RAM_BOMB (block) vs
// SIZED_READ / LAZY_ITERATE / STREAM_TOOLS / NON_READ (allow) — the
// safe-context exclusions prevent the constant misfiring the operator caught.

// @ts-ignore — bun:test ships the runtime, not TS declarations
import { describe, expect, test } from 'bun:test';
import { classifyMemoryRead, classifyDispatchMemoryRisk } from '../firewalls/memory-read-lexicon.ts';

describe('THE MEMORY-READ LEXICON — the intent classification', () => {
  test('THE BOMB: .readlines() on an unsized file → RAM_BOMB → BLOCK', () => {
    const d = classifyMemoryRead("python3 -c \"import re; lines = open('/tmp/trident-hook-debug.log','r').readlines(); print(lines)\"");
    expect(d.intent).toBe('RAM_BOMB');
    expect(d.action).toBe('BLOCK');
    expect(d.pattern).toBe('RAM_BOMB_READLINES');
  });
  test('THE BOMB: .read() on an unsized file → RAM_BOMB → BLOCK', () => {
    const d = classifyMemoryRead("python3 -c \"data = open('/tmp/big.log').read(); print(len(data))\"");
    expect(d.intent).toBe('RAM_BOMB');
    expect(d.action).toBe('BLOCK');
  });
  test('THE BOMB: node -e readFileSync (unsized) → RAM_BOMB → BLOCK', () => {
    const d = classifyMemoryRead("node -e \"const d = require('fs').readFileSync('/tmp/big.log'); console.log(d.length)\"");
    expect(d.intent).toBe('RAM_BOMB');
    expect(d.action).toBe('BLOCK');
  });
  test('THE BOMB: an unguarded open() on a python inline → RAM_BOMB → BLOCK', () => {
    const d = classifyMemoryRead("python3 -c \"f = open('/tmp/data.txt'); print(f.read())\"");
    expect(d.intent).toBe('RAM_BOMB');
    expect(d.action).toBe('BLOCK');
  });
  test('THE SAFE READ: a prior stat/size check → SIZED_READ → ALLOW', () => {
    const d = classifyMemoryRead("sz=$(stat -c %s /tmp/trident-hook-debug.log); echo $sz");
    expect(d.intent).toBe('SIZED_READ');
    expect(d.action).toBe('ALLOW');
  });
  test('THE SAFE READ: the lazy iteration (for line in open) → LAZY_ITERATE → ALLOW', () => {
    const d = classifyMemoryRead("python3 -c \"for line in open('/tmp/x.log'): print(line)\"");
    expect(d.intent).toBe('LAZY_ITERATE');
    expect(d.action).toBe('ALLOW');
  });
  test('THE SAFE READ: the streaming tools → STREAM_TOOLS → ALLOW', () => {
    const d = classifyMemoryRead("grep 'SSTF' /tmp/trident-hook-debug.log | tail -5");
    expect(d.intent).toBe('STREAM_TOOLS');
    expect(d.action).toBe('ALLOW');
  });
  test('THE SAFE READ: a non-read command → NON_READ → ALLOW', () => {
    const d = classifyMemoryRead("bun build --outfile=dist/index.js src/index.ts");
    expect(d.intent).toBe('NON_READ');
    expect(d.action).toBe('ALLOW');
  });
  test('THE NO-MISFIRE GUARD: a build command with dist paths → NON_READ (no false positive)', () => {
    const d = classifyMemoryRead("bun build --target=bun --outfile=dist/index.js src/index.ts");
    expect(d.action).toBe('ALLOW');
  });
  test('THE NO-MISFIRE GUARD: a git command → NON_READ → ALLOW', () => {
    const d = classifyMemoryRead("git status");
    expect(d.action).toBe('ALLOW');
  });
  test('THE OUTPUT BOMB (the LIVE incident): grep -rn "export" on the 16MB dist → OUTPUT_BOMB → BLOCK', () => {
    const d = classifyMemoryRead('grep -rn "export" /home/leviathan/OPENCODE_WORKSPACE/Shared Workspace Context/Trident_Agent/Active_Projects/v4.4.2-wave-manager-async/dist/index.js');
    expect(d.intent).toBe('OUTPUT_BOMB');
    expect(d.action).toBe('BLOCK');
    expect(d.pattern).toBe('OUTPUT_BOMB_RECURSIVE_GREP');
  });
  test('THE OUTPUT BOMB (the -rn flag on a bundle path) → OUTPUT_BOMB → BLOCK', () => {
    const d = classifyMemoryRead("grep -rn export dist/index.js");
    expect(d.intent).toBe('OUTPUT_BOMB');
    expect(d.action).toBe('BLOCK');
  });
  test('THE BOUNDED OUTPUT: grep -c on the bundle → STREAM_TOOLS → ALLOW (the bounded rewrite)', () => {
    const d = classifyMemoryRead('grep -c "export" /home/leviathan/OPENCODE_WORKSPACE/Shared Workspace Context/Trident_Agent/Active_Projects/v4.4.2-wave-manager-async/dist/index.js');
    expect(d.action).toBe('ALLOW');
  });
  test('THE BOUNDED OUTPUT: grep -o | wc -l → ALLOW', () => {
    const d = classifyMemoryRead('grep -o "export" dist/index.js | wc -l');
    expect(d.action).toBe('ALLOW');
  });
  test('THE BUNDLE EXEC: bun on the dist artifact → BUNDLE_EXEC → BLOCK', () => {
    const d = classifyMemoryRead('bun /home/leviathan/OPENCODE_WORKSPACE/Shared Workspace Context/Trident_Agent/Active_Projects/v4.4.2-wave-manager-async/dist/index.js');
    expect(d.intent).toBe('BUNDLE_EXEC');
    expect(d.action).toBe('BLOCK');
    expect(d.pattern).toBe('BUNDLE_EXEC_RUN_ARTIFACT');
  });
  test('THE BUNDLE SAFE: bun test / bun build / bunx → ALLOW (the no-misfire)', () => {
    expect(classifyMemoryRead('bun test src/tests/memory-gate.test.ts').action).toBe('ALLOW');
    expect(classifyMemoryRead('bun build --target=bun --outfile=dist/index.js src/index.ts').action).toBe('ALLOW');
    expect(classifyMemoryRead('bunx tsc --noEmit').action).toBe('ALLOW');
  });
  test('THE DISPATCH SCREEN: a prompt carrying the grep -rn bomb → BLOCK naming the line', () => {
    const prompt = 'THE VERIFICATION (run ALL):\n1. sha256sum dist/index.js\n2. grep -rn "export" /home/leviathan/OPENCODE_WORKSPACE/Shared Workspace Context/Trident_Agent/Active_Projects/v4.4.2-wave-manager-async/dist/index.js — the coupling graph\n3. grep CT_SCENARIO_ACTIONS dist/index.js';
    const d = classifyDispatchMemoryRisk(prompt);
    expect(d.action).toBe('BLOCK');
    expect(d.intent).toBe('OUTPUT_BOMB');
    expect(d.message).toContain('line 3');
  });
  test('THE DISPATCH SCREEN: a clean prompt (the bounded greps) → ALLOW', () => {
    const prompt = 'THE VERIFICATION (run ALL):\n1. sha256sum dist/index.js\n2. grep -c "export" dist/index.js\n3. stat -c %s dist/index.js';
    const d = classifyDispatchMemoryRisk(prompt);
    expect(d.action).toBe('ALLOW');
  });
  test('THE NO-MISFIRE FIX (2026-08-15): a DB-handle connect (the "opencode" path substring) → NON_READ → ALLOW', () => {
    const d = classifyMemoryRead("python3 -c \"import sqlite3; conn = sqlite3.connect('/home/leviathan/.local/share/opencode/opencode.db')\"");
    expect(d.intent).toBe('NON_READ');
    expect(d.action).toBe('ALLOW');
  });
  test('THE NO-MISFIRE GUARD: the bare open( function call still blocked (the tightened frame)', () => {
    const d = classifyMemoryRead("python3 -c \"f = open('/tmp/data.txt')\"");
    expect(d.action).toBe('BLOCK');
  });
});
