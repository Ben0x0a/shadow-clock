/**
 * operations.ts — ShadowClock's operations: one function per thing the app computes.
 *
 * Defines: findTime(), findPlace(), checkClaim(), example(), EXAMPLE_NAMES, and their
 *          value types.
 * Used by: cli/main.ts (one command each), features/claim (checkClaim).
 * Depends on: core/request.ts (case → request), core/solveTime.ts, core/solveLocation.ts,
 *             core/claimCheck.ts, core/examples.ts, api/results.ts, api/messages.ts.
 *
 * HOW: each operation takes a case (AppState, read with readCase()), builds the solver
 * request exactly as the page does, solves it, and returns the request with the results,
 * so the output says what was solved. The mode stored in the case is ignored: the
 * operation says what to compute.
 * WHY synchronous: the solvers are synchronous; the page runs the same core functions in
 * a Web Worker (workers/solver.ts) to keep typing responsive.
 */

import { checkClaim as solveClaim } from "../core/claimCheck.ts";
import { EXAMPLES } from "../core/examples.ts";
import type { AppState } from "../core/form.ts";
import type { ClaimOffsetResult, ClaimRequest, LocationSolveRequest, Message, TimeSolveRequest } from "../core/models.ts";
import { buildClaimRequest, buildPlaceRequest, buildTimeRequest, type Built } from "../core/request.ts";
import { solveLocation } from "../core/solveLocation.ts";
import { solveTime } from "../core/solveTime.ts";
import type { ApiResult } from "./case.ts";
import { formatMessage, translate } from "./messages.ts";
import { type PlaceResults, placeResults, type TimeResults, timeResults } from "./results.ts";

export interface TimeValue { request: TimeSolveRequest; results: TimeResults }
export interface PlaceValue { request: LocationSolveRequest; results: PlaceResults }
export interface ClaimValue { request: ClaimRequest; results: ClaimOffsetResult[] }

/** Failure listing every message, one per line (all field errors at once). */
function invalid(messages: Message[]): { ok: false; code: string; message: string; messages: Message[] } {
  return { ok: false, code: "invalid-case", message: messages.map(formatMessage).join("\n"), messages };
}

function built<T>(b: Built<T>): ApiResult<T> {
  return b.ok ? { ok: true, value: b.req } : invalid(b.errors.map((e) => e.msg));
}

/** Time mode: known place, shadows → the dates and times compatible with every bound. */
export function findTime(state: AppState): ApiResult<TimeValue> {
  const req = built(buildTimeRequest(state));
  if (!req.ok) return req;
  const r = solveTime(req.value);
  return r.ok ? { ok: true, value: { request: req.value, results: timeResults(r.result) } } : invalid([r.error]);
}

/** Place mode: shadows at known times → the places compatible with every bound. */
export function findPlace(state: AppState): ApiResult<PlaceValue> {
  const req = built(buildPlaceRequest(state));
  if (!req.ok) return req;
  const r = solveLocation(req.value);
  return r.ok ? { ok: true, value: { request: req.value, results: placeResults(r.result) } } : invalid([r.error]);
}

/** Checks the case's claimed time (e.g. EXIF) against the shadows, for each plausible UTC offset. */
export function checkClaim(state: AppState): ApiResult<ClaimValue> {
  const req = built(buildClaimRequest(state));
  if (!req.ok) return req;
  const r = solveClaim(req.value);
  return r.ok ? { ok: true, value: { request: req.value, results: r.result.results } } : invalid([r.error]);
}

/** Example names on the command line: the string key without its "ex." prefix. */
export const EXAMPLE_NAMES = EXAMPLES.map((e) => e.label.replace(/^ex\./, ""));

/** A built-in example case (physically consistent; its description states the true answer). */
export function example(name: string): ApiResult<AppState> {
  const i = EXAMPLE_NAMES.indexOf(name);
  const ex = EXAMPLES[i];
  if (!ex) return { ok: false, code: "unknown-example", message: `Unknown example "${name}". Known: ${EXAMPLE_NAMES.join(", ")}.` };
  return { ok: true, value: ex.build(translate) };
}
