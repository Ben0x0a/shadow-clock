/**
 * measurement.ts — converts a shadow measurement into the apparent Sun position it implies,
 * with a full error budget.
 *
 * Defines: buildObservation(), refractionDeg().
 * Used by: core/score.ts, core/solveTime.ts, core/solveLocation.ts, core/claimCheck.ts,
 *          ui/shots.ts (live preview of the implied elevation/azimuth).
 * Depends on: core/models.ts, core/config.ts.
 *
 * HOW:
 *  1. Elevation h = atan(H / L), from lengths, their ratio, or a given angle.
 *     Gaussian: first-order propagation σh² = (L²σH² + H²σL²) / (H² + L²)².
 *     Range: atan is monotonic, so h ∈ [atan(Hmin/Lmax), atan(Hmax/Lmin)].
 *  2. Penumbra: the Sun is a 0.53° disc, so the shadow tip is a gradient. The sharp (umbra)
 *     edge is cast by the upper limb (h + s), the faint outer edge by the lower limb
 *     (h − s). An unknown edge adds a uniform ±s term.
 *  3. Object tilt τ (uniform in ±τ): elevation error ≈ τ; the lateral shift of the tip,
 *     H·sin τ, turns into an azimuth error atan(sin τ · tan h).
 *  4. Refraction: the shadow is cast by the apparent (refracted) Sun. Its correction has a
 *     relative uncertainty of REFRACTION_REL_SIGMA (Bennett's formula at the measured height).
 *  5. Azimuth: Sun azimuth = shadow azimuth (+ declination if magnetic) + 180°.
 * Gaussian terms add in quadrature; range terms add linearly (worst case).
 * WHY: every term is a physical source of error for a real photo, and hiding any of them
 * would make the reported windows falsely narrow — unacceptable for forensic use.
 */

import { LOW_SUN_WARNING_DEG, REFRACTION_REL_SIGMA, SUN_SEMI_DIAMETER_DEG } from "./config";
import type { BudgetItem, Component, ErrorKind, Observation, ShadowInput, Uncertain } from "./models";

const DEG = Math.PI / 180;

export type ObservationResult = { ok: true; obs: Observation } | { ok: false; error: string };

/** Bennett (1982) refraction for an apparent elevation, degrees (standard atmosphere). */
export function refractionDeg(apparentDeg: number): number {
  if (apparentDeg < -1) return 0;
  const arcmin = 1 / Math.tan((apparentDeg + 7.31 / (apparentDeg + 4.4)) * DEG);
  return arcmin / 60;
}

interface Partial {
  kind: ErrorKind;
  centre: number;
  items: BudgetItem[];
}

function valid(u: Uncertain, positive: boolean): string | null {
  const nums = u.kind === "gauss" ? [u.value, u.sigma] : [u.min, u.max];
  if (nums.some((n) => !Number.isFinite(n))) return "a value is missing";
  if (u.kind === "gauss" && u.sigma < 0) return "the uncertainty must be ≥ 0";
  if (u.kind === "range" && u.min > u.max) return "the minimum is larger than the maximum";
  const lo = u.kind === "gauss" ? u.value : u.min;
  if (positive && lo <= 0) return "values must be > 0";
  return null;
}

function elevationPart(s: ShadowInput): Partial | string {
  const e = s.elevation;
  if (e.method === "lengths") {
    const err = valid(e.height, true) ?? valid(e.shadow, true);
    if (err) return `Height/shadow: ${err}`;
    if (e.height.kind !== e.shadow.kind) return "Height and shadow must use the same error type";
    if (e.height.kind === "gauss" && e.shadow.kind === "gauss") {
      const H = e.height.value;
      const L = e.shadow.value;
      const d = H * H + L * L;
      const sig =
        Math.sqrt(L * L * e.height.sigma ** 2 + H * H * e.shadow.sigma ** 2) / d / DEG;
      return {
        kind: "gauss",
        centre: Math.atan2(H, L) / DEG,
        items: [{ label: "Height & shadow length", amount: sig }],
      };
    }
    if (e.height.kind === "range" && e.shadow.kind === "range") {
      const lo = Math.atan2(e.height.min, e.shadow.max) / DEG;
      const hi = Math.atan2(e.height.max, e.shadow.min) / DEG;
      return {
        kind: "range",
        centre: (lo + hi) / 2,
        items: [{ label: "Height & shadow length", amount: (hi - lo) / 2 }],
      };
    }
    return "Height and shadow must use the same error type";
  }
  if (e.method === "ratio") {
    const err = valid(e.ratio, true);
    if (err) return `Ratio: ${err}`;
    if (e.ratio.kind === "gauss") {
      const r = e.ratio.value;
      return {
        kind: "gauss",
        centre: Math.atan(r) / DEG,
        items: [{ label: "Height/shadow ratio", amount: e.ratio.sigma / (1 + r * r) / DEG }],
      };
    }
    const lo = Math.atan(e.ratio.min) / DEG;
    const hi = Math.atan(e.ratio.max) / DEG;
    return {
      kind: "range",
      centre: (lo + hi) / 2,
      items: [{ label: "Height/shadow ratio", amount: (hi - lo) / 2 }],
    };
  }
  const err = valid(e.angle, true);
  if (err) return `Elevation: ${err}`;
  if (e.angle.kind === "gauss") {
    return {
      kind: "gauss",
      centre: e.angle.value,
      items: [{ label: "Elevation reading", amount: e.angle.sigma }],
    };
  }
  return {
    kind: "range",
    centre: (e.angle.min + e.angle.max) / 2,
    items: [{ label: "Elevation reading", amount: (e.angle.max - e.angle.min) / 2 }],
  };
}

/** Uniform ±a expressed in the component's error type (σ = a/√3, or half-width a). */
function uniform(kind: ErrorKind, a: number): number {
  return kind === "gauss" ? a / Math.sqrt(3) : a;
}

function combine(kind: ErrorKind, centre: number, items: BudgetItem[]): Component {
  const used = items.filter((i) => i.amount > 0);
  if (kind === "gauss") {
    return { kind, centre, sigma: Math.sqrt(used.reduce((a, i) => a + i.amount ** 2, 0)) };
  }
  return { kind, centre, half: used.reduce((a, i) => a + i.amount, 0) };
}

export function buildObservation(s: ShadowInput, refraction: boolean): ObservationResult {
  const warnings: string[] = [];
  const part = elevationPart(s);
  if (typeof part === "string") return { ok: false, error: part };
  if (!(s.maxTiltDeg >= 0 && s.maxTiltDeg < 45)) {
    return { ok: false, error: "Object tilt must be between 0° and 45°" };
  }

  const kind = part.kind;
  let centre = part.centre;
  const items = [...part.items];

  // Penumbra (step 2).
  const sd = SUN_SEMI_DIAMETER_DEG;
  if (s.tipEdge === "umbra") centre -= sd;
  else if (s.tipEdge === "outer") centre += sd;
  else if (s.tipEdge === "unknown") items.push({ label: "Shadow tip edge (penumbra)", amount: uniform(kind, sd) });
  else items.push({ label: "Shadow tip midpoint judgement", amount: uniform(kind, sd / 2) });

  // Tilt (step 3).
  if (s.maxTiltDeg > 0) items.push({ label: "Object tilt", amount: uniform(kind, s.maxTiltDeg) });

  // Refraction model (step 4).
  if (refraction) {
    const r = refractionDeg(centre);
    const amt = kind === "gauss" ? REFRACTION_REL_SIGMA * r : 2 * REFRACTION_REL_SIGMA * r;
    items.push({ label: "Refraction model", amount: amt });
  }

  if (centre <= 0) return { ok: false, error: "The implied Sun elevation is not above the horizon" };
  if (centre < LOW_SUN_WARNING_DEG) {
    warnings.push("Low Sun (< 5°): refraction is large and variable; results are less reliable.");
  }
  const elevation = combine(kind, centre, items);
  const elevSpread = elevation.kind === "gauss" ? elevation.sigma : elevation.half;
  if (elevSpread > 5) warnings.push("Elevation uncertainty exceeds 5°: expect very wide windows.");

  // Azimuth (step 5).
  let azimuth: Component | null = null;
  const azItems: BudgetItem[] = [];
  if (s.azimuth) {
    const a = s.azimuth;
    const err = valid(a.shadow, false);
    if (err) return { ok: false, error: `Azimuth: ${err}` };
    if (!Number.isFinite(a.declinationDeg)) return { ok: false, error: "Declination is missing" };
    const decl = a.reference === "magnetic" ? a.declinationDeg : 0;
    const shadowAz = a.shadow.kind === "gauss" ? a.shadow.value : (a.shadow.min + a.shadow.max) / 2;
    const reading = a.shadow.kind === "gauss" ? a.shadow.sigma : (a.shadow.max - a.shadow.min) / 2;
    azItems.push({ label: "Azimuth reading", amount: reading });
    if (s.maxTiltDeg > 0) {
      const tiltAz = Math.atan(Math.sin(s.maxTiltDeg * DEG) * Math.tan(centre * DEG)) / DEG;
      azItems.push({ label: "Object tilt", amount: uniform(a.shadow.kind, tiltAz) });
    }
    const sunAz = (((shadowAz + decl + 180) % 360) + 360) % 360;
    azimuth = combine(a.shadow.kind, sunAz, azItems);
    if (centre > 80) {
      warnings.push("Sun above 80°: the shadow is short, so its azimuth is poorly defined.");
    }
  }

  return {
    ok: true,
    obs: { elevation, azimuth, elevationBudget: items, azimuthBudget: azItems, warnings },
  };
}
