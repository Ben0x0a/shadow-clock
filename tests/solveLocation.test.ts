/**
 * solveLocation.test.ts — round-trip tests of the location solver and the claim checker.
 * Depends on: src/core/solveLocation.ts, src/core/claimCheck.ts, tests/helpers.ts.
 */
import { describe, it } from "node:test";
import { expect } from "./expect.ts";
import { checkClaim } from "../src/core/claimCheck.ts";
import { solveLocation } from "../src/core/solveLocation.ts";
import { ATM, syntheticShot } from "./helpers.ts";

const LAT = -33.8568;
const LON = 151.2153;
const T1 = Date.UTC(2024, 10, 3, 1, 30);
const T2 = Date.UTC(2024, 10, 3, 5, 10);

function fixUmbra<T extends ReturnType<typeof syntheticShot>>(s: T): T {
  const e = s.shadow.elevation;
  if (e.method === "angle" && e.angle.kind === "gauss") e.angle.value += 0.26667;
  return s;
}

function inside(res: { cells: { lat: number; lon: number; size: number }[] }) {
  return res.cells.some((c) => Math.abs(c.lat - LAT) <= c.size && Math.abs(c.lon - LON) <= c.size);
}

describe("solveLocation", () => {
  it("crosses two elevation-only shadows at different times", () => {
    const shots = [
      fixUmbra(syntheticShot(T1, LAT, LON, 0.3, null)),
      fixUmbra(syntheticShot(T2, LAT, LON, 0.3, null, { id: "b", label: "Shadow 2" })),
    ];
    const r = solveLocation({ shots, atmosphere: ATM, bounds: null, heightM: 0, deltaTOverride: null });
    if (!r.ok) throw new Error(JSON.stringify(r.error));
    expect(inside(r.result)).toBe(true);
    // Two circles cross in at most two places.
    expect(r.result.regions.length).toBeLessThanOrEqual(2);
  });

  it("single shadow with azimuth gives one region around the truth", () => {
    const shots = [fixUmbra(syntheticShot(T1, LAT, LON, 0.3, 1))];
    const r = solveLocation({ shots, atmosphere: ATM, bounds: null, heightM: 0, deltaTOverride: null });
    if (!r.ok) throw new Error(JSON.stringify(r.error));
    expect(inside(r.result)).toBe(true);
    expect(r.result.regions.length).toBe(1);
  });
});

describe("checkClaim", () => {
  it("accepts the true offset and rejects distant ones", () => {
    const shots = [fixUmbra(syntheticShot(T1, LAT, LON, 0.3, 1))];
    const wall = T1 + 11 * 3_600_000; // Sydney summer time, UTC+11
    const r = checkClaim({
      shots, site: { lat: LAT, lon: LON, heightM: 0, radiusM: 0 }, atmosphere: ATM,
      deltaTOverride: null, wallClockMs: wall, offsetMin: null,
    });
    if (!r.ok) throw new Error(JSON.stringify(r.error));
    const ok = r.result.results.filter((x) => x.acceptedLevel !== null).map((x) => x.offsetMin);
    expect(ok).toContain(660);
    expect(ok.every((m) => Math.abs(m - 660) <= 30)).toBe(true);
  });
});
