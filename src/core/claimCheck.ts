/**
 * claimCheck.ts — tests a claimed timestamp (e.g. EXIF DateTimeOriginal) against the shadows.
 *
 * Defines: checkClaim().
 * Used by: worker.ts, tests/claimCheck.test.ts.
 * Depends on: core/score.ts, core/solveTime.ts (prepareShots), core/ephemeris.ts,
 *             core/config.ts, core/models.ts.
 *
 * HOW: the claimed wall-clock time of shot 1 is converted to UTC with the given offset, or,
 * when the offset is unknown, with every offset from −12:00 to +14:00 in OFFSET_SCAN_STEP_MIN
 * steps. The other shots follow at their offsets. Each candidate gets the same joint fit
 * as in time mode, and is reported with the smallest confidence region that contains it.
 * WHY: EXIF times are usually local wall-clock times without an offset. Scanning the
 * offsets shows which time zones (or camera clock errors) are compatible with the shadows,
 * which is often the forensic question itself.
 */

import { OFFSET_SCAN_STEP_MIN } from "./config";
import { Ephemeris } from "./ephemeris";
import type { ClaimOffsetResult, ClaimRequest, ClaimResult } from "./models";
import { acceptedLevel, type ScoredShot, Scorer } from "./score";
import { prepareShots, type SolveOutcome } from "./solveTime";

export function checkClaim(req: ClaimRequest): SolveOutcome<ClaimResult> {
  if (!Number.isFinite(req.wallClockMs)) return { ok: false, error: "Enter the claimed date and time" };
  const prep = prepareShots(req.shots, req.atmosphere);
  if (!prep.ok) return prep;
  const scored: ScoredShot[] = prep.observations.map((obs, i) => ({
    obs,
    timeSigmaS: i === 0 ? 0 : req.shots[i].timeSigmaS,
  }));
  const scorer = new Scorer(scored, req.atmosphere, req.site.heightM);
  const eph = new Ephemeris(req.deltaTOverride);
  const offsets: number[] = [];
  if (req.offsetMin !== null) offsets.push(req.offsetMin);
  else for (let m = -12 * 60; m <= 14 * 60; m += OFFSET_SCAN_STEP_MIN) offsets.push(m);

  const results: ClaimOffsetResult[] = offsets.map((offsetMin) => {
    const utcMs = req.wallClockMs - offsetMin * 60_000;
    const geos = req.shots.map((s, i) => eph.at(utcMs + (i === 0 ? 0 : s.offsetS * 1000)));
    const f = scorer.fit(geos, req.site.lat, req.site.lon, req.site.radiusM);
    const fit = { chi2: f.chi2, dof: f.dof, rangeU: f.rangeU, misfit: f.misfit, shots: f.shots };
    return { offsetMin, utcMs, fit, acceptedLevel: acceptedLevel(fit) };
  });
  return { ok: true, result: { results } };
}
