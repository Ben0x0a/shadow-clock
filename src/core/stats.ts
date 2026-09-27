/**
 * stats.ts — χ² distribution helpers.
 *
 * Defines: chi2Cdf(), chi2Quantile() (with a cache for the few levels used).
 * Used by: core/score.ts, core/solveTime.ts, core/claimCheck.ts, tests/stats.test.ts.
 * Depends on: nothing.
 *
 * HOW: the χ² CDF with k degrees of freedom is the regularised lower incomplete gamma
 * function P(k/2, x/2). It is evaluated by its power series (x < a + 1) or its continued
 * fraction (otherwise), as in Numerical Recipes §6.2; the quantile is found by bisection.
 * WHY: several shots give up to 6 degrees of freedom, so fixed tables for 1 and 2 would
 * not do; bisection on a monotonic CDF is simple and exact to machine precision.
 */

function lnGamma(z: number): number {
  // Lanczos approximation (g = 7, n = 9), relative accuracy ~1e-15.
  const c = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
    -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6,
    1.5056327351493116e-7,
  ];
  if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - lnGamma(1 - z);
  const x = z - 1;
  let a = c[0];
  const t = x + 7.5;
  for (let i = 1; i < 9; i++) a += c[i] / (x + i);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

function gammaP(a: number, x: number): number {
  if (x <= 0) return 0;
  const gln = lnGamma(a);
  if (x < a + 1) {
    let sum = 1 / a;
    let del = sum;
    let ap = a;
    for (let n = 0; n < 500; n++) {
      ap += 1;
      del *= x / ap;
      sum += del;
      if (Math.abs(del) < Math.abs(sum) * 1e-15) break;
    }
    return sum * Math.exp(-x + a * Math.log(x) - gln);
  }
  // Continued fraction for Q(a, x) (modified Lentz).
  const tiny = 1e-300;
  let b = x + 1 - a;
  let c = 1 / tiny;
  let d = 1 / b;
  let h = d;
  for (let i = 1; i < 500; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < tiny) d = tiny;
    c = b + an / c;
    if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-15) break;
  }
  return 1 - Math.exp(-x + a * Math.log(x) - gln) * h;
}

export function chi2Cdf(x: number, k: number): number {
  return gammaP(k / 2, x / 2);
}

const cache = new Map<string, number>();

/** x such that P(χ²_k ≤ x) = p. Returns 0 for k = 0 (no Gaussian components). */
export function chi2Quantile(p: number, k: number): number {
  if (k <= 0) return 0;
  const key = `${p}|${k}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  let lo = 0;
  let hi = 10 * k + 100;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (chi2Cdf(mid, k) < p) lo = mid;
    else hi = mid;
  }
  const x = (lo + hi) / 2;
  cache.set(key, x);
  return x;
}
