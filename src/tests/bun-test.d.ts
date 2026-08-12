// The bun test runtime module types. The project ships NO bun-types package
// (the tsconfig's types:["node"] does not include the bun runtime), so this
// local ambient declaration types the bun:test surface the test suites import.
// A global script by construction (no top-level imports/exports) — the
// `declare module` here declares a NEW ambient module rather than augmenting.
// The matcher surface covers the full common expect() set so EVERY suite in
// the project that imports bun:test typechecks against this single shim.
declare module 'bun:test' {
  export interface BunExpect<T> {
    toBe(expected: unknown): void;
    toEqual(expected: unknown): void;
    toContain(expected: unknown): void;
    toMatch(expected: RegExp | string): void;
    toBeLessThan(expected: number): void;
    toBeGreaterThan(expected: number): void;
    toBeLessThanOrEqual(expected: number): void;
    toBeGreaterThanOrEqual(expected: number): void;
    toBeTruthy(): void;
    toBeFalsy(): void;
    toBeNull(): void;
    toBeDefined(): void;
    toBeUndefined(): void;
    toBeNaN(): void;
    toBeCloseTo(expected: number, numDigits?: number): void;
    toBeTypeOf(expected: string): void;
    toHaveLength(expected: number): void;
    toHaveProperty(key: string, value?: unknown): void;
    toBeInstanceOf(expected: unknown): void;
    toThrow(expected?: unknown): void;
    toSatisfy(predicate: (value: T) => boolean): void;
    not: {
      toBe(expected: unknown): void;
      toEqual(expected: unknown): void;
      toContain(expected: unknown): void;
      toMatch(expected: RegExp | string): void;
      toBeNull(): void;
      toBeDefined(): void;
      toBeUndefined(): void;
      toBeTruthy(): void;
      toBeFalsy(): void;
      toHaveLength(expected: number): void;
    };
  }
  export function expect<T>(actual: T): BunExpect<T>;
  export function test(name: string, fn: () => void | Promise<void>): void;
  export function describe(name: string, fn: () => void): void;
}
