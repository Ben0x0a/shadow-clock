/**
 * spa.test.ts — checks the SPA port against the reference example of NREL/TP-560-34302
 * (Table A5.1: 17 Oct 2003 12:30:30 MST, Golden CO).
 * Depends on: src/core/spa.ts.
 */
import { describe, expect, it } from "vitest";
import { geocentricSun, julianDay, topocentricSun } from "../src/core/spa";

const MS = Date.UTC(2003, 9, 17, 19, 30, 30); // 12:30:30 at UTC−7
const ATM = { pressureHpa: 820, temperatureC: 11, refraction: true };

describe("NREL SPA reference example", () => {
  it("Julian day", () => {
    expect(julianDay(MS)).toBeCloseTo(2452930.312847, 6);
  });
  it("geocentric right ascension and declination", () => {
    const g = geocentricSun(MS, 67);
    expect(g.alpha).toBeCloseTo(202.22741, 4);
    expect(g.delta).toBeCloseTo(-9.31434, 4);
  });
  it("topocentric zenith and azimuth", () => {
    const t = topocentricSun(geocentricSun(MS, 67), 39.742476, -105.1786, 1830.14, ATM, true);
    expect(90 - t.elevation).toBeCloseTo(50.11162, 4);
    expect(t.azimuth).toBeCloseTo(194.34024, 4);
  });
});

describe("interpolated ephemeris", () => {
  it("matches exact SPA within 1e-5°", async () => {
    const { Ephemeris } = await import("../src/core/ephemeris");
    const { angleDiff } = await import("../src/core/spa");
    const { deltaTSeconds, decimalYear } = await import("../src/core/deltaT");
    const e = new Ephemeris(null);
    let worst = 0;
    for (let i = 0; i < 2000; i++) {
      const ms = Date.UTC(2024, 0, 1) + i * 15_778_463; // ~ every 4.4 h over a year
      const a = e.at(ms);
      const b = geocentricSun(ms, deltaTSeconds(decimalYear(ms)));
      worst = Math.max(worst, Math.abs(angleDiff(a.alpha, b.alpha)), Math.abs(a.delta - b.delta), Math.abs(angleDiff(a.nu, b.nu)));
    }
    expect(worst).toBeLessThan(1e-5);
  });
});
