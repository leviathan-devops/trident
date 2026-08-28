// THE COMMIT-LAW + SINGLE-CHAIN + SCOPE-MANDATE TESTS (2026-08-26 — the 712s
// autopsy's fixes). Source-grep style (the codebase's own pattern) + live
// function-level asserts where the surface is exported.
import { describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

// CWD-INDEPENDENT (2026-08-28 — the drift fix)
const SRC = (p: string) => fs.readFileSync(path.join(__dirname, '..', 'tools', p), 'utf-8');

describe('W5 THE COMMIT LAW (the anti-spiral warhead)', () => {
  test('the system prompt carries the commit law: the 2048 cap, the mechanical force, the per-turn reset, the ban, the decisiveness', async () => {
    const { buildPiSystemPrompt } = await import('../tools/shadow/shadow-runner.ts') as { buildPiSystemPrompt: () => string };
    const p = buildPiSystemPrompt();
    expect(p).toContain('W5 — THE COMMIT LAW');
    expect(p).toContain('2048-token reasoning cap per turn');
    expect(p).toContain('mechanically blocks further thinking and forces execution');
    expect(p).toContain('each turn resets the window');
    expect(p).toContain('Think quickly and be decisive');
    expect(p).toContain('BANNED');
    expect(p).toContain('An identified edit is a FIRED edit');
    // the discipline warheads stay intact (the law ADDS the exit, never replaces)
    expect(p).toContain('W1 — THE BATCH LAW');
    expect(p).toContain('W4 — THE EVIDENCE LAWS');
    expect(p).toContain('THE FILES ARE THE ONLY GROUND TRUTH');
  });

  test('both round prompts carry the commit clause', () => {
    const a = SRC('shadow/shadow-agent.ts');
    expect(a).toContain('COMMIT LAW (W5): once the pairs are chosen, FIRE immediately');
    expect(a).toContain('COMMIT LAW (W5): audit → decide once → FIRE the batched fix');
  });
});

describe('THE SINGLE PAID RUNG (the free-fallback rip)', () => {
  test('the chain is ONE rung: opencode-go/mimo-v2.5 — no zen/nvidia/openrouter/inferx entries', () => {
    const a = SRC('shadow/shadow-agent.ts');
    const chainBlock = a.slice(a.indexOf('this.chain = ['), a.indexOf('];', a.indexOf('this.chain = [')) + 2);
    expect(chainBlock).toContain("{ provider: 'opencode-go', modelId: 'mimo-v2.5' }");
    expect(chainBlock).not.toContain("provider: 'opencode'");
    expect(chainBlock).not.toContain("provider: 'nvidia'");
    expect(chainBlock).not.toContain("provider: 'openrouter'");
    expect(chainBlock).not.toContain("provider: 'inferx'");
  });

  test('the loud death names the remedy: API UNREACHABLE — SWAP THE API KEY', () => {
    const a = SRC('shadow/shadow-agent.ts');
    expect(a).toContain('SHADOW_API_UNREACHABLE');
    expect(a).toContain('SWAP THE API KEY');
  });

  test('the thinking wiring is injected into streamSimple (the loop drops the budgets — proven: agent-loop.ts has zero thinkingBudgets refs)', () => {
    const a = SRC('shadow/shadow-agent.ts');
    expect(a).toContain("reasoningEffort: 'medium'");
    expect(a).toContain('thinkingBudgets: { minimal: 512, low: 1024, medium: 2048, high: 4096 }');
    const loop = fs.readFileSync(path.join(__dirname, '..', '..', 'vendor', 'pi', 'agent', 'src', 'agent-loop.ts'), 'utf-8');
    expect(loop).not.toContain('options.thinkingBudgets');   // the drop we compensate for
  });
});

describe('THE MANDATORY SCOPE TOKEN (the cross-project bleed fix)', () => {
  test('generate refuses without an existing projectToken — the [WAVE SCOPE] block', () => {
    const d = SRC('wave-dispatch.ts');
    expect(d).toContain("[WAVE SCOPE] projectToken is MANDATORY on generate");
    expect(d).toContain('fs.existsSync(scopeTok)');
  });
});

describe('THE MODE STRIP (mode on non-steer calls)', () => {
  test('the spillover gate is now a strip, not a block', () => {
    const d = SRC('wave-dispatch.ts');
    expect(d).toContain('modeStripped');
    expect(d).toContain('mode was ignored — mode is steer-only');
    expect(d).not.toContain('is STEER-ONLY — this call is action=');   // the old block text is dead
  });
});

describe('THE CAPTURE REDACTION (the binary-file fix)', () => {
  test('control chars are escaped — a PNG read result can never binary-flag the capture', async () => {
    process.env.TRIDENT_SHADOW_CAPTURE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'cap-redact-'));
    const { beginCapture, captureEvent, captureSection, captureDir } = await import('../tools/shadow/capture.ts');
    const file = beginCapture('redact-key', 'redact-wave', 'redact-agent');
    captureEvent('redact-key', 'TOOL_CALL', { tool: 'read', path: '/tmp/x.png', nul: 'a\x00b\x01c' });
    captureSection('redact-key', 'TOOL RESULT — read', 'PNG\x00\x01\x02DATA\x1f', 'json');
    const text = fs.readFileSync(file, 'utf-8');
    expect(text).not.toContain('\x00');
    expect(text).toContain('\\u0000');
    expect(text).toContain('\\u001f');
    fs.rmSync(path.join(captureDir(), 'redact-wave'), { recursive: true, force: true });
  });
});
