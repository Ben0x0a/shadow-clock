/**
 * examples.ts — built-in example cases for onboarding.
 *
 * Defines: EXAMPLES (label, description, build()).
 * Used by: main.ts (Examples menu).
 * Depends on: core/spa.ts, core/deltaT.ts, ui/state.ts.
 *
 * HOW: each example starts from a true place and time and generates the shadow
 * measurements from the SPA, rounded to what a real measurement would give. The examples
 * are therefore physically consistent, and the true answer is stated in the description
 * so users can check that the tool recovers it.
 */

import { decimalYear, deltaTSeconds } from "../core/deltaT";
import { sunPosition } from "../core/spa";
import { type AppState, defaultState, newShot, type ShotState } from "./state";

const ATM = { pressureHpa: 1010, temperatureC: 10, refraction: true };

function sunAt(ms: number, lat: number, lon: number) {
  return sunPosition(ms, deltaTSeconds(decimalYear(ms)), lat, lon, 0, ATM, true);
}

const r = (v: number, d: number) => v.toFixed(d);

function lengthsShot(i: number, ms: number, lat: number, lon: number, H: number, sH: number, sL: number, sAz: number | null): ShotState {
  const s = sunAt(ms, lat, lon);
  const L = H / Math.tan((s.elevation * Math.PI) / 180);
  const sh = newShot(i);
  sh.method = "lengths";
  sh.err = "gauss";
  sh.f.h = r(H, 2);
  sh.f.hs = r(sH, 2);
  sh.f.l = r(L, 2);
  sh.f.ls = r(sL, 2);
  sh.tip = "midpoint";
  sh.tilt = "0.5";
  sh.azOn = sAz !== null;
  sh.az = r((s.azimuth + 180) % 360, 1);
  sh.azs = sAz !== null ? r(sAz, 1) : "";
  return sh;
}

export interface Example {
  label: string;
  description: string;
  build(): AppState;
}

export const EXAMPLES: Example[] = [
  {
    label: "Two objects in one photo",
    description: "Paris, 15 Apr 2025 09:20 UTC. A post and a lamp standard in the same picture; the EXIF clock says 11:20 with no offset.",
    build() {
      const lat = 48.8584, lon = 2.2945, ms = Date.UTC(2025, 3, 15, 9, 20);
      const s = defaultState();
      s.site.loc = `${lat}, ${lon}`;
      s.site.radius = "200";
      s.cons.yearFrom = s.cons.yearTo = "2025";
      s.cons.zoneKind = "iana";
      s.cons.zoneValue = "Europe/Paris";
      const a = lengthsShot(0, ms, lat, lon, 1.2, 0.01, 0.02, 2);
      a.label = "Bollard";
      const b = lengthsShot(1, ms, lat, lon, 5.4, 0.05, 0.08, 1.5);
      b.label = "Lamp standard";
      b.relation = "same";
      s.shots = [a, b];
      s.claim.time = "2025:04:15 11:20:00";
      return s;
    },
  },
  {
    label: "Two photos, known time gap",
    description: "Sydney, 10 Dec 2024 01:30 UTC, and a second photo 2 h 15 min later (from the EXIF difference). Near the solstice.",
    build() {
      const lat = -33.8568, lon = 151.2153, ms = Date.UTC(2024, 11, 10, 1, 30);
      const s = defaultState();
      s.site.loc = `${lat}, ${lon}`;
      s.cons.yearFrom = s.cons.yearTo = "2024";
      s.cons.zoneKind = "iana";
      s.cons.zoneValue = "Australia/Sydney";
      const a = lengthsShot(0, ms, lat, lon, 1.8, 0.02, 0.03, 2);
      a.label = "Photo 1 – fence post";
      const b = lengthsShot(1, ms + 8100e3, lat, lon, 1.8, 0.02, 0.03, 2);
      b.label = "Photo 2 – same post";
      b.relation = "other";
      b.offset = "+02:15:00";
      b.offsetSigma = "2 s";
      s.shots = [a, b];
      return s;
    },
  },
  {
    label: "No compass, high latitude",
    description: "Tromsø, 20 Aug 2024 10:00 UTC. Only the ratio of a building's height to its shadow is known, as bounds.",
    build() {
      const lat = 69.6492, lon = 18.9553, ms = Date.UTC(2024, 7, 20, 10, 0);
      const e = sunAt(ms, lat, lon).elevation;
      const ratio = Math.tan((e * Math.PI) / 180);
      const s = defaultState();
      s.site.loc = `${lat}, ${lon}`;
      s.site.radius = "2";
      s.site.radiusUnit = "km";
      s.cons.yearFrom = s.cons.yearTo = "2024";
      const a = newShot(0);
      a.label = "Building";
      a.method = "ratio";
      a.err = "range";
      a.f.rmin = r(ratio * 0.97, 3);
      a.f.rmax = r(ratio * 1.03, 3);
      a.azOn = false;
      a.tip = "unknown";
      s.shots = [a];
      return s;
    },
  },
  {
    label: "Find the place: three photos",
    description: "Athens, 2 Jun 2023 at 06:30, 09:45 and 14:10 UTC. Elevation only — the three rings cross at one place.",
    build() {
      const lat = 37.9715, lon = 23.7257;
      const times = [Date.UTC(2023, 5, 2, 6, 30), Date.UTC(2023, 5, 2, 9, 45), Date.UTC(2023, 5, 2, 14, 10)];
      const s = defaultState();
      s.mode = "place";
      s.shots = times.map((ms, i) => {
        const sh = lengthsShot(i, ms, lat, lon, 2, 0.01, 0.02, null);
        sh.label = `Photo ${i + 1}`;
        const d = new Date(ms);
        sh.time = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")} ${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}:00`;
        sh.timeOffset = "+00:00";
        sh.timeSigma = "30 s";
        return sh;
      });
      return s;
    },
  },
];
