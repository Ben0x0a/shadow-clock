/**
 * solveTime.test.ts — round-trip tests of the time solver on synthetic shadows.
 * Depends on: src/core/solveTime.ts, tests/helpers.ts.
 */
import { describe, it } from "node:test";
import { expect } from "./expect.ts";
import { solveTime } from "../src/core/solveTime.ts";
import { ATM, constraintsFor, syntheticShot } from "./helpers.ts";

const LAT = 48.8566;
const LON = 2.3522;
const TRUE_MS = Date.UTC(2025, 3, 15, 10, 0, 0);

// WHY: the "umbra" tip edge shifts the centre by the semi-diameter, so the synthetic
// shadow must be generated to match: add it back to the elevation value.
function shot(sigmaEl: number, sigmaAz: number | null) {
  const s = syntheticShot(TRUE_MS, LAT, LON, sigmaEl, sigmaAz);
  const e = s.shadow.elevation;
  if (e.method === "angle" && e.angle.kind === "gauss") e.angle.value += 0.26667;
  return s;
}

function solve(shots = [shot(0.3, 1)], extra = {}) {
  const r = solveTime({
    shots, site: { lat: LAT, lon: LON, heightM: 0, radiusM: 0 }, atmosphere: ATM,
    constraints: constraintsFor(2025, extra), deltaTOverride: null,
  });
  if (!r.ok) throw new Error(JSON.stringify(r.error));
  return r.result;
}

describe("solveTime", () => {
  it("recovers the true time and its twin date", () => {
    const res = solve();
    const hit = res.clusters.find((c) => c.windows.some((w) => w.startMs <= TRUE_MS && TRUE_MS <= w.endMs));
    expect(hit).toBeDefined();
    const best = hit!.windows.find((w) => w.startMs <= TRUE_MS + 60e3 && TRUE_MS - 60e3 <= w.endMs)!;
    expect(Math.abs(best.bestMs - TRUE_MS)).toBeLessThan(5 * 60e3);
    // The twin: declination recurs around late August.
    const twin = res.clusters.find((c) => new Date(c.bestMs).getUTCMonth() === 7);
    expect(twin).toBeDefined();
    expect(res.clusters.length).toBe(2);
  });

  it("elevation-only gives morning and afternoon solutions", () => {
    const res = solve([shot(0.3, null)]);
    expect(res.clusters.length).toBeGreaterThanOrEqual(2);
    expect(res.clusters.length).toBeLessThanOrEqual(4);
    const hours = new Set(res.clusters.map((c) => new Date(c.bestMs).getUTCHours() < 12));
    expect(hours.size).toBe(2);
  });

  it("a second object in the same photo tightens the windows", () => {
    const one = solve();
    const two = solve([shot(0.3, 1), { ...shot(0.3, 1), id: "b", label: "Shadow 2" }]);
    const width = (r: typeof one) =>
      r.clusters.reduce((a, c) => a + c.windows.reduce((b, w) => b + (w.endMs - w.startMs), 0), 0);
    expect(width(two)).toBeLessThan(width(one));
  });

  it("month constraint removes the twin", () => {
    const months = Array(12).fill(false);
    months[3] = true;
    const res = solve([shot(0.3, 1)], { months });
    expect(res.clusters.length).toBe(1);
  });

  it("interval inputs enclose the truth", () => {
    const s = shot(0.3, 1);
    const e = s.shadow.elevation;
    if (e.method !== "angle" || e.angle.kind !== "gauss") throw new Error("setup");
    s.shadow.elevation = { method: "angle", angle: { kind: "range", min: e.angle.value - 0.5, max: e.angle.value + 0.5 } };
    const a = s.shadow.azimuth!;
    if (a.shadow.kind !== "gauss") throw new Error("setup");
    a.shadow = { kind: "range", min: a.shadow.value - 2, max: a.shadow.value + 2 };
    const res = solve([s]);
    expect(res.clusters.some((c) => c.windows.some((w) => w.startMs <= TRUE_MS && TRUE_MS <= w.endMs))).toBe(true);
  });
});
