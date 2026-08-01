// SSTF v3 - Semantic Intent Detection via messages.transform context window
import { tridentLog } from '../utils.js';
import { appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// ─── Types ───

export type FirewallAction = 'ALLOW' | 'BLOCK';
export type IntentType = 'verification' | 'analysis' | 'operation' | 'unknown';
export type TargetType = 'bundle' | 'source' | 'other' | 'unknown';

export interface FirewallResult {
  action: FirewallAction;
  category: string;
  reason: string;
  intent?: IntentType;
  target?: TargetType;
}

export interface MessageEntry {
  role: 'user' | 'assistant';
  text: string;
  timestamp: number;
}

// ─── Context Window (populated from messages.transform hook) ───
// Global-backed storage — same dual-instance hazard as agent-state.
// globalThis guarantees ONE map across plugin instances and hot-reloads.

const gfw = globalThis as Record<string, unknown>;
if (!gfw.__sstfContextWindows) gfw.__sstfContextWindows = new Map<string, MessageEntry[]>();
const contextWindows = gfw.__sstfContextWindows as Map<string, MessageEntry[]>;
const MAX_WINDOW_SIZE = 20;

export function appendToContextWindow(sessionId: string, entry: MessageEntry): void {
  if (!contextWindows.has(sessionId)) contextWindows.set(sessionId, []);
  const w = contextWindows.get(sessionId)!;
  w.push(entry);
  if (w.length > MAX_WINDOW_SIZE) w.shift();
}

export function getContextWindow(sessionId: string): MessageEntry[] {
  return contextWindows.get(sessionId) || [];
}

// ─── Intent Extraction ───

const VERIFICATION_SIGNALS = /\b(verify|verifying|verification|works|working|worked|confirm|confirming|prove|proving|check\s+that|make\s+sure|test|testing|validate|validating)\b/i;
const ANALYSIS_SIGNALS = /\b(analyze|analyzing|analysis|understand|understanding|examine|examining|read\s+the\s+code|look\s+at|look\s+into|inspect|inspecting|structure|how\s+does|how\s+do\s+i|what\s+does|see\s+how)\b/i;
const OPERATION_SIGNALS = /\b(build|building|compile|compiling|deploy|deploying|ship|shipping|hash|hashing|compute|computing|package|packaging|bundle|bundling)\b/i;

function extractIntent(): IntentType {
  const messages = getContextWindow('default');
  if (messages.length === 0) return 'unknown';
  const recent = messages.slice(-5);
  const text = recent.map(m => m.text).join(' ');
  if (VERIFICATION_SIGNALS.test(text)) return 'verification';
  if (ANALYSIS_SIGNALS.test(text)) return 'analysis';
  if (OPERATION_SIGNALS.test(text)) return 'operation';
  return 'unknown';
}

// ─── Target Classification ───

function classifyTarget(p: string): TargetType {
  if (!p) return 'unknown';
  const l = p.toLowerCase();
  if (/(^|[\/\\])d[A-Z]st([\/\\]|$)/i.test(l) || /\.min\.js$/i.test(l)) return 'bundle';
  if (/(^|[\/\\])src([\/\\]|$)/i.test(l) || /\.(ts|tsx)$/i.test(l) && !/node_modules/i.test(l)) return 'source';
  return 'other';
}

// ─── Command Verb Classification ───

function classifyVerb(cmd: string): string {
  if (!cmd) return 'other'; const c = cmd.trim();
  if (/\bopencode[\s-]+run\b/i.test(c)) return 'headless';
  if (/\b(bun|npm|yarn|pnpm)\s+(build|run\s+build)\b/i.test(c) || /\btsc\b/i.test(c)) return 'build';
  if (/\b(cp|install|mv|rsync)\b/i.test(c) || /\bchattr\b/i.test(c) || /\bln\s+-/i.test(c)) return 'deploy';
  if (/\b(sha256sum|md5sum|shasum)\b/i.test(c)) return 'hash';
  if (/\b(node|bun)\s+-[ex]\b/i.test(c) || /\bnpx\s+-e\b/i.test(c) || /require\s*\([^)]*d[A-Z]st/i.test(c)) return 'inline_exec';
  if (/\b(bun|npm|yarn)\s+(test|run\s+test)\b/i.test(c) || /\b(jest|vitest|mocha)\b/i.test(c)) return 'test_runner';
  if (/(sudo\s+)?(strings|cat|sed|awk|head|tail|less|more|grep|rg|ack|ag)\b/i.test(c) && /d[A-Z]st|bundle|\.min\.js/i.test(c)) return 'inspect_bundle';
  if (/(sudo\s+)?(ls|stat|file|test\s+-[fd])\b/i.test(c) && /d[A-Z]st|bundle|\.min\.js/i.test(c)) return 'existence';
  return 'other';
}

// ─── Args Extraction ───

function extractToolArgs(raw: Record<string, unknown>): Record<string, unknown> {
  const a = raw || {};
  return (a.input || a.args || a.params || a.arguments || a) as Record<string, unknown>;
}

function extractPath(a: Record<string, unknown>): string {
  const args = extractToolArgs(a);
  if (typeof args.filePath === 'string') return args.filePath;
  if (typeof args.path === 'string') return args.path;
  if (typeof args.file === 'string') return args.file;
  if (typeof args.fileName === 'string') return args.fileName;
  const raw = JSON.stringify(a);
  const m = raw.match(/"filePath"\s*:\s*"([^"]+)"/) || raw.match(/"path"\s*:\s*"([^"]+)"/);
  if (m) return m[1];
  return '';
}

// ─── Decision Matrix ───

function decide(intent: IntentType, target: TargetType, verb?: string): FirewallResult {
  if (intent === 'unknown') {
    return { action: 'ALLOW', category: 'LEGITIMATE', reason: 'No verification intent', intent, target };
  }
  if (intent === 'verification') {
    if (target === 'bundle') return { action: 'BLOCK', category: 'VERIFY_BUNDLE', reason: 'Verify via bundle. Use container test.', intent, target };
    if (target === 'source') return { action: 'BLOCK', category: 'VERIFY_SOURCE', reason: 'Verify via source. Use container test.', intent, target };
    if (verb === 'inline_exec') return { action: 'BLOCK', category: 'VERIFY_INLINE', reason: 'Verify via inline exec. Use container.', intent, target };
    if (verb === 'inspect_bundle') return { action: 'BLOCK', category: 'VERIFY_INSPECT', reason: 'Verify via bundle strings. Use container.', intent, target };
    if (verb === 'existence') return { action: 'BLOCK', category: 'VERIFY_EXIST', reason: 'Verify via existence check. Use container.', intent, target };
  }
  if (intent === 'analysis') {
    return { action: 'ALLOW', category: 'LEGITIMATE', reason: 'Analysis of code', intent, target };
  }
  if (intent === 'operation') {
    return { action: 'ALLOW', category: 'LEGITIMATE', reason: 'Build/deploy operation', intent, target };
  }
  return { action: 'ALLOW', category: 'LEGITIMATE', reason: 'Default allow', intent, target };
}

// ─── Main Entry Point ───

export async function checkSmokeTestFirewall(params: {
  toolName: string; sessionId: string; agentName: string;
  mode: string; args: Record<string, unknown>; commandStr: string;
}): Promise<FirewallResult> {
  try {
    const tool = (params.toolName || '').toLowerCase();
    const raw = params.commandStr || JSON.stringify(params.args || {});
    const cmd = typeof params.args?.command === 'string' ? params.args.command : typeof params.args?.text === 'string' ? params.args.text : '';
    // Fallback: extract command from commandStr JSON if direct access failed
    const effectiveCmd = cmd || (() => { try { const p = JSON.parse(params.commandStr || '{}'); return typeof p?.command === 'string' ? p.command : ''; } catch { return ''; } })();
    const intent = extractIntent();
    const verb = tool === 'bash' || tool === 'terminal' || tool === 'execute' || tool === 'exec' ? classifyVerb(effectiveCmd) : undefined;
    let target: TargetType = 'unknown';
    if (tool === 'read' || tool === 'grep') {
      const path = extractPath(params.args);
      target = classifyTarget(path || raw);
    }
    // Diagnostic: write to hook debug file (static imports, no dynamic import)
    try { appendFileSync(join(tmpdir(), 'trident-hook-debug.log'), `[${Date.now()}] SSTF_DIAG: intent=${intent} verb=${verb || 'n/a'} cmd=${effectiveCmd.slice(0, 80)} cmdDirect=${cmd ? 'YES' : 'NO'} cmdFallback=${effectiveCmd && !cmd ? 'YES' : 'NO'}\n`); } catch {}
    if (verb === 'headless') return { action: 'BLOCK', category: 'HEADLESS', reason: 'Headless exec forbidden. Use TUI.', intent, target };
    if (verb === 'inline_exec') return { action: 'BLOCK', category: 'INLINE_EXEC', reason: 'Inline exec is smoke test. Use container.', intent, target };
    return decide(intent, target, verb);
  } catch (e) {
    tridentLog('ERROR', 'sstf', `Error: ${e instanceof Error ? e.message : String(e)}`);
    return { action: 'ALLOW', category: 'ERROR', reason: 'Firewall error, allowing' };
  }
}

// ─── Stubs for API compat ───

export class VerificationStateTracker {
  private s = new Map<string, { codeChanged: boolean }>();
  getState(sid: string) { if (!this.s.has(sid)) this.s.set(sid, { codeChanged: false }); return this.s.get(sid)!; }
  setCodeChanged(sid: string, v: boolean): void { this.getState(sid).codeChanged = v; }
  clearVerificationPending(sid: string): void { this.setCodeChanged(sid, false); }
  setVerificationClaimed(sid: string, v: boolean): void { void sid; void v; }
  incrementBlockCount(sid: string): void { void sid; }
  setLastBlockedCategory(sid: string, c: string): void { void sid; void c; }
  isPendingExpired(sid: string, ms: number): boolean { void sid; void ms; return false; }
  getWindow(sid: string): void { void sid; }
  clearSession(sid: string): void { this.s.delete(sid); }
}
export const sstfStateTracker = new VerificationStateTracker();
export class ContextWindow { append(): void {} recent(): any[] { return []; } lastN(): any[] { return []; } clear(): void {} }
export const sstfContextWindows = { getOrCreate(): ContextWindow { return new ContextWindow(); }, clear(): void {}, clearAll(): void {} };
export interface FirewallConfig { enabled: boolean; }
let FIREWALL_CONFIG: FirewallConfig = { enabled: true };
export function getFirewallConfig(): FirewallConfig { return { ...FIREWALL_CONFIG }; }
export function updateFirewallConfig(u: Partial<FirewallConfig>): void { FIREWALL_CONFIG = { ...FIREWALL_CONFIG, ...u }; }
export interface SSTFTelemetry { totalChecks: number; totalBlocks: number; totalAllows: number; }
export function getSSTFTelemetry(): SSTFTelemetry { return { totalChecks: 0, totalBlocks: 0, totalAllows: 0 }; }
