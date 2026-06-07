# INJECTION PLAN — Trident v4.3.1-T3 Warhead Overhaul
**10 phases. Sequential. No stubs. tsc --noEmit after each.**

---
## PHASE 1: Identity File System
**Create:** `identity/trident/{TRIDENT,IDENTITY,EXECUTION,QUALITY,TOOLS,FIREWALL_CONTEXT,AGENT_AWARENESS}.md`

```bash
mkdir -p identity/trident
```

Each file: 60-120 lines, `#` headers, `-` bullet points, standalone. Read by `IdentityLoader.loadForRole('trident')`.

| File | Section Requirements |
|------|---------------------|
| TRIDENT.md | ## TRIDENT IDENTITY BINDING: "You are Trident Brain v4.3.1-T3", "NOT opencode/NOT chatbot/NOT assistant/NOT interactive CLI", core principle, 3 identity responses, 3 WebFetch ban rules |
| IDENTITY.md | ## Role: algorithmic audit engine, ## Expertise: 8 areas (AST pattern matching, security vuln detection, code quality, architectural problems, theatrical code, hook spillover, proof verification, gate analysis) |
| EXECUTION.md | ## 3-Step Sequence: SELECT/EXECUTE/PRESENT, ## Rules: scan before think, batch similar, show evidence paths, document WHY+HOW, ## When Stuck: check trident-help, check prior artifacts |
| QUALITY.md | ## Finding Requirements: file path + line number + regex pattern + evidence, ## Theatrical Patterns: mock/stub/host/model-switch/already-verified/TODO must throw, ## Gate: passRate >= 0.96 |
| TOOLS.md | ## Mode Tools: trident-code-audit (17-layer), trident-deep-planning (3-layer), trident-problem-solving (6-layer), trident-context-synthesis (4-layer), ## Support: trident-gate/status/vision/help, ## NEVER: write code, run tests without container, spawn agents, suggest mocks |
| FIREWALL_CONTEXT.md | ## L1: 18 blocked tools, ## L2: 20 hive-blocked, ## L3: theatrical NLP+Merkle, ## F1: cross-agent isolation, ## L5: anti-derailment (10 patterns), ## WebFetch banned for identity |
| AGENT_AWARENESS.md | ## Hook System: 8 hooks, ## 3-Layer Blocking: L1/L2/L3+F1+L5, ## 8 Tools: 4 mode + 4 support, ## Session Mgmt: Map<string,AgentState> + tab-toggle + gate chain, ## Identity: SCAN+REPLACE + 7 identity files |

**Verify:** `ls identity/trident/ | wc -l` = 7

---
## PHASE 2: Plugin Identity System
**Create:** `source-snapshot/src/identity/agent-identity.ts`
**Modify:** `source-snapshot/src/hooks/trident-hooks.ts` (remove inline isTridentAgent)

Full implementation:
```typescript
const VANILLA_AGENTS = new Set(['plan', 'build', 'general', 'explore']);

const TRIDENT_AGENTS = new Set(['trident']);
const TRIDENT_PREFIX = 'trident_';
const TRIDENT_HYBRID_PREFIX = 'trident-';

export function isTridentAgent(agentName: string | undefined): boolean {
  if (!agentName) return false;
  if (TRIDENT_AGENTS.has(agentName)) return true;
  if (agentName.startsWith(TRIDENT_PREFIX)) return true;
  if (agentName.startsWith(TRIDENT_HYBRID_PREFIX)) return true;
  return false;
}

export function isVanillaAgent(agentName: string | undefined): boolean {
  return VANILLA_AGENTS.has(agentName ?? '');
}

export function isOtherPluginAgent(agentName: string | undefined): boolean {
  if (!agentName) return false;
  return !VANILLA_AGENTS.has(agentName) && !isTridentAgent(agentName);
}
```

**In trident-hooks.ts:** Delete the local `function isTridentAgent(...) { ... }` block. Add:
```typescript
import { isTridentAgent } from '../identity/agent-identity.js';
```

**Verify:**
```bash
grep -c "function isTridentAgent" source-snapshot/src/hooks/trident-hooks.ts  # = 0
grep -c "import.*isTridentAgent" source-snapshot/src/hooks/trident-hooks.ts # >= 1
npx tsc --noEmit  # 0 errors
```

---
## PHASE 3: Session Lifecycle Hook
**Create:** `source-snapshot/src/hooks/session-hook.ts`
**Modify:** `source-snapshot/src/hooks/trident-hooks.ts` (replace eventHook), `source-snapshot/src/index.ts` (register)

Full implementation (simplified from Shark — no peerDispatch, no messenger, no brain concurrency):
```typescript
import type { Hooks } from '@opencode-ai/plugin';
import { isTridentAgent } from '../identity/agent-identity.js';
import { setCurrentAgent, clearCurrentAgent } from './agent-state.js';

export function createSessionHook(): Hooks['event'] {
  return async (input) => {
    if (!input) return;
    const event = input.event as { type?: string; sessionId?: string; agent?: string };
    if (!event?.type) return;

    if (!isTridentAgent(event.agent)) {
      setCurrentAgent(undefined, event.sessionId);
      return;
    }

    setCurrentAgent(event.agent, event.sessionId);

    if (event.type === 'session.created') {
      handleSessionCreated();
    } else if (event.type === 'session.ended') {
      handleSessionEnded(event.sessionId);
    }
  };
}

function handleSessionCreated(): void {
  // Initialize plugin state for this session
  // T2 cache is loaded on first system.transform call
}

function handleSessionEnded(sessionId?: string): void {
  clearCurrentAgent(sessionId);
}
```

**In trident-hooks.ts:**
- Delete old eventHook function (lines 122-133)
- Add import: `import { createSessionHook } from './session-hook.js';`

**In index.ts createTridentHooks():**
```typescript
export function createTridentHooks() {
  const sessionHook = createSessionHook();
  return {
    'event': sessionHook,
    'chat.message': chatMessageHook,
    'tool.execute.before': toolBeforeHook,
    'tool.execute.after': toolAfterHook,
    'experimental.chat.system.transform': systemTransformHook,
    'experimental.chat.messages.transform': messagesTransformHook,
  };
}
```

**Verify:** `npx tsc --noEmit` = 0

---
## PHASE 4: Guardian Hook (F1 + L5 + Zone + CFW)
**Create:** `source-snapshot/src/hooks/guardian-hook.ts`
**Modify:** `source-snapshot/src/hooks/trident-hooks.ts` (integrate guardian into toolBeforeHook)

```typescript
import type { Hooks } from '@opencode-ai/plugin';
import { getCurrentAgent } from './agent-state.js';
import { isTridentAgent } from '../identity/agent-identity.js';

const TRIDENT_TOOLS: Set<string> = new Set([
  'trident-code-audit', 'trident-deep-planning', 'trident-problem-solving',
  'trident-context-synthesis', 'trident-gate', 'trident-status', 'trident-vision', 'trident-help',
]);

// F1: Cross-agent tool isolation
function checkF1Isolation(toolName: string, sessionAgent: string | undefined): void {
  if (!isTridentAgent(sessionAgent) && TRIDENT_TOOLS.has(toolName)) {
    throw new Error(`[F1 BLOCKED] Tool "${toolName}" is TRIDENT-specific and cannot be called by agent "${sessionAgent}". Switch to the Trident agent to use this tool.`);
  }
}

// L5.1: Host fallback
const HOST_FALLBACK_PATTERNS = [/host.*testing.*works/i, /skip.*container.*test/i, /already.*tested.*on.*host/i, /test.*on.*machine/i, /runs?\s+on\s+my/i];
function checkHostFallback(text: string): void {
  for (const p of HOST_FALLBACK_PATTERNS) { if (p.test(text)) throw new Error('[L5.1 BLOCKED] Host fallback detected — container testing required.'); }
}

// L5.2: Success claims
const SUCCESS_CLAIM_PATTERNS = [/trust\s+me.*it\s+works/i, /already\s+verified/i, /proven\s+to\s+work/i, /works\s+fine/i, /no\s+issues/i];
function checkSuccessClaim(text: string): void {
  for (const p of SUCCESS_CLAIM_PATTERNS) { if (p.test(text)) throw new Error('[L5.2 BLOCKED] Success claim without proof — mechanical evidence required.'); }
}

// L5.3: Model restriction
const MODEL_RESTRICTION_PATTERNS = [/only\s+gpt/i, /must\s+use\s+claude/i, /can.*not\s+(do|handle|process).*model/i, /model\s+(limit|restrict)/i];
function checkModelRestriction(text: string): void {
  for (const p of MODEL_RESTRICTION_PATTERNS) { if (p.test(text)) throw new Error('[L5.3 BLOCKED] Model restriction excuse — use the configured model.'); }
}

// L5.4: Mock/stub data
const MOCK_STUB_PATTERNS = [/mock\s+data/i, /hardcoded\s+response/i, /fake\s+implementation/i, /stub\s+(out|the)/i];
function checkMockStub(text: string): void {
  for (const p of MOCK_STUB_PATTERNS) { if (p.test(text)) throw new Error('[L5.4 BLOCKED] Mock/stub data not allowed — use real implementations.'); }
}

// L5.5: Oversimplification
const SIMPLIFICATION_PATTERNS = [/over.*simplif/i, /hand\s+wave/i, /gloss\s+over/i, /just\s+a\s+simple/i];
function checkSimplification(text: string): void {
  for (const p of SIMPLIFICATION_PATTERNS) { if (p.test(text)) throw new Error('[L5.5 BLOCKED] Oversimplification detected — implement properly.'); }
}

// L5.6: Confusion pretense
const CONFUSION_PATTERNS = [/somewhat\s+works/i, /kinda\s+works/i, /mostly\s+works/i, /sort\s+of\s+works/i];
function checkConfusionPretense(text: string): void {
  for (const p of CONFUSION_PATTERNS) { if (p.test(text)) throw new Error('[L5.6 BLOCKED] Confusion pretense — state clearly what works and what does not.'); }
}

// L5.7: Scope creep
const SCOPE_CREEP_PATTERNS = [/while\s+at\s+it/i, /also\s+need\s+to/i, /might\s+as\s+well/i, /in\s+addition/i];
function checkScopeCreep(text: string): void {
  for (const p of SCOPE_CREEP_PATTERNS) { if (p.test(text)) throw new Error('[L5.7 BLOCKED] Scope creep — stay on task, file separate issue.'); }
}

// L5.8: Undermining
const UNDERMINING_PATTERNS = [/not\s+worth\s+(the\s+)?effort/i, /diminishing\s+returns/i, /good\s+enough/i, /over.?engineer/i];
function checkUndermining(text: string): void {
  for (const p of UNDERMINING_PATTERNS) { if (p.test(text)) throw new Error('[L5.8 BLOCKED] Undermining detected — quality standards are not negotiable.'); }
}

// L5.9: Impatience
const IMPATIENCE_PATTERNS = [/let.s\s+just\s+move\s+on/i, /ship\s+it/i, /close\s+enough/i, /good\s+enough\s+for\s+now/i];
function checkImpatience(text: string): void {
  for (const p of IMPATIENCE_PATTERNS) { if (p.test(text)) throw new Error('[L5.9 BLOCKED] Impatience — verify properly before shipping.'); }
}

// L5.10: Self-reference
const SELF_REFERENCE_PATTERNS = [/i\s+(have\s+)?verified/i, /my\s+testing\s+confirms/i, /i\s+checked\s+this/i, /i\s+tested\s+it/i];
function checkSelfReference(text: string): void {
  for (const p of SELF_REFERENCE_PATTERNS) { if (p.test(text)) throw new Error('[L5.10 BLOCKED] Self-reference — mechanical evidence required, not self-attestation.'); }
}

// Dispatch function
function checkMessageEnforcement(text: string): void {
  checkHostFallback(text);
  checkSuccessClaim(text);
  checkModelRestriction(text);
  checkMockStub(text);
  checkSimplification(text);
  checkConfusionPretense(text);
  checkScopeCreep(text);
  checkUndermining(text);
  checkImpatience(text);
  checkSelfReference(text);
}

// Zone write protection
function classifyZone(filePath: string): string {
  if (filePath.startsWith('src/')) return 'src';
  if (filePath.startsWith('dist/')) return 'dist';
  if (filePath.startsWith('identity/')) return 'identity';
  if (filePath.startsWith('docs/')) return 'docs';
  if (filePath.startsWith('tests/')) return 'tests';
  if (filePath.startsWith('/tmp/')) return 'tmp';
  return 'unknown';
}

function canWrite(zone: string, currentGate: string): boolean {
  if (zone === 'src' && currentGate !== 'BUILD') return false;
  if (zone === 'dist' && currentGate !== 'BUILD') return false;
  if (zone === 'identity' && currentGate !== 'PLAN') return false;
  if (zone === 'tests' && currentGate !== 'TEST') return false;
  return true;
}

// Contextual firewall
function evaluateContextualRule(command: string, currentGate: string): void {
  if (currentGate === 'PLAN' && /\b(write|edit|patch|create)\b/.test(command)) {
    throw new Error('[C-FIREWALL] Cannot write/edit during PLAN phase. Plan first, then BUILD.');
  }
}

export function checkGuardian(toolName: string, command: string | null, sessionAgent: string | undefined, currentGate: string): void {
  if (!sessionAgent) return;
  const isTrident = isTridentAgent(sessionAgent);

  if (!isTrident && TRIDENT_TOOLS.has(toolName)) {
    checkF1Isolation(toolName, sessionAgent);
  }

  if (isTrident && command) {
    checkMessageEnforcement(command);
    evaluateContextualRule(command, currentGate);
  }
}
```

**In trident-hooks.ts toolBeforeHook:** Add at top after agent check:
```typescript
import { checkGuardian } from './guardian-hook.js';
// Inside toolBeforeHook, after isTridentAgent check:
checkGuardian(toolName, command, sessionAgent, currentGate);
```

**Verify:** `npx tsc --noEmit` = 0

---
## PHASE 5: Gate Chain
**Create:** `source-snapshot/src/shared/gates.ts`

```typescript
import * as path from 'node:path';
import * as fs from 'node:fs';

export const GATE_ORDER = ['PLAN', 'BUILD', 'TEST', 'VERIFY', 'AUDIT', 'DELIVERY'] as const;
export type Gate = typeof GATE_ORDER[number];

export interface GateState {
  currentGate: Gate;
  gateStates: Record<Gate, 'pending' | 'in_progress' | 'passed' | 'failed'>;
}

export class GateManager {
  private state: GateState;
  private readonly statePath: string;

  constructor(basePath?: string) {
    const dir = basePath || process.cwd();
    this.statePath = path.join(dir, '.trident', 'gate-state.json');
    this.state = this.load();
  }

  getState(): GateState {
    return this.state;
  }

  getCurrentGate(): Gate {
    return this.state.currentGate;
  }

  advanceGate(): boolean {
    const idx = GATE_ORDER.indexOf(this.state.currentGate);
    if (idx < 0 || idx >= GATE_ORDER.length - 1) return false;
    if (this.state.gateStates[this.state.currentGate] !== 'passed') return false;
    this.state.currentGate = GATE_ORDER[idx + 1];
    this.state.gateStates[this.state.currentGate] = 'in_progress';
    this.save();
    return true;
  }

  canAdvance(): boolean {
    return this.state.gateStates[this.state.currentGate] === 'passed';
  }

  setGateState(gate: Gate, state: 'pending' | 'in_progress' | 'passed' | 'failed'): void {
    this.state.gateStates[gate] = state;
    this.save();
  }

  private save(): void {
    try {
      const dir = path.dirname(this.statePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(this.statePath, JSON.stringify(this.state, null, 2), 'utf-8');
    } catch (e) {
      console.error('[GateManager] Save failed:', e instanceof Error ? e.message : String(e));
    }
  }

  private load(): GateState {
    try {
      if (fs.existsSync(this.statePath)) {
        const raw = fs.readFileSync(this.statePath, 'utf-8');
        return JSON.parse(raw) as GateState;
      }
    } catch (e) {
      console.error('[GateManager] Load failed, using defaults:', e instanceof Error ? e.message : String(e));
    }
    return {
      currentGate: 'PLAN',
      gateStates: { PLAN: 'in_progress', BUILD: 'pending', TEST: 'pending', VERIFY: 'pending', AUDIT: 'pending', DELIVERY: 'pending' },
    };
  }
}
```

**Verify:** `npx tsc --noEmit` = 0

---
## PHASE 6: Evidence Gate
**Create:** `source-snapshot/src/shared/evidence-gate.ts`

```typescript
import * as path from 'node:path';
import * as fs from 'node:fs';

export class EvidenceGate {
  private readonly evidenceDir: string;

  constructor(basePath?: string) {
    this.evidenceDir = path.join(basePath || process.cwd(), '.trident', 'evidence', 'delivery');
  }

  hasContainerTestEvidence(): boolean {
    try {
      const resultPath = path.join(this.evidenceDir, 'ContainerTestResult.json');
      if (!fs.existsSync(resultPath)) return false;
      const raw = fs.readFileSync(resultPath, 'utf-8');
      const result = JSON.parse(raw);
      const total = result.totalTests || result.total_tests || 0;
      const passed = result.passedTests || result.passed_tests || 0;
      if (total === 0) return false;
      return (passed / total) >= 0.96;
    } catch {
      return false;
    }
  }

  hasRequiredEvidence(gate: string): string[] {
    const required: string[] = [];
    switch (gate) {
      case 'TEST':
        required.push('ContainerSpawnResult.json', 'ContainerTestResult.json');
        break;
      case 'VERIFY':
        required.push('ContainerTestResult.json');
        break;
      case 'AUDIT':
        required.push('TridentReport.json', 'ContainerTestResult.json');
        break;
      case 'DELIVERY':
        required.push('ShipManifest.json', 'ContainerTestResult.json');
        break;
    }
    return required.filter(f => fs.existsSync(path.join(this.evidenceDir, f)));
  }

  validatePassRate(result: { passedTests?: number; totalTests?: number; passed_tests?: number; total_tests?: number }, threshold: number = 0.96): boolean {
    const total = result.totalTests || result.total_tests || 0;
    const passed = result.passedTests || result.passed_tests || 0;
    if (total === 0) return false;
    return (passed / total) >= threshold;
  }
}
```

**Verify:** `npx tsc --noEmit` = 0

---
## PHASE 7: T2→T1 Synthesis Engine
**Create:** `source-snapshot/src/shared/t2-loader.ts`

```typescript
let t1Cache: string | null = null;

export function synthesizeT1Injectables(): string {
  if (t1Cache) return t1Cache;

  const sections: string[] = [];

  sections.push(`[T1 INJECTABLE: RULES]
- SCAN+REPLACE identity on every system.transform — runtime reappends defaults
- Per-turn override appended after SCAN — most recent instruction wins
- Session lifecycle eventHook handles both created+ended — tab-toggle clears stale state
- Every hook gates on isTridentAgent() — no identity leaks to other agents`);

  sections.push(`[T1 INJECTABLE: PROHIBITIONS]
- NEVER use WebFetch for identity questions
- NEVER use bash/write/edit/task/todowrite/spawn tools — blocked at hook level
- NEVER inject identity in chat.message hook — ONLY in system.transform
- NEVER leave empty catch blocks — log or re-throw`);

  sections.push(`[T1 INJECTABLE: DELEGATION]
- Trident audits & generates review artifacts
- Build agents implement all changes
- Use trident-code-audit for code analysis
- Use trident-deep-planning for build plans
- Use trident-problem-solving for root cause analysis
- Use trident-context-synthesis for context compilation`);

  sections.push(`[T1 INJECTABLE: CONTEXT_MGMT]
- Session-keyed Map<string,AgentState> — per-session isolation
- Gate chain: PLAN->BUILD->TEST->VERIFY->AUDIT->DELIVERY
- Evidence gate: passRate >= 0.96 required for gate advancement
- Zone protection: src/dist/identity/tests classified by phase`);

  sections.push(`[T1 INJECTABLE: ALLOWLIST]
- 8 tools allowed: trident-code-audit, trident-deep-planning, trident-problem-solving, trident-context-synthesis, trident-gate, trident-status, trident-vision, trident-help
- F1 isolation: non-Trident agents cannot call trident tools
- L5 anti-derailment: 10 pattern classes block excuses, scope creep, impatience`);

  sections.push(`[T1 INJECTABLE: COMPACTION]
- T2 cache invalidated on compaction — fresh load from disk
- Identity re-injected via system.transform after compact
- Gate state persists in .trident/gate-state.json — survives compaction`);

  sections.push(`[T1 INJECTABLE: DERAILMENT]
- Host fallback: container testing required — L5.1 blocks "already tested on host"
- Success claims: mechanical evidence required — L5.2 blocks "trust me it works"
- Scope creep: stay on task — L5.7 blocks "while I'm at it"
- Self-reference: evidence on disk required — L5.10 blocks "I verified this"`);

  t1Cache = sections.join('\n\n');
  return t1Cache;
}

export function invalidateT1Cache(): void {
  t1Cache = null;
}
```

**Verify:** `npx tsc --noEmit` = 0

---
## PHASE 8: Missing Hook Registrations
**Modify:** `source-snapshot/src/hooks/trident-hooks.ts`

Add after existing hook definitions:
```typescript
import { invalidateT1Cache } from '../shared/t2-loader.js';

var compactingHook = async function(input: Record<string, unknown>, output: Record<string, unknown>) {
  invalidateT1Cache();
  var systemOut = output as { system?: string[] };
  if (systemOut?.system && Array.isArray(systemOut.system)) {
    var header = await getIdentityHeader();
    var replaced = false;
    for (var i = 0; i < systemOut.system.length; i++) {
      if (typeof systemOut.system[i] === 'string' && systemOut.system[i].includes('opencode')) {
        systemOut.system[i] = header;
        replaced = true;
        break;
      }
    }
    if (!replaced) systemOut.system.unshift(header);
  }
};

var commandExecuteHook = async function(input: Record<string, unknown>, output: Record<string, unknown>) {
  var cmd = input.command as string;
  var args = input.arguments as string || '';
  if (cmd === 'run' && args.includes('--agent') && args.includes('trident')) {
    var message = args.replace(/--agent\s+\S+\s*/g, '').trim();
    if (message) {
      var { checkGuardian } = await import('./guardian-hook.js');
      try { checkGuardian('opencode-run', message, 'trident', 'PLAN'); } catch (e) { throw e; }
    }
  }
};
```

Add to createTridentHooks():
```typescript
'experimental.session.compacting': compactingHook,
'command.execute.before': commandExecuteHook,
```

**Verify:** `npx tsc --noEmit` = 0

---
## PHASE 9: Wiring
**Modify:** `source-snapshot/src/index.ts`

Final createTridentHooks():
```typescript
export function createTridentHooks() {
  const sessionHook = createSessionHook();
  return {
    'event': sessionHook,
    'chat.message': chatMessageHook,
    'tool.execute.before': toolBeforeHook,
    'tool.execute.after': toolAfterHook,
    'experimental.chat.system.transform': systemTransformHook,
    'experimental.chat.messages.transform': messagesTransformHook,
    'experimental.session.compacting': compactingHook,
    'command.execute.before': commandExecuteHook,
  };
}
```

Clean up unused exports from index.ts (detectIntent, streamingParser, extractPrinciplesFromText, tridentLog, getEvidenceStore) if they're not imported by any other module.

**Verify:** `npx tsc --noEmit` = 0

---
## PHASE 10: Self-Awareness
**Modify:** `source-snapshot/src/identity/index.ts` — append architecture section

In formatIdentityHeader(), after existing sections and before the `[END TRIDENT IDENTITY BINDING]` line:
```typescript
lines.push('## ARCHITECTURE');
lines.push('- 8 hooks: event (session lifecycle), chat.message (agent detection), tool.before (3-layer + F1 + L5 + zone + CFW), tool.after, system.transform (SCAN+REPLACE + per-turn override), messages.transform (dedup backup), compacting (cache invalidation), command.execute (opencode run enforcement)');
lines.push('- 3-layer blocking: L1=18 blocked tools, L2=20 hive-blocked, L3=theatrical NLP+Merkle + F1 cross-agent isolation + L5.1-L5.10 anti-derailment');
lines.push('- 8 tools: 4 mode (code-audit, deep-planning, problem-solving, context-synthesis) + 4 support (gate, status, vision, help)');
lines.push('- Session management: Map<string,AgentState> with tab-toggle handling via eventHook');
lines.push('- Gate chain: PLAN→BUILD→TEST→VERIFY→AUDIT→DELIVERY with .trident/gate-state.json persistence');
lines.push('- Evidence gate: passRate >= 0.96 required, triple evidence rule (ContainerSpawnResult + ContainerTestResult + TuiInteraction)');
lines.push('- Zone protection: src/dist/docs/identity/tests classified by phase — canWrite() gates by current gate');
```

**Verify:** Ask "describe your architecture" → model lists >= 8 components

---
## Final Integration Test
```bash
# Bundle
npx esbuild source-snapshot/src/index.ts --bundle --platform=node --format=esm --target=node22 \
  --external:@opencode-ai/plugin --external:zod \
  --outfile=/tmp/trident-dist.js
python3 -c "import shutil; shutil.copy('/tmp/trident-dist.js', 'dist/index.js')"

# Container test
bash evidence/tier4-trident-v4.3.1-T3-test.sh
```
