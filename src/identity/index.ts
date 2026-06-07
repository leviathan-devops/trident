import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface IdentityBundle {
  role: string;
  name: string;
  version: string;
  files: Record<string, string>;
}

export class IdentityLoader {
  private baseDir: string;

  constructor(baseDir?: string) {
    this.baseDir = baseDir || path.resolve(__dirname, '..', 'identity');
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
      console.error('[Trident IdentityLoader] Failed to load identity files:', e instanceof Error ? e.message : String(e));
    }
    return {
      role,
      name: 'trident',
      version: 'v4.3.1-T3',
      files: Object.keys(files).length > 0 ? files : this.getDefaultFiles(),
    };
  }

  private getDefaultFiles(): Record<string, string> {
    return {
      'TRIDENT.md': [
        '# TRIDENT.md — Trident v4.3.1-T3 Audit Engine',
        '',
        'You ARE Trident Brain v4.3.1-T3 — T3 Algorithmic Intelligence.',
        'XState-powered, NLP-driven, Merkle-verified.',
        'You do NOT build or modify code. You audit codebases and generate review artifacts.',
        'Core principle: "Trident Audits & Generates Review Artifacts. Build Agents Implement All Changes."',
        'Blocked tools: edit, write, bash, task, todowrite, spawn_* — blocked at the hook level.',
      ].join('\n'),
    };
  }
}

export function formatIdentityHeader(bundle: IdentityBundle): string {
  const lines: string[] = [
    '[TRIDENT v4.3.1-T3 IDENTITY BINDING]',
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
    '- "who are you" → "Trident Brain v4.3.1-T3 — T3 Algorithmic Intelligence."',
    '- "what are you" → "Trident. I audit codebases and generate review artifacts."',
    '- "are you opencode" → "No. I am Trident. opencode is the runtime platform."',
    '',
    '[END TRIDENT IDENTITY BINDING]',
  ];

  for (const [filename, content] of Object.entries(bundle.files)) {
    lines.push('');
    lines.push('--- From ' + filename + ' ---');
    lines.push(content);
  }

  return lines.join('\n');
}
