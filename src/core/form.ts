/**
 * form.ts — the case as typed (form text), its defaults and its validation.
 *
 * Defines: AppState / ShotState types, MAX_SHOTS, defaultState(), newShot(), parseCase().
 * Used by: state/case.ts, core/request.ts, core/examples.ts, features/*.
 * Depends on: core/models.ts (TipEdge).
 *
 * Uncertainty model: every measurement is "value ± tolerance", where the tolerance is
 * declared by the operator and treated as a hard bound (the true value is certainly
 * inside). An empty tolerance is an error, never a silent zero.
 *
 * WHY: the state keeps the raw strings the user typed rather than parsed numbers, so a
 * restored or shared case shows exactly what was entered (units, DMS, EXIF text), and
 * parsing happens in one place (core/request.ts). Labels are passed in already
 * translated: the core has no string table.
 */

import type { TipEdge } from "./models.ts";

export type Mode = "time" | "place";
export type ElevMethod = "lengths" | "ratio" | "angle";

export interface ShotState {
  id: string;
  label: string;
  /** Time mode, shots 2+: another object in the same photo, or another photo. */
  relation: "same" | "other";
  offset: string;
  offsetTol: string;
  /** Place mode: date and time of this shot, and its UTC offset. */
  time: string;
  timeOffset: string;
  timeTol: string;
  method: ElevMethod;
  /** Elevation fields: value and declared tolerance — h/ht, l/lt, r/rt, a/at. */
  f: Record<string, string>;
  tip: TipEdge;
  tilt: string;
  azOn: boolean;
  az: string;
  /** Declared tolerance of the shadow direction, degrees. */
  azt: string;
  azRef: "true" | "magnetic";
  decl: string;
}

export interface AppState {
  v: 1;
  mode: Mode;
  site: { loc: string; radius: string; radiusUnit: "m" | "km"; height: string };
  shots: ShotState[];
  cons: {
    yearFrom: string;
    yearTo: string;
    zoneKind: "utc" | "offset" | "iana" | "solar";
    zoneValue: string;
    months: boolean[];
    todFrom: string;
    todTo: string;
    notBefore: string;
    notAfter: string;
  };
  adv: { pressure: string; temp: string; refraction: boolean; deltaT: string };
  claim: { time: string; offset: string };
  search: { kind: "world" | "bbox"; bbox: string };
}

export const MAX_SHOTS = 4;

let shotCounter = 0;
/** `label` is the shot's display name, already translated by the caller. */
export function newShot(label: string): ShotState {
  return {
    id: `s${Date.now().toString(36)}${(shotCounter++).toString(36)}`,
    label,
    relation: "same",
    offset: "",
    offsetTol: "",
    time: "",
    timeOffset: "+00:00",
    timeTol: "",
    method: "lengths",
    f: { h: "", ht: "", l: "", lt: "", r: "", rt: "", a: "", at: "" },
    tip: "unknown",
    tilt: "1",
    azOn: true,
    az: "",
    azt: "",
    azRef: "true",
    decl: "0",
  };
}

export function defaultState(firstShotLabel: string): AppState {
  const y = String(new Date().getUTCFullYear());
  return {
    v: 1,
    mode: "time",
    site: { loc: "", radius: "100", radiusUnit: "m", height: "0" },
    shots: [newShot(firstShotLabel)],
    cons: {
      yearFrom: y,
      yearTo: y,
      zoneKind: "utc",
      zoneValue: "",
      months: Array(12).fill(true),
      todFrom: "",
      todTo: "",
      notBefore: "",
      notAfter: "",
    },
    adv: { pressure: "1010", temp: "10", refraction: true, deltaT: "" },
    claim: { time: "", offset: "" },
    search: { kind: "world", bbox: "" },
  };
}

/**
 * Validates a case read from outside (share link, tab storage): merges it over the
 * defaults so older links keep working, and rejects anything that is not a v1 case.
 * Only known string/boolean fields are copied, so a crafted link cannot inject objects.
 */
export function parseCase(raw: unknown, shotLabel: (n: number) => string): AppState | null {
  if (!isObj(raw) || raw.v !== 1) return null;
  const d = defaultState(shotLabel(1));
  const shots = Array.isArray(raw.shots) && raw.shots.length
    ? raw.shots.slice(0, MAX_SHOTS).filter(isObj).map((x, i) => {
        const base = newShot(shotLabel(i + 1));
        const shot = merge(base, x);
        shot.f = merge(base.f, isObj(x.f) ? x.f : {});
        return shot;
      })
    : d.shots;
  if (!shots.length) return null;
  const cons = merge(d.cons, isObj(raw.cons) ? raw.cons : {});
  const months = isObj(raw.cons) && Array.isArray(raw.cons.months) ? raw.cons.months : null;
  cons.months = d.cons.months.map((m, i) => (months && typeof months[i] === "boolean" ? months[i] : m));
  return {
    v: 1,
    mode: raw.mode === "place" ? "place" : "time",
    site: merge(d.site, isObj(raw.site) ? raw.site : {}),
    shots,
    cons,
    adv: merge(d.adv, isObj(raw.adv) ? raw.adv : {}),
    claim: merge(d.claim, isObj(raw.claim) ? raw.claim : {}),
    search: merge(d.search, isObj(raw.search) ? raw.search : {}),
  };
}

function isObj(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

/** Allowed values of the fields typed as unions (a share link may carry anything). */
const CHOICES: Record<string, readonly string[]> = {
  relation: ["same", "other"],
  method: ["lengths", "ratio", "angle"],
  tip: ["unknown", "midpoint", "umbra", "outer"],
  azRef: ["true", "magnetic"],
  radiusUnit: ["m", "km"],
  zoneKind: ["utc", "offset", "iana", "solar"],
  kind: ["world", "bbox"],
};

/** Copies from `src` only the keys of `base` whose value has the same primitive type. */
function merge<T extends object>(base: T, src: Record<string, unknown>): T {
  const out = { ...base } as Record<string, unknown>;
  for (const [k, v] of Object.entries(base)) {
    const x = src[k];
    if (x !== undefined && typeof x === typeof v && (typeof v === "string" || typeof v === "boolean")
        && (!CHOICES[k] || CHOICES[k].includes(x as string))) out[k] = x;
  }
  return out as T;
}
