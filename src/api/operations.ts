/**
 * operations.ts — ShadowClock's operations: one function per thing the app computes.
 *
 * Defines: findTime(), findPlace(), checkClaim(), ClaimValue.
 * Used by: cli/commands.ts (one command each), workers/solver.ts (findTime, findPlace:
 *          the page's live solving), features/claim (checkClaim).
 * Depends on: core/request.ts (case → request, validation), core/solveTime.ts,
 *             core/solveLocation.ts, core/claimCheck.ts, api/results.ts, api/messages.ts.
 *
 * HOW: each operation takes a case (AppState, read with readCase()), validates it, builds
 * the solver request, solves it, and returns the request with the full result, so the
 * output says what was solved. The mode stored in the case is ignored: the operation says
 * what to compute. A case that fails validation returns every form error with the field it
 * marks (`fields`), which the page shows inline.
 * WHY synchronous with a progress callback: the solvers are synchronous; the page calls
 * these operations inside a Web Worker (workers/solver.ts) to keep typing responsive, and
 * forwards the progress to the status line.
 */

import { checkClaim as solveClaim } from "../core/claimCheck.ts";
import type { AppState } from "../core/form.ts";
import type { ClaimOffsetResult, ClaimRequest, Message } from "../core/models.ts";
import { buildClaimRequest, buildPlaceRequest, buildTimeRequest, type Built } from "../core/request.ts";
import { solveLocation } from "../core/solveLocation.ts";
import { type Progress, solveTime } from "../core/solveTime.ts";
import type { ApiResult } from "./case.ts";
import { formatMessage } from "./messages.ts";
import type { PlaceSolved, TimeSolved } from "./results.ts";

export interface ClaimValue { request: ClaimRequest; results: ClaimOffsetResult[] }

/** Failure listing every message, one per line (all field errors at once). */
function invalid(messages: Message[]): { ok: false; code: string; message: string; messages: Message[] } {
  return { ok: false, code: "invalid-case", message: messages.map(formatMessage).join("\n"), messages };
}

function built<T>(b: Built<T>): ApiResult<T> {
  return b.ok ? { ok: true, value: b.req } : { ...invalid(b.errors.map((e) => e.msg)), fields: b.errors };
}

/** Time mode: known place, shadows → the dates and times compatible with every bound. */
export function findTime(state: AppState, progress?: Progress): ApiResult<TimeSolved> {
  const req = built(buildTimeRequest(state));
  if (!req.ok) return req;
  const r = solveTime(req.value, progress);
  return r.ok ? { ok: true, value: { request: req.value, result: r.result } } : invalid([r.error]);
}

/** Place mode: shadows at known times → the places compatible with every bound. */
export function findPlace(state: AppState, progress?: Progress): ApiResult<PlaceSolved> {
  const req = built(buildPlaceRequest(state));
  if (!req.ok) return req;
  const r = solveLocation(req.value, progress);
  return r.ok ? { ok: true, value: { request: req.value, result: r.result } } : invalid([r.error]);
}

/** Checks the case's claimed time (e.g. EXIF) against the shadows, for each plausible UTC offset. */
export function checkClaim(state: AppState): ApiResult<ClaimValue> {
  const req = built(buildClaimRequest(state));
  if (!req.ok) return req;
  const r = solveClaim(req.value);
  return r.ok ? { ok: true, value: { request: req.value, results: r.result.results } } : invalid([r.error]);
}
