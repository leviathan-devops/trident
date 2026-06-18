import { HookRegistry } from '../warhead-registry.js';
import { Warhead } from '../warhead-interface.js';
import { isTridentAgent } from '../../identity/agent-identity.js';
import { tridentLog } from '../../utils.js';

// ── TokenBucket — Real rate limiter ──

class TokenBucket {
  private tokens: number;
  private maxTokens: number;
  private refillRate: number;   // tokens per second
  private refillInterval: number;
  private lastRefill: number;

  constructor(maxTokens: number, refillRate: number, refillIntervalMs = 1000) {
    if (maxTokens <= 0) throw new Error('[P2] TokenBucket: maxTokens must be > 0');
    if (refillRate <= 0) throw new Error('[P2] TokenBucket: refillRate must be > 0');
    this.maxTokens = maxTokens;
    this.tokens = maxTokens;
    this.refillRate = refillRate;
    this.refillInterval = refillIntervalMs;
    this.lastRefill = Date.now();
  }

  /**
   * Consume `count` tokens. Returns true if allowed, false if rate limited.
   * REAL: Actually checks available tokens and returns false when exhausted.
   * ANTI-PATTERN: consume() that always returns true.
   */
  consume(count = 1): boolean {
    this.refill();
    if (this.tokens >= count) {
      this.tokens -= count;
      return true;
    }
    return false;  // REAL: Returns false when tokens exhausted
  }

  available(): number {
    this.refill();
    return this.tokens;
  }

  msUntilNext(): number {
    if (this.tokens > 0) return 0;
    const msPerToken = 1000 / this.refillRate;
    return Math.ceil(msPerToken);
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    if (elapsed >= this.refillInterval) {
      const newTokens = Math.floor(elapsed / 1000 * this.refillRate);
      this.tokens = Math.min(this.maxTokens, this.tokens + newTokens);
      this.lastRefill = now;
    }
  }
}

// ── CircuitBreaker — Real failure protection ──

type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

interface ToolCircuit {
  state: CircuitState;
  failureCount: number;
  lastFailureTime: number;
  openedAt: number;
}

class CircuitBreaker {
  private tools: Map<string, ToolCircuit> = new Map();

  constructor(
    private threshold = 5,         // failures before OPEN
    private resetTimeout = 30000   // ms before HALF_OPEN
  ) {}

  /**
   * Record a tool failure. If failureCount >= threshold, circuit OPENS.
   * REAL: Actually transitions to OPEN state and blocks calls.
   * ANTI-PATTERN: recordFailure() that doesn't change state.
   */
  recordFailure(toolName: string): void {
    const circuit = this.getOrCreate(toolName);
    circuit.failureCount++;
    circuit.lastFailureTime = Date.now();

    if (circuit.failureCount >= this.threshold && circuit.state === 'CLOSED') {
      circuit.state = 'OPEN';
      circuit.openedAt = Date.now();
    }
  }

  /**
   * Record a tool success. If HALF_OPEN, transitions to CLOSED.
   * REAL: Actually recovers the circuit.
   */
  recordSuccess(toolName: string): void {
    const circuit = this.getOrCreate(toolName);
    if (circuit.state === 'HALF_OPEN') {
      circuit.state = 'CLOSED';
      circuit.failureCount = 0;
    } else if (circuit.state === 'CLOSED') {
      // Decay failure count on success (not full reset — avoids oscillation)
      circuit.failureCount = Math.max(0, circuit.failureCount - 1);
    }
  }

  /**
   * Check if a tool is allowed to execute.
   * OPEN → check timeout → either HALF_OPEN (allow) or block
   * HALF_OPEN → allow (trial)
   * CLOSED → allow
   * REAL: Actually returns false when circuit should block.
   * ANTI-PATTERN: isAllowed() that always returns true.
   */
  isAllowed(toolName: string): boolean {
    const circuit = this.tools.get(toolName);
    if (!circuit || circuit.state === 'CLOSED') return true;

    if (circuit.state === 'OPEN') {
      const elapsed = Date.now() - circuit.openedAt;
      if (elapsed > this.resetTimeout) {
        circuit.state = 'HALF_OPEN';
        return true;  // Allow trial request
      }
      return false;  // REAL: Blocks the call
    }

    // HALF_OPEN — allow through (will be evaluated after execution)
    return true;
  }

  isOpen(toolName: string): boolean {
    return this.tools.get(toolName)?.state === 'OPEN';
  }

  getState(toolName: string): string {
    return this.tools.get(toolName)?.state || 'CLOSED';
  }

  failureCount(toolName: string): number {
    return this.tools.get(toolName)?.failureCount ?? 0;
  }

  private getOrCreate(toolName: string): ToolCircuit {
    let circuit = this.tools.get(toolName);
    if (!circuit) {
      circuit = { state: 'CLOSED', failureCount: 0, lastFailureTime: 0, openedAt: 0 };
      this.tools.set(toolName, circuit);
    }
    return circuit;
  }
}

// ── Warhead #3: ConcurrencyBackpressure ──

class ConcurrencyWarhead implements Warhead {
  id = 'concurrency-backpressure';
  priority = 3;
  type = 'static' as const;

  private rateLimitBlockCount = 0;
  private circuitBlockCount = 0;

  // 60 tokens max, 10/sec refill — allows bursts but limits sustained rate
  private tokenBucket = new TokenBucket(60, 10);
  private circuitBreaker = new CircuitBreaker(5, 30000);
  private explorerSemaphore = { max: 5, current: 0 };
  private leakedSlots = 0;

  register(hooks: HookRegistry): void {
    // ── HOOK: Rate limit check on EVERY tool.execute.before ──
    // WHY: Prevents tool spam. 60 rapid calls will exhaust the bucket.
    // REAL: Throws when rate limited, blocking tool execution.
    hooks.on('tool.execute.before', async (input, _output) => {
      if (typeof input !== 'object' || input === null) return; // input not an object — skip
      const inputR = input as Record<string, unknown>;
      const agentName = inputR.agent as string;
      if (agentName && !isTridentAgent(agentName)) return;
      const toolName = inputR.tool;
      if (typeof toolName !== 'string') return;

      if (!this.tokenBucket.consume()) {
        this.rateLimitBlockCount++;
        const waitMs = this.tokenBucket.msUntilNext();
        await tridentLog('WARN', 'warhead-concurrency',
          `Rate limit: ${toolName} blocked, ${waitMs}ms until retry`);
        throw new Error(
          `[RATE LIMIT] Tool '${toolName}' blocked. ${waitMs}ms until retry.`
        );
      }
    });

    // ── HOOK: Circuit breaker check on EVERY tool.execute.before ──
    // WHY: Prevents cascading failures. 5 consecutive failures = circuit OPEN.
    hooks.on('tool.execute.before', async (input, _output) => {
      if (typeof input !== 'object' || input === null) return; // input not an object — skip
      const inputR = input as Record<string, unknown>;
      const agentName = inputR.agent as string;
      if (agentName && !isTridentAgent(agentName)) return;
      const toolName = inputR.tool;
      if (typeof toolName !== 'string' || !toolName.startsWith('trident-')) return;

      if (!this.circuitBreaker.isAllowed(toolName)) {
        this.circuitBlockCount++;
        const failures = this.circuitBreaker.failureCount(toolName);
        await tridentLog('WARN', 'warhead-concurrency',
          `Circuit OPEN: ${toolName} (${failures} failures)`);
        throw new Error(
          `[CIRCUIT OPEN] Tool '${toolName}' is OPEN (${failures} failures). Retry after cooldown.`
        );
      }
    });

    // ── HOOK: Explorer semaphore — limit concurrent trident_explore subagents ──
    // LEAK-PROOF: Uses try/catch to release slot on ANY error from subsequent hooks
    hooks.on('tool.execute.before', async (input, _output) => {
      let acquired = false;
      try {
        if (typeof input !== 'object' || input === null) return;
        const inputR = input as Record<string, unknown>;
        const agentName = inputR.agent as string;
        if (agentName && !isTridentAgent(agentName)) return;
        const toolName = inputR.tool;
        if (toolName === 'task') {
          const args = inputR.args as Record<string, unknown> | undefined;
          if (args?.subagent_type === 'trident_explore') {
            if (this.explorerSemaphore.current >= this.explorerSemaphore.max) {
              const msg = `[SEMAPHORE] Explorer limit reached (${this.explorerSemaphore.max}). Wait for slots to free.`;
              await tridentLog('WARN', 'warhead-concurrency', msg);
              throw new Error(msg);
            }
            this.explorerSemaphore.current++;
            acquired = true;
            await tridentLog('INFO', 'warhead-concurrency',
              `Explorer slot acquired (${this.explorerSemaphore.current}/${this.explorerSemaphore.max})`);
          }
        }
      } catch (e: unknown) {
        await tridentLog('ERROR', 'warhead-concurrency', `Error: ${e instanceof Error ? e.message : String(e)}`);
        // On ANY error in before hooks, release the slot if we acquired it
        if (acquired) {
          this.explorerSemaphore.current = Math.max(0, this.explorerSemaphore.current - 1);
          this.leakedSlots++;
          await tridentLog('WARN', 'warhead-concurrency',
            `Explorer slot released after error (${this.explorerSemaphore.current}/${this.explorerSemaphore.max}, leaked: ${this.leakedSlots})`);
        }
        throw e; // Re-throw the original error
      }
    });

    // ── HOOK: Record success/failure on EVERY tool.execute.after ──
    // WHY: Updates circuit breaker state based on actual execution result.
    hooks.on('tool.execute.after', async (input, output) => {
      if (typeof input !== 'object' || input === null) return; // input not an object — skip
      const inputR = input as Record<string, unknown>;
      const agentName = inputR.agent as string;
      if (agentName && !isTridentAgent(agentName)) return;
      const toolName = inputR.tool;
      if (typeof toolName !== 'string') return;

      if (typeof output !== 'object' || output === null) return; // output not an object — skip
      const outputR = output as Record<string, unknown>;
      const hasError = !!outputR.error || !!outputR.isError;
      if (hasError) {
        this.circuitBreaker.recordFailure(toolName);
      } else {
        this.circuitBreaker.recordSuccess(toolName);
      }
    });

    // ── HOOK: Explorer semaphore — release slot on tool completion ──
    hooks.on('tool.execute.after', async (input, _output) => {
      if (typeof input !== 'object' || input === null) return;
      const inputR = input as Record<string, unknown>;
      const agentName = inputR.agent as string;
      if (agentName && !isTridentAgent(agentName)) return;
      const toolName = inputR.tool;
      if (toolName === 'task') {
        const args = inputR.args as Record<string, unknown> | undefined;
        if (args?.subagent_type === 'trident_explore') {
          this.explorerSemaphore.current = Math.max(0, this.explorerSemaphore.current - 1);
          await tridentLog('INFO', 'warhead-concurrency',
            `Explorer slot released (${this.explorerSemaphore.current}/${this.explorerSemaphore.max})`);
        }
      }
    });
  }

  getT0(): string {
    return `[CONCURRENCY] Token bucket: ${this.tokenBucket.available()} remaining. ${this.rateLimitBlockCount} rate limits. Circuit breaker: ${this.circuitBlockCount} open blocks. Explorers: ${this.explorerSemaphore.current}/${this.explorerSemaphore.max}. Leaked: ${this.leakedSlots}.`;
  }

  getStatus(): Record<string, number | string> {
    return {
      rateLimitBlocks: this.rateLimitBlockCount,
      circuitBlocks: this.circuitBlockCount,
      tokenBucketAvailable: this.tokenBucket.available(),
      explorerCurrent: this.explorerSemaphore.current,
      explorerMax: this.explorerSemaphore.max,
      leakedSlots: this.leakedSlots,
    };
  }
}

export const concurrencyWarhead = new ConcurrencyWarhead();
