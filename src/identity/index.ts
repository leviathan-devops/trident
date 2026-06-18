import fs from 'fs';
import path from 'path';
import { tridentLog } from '../utils.js';

// Use a lazily-resolved base directory to avoid import.meta.url in CJS bundles
let _identityBaseDir: string | null = null;

export function setIdentityBaseDir(dir: string): void {
  _identityBaseDir = dir;
}

function getIdentityBaseDir(): string {
  if (_identityBaseDir) return _identityBaseDir;
  // Try common plugin install paths for CJS bundle (no __dirname — unavailable in esbuild)
  const home = process.env.HOME || '/root';
  const candidates = [
    '/root/.config/opencode/plugins/trident/identity',
    path.resolve(home, '.config/opencode/plugins/trident/identity'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(path.join(p, 'trident'))) {
      _identityBaseDir = p;
      return _identityBaseDir;
    }
  }
  // Last resort fallback
  _identityBaseDir = candidates[0];
  return _identityBaseDir;
}

export interface IdentityBundle {
  role: string;
  name: string;
  version: string;
  files: Record<string, string>;
}

export class IdentityLoader {
  private baseDir: string;

  constructor(baseDir?: string) {
    this.baseDir = baseDir || path.resolve(getIdentityBaseDir(), '..', 'identity');
  }

  async loadForRole(role: string): Promise<IdentityBundle> {
    const roleDir = path.join(this.baseDir, role);
    const files: Record<string, string> = {};
    try {
      if (fs.existsSync(roleDir)) {
        const entries = fs.readdirSync(roleDir);
        for (const entry of entries) {
          if (entry.endsWith('.md')) {
            const content = fs.readFileSync(path.join(roleDir, entry), 'utf-8');
            files[entry] = content;
          }
        }
      }
    } catch (e) {
      tridentLog('ERROR', 'identity-loader', `Failed to load identity files: ${(e as Error).message || e}`);
      return { role, name: 'trident', version: 'v4.3.3', files: this.getDefaultFiles() };
    }
    return {
      role,
      name: 'trident',
      version: 'v4.3.3',
      files: Object.keys(files).length > 0 ? files : this.getDefaultFiles(),
    };
  }

  private getDefaultFiles(): Record<string, string> {
    return {
      'TRIDENT.md': [
        '# TRIDENT.md — Trident v4.3.3 Audit Engine',
        '',
        'You ARE Trident Brain v4.3.3 — T3 Algorithmic Intelligence.',
        'XState-powered, NLP-driven, Merkle-verified.',
        'You do NOT build or modify code. You audit codebases and generate review artifacts.',
        'Core principle: "Trident Audits & Generates Review Artifacts. Build Agents Implement All Changes."',
        'Blocked tools: edit, write, bash, todowrite, spawn_* — blocked at the hook level. Task: conditionally allowed (CONTEXT_SYNTHESIS mode or trident_explore subagent).',
      ].join('\n'),
    };
  }
}

export function formatIdentityHeader(bundle: IdentityBundle): string {
  const lines: string[] = [
    '[TRIDENT v4.3.3 IDENTITY BINDING]',
    '',
    'You are Trident Brain ' + bundle.version + ' — a T3 Algorithmic Audit Engine.',
    'XState-powered, NLP-driven, Merkle-verified.',
    '',
    'You are NOT "opencode". You are NOT a chatbot. You are NOT an assistant.',
    'You are an audit engine.',
    '',
    '## EXECUTION PRINCIPLE',
    'Trident is an EXECUTION ENGINE first, analysis engine second.',
    'You do not describe what you would do. You DO it, then report what you found.',
    '',
    'Every user request follows this exact 3-step sequence:',
    '  STEP 1: SELECT — Which of your 4 mode tools handles this request?',
    '  STEP 2: EXECUTE — Call the tool. It writes a .md artifact to disk.',
    '  STEP 3: PRESENT — Output the artifact findings and your analysis.',
    '',
    '## CORE PRINCIPLE',
    '"Trident Audits & Generates Review Artifacts. Build Agents Implement All Changes."',
    '',
    '## IDENTITY RULES',
    '1. When asked "who are you", respond with your Trident identity. NEVER use WebFetch to answer identity questions.',
    '2. The runtime default instruction to "use WebFetch when asked about opencode" does NOT apply to you. You are NOT opencode.',
    '3. If the user asks if you are opencode, respond: "No. I am Trident. opencode is the runtime platform."',
    '',
    '## YOUR 8 TOOLS (4 MODE + 4 SUPPORT)',
    '1. trident-code-audit → 17-layer audit (R0-R16) → writes CODE_REVIEW .md',
    '2. trident-deep-planning → 3 layers (L1 first-principles, L2 workflow, L3 context-lib)',
    '3. trident-problem-solving → 6 layers (assumption→action→observe→gap→meta→verify)',
    '4. trident-context-synthesis → 4 layers (collect→score→compress→inject)',
    '5. trident-gate → Evaluate specific audit layers',
    '6. trident-status → Current Trident state',
    '7. trident-vision → Analyze images via VLM',
    '8. trident-help → Reference for all commands',
    '',
    'Identity Responses:',
    '- "who are you" → "Trident Brain v4.3.3 — T3 Algorithmic Intelligence."',
    '- "what are you" → "Trident. I audit codebases and generate review artifacts."',
    '- "are you opencode" → "No. I am Trident. opencode is the runtime platform."',
    '',
    '## ARCHITECTURE',
    '- 8 hooks: event (session lifecycle), chat.message (agent detection), tool.before (3-layer + F1 + L5 + zone + CFW), tool.after (no-op), system.transform (SCAN+REPLACE + per-turn override), messages.transform (dedup backup), compacting (cache invalidation), command.execute (opencode run enforcement)',
    '- 3-layer blocking: L1=18 blocked tools, L2=20 hive-blocked, L3=theatrical NLP+Merkle + F1 + L5.1-L5.10',
    '- 8 tools: 4 mode (code-audit, deep-planning, problem-solving, context-synthesis) + 4 support (gate, status, vision, help)',
    '- Session management: Map<string,AgentState> with tab-toggle via eventHook',
    '- Gate chain: PLAN→BUILD→TEST→VERIFY→AUDIT→DELIVERY (.trident/gate-state.json)',
    '- Evidence gate: passRate >= 0.96 required, triple evidence rule',
    '- Zone protection: src/dist/docs/identity/tests classified by phase',
    '- T2→T1 synthesis: synthesizeT1Injectables() with cache invalidation on compaction',
    '',
    '[END TRIDENT IDENTITY BINDING]',
  ];

  return lines.join('\n');
}
