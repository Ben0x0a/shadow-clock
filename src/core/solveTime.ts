/**
 * solveTime.ts — time mode: known place + shadows → every compatible date/time.
 *
 * Defines: solveTime(), prepareShots() (shared with the other solvers).
 * Used by: workers/solver.ts, tests/solveTime.test.ts.
 * Depends on: core/measurement.ts, core/score.ts, core/ephemeris.ts, core/spa.ts,
 *             core/zone.ts, core/config.ts, core/models.ts.
 *
 * HOW (per year in the range; all times are those of shot 1):
 *  1. Coarse pass every COARSE_STEP_S. A sample is kept when every shot's Sun lies within
 *     its search radius, widened by the distance the Sun can travel in half a step
 *     (SUN_MAX_RATE × step/2 × safety). Because that is a necessary condition for
 *     acceptance, no accepted time can fall between two rejected samples: the search
 *     cannot skip a solution.
 *  2. Fine pass every FINE_STEP_S over ±1 step around the kept samples, with full
 *     covariance scoring and the constraints. Runs of accepted samples (99.73 % region,
 *     or inside all ranges) become daily windows.
 *  3. Windows on neighbouring days at a similar time of day are joined into clusters —
 *     one physical solution each (typically two per year, placed symmetrically around a
 *     solstice, merging into one near it).
 *  4. Cluster probabilities come from ∫ likelihood dt under a uniform prior over the
 *     allowed times; range-only inputs weigh each cluster by its accepted duration.
 *  5. A day × time-of-day misfit heatmap is computed for the first year.
 * WHY: a grid search with a provable coarse bound is simpler and more honest than
 * analytic inversion: multiple solutions, merging near solstices and truncation by
 * constraints all fall out naturally, without special cases.
 */

import {
  ACCEPT_LEVEL,
  CLUSTER_MAX_DAY_GAP,
  CLUSTER_MAX_TOD_GAP_MIN,
  COARSE_STEP_S,
  CONFIDENCE_LEVELS,
  FINE_STEP_S,
  HEATMAP_SLOT_MIN,
  MAX_YEAR,
  MAX_YEAR_SPAN,
  MIN_YEAR,
  RATE_SAFETY_FACTOR,
  SUN_MAX_RATE_DEG_PER_MIN,
} from "./config.ts";
import { Ephemeris } from "./ephemeris.ts";
import { buildObservation } from "./measurement.ts";
import type {
  Atmosphere,
  Cluster,
  Constraints,
  DailyWindow,
  Heatmap,
  LevelSpan,
  Message,
  Observation,
  Shot,
  TimeSolveRequest,
  TimeSolveResult,
} from "./models.ts";
import { type FullFit, levelThreshold, type ScoredShot, Scorer } from "./score.ts";
import type { GeocentricSun } from "./spa.ts";
import { at, last } from "./util.ts";
import { wallParts, wallToUtc } from "./zone.ts";

export type Progress = (fraction: number, phase: Message) => void;
export type SolveOutcome<T> = { ok: true; result: T } | { ok: false; error: Message };

const RATE_DEG_PER_S = SUN_MAX_RATE_DEG_PER_MIN / 60;

/** Builds one observation per shot, or the first input error found. */
export function prepareShots(
  shots: Shot[],
  atm: Atmosphere,
): { ok: true; observations: Observation[] } | { ok: false; error: Message } {
  if (shots.length === 0) return { ok: false, error: { key: "core.err.noShadow" } };
  const observations: Observation[] = [];
  for (const s of shots) {
    const r = buildObservation(s.shadow, atm.refraction);
    if (!r.ok) return { ok: false, error: { ...r.error, shot: s.label } };
    observations.push(r.obs);
  }
  return { ok: true, observations };
}

/** Ephemerides for one candidate time: one geocentric Sun per distinct shot offset. */
class GeoAtOffsets {
  private readonly distinct: number[];
  private readonly index: number[];
  private readonly eph: Ephemeris;
  evaluations = 0;

  constructor(offsetsMs: number[], deltaTOverride: number | null) {
    this.distinct = [...new Set(offsetsMs)];
    this.index = offsetsMs.map((o) => this.distinct.indexOf(o));
    this.eph = new Ephemeris(deltaTOverride);
  }

  at(t: number): GeocentricSun[] {
    const g = this.distinct.map((o) => this.eph.at(t + o));
    this.evaluations += g.length;
    return this.index.map((i) => at(g, i));
  }
}

function makeAllowed(c: Constraints, lon: number) {
  const anyMonth = c.months.every(Boolean);
  const tod = c.todFromMin !== null && c.todToMin !== null;
  return (t: number): boolean => {
    if (c.notBeforeMs !== null && t < c.notBeforeMs) return false;
    if (c.notAfterMs !== null && t > c.notAfterMs) return false;
    if (anyMonth && !tod) return true;
    const w = wallParts(c.zone, t, lon);
    if (!anyMonth && !c.months[w.month]) return false;
    if (tod) {
      const a = c.todFromMin as number;
      const b = c.todToMin as number;
      const m = w.minuteOfDay;
      if (a <= b ? m < a || m > b : m < a && m > b) return false;
    }
    return true;
  };
}

function validate(req: TimeSolveRequest): Message | null {
  const { site, constraints: c } = req;
  if (!(Math.abs(site.lat) <= 90) || !(Math.abs(site.lon) <= 180)) return { key: "core.err.location" };
  if (!(site.radiusM >= 0)) return { key: "core.err.radius" };
  if (!Number.isInteger(c.yearFrom) || !Number.isInteger(c.yearTo)) return { key: "core.err.yearsInteger" };
  if (c.yearFrom > c.yearTo) return { key: "core.err.yearsOrder" };
  if (c.yearFrom < MIN_YEAR || c.yearTo > MAX_YEAR) return { key: "core.err.yearsRange", vars: { min: MIN_YEAR, max: MAX_YEAR } };
  if (c.yearTo - c.yearFrom + 1 > MAX_YEAR_SPAN) return { key: "core.err.yearsSpan", vars: { max: MAX_YEAR_SPAN } };
  if (c.months.length !== 12 || !c.months.some(Boolean)) return { key: "core.err.months" };
  for (const s of req.shots) {
    if (!(s.timeSigmaS >= 0) || !Number.isFinite(s.offsetS)) return { key: "core.err.offset", shot: s.label };
  }
  return null;
}

type Sample = { t: number; fit: FullFit | null; accepted: boolean; excluded: boolean };

function logSumExp(a: number, b: number): number {
  if (a === -Infinity) return b;
  if (b === -Infinity) return a;
  const m = Math.max(a, b);
  return m + Math.log(Math.exp(a - m) + Math.exp(b - m));
}

export function solveTime(req: TimeSolveRequest, progress?: Progress): SolveOutcome<TimeSolveResult> {
  const t0 = Date.now();
  const err = validate(req);
  if (err) return { ok: false, error: err };
  const prep = prepareShots(req.shots, req.atmosphere);
  if (!prep.ok) return prep;
  const observations = prep.observations;

  const { site, constraints: c } = req;
  // WHY: shot 1 defines the timeline, so its own offset/time uncertainty is zero by construction.
  const scored: ScoredShot[] = observations.map((obs, i) => ({
    obs,
    timeSigmaS: i === 0 ? 0 : at(req.shots, i).timeSigmaS,
  }));
  const scorer = new Scorer(scored, req.atmosphere, site.heightM);
  const offsets = req.shots.map((s, i) => (i === 0 ? 0 : s.offsetS * 1000));
  const geo = new GeoAtOffsets(offsets, req.deltaTOverride);
  const allowed = makeAllowed(c, site.lon);
  const thrAccept = levelThreshold(ACCEPT_LEVEL, scorer.dof);
  const radii = scored.map((_, i) => scorer.searchRadius(i, thrAccept, site.radiusM, RATE_DEG_PER_S));
  const margin = RATE_DEG_PER_S * (COARSE_STEP_S / 2) * RATE_SAFETY_FACTOR;

  const accept = (f: FullFit) => f.rangeU <= 1 && (scorer.dof === 0 || f.chi2 <= thrAccept);
  const evaluate = (t: number): Sample => {
    if (!allowed(t)) return { t, fit: null, accepted: false, excluded: true };
    const fit = scorer.fit(geo.at(t), site.lat, site.lon, site.radiusM);
    return { t, fit, accepted: accept(fit), excluded: false };
  };

  const years: number[] = [];
  for (let y = c.yearFrom; y <= c.yearTo; y++) years.push(y);
  const heatShare = 0.35;
  const allWindows: { year: number; w: DailyWindow }[] = [];

  years.forEach((year, yi) => {
    let start = wallToUtc(c.zone, Date.UTC(year, 0, 1), site.lon);
    let end = wallToUtc(c.zone, Date.UTC(year + 1, 0, 1), site.lon) - 1;
    if (c.notBeforeMs !== null) start = Math.max(start, c.notBeforeMs);
    if (c.notAfterMs !== null) end = Math.min(end, c.notAfterMs);
    if (start > end) return;

    // 1. Coarse pass.
    const stepMs = COARSE_STEP_S * 1000;
    const intervals: [number, number][] = [];
    let n = 0;
    for (let t = start; t <= end; t += stepMs, n++) {
      const g = geo.at(t);
      let pass = true;
      for (let i = 0; i < g.length && pass; i++) {
        pass = scorer.coarseDistance(i, at(g, i), site.lat, site.lon) <= at(radii, i) + margin;
      }
      if (pass) {
        const a = Math.max(start, t - stepMs);
        const b = Math.min(end, t + stepMs);
        const last = intervals[intervals.length - 1];
        if (last && a <= last[1]) last[1] = b;
        else intervals.push([a, b]);
      }
      if (n % 5000 === 0) {
        progress?.(((yi + (t - start) / (end - start + 1) * 0.6) / years.length) * (1 - heatShare), { key: "progress.scanning", vars: { year } });
      }
    }

    // 2. Fine pass.
    const fineMs = FINE_STEP_S * 1000;
    intervals.forEach(([a, b], k) => {
      const samples: Sample[] = [];
      for (let t = a; t <= b; t += fineMs) samples.push(evaluate(t));
      // WHY: the coarse bound guarantees accepted runs stay inside the interval; an
      // accepted edge sample therefore signals the search/constraint edge, which is
      // reported as truncation rather than silently extended.
      extractWindows(samples, a <= start, b >= end, scorer.dof).forEach((w) =>
        allWindows.push({ year, w }),
      );
      if (k % 20 === 0) {
        progress?.(((yi + 0.6 + (0.4 * (k + 1)) / intervals.length) / years.length) * (1 - heatShare), { key: "progress.refining", vars: { year } });
      }
    });
  });

  // 3–4. Clusters and probabilities.
  const clusters = buildClusters(allWindows);

  // 5. Heatmap of the first year.
  const heatmap = buildHeatmap(c.yearFrom, req, scorer, geo, allowed, (f) =>
    progress?.(1 - heatShare + heatShare * f, { key: "progress.heatmap" }),
  );

  const warnings = collectWarnings(observations, clusters, req);
  return {
    ok: true,
    result: {
      clusters,
      heatmap,
      observations,
      warnings,
      evaluations: geo.evaluations,
      elapsedMs: Date.now() - t0,
    },
  };
}

function extractWindows(samples: Sample[], atStart: boolean, atEnd: boolean, dof: number): DailyWindow[] {
  const out: DailyWindow[] = [];
  const dtS = FINE_STEP_S;
  let i = 0;
  while (i < samples.length) {
    if (!at(samples, i).accepted) {
      i++;
      continue;
    }
    let j = i;
    while (j + 1 < samples.length && at(samples, j + 1).accepted) j++;
    const run = samples.slice(i, j + 1);
    const before = samples[i - 1];
    const after = samples[j + 1];
    const truncated =
      (before ? before.excluded : atStart) || (after ? after.excluded : atEnd);
    let best = at(run, 0);
    let logW = -Infinity;
    for (const s of run) {
      const f = s.fit as FullFit;
      if (f.misfit < (best.fit as FullFit).misfit) best = s;
      logW = logSumExp(logW, f.logL + Math.log(dtS));
    }
    const levels: LevelSpan[] = [];
    if (dof > 0) {
      for (const lv of CONFIDENCE_LEVELS) {
        const thr = levelThreshold(lv, dof);
        const inside = run.filter((s) => (s.fit as FullFit).chi2 <= thr);
        if (inside.length) {
          levels.push({ level: lv, startMs: at(inside, 0).t, endMs: last(inside).t });
        }
      }
    }
    const bf = best.fit as FullFit;
    out.push({
      startMs: at(run, 0).t,
      endMs: last(run).t,
      bestMs: best.t,
      bestFit: { chi2: bf.chi2, dof: bf.dof, rangeU: bf.rangeU, misfit: bf.misfit, shots: bf.shots },
      levels,
      truncated,
      logWeight: logW,
    });
    i = j + 1;
  }
  return out;
}

function todDiffMin(a: number, b: number): number {
  const m = (((a - b) / 60_000) % 1440 + 1440) % 1440;
  return Math.min(m, 1440 - m);
}

function morning(w: DailyWindow): boolean {
  return at(w.bestFit.shots, 0).solarTimeH < 12;
}

function buildClusters(items: { year: number; w: DailyWindow }[]): Cluster[] {
  items.sort((a, b) => a.w.bestMs - b.w.bestMs);
  const parent = items.map((_, i) => i);
  const find = (i: number): number => {
    const p = at(parent, i);
    if (p === i) return i;
    const root = find(p);
    parent[i] = root;
    return root;
  };
  const maxGapMs = (CLUSTER_MAX_DAY_GAP + 0.5) * 86_400_000;
  for (let i = 0; i < items.length; i++) {
    const a = at(items, i);
    for (let j = i - 1; j >= 0; j--) {
      const b = at(items, j);
      if (a.w.bestMs - b.w.bestMs > maxGapMs) break;
      if (a.year !== b.year) continue;
      // WHY: without azimuth the morning and afternoon solutions touch around the day the
      // Sun's maximum elevation equals the measured one; keeping them apart by the side of
      // solar noon reports them as the two distinct answers they are.
      if (morning(a.w) !== morning(b.w)) continue;
      if (todDiffMin(a.w.bestMs, b.w.bestMs) <= CLUSTER_MAX_TOD_GAP_MIN) {
        parent[find(i)] = find(j);
      }
    }
  }
  const groups = new Map<number, { year: number; w: DailyWindow }[]>();
  items.forEach((it, i) => {
    const r = find(i);
    const g = groups.get(r);
    if (g) g.push(it);
    else groups.set(r, [it]);
  });

  const clusters: Cluster[] = [];
  let id = 0;
  for (const g of groups.values()) {
    const windows = g.map((x) => x.w);
    let best = at(windows, 0);
    let logW = -Infinity;
    for (const w of windows) {
      if (w.bestFit.misfit < best.bestFit.misfit) best = w;
      logW = logSumExp(logW, w.logWeight);
    }
    clusters.push({
      id: id++,
      year: at(g, 0).year,
      windows,
      firstMs: at(windows, 0).startMs,
      lastMs: last(windows).endMs,
      bestMs: best.bestMs,
      bestFit: best.bestFit,
      probability: logW, // normalised below
      truncated: windows.some((w) => w.truncated),
    });
  }
  // Normalise per year (softmax of log weights).
  const byYear = new Map<number, Cluster[]>();
  for (const cl of clusters) byYear.set(cl.year, [...(byYear.get(cl.year) ?? []), cl]);
  for (const list of byYear.values()) {
    const m = Math.max(...list.map((x) => x.probability));
    const sum = list.reduce((a, x) => a + Math.exp(x.probability - m), 0);
    for (const x of list) x.probability = Math.exp(x.probability - m) / sum;
  }
  clusters.sort((a, b) => a.firstMs - b.firstMs);
  clusters.forEach((cl, i) => (cl.id = i));
  return clusters;
}

function buildHeatmap(
  year: number,
  req: TimeSolveRequest,
  scorer: Scorer,
  geo: GeoAtOffsets,
  allowed: (t: number) => boolean,
  progress: (f: number) => void,
): Heatmap {
  const { site, constraints: c } = req;
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const days = leap ? 366 : 365;
  const slotMin = HEATMAP_SLOT_MIN;
  const slots = 1440 / slotMin;
  const values = new Float32Array(days * slots);
  const originWall = Date.UTC(year, 0, 1);
  for (let d = 0; d < days; d++) {
    for (let s = 0; s < slots; s++) {
      const wall = originWall + d * 86_400_000 + (s + 0.5) * slotMin * 60_000;
      const t = wallToUtc(c.zone, wall, site.lon);
      if (!allowed(t)) {
        values[d * slots + s] = NaN;
        continue;
      }
      values[d * slots + s] = scorer.fit(geo.at(t), site.lat, site.lon, site.radiusM).misfit;
    }
    if (d % 15 === 0) progress(d / days);
  }
  return {
    year,
    originMs: wallToUtc(c.zone, originWall, site.lon),
    days,
    slots,
    slotMin,
    values,
  };
}

function nearSolstice(ms: number): boolean {
  const d = new Date(ms);
  const doy = (ms - Date.UTC(d.getUTCFullYear(), 0, 1)) / 86_400_000;
  // June solstice ≈ day 171–172, December ≈ day 354–355.
  return Math.abs(doy - 171.5) < 12 || Math.abs(doy - 354.5) < 12;
}

function collectWarnings(obs: Observation[], clusters: Cluster[], req: TimeSolveRequest): Message[] {
  // De-duplicated by content: several shadows can raise the same warning.
  const w = new Map<string, Message>();
  const add = (m: Message) => w.set(JSON.stringify(m), m);
  obs.forEach((o, i) => o.warnings.forEach((x) => add({ ...x, shot: at(req.shots, i).label })));
  add({ key: "core.warn.noYear" });
  if (obs.every((o) => !o.azimuth)) {
    add({ key: "core.warn.noAzimuth" });
  }
  if (clusters.length === 0) {
    add({ key: "core.warn.noTime" });
  }
  if (clusters.some((cl) => cl.truncated)) {
    add({ key: "core.warn.truncated" });
  }
  if (clusters.some((cl) => nearSolstice(cl.bestMs))) {
    add({ key: "core.warn.solstice" });
  }
  if (clusters.some((cl) => cl.bestFit.dof > 0 && cl.bestFit.chi2 > levelThreshold(0.9545, cl.bestFit.dof))) {
    add({ key: "core.warn.inconsistent" });
  }
  return [...w.values()];
}
