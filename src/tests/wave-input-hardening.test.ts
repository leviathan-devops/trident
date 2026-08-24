// ═══ THE CHAOS-OPTIMIZED INPUT + PLANNING GATE TESTS (2026-08-22 — the
// operator's directives: absorb arrays where strings belong; agentsJson
// PRIMARY on the production normalizer; expectedCount loud refusal; planning
// gate COLD/ACTIVE/STALE lifecycle). Adversarial-first. ═══

import { describe, expect, test } from 'bun:test';
import { normalizePipelineAgents, validateWaveCount, coerceContextValue } from '../tools/wave-pipeline.ts';
import { normalizeAgents } from '../tools/wave-dispatch.ts';
import { decidePlanning, checkWavePlanning, recordWaveServed, readWavePlan, type WavePlanInfo, type PlanningStateEntry } from '../tools/wave-planning-gate.ts';
import * as fs from 'node:fs';
import * as path from 'node:path';

const DENSE = (s: string, n: number) => s.repeat(Math.max(1, Math.ceil(n / s.length))).slice(0, n);

describe('the coercion engine — arrays absorbed where strings belong', () => {
  test('ARRAY → newline join (acceptance as array of strings coerces)', () => {
    const out = coerceContextValue(['bullet one with real detail', 'bullet two anchored to file lines']);
    expect(typeof out).toBe('string');
    expect(out).toContain('bullet one');
    expect(out).toContain('bullet two');
  });

  test('OBJECT → JSON; NUMBER → string; NULL → undefined', () => {
    expect(coerceContextValue({ a: 1 })).toBe('{"a":1}');
    expect(coerceContextValue(42)).toBe('42');
    expect(coerceContextValue(null)).toBeUndefined();
    expect(coerceContextValue(undefined)).toBeUndefined();
  });

  test('normalizeAgents absorbs array-valued context fields end-to-end', () => {
    const specs = normalizeAgents({
      agents: [{
        name: 'coerce-a1', template: 'E1', filepaths: ['/tmp/x.ts'],
        mission: DENSE('m', 220),
        knownContext: DENSE('k', 220),
        doctrine: DENSE('d', 110),
        measurements: DENSE('me', 110),
        acceptance: ['checkable bullet 1 with real anchors and file line citations', 'checkable bullet 2 anchored to measured state'],   // ARRAY!
        taskTargets: ['WHAT: map every export with line anchors', 'HOW: cite file lines per claim', 'WHY: anchor without fabrication', 'EXPECTED: filled prompt'],
        position: DENSE('p', 55),
      }],
    }, 'wave-coerce');
    expect(specs.length).toBe(1);
    expect(typeof specs[0].acceptance).toBe('string');
    expect(specs[0].acceptance.length).toBeGreaterThanOrEqual(100);   // the OLD code produced 0c here
    expect(specs[0].taskTargets.length).toBeGreaterThanOrEqual(100);
  });
});

describe('the count contract — the loud partial-wave refusal', () => {
  test('expectedCount mismatch refuses with steering', () => {
    const err = validateWaveCount([{} as never, {} as never], 8);
    expect(err).toContain('COUNT MISMATCH');
    expect(err).toContain('2 of 8');
    expect(err).toContain('Re-fire action=generate ONCE');
  });

  test('matching count passes; absent/invalid expectedCount skips', () => {
    expect(validateWaveCount([{} as never], 1)).toBeNull();
    expect(validateWaveCount([], undefined)).toBeNull();
    expect(validateWaveCount([], 'not-a-number')).toBeNull();
  });
});

describe('the wave-planning gate v2 — THE WRITTEN PLAN IS THE BUDGET (no static consts)', () => {
  const PLAN = (totalWaves: number, mtimeMs = 1000): WavePlanInfo => ({ path: '/plan.md', mtimeMs, totalWaves });
  const ENTRY = (wavesGenerated: number, planMtimeMs = 1000): PlanningStateEntry =>
    ({ plannedAt: new Date().toISOString(), planNote: 'plan', wavesGenerated, planMtimeMs });

  test('COLD: NO written plan → BLOCKED even WITH a planningNote (the note unlocks NOTHING)', () => {
    const v = decidePlanning(undefined, 'a perfectly dense planning note over twenty chars', null);
    expect(v.allow).toBe(false);
    expect(v.phase).toBe('cold');
    expect(v.reason).toContain('WRITTEN TO DISK');
    expect(v.reason).toContain('wave-plan.md');
    expect(v.reason).toContain('WAVES:');
  });

  test('readWavePlan: WAVES: marker wins; ### Wave headings counted as fallback; garbage → null', () => {
    const dir = fs.mkdtempSync('/tmp/wpg-plan-');
    const p = path.join(dir, 'wave-plan.md');
    // marker form:
    fs.writeFileSync(p, '# BUILD — WAVE PLAN\nWAVES: 7\n## TARGET\n');
    expect(readWavePlan(p)?.totalWaves).toBe(7);
    // heading-count fallback:
    fs.writeFileSync(p, '# PLAN\n### Wave 1 — core\n### Wave 2 — consumers\n### Wave 3 — polish\n');
    expect(readWavePlan(p)?.totalWaves).toBe(3);
    // no budget signal → null (an unparseable plan is no plan):
    fs.writeFileSync(p, '# just prose, no waves, no marker\n');
    expect(readWavePlan(p)).toBeNull();
    // absent file → null:
    expect(readWavePlan(path.join(dir, 'absent.md'))).toBeNull();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('BUDGET FROM THE FILE: a 2-wave plan grants exactly 2 generates; the 3rd refuses with EXHAUSTED', () => {
    let v = decidePlanning(undefined, 'the two-wave extraction build per the plan', PLAN(2));
    expect(v.allow).toBe(true);                       // wave 1 of 2
    v = decidePlanning(ENTRY(1), undefined, PLAN(2));
    expect(v.allow).toBe(true);                       // wave 2 of 2 — silent ACTIVE
    expect(v.phase).toBe('active');
    v = decidePlanning(ENTRY(2), 'yet another fresh note trying to extend', PLAN(2));
    expect(v.allow).toBe(false);                      // exhausted — note does NOT extend
    expect(v.phase).toBe('stale');
    expect(v.reason).toContain('BUDGET EXHAUSTED');
    expect(v.reason).toContain('2/2');
    expect(v.reason).toContain('EDIT the plan');
  });

  test('A 12-WAVE GRIND sails through all 12 without one re-mandate (the killed const proof)', () => {
    for (let used = 0; used < 12; used++) {
      const entry = used === 0 ? undefined : ENTRY(used);
      const v = decidePlanning(entry, used === 0 ? 'the twelve-wave overhaul grind' : undefined, PLAN(12));
      expect(v.allow).toBe(true);
    }
    expect(decidePlanning(ENTRY(12), undefined, PLAN(12)).allow).toBe(false);
  });

  test('PLAN EDITED mid-session → latch invalidates → fresh note re-latches under the NEW mtime', () => {
    const edited = PLAN(5, 999_999);   // same shape, different mtime
    const v = decidePlanning(ENTRY(1, 1000), undefined, edited);
    expect(v.allow).toBe(false);
    expect(v.phase).toBe('stale');
    expect(v.reason).toContain('CHANGED');
    expect(decidePlanning(ENTRY(1, 1000), 're-latched on the revised five-wave plan', edited).allow).toBe(true);
  });

  test('v3 BUDGET SEMANTICS: check consumes NOTHING — only real dispatch ticks (end-to-end)', () => {
    const dir = fs.mkdtempSync('/tmp/wpg-e2e-');
    const sp = path.join(dir, 'state.json');
    fs.mkdirSync(path.join(dir, '.trident'), { recursive: true });
    const pp = path.join(dir, '.trident', 'wave-plan.md');
    // NO plan yet → refused, and the state file is NEVER written:
    let threw = '';
    try { checkWavePlanning({ planningNote: 'note without any written plan artifact' }, 'ses_test1234', sp, pp); }
    catch (e) { threw = e instanceof Error ? e.message : String(e); }
    expect(threw).toContain('WRITTEN TO DISK');
    expect(fs.existsSync(sp)).toBe(false);   // PURE check — zero state writes
    // write the plan (2 waves) → note latches via CHECK without consuming:
    fs.writeFileSync(pp, 'WAVES: 2\n# plan\n');
    threw = '';
    try { checkWavePlanning({}, 'ses_test1234', sp, pp); }
    catch (e) { threw = e instanceof Error ? e.message : String(e); }
    expect(threw).toContain('fresh planningNote');   // first latch under this plan needs the note
    checkWavePlanning({ planningNote: 'the planned two-wave build' }, 'ses_test1234', sp, pp);
    // REFUSED calls burn nothing: simulate two validation refusals — the
    // model re-fires with the SAME args (planningNote included, as real
    // re-fires do); the pure check stays write-free:
    checkWavePlanning({ planningNote: 'the planned two-wave build' }, 'ses_test1234', sp, pp);
    checkWavePlanning({ planningNote: 'the planned two-wave build' }, 'ses_test1234', sp, pp);
    expect(fs.existsSync(sp)).toBe(false);   // still zero writes — budget untouched
    // THE ACTUAL DISPATCH ticks once:
    recordWaveServed('ses_test1234', sp, pp, 'the planned two-wave build');
    const after1 = JSON.parse(fs.readFileSync(sp, 'utf-8')) as Record<string, PlanningStateEntry>;
    expect(after1['ses_test1234'].wavesGenerated).toBe(1);
    // second real dispatch consumes wave 2 of 2:
    recordWaveServed('ses_test1234', sp, pp);
    threw = '';
    try { checkWavePlanning({}, 'ses_test1234', sp, pp); }
    catch (e) { threw = e instanceof Error ? e.message : String(e); }
    expect(threw).toContain('BUDGET EXHAUSTED');
    expect(threw).toContain('2/2');
    // extend plan → mtime change → fresh note re-latches (check passes again):
    fs.writeFileSync(pp, 'WAVES: 3\n# plan\n');
    threw = '';
    try { checkWavePlanning({}, 'ses_test1234', sp, pp); }
    catch (e) { threw = e instanceof Error ? e.message : String(e); }
    expect(threw).toContain('CHANGED');
    checkWavePlanning({ planningNote: 'extended the plan to three waves' }, 'ses_test1234', sp, pp);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
