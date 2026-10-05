/**
 * examples.ts — built-in example cases for onboarding.
 *
 * Defines: EXAMPLES (label, description, build()).
 * Used by: features/examples (Examples menu), tests.
 * Depends on: core/spa.ts, core/deltaT.ts, core/form.ts.
 *
 * HOW: each example starts from a true place and time and generates the shadow
 * measurements from the SPA, rounded to what a real measurement would give. The examples
 * are therefore physically consistent, and the true answer is stated in the description
 * so users can check that the tool recovers it.
 */

import { decimalYear, deltaTSeconds } from "./deltaT.ts";
import { type AppState, defaultState, newShot, type ShotState } from "./form.ts";
import { sunPosition } from "./spa.ts";

/** The UI's translation function, passed in (the core has no string table). */
export type Translate = (key: string, vars?: Record<string, string | number>) => string;

const ATM = { pressureHpa: 1010, temperatureC: 10, refraction: true };

function sunAt(ms: number, lat: number, lon: number) {
  return sunPosition(ms, deltaTSeconds(decimalYear(ms)), lat, lon, 0, ATM, true);
}

const r = (v: number, d: number) => v.toFixed(d);

/** Tolerances tH, tL, tAz are the operator-declared maximum errors (hard bounds). */
function lengthsShot(t: Translate, i: number, ms: number, lat: number, lon: number, H: number, tH: number, tL: number, tAz: number | null): ShotState {
  const s = sunAt(ms, lat, lon);
  const L = H / Math.tan((s.elevation * Math.PI) / 180);
  const sh = newShot(t("shot.default", { n: i + 1 }));
  sh.method = "lengths";
  sh.f.h = r(H, 2);
  sh.f.ht = r(tH, 2);
  sh.f.l = r(L, 2);
  sh.f.lt = r(tL, 2);
  sh.tip = "midpoint";
  sh.tilt = "0.5";
  sh.azOn = tAz !== null;
  sh.az = tAz !== null ? r((s.azimuth + 180) % 360, 1) : "";
  sh.azt = tAz !== null ? r(tAz, 1) : "";
  return sh;
}

export interface Example {
  /** String-table keys (strings.ts). */
  label: string;
  description: string;
  build(t: Translate): AppState;
}

export const EXAMPLES: Example[] = [
  {
    label: "ex.paris",
    description: "ex.parisDesc",
    build(t) {
      const lat = 48.8584, lon = 2.2945, ms = Date.UTC(2025, 3, 15, 9, 20);
      const s = defaultState(t("shot.default", { n: 1 }));
      s.site.loc = `${lat}, ${lon}`;
      s.site.radius = "200";
      s.cons.yearFrom = s.cons.yearTo = "2025";
      s.cons.zoneKind = "iana";
      s.cons.zoneValue = "Europe/Paris";
      const a = lengthsShot(t, 0, ms, lat, lon, 1.2, 0.02, 0.04, 4);
      a.label = t("ex.bollard");
      const b = lengthsShot(t, 1, ms, lat, lon, 5.4, 0.1, 0.16, 3);
      b.label = t("ex.lamp");
      b.relation = "same";
      s.shots = [a, b];
      s.claim.time = "2025:04:15 11:20:00";
      return s;
    },
  },
  {
    label: "ex.sydney",
    description: "ex.sydneyDesc",
    build(t) {
      const lat = -33.8568, lon = 151.2153, ms = Date.UTC(2024, 11, 10, 1, 30);
      const s = defaultState(t("shot.default", { n: 1 }));
      s.site.loc = `${lat}, ${lon}`;
      s.cons.yearFrom = s.cons.yearTo = "2024";
      s.cons.zoneKind = "iana";
      s.cons.zoneValue = "Australia/Sydney";
      const a = lengthsShot(t, 0, ms, lat, lon, 1.8, 0.04, 0.06, 4);
      a.label = t("ex.post1");
      const b = lengthsShot(t, 1, ms + 8100e3, lat, lon, 1.8, 0.04, 0.06, 4);
      b.label = t("ex.post2");
      b.relation = "other";
      b.offset = "+02:15:00";
      b.offsetTol = "2 s";
      s.shots = [a, b];
      return s;
    },
  },
  {
    label: "ex.tromso",
    description: "ex.tromsoDesc",
    build(t) {
      const lat = 69.6492, lon = 18.9553, ms = Date.UTC(2024, 7, 20, 10, 0);
      const e = sunAt(ms, lat, lon).elevation;
      const ratio = Math.tan((e * Math.PI) / 180);
      const s = defaultState(t("shot.default", { n: 1 }));
      s.site.loc = `${lat}, ${lon}`;
      s.site.radius = "2";
      s.site.radiusUnit = "km";
      s.cons.yearFrom = s.cons.yearTo = "2024";
      const a = newShot(t("ex.building"));
      a.label = t("ex.building");
      a.method = "ratio";
      a.f.r = r(ratio, 3);
      a.f.rt = r(ratio * 0.03, 3);
      a.azOn = false;
      a.tip = "unknown";
      s.shots = [a];
      return s;
    },
  },
  {
    label: "ex.athens",
    description: "ex.athensDesc",
    build(t) {
      const lat = 37.9715, lon = 23.7257;
      const times = [Date.UTC(2023, 5, 2, 6, 30), Date.UTC(2023, 5, 2, 9, 45), Date.UTC(2023, 5, 2, 14, 10)];
      const s = defaultState(t("shot.default", { n: 1 }));
      s.mode = "place";
      s.shots = times.map((ms, i) => {
        const sh = lengthsShot(t, i, ms, lat, lon, 2, 0.02, 0.04, null);
        sh.label = t("shot.photo", { n: i + 1 });
        const d = new Date(ms);
        sh.time = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")} ${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}:00`;
        sh.timeOffset = "+00:00";
        sh.timeTol = "30 s";
        return sh;
      });
      return s;
    },
  },
];
