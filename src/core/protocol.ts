/**
 * protocol.ts — messages between the page and the solver Web Worker.
 *
 * Defines: WorkerRequest (page → worker), WorkerMessage (worker → page).
 * Used by: workers/solver.ts, state/solve.ts.
 * Depends on: core/models.ts, core/form.ts (AppState), core/request.ts (FieldError).
 *
 * WHY in core: both sides must agree on the shape, and neither layer may import the other.
 * WHY the page sends the case, not a request: the worker runs the api/ operations, which
 * validate and build the request themselves (the same path as the command line); form
 * errors come back as "invalid" with the field each one marks.
 */

import type { AppState } from "./form.ts";
import type { LocationSolveRequest, LocationSolveResult, Message, TimeSolveRequest, TimeSolveResult } from "./models.ts";
import type { FieldError } from "./request.ts";

export type WorkerRequest = { id: number; kind: "time" | "place"; state: AppState };

export type WorkerMessage =
  | { id: number; type: "progress"; fraction: number; phase: Message }
  | { id: number; type: "time"; req: TimeSolveRequest; result: TimeSolveResult }
  | { id: number; type: "place"; req: LocationSolveRequest; result: LocationSolveResult }
  | { id: number; type: "invalid"; errors: FieldError[] }
  | { id: number; type: "error"; error: Message };
