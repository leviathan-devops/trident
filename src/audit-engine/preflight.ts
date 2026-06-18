/**
 * MECHANICAL PREFLIGHT ENGINE
 *
 * Runs BEFORE pattern matching to verify the project actually builds.
 * This is NOT theatrical — it executes real commands and checks real output.
 *
 * Prevents the "grep proves it exists, but it never fires" anti-pattern.
 * 5 of 8 Kraken v1.2 Ship V4 bugs were caused by not reading type definitions
 * for hook input/output structures — tsc would have caught those.
 */

import { execFile as execFileCb } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';
import { tridentLog } from '../utils.js';

const execFile = promisify(execFileCb);

export interface PreflightResult {
  typeCheckPassed: boolean;
  typeCheckError: string | null;
  buildPassed: boolean;
  buildError: string | null;
  distExists: boolean;
  distIsSingleFile: boolean;
  distSize: number;
  hasRelativeImports: boolean;
  sourceMapExists: boolean;
  findings: PreflightFinding[];
}

export interface PreflightFinding {
  check: string;
  passed: boolean;
  detail: string;
}

function classifyExecError(e: unknown, command: string): string {
  var execErr = e as { stderr?: { toString(): string }; message?: string; status?: string | number };
  var stderr = execErr.stderr?.toString() || '';
  var message = execErr.message || '';
  var code = execErr.status;

  if (code === 'ENOENT' || message.includes('ENOENT') || stderr.includes('ENOENT')) {
    return `${command} not found in container — install Node.js first`;
  }

  if (stderr.includes('error TS') || stderr.includes('TypeScript')) {
    return `TypeScript compilation errors found — run ${command} locally to see details`;
  }

  if (stderr.includes('Cannot find module') || stderr.includes('Module not found')) {
    return `Module resolution failed — check dependencies and run npm install`;
  }

  if (code === 1 || code === 2) {
    return `${command} exited with code ${code} — ${stderr.substring(0, 200).trim() || message.substring(0, 200).trim()}`;
  }

  return `${command} failed: ${message.substring(0, 200).trim()}`;
}

const EXEC_TIMEOUT = Math.max(5000, Math.min(300000, parseInt(process.env.TRIDENT_EXEC_TIMEOUT || '30000', 10)));
const BUILD_TIMEOUT = Math.max(5000, Math.min(300000, parseInt(process.env.TRIDENT_BUILD_TIMEOUT || '60000', 10)));

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function runPreflight(targetPath: string): Promise<PreflightResult> {
  const findings: PreflightFinding[] = [];
  const pkgPath = path.join(targetPath, 'package.json');

  let pkg: Record<string, any> | null = null;
  try {
    if (await fileExists(pkgPath)) {
      const raw = await fs.readFile(pkgPath, 'utf-8');
      pkg = JSON.parse(raw) as Record<string, unknown>;
    }
  } catch (e) {
    tridentLog('WARN', 'preflight', `Failed to parse package.json: ${(e as Error).message}`);
    pkg = null;
  }

  let typeCheckPassed = false;
  let typeCheckError: string | null = null;
  let buildPassed = false;
  let buildError: string | null = null;

  if (pkg?.scripts?.['build:check']) {
    try {
      await execFile('npm', ['run', 'build:check'], { cwd: targetPath, timeout: EXEC_TIMEOUT });
      typeCheckPassed = true;
      findings.push({ check: 'type-check', passed: true, detail: 'tsc --noEmit: 0 errors' });
    } catch (e: unknown) {
      typeCheckError = classifyExecError(e, 'npm run build:check');
      tridentLog('ERROR', 'preflight', `Type check failed: ${typeCheckError.substring(0, 200)}`);
      findings.push({ check: 'type-check', passed: false, detail: typeCheckError });
    }
  } else {
    findings.push({ check: 'type-check', passed: false, detail: 'No build:check script — cannot verify types' });
  }

  if (pkg?.scripts?.build) {
    try {
      await execFile('npm', ['run', 'build'], { cwd: targetPath, timeout: BUILD_TIMEOUT });
      buildPassed = true;
      findings.push({ check: 'build', passed: true, detail: 'Build succeeded' });
    } catch (e: unknown) {
      buildError = classifyExecError(e, 'npm run build');
      tridentLog('ERROR', 'preflight', `Build failed: ${buildError.substring(0, 200)}`);
      findings.push({ check: 'build', passed: false, detail: buildError });
    }
  } else {
    findings.push({ check: 'build', passed: false, detail: 'No build script — cannot verify build' });
  }

  const distPath = path.join(targetPath, 'dist', 'index.js');
  const altDistPath = path.join(targetPath, '..', 'dist', 'index.js');
  const distExists = (await fileExists(distPath)) || (await fileExists(altDistPath));
  const effectiveDistPath = (await fileExists(distPath)) ? distPath : altDistPath;
  const distDir = path.dirname(effectiveDistPath);
  let distIsSingleFile = false;
  let distSize = 0;
  let hasRelativeImports = false;
  const sourceMapExists = await fileExists(path.join(path.dirname(effectiveDistPath), 'index.js.map'));

  if (distExists) {
    const distContent = await fs.readFile(effectiveDistPath, 'utf-8');
    distSize = distContent.length;
    hasRelativeImports = /from\s+['"]\.\.?\//.test(distContent);
    distIsSingleFile = !hasRelativeImports;

    const distEntries = await fs.readdir(distDir);
    const otherDistFiles = distEntries
      .filter(f => f !== 'index.js' && f !== 'index.js.map' && f.endsWith('.js'));
    if (otherDistFiles.length > 0) {
      distIsSingleFile = false;
    }

    findings.push({ check: 'dist-exists', passed: true, detail: `dist/index.js exists (${(distSize / 1024).toFixed(1)}KB)` });
    findings.push({
      check: 'dist-single-file', passed: distIsSingleFile,
      detail: distIsSingleFile ? 'Single-file bundle, no relative imports' :
        `Multi-file dist — ${otherDistFiles.length + 1} .js files, relative imports found`
    });
    findings.push({
      check: 'source-map', passed: sourceMapExists,
      detail: sourceMapExists ? 'Source map present' : 'No source map — debugging will be harder'
    });
  } else {
    findings.push({ check: 'dist-exists', passed: false, detail: 'dist/index.js does not exist — run npm run build first' });
  }

  return {
    typeCheckPassed, typeCheckError,
    buildPassed, buildError,
    distExists, distIsSingleFile, distSize,
    hasRelativeImports, sourceMapExists,
    findings,
  };
}
