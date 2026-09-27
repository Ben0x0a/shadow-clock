/**
 * worker.ts — runs the solvers off the main thread.
 *
 * Defines: the Web Worker message protocol (WorkerRequest / WorkerMessage) and its handler.
 * Used by: ui/jobs.ts (spawns this worker).
 * Depends on: core/solveTime.ts, core/solveLocation.ts, core/models.ts.
 *
 * WHY: a year-long fine search takes up to a second or two; running it in a worker keeps
 * typing responsive. The UI terminates and replaces the worker when inputs change, which
 * is simpler than cooperative cancellation.
 */

import type { LocationSolveRequest, LocationSolveResult, TimeSolveRequest, TimeSolveResult } from "./core/models";
import { solveLocation } from "./core/solveLocation";
import { solveTime } from "./core/solveTime";

export type WorkerRequest =
  | { id: number; kind: "time"; req: TimeSolveRequest }
  | { id: number; kind: "place"; req: LocationSolveRequest };

export type WorkerMessage =
  | { id: number; type: "progress"; fraction: number; phase: string }
  | { id: number; type: "time"; result: TimeSolveResult }
  | { id: number; type: "place"; result: LocationSolveResult }
  | { id: number; type: "error"; error: string };

const post = (m: WorkerMessage, transfer: Transferable[] = []) =>
  (self as unknown as Worker).postMessage(m, transfer);

self.onmessage = (ev: MessageEvent<WorkerRequest>) => {
  const msg = ev.data;
  const progress = (fraction: number, phase: string) => post({ id: msg.id, type: "progress", fraction, phase });
  try {
    if (msg.kind === "time") {
      const r = solveTime(msg.req, progress);
      if (!r.ok) post({ id: msg.id, type: "error", error: r.error });
      else post({ id: msg.id, type: "time", result: r.result }, r.result.heatmap ? [r.result.heatmap.values.buffer] : []);
    } else {
      const r = solveLocation(msg.req, progress);
      if (!r.ok) post({ id: msg.id, type: "error", error: r.error });
      else post({ id: msg.id, type: "place", result: r.result });
    }
  } catch (e) {
    // WHY: an unexpected failure must surface in the UI instead of leaving a spinner forever.
    post({ id: msg.id, type: "error", error: `Internal error: ${e instanceof Error ? e.message : String(e)}` });
  }
};
