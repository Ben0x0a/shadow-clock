/**
 * core.test.ts — measurement conversion, χ² quantiles, zones and multi-photo time solving.
 * Depends on: src/core/measurement.ts, src/core/stats.ts, src/core/zone.ts,
 *             src/core/solveTime.ts, tests/helpers.ts.
 */
import { describe, it } from "node:test";
import { expect } from "./expect.ts";
import { buildObservation } from "../src/core/measurement.ts";
import type { ShadowInput } from "../src/core/models.ts";
import { solveTime } from "../src/core/solveTime.ts";
import { chi2Quantile } from "../src/core/stats.ts";
import { wallToUtc, zoneOffsetMin } from "../src/core/zone.ts";
import { ATM, constraintsFor, syntheticShot } from "./helpers.ts";

const base: ShadowInput = {
  elevation: { method: "lengths", height: { kind: "gauss", value: 1, sigma: 0.01 }, shadow: { kind: "gauss", value: 1, sigma: 0.01 } },
  tipEdge: "midpoint",
  maxTiltDeg: 0,
  azimuth: null,
};

describe("measurement", () => {
  it("45° with first-order propagation", () => {
    const r = buildObservation(base, false);
    if (!r.ok) throw new Error(JSON.stringify(r.error));
    expect(r.obs.elevation.centre).toBeCloseTo(45, 10);
    // σh = sqrt(L²σH² + H²σL²)/(H²+L²) = sqrt(2)·0.01/2 rad
    const lengths = r.obs.elevationBudget.find((b) => b.label === "budget.lengths")!;
    expect(lengths.amount).toBeCloseTo(((Math.SQRT2 * 0.01) / 2) * (180 / Math.PI), 8);
  });
  it("tip edge shifts the centre by the semi-diameter", () => {
    const umbra = buildObservation({ ...base, tipEdge: "umbra" }, false);
    const outer = buildObservation({ ...base, tipEdge: "outer" }, false);
    if (!umbra.ok || !outer.ok) throw new Error("setup");
    expect(outer.obs.elevation.centre - umbra.obs.elevation.centre).toBeCloseTo(2 * 0.26667, 6);
  });
  it("range lengths give monotonic bounds", () => {
    const r = buildObservation({ ...base, elevation: { method: "lengths", height: { kind: "range", min: 0.9, max: 1.1 }, shadow: { kind: "range", min: 0.9, max: 1.1 } }, tipEdge: "umbra" }, false);
    if (!r.ok || r.obs.elevation.kind !== "range") throw new Error("setup");
    const lo = (Math.atan(0.9 / 1.1) * 180) / Math.PI - 0.26667;
    expect(r.obs.elevation.centre - r.obs.elevation.half).toBeCloseTo(lo, 8);
  });
  it("rejects mixed error types and non-positive values", () => {
    expect(buildObservation({ ...base, elevation: { method: "lengths", height: { kind: "gauss", value: 1, sigma: 0 }, shadow: { kind: "range", min: 1, max: 2 } } }, true).ok).toBe(false);
    expect(buildObservation({ ...base, elevation: { method: "angle", angle: { kind: "gauss", value: -3, sigma: 1 } } }, true).ok).toBe(false);
  });
  it("magnetic declination and 180° flip", () => {
    const r = buildObservation({ ...base, azimuth: { shadow: { kind: "gauss", value: 350, sigma: 1 }, reference: "magnetic", declinationDeg: 15 } }, false);
    if (!r.ok) throw new Error(JSON.stringify(r.error));
    expect(r.obs.azimuth!.centre).toBeCloseTo(185, 10);
  });
});

describe("chi2Quantile", () => {
  it("matches known values", () => {
    expect(chi2Quantile(0.9545, 1)).toBeCloseTo(4.0, 2);
    expect(chi2Quantile(0.9973, 1)).toBeCloseTo(9.0, 1);
    expect(chi2Quantile(0.95, 2)).toBeCloseTo(-2 * Math.log(0.05), 8);
    expect(chi2Quantile(0.95, 4)).toBeCloseTo(9.4877, 3);
  });
});

describe("zones", () => {
  it("IANA offsets follow DST", () => {
    expect(zoneOffsetMin({ kind: "iana", name: "Europe/Paris" }, Date.UTC(2025, 0, 15), 0)).toBe(60);
    expect(zoneOffsetMin({ kind: "iana", name: "Europe/Paris" }, Date.UTC(2025, 6, 15), 0)).toBe(120);
    expect(wallToUtc({ kind: "iana", name: "Europe/Paris" }, Date.UTC(2025, 6, 15, 12), 0)).toBe(Date.UTC(2025, 6, 15, 10));
  });
});

describe("multi-photo time mode", () => {
  it("a second photo with a known offset removes the twin date", () => {
    const LAT = 48.8566, LON = 2.3522, T = Date.UTC(2025, 3, 15, 8, 0);
    const fix = <S extends ReturnType<typeof syntheticShot>>(s: S) => {
      const e = s.shadow.elevation;
      if (e.method === "angle" && e.angle.kind === "gauss") e.angle.value += 0.26667;
      return s;
    };
    const one = [fix(syntheticShot(T, LAT, LON, 0.2, null))];
    const two = [...one, fix(syntheticShot(T + 3 * 3600e3, LAT, LON, 0.2, null, { id: "b", label: "Photo 2", offsetS: 3 * 3600, timeSigmaS: 2 }))];
    const run = (shots: typeof one) => {
      const r = solveTime({ shots, site: { lat: LAT, lon: LON, heightM: 0, radiusM: 0 }, atmosphere: ATM, constraints: constraintsFor(2025), deltaTOverride: null });
      if (!r.ok) throw new Error(JSON.stringify(r.error));
      return r.result;
    };
    const a = run(one);
    const b = run(two);
    // One elevation-only shadow: morning and afternoon solutions over two seasons.
    expect(a.clusters.length).toBeGreaterThanOrEqual(2);
    // Two photos 3 h apart fix the side of noon; the twin date remains (declination recurs).
    expect(b.clusters.every((c) => (c.bestFit.shots[0]?.solarTimeH ?? 99) < 12)).toBe(true);
    expect(b.clusters.some((c) => c.windows.some((w) => w.startMs <= T && T <= w.endMs))).toBe(true);
  });
});
