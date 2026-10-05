/**
 * helpers.ts — builders for synthetic test inputs.
 * Used by: tests/*.test.ts.
 * Depends on: src/core/spa.ts, src/core/deltaT.ts, src/core/models.ts.
 */
import { decimalYear, deltaTSeconds } from "../src/core/deltaT.ts";
import type { Atmosphere, Constraints, Shot } from "../src/core/models.ts";
import { sunPosition } from "../src/core/spa.ts";

export const ATM: Atmosphere = { pressureHpa: 1010, temperatureC: 10, refraction: true };

export function trueSun(ms: number, lat: number, lon: number) {
  return sunPosition(ms, deltaTSeconds(decimalYear(ms)), lat, lon, 0, ATM, true);
}

/** A shot whose shadow is generated from the true Sun (angle form, midpoint tip, no tilt). */
export function syntheticShot(
  ms: number, lat: number, lon: number, sigmaEl: number, sigmaAz: number | null,
  extra: Partial<Shot> = {},
): Shot {
  const s = trueSun(ms, lat, lon);
  return {
    id: extra.id ?? "a",
    label: extra.label ?? "Shadow 1",
    offsetS: extra.offsetS ?? 0,
    timeMs: extra.timeMs ?? ms,
    timeSigmaS: extra.timeSigmaS ?? 0,
    shadow: {
      elevation: { method: "angle", angle: { kind: "gauss", value: s.elevation, sigma: sigmaEl } },
      tipEdge: "umbra",
      maxTiltDeg: 0,
      azimuth: sigmaAz === null ? null : {
        shadow: { kind: "gauss", value: (s.azimuth + 180) % 360, sigma: sigmaAz },
        reference: "true",
        declinationDeg: 0,
      },
    },
  };
}

export function constraintsFor(year: number, extra: Partial<Constraints> = {}): Constraints {
  return {
    yearFrom: year, yearTo: year, months: Array(12).fill(true), todFromMin: null, todToMin: null,
    notBeforeMs: null, notAfterMs: null, zone: { kind: "utc" }, ...extra,
  };
}
