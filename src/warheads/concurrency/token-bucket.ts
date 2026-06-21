import { tridentLog } from '../../utils.js';

export class TokenBucket {
  public tokens: number;
  public readonly capacity: number;
  private readonly refillRate: number;

  constructor(capacity: number = 60, refillRate: number = 10) {
    this.capacity = capacity;
    this.refillRate = refillRate;
    this.tokens = capacity;
  }

  /** Try to acquire a token (non-blocking). Returns true if token available. */
  acquire(): boolean {
    return this.tokens > 0;
  }

  /** Consume one token. Call only after acquire() returns true. */
  consume(): void {
    if (this.tokens > 0) {
      this.tokens--;
    }
  }

  /** Refill tokens (called by setInterval). Adds refillRate tokens up to capacity. */
  refill(): void {
    const before = this.tokens;
    this.tokens = Math.min(this.capacity, this.tokens + this.refillRate);
    if (before !== this.tokens) {
      tridentLog('DEBUG', 'token-bucket', `Refilled: ${before} → ${this.tokens}/${this.capacity}`);
    }
  }

  /** Get current token count */
  getTokens(): number { return this.tokens; }
}
