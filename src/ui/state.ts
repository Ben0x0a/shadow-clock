/**
 * state.ts — the single application state (form text as typed) and its persistence.
 *
 * Defines: AppState / ShotState types, defaultState(), newShot(), Store (subscribe/update),
 *          encodeState()/decodeState() for calculation links and the tab's session copy.
 * Used by: main.ts, ui/request.ts, ui/panels/*, ui/results/*, ui/examples.ts, ui/report.ts.
 * Depends on: core/models.ts (TipEdge).
 *
 * Uncertainty model: every measurement is "value ± tolerance", where the tolerance is
 * declared by the operator and treated as a hard bound (the true value is certainly
 * inside). An empty tolerance is an error, never a silent zero.
 *
 * WHY: the state keeps the raw strings the user typed rather than parsed numbers, so a
 * restored or shared link shows exactly what was entered (units, DMS, EXIF text), and
 * parsing happens in one place (ui/request.ts).
 */

import type { TipEdge } from "../core/models";

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
export function newShot(index: number): ShotState {
  return {
    id: `s${Date.now().toString(36)}${(shotCounter++).toString(36)}`,
    label: `Shadow ${index + 1}`,
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

export function defaultState(): AppState {
  const y = String(new Date().getUTCFullYear());
  return {
    v: 1,
    mode: "time",
    site: { loc: "", radius: "100", radiusUnit: "m", height: "0" },
    shots: [newShot(0)],
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

type Listener = (s: AppState, structural: boolean) => void;

/** Holds the state; `structural` tells views whether they must rebuild their DOM. */
export class Store {
  private listeners: Listener[] = [];
  constructor(public state: AppState) {}

  subscribe(l: Listener): void {
    this.listeners.push(l);
  }

  /** Mutate in place; structural = the set/shape of controls changed. */
  update(fn: (s: AppState) => void, structural = false): void {
    fn(this.state);
    for (const l of this.listeners) l(this.state, structural);
  }

  replace(s: AppState): void {
    this.state = s;
    for (const l of this.listeners) l(this.state, true);
  }
}

// ---- Serialisation (share links, sessionStorage) ------------------------------------------------------------

function toBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(s: string): Uint8Array {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

export function encodeState(s: AppState): string {
  return toBase64Url(new TextEncoder().encode(JSON.stringify(s)));
}

/** Decodes a hash payload, merging over defaults so older links keep working. */
export function decodeState(payload: string): AppState | null {
  try {
    const raw = JSON.parse(new TextDecoder().decode(fromBase64Url(payload))) as Partial<AppState>;
    if (raw.v !== 1) return null;
    const d = defaultState();
    const shots = Array.isArray(raw.shots) && raw.shots.length
      ? raw.shots.slice(0, MAX_SHOTS).map((x, i) => ({ ...newShot(i), ...x, f: { ...newShot(i).f, ...(x.f ?? {}) } }))
      : d.shots;
    return {
      ...d,
      ...raw,
      site: { ...d.site, ...raw.site },
      cons: { ...d.cons, ...raw.cons },
      adv: { ...d.adv, ...raw.adv },
      claim: { ...d.claim, ...raw.claim },
      search: { ...d.search, ...raw.search },
      shots,
      v: 1,
    };
  } catch {
    return null;
  }
}
