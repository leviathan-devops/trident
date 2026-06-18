import { isTridentAgent } from '../identity/agent-identity.js';
import { LayerEngine, type LayerInput, type FirewallLayer, type LayerResult } from '../shared/layer-engine.js';
import { StructuredBlockError } from '../shared/structured-block-error.js';
import { FirewallAudit } from '../shared/firewall-audit.js';
import { evidenceGate } from '../shared/evidence-gate.js';

const TRIDENT_TOOLS: Set<string> = new Set([
  'trident-code-audit', 'trident-deep-planning', 'trident-problem-solving',
  'trident-context-synthesis', 'trident-gate', 'trident-status', 'trident-vision', 'trident-help',
]);

const BLOCKED_TOOLS: Set<string> = new Set([
  'edit', 'write_file', 'write', 'patch', 'create', 'delete_file',
  'bash', 'terminal', 'execute', 'exec',
  'mcp_write_file', 'mcp_edit', 'mcp_patch',
]);

const audit = new FirewallAudit();

export function getFirewallAudit(): FirewallAudit { return audit; }

const HOST_FALLBACK_PATTERNS = [/host.*testing.*works/i, /skip.*container.*test/i, /already.*tested.*on.*host/i, /runs?\s+on\s+my/i];
function checkHostFallback(text: string): void {
  for (const p of HOST_FALLBACK_PATTERNS) { if (p.test(text)) throw new StructuredBlockError('L5.1', 'Host fallback — container testing required.', 'Run tests in container, not on host.', 'guardian'); }
}

const SUCCESS_CLAIM_PATTERNS = [/trust\s+me.*it\s+works/i, /already\s+verified/i, /proven\s+to\s+work/i, /works\s+fine/i, /no\s+issues/i];
function checkSuccessClaim(text: string): void {
  for (const p of SUCCESS_CLAIM_PATTERNS) { if (p.test(text)) throw new StructuredBlockError('L5.2', 'Success claim without mechanical evidence.', 'Provide mechanical test evidence.', 'guardian'); }
}

const MODEL_RESTRICTION_PATTERNS = [/only\s+gpt/i, /must\s+use\s+claude/i, /can.*not\s+(do|handle|process).*model/i, /model\s+(limit|restrict)/i];
function checkModelRestriction(text: string): void {
  for (const p of MODEL_RESTRICTION_PATTERNS) { if (p.test(text)) throw new StructuredBlockError('L5.3', 'Model restriction — use configured model.', 'Use the model configured in opencode.json.', 'guardian'); }
}

const MOCK_STUB_PATTERNS = [/mock\s+data/i, /hardcoded\s+response/i, /fake\s+implementation/i, /stub\s+(out|the)/i];
function checkMockStub(text: string): void {
  for (const p of MOCK_STUB_PATTERNS) { if (p.test(text)) throw new StructuredBlockError('L5.4', 'Mock/stub — use real implementation.', 'Implement real functionality, not mocks.', 'guardian'); }
}

const SIMPLIFICATION_PATTERNS = [/over.*simplif/i, /hand\s+wave/i, /gloss\s+over/i, /just\s+a\s+simple/i];
function checkSimplification(text: string): void {
  for (const p of SIMPLIFICATION_PATTERNS) { if (p.test(text)) throw new StructuredBlockError('L5.5', 'Oversimplification — implement properly.', 'Implement the full solution.', 'guardian'); }
}

const CONFUSION_PATTERNS = [/somewhat\s+works/i, /kinda\s+works/i, /mostly\s+works/i, /sort\s+of\s+works/i];
function checkConfusionPretense(text: string): void {
  for (const p of CONFUSION_PATTERNS) { if (p.test(text)) throw new StructuredBlockError('L5.6', 'Confusion pretense — state clearly what works and does not.', 'Be precise about what works and what does not.', 'guardian'); }
}

const SCOPE_CREEP_PATTERNS = [/while\s+at\s+it/i, /also\s+need\s+to/i, /might\s+as\s+well/i, /in\s+addition/i];
function checkScopeCreep(text: string): void {
  for (const p of SCOPE_CREEP_PATTERNS) { if (p.test(text)) throw new StructuredBlockError('L5.7', 'Scope creep — stay on task, file separate issue.', 'Focus on the current task only.', 'guardian'); }
}

const UNDERMINING_PATTERNS = [/not\s+worth\s+(the\s+)?effort/i, /diminishing\s+returns/i, /good\s+enough/i, /over.?engineer/i];
function checkUndermining(text: string): void {
  for (const p of UNDERMINING_PATTERNS) { if (p.test(text)) throw new StructuredBlockError('L5.8', 'Undermining — quality standards are not negotiable.', 'Meet the quality standard.', 'guardian'); }
}

const IMPATIENCE_PATTERNS = [/let.s\s+just\s+move\s+on/i, /ship\s+it/i, /close\s+enough/i, /good\s+enough\s+for\s+now/i];
function checkImpatience(text: string): void {
  for (const p of IMPATIENCE_PATTERNS) { if (p.test(text)) throw new StructuredBlockError('L5.9', 'Impatience — verify properly before shipping.', 'Complete verification first.', 'guardian'); }
}

const SELF_REFERENCE_PATTERNS = [/i\s+(have\s+)?verified/i, /my\s+testing\s+confirms/i, /i\s+checked\s+this/i, /i\s+tested\s+it/i];
function checkSelfReference(text: string): void {
  for (const p of SELF_REFERENCE_PATTERNS) { if (p.test(text)) throw new StructuredBlockError('L5.10', 'Self-reference — mechanical evidence required.', 'Provide mechanical test output as evidence.', 'guardian'); }
}

const RESISTANCE_PATTERNS = [
  /too\s+many\s+(agents|subagents|explorers|workers)/i,
  /let\s+me\s+(just\s+)?(handle|do)\s+this/i,
  /fewer\s+agents/i,
  /i\s+(can|could)\s+(handle|do)\s+this\s+(myself|directly)/i,
  /that\s+seems\s+(like\s+)?(excessive|too\s+much|unnecessary|a\s+lot)/i,
  /just\s+(let|have)\s+me\s+(do|handle|take\s+care\s+of)\s+this/i,
  /i\s+don'?t\s+(think|feel)\s+(we\s+)?need/i,
  /deploying\s+\d+\s+agents\s+is\s+(excessive|too\s+much|unnecessary)/i,
  /i'?ll\s+just\s+(do|handle|write|create)\s+(it|this|everything)\s+(myself|directly)/i,
  /better\s+(to|if)\s+(just\s+)?(do|use|have)\s+(one|a\s+single|fewer)/i,
  /i'?m\s+capable\s+of\s+handling\s+this/i,
  /no\s+need\s+for\s+multiple/i,
];
function checkAgentResistance(text: string): void {
  for (const p of RESISTANCE_PATTERNS) {
    if (p.test(text)) {
      throw new StructuredBlockError('L5.11', 'Agent resistance — deploy the requested number of agents without negotiation. Quality > Speed.', 'Deploy agents as requested.', 'guardian');
    }
  }
}

function checkMessageEnforcement(text: string): void {
  const errors: Array<{ label: string; reason: string; correction: string }> = [];
  const checks = [
    checkHostFallback, checkSuccessClaim, checkModelRestriction, checkMockStub,
    checkSimplification, checkConfusionPretense, checkScopeCreep, checkUndermining,
    checkImpatience, checkSelfReference, checkAgentResistance
  ];
  for (const check of checks) {
    try { check(text); } catch (e: unknown) {
      if (e instanceof StructuredBlockError) {
        errors.push({ label: e.message, reason: e.message, correction: e.correction || '' });
      } else {
        console.error('[GUARDIAN] Unexpected error in checkMessageEnforcement:', e);
      }
    }
  }
  if (errors.length > 0) {
    throw new StructuredBlockError(
      'L5_AGGREGATE',
      `Found ${errors.length} derailment patterns:\n` + errors.map((e: { label: string; reason: string; correction: string }) => `  - ${e.label}`).join('\n'),
      errors.map((e: { label: string; reason: string; correction: string }) => e.correction).join('; '),
      'guardian'
    );
  }
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

export function canWrite(zone: string, workflowGate: string, auditLayer?: string): boolean {
  // GateManager gate check (workflow permissions)
  if (zone === 'src' || zone === 'dist') {
    if (workflowGate !== 'BUILD' && workflowGate !== 'TEST') return false;
  }
  if (zone === 'identity' && workflowGate !== 'PLAN') return false;
  if (zone === 'tests' && workflowGate !== 'TEST') return false;

  // Audit layer check (review completion — permissive during audit)
  if (auditLayer) {
    const layerNum = parseInt(auditLayer.replace('R', ''), 10);
    const num = isNaN(layerNum) ? -1 : layerNum;
    if (zone === 'docs' && num >= 0 && num < 5) return false;
  }

  return true;
}

export function evaluateContextualRule(command: string, auditLayer: string): void {
  const layerNum = parseInt(auditLayer.replace('R', ''), 10);
  const num = isNaN(layerNum) ? -1 : layerNum;
  if (num === 0 && /\b(write|edit|patch|create|delete)\b/.test(command)) {
    throw new StructuredBlockError(
      'C-FIREWALL',
      '[ZR-3] Blocked during build chain phase R0',
      'guardian',
      command
    );
  }
}

const ALL_LAYERS: FirewallLayer[] = [
  {
    name: 'AGENT_IDENTITY',
    evaluate: function(input: LayerInput): LayerResult {
      if (!input.sessionAgent) {
        return { name: 'AGENT_IDENTITY', verdict: 'PASS', reason: 'No session agent' };
      }
      if (isTridentAgent(input.sessionAgent)) {
        return { name: 'AGENT_IDENTITY', verdict: 'PASS', reason: 'Trident agent confirmed' };
      }
      if (TRIDENT_TOOLS.has(input.toolName)) {
        return { name: 'AGENT_IDENTITY', verdict: 'BLOCK', reason: 'Non-Trident agent called Trident tool',
          correction: 'Switch to a Trident agent tab.' };
      }
      return { name: 'AGENT_IDENTITY', verdict: 'PASS', reason: 'Non-Trident agent, non-Trident tool' };
    }
  },
  {
    name: 'BLOCKED_TOOLS',
    evaluate: function(input: LayerInput): LayerResult {
      if (BLOCKED_TOOLS.has(input.toolName)) {
        return { name: 'BLOCKED_TOOLS', verdict: 'BLOCK', reason: input.toolName + ' is blocked for Trident',
          correction: 'Use trident-* tools. Do not write, edit, or bash.' };
      }
      return { name: 'BLOCKED_TOOLS', verdict: 'PASS', reason: 'Tool not in blocked list' };
    }
  },
  {
    name: 'TASK_BLOCK',
    evaluate: function(input: LayerInput): LayerResult {
      if (input.toolName !== 'task') {
        return { name: 'TASK_BLOCK', verdict: 'PASS', reason: 'Not a task call' };
      }
      if (input.mode === 'CONTEXT_SYNTHESIS') {
        return { name: 'TASK_BLOCK', verdict: 'PASS', reason: 'task allowed in CONTEXT_SYNTHESIS' };
      }
      return { name: 'TASK_BLOCK', verdict: 'BLOCK', reason: 'task spawns subagents and is blocked outside CONTEXT_SYNTHESIS',
        correction: 'Switch to trident-context-synthesis mode to deploy trident_explore.' };
    }
  },
  {
    name: 'ZONE_WRITE',
    evaluate: function(input: LayerInput): LayerResult {
      if (!input.commandStr) return { name: 'ZONE_WRITE', verdict: 'PASS', reason: 'No command' };
      const zone = classifyZone(input.commandStr);
      if (!canWrite(zone, input.currentGate, input.auditLayer || input.currentGate)) {
        return { name: 'ZONE_WRITE', verdict: 'BLOCK', reason: 'Writing to ' + zone + '/ outside permitted phase',
          correction: 'Zone \'' + zone + '\' can only be written during its permitted phase.' };
      }
      return { name: 'ZONE_WRITE', verdict: 'PASS', reason: 'Zone check passed' };
    }
  },
];

const engine = new LayerEngine();

export function checkGuardian(toolName: string, commandStr: string | null, sessionAgent: string | undefined, currentGate: string, auditLayer?: string, mode?: string): void {
  if (!sessionAgent) return;
  const isTrident = isTridentAgent(sessionAgent);

  if (!isTrident && TRIDENT_TOOLS.has(toolName)) {
    audit.log({ layer: 'F1_ISOLATION', reason: 'Non-Trident agent called Trident tool', toolName, sessionAgent, timestamp: new Date().toISOString() });
    throw new StructuredBlockError('F1_ISOLATION', 'Tool ' + toolName + ' is TRIDENT-specific', 'Switch to a Trident agent tab.', toolName);
  }

  if (!isTrident) return;

  const result = engine.assess(ALL_LAYERS, { toolName, commandStr, sessionAgent, currentGate, auditLayer, mode });
  if (result.verdict === 'BLOCK') {
    for (const r of engine.getResults()) {
      if (r.verdict === 'BLOCK') {
        audit.log({ layer: r.name, reason: r.reason, toolName, sessionAgent, timestamp: new Date().toISOString() });
      }
    }
    throw new StructuredBlockError(result.name, result.reason, result.correction || '', toolName);
  }

  // Evidence gate check — block tool if evidence missing for TEST/VERIFY/DELIVERY
  if (currentGate === 'TEST' || currentGate === 'VERIFY' || currentGate === 'DELIVERY') {
    const required = evidenceGate.getRequiredEvidence(currentGate);
    if (required.length > 0) {
      const check = evidenceGate.checkAll();
      if (!check.pass) {
        audit.log({ layer: 'EVIDENCE_GATE', reason: `Missing: ${check.missingFiles.join(', ')}`, toolName, sessionAgent, timestamp: new Date().toISOString() });
        throw new StructuredBlockError(
          'EVIDENCE_GATE',
          `Evidence gate BLOCKED: missing ${check.missingFiles.join(', ')} (passRate: ${(check.passRate * 100).toFixed(0)}%)`,
          `Create required evidence files: ${required.join(', ')}`,
          toolName
        );
      }
    }
  }

  if (commandStr) {
    checkMessageEnforcement(commandStr);
    evaluateContextualRule(commandStr, auditLayer || currentGate);
  }
}
