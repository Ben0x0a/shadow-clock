/**
 * solver.ts — Web Worker "solver" (site.json "workers"): runs the solvers off the main thread.
 *
 * Defines: the worker's message handler.
 * Used by: state/solve.ts (platform.worker("solver")).
 * Depends on: core/protocol.ts, core/solveTime.ts, core/solveLocation.ts, core/models.ts.
 *
 * WHY: a year-long fine search takes up to a second or two; running it in a worker keeps
 * typing responsive. The UI terminates and replaces the worker when inputs change, which
 * is simpler than cooperative cancellation.
 */

import type { Message } from "../core/models.ts";
import type { WorkerMessage, WorkerRequest } from "../core/protocol.ts";
import { solveLocation } from "../core/solveLocation.ts";
import { solveTime } from "../core/solveTime.ts";

const post = (m: WorkerMessage, transfer: Transferable[] = []) =>
  (self as unknown as Worker).postMessage(m, transfer);

self.onmessage = (ev: MessageEvent<WorkerRequest>) => {
  const msg = ev.data;
  const progress = (fraction: number, phase: Message) => post({ id: msg.id, type: "progress", fraction, phase });
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
    post({ id: msg.id, type: "error", error: { key: "core.err.internal", vars: { detail: e instanceof Error ? e.message : String(e) } } });
  }
};
