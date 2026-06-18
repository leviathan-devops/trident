import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { tridentLog } from '../utils.js';
import { hookRegistry } from './warhead-registry.js';
import { Warhead } from './warhead-interface.js';
import { registerProjectFolderWarheadHooks } from './project-folder-warhead/project-folder-warhead.js';

// ── Real Warhead imports (replace ALL build*Warhead() string builders) ──
import { runtimeGradeWarhead } from './warheads/warhead-runtime-grade.js';
import { concurrencyWarhead } from './warheads/warhead-concurrency.js';
import { persistenceWarhead } from './warheads/warhead-persistence.js';
import { nlpPipelineWarhead } from './warheads/warhead-nlp.js';
import { auditLayerProgressionWarhead } from './warheads/warhead-gates.js';
import { testingWarhead } from './warheads/warhead-testing.js';
import { tsCompilerAPIWarhead } from './warheads/warhead-tscompiler.js';
import { exploreDispatchWarhead } from './warheads/warhead-explore.js';
import { identityLayerWarhead } from './warheads/warhead-identity-layer.js';
import { focusWarhead, recoveryWarhead, auditStateWarhead } from './warheads/warhead-dynamic-state.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ── BUNDLED FALLBACKS (embedded in source, survive bundle) ──
// These ensure the T2 cache NEVER returns empty, even when identity
// files can't be loaded from disk.
const FALLBACK_TOOLS_MD = `# TOOLS.md (Bundle Fallback)
- trident-code-audit (17-layer), trident-deep-planning, trident-problem-solving
- trident-context-synthesis, trident-gate, trident-status, trident-vision, trident-help
- hive_context, hive_remember, todowrite
- BLOCKED: edit, write, bash, terminal, execute, exec, task`;

const FALLBACK_EXECUTION_MD = `# EXECUTION.md (Bundle Fallback)
- STEP 1: SELECT mode tool. STEP 2: EXECUTE. STEP 3: PRESENT results.
- Scan first, think second — let patterns find issues before reasoning.
- Prove all claims with filesystem evidence.
- Never suggest mocks or stubs. Never use host testing as proof.`;

const FALLBACK_QUALITY_MD = `# QUALITY.md (Bundle Fallback)
- All findings must have: file path, line number, regex pattern, evidence.
- No finding is complete without: WHY explanation + HOW to fix.
- Evidence hierarchy: STRONG (path+line+match) > WEAK (pattern only) > UNACCEPTABLE.`;

const BUILTIN_FALLBACKS: Record<string, string> = {
  'TOOLS.md': FALLBACK_TOOLS_MD,
  'EXECUTION.md': FALLBACK_EXECUTION_MD,
  'QUALITY.md': FALLBACK_QUALITY_MD,
};

// ── T2 Cache ──
let _t2Cache: Map<string, string> | null = null;

function ensureT2Cache(): Map<string, string> {
  if (_t2Cache) return _t2Cache;
  _t2Cache = new Map();

  // PRE-POPULATE with bundled fallbacks (cache NEVER empty)
  for (const [name, content] of Object.entries(BUILTIN_FALLBACKS)) {
    _t2Cache.set(name, content);
  }

  // Try to load real files from disk (override fallbacks if available)
  try {
    const identityDir = path.resolve(__dirname, '..', 'identity', 'trident');
    if (!fs.existsSync(identityDir)) {
      tridentLog('WARN', 'warhead-synthesizer',
        `T2 dir not found: ${identityDir} — using bundled fallbacks (${Object.keys(BUILTIN_FALLBACKS).length} files)`);
      return _t2Cache;  // Fallbacks already loaded
    }

    const entries = fs.readdirSync(identityDir);
    for (const entry of entries) {
      if (entry.endsWith('.md')) {
        try {
          const content = fs.readFileSync(path.join(identityDir, entry), 'utf-8');
          _t2Cache.set(entry, content);  // OVERRIDE fallback with real content
        } catch (e: unknown) {
          console.error('[warhead-synthesizer] T2 load failed for', entry, ':', e instanceof Error ? e.message : String(e));
          tridentLog('WARN', 'warhead-synthesizer',
            `T2 load failed for ${entry}: using fallback — ${e instanceof Error ? e.message : String(e)}`);
          // Fallback already set — keep it
          return _t2Cache;
        }
      }
      // Also scan subdirectories
      const subDir = path.join(identityDir, entry);
      try {
        if (fs.statSync(subDir).isDirectory()) {
          const subEntries = fs.readdirSync(subDir);
          for (const subEntry of subEntries) {
            if (subEntry.endsWith('.md')) {
              try {
                const content = fs.readFileSync(path.join(subDir, subEntry), 'utf-8');
                _t2Cache.set(entry + '/' + subEntry, content);
              } catch (e: unknown) {
                console.error('[warhead-synthesizer] T2 subdir load failed:', e instanceof Error ? e.message : String(e));
                tridentLog('WARN', 'warhead-synthesizer',
                  `T2 subdir load failed: ${e instanceof Error ? e.message : String(e)}`);
                return _t2Cache;
              }
            }
          }
        }
      } catch (e: unknown) {
        // statSync failed — subdir scan is best-effort
        console.error('[warhead-synthesizer] Subdir stat failed: ' + (e instanceof Error ? e.message : String(e)));
        tridentLog('INFO', 'warhead-synthesizer', 'Subdir stat failed: ' + (e instanceof Error ? e.message : String(e)));
        return _t2Cache;
      }
    }
  } catch (e: unknown) {
    console.error('[warhead-synthesizer] T2 cache init failed:', e instanceof Error ? e.message : String(e));
    tridentLog('ERROR', 'warhead-synthesizer',
      `T2 cache init failed: ${e instanceof Error ? e.message : String(e)}`);
    // Fallbacks already loaded — no silent degradation
    return _t2Cache;
  }

  // ── Knowledge library KB files (bundled for container runtime) ──
  try {
    const homeDir = process.env.HOME || '/root';
    const kbDir = path.join(homeDir, 'OPENCODE_WORKSPACE', 'Shared Workspace Context', 'KNOWLEDGE_LIBRARY', 'Typescript Deep Knowledge');
    const kbFiles = ['KB-00-Philosophy-and-Rules.md', 'KB-01-TypeScript-Compiler-API-and-Semantic-Analysis.md', 'KB-05-Testing-Verification-and-Oracle-Architecture.md', 'KB-07-Deterministic-NLP-Pipeline-Intent-Resolution.md'];
    for (const kbFile of kbFiles) {
      const kbPath = path.join(kbDir, kbFile);
      if (fs.existsSync(kbPath)) {
        const content = fs.readFileSync(kbPath, 'utf-8');
        _t2Cache.set('kb/' + kbFile, content);
      }
    }
  } catch { /* best-effort */ }

  tridentLog('INFO', 'warhead-synthesizer',
    `T2 cache: ${_t2Cache.size} entries (${Object.keys(BUILTIN_FALLBACKS).length} bundled)`);
  return _t2Cache;
}

function loadIdentityFile(name: string): string {
  const cache = ensureT2Cache();
  return cache.get(name) || '';
}

// ── Audit Layer Description Loader ──
function loadAuditLayerDescriptions(): string {
  const layerDir = path.resolve(__dirname, '..', 'audit-engine', 'layers');
  const descriptions: string[] = [];
  try {
    if (!fs.existsSync(layerDir)) return '[Audit engine layers not found]';
    const files = fs.readdirSync(layerDir).filter((f: string) => f.endsWith('.ts')).sort();
    for (const file of files) {
      try {
        const content = fs.readFileSync(path.join(layerDir, file), 'utf-8');
        const nameMatch = content.match(/name:\s*'([^']+)'/);
        const descMatch = content.match(/description:\s*'([^']+)'/);
        const layerMatch = content.match(/layer:\s*'([^']+)'/);
        if (layerMatch && nameMatch) {
          descriptions.push(`${layerMatch[1]}: ${nameMatch[1]}${descMatch ? ' — ' + descMatch[1] : ''}`);
        }
        } catch (e: unknown) {
          console.error('[warhead-synthesizer] Layer read failed for', file, ':', e instanceof Error ? e.message : String(e));
          tridentLog('WARN', 'warhead-synthesizer',
            `Layer read failed ${file}: ${(e instanceof Error ? e.message : String(e))}`);
          return descriptions.length > 0 ? descriptions.join('\n') : '[Audit engine layers unavailable]';
        }
    }
  } catch (e: unknown) {
    console.error('[warhead-synthesizer] Layer dir scan failed:', e instanceof Error ? e.message : String(e));
    tridentLog('WARN', 'warhead-synthesizer',
      `Layer dir scan failed: ${(e instanceof Error ? e.message : String(e))}`);
    return '[Audit engine layers unavailable]';
  }
  return descriptions.length > 0
    ? descriptions.join('\n')
    : '[Audit engine layers unavailable]';
}

// ── T1 Knowledge Injection (from T2 cache) ──
function buildKnowledgeT1(): string {
  const t2 = ensureT2Cache();
  const sections: string[] = [];
  const priorityFiles = ['TOOLS.md', 'EXECUTION.md', 'QUALITY.md', 'FIREWALL_CONTEXT.md', 'AGENT_AWARENESS.md'];
  for (const filename of priorityFiles) {
    const content = t2.get(filename);
    if (content && content.length > 0) {
      const lines = content.split('\n').filter((l: string) => l.startsWith('-') || l.startsWith('## '));
      sections.push(`[${filename}] ${lines.slice(0, 8).join(' | ')}`);
    }
  }
  return sections.length > 0
    ? `[T1 WARHEAD: KNOWLEDGE]\n${sections.join('\n')}`
    : '[T1 WARHEAD: KNOWLEDGE]\nKnowledge library unavailable — identity files not loaded.';
}

function buildExploreProtocolT1(): string {
  const protocol = loadIdentityFile('explore-protocol.md');
  if (protocol.length === 0) {
    return `[T1 WARHEAD: EXPLORE PROTOCOL]
trident_explore: V1 (7-section extraction) + V2 (WHY 5-layer + HOW 3-layer).
Dispatch: task subagent_type=trident_explore description="...return V2 synthesis".
Tools: read, glob, grep, hive_context ONLY. BLOCKED: write, edit, bash, task.
L5.11 enforced: zero resistance to deployment count.`;
  }
  const lines = protocol.split('\n').filter((l: string) => l.startsWith('-') || l.startsWith('## ')).slice(0, 12);
  return `[T1 WARHEAD: EXPLORE PROTOCOL]\n${lines.join('\n')}`;
}

function buildIdentityBindingT1(): string {
  const t2 = ensureT2Cache();
  const tridentMd = t2.get('TRIDENT.md') || '';
  const compact = [
    'Trident Brain v4.3.2 — Code audit and analysis engine.',
    'Audits code. Generates review artifacts. Directs build agents.',
    'NOT opencode. NOT a chatbot. NOT an assistant.',
    'Two modes: AGENT (nav/gen) + AUDITOR (review/plan/synthesize).',
  ];
  if (tridentMd.length > 0) {
    const lines = tridentMd.split('\n').filter((l: string) => l.startsWith('-')).slice(0, 5);
    compact.push(...lines);
  }
  return `[T1 WARHEAD: IDENTITY BINDING]\n${compact.join('\n')}`;
}

// ── STATIC T1 SECTIONS (not warhead-based — these are identity/context injectables) ──
function buildStaticT1Sections(): string[] {
  const sections: string[] = [];

  // Identity Binding
  sections.push(buildIdentityBindingT1());

  // P1-P10 Principles (static reference)
  sections.push(`[T1 WARHEAD: P1-P10 PRINCIPLES]
P1 DEFENSIVE IMPORT — verify module exists before use.
P2 TYPE CERTAINTY — validate at boundaries, NEVER as cast without guard.
P3 ERROR COMPLETENESS — catch{} = DEFECT. MUST log+recover or log+propagate.
P4 RESOURCE LIFECYCLE — setInterval→clearInterval in finally. open→close.
P5 ATOMIC STATE — snapshot-and-rollback. Single assignment.
P6 DEPENDENCY CHECK — if(typeof fs?.readFileSync !== 'function') throw.
P7 PATH RESOLUTION — path.join(os.homedir(),...). NEVER hardcoded /home/.
P8 CONFIG VALIDATION — type check + range check before use.
P9 ASYNC DISCIPLINE — await in try/catch OR .catch(). NEVER fire-and-forget.
P10 OUTPUT CONTRACT — return type accurate in ALL paths.`);

  // Layer Engine
  sections.push(`[T1 WARHEAD: LAYER ENGINE]
4-layer firewall + F1 + L5 + CFW + Zone enforcement.
AGENT_IDENTITY: blocking non-Trident callers.
BLOCKED_TOOLS: edit/write/bash blocked at hook level.
TASK_BLOCK: task blocked outside CONTEXT_SYNTHESIS mode.
ZONE_WRITE: src/dist gated by BUILD phase.
F1: Cross-agent isolation — non-Trident agents blocked from Trident tools.
L5: 11 anti-derailment classes (host fallback, success claims, mocks, scope creep, resistance).
L3: Theatrical detection — keyword + Merkle cross-reference.
CFW: Contextual Firewall — PLAN phase blocks write/edit/patch/create.`);

  // Audit Engine
  sections.push(`[T1 WARHEAD: 17-LAYER AUDIT ENGINE]
R0-R16. Each layer produces findings with severity, confidence, correction, runtime impact.
${loadAuditLayerDescriptions()}`);

  // TS Compiler API — describes ONLY what exists (audit counter + trident-code-audit tool)
  sections.push(`[T1 WARHEAD: TS COMPILER API]
  ${tsCompilerAPIWarhead.getStatus().audits} audits tracked.
  For AST-level analysis, use trident-code-audit (17-layer R0-R16 engine).
  Anti-pattern: grep for analysis → USE trident-code-audit tool for TypeScript analysis.`);

  // Knowledge
  sections.push(buildKnowledgeT1());

  // Explore Protocol
  sections.push(buildExploreProtocolT1());

  // Compact Identity
  sections.push(`[T1 WARHEAD: COMPACT IDENTITY]
who/what → "Trident Brain v4.3.2 — code audit engine."
are you opencode → "No. I am Trident. opencode is the runtime platform."
can you edit → "No. Trident audits and documents. Build agents implement changes."
Block: edit, write, bash, task (except CONTEXT_SYNTHESIS). LayerEngine enforces.`);

  // NLP Pipeline — describes ONLY what exists (wink-nlp + StreamingBuffer + principle extractor)
  sections.push(`[T1 WARHEAD: NLP PIPELINE]
  Chat message analysis via wink-nlp tokenizer (10+ attributes per token).
  StreamingBuffer: sentence boundary detection with delimiter+timeout flush.
  Principle extractor for requirement identification from text.
  Anti-pattern: text.split(' ') → USE wink-nlp. regex for extraction → USE tokenization.`);

  // Audit Layer Progression — replaces old CI/CD gates
  sections.push(`[T1 WARHEAD: AUDIT LAYER PROGRESSION]
  R0→R16 audit layer progression replaces CI/CD pipeline gates.
  R0: Build Chain | R1: Hook Contract | R2: State Machine | R3: Async Correctness
  R4: Error Handling | R5: Container Deploy | R6: Dependency Integrity | R7: Config Schema
  R8: Source Hygiene | R9: Runtime Contract | R10: Invocation Integrity | R11: Theatrical
  R12: Cross-Plugin Isolation | R13: Data Flow Analysis | R14: Control Flow Graph
  R15: Container Preflight | R16: Bible Enforcement (P1-P10)
  Current layer tracked from trident-code-audit output. No CI/CD pipeline gates.
  CircuitBreaker: custom implementation (open/half-open/close + exponential backoff).
  TokenBucket: 60 token capacity, 10/sec refill for rate limiting.`);

  return sections.filter((s: string) => s.length > 0);
}

// ── ALL REGISTERED WARHEADS ──
const warheads: Warhead[] = [
  runtimeGradeWarhead,
  nlpPipelineWarhead,
  auditLayerProgressionWarhead,
  concurrencyWarhead,
  persistenceWarhead,
  testingWarhead,
  tsCompilerAPIWarhead,
  exploreDispatchWarhead,
  identityLayerWarhead,
  // Dynamic state warheads (restored — Finding #9 fix)
  focusWarhead,
  recoveryWarhead,
  auditStateWarhead,
];

// ── Hook Registration ──
export async function registerWarheadHooks(): Promise<void> {
  // ── Project folder warhead (session.created, tool.before, system.transform) ──
  registerProjectFolderWarheadHooks();

  // ── Register all enforcement warheads ──
  for (const w of warheads) {
    try {
      if (w.init) {
        await w.init();
      }
      w.register(hookRegistry);
      tridentLog('INFO', 'warhead-synthesizer', `Warhead registered: ${w.id}`);
    } catch (e: unknown) {
      console.error('[warhead-synthesizer] Warhead registration failed for', w.id, ':', e instanceof Error ? e.message : String(e));
      tridentLog('ERROR', 'warhead-synthesizer',
        `Warhead ${w.id} registration failed: ${e instanceof Error ? e.message : String(e)}`);
      return;
    }
  }

  tridentLog('INFO', 'warhead-synthesizer',
    `${warheads.length} warheads registered, ${hookRegistry.getEventCount()} events, ` +
    `tool.execute.before=${hookRegistry.getHandlerCount('tool.execute.before')}, ` +
    `tool.execute.after=${hookRegistry.getHandlerCount('tool.execute.after')}, ` +
    `chat.message=${hookRegistry.getHandlerCount('chat.message')}`);
}

// ── Safe T0 getter (wraps getT0() in try/catch with typed return) ──
function safeGetT0(w: Warhead): string | null {
  try {
    const t0 = w.getT0();
    return (t0 && t0.length > 0) ? t0 : null;
  } catch (e: unknown) {
    console.error('[warhead-synthesizer] getT0 failed for', w.id, ':', e instanceof Error ? e.message : String(e));
    tridentLog('WARN', 'warhead-synthesizer',
      `getT0 failed for ${w.id}: ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
}

// ── Public API ──

let _t1Cache: string | null = null;

export function synthesizeT1Injectables(): string {
  if (_t1Cache) return _t1Cache;

  const sections: string[] = [];

  // 1. Dynamic T0 from warheads (real runtime counters)
  for (const w of warheads) {
    const t0 = safeGetT0(w);
    if (t0) sections.push(t0);
  }

  // 2. Static T1 sections (identity, knowledge, principles)
  const staticSections = buildStaticT1Sections();
  sections.push(...staticSections);

  _t1Cache = sections.join('\n\n');
  tridentLog('INFO', 'warhead-synthesizer',
    `T1 injectables synthesized: ${sections.length} sections, ${_t1Cache.length} chars`);
  return _t1Cache;
}

export function invalidateT1Cache(): void {
  _t1Cache = null;
  _t2Cache = null;
  tridentLog('INFO', 'warhead-synthesizer', 'T1 and T2 caches invalidated');
}


