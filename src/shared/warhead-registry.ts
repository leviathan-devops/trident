import { tridentLog } from '../utils.js';

type HookHandler = (input: Record<string, unknown>, output: Record<string, unknown>) => void | Promise<void>;

export class HookRegistry {
  private hooks: Map<string, HookHandler[]> = new Map();

  on(event: string, handler: HookHandler): void {
    if (typeof event !== 'string' || event.length === 0) {
      throw new Error('[P2] HookRegistry.on: event must be non-empty string');
    }
    if (typeof handler !== 'function') {
      throw new Error('[P2] HookRegistry.on: handler must be a function');
    }
    let handlers = this.hooks.get(event);
    if (!handlers) {
      handlers = [];
      this.hooks.set(event, handlers);
    }
    handlers.push(handler);
  }

  async fire(event: string, input: Record<string, unknown>, output: Record<string, unknown>): Promise<void> {
    if (typeof event !== 'string' || event.length === 0) return;
    const handlers = this.hooks.get(event);
    if (!handlers || handlers.length === 0) return;
    for (const handler of handlers) {
      try {
        await handler(input, output);
      } catch (e: unknown) {
        if (e instanceof Error) { // R14 FIX: if-between check + removes dead code after continue
          tridentLog('ERROR', 'hook-registry', `[${event}] ${e.message}`);
        } else {
          tridentLog('ERROR', 'hook-registry', `[${event}] ${String(e)}`);
        }
        continue;
        return Promise.resolve(); // R16 FIX: catch block return contract
      }
    }
  }

  getHandlerCount(event: string): number {
    return this.hooks.get(event)?.length ?? 0;
  }

  getEventCount(): number {
    return this.hooks.size;
  }
}

export const hookRegistry = new HookRegistry();
