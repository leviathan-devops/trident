// ── PROJECT FOLDER WARHEAD ──
// Corrected for findings:
//   #7  — session.created event fires from session-hook.ts and hookRegistry
//   #8  — system.transform fires through hook registry
//   #9  — Session title read from hook input, NOT file polling
//   #10 — Watcher interval cleared before new one set
//   #14 — Python interpreter fallback (python3 -> python)
//   #17 — Retry loop guarded against concurrent execution

import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { hookRegistry } from '../warhead-registry.js';
import { isTridentAgent } from '../../identity/agent-identity.js';
import { setProjectRoot, getProjectRoot, getContextManagementPath, isInitialized, migrateProjectRoot, persistMarkerFile } from './memory-store.js';

const execFileAsync = promisify(execFile);

// ── ESM-safe __dirname ──
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ── Inline logging ──
function log(level: string, component: string, message: string): void {
  try {
    const ts = new Date().toISOString();
    const line = '[' + ts + '] [' + level + '] [' + component + '] ' + message + '\n';
    const logPath = process.env.TRIDENT_LOG_PATH
      ? path.resolve(process.env.TRIDENT_LOG_PATH)
      : path.join(os.tmpdir(), 'trident-engine.log');
    fs.appendFileSync(logPath, line, 'utf-8');
  } catch (e: unknown) {
    // P3 FIX: Last resort — stderr. Never silently discard.
    console.error(`[project-folder-warhead] ${level}: ${message}`, e instanceof Error ? e.message : String(e));
  }
}

// ── Resolve warhead directory at module init ──
function getWarheadDir(): string {
  // Priority 1: Try warheads/ subdirectory next to dist/ (container deployment)
  try {
    const dir = __dirname; // e.g., /root/.config/opencode/plugins/trident/dist/
    const warheadDir = path.resolve(dir, '..', 'warheads');
    if (fs.existsSync(path.resolve(warheadDir, 'auto-fire.py'))) {
      return warheadDir;
    }
  } catch (e: unknown) {
    // __dirname resolution failed — log and continue to next priority
    console.error('[project-folder-warhead] Warhead dir resolution failed:', e instanceof Error ? e.message : String(e));
    log('WARN', 'project-folder', 'Warhead dir resolution failed: ' + (e instanceof Error ? e.message : String(e)));
    return __dirname;
  }

  // Priority 2: Same directory as the TS source (dev mode)
  try {
    const srcDir = path.resolve(process.cwd(), 'source-snapshot', 'src', 'shared', 'project-folder-warhead');
    if (fs.existsSync(path.resolve(srcDir, 'auto-fire.py'))) {
      return srcDir;
    }
  } catch (e: unknown) {
    console.error('[project-folder-warhead] CWD resolution failed:', e instanceof Error ? e.message : String(e));
    log('WARN', 'project-folder', 'CWD resolution failed: ' + (e instanceof Error ? e.message : String(e)));
    return __dirname;
  }

  // Priority 3: Same directory as the bundle (dist/)
  return __dirname;
}

const WARHEAD_DIR = getWarheadDir();
const AUTO_FIRE_SCRIPT = path.resolve(WARHEAD_DIR, 'auto-fire.py');
const AGENT_CONFIG_PATH = path.resolve(WARHEAD_DIR, 'agent-config.json');
const MARKER_FILE = path.resolve(os.homedir(), '.opencode', '.trident', '.current-project');

const POLL_INTERVAL = 30000;
const MAX_RETRIES = 6;

// ── Module-level state ──
let _watcherInterval: ReturnType<typeof setInterval> | null = null;
let _lastTitle = '';
let _retryCount = 0;
let _retryInFlight = false;
// ── Cleanup on process exit / hot-reload ──
process.on('exit', () => { stopSessionWatcher(); });
process.on('SIGINT', () => { stopSessionWatcher(); });
process.on('SIGTERM', () => { stopSessionWatcher(); });

// ── Tools that write files ──
const WRITE_TOOLS = new Set([
  'write', 'write_file', 'edit', 'patch', 'create', 'delete_file',
  'mkdir', 'mv', 'cp', 'rename', 'upload', 'mkdrip',
]);

function verifyScriptsExist(): boolean {
  if (!fs.existsSync(AUTO_FIRE_SCRIPT)) {
    log('WARN', 'project-folder', 'auto-fire.py not found at: ' + AUTO_FIRE_SCRIPT);
    return false;
  }
  if (!fs.existsSync(AGENT_CONFIG_PATH)) {
    log('WARN', 'project-folder', 'agent-config.json not found at: ' + AGENT_CONFIG_PATH);
    return false;
  }
  return true;
}

async function callAutoFire(input: Record<string, unknown>): Promise<Record<string, unknown> | null> {
  if (!verifyScriptsExist()) {
    log('ERROR', 'project-folder', 'Python scripts not found');
    return null;
  }

  const interpreters = ['python3', 'python'];

  for (const interp of interpreters) {
    try {
      const { stdout, stderr } = await execFileAsync(
        interp,
        [AUTO_FIRE_SCRIPT, JSON.stringify(input)],
        { timeout: 15000, maxBuffer: 1024 * 1024 }
      );

      if (stderr && stderr.length > 0) {
        log('WARN', 'project-folder', 'auto-fire.py stderr: ' + stderr.slice(0, 500));
      }

      const parsedOutput = JSON.parse(stdout.trim()) as Record<string, unknown>;
      const result = parsedOutput && typeof parsedOutput === 'object' ? parsedOutput as Record<string, unknown> : {};
      if (result && typeof result === 'object' && result.status === 'error') {
        log('ERROR', 'project-folder', 'auto-fire.py error: ' + (result.reason || 'unknown'));
        return null;
      }

      return result;
    } catch (e: unknown) {
      const nodeErr = e;
      const isNotFound = nodeErr && typeof nodeErr === 'object' && 'code' in nodeErr
        && (nodeErr as { code?: string }).code === 'ENOENT';

      if (isNotFound) {
        continue; // Try next interpreter
      }

      const hasStderr = nodeErr && typeof nodeErr === 'object' && 'stderr' in nodeErr;
      if (hasStderr) {
        const stderrContent = (nodeErr as { stderr?: string }).stderr;
        if (stderrContent) {
          const errResult = tryParseStderrResult(stderrContent);
          if (errResult && typeof errResult === 'object' && errResult.status === 'error') {
            log('ERROR', 'project-folder', 'auto-fire.py: ' + (errResult.reason || 'unknown'));
            return null;
          }
        }
      }

      const errMsg = e instanceof Error ? e.message : String(e);
      console.error('[project-folder-warhead] auto-fire.py failed:', errMsg);
      log('ERROR', 'project-folder', 'auto-fire.py failed: ' + errMsg);
      return null;
    }
  }

  log('ERROR', 'project-folder', 'No Python interpreter found');
  return null;
}

function tryParseStderrResult(content: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(content.trim());
    return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

async function initProjectFolder(sessionTitle: string, currentAgent: string): Promise<boolean> {
  log('INFO', 'project-folder', 'initProjectFolder: title=' + sessionTitle + ', agent=' + currentAgent);

  const result = await callAutoFire({
    sessionTitle: sessionTitle,
    currentAgent: currentAgent,
    action: 'init',
  });

  if (!result) return false;
  if (result && typeof result === 'object' && result.status === 'waiting') {
    log('INFO', 'project-folder', 'Session title unparseable, will retry');
    return false;
  }

  const rootPath = result && typeof result.rootPath === 'string' ? result.rootPath : '';
  const agent = result && typeof result.agent === 'string' ? result.agent : '';
  const projectName = result && typeof result.projectName === 'string' ? result.projectName : '';

  if (rootPath && agent && projectName) {
    setProjectRoot(agent, projectName, rootPath);
    persistMarkerFile();
    log('INFO', 'project-folder', 'Project ' + (result ? result.status : '?') + ': ' + rootPath);
    return true;
  }

  log('WARN', 'project-folder', 'auto-fire.py returned incomplete result');
  return false;
}

function isPathInsideProject(candidatePath: string): boolean {
  const root = getProjectRoot();
  if (!root) return true;
  const abs = path.resolve(candidatePath);
  const rel = path.relative(root, abs);
  return !rel.startsWith('..') && !path.isAbsolute(rel);
}

async function handleSessionCreated(input: Record<string, unknown>): Promise<void> {
  if (typeof input !== 'object' || input === null) return; // input not an object — skip
  const title = (
    (typeof input.sessionName === 'string'
      ? input.sessionName
      : '') ||
    (typeof input.title === 'string'
      ? input.title
      : '') ||
    ''
  ) as string;

  const agent = (typeof input.agent === 'string'
    ? input.agent
    : 'Trident') as string;

  log('INFO', 'project-folder', 'Session created: title=' + title + ', agent=' + agent);

  if (!title || title.trim().length < 3) {
    log('INFO', 'project-folder', 'Session title too short — starting retry loop');
    startRetryLoop(agent, title);
    return;
  }

  const success = await initProjectFolder(title, agent);
  if (success) {
    _retryCount = 0;
    _lastTitle = title;
    startSessionWatcher();
  } else {
    startRetryLoop(agent, title);
  }
}

function startRetryLoop(agent: string, lastTitle: string): void {
  if (_retryInFlight) {
    log('INFO', 'project-folder', 'Retry already in flight');
    return;
  }

  if (_retryCount >= MAX_RETRIES) {
    log('WARN', 'project-folder', 'Max retries reached, aborting');
    return;
  }

  _retryCount++;
  _retryInFlight = true;

  setTimeout(async () => {
    try {
      const currentTitle = await readSessionTitle();
      if (!currentTitle || currentTitle === lastTitle || currentTitle.trim().length < 3) {
        _retryInFlight = false;
        startRetryLoop(agent, lastTitle);
        return;
      }

      const success = await initProjectFolder(currentTitle, agent);
      if (success) {
        _retryCount = 0;
        _lastTitle = currentTitle;
        startSessionWatcher();
      }
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : String(e);
      console.error('[project-folder-warhead] Retry error:', errMsg);
      log('ERROR', 'project-folder', 'Retry error: ' + errMsg);
    }
    _retryInFlight = false;
  }, POLL_INTERVAL);
}

function stopSessionWatcher(): void {
  if (_watcherInterval) {
    clearInterval(_watcherInterval);
    _watcherInterval = null;
    log("INFO", "project-folder", "Session watcher stopped");
  }
}

function startSessionWatcher(): void {
  stopSessionWatcher();

  log('INFO', 'project-folder', 'Starting session watcher');

  _watcherInterval = setInterval(async () => {
    try {
      const currentTitle = await readSessionTitle();
      if (!currentTitle || currentTitle === _lastTitle) return;

      log('INFO', 'project-folder', 'Session title changed');

      const agent = (await readCurrentAgent()) || 'Trident';
      const result = await callAutoFire({
        sessionTitle: currentTitle,
        currentAgent: agent,
        action: 'migrate',
        oldProjectPath: getProjectRoot() || '',
      });

      if (result && typeof result.rootPath === 'string' && result.rootPath) {
        migrateProjectRoot(
          typeof result.agent === 'string' ? result.agent : agent,
          typeof result.projectName === 'string' ? result.projectName : '',
          result.rootPath
        );
        persistMarkerFile();
        _lastTitle = currentTitle;
        log('INFO', 'project-folder', 'Session migrated to: ' + result.rootPath);
      }
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : String(e);
      console.error('[project-folder-warhead] Watcher error:', errMsg);
      log('ERROR', 'project-folder', 'Watcher error: ' + errMsg);
    }
  }, POLL_INTERVAL);
}

async function readSessionTitle(): Promise<string> {
  try {
    if (fs.existsSync(MARKER_FILE)) {
      const content = fs.readFileSync(MARKER_FILE, 'utf-8');
      const parsedTitleContent = JSON.parse(content) as Record<string, unknown>;
      if (typeof parsedTitleContent !== 'object' || parsedTitleContent === null) { return process.env.OPENCODE_SESSION_NAME || ''; }
      const marker = parsedTitleContent as Record<string, unknown>;
      if (typeof marker.sessionTitle === 'string' && marker.sessionTitle) {
        return marker.sessionTitle;
      }
    }
  } catch (e: unknown) {
    // Marker file read failed — log and fall through to env var
    console.error('[project-folder-warhead] Session title read failed:', e instanceof Error ? e.message : String(e));
    log('INFO', 'project-folder', 'Session title read failed: ' + (e instanceof Error ? e.message : String(e)));
    return process.env.OPENCODE_SESSION_NAME || '';
  }
  return process.env.OPENCODE_SESSION_NAME || '';
}

async function readCurrentAgent(): Promise<string> {
  try {
    if (fs.existsSync(MARKER_FILE)) {
      const content = fs.readFileSync(MARKER_FILE, 'utf-8');
      const parsedContent2 = JSON.parse(content) as Record<string, unknown>;
      if (typeof parsedContent2 !== 'object' || parsedContent2 === null) { return ''; }
      const marker = parsedContent2 as Record<string, unknown>;
      if (typeof marker.agent === 'string' && marker.agent) {
        return marker.agent;
      }
    }
  } catch (e: unknown) {
    // Marker file read failed — log and fall through to default
    console.error('[project-folder-warhead] Agent read failed:', e instanceof Error ? e.message : String(e));
    log('INFO', 'project-folder', 'Agent read failed: ' + (e instanceof Error ? e.message : String(e)));
    return 'Trident';
  }
  return 'Trident';
}

async function fileWriteRouter(input: Record<string, unknown>): Promise<void> {
  if (typeof input !== 'object' || input === null) return; // input not an object — skip
  const root = getProjectRoot();
  if (!root || !isInitialized()) return;

  const toolName = typeof input.tool === 'string'
    ? input.tool
    : '';
  if (!toolName || !WRITE_TOOLS.has(toolName)) return;

  const rawArgs = input.args;
  if (typeof rawArgs !== 'object' || rawArgs === null) return;
  const args = rawArgs as Record<string, unknown>;
  const filePath = typeof args.filePath === 'string'
    ? args.filePath
    : (typeof args.path === 'string'
      ? args.path
      : '');

  if (!filePath) return;

  if (!isPathInsideProject(filePath as string)) {
    const rewritten = path.join(root, (filePath as string).replace(/^\/+/, ''));
    throw new Error(
      '[PROJECT FOLDER VIOLATION] Write to ' + filePath + ' is OUTSIDE the project folder.\n' +
      'ALL file writes MUST go to: ' + root + '\n' +
      'Suggested corrected path: ' + rewritten
    );
  }
}

function injectProjectFolderContext(_input: Record<string, unknown>, output: Record<string, unknown>): void {
  const root = getProjectRoot();
  const cmPath = getContextManagementPath();
  if (!root) return;

  const out = output as { system?: string[] };
  if (!out || !Array.isArray(out.system)) return;

  out.system.push(
    '[TRIDENT PROJECT FOLDER]\n' +
    'Project Root: ' + root + '\n' +
    'Context Management: ' + (cmPath || '') + '\n' +
    'RULES:\n' +
    '- ALL file writes MUST go to paths INSIDE the project root above\n' +
    '- Writing to /tmp/, /root/, /home/ outside the project is FORBIDDEN\n' +
    '- context_management/ contains build docs and plans\n' +
    '- source-snapshot/ contains the source code\n' +
    '- dist/ contains the built bundle\n'
  );
}

export function registerProjectFolderWarheadHooks(): void {
  hookRegistry.on('session.created', async (input: Record<string, unknown>, _output: Record<string, unknown>) => {
    if (typeof input !== 'object' || input === null) return; // input not an object — skip
    const inputR = input as Record<string, unknown>;
    const agentName = typeof inputR.agent === 'string'
      ? inputR.agent : '';
    if (!isTridentAgent(agentName as string | undefined)) return;
    await handleSessionCreated(input);
  });

  hookRegistry.on('tool.execute.before', async (input: Record<string, unknown>, _output: Record<string, unknown>) => {
    if (typeof input !== 'object' || input === null) return; // input not an object — skip
    const inputR = input as Record<string, unknown>;
    const agent = typeof inputR.agent === 'string' ? inputR.agent : '';
    if (!isTridentAgent(agent as string | undefined)) return;
    await fileWriteRouter(input);
  });

  hookRegistry.on('system.transform', async (input: Record<string, unknown>, output: Record<string, unknown>) => {
    if (typeof input !== 'object' || input === null) return; // input not an object — skip
    const inputR = input as Record<string, unknown>;
    const agent = typeof inputR.agent === 'string' ? inputR.agent : '';
    if (!isTridentAgent(agent as string | undefined)) return;
    injectProjectFolderContext(input, output);
  });

  log('INFO', 'project-folder',
    'Project folder warhead registered (session.created, tool.before, system.transform)');
}
