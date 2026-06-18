/**
 * Auto-Discovery Engine — Scans target directories to extract real project intelligence.
 * Used by all mode tools to generate substantive output from just a target path.
 */
import * as fs from 'fs';
import * as path from 'path';
import { tridentLog } from '../utils.js';

export interface DiscoveryResult {
  projectRoot: string;
  totalFiles: number;
  totalLines: number;
  directoryTree: string;
  languages: Record<string, number>;
  packageJson: Record<string, unknown> | null;
  entryPoints: string[];
  patterns: DiscoveredPattern[];
  failureModes: DiscoveredFailure[];
  decisions: DiscoveredDecision[];
  warheads: string[];
  auditLayers: string[];
}

export interface DiscoveredPattern {
  name: string;
  file: string;
  line: number;
  type: 'class' | 'interface' | 'function' | 'import' | 'export' | 'comment';
}

export interface DiscoveredFailure {
  pattern: string;
  file: string;
  line: number;
  message: string;
}

export interface DiscoveredDecision {
  rationale: string;
  file: string;
  line: number;
}

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', '.stryker-tmp', '__pycache__', '.venv']);
const SOURCE_EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.py', '.rs', '.go', '.java', '.json', '.yaml', '.yml', '.md']);

export async function discoverProject(targetPath: string): Promise<DiscoveryResult> {
  const projectRoot = path.resolve(targetPath);
  tridentLog('INFO', 'auto-discover', `Scanning: ${projectRoot}`);

  const files = collectFiles(projectRoot, projectRoot, 0);
  const totalLines = countLines(files);
  const directoryTree = buildTree(projectRoot, 0, 4);
  const languages = detectLanguages(files);
  const packageJson = readPackageJson(projectRoot);
  const entryPoints = findEntryPoints(projectRoot, packageJson);
  const patterns = extractPatterns(files.slice(0, 100));
  const failureModes = extractFailureModes(files.slice(0, 100));
  const decisions = extractDecisions(files.slice(0, 100));
  const warheads = findWarheads(files);
  const auditLayers = findAuditLayers(files);

  return {
    projectRoot,
    totalFiles: files.length,
    totalLines,
    directoryTree,
    languages,
    packageJson,
    entryPoints,
    patterns,
    failureModes,
    decisions,
    warheads,
    auditLayers,
  };
}

function collectFiles(dir: string, root: string, depth: number): string[] {
  const files: string[] = [];
  if (depth > 15) return files;
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (SKIP_DIRS.has(entry.name)) continue;
      // Skip compiled/minified JS — build artifacts, not source
      const compiledPatterns = [/\.min\.js$/i, /compiled\.js$/i, /bundle\.\w+\.js$/i];
      if (compiledPatterns.some(function(p) { return p.test(entry.name); })) continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        files.push(...collectFiles(fullPath, root, depth + 1));
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (SOURCE_EXTS.has(ext)) {
          files.push(fullPath);
        }
      }
    }
  } catch (e) {
    tridentLog('DEBUG', 'auto-discover', `Scan failed for ${dir}: ${(e as Error).message}`);
    return files; // P10: Return partial results — unreadable directories skipped, collected files still valid
  }
  return files;
}

function countLines(files: string[]): number {
  let total = 0;
  for (const file of files.slice(0, 200)) {
    try {
      const content = fs.readFileSync(file, 'utf-8');
      total += content.split('\n').length;
    } catch {
      tridentLog('DEBUG', 'auto-discover', `countLines: failed to read file: ${file}`);
      // Safe to continue — skip unreadable file, count partial lines
    }
  }
  return total;
}

function buildTree(dir: string, depth: number, maxDepth: number): string {
  if (depth > maxDepth) return '';
  const indent = '  '.repeat(depth);
  const name = path.basename(dir);
  let result = `${indent}${name}/\n`;
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const dirs = entries.filter(e => e.isDirectory() && !SKIP_DIRS.has(e.name)).slice(0, 20);
    const fileCount = entries.filter(e => e.isFile()).length;
    for (const d of dirs) {
      result += buildTree(path.join(dir, d.name), depth + 1, maxDepth);
    }
    if (fileCount > 0 && dirs.length === 0) {
      result += `${indent}  (${fileCount} files)\n`;
    }
  } catch {
    tridentLog('DEBUG', 'auto-discover', `buildTree: failed to read directory: ${dir}`);
    // Safe to continue — partial directory tree still valid
  }
  return result;
}

function detectLanguages(files: string[]): Record<string, number> {
  const langs: Record<string, number> = {};
  for (const file of files) {
    const ext = path.extname(file).toLowerCase();
    const lang = ext.replace('.', '');
    langs[lang] = (langs[lang] || 0) + 1;
  }
  return langs;
}

function readPackageJson(dir: string): Record<string, unknown> | null {
  try {
    const pkgPath = path.join(dir, 'package.json');
    if (fs.existsSync(pkgPath)) {
      return JSON.parse(fs.readFileSync(pkgPath, 'utf-8')) as Record<string, unknown>;
    }
  } catch {
    tridentLog('DEBUG', 'auto-discover', 'readPackageJson: failed to read or parse package.json');
    // Safe to continue — fallback to null, caller handles missing package.json
  }
  return null;
}

function findEntryPoints(dir: string, pkg: Record<string, unknown> | null): string[] {
  const entries: string[] = [];
  if (typeof pkg?.main === 'string') entries.push(pkg.main);
  if (typeof pkg?.module === 'string') entries.push(pkg.module);
  const commonEntries = ['index.ts', 'index.js', 'src/index.ts', 'src/index.js', 'main.ts', 'main.js'];
  for (const entry of commonEntries) {
    const fullPath = path.join(dir, entry);
    if (fs.existsSync(fullPath)) {
      entries.push(entry);
    }
  }
  return [...new Set(entries)];
}

function extractPatterns(files: string[]): DiscoveredPattern[] {
  const patterns: DiscoveredPattern[] = [];
  const regexes = [
    { re: /^(?:export\s+)?class\s+(\w+)/gm, type: 'class' as const },
    { re: /^(?:export\s+)?interface\s+(\w+)/gm, type: 'interface' as const },
    { re: /^(?:export\s+)?function\s+(\w+)/gm, type: 'function' as const },
    { re: /^export\s+(?:const|let|var)\s+(\w+)/gm, type: 'export' as const },
  ];

  for (const file of files) {
    try {
      const lines = fs.readFileSync(file, 'utf-8').split('\n');
      for (let i = 0; i < lines.length; i++) {
        for (const { re, type } of regexes) {
          re.lastIndex = 0;
          const match = re.exec(lines[i]);
          if (match) {
            patterns.push({ name: match[1], file: path.basename(file), line: i + 1, type });
            if (patterns.length >= 50) return patterns;
          }
        }
      }
    } catch {
      tridentLog('DEBUG', 'auto-discover', `extractPatterns: failed to read file: ${file}`);
      // Safe to continue — skip unreadable file, partial patterns still valid
    }
  }
  return patterns;
}

function extractFailureModes(files: string[]): DiscoveredFailure[] {
  const failures: DiscoveredFailure[] = [];
  const patterns = [
    /console\.error\(['"`](.*?)['"`]/,
    /throw\s+new\s+Error\(['"`](.*?)['"`]/,
    /catch\s*\(\s*\w*\s*\)\s*\{[^}]*?(.*?)\s*\}/,
  ];

  for (const file of files) {
    try {
      const lines = fs.readFileSync(file, 'utf-8').split('\n');
      for (let i = 0; i < lines.length; i++) {
        for (const re of patterns) {
          const match = re.exec(lines[i]);
          if (match) {
            failures.push({
              pattern: match[0].substring(0, 80),
              file: path.basename(file),
              line: i + 1,
              message: match[1]?.substring(0, 100) || match[0].substring(0, 100),
            });
            if (failures.length >= 30) return failures;
          }
        }
      }
    } catch {
      tridentLog('DEBUG', 'auto-discover', `extractFailureModes: failed to read file: ${file}`);
      // Safe to continue — skip unreadable file, partial failure modes still valid
    }
  }
  return failures;
}

function extractDecisions(files: string[]): DiscoveredDecision[] {
  const decisions: DiscoveredDecision[] = [];
  const re = /\/\/\s*(?:Decision|Rationale|WHY|REASON):\s*(.+)/i;

  for (const file of files) {
    try {
      const lines = fs.readFileSync(file, 'utf-8').split('\n');
      for (let i = 0; i < lines.length; i++) {
        const match = re.exec(lines[i]);
        if (match) {
          decisions.push({
            rationale: match[1].trim(),
            file: path.basename(file),
            line: i + 1,
          });
          if (decisions.length >= 20) return decisions;
        }
      }
    } catch {
      tridentLog('DEBUG', 'auto-discover', `extractDecisions: failed to read file: ${file}`);
      // Safe to continue — skip unreadable file, partial decisions still valid
    }
  }
  return decisions;
}

function findWarheads(files: string[]): string[] {
  const warheads: string[] = [];
  for (const file of files) {
    if (file.includes('warhead') || file.includes('Warhead')) {
      try {
        const content = fs.readFileSync(file, 'utf-8');
        const matches = content.match(/(?:var|const|let)\s+(\w*[Ww]arhead\w*)/g);
        if (matches) {
          for (const m of matches) {
            const name = m.split(/\s+/)[1];
            if (!warheads.includes(name)) warheads.push(name);
          }
        }
      } catch {
        tridentLog('DEBUG', 'auto-discover', `findWarheads: failed to read file: ${file}`);
        // Safe to continue — skip unreadable file, partial warheads still valid
      }
    }
  }
  return warheads;
}

function findAuditLayers(files: string[]): string[] {
  const layers: string[] = [];
  for (const file of files) {
    if (file.includes('/layers/') || file.includes('\\layers\\')) {
      const name = path.basename(file, path.extname(file));
      if (name.match(/^r\d+-/)) {
        layers.push(name);
      }
    }
  }
  return layers;
}
