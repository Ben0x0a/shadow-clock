/**
 * request.ts — turns the form state (raw text) into solver requests, collecting
 * per-field errors for inline display.
 *
 * Defines: buildTimeRequest(), buildPlaceRequest(), buildClaimRequest(), parseNumber(),
 *          FieldError.
 * Used by: main.ts, ui/panels/*.ts (inline validation), ui/report.ts.
 * Depends on: core/models.ts, core/parse.ts, core/zone.ts, ui/state.ts.
 */

import type {
  Atmosphere,
  ClaimRequest,
  Constraints,
  LocationSolveRequest,
  ShadowInput,
  Shot,
  Site,
  TimeSolveRequest,
  Uncertain,
  Zone,
} from "../core/models";
import { parseDateTime, parseDuration, parseLocation, parseOffset } from "../core/parse";
import { isValidIana, wallToUtc } from "../core/zone";
import type { AppState, ShotState } from "./state";

export interface FieldError {
  key: string;
  msg: string;
}

export type Built<T> = { ok: true; req: T } | { ok: false; errors: FieldError[] };

/** Lenient number: accepts a decimal comma; empty text is NaN. */
export function parseNumber(s: string): number {
  const t = s.trim().replace(",", ".").replace("−", "-");
  return t === "" ? NaN : Number(t);
}

class Collector {
  errors: FieldError[] = [];
  num(key: string, s: string, what: string, opts: { empty?: number; min?: number } = {}): number {
    const v = s.trim() === "" && opts.empty !== undefined ? opts.empty : parseNumber(s);
    if (!Number.isFinite(v)) this.errors.push({ key, msg: `${what}: enter a number` });
    else if (opts.min !== undefined && v < opts.min) this.errors.push({ key, msg: `${what} must be ≥ ${opts.min}` });
    return v;
  }
  add(key: string, msg: string) {
    this.errors.push({ key, msg });
  }
}

function uncertain(c: Collector, sh: ShotState, base: string, what: string, err: "gauss" | "range"): Uncertain {
  const f = sh.f;
  if (err === "gauss") {
    return {
      kind: "gauss",
      value: c.num(`${sh.id}.${base}`, f[base], what),
      sigma: c.num(`${sh.id}.${base}s`, f[`${base}s`], `${what} uncertainty`, { empty: 0, min: 0 }),
    };
  }
  return {
    kind: "range",
    min: c.num(`${sh.id}.${base}min`, f[`${base}min`], `${what} minimum`),
    max: c.num(`${sh.id}.${base}max`, f[`${base}max`], `${what} maximum`),
  };
}

export function buildShadow(c: Collector, sh: ShotState): ShadowInput {
  const elevation: ShadowInput["elevation"] =
    sh.method === "lengths"
      ? { method: "lengths", height: uncertain(c, sh, "h", "Object height", sh.err), shadow: uncertain(c, sh, "l", "Shadow length", sh.err) }
      : sh.method === "ratio"
        ? { method: "ratio", ratio: uncertain(c, sh, "r", "Ratio", sh.err) }
        : { method: "angle", angle: uncertain(c, sh, "a", "Elevation", sh.err) };
  let azimuth: ShadowInput["azimuth"] = null;
  if (sh.azOn) {
    const shadow: Uncertain =
      sh.azErr === "gauss"
        ? { kind: "gauss", value: c.num(`${sh.id}.az`, sh.az, "Azimuth"), sigma: c.num(`${sh.id}.azs`, sh.azs, "Azimuth uncertainty", { empty: 0, min: 0 }) }
        : { kind: "range", min: c.num(`${sh.id}.azmin`, sh.azmin, "Azimuth minimum"), max: c.num(`${sh.id}.azmax`, sh.azmax, "Azimuth maximum") };
    azimuth = {
      shadow,
      reference: sh.azRef,
      declinationDeg: sh.azRef === "magnetic" ? c.num(`${sh.id}.decl`, sh.decl, "Declination", { empty: 0 }) : 0,
    };
  }
  return {
    elevation,
    tipEdge: sh.tip,
    maxTiltDeg: c.num(`${sh.id}.tilt`, sh.tilt, "Tilt", { empty: 0, min: 0 }),
    azimuth,
  };
}

function atmosphere(c: Collector, s: AppState): Atmosphere {
  return {
    pressureHpa: c.num("adv.pressure", s.adv.pressure, "Pressure", { empty: 1010, min: 1 }),
    temperatureC: c.num("adv.temp", s.adv.temp, "Temperature", { empty: 10 }),
    refraction: s.adv.refraction,
  };
}

function deltaT(c: Collector, s: AppState): number | null {
  return s.adv.deltaT.trim() === "" ? null : c.num("adv.deltaT", s.adv.deltaT, "ΔT");
}

export function buildSite(c: Collector, s: AppState): Site {
  const ll = parseLocation(s.site.loc);
  if (!ll) c.add("site.loc", s.site.loc.trim() ? "Location not recognised" : "Enter the location (or click the map)");
  const r = c.num("site.radius", s.site.radius, "Radius", { empty: 0, min: 0 });
  return {
    lat: ll?.lat ?? NaN,
    lon: ll?.lon ?? NaN,
    heightM: c.num("site.height", s.site.height, "Height", { empty: 0 }),
    radiusM: s.site.radiusUnit === "km" ? r * 1000 : r,
  };
}

export function buildZone(c: Collector, s: AppState): Zone {
  const { zoneKind, zoneValue } = s.cons;
  if (zoneKind === "offset") {
    const m = parseOffset(zoneValue);
    if (m === null) c.add("cons.zone", "Offset not recognised (e.g. +02:00)");
    return { kind: "offset", minutes: m ?? 0 };
  }
  if (zoneKind === "iana") {
    if (!isValidIana(zoneValue.trim())) c.add("cons.zone", "Unknown time zone (e.g. Europe/Paris)");
    return { kind: "iana", name: zoneValue.trim() || "UTC" };
  }
  return { kind: zoneKind };
}

function tod(c: Collector, key: string, s: string): number | null {
  if (!s.trim()) return null;
  const m = s.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) {
    c.add(key, "Use HH:MM");
    return null;
  }
  return Number(m[1]) * 60 + Number(m[2]);
}

function bound(c: Collector, key: string, s: string, zone: Zone, lon: number): number | null {
  if (!s.trim()) return null;
  const p = parseDateTime(s);
  if (!p) {
    c.add(key, "Date not recognised (e.g. 2024-06-01 or 2024-06-01 14:00)");
    return null;
  }
  return p.offsetMin !== null ? p.wallMs - p.offsetMin * 60_000 : wallToUtc(zone, p.wallMs, Number.isFinite(lon) ? lon : 0);
}

function timeShots(c: Collector, s: AppState): Shot[] {
  return s.shots.map((sh, i) => {
    const shadow = buildShadow(c, sh);
    let offsetS = 0;
    let sigma = 0;
    if (i > 0 && sh.relation === "other") {
      const o = parseDuration(sh.offset);
      if (o === null) c.add(`${sh.id}.offset`, "Time after shadow 1, e.g. +01:23:04 or 85 min");
      offsetS = o ?? 0;
      const sg = sh.offsetSigma.trim() ? parseDuration(sh.offsetSigma) : 0;
      if (sg === null || sg < 0) c.add(`${sh.id}.offsetSigma`, "Uncertainty, e.g. 5 s or 2 min");
      sigma = Math.abs(sg ?? 0);
    }
    return { id: sh.id, label: sh.label, shadow, offsetS, timeMs: NaN, timeSigmaS: sigma };
  });
}

export function buildTimeRequest(s: AppState): Built<TimeSolveRequest> {
  const c = new Collector();
  const site = buildSite(c, s);
  const zone = buildZone(c, s);
  const constraints: Constraints = {
    yearFrom: c.num("cons.yearFrom", s.cons.yearFrom, "First year"),
    yearTo: c.num("cons.yearTo", s.cons.yearTo || s.cons.yearFrom, "Last year"),
    months: s.cons.months,
    todFromMin: tod(c, "cons.todFrom", s.cons.todFrom),
    todToMin: tod(c, "cons.todTo", s.cons.todTo),
    notBeforeMs: bound(c, "cons.notBefore", s.cons.notBefore, zone, site.lon),
    notAfterMs: bound(c, "cons.notAfter", s.cons.notAfter, zone, site.lon),
    zone,
  };
  if ((constraints.todFromMin === null) !== (constraints.todToMin === null)) {
    c.add(constraints.todFromMin === null ? "cons.todFrom" : "cons.todTo", "Give both ends of the time-of-day window");
  }
  const req: TimeSolveRequest = {
    shots: timeShots(c, s),
    site,
    atmosphere: atmosphere(c, s),
    constraints,
    deltaTOverride: deltaT(c, s),
  };
  return c.errors.length ? { ok: false, errors: c.errors } : { ok: true, req };
}

export function buildPlaceRequest(s: AppState): Built<LocationSolveRequest> {
  const c = new Collector();
  const shots: Shot[] = s.shots.map((sh) => {
    const shadow = buildShadow(c, sh);
    const p = parseDateTime(sh.time);
    let timeMs = NaN;
    if (!p) c.add(`${sh.id}.time`, sh.time.trim() ? "Date/time not recognised" : "Enter when this photo was taken");
    else {
      const off = p.offsetMin ?? parseOffset(sh.timeOffset);
      if (off === null) c.add(`${sh.id}.timeOffset`, "Offset not recognised (e.g. +02:00)");
      timeMs = p.wallMs - (off ?? 0) * 60_000;
    }
    const sg = sh.timeSigma.trim() ? parseDuration(sh.timeSigma) : 0;
    if (sg === null || sg < 0) c.add(`${sh.id}.timeSigma`, "Uncertainty, e.g. 30 s or 2 min");
    return { id: sh.id, label: sh.label, shadow, offsetS: 0, timeMs, timeSigmaS: Math.abs(sg ?? 0) };
  });
  let bounds: LocationSolveRequest["bounds"] = null;
  if (s.search.kind === "bbox") {
    const n = s.search.bbox.split(/[,;\s]+/).filter(Boolean).map(parseNumber);
    if (n.length !== 4 || n.some((x) => !Number.isFinite(x)) || n[0] >= n[2] || n[1] >= n[3]) {
      c.add("search.bbox", "Use: south, west, north, east (e.g. 40, -5, 52, 10)");
    } else bounds = [n[0], n[1], n[2], n[3]];
  }
  const req: LocationSolveRequest = {
    shots,
    atmosphere: atmosphere(c, s),
    bounds,
    heightM: 0,
    deltaTOverride: deltaT(c, s),
  };
  return c.errors.length ? { ok: false, errors: c.errors } : { ok: true, req };
}

export function buildClaimRequest(s: AppState): Built<ClaimRequest> {
  const c = new Collector();
  const site = buildSite(c, s);
  const p = parseDateTime(s.claim.time);
  if (!p) c.add("claim.time", s.claim.time.trim() ? "Date/time not recognised" : "Enter the claimed time");
  let offsetMin: number | null = p?.offsetMin ?? null;
  if (offsetMin === null && s.claim.offset.trim()) {
    offsetMin = parseOffset(s.claim.offset);
    if (offsetMin === null) c.add("claim.offset", "Offset not recognised (e.g. +02:00)");
  }
  const req: ClaimRequest = {
    shots: timeShots(c, s),
    site,
    atmosphere: atmosphere(c, s),
    deltaTOverride: deltaT(c, s),
    wallClockMs: p?.wallMs ?? NaN,
    offsetMin,
  };
  return c.errors.length ? { ok: false, errors: c.errors } : { ok: true, req };
}

/** Parses one shot on its own (for the live "implied Sun position" preview). */
export function buildShadowOnly(sh: ShotState): ShadowInput | null {
  const c = new Collector();
  const shadow = buildShadow(c, sh);
  return c.errors.length ? null : shadow;
}
