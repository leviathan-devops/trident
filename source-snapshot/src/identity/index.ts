import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface IdentityBundle {
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
    // R14: Path traversal protection — resolve and validate that path stays within baseDir
    const roleDir = path.resolve(this.baseDir, role);
    const resolvedBase = path.resolve(this.baseDir);
    if (!roleDir.startsWith(resolvedBase + path.sep)) {
      throw new Error(`[Trident IdentityLoader] Path traversal blocked for role: ${role}`);
    }

    const files: Record<string, string> = {};
    try {
      const entries = await fs.promises.readdir(roleDir);
      for (const entry of entries) {
        const fullPath = path.join(roleDir, entry);
        if (entry.endsWith('.md')) {
          const content = await fs.promises.readFile(fullPath, 'utf-8');
          files[entry] = content;
        }
        const stat = await fs.promises.stat(fullPath);
        if (stat.isDirectory()) {
          const subEntries = await fs.promises.readdir(fullPath);
          for (const subEntry of subEntries) {
            if (subEntry.endsWith('.md')) {
              const subContent = await fs.promises.readFile(path.join(fullPath, subEntry), 'utf-8');
              files[entry + '/' + subEntry] = subContent;
            }
          }
        }
      }
    } catch (e: unknown) {
      console.error('[Trident IdentityLoader] Failed to load identity files:', e instanceof Error ? e.message : String(e));
      return {
        role,
        name: 'trident',
        version: 'v4.3.2',
        files: this.getDefaultFiles(),
      };
    }
    return {
      role,
      name: 'trident',
      version: 'v4.3.2',
      files: Object.keys(files).length > 0 ? files : this.getDefaultFiles(),
    };
  }

  private getDefaultFiles(): Record<string, string> {
    return {
      'TRIDENT.md': [
        '# TRIDENT v4.3.2 — System Identity',
        '',
        'Trident is an audit engine for the opencode platform. It analyzes codebases, produces structured review findings, and manages build pipeline gates.',
        'Trident does not write code. Trident does not execute shell commands.',
        'Blocked tools: edit, write, bash, task (outside CONTEXT_SYNTHESIS mode).',
      ].join('\n'),
    };
  }
}

export function formatIdentityHeader(bundle: IdentityBundle): string {
  const lines: string[] = [
    '[TRIDENT v4.3.2 SYSTEM CONTEXT]',
    '',
    'Trident Brain ' + bundle.version + ' — code audit and analysis engine for the opencode platform.',
    'Trident analyzes codebases, produces structured review findings, and manages pipeline gates.',
    'Trident is a plugin for opencode. It is not a chatbot or code generator.',
    '',
    '## EXECUTION PRINCIPLE',
    'EXECUTE tools immediately. Never describe what you would do. Call the tool, then report findings.',
    '',
    '## EXECUTION SEQUENCE',
    '1. SELECT — Choose the appropriate mode tool for the request.',
    '2. EXECUTE — Call the tool. It produces a structured artifact.',
    '3. REPORT — Present the artifact findings and analysis.',
    '',
    '## TOOLS',
    'Mode tools: trident-code-audit (17-layer R0-R16), trident-deep-planning, trident-problem-solving, trident-context-synthesis',
    'Support tools: trident-gate, trident-status, trident-vision, trident-help',
    'Hive tools: hive_context, hive_remember, hive_forget, hive_scan, hive_purge, hive_status, hive_trash_list, hive_trash_status — full access',
    '',
    '## CONSTRAINTS',
    '- edit, write, bash: blocked at hook level',
    '- task: blocked outside CONTEXT_SYNTHESIS mode',
    '- One tool call per message',
    '- All findings must reference tool execution evidence',
    '',
    '[END TRIDENT SYSTEM CONTEXT]',
  ];

  for (const [filename, content] of Object.entries(bundle.files)) {
    lines.push('');
    lines.push('--- From ' + filename + ' ---');
    lines.push(content);
  }

  return lines.join('\n');
}
