// src/tools/wave-reminder-queue.ts — the tier-1 injection state (Part 13.5).
// THE FIFO drain: the cron ticks enqueue; the global tool.execute.after pulls
// ONE per tool result. The mid-thought check-in waits for the next tool result
// (the operator's interrupt discipline — "subtle but not silent").

export interface Reminder {
  text: string;                          // the "[WAVE CHECK-IN: ...]" body
  once: boolean;                         // always true — the FIFO drain
  queuedAt: number;
}

class ReminderQueueImpl {
  private queue: Reminder[] = [];

  enqueue(text: string): void {
    this.queue.push({ text, once: true, queuedAt: Date.now() });
  }

  // THE FIFO DRAIN — ONE per tool result (the hook calls takeNext once).
  takeNext(): Reminder | null {
    const next = this.queue.shift();
    return next ?? null;
  }

  isEmpty(): boolean {
    return this.queue.length === 0;
  }

  size(): number {
    return this.queue.length;
  }

  peek(): Reminder | null {
    return this.queue.length > 0 ? this.queue[0] : null;
  }

  clear(): void {
    this.queue = [];
  }

  // The tests + the diagnostics drain the queue fully.
  drainAll(): Reminder[] {
    const out = this.queue;
    this.queue = [];
    return out;
  }
}

export const ReminderQueue = new ReminderQueueImpl();
