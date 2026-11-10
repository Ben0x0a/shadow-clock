/**
 * solver.ts — Web Worker "solver" (site.json "workers"): runs the operations off the main thread.
 *
 * Defines: the worker's message handler.
 * Used by: state/solve.ts (platform.worker("solver")).
 * Depends on: core/protocol.ts, core/models.ts, api/operations.ts (findTime, findPlace).
 *
 * WHY: a year-long fine search takes up to a second or two; running it in a worker keeps
 * typing responsive. The UI terminates and replaces the worker when inputs change, which
 * is simpler than cooperative cancellation.
 * HOW: the case goes through the same api/ operations as the command line; a failure with
 * `fields` is a form error (marked inline), any other failure a solver message.
 */

import { findPlace, findTime } from "../api/operations.ts";
import type { ApiResult } from "../api/case.ts";
import type { Message } from "../core/models.ts";
import type { WorkerMessage, WorkerRequest } from "../core/protocol.ts";

const post = (m: WorkerMessage, transfer: Transferable[] = []) =>
  (self as unknown as Worker).postMessage(m, transfer);

function failure(id: number, r: Extract<ApiResult<unknown>, { ok: false }>): void {
  if (r.fields) post({ id, type: "invalid", errors: r.fields });
  else post({ id, type: "error", error: r.messages?.[0] ?? { key: "core.err.internal", vars: { detail: r.message } } });
}

self.onmessage = (ev: MessageEvent<WorkerRequest>) => {
  const { id, kind, state } = ev.data;
  const progress = (fraction: number, phase: Message) => post({ id, type: "progress", fraction, phase });
  try {
    if (kind === "time") {
      const r = findTime(state, progress);
      if (!r.ok) return failure(id, r);
      const { request, result } = r.value;
      post({ id, type: "time", req: request, result }, result.heatmap ? [result.heatmap.values.buffer] : []);
    } else {
      const r = findPlace(state, progress);
      if (!r.ok) return failure(id, r);
      post({ id, type: "place", req: r.value.request, result: r.value.result });
    }
  } catch (e) {
    // WHY: an unexpected failure must surface in the UI instead of leaving a spinner forever.
    post({ id, type: "error", error: { key: "core.err.internal", vars: { detail: e instanceof Error ? e.message : String(e) } } });
  }
};
