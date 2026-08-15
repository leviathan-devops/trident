// ═══ THE T.E.B. INPUT CLASSIFIER TESTS (2026-08-15 — the #25 Part-1) ═══
// The path-shape vs prompt-shape lexicon (the operator's spec: the workspace
// root in the first 3 branches + the 1-long-token vs the bunch-of-tokens).

// @ts-ignore — bun:test ships the runtime, not TS declarations
import { describe, expect, test } from 'bun:test';
import { classifyDispatchInput, PROMPTFILE_REMEDY_BULLET } from '../firewalls/dispatch-input-lexicon.ts';

describe('THE T.E.B. INPUT CLASSIFIER — the path vs the prompt', () => {
  test('THE PATH: a single workspace-root-anchored token → PATH → ALLOW', () => {
    const d = classifyDispatchInput('/home/leviathan/OPENCODE_WORKSPACE/trident-tmp/fw-probe-1.md');
    expect(d.cls).toBe('PATH');
    expect(d.action).toBe('ALLOW');
  });
  test('THE PATH: the /root workspace-root anchor → PATH → ALLOW', () => {
    const d = classifyDispatchInput('/root/OPENCODE_WORKSPACE/trident-tmp/ct-happy-1.md');
    expect(d.cls).toBe('PATH');
    expect(d.action).toBe('ALLOW');
  });
  test('THE PROMPT: a written multi-token prompt → PROMPT → BLOCK with the remedy bullet', () => {
    const d = classifyDispatchInput('EXECUTE THE FOLLOWING FORENSIC CONTEXT EXTRACTION VERBATIM. You are a trident_explore agent — READ-ONLY. You do NOT write any file.');
    expect(d.cls).toBe('PROMPT');
    expect(d.action).toBe('BLOCK');
    expect(d.message).toContain('ACTUAL PATH');
  });
  test('THE PROMPT: a short inline prompt (a bunch of tokens, no path) → PROMPT → BLOCK', () => {
    const d = classifyDispatchInput('extract the contracts please');
    expect(d.cls).toBe('PROMPT');
    expect(d.action).toBe('BLOCK');
  });
  test('THE MIXED: the workspace path + trailing prose → MIXED → BLOCK (the path ONLY)', () => {
    const d = classifyDispatchInput('/home/leviathan/OPENCODE_WORKSPACE/trident-tmp/fw-probe-1.md and the extraction mission is to map the allowlist');
    expect(d.cls).toBe('MIXED');
    expect(d.action).toBe('BLOCK');
    expect(d.message).toContain('path ONLY');
  });
  test('THE PROMPT: a non-workspace path (not the sanctioned trident-tmp) → PROMPT → BLOCK', () => {
    const d = classifyDispatchInput('/tmp/random-file.md');
    expect(d.cls).toBe('PROMPT');
    expect(d.action).toBe('BLOCK');
  });
  test('THE EMPTY input → PROMPT → BLOCK', () => {
    const d = classifyDispatchInput('');
    expect(d.action).toBe('BLOCK');
  });
  test('THE REMEDY BULLET carries the operator\'s exact words (a filepath and nothing else)', () => {
    expect(PROMPTFILE_REMEDY_BULLET).toContain('FILEPATH and nothing else');
    expect(PROMPTFILE_REMEDY_BULLET).toContain('ACTUAL PATH');
  });
});
