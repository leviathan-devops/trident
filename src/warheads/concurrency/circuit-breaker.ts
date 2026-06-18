import { tridentLog } from '../../utils.js';

type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export class CircuitBreaker {
  private state: CircuitState = 'CLOSED';
  public failureCount: number = 0;
  private readonly threshold: number;
  private readonly windowMs: number;
  private lastFailureTime: number = 0;
  private lastOpenTime: number = 0;
  private successCount: number = 0;

  constructor(threshold: number = 5, windowMs: number = 60000) {
    this.threshold = threshold;
    this.windowMs = windowMs;
  }

  /** Check if circuit is open (blocking requests) */
  isOpen(): boolean {
    if (this.state === 'CLOSED') return false;
    if (this.state === 'OPEN') {
      // Check if enough time has passed to try half-open
      const elapsed = Date.now() - this.lastOpenTime;
      if (elapsed >= this.windowMs) {
        this.state = 'HALF_OPEN';
        tridentLog('INFO', 'circuit-breaker', `State: OPEN → HALF_OPEN (${elapsed}ms elapsed)`);
        return false; // Allow probe request
      }
      return true;
    }
    // HALF_OPEN — allow probe request
    return false;
  }

  /** Record a success (resets circuit) */
  recordSuccess(): void {
    if (this.state === 'HALF_OPEN') {
      this.state = 'CLOSED';
      this.failureCount = 0;
      tridentLog('INFO', 'circuit-breaker', 'State: HALF_OPEN → CLOSED (probe succeeded)');
    } else if (this.state === 'CLOSED') {
      // Slowly decay failure count
      this.failureCount = Math.max(0, this.failureCount - 1);
    }
  }

  /** Record a failure */
  recordFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.state === 'HALF_OPEN') {
      this.state = 'OPEN';
      this.lastOpenTime = Date.now();
      tridentLog('WARN', 'circuit-breaker', `State: HALF_OPEN → OPEN (probe failed, ${this.failureCount}/${this.threshold})`);
    } else if (this.state === 'CLOSED' && this.failureCount >= this.threshold) {
      this.state = 'OPEN';
      this.lastOpenTime = Date.now();
      tridentLog('WARN', 'circuit-breaker', `State: CLOSED → OPEN (${this.failureCount}/${this.threshold} failures)`);
    }
  }

  /** Get retry-after duration in ms */
  retryAfter(): number {
    if (this.state === 'OPEN') {
      const elapsed = Date.now() - this.lastOpenTime;
      return Math.max(0, this.windowMs - elapsed);
    }
    return 0;
  }

  /** Get current state */
  getState(): CircuitState { return this.state; }
}
