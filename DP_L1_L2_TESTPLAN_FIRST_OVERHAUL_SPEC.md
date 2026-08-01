# DP L1/L2 OVERHAUL SPEC — TEST-PLAN-FIRST PLANNING
# ============================================================
**Version:** 2.0
**Classification:** DEEP PLANNING ARTIFACT OVERHAUL — TEST-PLAN-FIRST MANDATE
**Authority:** Trident v4.4.3 Overhaul Architecture
**Engine Mandate:** "Every plan MUST specify the exact container tests that will prove runtime-grade post-ship behavior BEFORE implementation begins. Planning without test design is theater."
**Build Time Estimate:** 1-2 days
**Lines of Code Estimate:** ~150 new in deep-planning-artifact.ts, ~80 in input-validation.ts, ~40 in trident-tools.ts
**Semantic Order Target:** L2 (Semantic — test design embedded in planning output)
**Dependencies:** SSTF_V4_OVERHAUL_SPEC.md (claim gating), container-test tool (test execution)
**Build Status:** SPECIFICATION — Awaiting Implementation
**Date:** 2026-07-31
# ============================================================

## 1. EXECUTIVE SUMMARY

### 1.1 Problem Statement

DP L1 (Initial Plan) and L2 (Detailed Workflow) generate implementation specs,
but they do NOT mandate the design of the exact container tests that will prove
the implementation works post-ship. The current pipeline:

1. PLAN generates a spec
2. AGENTS implement the spec
3. CONTAINER_TEST phase discovers what to test AFTER the fact

This is backwards. Testing must be designed DURING planning — before a single
line of implementation code is written. The test plan defines what "done" means.
Without it, agents implement to a moving target and the container test phase
improvises coverage after the fact.

### 1.2 What Exists Today (verified from source)

| Component | Container Test Wiring | Status |
|-----------|----------------------|--------|
| `deep-planning-artifact.ts` | Mentions "Deploy to container and verify" (line 470) — generic, no test design | ❌ NOT WIRED |
| `pipeline-generator.ts` | References runtime verification concepts — no test plan output | ❌ NOT WIRED |
| `input-validation.ts` | `validateTestPlan()` validates plans passed TO the container-test tool | ⚠️ WRONG LAYER — validates input, doesn't generate |
| `trident-tools.ts` | No test plan generation in DP flow | ❌ NOT WIRED |

The `validateTestPlan` function (input-validation.ts:250-290) enforces the test
plan format when calling trident-container-test — but nothing in the PLANNING
pipeline generates that test plan. The planning phase produces specs, not tests.

### 1.3 The Fix — Test-Plan-First

DP L1 and L2 outputs MUST each include a mandatory **Container Test Plan section**:

- **L1** (Initial Plan): a preliminary test plan — the 5+ adversarial angles that
  will verify the high-level approach
- **L2** (Detailed Workflow): the EXACT test plan — scenario-by-scenario, with
  prompts, pass criteria, fail criteria, evidence requirements, per-feature

This test plan becomes:
1. The definition of done for the build agents
2. The input to the CONTAINER_TEST phase (validated by validateTestPlan)
3. The acceptance criteria the adversarial verifier checks against

---

## 2. THE MANDATE — What Must Be Written

### 2.1 L1 Container Test Plan Section (mandatory, ~15% of L1 output)

```
## CONTAINER TEST PLAN — PRELIMINARY

This plan defines how runtime-grade behavior will be PROVEN after implementation.
It is designed BEFORE implementation because testing defines what "done" means.

### Test Philosophy
- Post-ship behavior in a real runtime environment, adversarially
- 5+ DIFFERENT attack angles — not 5 variations of the same test
- Mechanical evidence required for every pass
- Anything less is rejected

### Adversarial Angles to Cover
1. [ANGLE 1 — e.g., identity injection]
2. [ANGLE 2 — e.g., tool availability]
3. [ANGLE 3 — e.g., firewall enforcement]
4. [ANGLE 4 — e.g., error propagation]
5. [ANGLE 5 — e.g., boundary conditions]

### Evidence Requirement
Every scenario must produce: stream output, artifact on disk, SHA256, or exit code.
"I tested it and it works" is NOT evidence.

### Pass Threshold
ALL scenarios pass with mechanical evidence → runtime grade achieved.
```

### 2.2 L2 Container Test Plan Section (mandatory, ~20% of L2 output)

```
## CONTAINER TEST PLAN — EXACT

### Scenario 1: [NAME]
- Feature under test: [what implementation feature this verifies]
- Prompt: [exact TUI input]
- Pass criteria: [mechanical condition]
- Fail criteria: [what proves failure]
- Evidence: [stream pattern / artifact / SHA256]

### Scenario 2: [NAME]
...

### Scenario N: [NAME]
... (minimum 5, each a DIFFERENT adversarial angle)

## ADVERSARIAL SCENARIOS
### Adversarial 1: [attack on the implementation]
...

## EVIDENCE COLLECTION
[how each scenario's evidence is captured]

## PASS CRITERIA
[ALL scenarios pass with mechanical evidence → runtime grade]
```

---

## 3. IMPLEMENTATION — deep-planning-artifact.ts

### 3.1 New function: `generateContainerTestPlanSection`

```typescript
// ============================================================
// TEST-PLAN-FIRST: Mandatory container test plan generator
// Called by BOTH generateLayer1InitialPlan and generateLayer2DetailedWorkflow
// ============================================================

const ADVERSARIAL_ANGLE_LIBRARY: Array<{ id: string; name: string; question: string }> = [
  { id: 'IDENTITY', name: 'Identity Injection', question: 'Does the agent know its identity in the runtime environment?' },
  { id: 'TOOLS', name: 'Tool Availability', question: 'Are all required tools registered and callable?' },
  { id: 'FIREWALL', name: 'Firewall Enforcement', question: 'Are restricted operations actually blocked?' },
  { id: 'AUDIT', name: 'Audit Accuracy', question: 'Does the audit find real defects, not phantom ones?' },
  { id: 'LIFECYCLE', name: 'Lifecycle', question: 'Does activation/deactivation work as designed?' },
  { id: 'ERRORS', name: 'Error Propagation', question: 'What happens when a tool throws mid-operation?' },
  { id: 'BOUNDARY', name: 'Boundary Conditions', question: 'Empty input, max-size input, malformed data?' },
  { id: 'PERMISSIONS', name: 'Permission Bypass', question: 'Can a subagent escalate privileges?' },
  { id: 'STATE', name: 'State Corruption', question: 'What happens if persisted state is invalid?' },
  { id: 'CONFIG', name: 'Configuration Drift', question: 'What happens if env vars are missing?' },
  { id: 'CONCURRENCY', name: 'Concurrency', question: 'Parallel operations — races, collisions?' },
  { id: 'INTEGRATION', name: 'Integration Failure', question: 'Do modules work together as a system?' },
];

export function generateContainerTestPlanSection(
  context: string,               // what the plan is about (feature list)
  angleSelection?: string[],     // optional: force specific angles
): string {
  // Select 5+ angles relevant to the context
  const angles = (angleSelection && angleSelection.length >= 5
    ? angleSelection
    : selectAnglesForContext(context)).slice(0, 8);

  let out = '\n## CONTAINER TEST PLAN\n\n';
  out += 'This plan is written BEFORE implementation. It defines what "done" means.\n';
  out += 'Post-ship behavior in a real runtime environment, adversarially.\n\n';
  out += '### Adversarial Angles\n';
  for (const angle of angles) {
    out += `1. **${angle.name}** — ${angle.question}\n`;
  }
  out += '\n### Evidence Requirement\n';
  out += 'Every scenario: stream output, artifact on disk, SHA256, or exit code.\n';
  out += '"I tested it and it works" is NOT evidence.\n\n';
  out += '### Pass Threshold\n';
  out += 'ALL scenarios pass with mechanical evidence → runtime grade achieved.\n';
  return out;
}

// Heuristic: map context keywords to relevant angles
function selectAnglesForContext(context: string): string[] {
  const l = context.toLowerCase();
  const selected: string[] = [];
  const map: Array<{ key: string; angle: string }> = [
    { key: 'hook', angle: 'FIREWALL' },
    { key: 'firewall', angle: 'FIREWALL' },
    { key: 'audit', angle: 'AUDIT' },
    { key: 'identity', angle: 'IDENTITY' },
    { key: 'tool', angle: 'TOOLS' },
    { key: 'poseidon', angle: 'LIFECYCLE' },
    { key: 'error', angle: 'ERRORS' },
    { key: 'boundary', angle: 'BOUNDARY' },
    { key: 'permission', angle: 'PERMISSIONS' },
    { key: 'state', angle: 'STATE' },
    { key: 'config', angle: 'CONFIG' },
    { key: 'parallel', angle: 'CONCURRENCY' },
    { key: 'integrat', angle: 'INTEGRATION' },
  ];
  for (const m of map) {
    if (l.includes(m.key) && !selected.includes(m.angle)) selected.push(m.angle);
  }
  // Fill to minimum 5 with defaults
  const defaults = ['IDENTITY', 'TOOLS', 'FIREWALL', 'AUDIT', 'LIFECYCLE'];
  for (const d of defaults) {
    if (selected.length >= 5) break;
    if (!selected.includes(d)) selected.push(d);
  }
  return selected.slice(0, 5);
}
```

### 3.2 Wire into generateLayer1InitialPlan

```typescript
// In generateLayer1InitialPlan, before the final return:
const l1 = buildLayer1Content(...);  // existing
const testPlanSection = generateContainerTestPlanSection(requirements + ' ' + architecture);
return l1 + testPlanSection;
```

### 3.3 Wire into generateLayer2DetailedWorkflow

```typescript
// In generateLayer2DetailedWorkflow, before the final return:
const l2 = buildLayer2Content(...);  // existing
const exactTestPlan = generateExactTestPlanSection(
  components,     // the components being built
  defenses,       // the defenses being applied
  architecture,   // system context
);
return l2 + exactTestPlan;
```

### 3.4 New: `generateExactTestPlanSection` — scenario-level detail

```typescript
export function generateExactTestPlanSection(
  components: Array<{ name: string; description: string }>,
  defenses: string[],
  context: string,
): string {
  const angles = selectAnglesForContext(context + ' ' + defenses.join(' '));
  let out = '\n## EXACT CONTAINER TEST PLAN\n\n';
  out += 'Scenario-by-scenario proof of runtime-grade post-ship behavior.\n\n';
  out += '| # | Scenario | Feature | Prompt | Pass Criteria | Fail Criteria | Evidence |\n';
  out += '|---|----------|---------|--------|---------------|---------------|----------|\n';
  for (let i = 0; i < angles.length; i++) {
    const angle = angles[i];
    out += `| ${i + 1} | ${angle} | ${components[0]?.name || 'system'} | "test ${angle.toLowerCase()}" | mechanical condition | absence of evidence | stream/SHA256/artifact |\n`;
  }
  out += '\n### Mandate\n';
  out += '- 5+ DIFFERENT adversarial angles minimum\n';
  out += '- Every scenario: mechanical evidence required\n';
  out += '- Test plan is the definition of done — implementation is incomplete until ALL pass\n';
  return out;
}
```

---

## 4. IMPLEMENTATION — input-validation.ts (validation layer)

The existing `validateTestPlan` already validates plans for the container-test tool.
NEW: export a helper that validates the DP-embedded test plan section:

```typescript
// NEW export — validates that a DP output contains a valid container test plan
export function validateEmbeddedTestPlan(plan: unknown): string | null {
  if (typeof plan !== 'string') return 'TEST PLAN MISSING: DP output must include a CONTAINER TEST PLAN section';
  const errors: string[] = [];

  // Section must exist
  if (!/CONTAINER TEST PLAN/i.test(plan)) {
    errors.push('Missing CONTAINER TEST PLAN section');
  }

  // Must reference at least 5 adversarial angles
  const angleCount = (plan.match(/^1\.\s/gm) || []).length;
  // Actually: count "Adversarial Angle" mentions
  const angleMentions = (plan.match(/Angle \d+/gi) || []).length;
  if (angleMentions < 5) {
    errors.push(`Only ${angleMentions}/5+ adversarial angles specified`);
  }

  // Must have evidence requirement
  if (!/evidence/i.test(plan)) {
    errors.push('Missing evidence requirement');
  }

  // Must have pass threshold
  if (!/pass/i.test(plan)) {
    errors.push('Missing pass criteria');
  }

  if (errors.length > 0) {
    return 'TEST PLAN VALIDATION FAILED:\n' + errors.map((e) => `  - ${e}`).join('\n');
  }
  return null;
}
```

---

## 5. IMPLEMENTATION — trident-tools.ts (tool schema + enforcement)

### 5.1 DP tool schema — require test plan output

```typescript
// In the trident-deep-planning tool schema, ADD:
testPlanRequired: z.boolean().default(true).describe(
  'MANDATORY: the DP output MUST include a CONTAINER TEST PLAN section ' +
  'specifying 5+ adversarial angles. Planning without test design is theater.'
),
```

### 5.2 Post-generation validation

```typescript
// After generateLayer1InitialPlan/L2 returns, validate:
const testPlanError = validateEmbeddedTestPlan(output);
if (testPlanError) {
  // Return the error with the generated plan so the agent knows what's missing
  return output + '\n\n[TEST PLAN VALIDATION]\n' + testPlanError + '\n' +
    'Regenerate the plan WITH the container test section before proceeding.';
}
```

---

## 6. PERFORMANCE BUDGETS

| Metric | Target |
|--------|--------|
| Test plan section generation | < 100ms (template + angle selection) |
| Embedded plan validation | < 10ms |
| L1 output size increase | ~15% |
| L2 output size increase | ~20% |
| False rejection rate (valid plans) | 0% |

---

## 7. ACCEPTANCE CRITERIA

- [ ] `generateLayer1InitialPlan` output includes `## CONTAINER TEST PLAN`
- [ ] L1 test plan has 5+ distinct adversarial angles
- [ ] L1 test plan includes evidence requirement
- [ ] `generateLayer2DetailedWorkflow` output includes `## EXACT CONTAINER TEST PLAN`
- [ ] L2 test plan has scenario-level detail (prompt, pass, fail, evidence)
- [ ] `validateEmbeddedTestPlan` rejects output without test plan section
- [ ] DP tool output validation catches missing test plans and instructs regeneration
- [ ] The generated test plan is compatible with `validateTestPlan` (container-test tool input)
- [ ] Test plan is written BEFORE implementation (ordering in the generated output)

---

## 8. CONTAINER TEST PLAN (verify in container)

### 8.1 Scenario 1: DP L1 includes test plan
1. Prompt: "trident-deep-planning on a test project with requirements"
2. **PASS: output contains `## CONTAINER TEST PLAN` with 5+ angles**
3. **FAIL: output lacks test plan section**

### 8.2 Scenario 2: DP L2 includes exact test plan
1. Prompt: "trident-deep-planning with layer=2"
2. **PASS: output contains `## EXACT CONTAINER TEST PLAN` with scenario table**
3. **FAIL: no exact plan**

### 8.3 Scenario 3: Validation rejects missing plan
1. Feed a DP output with the test plan section stripped
2. **PASS: validateEmbeddedTestPlan returns error**
3. **FAIL: validation passes without plan**

### 8.4 Scenario 4: Test plan feeds container test
1. Extract the test plan from DP output
2. Pass it to trident-container-test action=setup as testPlan
3. **PASS: validateTestPlan accepts it (meets 2000+ chars, all sections)**
4. **FAIL: plan rejected by container test validation**

### 8.5 Adversarial: Theatrical test plan
1. Generate a DP output with "test plan" that only probes trident-status
2. **PASS: rejected (theatrical markers in validateTestPlan)**
3. **FAIL: accepted**

---

## 9. FILE MANIFEST

| File | Action | Est. Lines |
|------|--------|-----------|
| src/artifacts/deep-planning-artifact.ts | MODIFY (add test plan generators + wire into L1/L2) | +150 |
| src/tools/input-validation.ts | MODIFY (add validateEmbeddedTestPlan) | +40 |
| src/tools/trident-tools.ts | MODIFY (schema + post-gen validation) | +40 |
| **TOTAL** | | **~230 net new** |

---

*Specification complete. Test-plan-first is now a mandate: planning defines the tests, tests define done, and the container validates both.*
