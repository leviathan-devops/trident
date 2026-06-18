import { TokenBucket } from './token-bucket.js';
import { CircuitBreaker } from './circuit-breaker.js';
import { tridentLog } from '../../utils.js';

export { TokenBucket, CircuitBreaker };

export class ConcurrencyManager {
  public tokenBucket: TokenBucket;
  public circuitBreaker: CircuitBreaker;
  private refillInterval: ReturnType<typeof setInterval> | null = null;

  constructor(capacity: number = 60, refillRate: number = 10, refillIntervalMs: number = 1000) {
    this.tokenBucket = new TokenBucket(capacity, refillRate);
    this.circuitBreaker = new CircuitBreaker(5, 60000);
    this.startRefill(refillIntervalMs);
    tridentLog('INFO', 'concurrency', `ConcurrencyManager started: capacity=${capacity}, refill=${refillRate}/s`);
  }

  private startRefill(intervalMs: number): void {
    if (this.refillInterval) clearInterval(this.refillInterval);
    this.refillInterval = setInterval(() => {
      this.tokenBucket.refill();
    }, intervalMs);
    // Allow the interval to not block process exit
    if (this.refillInterval && typeof this.refillInterval === 'object' && 'unref' in this.refillInterval) {
      (this.refillInterval as any).unref();
    }
  }

  /** Check if a tool call should be allowed (rate limit + circuit breaker) */
  allowTool(toolName: string): { allowed: boolean; reason?: string } {
    // Check circuit breaker first
    if (this.circuitBreaker.isOpen()) {
      const retryAfter = this.circuitBreaker.retryAfter();
      return { allowed: false, reason: `Circuit breaker OPEN — retry after ${retryAfter}ms` };
    }

    // Check token bucket
    if (!this.tokenBucket.acquire()) {
      this.circuitBreaker.recordFailure();
      return { allowed: false, reason: 'Rate limit exceeded — token bucket empty' };
    }

    this.tokenBucket.consume();
    return { allowed: true };
  }

  /** Record a successful tool call */
  recordSuccess(toolName: string): void {
    this.circuitBreaker.recordSuccess();
    tridentLog('DEBUG', 'concurrency', `Tool ${toolName} succeeded — circuit breaker reset`);
  }

  /** Record a failed tool call */
  recordFailure(toolName: string): void {
    this.circuitBreaker.recordFailure();
    tridentLog('WARN', 'concurrency', `Tool ${toolName} failed — circuit breaker recorded failure`);
  }

  /** Get status snapshot */
  getStatus(): { tokenBucket: { tokens: number; capacity: number }; circuitBreaker: { state: string; failures: number; retryAfter: number } } {
    return {
      tokenBucket: {
        tokens: this.tokenBucket['tokens'],
        capacity: this.tokenBucket['capacity'],
      },
      circuitBreaker: {
        state: this.circuitBreaker['state'],
        failures: this.circuitBreaker['failureCount'],
        retryAfter: this.circuitBreaker.retryAfter(),
      },
    };
  }

  stop(): void {
    if (this.refillInterval) {
      clearInterval(this.refillInterval);
      this.refillInterval = null;
    }
    tridentLog('INFO', 'concurrency', 'ConcurrencyManager stopped');
  }
}
