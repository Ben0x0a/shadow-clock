/**
 * expect.ts — the few Vitest-style matchers these tests use, on top of node:assert.
 *
 * Defines: expect().
 * Used by: tests/*.test.ts.
 * Depends on: node:assert.
 *
 * WHY: the tests were written for Vitest; the static-web-app layout runs them with
 * Node's own test runner. Keeping the matcher calls keeps the assertions readable and
 * unchanged. toBeCloseTo follows Vitest: |actual − expected| < 10^−digits / 2.
 */

import assert from "node:assert/strict";

export function expect<T>(actual: T) {
  const num = () => {
    assert.equal(typeof actual, "number", `expected a number, got ${typeof actual}`);
    return actual as unknown as number;
  };
  return {
    toBe: (expected: T) => assert.equal(actual, expected),
    toEqual: (expected: unknown) => assert.deepEqual(actual, expected),
    toBeNull: () => assert.equal(actual, null),
    toBeDefined: () => assert.notEqual(actual, undefined),
    toContain: (item: unknown) => assert.ok((actual as unknown as unknown[] | string).includes(item as never), `expected to contain ${String(item)}`),
    toBeCloseTo: (expected: number, digits = 2) => {
      const a = num();
      assert.ok(Math.abs(a - expected) < 10 ** -digits / 2, `expected ${a} to be close to ${expected} (${digits} digits)`);
    },
    toBeLessThan: (n: number) => assert.ok(num() < n, `expected ${String(actual)} < ${n}`),
    toBeLessThanOrEqual: (n: number) => assert.ok(num() <= n, `expected ${String(actual)} <= ${n}`),
    toBeGreaterThanOrEqual: (n: number) => assert.ok(num() >= n, `expected ${String(actual)} >= ${n}`),
    not: {
      toBeNull: () => assert.notEqual(actual, null),
    },
  };
}
