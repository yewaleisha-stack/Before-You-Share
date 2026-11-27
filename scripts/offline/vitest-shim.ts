// Offline stand-in for the subset of the Vitest API our tests use, built on node:test.
// Used only by scripts/offline/run-tests.mjs when vitest can't be installed.
import { describe as d, it as i } from 'node:test';
import assert from 'node:assert/strict';
export const describe = d;
export const it = i;
type M = { toBe(v: unknown): void; toEqual(v: unknown): void; toContain(v: string): void };
export function expect(actual: unknown): M & { not: M } {
  const m: M = {
    toBe: (v) => assert.strictEqual(actual, v),
    toEqual: (v) => assert.deepStrictEqual(actual, v),
    toContain: (v) => assert.ok(String(actual).includes(v), `expected to contain ${v}`),
  };
  const not: M = {
    toBe: (v) => assert.notStrictEqual(actual, v),
    toEqual: (v) => assert.notDeepStrictEqual(actual, v),
    toContain: (v) => assert.ok(!String(actual).includes(v), `expected not to contain ${v}`),
  };
  return { ...m, not };
}
