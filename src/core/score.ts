/**
 * score.ts — scores a candidate (time, place) against all shots.
 *
 * Defines: Scorer (joint fit of all shots at one candidate), levelThreshold(),
 *          acceptedLevel().
 * Used by: core/solveTime.ts, core/solveLocation.ts, core/claimCheck.ts.
 * Depends on: core/spa.ts, core/stats.ts, core/models.ts, core/config.ts, core/util.ts.
 *
 * HOW: for each shot, compute the apparent Sun position from the shot's geocentric
 * ephemeris, then the residuals against the observed components.
 *  - Uncertainty of the "known" side (the location radius R in time mode, each shot's
 *    time σ) is propagated through the local Jacobian of (elevation, azimuth) with respect
 *    to time and to north/east displacement. The Jacobian comes from finite differences of
 *    the cheap topocentric step: time is emulated by rotating the Earth (shifting the
 *    sidereal time) with the ephemeris held fixed, because the Sun's own motion over
 *    seconds (< 0.001°) is negligible compared with Earth rotation.
 *  - Gaussian components: covariance C = diag(σ²) + J Σ J^T, χ² = rᵀ C⁻¹ r and
 *    likelihood ∝ exp(−χ²/2) / √det C. A uniform disc of radius R has a per-axis σ of R/2.
 *  - Range components: half-widths are widened by |∂/∂t|·Δt + R·|∇|, and the candidate
 *    is inside only when every |residual| ≤ half-width.
 * Shots are independent measurements, so their χ² values and degrees of freedom add.
 * WHY: covariance propagation keeps the el/az correlation that location and time errors
 * create, instead of pretending the two axes are independent.
 */

import { CONFIDENCE_LEVELS, EARTH_RADIUS_M, HEATMAP_LEVEL } from "./config.ts";
import type { Atmosphere, Component, Fit, Observation, ShotFit } from "./models.ts";
import { angleDiff, type GeocentricSun, topocentricSun } from "./spa.ts";
import { chi2Quantile } from "./stats.ts";
import { at } from "./util.ts";

/** Earth rotation relative to the Sun's hour angle, degrees of sidereal time per second. */
const SIDEREAL_DEG_PER_S = 360.98564736629 / 86400;
const NU_STEP_DEG = 0.05;
const POS_STEP_M = 1000;

export function levelThreshold(level: number, dof: number): number {
  return chi2Quantile(level, dof);
}

/** Smallest reported confidence region containing the fit, or null (see models.ts). */
export function acceptedLevel(fit: Fit): number | null {
  if (fit.rangeU > 1) return null;
  if (fit.dof === 0) return 1;
  for (const lv of CONFIDENCE_LEVELS) if (fit.chi2 <= levelThreshold(lv, fit.dof)) return lv;
  return null;
}

/** Per-shot context: observation and uncertainty of the shot's known time. */
export interface ScoredShot {
  obs: Observation;
  /** 1σ (Gaussian) or maximum (range) uncertainty of the shot's time, seconds. */
  timeSigmaS: number;
}

interface Deriv {
  el: number;
  az: number;
}

export interface FullFit extends Fit {
  /** log-likelihood up to a constant (Gaussian part only; 0 when dof = 0). */
  logL: number;
}

export class Scorer {
  readonly dof: number;
  private readonly thrHeat: number;
  private readonly shots: ScoredShot[];
  private readonly atm: Atmosphere;
  private readonly heightM: number;

  constructor(shots: ScoredShot[], atm: Atmosphere, heightM: number) {
    this.shots = shots;
    this.atm = atm;
    this.heightM = heightM;
    let dof = 0;
    for (const s of shots) {
      if (s.obs.elevation.kind === "gauss") dof++;
      if (s.obs.azimuth?.kind === "gauss") dof++;
    }
    this.dof = dof;
    this.thrHeat = levelThreshold(HEATMAP_LEVEL, dof);
  }

  private sun(geo: GeocentricSun, lat: number, lon: number) {
    return topocentricSun(geo, lat, lon, this.heightM, this.atm, this.atm.refraction);
  }

  /**
   * Joint fit of all shots. `geos[i]` is the ephemeris at shot i's candidate time;
   * `radiusM` is the location uncertainty (time mode) or 0 (location mode).
   */
  fit(geos: GeocentricSun[], lat: number, lon: number, radiusM: number): FullFit {
    let chi2 = 0;
    let logL = 0;
    let rangeU = 0;
    const shotFits: ShotFit[] = [];
    const cosLat = Math.max(Math.cos((lat * Math.PI) / 180), 1e-6);

    for (let i = 0; i < this.shots.length; i++) {
      const { obs, timeSigmaS } = at(this.shots, i);
      const geo = at(geos, i);
      const s0 = this.sun(geo, lat, lon);
      const rEl = s0.elevation - obs.elevation.centre;
      const rAz = obs.azimuth ? angleDiff(s0.azimuth, obs.azimuth.centre) : 0;

      // Jacobian columns: d/dt (per second), d/dNorth and d/dEast (per metre).
      const need = timeSigmaS > 0 || radiusM > 0;
      let dt: Deriv = { el: 0, az: 0 };
      let dn: Deriv = { el: 0, az: 0 };
      let de: Deriv = { el: 0, az: 0 };
      if (need) {
        const diff = (a: ReturnType<Scorer["sun"]>, b: ReturnType<Scorer["sun"]>, h: number) => ({
          el: (a.elevation - b.elevation) / h,
          az: angleDiff(a.azimuth, b.azimuth) / h,
        });
        if (timeSigmaS > 0) {
          const p = this.sun({ ...geo, nu: geo.nu + NU_STEP_DEG }, lat, lon);
          const m = this.sun({ ...geo, nu: geo.nu - NU_STEP_DEG }, lat, lon);
          dt = diff(p, m, (2 * NU_STEP_DEG) / SIDEREAL_DEG_PER_S);
        }
        if (radiusM > 0) {
          const dLat = (POS_STEP_M / EARTH_RADIUS_M) * (180 / Math.PI);
          const dLon = dLat / cosLat;
          dn = diff(this.sun(geo, lat + dLat, lon), this.sun(geo, lat - dLat, lon), 2 * POS_STEP_M);
          de = diff(this.sun(geo, lat, lon + dLon), this.sun(geo, lat, lon - dLon), 2 * POS_STEP_M);
        }
      }

      // Gaussian part of this shot.
      const comps: { c: Component & { kind: "gauss" }; r: number; d: [number, number, number] }[] = [];
      const ranges: { c: Component & { kind: "range" }; r: number; d: [number, number, number] }[] = [];
      const add = (c: Component, r: number, d: [number, number, number]) => {
        if (c.kind === "gauss") comps.push({ c, r, d });
        else ranges.push({ c, r, d });
      };
      add(obs.elevation, rEl, [dt.el, dn.el, de.el]);
      if (obs.azimuth) add(obs.azimuth, rAz, [dt.az, dn.az, de.az]);

      const varT = timeSigmaS ** 2;
      const varP = (radiusM / 2) ** 2;
      const [first, second] = comps;
      if (first && !second) {
        const { c, r, d } = first;
        const v = c.sigma ** 2 + d[0] ** 2 * varT + (d[1] ** 2 + d[2] ** 2) * varP;
        chi2 += (r * r) / v;
        logL += -0.5 * (r * r) / v - 0.5 * Math.log(v);
      } else if (first && second) {
        const a = first;
        const b = second;
        const caa = a.c.sigma ** 2 + a.d[0] ** 2 * varT + (a.d[1] ** 2 + a.d[2] ** 2) * varP;
        const cbb = b.c.sigma ** 2 + b.d[0] ** 2 * varT + (b.d[1] ** 2 + b.d[2] ** 2) * varP;
        const cab = a.d[0] * b.d[0] * varT + (a.d[1] * b.d[1] + a.d[2] * b.d[2]) * varP;
        const det = caa * cbb - cab * cab;
        const q = (cbb * a.r * a.r - 2 * cab * a.r * b.r + caa * b.r * b.r) / det;
        chi2 += q;
        logL += -0.5 * q - 0.5 * Math.log(det);
      }
      for (const { c, r, d } of ranges) {
        const half = c.half + Math.abs(d[0]) * timeSigmaS + radiusM * Math.hypot(d[1], d[2]);
        const u = half > 0 ? Math.abs(r) / half : r === 0 ? 0 : Infinity;
        if (u > rangeU) rangeU = u;
      }

      shotFits.push({
        sunElevation: s0.elevation,
        sunAzimuth: s0.azimuth,
        residualElevation: rEl,
        residualAzimuth: obs.azimuth ? rAz : null,
        solarTimeH: (((s0.hourAngle / 15 + 12) % 24) + 24) % 24,
      });
    }

    const gaussPart = this.dof > 0 ? Math.sqrt(chi2 / this.thrHeat) : 0;
    return {
      chi2,
      dof: this.dof,
      rangeU,
      misfit: Math.max(gaussPart, rangeU),
      logL,
      shots: shotFits,
    };
  }

  /**
   * Necessary-condition radius for the coarse search: if a candidate is accepted at
   * `thr`, shot i's Sun must lie within this great-circle distance (degrees) of the
   * observed direction (or within this elevation difference when azimuth is unknown).
   * HOW: accepted ⇒ |rᵢ| ≤ √(thr·Cᵢᵢ) per component, and Cᵢᵢ ≤ σᵢ² + extra² in sky
   * units; the great-circle distance is at most |Δel| + |Δaz|·cos(el).
   */
  searchRadius(i: number, thr: number, radiusM: number, rateDegPerS: number): number {
    const { obs, timeSigmaS } = at(this.shots, i);
    const extra = rateDegPerS * timeSigmaS + (radiusM / EARTH_RADIUS_M) * (180 / Math.PI);
    const k = Math.sqrt(thr);
    const part = (c: Component) =>
      c.kind === "gauss" ? k * Math.hypot(c.sigma, extra) : c.half + extra;
    return part(obs.elevation) + (obs.azimuth ? part(obs.azimuth) : 0);
  }

  /** Cheap distance used by the coarse search (see searchRadius). */
  coarseDistance(i: number, geo: GeocentricSun, lat: number, lon: number): number {
    const obs = at(this.shots, i).obs;
    const s = this.sun(geo, lat, lon);
    if (!obs.azimuth) return Math.abs(s.elevation - obs.elevation.centre);
    const r = Math.PI / 180;
    const e1 = s.elevation * r;
    const e2 = obs.elevation.centre * r;
    const da = (s.azimuth - obs.azimuth.centre) * r;
    const cosd = Math.sin(e1) * Math.sin(e2) + Math.cos(e1) * Math.cos(e2) * Math.cos(da);
    return Math.acos(Math.min(1, Math.max(-1, cosd))) / r;
  }

  get shotCount(): number {
    return this.shots.length;
  }
}
