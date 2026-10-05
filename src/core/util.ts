/**
 * util.ts — small invariant helpers for the strict TypeScript settings.
 *
 * Defines: at(), last() (checked array access).
 * Used by: core/*.ts and ui/*.ts wherever an index is valid by construction.
 * Depends on: nothing.
 */

/**
 * Element `i` of `arr`, which the caller guarantees to exist (e.g. arrays built with
 * the same length, or an index bounded by the loop).
 * WHY throw: under noUncheckedIndexedAccess an index read may be undefined; when the
 * code's own structure rules that out, a silent `!` would hide a broken invariant,
 * whereas this fails loudly at the point of the bug.
 */
export function at<T>(arr: ArrayLike<T>, i: number): T {
  const v = arr[i];
  if (v === undefined) throw new Error(`Invariant violated: index ${i} outside 0..${arr.length - 1}`);
  return v;
}

/** Last element of a non-empty array (same invariant as at()). */
export function last<T>(arr: ArrayLike<T>): T {
  return at(arr, arr.length - 1);
}
