/**
 * protocol.ts — messages between the page and the solver Web Worker.
 *
 * Defines: WorkerRequest (page → worker), WorkerMessage (worker → page).
 * Used by: workers/solver.ts, state/solve.ts.
 * Depends on: core/models.ts.
 *
 * WHY in core: both sides must agree on the shape, and neither layer may import the other.
 */

import type { LocationSolveRequest, LocationSolveResult, Message, TimeSolveRequest, TimeSolveResult } from "./models.ts";

export type WorkerRequest =
  | { id: number; kind: "time"; req: TimeSolveRequest }
  | { id: number; kind: "place"; req: LocationSolveRequest };

export type WorkerMessage =
  | { id: number; type: "progress"; fraction: number; phase: Message }
  | { id: number; type: "time"; result: TimeSolveResult }
  | { id: number; type: "place"; result: LocationSolveResult }
  | { id: number; type: "error"; error: Message };
