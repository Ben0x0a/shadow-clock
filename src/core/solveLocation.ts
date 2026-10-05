/**
 * solveLocation.ts — location mode: shadows with known UTC times → compatible places.
 *
 * Defines: solveLocation().
 * Used by: workers/solver.ts, tests/solveLocation.test.ts.
 * Depends on: core/score.ts, core/solveTime.ts (prepareShots), core/spa.ts, core/deltaT.ts,
 *             core/config.ts, core/models.ts.
 *
 * HOW:
 *  1. Each shot's geocentric Sun is computed once (its time is known), so a candidate
 *     place only costs the cheap topocentric step.
 *  2. Coarse-to-fine grid: 1° cells over the search bounds, subdivided 5× per level down
 *     to a resolution matched to the measurement uncertainty. A cell survives when every
 *     shot's Sun, seen from the cell centre, lies within the shot's search radius plus the
 *     cell's half-diagonal. Moving the observer by an angle δ tilts the local vertical by δ,
 *     so the Sun's apparent direction moves by at most δ, which makes this a necessary
 *     condition: no accepted place can be dropped at a coarse level.
 *  3. Final cells are scored with the full covariance model and kept inside the 99.73 %
 *     region (or all ranges). Connected cells form regions; region probabilities integrate
 *     the likelihood over area (uniform prior over the Earth's surface).
 * WHY: one shot gives a band around a circle of equal altitude (as in celestial
 * navigation); each extra shot at another time adds a band, and their crossing locates
 * the place. A grid represents such bands and their intersections without special cases.
 */

import { ACCEPT_LEVEL, EARTH_RADIUS_M, SUN_MAX_RATE_DEG_PER_MIN } from "./config.ts";
import { decimalYear, deltaTSeconds } from "./deltaT.ts";
import type { GeoCell, GeoRegion, LocationSolveRequest, LocationSolveResult, Message } from "./models.ts";
import { type FullFit, levelThreshold, type ScoredShot, Scorer } from "./score.ts";
import { type Progress, prepareShots, type SolveOutcome } from "./solveTime.ts";
import { geocentricSun } from "./spa.ts";
import { at } from "./util.ts";

const SUBDIVIDE = 5;
const MAX_CELLS = 250_000;
const MIN_RES_DEG = 0.004;
const KM_PER_DEG = (Math.PI / 180) * (EARTH_RADIUS_M / 1000);

export function solveLocation(
  req: LocationSolveRequest,
  progress?: Progress,
): SolveOutcome<LocationSolveResult> {
  const t0 = Date.now();
  for (const s of req.shots) {
    if (!Number.isFinite(s.timeMs)) return { ok: false, error: { key: "core.err.timeMissing", shot: s.label } };
    if (!(s.timeSigmaS >= 0)) return { ok: false, error: { key: "core.err.timeTolerance", shot: s.label } };
  }
  const prep = prepareShots(req.shots, req.atmosphere);
  if (!prep.ok) return prep;
  const observations = prep.observations;

  const scored: ScoredShot[] = observations.map((obs, i) => ({ obs, timeSigmaS: at(req.shots, i).timeSigmaS }));
  const scorer = new Scorer(scored, req.atmosphere, req.heightM);
  const geos = req.shots.map((s) =>
    geocentricSun(s.timeMs, req.deltaTOverride ?? deltaTSeconds(decimalYear(s.timeMs))),
  );
  const thr = levelThreshold(ACCEPT_LEVEL, scorer.dof);
  const rate = SUN_MAX_RATE_DEG_PER_MIN / 60;
  const radii = scored.map((_, i) => scorer.searchRadius(i, thr, 0, rate));

  // Target resolution: an eighth of the tightest 1σ angular uncertainty, bounded, so the
  // region edges and the best point are resolved well inside the measurement error.
  const tightest = Math.min(...radii) / Math.max(Math.sqrt(thr), 1);
  const target = Math.min(1, Math.max(MIN_RES_DEG, tightest / 8));

  const [south, west, north, east] = req.bounds ?? [-90, -180, 90, 180];
  if (!(south < north) || !(west < east)) return { ok: false, error: { key: "core.err.emptyArea" } };

  let evaluations = 0;
  const survives = (lat: number, lon: number, size: number): boolean => {
    const half = size * 0.75; // ≥ half-diagonal in great-circle degrees
    for (let i = 0; i < geos.length; i++) {
      evaluations++;
      if (scorer.coarseDistance(i, at(geos, i), lat, lon) > at(radii, i) + half) return false;
    }
    return true;
  };

  // Level 0: 1° cells.
  let size = 1;
  let cells: [number, number][] = [];
  for (let lat = Math.floor(south) + 0.5; lat < north; lat += 1) {
    for (let lon = Math.floor(west) + 0.5; lon < east; lon += 1) {
      if (survives(lat, lon, size)) cells.push([lat, lon]);
    }
  }
  const warnings: Message[] = [];
  let level = 0;
  while (size > target * 1.001 && cells.length > 0) {
    const next = size / SUBDIVIDE;
    // WHY: stop refining before memory and time explode; the result stays correct (a
    // superset of the true region), only coarser, and the user is told.
    if (cells.length * SUBDIVIDE * SUBDIVIDE > MAX_CELLS * 4) {
      warnings.push({ key: "core.warn.coarse", vars: { size: size.toFixed(2) } });
      break;
    }
    const out: [number, number][] = [];
    for (const [la, lo] of cells) {
      for (let a = 0; a < SUBDIVIDE; a++) {
        for (let b = 0; b < SUBDIVIDE; b++) {
          const lat = la - size / 2 + (a + 0.5) * next;
          const lon = lo - size / 2 + (b + 0.5) * next;
          if (lat < south || lat > north || lon < west || lon > east) continue;
          if (survives(lat, lon, next)) out.push([lat, lon]);
        }
      }
    }
    cells = out;
    size = next;
    progress?.(Math.min(0.8, 0.2 * ++level), { key: "progress.map" });
  }

  // Final scoring.
  const accepted: { lat: number; lon: number; fit: FullFit }[] = [];
  for (const [lat, lon] of cells) {
    const fit = scorer.fit(geos, lat, lon, 0);
    evaluations++;
    if (fit.rangeU <= 1 && (scorer.dof === 0 || fit.chi2 <= thr)) accepted.push({ lat, lon, fit });
  }
  progress?.(0.9, { key: "progress.regions" });

  const regions = groupRegions(accepted, size);
  const out: GeoCell[] = accepted.map((c) => ({ lat: c.lat, lon: c.lon, size, misfit: c.fit.misfit }));

  observations.forEach((o, i) => o.warnings.forEach((x) => warnings.push({ ...x, shot: at(req.shots, i).label })));
  if (accepted.length === 0) {
    warnings.push({ key: "core.warn.noPlace" });
  }
  if (req.shots.length === 1 && !at(observations, 0).azimuth) {
    warnings.push({ key: "core.warn.ring" });
  }

  return {
    ok: true,
    result: {
      cells: out,
      regions,
      resolutionDeg: size,
      observations,
      warnings,
      evaluations,
      elapsedMs: Date.now() - t0,
    },
  };
}

function groupRegions(cells: { lat: number; lon: number; fit: FullFit }[], size: number): GeoRegion[] {
  // WHY: centres sit at half-cell offsets, so floor (not round) gives a stable integer index.
  const key = (lat: number, lon: number) => `${Math.floor(lat / size + 1e-6)}|${Math.floor(lon / size + 1e-6)}`;
  const index = new Map<string, number>();
  cells.forEach((c, i) => index.set(key(c.lat, c.lon), i));
  const seen = new Uint8Array(cells.length);
  const regions: (GeoRegion & { logW: number })[] = [];
  for (let s = 0; s < cells.length; s++) {
    if (seen[s]) continue;
    const stack = [s];
    seen[s] = 1;
    const members: number[] = [];
    while (stack.length) {
      const i = stack.pop() as number;
      members.push(i);
      const { lat, lon } = at(cells, i);
      for (let a = -1; a <= 1; a++) {
        for (let b = -1; b <= 1; b++) {
          const j = index.get(key(lat + a * size, lon + b * size));
          if (j !== undefined && !seen[j]) {
            seen[j] = 1;
            stack.push(j);
          }
        }
      }
    }
    let best = at(members, 0);
    let s0 = 90, w0 = 180, n0 = -90, e0 = -180, area = 0, logW = -Infinity;
    for (const i of members) {
      const c = at(cells, i);
      if (c.fit.misfit < at(cells, best).fit.misfit) best = i;
      s0 = Math.min(s0, c.lat - size / 2);
      n0 = Math.max(n0, c.lat + size / 2);
      w0 = Math.min(w0, c.lon - size / 2);
      e0 = Math.max(e0, c.lon + size / 2);
      const a = (size * KM_PER_DEG) ** 2 * Math.cos((c.lat * Math.PI) / 180);
      area += a;
      const lw = c.fit.logL + Math.log(a);
      logW = logW === -Infinity ? lw : Math.max(logW, lw) + Math.log1p(Math.exp(-Math.abs(logW - lw)));
    }
    const b = at(cells, best);
    regions.push({
      id: 0,
      bestLat: b.lat,
      bestLon: b.lon,
      bestFit: { chi2: b.fit.chi2, dof: b.fit.dof, rangeU: b.fit.rangeU, misfit: b.fit.misfit, shots: b.fit.shots },
      bounds: [s0, w0, n0, e0],
      areaKm2: area,
      probability: 0,
      cellCount: members.length,
      logW,
    });
  }
  const m = Math.max(...regions.map((r) => r.logW));
  const sum = regions.reduce((a, r) => a + Math.exp(r.logW - m), 0);
  regions.sort((a, b) => b.logW - a.logW);
  return regions.map(({ logW, ...r }, i) => ({ ...r, id: i, probability: Math.exp(logW - m) / sum }));
}
