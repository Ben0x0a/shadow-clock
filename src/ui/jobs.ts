/**
 * jobs.ts — runs solver jobs in the Web Worker, one at a time.
 *
 * Defines: JobRunner.
 * Used by: main.ts.
 * Depends on: worker.ts (protocol types and module URL).
 *
 * HOW: a new job terminates the running worker and starts a fresh one, so stale results
 * can never arrive after newer inputs. Message ids guard against late messages too.
 */

import type { WorkerMessage, WorkerRequest } from "../worker";

type Handlers = {
  progress: (fraction: number, phase: string) => void;
  done: (m: Extract<WorkerMessage, { type: "time" | "place" }>) => void;
  error: (e: string) => void;
};

type Job = { kind: "time"; req: Extract<WorkerRequest, { kind: "time" }>["req"] } | { kind: "place"; req: Extract<WorkerRequest, { kind: "place" }>["req"] };

export class JobRunner {
  private worker: Worker | null = null;
  private busy = false;
  private id = 0;

  run(job: Job, handlers: Handlers): void {
    if (this.worker && this.busy) {
      this.worker.terminate();
      this.worker = null;
    }
    this.worker ??= new Worker(new URL("../worker.ts", import.meta.url), { type: "module" });
    const id = ++this.id;
    this.busy = true;
    this.worker.onmessage = (ev: MessageEvent<WorkerMessage>) => {
      const m = ev.data;
      if (m.id !== id) return;
      if (m.type === "progress") return handlers.progress(m.fraction, m.phase);
      this.busy = false;
      if (m.type === "error") handlers.error(m.error);
      else handlers.done(m);
    };
    this.worker.onerror = (e) => {
      this.busy = false;
      handlers.error(`Worker failed: ${e.message}`);
    };
    this.worker.postMessage({ id, ...job } as WorkerRequest);
  }
}
