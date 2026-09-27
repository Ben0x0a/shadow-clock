/**
 * ephemeris.ts — fast geocentric Sun by interpolating exact SPA values.
 *
 * Defines: Ephemeris (cached, interpolated geocentricSun).
 * Used by: core/solveTime.ts, core/solveLocation.ts, core/claimCheck.ts.
 * Depends on: core/spa.ts, core/deltaT.ts.
 *
 * HOW: exact SPA geocentric values are computed at whole-hour nodes and cached. A request
 * between two nodes is linearly interpolated in right ascension, declination and
 * parallax. Sidereal time is split into its exact linear part (Earth rotation, evaluated
 * directly) plus a slowly varying remainder (nutation, the quadratic terms), which is
 * interpolated.
 * WHY: the geocentric step dominates the cost (≈ 300 trigonometric terms) but varies
 * smoothly: over one hour the Sun moves about 0.04° in right ascension with negligible
 * curvature, and the fastest nutation term has a period of several days, so linear
 * interpolation errors stay below 1e-5° (checked in tests/spa.test.ts). That is far
 * below the SPA's own ±0.0003°, and it speeds up the solvers by roughly 10×.
 */

import { decimalYear, deltaTSeconds } from "./deltaT";
import { angleDiff, type GeocentricSun, geocentricSun, julianDay, norm360 } from "./spa";

const NODE_MS = 3_600_000;
const ROT_DEG_PER_DAY = 360.98564736629;

function rotation(ms: number): number {
  return norm360(ROT_DEG_PER_DAY * (julianDay(ms) - 2451545));
}

interface Node {
  alpha: number;
  delta: number;
  xi: number;
  /** nu minus the linear Earth-rotation term, degrees. */
  nuRest: number;
}

export class Ephemeris {
  private readonly nodes = new Map<number, Node>();
  exactEvaluations = 0;

  constructor(private readonly deltaTOverride: number | null) {}

  private node(k: number): Node {
    const hit = this.nodes.get(k);
    if (hit) return hit;
    const ms = k * NODE_MS;
    const dT = this.deltaTOverride ?? deltaTSeconds(decimalYear(ms));
    const g = geocentricSun(ms, dT);
    this.exactEvaluations++;
    const n = { alpha: g.alpha, delta: g.delta, xi: g.xi, nuRest: angleDiff(g.nu, rotation(ms)) };
    // WHY: bound memory; a 30-year solve touches ~260 000 nodes, well inside this limit.
    if (this.nodes.size > 600_000) this.nodes.clear();
    this.nodes.set(k, n);
    return n;
  }

  at(ms: number): GeocentricSun {
    const k = Math.floor(ms / NODE_MS);
    const f = (ms - k * NODE_MS) / NODE_MS;
    const a = this.node(k);
    const b = this.node(k + 1);
    return {
      alpha: norm360(a.alpha + f * angleDiff(b.alpha, a.alpha)),
      delta: a.delta + f * (b.delta - a.delta),
      xi: a.xi + f * (b.xi - a.xi),
      nu: norm360(rotation(ms) + a.nuRest + f * angleDiff(b.nuRest, a.nuRest)),
    };
  }
}
