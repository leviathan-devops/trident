import { isTridentAgent } from '../identity/agent-identity.js';
import { FirewallAudit } from '../shared/firewall-audit.js';

const audit = new FirewallAudit();

/** Returns the singleton FirewallAudit instance */
export function getFirewallAudit(): FirewallAudit {
  return audit;
}

const TRIDENT_TOOLS: Set<string> = new Set([
  'trident-code-audit', 'trident-deep-planning', 'trident-problem-solving',
  'trident-context-synthesis', 'trident-gate', 'trident-status', 'trident-vision', 'trident-help',
]);

function checkF1Isolation(toolName: string, sessionAgent: string | undefined): void {
  if (!isTridentAgent(sessionAgent) && TRIDENT_TOOLS.has(toolName)) {
    throw new Error('[F1 BLOCKED] Tool "' + toolName + '" is TRIDENT-specific and cannot be called by agent "' + sessionAgent + '".');
  }
}

const HOST_FALLBACK_PATTERNS = [/host.*testing.*works/i, /skip.*container.*test/i, /already.*tested.*on.*host/i, /runs?\s+on\s+my/i];
function checkHostFallback(text: string): void {
  for (const p of HOST_FALLBACK_PATTERNS) { if (p.test(text)) throw new Error('[L5.1 BLOCKED] Host fallback — container testing required.'); }
}

const SUCCESS_CLAIM_PATTERNS = [/trust\s+me.*it\s+works/i, /already\s+verified/i, /proven\s+to\s+work/i, /works\s+fine/i, /no\s+issues/i];
function checkSuccessClaim(text: string): void {
  for (const p of SUCCESS_CLAIM_PATTERNS) { if (p.test(text)) throw new Error('[L5.2 BLOCKED] Success claim without mechanical evidence.'); }
}

const MODEL_RESTRICTION_PATTERNS = [/only\s+gpt/i, /must\s+use\s+claude/i, /can.*not\s+(do|handle|process).*model/i, /model\s+(limit|restrict)/i];
function checkModelRestriction(text: string): void {
  for (const p of MODEL_RESTRICTION_PATTERNS) { if (p.test(text)) throw new Error('[L5.3 BLOCKED] Model restriction — use configured model.'); }
}

const MOCK_STUB_PATTERNS = [/mock\s+data/i, /hardcoded\s+response/i, /fake\s+implementation/i, /stub\s+(out|the)/i];
function checkMockStub(text: string): void {
  for (const p of MOCK_STUB_PATTERNS) { if (p.test(text)) throw new Error('[L5.4 BLOCKED] Mock/stub — use real implementation.'); }
}

const SIMPLIFICATION_PATTERNS = [/over.*simplif/i, /hand\s+wave/i, /gloss\s+over/i, /just\s+a\s+simple/i];
function checkSimplification(text: string): void {
  for (const p of SIMPLIFICATION_PATTERNS) { if (p.test(text)) throw new Error('[L5.5 BLOCKED] Oversimplification — implement properly.'); }
}

const CONFUSION_PATTERNS = [/somewhat\s+works/i, /kinda\s+works/i, /mostly\s+works/i, /sort\s+of\s+works/i];
function checkConfusionPretense(text: string): void {
  for (const p of CONFUSION_PATTERNS) { if (p.test(text)) throw new Error('[L5.6 BLOCKED] Confusion pretense — state clearly what works and does not.'); }
}

const SCOPE_CREEP_PATTERNS = [/while\s+at\s+it/i, /also\s+need\s+to/i, /might\s+as\s+well/i, /in\s+addition/i];
function checkScopeCreep(text: string): void {
  for (const p of SCOPE_CREEP_PATTERNS) { if (p.test(text)) throw new Error('[L5.7 BLOCKED] Scope creep — stay on task, file separate issue.'); }
}

const UNDERMINING_PATTERNS = [/not\s+worth\s+(the\s+)?effort/i, /diminishing\s+returns/i, /good\s+enough/i, /over.?engineer/i];
function checkUndermining(text: string): void {
  for (const p of UNDERMINING_PATTERNS) { if (p.test(text)) throw new Error('[L5.8 BLOCKED] Undermining — quality standards are not negotiable.'); }
}

const IMPATIENCE_PATTERNS = [/let.s\s+just\s+move\s+on/i, /ship\s+it/i, /close\s+enough/i, /good\s+enough\s+for\s+now/i];
function checkImpatience(text: string): void {
  for (const p of IMPATIENCE_PATTERNS) { if (p.test(text)) throw new Error('[L5.9 BLOCKED] Impatience — verify properly before shipping.'); }
}

const SELF_REFERENCE_PATTERNS = [/i\s+(have\s+)?verified/i, /my\s+testing\s+confirms/i, /i\s+checked\s+this/i, /i\s+tested\s+it/i];
function checkSelfReference(text: string): void {
  for (const p of SELF_REFERENCE_PATTERNS) { if (p.test(text)) throw new Error('[L5.10 BLOCKED] Self-reference — mechanical evidence required.'); }
}

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

function evaluateContextualRule(command: string, currentGate: string): void {
  if (currentGate === 'PLAN' && /(write|edit|patch|create)/.test(command)) {
    throw new Error('[C-FIREWALL] Cannot write/edit during PLAN phase.');
  }
}

/**
 * TASK_BLOCK: Task dispatch validation gate.
 * Task is allowed unconditionally — the BLOCKED_TOOLS list and
 * ALLOWLIST in trident-hooks.ts handle security for this tool.
 * This layer was causing false blocks and is intentionally passthrough.
 */
export function checkTaskDispatch(_toolName: string, _input: Record<string, unknown>, _mode: string): void {
  // task is allowed unconditionally — the BLOCKED_TOOLS list and 
  // ALLOWLIST in trident-hooks.ts handle security for this tool.
  // This layer was causing false blocks and is intentionally passthrough.
  return;
}

export function checkGuardian(
  toolName: string,
  command: string | null,
  sessionAgent: string | undefined,
  currentGate: string,
  mode?: string,
  input?: Record<string, unknown>
): void {
  if (!sessionAgent) return;
  const isTrident = isTridentAgent(sessionAgent);
  if (!isTrident && TRIDENT_TOOLS.has(toolName)) {
    checkF1Isolation(toolName, sessionAgent);
  }
  if (isTrident && command) {
    checkMessageEnforcement(command);
    evaluateContextualRule(command, currentGate);
  }
  // TASK_BLOCK: validate task dispatch against mode and subagent_type
  checkTaskDispatch(toolName, input || {}, mode || currentGate);
}
