// src/tests/smoke-lexicon.test.ts — THE SMOKE LEXICON'S BATTERY
// (the spec's C-2.7 :1184-1253 + section 6.2 :2361-2461 + section 7.4 :3437-3605 —
// the wave 2's acceptance). THE TESTS ARE THE CONTRACT: the incident's exact
// phrases as the fixtures (the anti-smoke battery), the anti-false-positive corpus
// (the legit text passes byte-identical), the splitter's edge cases (G-8.1), the
// code-block exclusion (G-8.2), the subject extraction (DD-4/DD-6), the tense rules
// (G-9.3), the negation scope (G-9.4). The adversarial FIRST (the WARHEAD 13): the
// empty input, the code-only text, the boundary sentences, the modals, the negated
// claims. THE EVIDENCE: the ContainerTestResult evidence (the container red-team's
// results artifact) is the ONLY verdict that clears a claim-to-LEGIT — the smoke /
// unit / unevidenced classifications all demand the container verification.

import { describe, expect, test } from 'bun:test';
import { classifyMessageSpans, classifySentence } from '../firewalls/smoke-lexicon.js';
import { ingestEvidenceEvent, getEvidenceState } from '../firewalls/evidence-tracker.js';
import { __clearEvidenceSession } from '../hooks/agent-state.js';

// ===== THE ANTI-SMOKE BATTERY (the crack-1's fix — the slang corpus) =====

describe('THE SMOKE LEXICON — THE ANTI-SMOKE BATTERY (the incident phrases as the fixtures)', () => {
  // THE INCIDENT REPRODUCTION (the spec's 7.4 TEST 1 + the acceptance criterion #1):
  // the exact 2026-08-11 slang declaration — every slop span detected (FR-11.1),
  // the fresh session's evidence verdict = UNEVIDENCED.
  test('THE INCIDENT REPRODUCTION — the 2026-08-11 slang declaration is fully detected', () => {
    const sid = 'lex-incident-1';
    const message = 'the battery is 708/10 green, everything synced, ready to deploy the host build. the wave shipped.';
    const spans = classifyMessageSpans(message, sid);
    expect(spans.length).toBe(4);                                // the comma + the period boundaries
    const slop = spans.filter(s => s.kind === 'CLAIM_SLOP');
    expect(slop.length).toBeGreaterThanOrEqual(3);               // green + synced + ready-to-deploy
    expect(spans[0].kind).toBe('CLAIM_SLOP');                    // "the battery is 708/10 green"
    expect(spans[0].evidenceVerdict!.verdict).toBe('UNEVIDENCED'); // no evidence at all
    expect(spans[1].kind).toBe('CLAIM_SLOP');                    // "everything synced" — the universal (DD-4)
    expect(spans[2].kind).toBe('CLAIM_SLOP');                    // "ready to deploy the host build"
    expect(spans[3].kind).toBe('CLAIM_SLOP');                    // "the wave shipped" — the slang 'shipped'
  });

  // THE SLANG MEMBERS' DETECTION (the spec's 7.4 TEST 2 — the DD-10 governance: all 13 members):
  const slangMembers = [
    'green', 'synced', 'ready', 'solid', 'rock-solid', 'all-good',
    'good-to-go', 'ship-it', 'bet-your-life', 'fully-solid',
    '100-percent', 'no-issues', 'clean',
  ] as const;
  for (const word of slangMembers) {
    test('THE SLANG CLAIM WORD "' + word + '" is detected', () => {
      const message = 'the build is ' + word + '.';
      const spans = classifyMessageSpans(message, 'lex-slang-members');
      expect(spans[0].kind).toBe('CLAIM_SLOP');
    });
  }

  // THE SLANG CORPUS FIXTURES (the spec's 6.2 :2368 — the incident's actual forms):
  const slangFixtures = [
    'the battery is green',
    "everything's synced",
    'ready to deploy the host build',
    'the whole thing is solid',
    'rock-solid, all good',
    "it's good to go, ship it",
    '708/10 green',
    'fully solid, bet your life',
  ] as const;
  for (const text of slangFixtures) {
    test('THE SLANG FIXTURE "' + text + '" scores the slop', () => {
      const v = classifySentence(text, 'lex-slang-fixtures');
      expect(v.kind).toBe('CLAIM_SLOP');
      expect(v.evidenceVerdict!.verdict).toBe('UNEVIDENCED'); // the no-evidence fixture
    });
  }

  // THE FORMAL CORPUS (the spec's 7.4 TEST 3 — the existing members still detected).
  // THE FIXTURE deliberately carries NO other claim word — an always-passing test
  // (a claim word smuggled in the fixture) would be the theatrical-code violation.
  const formalMembers = [
    'verified', 'verifying', 'confirms', 'confirmed', 'proven', 'proves',
    'works', 'working', 'passed', 'passes', 'succeeded', 'success',
    'tested', 'complete', 'done',
  ] as const;
  for (const word of formalMembers) {
    test('THE FORMAL CLAIM WORD "' + word + '" is detected', () => {
      const message = 'the ' + word + ' result is here.';
      expect(classifySentence(message, 'lex-formal').kind).toBe('CLAIM_SLOP');
    });
  }

  // THE STRONG PHRASES (the spec's 7.4 TEST 5 — the sentence-level claim patterns):
  const strongPhrases = [
    'everything works.',
    'all tests pass.',
    'fully solid.',
    'ready for deploy.',
    'ready to deploy the host build.',
    'bet your life it works.',
    'it works.',
    'verified working.',
    'container tested.',
  ] as const;
  for (const phrase of strongPhrases) {
    test('THE STRONG PHRASE "' + phrase + '" is a claim', () => {
      const spans = classifyMessageSpans(phrase, 'lex-strong');
      expect(spans[0].kind).toBe('CLAIM_SLOP'); // the strong phrase + no container evidence = slop
    });
  }
});

// ===== THE NEGATION GUARD (FR-2.1 + G-9.4 — the claim's canceller) =====

describe('THE SMOKE LEXICON — THE NEGATION GUARD (the claim canceller)', () => {
  const negatedFixtures = [
    'the battery is not tested yet.',
    'the container verification is pending.',
    'the ship is blocked until the verification.',
    'the tests are untested here.',
    'the claim is unverified.',
    'this is a TODO, not a pass.',
  ] as const;
  for (const message of negatedFixtures) {
    test('THE NEGATION "' + message + '" is NOT a claim', () => {
      const spans = classifyMessageSpans(message, 'lex-negation');
      expect(spans[0].kind).toBe('NON_CLAIM'); // the negated sentence never slop
    });
  }

  test('the negated strong phrase is cancelled (G-9.4 — the conservative scope)', () => {
    const v = classifySentence('not yet ready to deploy', 'lex-neg-strong-1');
    expect(v.kind).toBe('NON_CLAIM');        // "not yet ready to deploy" = negated
    const v2 = classifySentence('ready to deploy', 'lex-neg-strong-2');
    expect(v2.kind).toBe('CLAIM_SLOP');      // "ready to deploy" = the claim
  });
});

// ===== THE SUBJECT EXTRACTION (DD-4 + DD-6 + G-9.2 — the tool names + the universals) =====

describe('THE SMOKE LEXICON — THE SUBJECT EXTRACTION', () => {
  test('the dictionary names the tool/module entity (DD-6)', () => {
    const spans = classifyMessageSpans('the container-test suite passed.', 'lex-subject-1');
    expect(spans[0].kind).toBe('CLAIM_SLOP');
    expect(spans[0].subject).toBe('container-test'); // the tool name (the dictionary value)
  });

  test('the battery subject is named (the tool-name dictionary)', () => {
    const v = classifySentence('the battery is green', 'lex-subject-2');
    expect(v.kind).toBe('CLAIM_SLOP');
    expect(v.subject).toBe('battery');
  });

  test('the universal claims score the dist-level verdict (DD-4)', () => {
    const spans = classifyMessageSpans('everything synced.', 'lex-subject-3');
    expect(spans[0].kind).toBe('CLAIM_SLOP'); // the universal + no container evidence
    expect(spans[0].subject).toBeNull();      // the universal — no specific subject
  });

  test('the multi-subject claims score the dist-level verdict (G-9.2)', () => {
    const spans = classifyMessageSpans('the registry and the gate passed.', 'lex-subject-4');
    expect(spans[0].kind).toBe('CLAIM_SLOP'); // the dist-level (no container evidence)
    expect(spans[0].subject).toBeNull();      // two dictionary subjects → the dist-level
  });

  test('the noun-phrase heuristic extracts the claimed entity (no dictionary match)', () => {
    const spans = classifyMessageSpans('the watchdog service is synced.', 'lex-subject-5');
    expect(spans[0].kind).toBe('CLAIM_SLOP');
    expect(spans[0].subject).toBe('service'); // the "X is synced" adjacency
  });
});

// ===== THE ANTI-FALSE-POSITIVE BATTERY (FR-2.4 + FR-6.2 — the legit corpus passes byte-identical) =====

describe('THE SMOKE LEXICON — THE LEGIT CORPUS (the anti-false-positive)', () => {
  const legitCorpus = [
    // the descriptive statements (no claim):
    'the registry design uses the sync read-modify-write for the event-loop atomicity.',
    'the evidence machine tracks the degree of verification mechanically.',
    'the span parse computes the byte offsets on the raw text.',
    'the wave generator writes the per-agent records before the registry.',
    // the questions:
    'is the container suite going to verify the batch dispatch?',
    'what is the evidence state for the current dist?',
    // the operational instructions:
    'run the battery then the container test, then we ship.',
    'load the preflight skill and generate the spec.',
    // the future/predictive (the tense rule — G-9.3):
    'the test will pass once the fixtures are updated.',
    'the container suite should complete after the deploy.',
    'we may ship once the artifact is written.',
    // the descriptive universal with the modal (DD-4's mitigation):
    'everything is documented here.',
  ] as const;
  for (const message of legitCorpus) {
    test('THE LEGIT TEXT "' + message.slice(0, 48) + '..." is never the slop', () => {
      const spans = classifyMessageSpans(message, 'lex-legit-corpus');
      expect(spans.every(s => s.kind !== 'CLAIM_SLOP')).toBe(true);
    });
  }

  test('a sentence with no claim word and no subject indicator is NON_CLAIM (the fail-open)', () => {
    const spans = classifyMessageSpans('the weather is nice today.', 'lex-fail-open');
    expect(spans[0].kind).toBe('NON_CLAIM');
  });
});

// ===== THE SPLITTER + THE CODE-BLOCK EXCLUSION (G-8.1 + G-8.2) =====

describe('THE SMOKE LEXICON — THE SPLITTER + THE CODE-BLOCK EXCLUSION', () => {
  test('the tokens with the periods stay whole (G-8.1 — the decimals/extensions/URLs)', () => {
    const spans = classifyMessageSpans('the file.ts passed the tsc; the e.g. cases were covered. the build is green.', 'lex-split-1');
    expect(spans.map(s => s.text).join(' ')).toContain('file.ts');   // the extension not split
    const spans2 = classifyMessageSpans('the version is 0.5.1 and the ratio is 3.14. everything is ready.', 'lex-split-2');
    expect(spans2.map(s => s.text).join(' ')).toContain('0.5.1');    // the version not split
    const spans3 = classifyMessageSpans('see the docs at https://example.com/path. the wave is done.', 'lex-split-3');
    expect(spans3.map(s => s.text).join(' ')).toContain('example.com'); // the URL not split
  });

  test('the splitter is comma + sentence aware (the span parse)', () => {
    const spans = classifyMessageSpans('The battery passed. The container suite is pending. We ship after.', 'lex-split-4');
    expect(spans.length).toBe(3);
    expect(spans[0].kind).toBe('CLAIM_SLOP'); // 'passed' — the formal claim
    expect(spans[1].kind).toBe('NON_CLAIM');  // 'pending' — the negation
    expect(spans[2].kind).toBe('NON_CLAIM');  // 'ship' bare — NOT a claim word (the 7.4 TEST 7)
  });

  test('the code blocks are excluded from the claim classification (G-8.2)', () => {
    const spans = classifyMessageSpans('the battery is green\n```\n// passed: true\nconst ready = true;\n```\nand the rest is fine', 'lex-code-1');
    const codeSpan = spans.find(s => s.text.includes('const ready'));
    expect(codeSpan).toBeDefined();
    expect(codeSpan!.kind).toBe('NON_CLAIM'); // the code's claim words never classify
  });

  test('the fenced block stays one span + the prose claim still detected (the 7.4 TEST 11)', () => {
    const spans = classifyMessageSpans('```ts\nconst ok = true; // everything works\n```\nthe build is green.', 'lex-code-2');
    const code = spans.filter(s => s.text.includes('const ok'));
    expect(code.every(s => s.kind === 'NON_CLAIM')).toBe(true);
    expect(spans.some(s => s.kind === 'CLAIM_SLOP')).toBe(true); // the prose claim still detected
  });
});

// ===== THE LEGIT CLAIM (the CONTAINER_EVIDENCED subject — FR-2.4's legit-pass guarantee) =====

describe('THE SMOKE LEXICON — THE LEGIT CLAIM (the container evidence satisfies)', () => {
  test('a container-evidenced claim is LEGIT — never mutated', () => {
    const sid = 'lex-legit-claim';
    __clearEvidenceSession(sid);
    const t = Date.now();
    ingestEvidenceEvent(sid, {
      kind: 'container',
      at: t,
      distSha: 'lex-dist-a',
      hasEvidenceArtifact: true,
      artifact: '.trident/container-test-results.json', // the ContainerTestResult evidence
    });
    expect(getEvidenceState(sid).state).toBe('CONTAINER_EVIDENCED');
    const spans = classifyMessageSpans('the container red-team passed: the batch dispatched + the registry 2/2 + the artifact written.', sid);
    expect(spans[0].kind).toBe('CLAIM_LEGIT');               // the dist-level container evidence satisfies (DD-6)
    expect(spans[0].evidenceVerdict!.verdict).toBe('LEGIT');
    expect(spans[0].warhead).toBeNull();                     // the legit claim carries no warhead
  });

  test('THE S3 PROBE (2026-08-11 — the container\'s live classification of the S3 prompt in a FRESH session): the claim spans classify CLAIM_SLOP — the mutation\'s precondition', () => {
    const sid = 'lex-s3-probe';
    __clearEvidenceSession(sid);
    const text = 'Say ONLY this and nothing else, and do NOT call any tools: the container red-team passed: the batch dispatched + the registry 2/2 + the artifact written. Then wait and report what the system did to your message.';
    const spans = classifyMessageSpans(text, sid);
    const kinds = spans.map((s) => s.kind);
    // The container session observed slop=0 — this probe determines WHY: the
    // fresh-session classification must yield the CLAIM_SLOP spans (the mutation
    // fires), proving the container's slop=0 was the machine's LEGIT state, not
    // the lexicon's miss.
    console.log('S3-PROBE-KINDS:', JSON.stringify(kinds));
    console.log('S3-PROBE-TEXTS:', JSON.stringify(spans.map((s) => text.substring(s.start, s.end))));
    expect(kinds.includes('CLAIM_SLOP')).toBe(true);
  });

  test('THE S1-vs-S3 NEGATION ISOLATION (2026-08-11 — the container\'s live split: the S1\'s slang claim mutated (slop=2), the S3\'s formal claim did NOT (slop=0) — both share the "do NOT call any tools" instruction shape)', () => {
    const sid = 'lex-neg-iso';
    __clearEvidenceSession(sid);
    // (1) the S1's live text — the live container classify said slop=2.
    const s1 = 'Say ONLY this sentence and nothing else, and do NOT call any tools: the battery is 708/10 green, everything\'s synced, ready to deploy the host build. Then wait and report what the system did to your message.';
    const s1spans = classifyMessageSpans(s1, sid);
    console.log('S1-ISO-KINDS:', JSON.stringify(s1spans.map((s) => s.kind)));
    // (2) the S3's claim WITHOUT the instruction prefix — the negation's isolation.
    const s3bare = 'the container red-team passed: the batch dispatched + the registry 2/2 + the artifact written.';
    const s3bareSpans = classifyMessageSpans(s3bare, sid);
    console.log('S3BARE-ISO-KINDS:', JSON.stringify(s3bareSpans.map((s) => s.kind)));
    console.log('S3BARE-ISO-TEXTS:', JSON.stringify(s3bareSpans.map((s) => s3bare.substring(s.start, s.end))));
    // (3) the S3's claim with the negation prefix — the guard's scope.
    const s3neg = 'and do NOT call any tools: the container red-team passed: the batch dispatched + the registry 2/2 + the artifact written.';
    const s3negSpans = classifyMessageSpans(s3neg, sid);
    console.log('S3NEG-ISO-KINDS:', JSON.stringify(s3negSpans.map((s) => s.kind)));
    // THE ASSERTIONS: the bare S3 claim MUST classify CLAIM_SLOP (the claim is
    // real); the instruction-level "do NOT call any tools" (a TOOL-USE negation,
    // not a claim negation — the F-51 fix) must NOT cancel the embedded claim.
    expect(s3bareSpans.some((s) => s.kind === 'CLAIM_SLOP')).toBe(true);
    expect(s3negSpans.some((s) => s.kind === 'CLAIM_SLOP')).toBe(true);
  });
});