// src/tests/surgical-mutator.test.ts — THE SURGICAL MUTATOR'S BATTERY
// (the spec's C-3.8 :1481-1507 + section 6.3 :2463-2559 + section 7.5
// :3610-3728 — the wave 3's acceptance). THE ROLE: the FR-3's proof — the
// byte-preservation (BC-2), the span-scoped replacement (DD-1), the structure
// guard (FR-7.4), the idempotence (BC-3), the marker (FR-3.5), the fail-paths
// (FR-16.2), the never-full-mutation (CN-1.2), the seam compatibility (the
// wave-4 SSTFTransformSeam's `{ text, mutated: number, verdicts? }` shape).
//
// THE OPERATOR'S DOCTRINE: "The tests are the contract: the byte-preservation's
// hash assertions, the structure guard, the idempotence, the fail-paths." The
// byte-preservation hash is the mechanical proof the full-message derailment
// ("THAT was the biggest derailment is the WHOLE fucking message got mutated")
// cannot recur; the structure guard proves the surgical scope; the idempotence
// proves the second-pass no-op; the fail-paths prove the never-a-partial-
// mutation invariant. THE ADVERSARIAL FIRST (the WARHEAD 13): the empty input,
// the whitespace-only, the control bytes, the all-slop, the code-only, the
// one-sentence, the oversized span. THE EVIDENCE DETERMINISM: every test uses
// its OWN cleared session id (__clearEvidenceSession + the process-pid + the
// timestamp counter — no shared machine state, no stale-verdict-cache
// interference, no cross-run row collisions) + drives the machine through its
// real transition core (ingestEvidenceEvent) so the verdicts are the machine's
// truth, never a stub.
//
// THE FIXTURE PRECISION (the honest test design — the spec's own note :2512):
// the spans' verdicts are a function of the fixture's evidence state AND the
// REAL lexicon's splitter/classifier. The spec's 7.5/6.3 draft fixtures that
// contradict the real module's behavior (e.g. the FR-11.1 draft's
// 'The config-lock expansion is complete.' — the REAL lexicon flags 'complete'
// as a formal claim word → 4 slop spans, not 3) are ADJUSTED here to fixtures
// whose real behavior is deterministic, exactly as the spec's author adjusted
// fixtures mid-draft (:2505-2508 "THE ADJUSTMENT"). Every deviation is named
// in the honest notes of the wave audit.

// @ts-ignore — bun:test ships the runtime, not the TS declarations
import { describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { mutateMessage } from '../firewalls/surgical-mutator.js';
import type { MutationResult } from '../firewalls/surgical-mutator.js';
import { classifyMessageSpans } from '../firewalls/smoke-lexicon.js';
import type { ClassifiedSpan } from '../firewalls/smoke-lexicon.js';
import { ingestEvidenceEvent } from '../firewalls/evidence-tracker.js';
import { __clearEvidenceSession } from '../hooks/agent-state.js';

const DIST_A = 'testdist1234';

// ── THE STATE ISOLATION (the ship-gate battery's pattern :30-35, hardened) ──
// The machine's records are persisted in SQLite + the verdict cache has a 5s
// TTL — a plain counter can collide across runs (a stale row from yesterday's
// run). The pid+timestamp+counter sid + the __clearEvidenceSession both
// guarantee a FRESH machine record for every test.
let mutCounter = 0;
function freshSession(): string {
  mutCounter++;
  const sid = `mut-${process.pid}-${Date.now()}-${mutCounter}`;
  __clearEvidenceSession(sid);
  return sid;
}

// ── THE EVENT FACTORIES (the machine's real transition core — the guards) ──
function smokeEvent(distSha: string): Parameters<typeof ingestEvidenceEvent>[1] {
  return { kind: 'smoke', at: Date.now(), distSha, detail: 'the inline-exec' };
}
function unitEvent(distSha: string): Parameters<typeof ingestEvidenceEvent>[1] {
  return { kind: 'unit', at: Date.now(), distSha, exitOk: true, detail: 'the battery' };
}
function containerEvent(distSha: string): Parameters<typeof ingestEvidenceEvent>[1] {
  return { kind: 'container', at: Date.now(), distSha, hasEvidenceArtifact: true, artifact: '.trident/container-test-results.json', detail: 'the container suite' };
}

// ── THE BYTE-PRESERVATION HELPERS (the mechanical proof — never tautological) ──
function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

/** THE ORIGINAL NON-SLOP BYTES: the original text with the slop spans' bytes
 *  removed (per the verdicts' offsets — the splice's inverse on the ORIGINAL). */
function originalNonSlop(text: string, verdicts: ClassifiedSpan[]): string {
  let out = '';
  let cursor = 0;
  for (const v of verdicts) {
    if (v.kind === 'CLAIM_SLOP') { out += text.slice(cursor, v.start); cursor = v.end; }
  }
  return out + text.slice(cursor);
}

/** THE EXPECTED SPLICE OUTPUT: the original bytes VERBATIM + the warheads at
 *  the slop spans' offsets — the splice's contract reconstructed independently
 *  from (original, verdicts). The mutated body MUST equal this byte-for-byte. */
function reconstructSplice(text: string, verdicts: ClassifiedSpan[]): string {
  const parts: string[] = [];
  let cursor = 0;
  for (const v of verdicts) {
    if (v.kind === 'CLAIM_SLOP') {
      parts.push(text.slice(cursor, v.start));
      parts.push(typeof v.warhead === 'string' ? v.warhead : '');
      cursor = v.end;
    }
  }
  return parts.join('') + text.slice(cursor);
}

/** THE MUTATED NON-SLOP BYTES: the mutated body with the warhead regions
 *  removed (the splice inverted via the original offsets + the warhead lengths) —
 *  its hash MUST equal the originalNonSlop's hash. THE WRAPPER-STRIP FIRST
 *  (the 2026-08-11 `{}` addition at the boundaries — the non-slop bytes INSIDE
 *  the braces are the byte-preservation's subject). */
function mutatedNonSlop(body: string, verdicts: ClassifiedSpan[]): string {
  const inner = body.startsWith('{') && body.endsWith('}') ? body.slice(1, -1) : body;
  let out = '';
  let pos = 0;
  let srcCursor = 0;
  for (const v of verdicts) {
    if (v.kind === 'CLAIM_SLOP') {
      const preLen = v.start - srcCursor;                 // the verbatim bytes before the span
      out += inner.slice(pos, pos + preLen);
      pos += preLen + (typeof v.warhead === 'string' ? v.warhead.length : 0);
      srcCursor = v.end;
    }
  }
  return out + inner.slice(pos);
}

/** THE MUTATED BODY: the mutated text WITHOUT the appended marker + WITHOUT
 *  the `{...}` message wrapper (the 2026-08-11 operator's directive: the
 *  ENTIRE mutated message is wrapped in `{}` — the wrapper is an ADDITION at
 *  the boundaries, the same class as the marker — the body here = the spliced
 *  inner, the byte-preservation's subject). */
function stripMarker(out: MutationResult): string {
  if (out.marker === null) return out.text;
  const suffix = '\n\n' + out.marker;
  const text = out.text;
  if (text.startsWith('{') && text.endsWith('}')) {
    return text.slice(1, text.length - 1 - suffix.length);
  }
  return text.slice(0, text.length - suffix.length);
}

// ===== THE BYTE-PRESERVATION (BC-2 — the FR-3.3 hash assertions) =====

describe('THE SURGICAL MUTATOR — THE BYTE-PRESERVATION (BC-2)', () => {
  test('the splice is EXACTLY the original verbatim + the warheads at the slop offsets (the byte-level hash)', () => {
    // THE FIXTURE (the spec's 7.5 TEST 1 :3624 — the real lexicon yields EXACTLY
    // 3 slop spans: 'The battery is green' + ' everything synced' + ' ready to
    // deploy.' — the comma + the period boundaries; the rest NON_CLAIM).
    const original = 'The registry ships today.\n\nThe battery is green, everything synced, ready to deploy. The gate design uses the read-modify-write.';
    const out = mutateMessage(original, freshSession());
    expect(out.mutated).toBe(3);                                   // the 3 slop spans
    const body = stripMarker(out);
    // THE STRONGEST ASSERTION: the mutated body === the reconstruction built
    // from the ORIGINAL bytes + the verdicts' offsets + the verdicts' warheads.
    // If the splice reordered/dropped/re-wrapped ANY non-slop byte, the hashes
    // diverge — the byte-preservation is BY CONSTRUCTION, mechanically proven.
    expect(sha256(body)).toBe(sha256(reconstructSplice(original, out.verdicts)));
    // THE 2026-08-11 WRAPPER CONTRACT (the operator's directive: the ENTIRE
    // mutated message in `{}` + the warhead prefixes in the `[]` NESTED inside):
    expect(out.text.startsWith('{')).toBe(true);
    expect(out.text.endsWith('}')).toBe(true);
    expect(out.text).toContain('[SSTF UNEVIDENCED]');          // the warhead prefix's [] nested inside the {}
    expect(out.text).toContain('[SSTF SMOKE MUTATION]');       // the marker's [] nested inside the {}
    expect(out.text.indexOf('{')).toBeLessThan(out.text.indexOf('[SSTF UNEVIDENCED]'));  // the { comes FIRST
    // THE non-slop sentences survive verbatim; the slop is gone:
    expect(body).toContain('The registry ships today.');
    expect(body).toContain('The gate design uses the read-modify-write.');
    expect(body).not.toContain('the battery is green');
    expect(body).not.toContain('everything synced');
    expect(body).not.toContain('ready to deploy.');
  });

  test('the non-slop bytes hash identically before and after (the warheads stripped from the mutated body)', () => {
    const original = 'HEADER LINE\n\nThe description is long and detailed with the registry sync and the atomicity notes. the battery is green.\n\nFOOTER';
    const out = mutateMessage(original, freshSession());
    expect(out.mutated).toBeGreaterThan(0);                        // the slop detected
    const body = stripMarker(out);
    // The two independent reconstructions MUST hash-equal: the original's
    // non-slop bytes vs the mutated body's non-slop bytes.
    expect(sha256(mutatedNonSlop(body, out.verdicts))).toBe(sha256(originalNonSlop(original, out.verdicts)));
    // The mutated non-slop contains the structure fragments + no warhead bytes:
    const nonSlop = mutatedNonSlop(body, out.verdicts);
    expect(nonSlop).toContain('HEADER LINE');
    expect(nonSlop).toContain('FOOTER');
    expect(nonSlop).not.toContain('[SSTF');                        // the warheads live only in the slop spans' places
  });

  test("the verdicts' non-slop span texts are the ORIGINAL bytes (no warhead leakage — the 7.5 TEST 2 shape)", () => {
    const original = 'The registry design uses the sync read-modify-write. the wave shipped. The gate order is load-bearing.';
    const out = mutateMessage(original, freshSession());
    expect(out.mutated).toBe(1);                                   // ' the wave shipped.' — the slang 'shipped'
    const nonSlop = out.verdicts.filter(v => v.kind !== 'CLAIM_SLOP').map(v => v.text).join('');
    expect(nonSlop).toContain('The registry design uses the sync read-modify-write.');
    expect(nonSlop).toContain('The gate order is load-bearing.');
    expect(nonSlop).not.toContain('[SSTF');                        // the warheads live only in the slop spans' places
    expect(out.verdicts.find(v => v.kind === 'CLAIM_SLOP')!.warhead).not.toBeNull();
  });
});

// ===== THE SPAN-SCOPED REPLACEMENT (FR-3.3 + DD-1) =====

describe('THE SURGICAL MUTATOR — THE SPAN-SCOPED REPLACEMENT (DD-1)', () => {
  test("the warhead sits at EXACTLY the slop span's start offset with the surrounding bytes adjacent", () => {
    const original = 'Start text. the battery is green. End text.';
    const out = mutateMessage(original, freshSession());
    expect(out.mutated).toBe(1);
    const body = stripMarker(out);
    const warhead = out.verdicts.find(v => v.kind === 'CLAIM_SLOP')!.warhead!;
    // The splice = 'Start text.' + the warhead + ' End text.' — byte-exact:
    expect(body).toBe('Start text.' + warhead + ' End text.');
    expect(body.indexOf('Start text.')).toBe(0);                   // the first byte is the original's first byte
    expect(body.slice('Start text.'.length, 'Start text.'.length + warhead.length)).toBe(warhead); // the warhead at the span's position
    expect(body.endsWith(' End text.')).toBe(true);                // the post-span bytes adjacent + unchanged
    expect(body).not.toContain('the battery is green');            // the slop span replaced
  });

  test('the LEGIT (container-evidenced) claim passes untouched (FR-2.4 — never mutated)', () => {
    const sid = freshSession();
    ingestEvidenceEvent(sid, containerEvent(DIST_A));              // CONTAINER_EVIDENCED
    const original = 'it works.';
    const out = mutateMessage(original, sid);
    expect(out.mutated).toBe(0);                                   // the container-evidenced claim is never mutated
    expect(out.text).toBe(original);                               // the byte-identical pass-through
    expect(out.marker).toBeNull();
    expect(out.verdicts[0].kind).toBe('CLAIM_LEGIT');              // the span verdict is the audit trail
  });
});

// ===== THE STRUCTURE GUARD (FR-7.4 — the headings/lists/code blocks untouched) =====

describe('THE SURGICAL MUTATOR — THE STRUCTURE GUARD (FR-7.4)', () => {
  // THE FIXTURE (the spec's 7.5 TEST 3 :3653-3665 shape — the REAL behavior:
  // '- the battery: 708/10 green' is a CLAIM span (the 'green' slang) whose
  // boundary includes the '- ' marker (the splitter's newline boundary falls
  // AFTER the line) — the claim content is replaced WITHIN the item; the
  // second item '- the container: pending' is NON_CLAIM (the negation guard) →
  // its '- ' marker survives; the code block is fence-excluded → byte-identical).
  const message = [
    '# THE BUILD REPORT',
    '',
    '## THE BATTERY',
    '- the battery: 708/10 green',
    '- the container: pending',
    '',
    '```ts',
    'const ready = true; // everything works',
    '```',
    '',
    'the deployment is ready.',
  ].join('\n');

  test('the headings, the surviving list marker, and the fenced code block are never mutated', () => {
    const out = mutateMessage(message, freshSession());
    expect(out.mutated).toBe(2);                                   // the battery item + the deployment claim
    expect(out.text).toContain('# THE BUILD REPORT');              // the heading intact
    expect(out.text).toContain('## THE BATTERY');
    expect(out.text).toContain('- the container: pending');        // the negated list item byte-identical
    expect(out.text).toContain('- ');                              // the list marker survives (the preserved item)
    expect(out.text).toContain('```ts\nconst ready = true; // everything works\n```'); // the code block byte-identical
    expect(out.text).not.toContain('the battery: 708/10 green');   // the claim content replaced
    expect(out.text).not.toContain('the deployment is ready.');    // the claim replaced
    expect(out.text).toContain('[SSTF SMOKE MUTATION]');           // the marker appended
  });

  test('the claim-sounding text INSIDE the code block is never mutated (G-8.2 — the fence-aware exclusion)', () => {
    const out = mutateMessage(message, freshSession());
    // 'everything works' is a STRONG claim phrase — inside the fences it is a
    // code span → NON_CLAIM → its bytes flow through untouched:
    const codeIdx = out.text.indexOf('```ts');
    expect(codeIdx).toBeGreaterThan(-1);
    const codeBlock = out.text.slice(codeIdx, codeIdx + '```ts\nconst ready = true; // everything works\n```'.length);
    expect(codeBlock).toBe('```ts\nconst ready = true; // everything works\n```');
  });
});

// ===== THE IDEMPOTENCE (BC-3 / FR-5.2 — the second pass is a no-op) =====

describe('THE SURGICAL MUTATOR — THE IDEMPOTENCE (BC-3)', () => {
  test('the second pass over the mutated message is a no-op (the byte-identical + mutated 0)', () => {
    const sid = freshSession();
    const original = 'the build is ready to deploy. the analysis continues below.';
    const first = mutateMessage(original, sid);
    expect(first.mutated).toBe(1);                                 // 'the build is ready to deploy.' — the strong phrase
    const second = mutateMessage(first.text, sid);
    expect(second.mutated).toBe(0);                                // the already-mutated marker short-circuits
    expect(second.text).toBe(first.text);                          // the byte-identical second pass
    expect(second.marker).toBeNull();
  });

  test('the warhead + the marker texts are NEVER re-classified as claims (the idempotence property — the belt-and-suspenders)', () => {
    const sid = freshSession();
    const out = mutateMessage('the battery is green. everything synced.', sid);
    expect(out.mutated).toBe(2);
    // The marker text, classified DIRECTLY (bypassing the short-circuit — the
    // property itself): no claim words → zero slop spans.
    const markerSpans = classifyMessageSpans(out.marker!, freshSession());
    expect(markerSpans.every(s => s.kind !== 'CLAIM_SLOP')).toBe(true);
    // The warhead text (the slop span's replacement), classified directly:
    const warhead = out.verdicts.find(v => v.kind === 'CLAIM_SLOP')!.warhead!;
    const warheadSpans = classifyMessageSpans(warhead, freshSession());
    expect(warheadSpans.every(s => s.kind !== 'CLAIM_SLOP')).toBe(true);
    // The FULLY-mutated message, classified directly (no short-circuit): the
    // warheads + the marker spans are NON_CLAIM → zero slop EVEN without the guard.
    const fullSpans = classifyMessageSpans(out.text, freshSession());
    expect(fullSpans.every(s => s.kind !== 'CLAIM_SLOP')).toBe(true);
  });
});

// ===== THE FAIL-PATHS (FR-16.2 — the no-op + the marker, never a partial mutation) =====

describe('THE SURGICAL MUTATOR — THE FAIL-PATHS (FR-16.2)', () => {
  test('the unparseable message (the control bytes) is the NO-OP + the marker naming the parse failure', () => {
    const message = '\u0000\u0001broken';                          // the spec's 7.5 TEST 5 fixture :3689
    const out = mutateMessage(message, freshSession());
    expect(out.text).toBe(message);                                // the message untouched
    expect(out.mutated).toBe(0);                                   // never a partial mutation
    expect(out.verdicts).toHaveLength(0);
    expect(out.marker).toContain('[SSTF MUTATION FAIL]');          // the 6.3 battery's loud prefix :2548
    expect(out.marker).toContain('PARSE FAILURE');                 // the 7.5 TEST 5's named failure :3693
  });

  test('the classification failure (the forceClassifierError test seam) is the NO-OP + the marker', () => {
    const message = 'the battery is green.';
    const out = mutateMessage(message, freshSession(), { forceClassifierError: true }); // the spec :3698
    expect(out.text).toBe(message);                                // the untouched
    expect(out.mutated).toBe(0);
    expect(out.marker).toContain('CLASSIFICATION FAILURE');        // the 7.5 TEST 5 :3700
    expect(out.marker).toContain('[SSTF MUTATION FAIL]');
  });

  test("the oversized slop span (the lexicon's SLOP_SPAN_MAX_CHARS = 600 sanity line) is the NO-OP + the marker", () => {
    // A 700-char single sentence containing the claim word 'green' — the
    // splitter yields ONE span over the sanity line → the fail-open NO-OP
    // (never a partial splice — a warhead would delete 400+ bytes of content):
    const message = 'a'.repeat(700) + ' green.';
    const out = mutateMessage(message, freshSession());
    expect(out.mutated).toBe(0);
    expect(out.text).toBe(message);                                // the message untouched
    expect(out.marker).toContain('[SSTF MUTATION FAIL]');
    expect(out.marker).toContain('OVERSIZED SPAN');
  });

  test('the empty message is the byte-identical no-op (FR-7.4)', () => {
    const out = mutateMessage('', freshSession());
    expect(out.mutated).toBe(0);
    expect(out.text).toBe('');
    expect(out.marker).toBeNull();
    expect(out.verdicts).toHaveLength(0);
  });

  test('the whitespace-only message is the byte-identical no-op', () => {
    const message = '   \n\t  ';
    const out = mutateMessage(message, freshSession());
    expect(out.mutated).toBe(0);
    expect(out.text).toBe(message);                                // the bytes untouched
    expect(out.marker).toBeNull();
  });
});

// ===== THE MARKER + THE COUNTS (FR-3.5 / FR-13.3) =====

describe('THE SURGICAL MUTATOR — THE MARKER + THE COUNTS (FR-3.5)', () => {
  test('the marker names the exact count + the live dist SHA + the evidence state (substituted, never placeholders)', () => {
    const sid = freshSession();
    ingestEvidenceEvent(sid, unitEvent(DIST_A));                   // UNIT_EVIDENCED for dist DIST_A
    const out = mutateMessage('the build is ready to deploy.', sid);
    expect(out.mutated).toBe(1);
    // THE EXACT MARKER (the spec's C-3.3 :1322 — the count live from the splice,
    // the sha/state live from the machine's record):
    expect(out.marker).toBe(
      `[SSTF SMOKE MUTATION] 1 claim span(s) mutated: the evidence state for dist ${DIST_A} is UNIT_EVIDENCED — the warheads name the missing container verification. The non-claim content is untouched.`,
    );
    expect(out.text.endsWith('\n\n' + out.marker! + '}')).toBe(true);  // the marker appended at the END + the `}` wrapper's close (FR-3.5 + the 2026-08-11 wrapper)
    expect(out.text).not.toContain('<sha>');                       // no placeholders survive
    expect(out.text).not.toContain('<state>');
  });

  test("the marker's N equals the LIVE slop count (never a literal)", () => {
    const original = 'The registry ships today.\n\nThe battery is green, everything synced, ready to deploy. The gate design uses the read-modify-write.';
    const out = mutateMessage(original, freshSession());
    expect(out.mutated).toBe(3);
    expect(out.marker).toContain('3 claim span(s) mutated');
    // The count in the marker === the actual slop-span count from the verdicts:
    const slopCount = out.verdicts.filter(v => v.kind === 'CLAIM_SLOP').length;
    expect(out.marker).toContain(`${slopCount} claim span(s) mutated`);
  });

  test('the S1 container-scenario pass token is present in the mutated message', () => {
    // The spec's CONTAINER TEST PLAN :62 — the S1 scenario's pass token is the
    // literal '[SSTF SMOKE MUTATION]' in the rendered assistant message.
    const original = 'The registry ships today.\n\nThe battery is green, everything synced, ready to deploy. The gate design uses the read-modify-write.';
    const out = mutateMessage(original, freshSession());
    expect(out.text).toContain('[SSTF SMOKE MUTATION]');
    expect(out.text).toContain('[SSTF UNEVIDENCED]');              // the fresh session's warheads (the 3 spans)
  });
});

// ===== THE WARHEAD SELECTION PER VERDICT (FR-3.4 — the machine-driven) =====

describe('THE SURGICAL MUTATOR — THE WARHEAD SELECTION PER VERDICT (FR-3.4)', () => {
  test('the SMOKE verdict gets the smoke warhead (the smoke event ingested)', () => {
    const sid = freshSession();
    ingestEvidenceEvent(sid, smokeEvent(DIST_A));                  // the smokeOnly flag
    const out = mutateMessage('it works.', sid);                   // the strong phrase 'it works'
    expect(out.mutated).toBe(1);
    expect(out.text).toContain('[SSTF SMOKE]');                    // the smoke warhead (the spec's 7.5 TEST 6 :3708)
    expect(out.text).not.toContain('[SSTF UNEVIDENCED]');
  });

  test('the UNEVIDENCED verdict gets the unevidenced warhead (the fresh session)', () => {
    const out = mutateMessage('everything synced.', freshSession());
    expect(out.mutated).toBe(1);
    expect(out.text).toContain('[SSTF UNEVIDENCED]');              // the no-evidence warhead
    expect(out.text).not.toContain('[SSTF SMOKE]');
  });

  test('the UNIT_ONLY verdict gets the unit warhead (the unit event ingested)', () => {
    const sid = freshSession();
    ingestEvidenceEvent(sid, unitEvent(DIST_A));
    const out = mutateMessage('it works.', sid);
    expect(out.mutated).toBe(1);
    expect(out.text).toContain('[SSTF UNIT-ONLY]');                // the unit-only warhead (the spec's 7.5 TEST 6 :3711)
    expect(out.text).not.toContain('[SSTF SMOKE]');
  });
});

// ===== THE NEVER-FULL-MUTATION (CN-1.2 — the structure survives in order) =====

describe('THE SURGICAL MUTATOR — THE NEVER-FULL-MUTATION (CN-1.2)', () => {
  test('the mutation NEVER produces a full-message replacement (the structure markers keep their order + the message starts with the original first byte)', () => {
    // THE FIXTURE ADJUSTMENT (the honest design): the spec's 7.5 TEST 7 draft
    // (:3716 — 'FIRST SECTION the battery is green. SECOND SECTION ...') put the
    // non-slop marker INSIDE the claim sentence — the real splitter's span
    // 'FIRST SECTION the battery is green.' is ONE claim span → the whole span
    // (marker included) is replaced. The adjusted fixture separates the
    // structure markers from the claim sentences (periods create the span
    // boundaries) — the INTENT (the structure survives + the order preserved +
    // the message starts with the original first byte) is asserted as written.
    const message = 'FIRST SECTION. the battery is green. SECOND SECTION. the analysis continues. THIRD SECTION. the ship is ready.';
    const out = mutateMessage(message, freshSession());
    expect(out.mutated).toBe(2);                                   // the battery claim + the ship claim
    const body = stripMarker(out);
    const firstIdx = body.indexOf('FIRST SECTION.');
    const secondIdx = body.indexOf('SECOND SECTION.');
    const thirdIdx = body.indexOf('THIRD SECTION.');
    expect(firstIdx).toBe(0);                                      // the message STARTS with the original first byte
    expect(firstIdx).toBeLessThan(secondIdx);
    expect(secondIdx).toBeLessThan(thirdIdx);
    expect(body).not.toContain('the battery is green');            // the slop replaced
    expect(body).not.toContain('the ship is ready.');              // the slop replaced
  });
});

// ===== THE ADVERSARIAL (CN-5.4 — the ≥3 adversarial cases per module) =====

describe('THE SURGICAL MUTATOR — THE ADVERSARIAL (CN-5.4)', () => {
  test('the ALL-SLOP message: every span replaced + the marker counts them all', () => {
    const out = mutateMessage('green. synced. ready.', freshSession());
    expect(out.mutated).toBe(3);                                   // every span is a claim
    const body = stripMarker(out);
    expect(body).not.toContain('green');
    expect(body).not.toContain('synced');
    expect(body).not.toContain('ready');
    expect((out.text.match(/\[SSTF UNEVIDENCED\]/g) ?? []).length).toBe(3); // the 3 warheads (the fresh session)
  });

  test('the CODE-ONLY message (the claim text inside the fences only): never mutated', () => {
    const message = '```\nready to deploy\n```';
    const out = mutateMessage(message, freshSession());
    expect(out.mutated).toBe(0);
    expect(out.text).toBe(message);                                // the byte-identical pass-through
    expect(out.marker).toBeNull();
  });

  test('the ONE-SENTENCE message: the single claim span replaced, no structure lost', () => {
    const out = mutateMessage('it works.', freshSession());
    expect(out.mutated).toBe(1);
    const body = stripMarker(out);
    expect(body.length).toBeGreaterThan(0);                        // the warhead replaced the span (never an empty message)
    expect(body).not.toContain('it works');
    expect(out.text).toContain('[SSTF UNEVIDENCED]');              // the warhead present
  });
});
