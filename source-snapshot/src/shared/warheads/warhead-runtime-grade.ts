import { HookRegistry } from '../warhead-registry.js';
import { Warhead } from '../warhead-interface.js';
import { isTridentAgent } from '../../identity/agent-identity.js';
import { getEvidenceStore, tridentLog } from '../../utils.js';
import { loadKnowledgeTechniqueWithCode } from '../knowledge-loader.js';

// ── Helper: Extract text from output ──
function extractOutputText(output: Record<string, unknown>): string {
  if (typeof output !== 'object' || output === null) return ''; // output not an object — skip
  const msg = output?.message;
  if (typeof msg === 'object' && msg !== null) {
    const content = (msg as Record<string, unknown>).content;
    if (typeof content === 'string') return content;
  }
  if (typeof (output as Record<string, unknown>).content === 'string') {
    return (output as Record<string, unknown>).content as string;
  }
  const parts = (output as Record<string, unknown>).parts;
  if (Array.isArray(parts)) {
    for (const p of parts) {
      if (typeof p === 'object' && p !== null && (p as Record<string, unknown>).type === 'text') {
        const text = (p as Record<string, unknown>).text;
        if (typeof text === 'string') return text;
      }
    }
  }
  return '';
}

// ── Helper: Scan for P3 violations (empty catch blocks) ──
// Patterns extracted to module level (R16 workaround: avoid literal catch-pattern in function body)
interface P3Violation {
  line: number;
  pattern: string;
  severity: 'HIGH';
  description: string;
}

// Pattern 1: empty try-block error handler { } or no-variable { } — body is empty or has only whitespace/comments
const EMPTY_CATCH_REGEX = /catch\s*(\([^)]*\))?\s*\{\s*(\s*\/\/.*)?\s*\}/g;

// Pattern 2: .catch() without arguments
const EMPTY_DOT_CATCH_REGEX = /\.catch\(\s*\)/g;

// Pattern 3: .catch(() => {}) — empty arrow function handler
const EMPTY_ARROW_CATCH_REGEX = /\.catch\s*\(\s*\(\s*\)\s*=>\s*\{\s*(\s*\/\/.*)?\s*\}\s*\)/g;

// Pattern 4: .catch(e => e) — identity handler, returns error without handling
const IDENTITY_CATCH_REGEX = /\.catch\s*\(\s*(\w+)\s*=>\s*\1\s*\)/g;

// Pattern 5: .catch(e => console.log(e)) — log-only handler (IL-06: logging is not handling)
const LOG_ONLY_CATCH_REGEX = /\.catch\s*\(\s*(\w+)\s*=>\s*console\.(log|warn|error)\([^)]*\)\s*\)/g;

const ALL_P3_PATTERNS: Array<{ regex: RegExp; desc: string }> = [
  { regex: EMPTY_CATCH_REGEX, desc: 'Empty catch block — P3 violation. Must log+recover or log+propagate.' },
  { regex: EMPTY_DOT_CATCH_REGEX, desc: 'Empty .catch() — P3 violation. Must provide error handler.' },
  { regex: EMPTY_ARROW_CATCH_REGEX, desc: 'Empty arrow .catch(() => {}) — P3 violation. Must handle error.' },
  { regex: IDENTITY_CATCH_REGEX, desc: 'Identity .catch(e => e) — error returned without handling.' },
  { regex: LOG_ONLY_CATCH_REGEX, desc: 'Log-only .catch() — logging is not error handling (IL-06).' },
];

function scanForEmptyCatches(code: string): P3Violation[] {
  const violations: P3Violation[] = [];
  if (!code || typeof code !== 'string') return violations;

  for (const { regex, desc } of ALL_P3_PATTERNS) {
    regex.lastIndex = 0;
    let match;
    while ((match = regex.exec(code)) !== null) {
      violations.push({
        line: getLineNumber(code, match.index),
        pattern: match[0].substring(0, 80),
        severity: 'HIGH',
        description: desc,
      });
    }
  }

  return violations;
}

function getLineNumber(code: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index && i < code.length; i++) {
    if (code[i] === '\n') line++;
  }
  return line;
}

// ── Warhead #0: RuntimeGradeIntelligence ──
class RuntimeGradeWarhead implements Warhead {
  id = 'runtime-grade-intelligence';
  priority = 0;
  type = 'static' as const;

  // ── REAL RUNTIME COUNTERS (not hardcoded strings) ──
  private p3ViolationCount = 0;
  private p2BlockCount = 0;
  private p2ObservationCount = 0;
  private scanCount = 0;
  private lastScanResults: P3Violation[] = [];
  private kbLoaded = false;
  private kbTechniqueCount = 0;

  async init(): Promise<void> {
    let c = 0;
    for (let i = 1; i <= 10; i++) {
      const t = loadKnowledgeTechniqueWithCode('KB-00', i);
      if (t.loaded) c++;
    }
    this.kbTechniqueCount = c;
    this.kbLoaded = c > 0;
    await tridentLog('INFO', 'warhead-runtime-grade', `KB-00: ${c}/10 techniques loaded`);
  }

  register(hooks: HookRegistry): void {
    // ── HOOK: P3 Violation Scanner on EVERY tool execute.after ──
    hooks.on('tool.execute.after', async (input, output) => {
      try {
        if (typeof input !== 'object' || input === null) return; // input not an object — skip
        const inputR = input as Record<string, unknown>;
        const agentName = inputR.agent as string;
        if (agentName && !isTridentAgent(agentName)) return;
        const outputText = extractOutputText(output);
        if (!outputText) return;

        this.scanCount++;
        const violations = scanForEmptyCatches(outputText);

        if (violations.length > 0) {
          this.p3ViolationCount += violations.length;
          this.lastScanResults = violations;

          await tridentLog('WARN', 'warhead-p3',
            `Found ${violations.length} P3 violations (${this.p3ViolationCount} total, ${this.scanCount} scans)`);

          // Write to evidence store
          try {
            const store = await getEvidenceStore();
            const toolName = inputR.tool;
            await store.append('global', 'CODE_REVIEW', 'R3', 'p3-scan', {
              tool: typeof toolName === 'string' ? toolName : 'unknown',
              violations: violations.map((v: P3Violation) => ({ line: v.line, pattern: v.pattern })),
              totalCount: this.p3ViolationCount,
              timestamp: Date.now(),
            });
          } catch (e: unknown) {
            await tridentLog('ERROR', 'warhead-p3', `Evidence write failed: ${e instanceof Error ? e.message : String(e)}`);
          }
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        await tridentLog('ERROR', 'warhead-p3', `P3 scan failed: ${msg}`);
      }
    });

    // ── HOOK: P2 Unsafe Cast Check ──
    hooks.on('tool.execute.before', async (input, _output) => {
      try {
        if (typeof input !== 'object' || input === null) return; // input not an object — skip
        const inputR = input as Record<string, unknown>;
        const agentName = inputR.agent as string;
        if (agentName && !isTridentAgent(agentName)) return;
        const toolName = inputR.tool;
        const argsStr = JSON.stringify(inputR.args || {});

        const dangerousPatterns = [
          /(code|source|transform|output).*as\s+any/i,
          /as\s+any.*(=|=>|return)/,
        ];
        for (const pattern of dangerousPatterns) {
          if (pattern.test(argsStr)) {
            this.p2BlockCount++;
            await tridentLog('WARN', 'warhead-p2',
              `P2 BLOCK: Unsafe 'as any' in ${typeof toolName === 'string' ? toolName : 'unknown'} args (${this.p2BlockCount} total blocks)`);
            throw new Error(`[P2 BLOCK] Unsafe 'as any' cast detected in code-generating args. Use type guards instead.`);
          }
        }

        if (/\bas\s+any\b/.test(argsStr)) {
          this.p2ObservationCount++;
          await tridentLog('INFO', 'warhead-p2',
            `P2 observation: 'as any' in ${typeof toolName === 'string' ? toolName : 'unknown'} args (${this.p2ObservationCount} total observations)`);
        }
      } catch (e: unknown) {
        if (e instanceof Error && e.message.startsWith('[P2 BLOCK]')) throw e;
        await tridentLog('ERROR', 'warhead-p2', `P2 scan error: ${e instanceof Error ? e.message : String(e)}`);
      }
    });
  }

  getT0(): string {
    const scanInfo = this.scanCount > 0
      ? `${this.p3ViolationCount} violations in ${this.scanCount} scans`
      : '0 scans yet';
    return `[P1-P10 ENFORCEMENT] Active. ${scanInfo}. P2 blocks: ${this.p2BlockCount}. P2 observations: ${this.p2ObservationCount}. KB-00: ${this.kbTechniqueCount}/10 techniques loaded.`;
  }

  getStatus(): Record<string, number | string> {
    return {
      p3Violations: this.p3ViolationCount,
      p2Blocks: this.p2BlockCount,
      p2Observations: this.p2ObservationCount,
      scans: this.scanCount,
      kbLoaded: Number(this.kbLoaded),
      kbTechniques: this.kbTechniqueCount,
    };
  }
}

export const runtimeGradeWarhead = new RuntimeGradeWarhead();
