/**
 * solve.ts — solves the case in the "solver" Web Worker, one job at a time.
 *
 * Defines: JobRunner, SolveSession (live solving of the case), Solved, SolveStatus.
 * Used by: main.ts; features/results, features/claim, features/share-export.
 * Depends on: core/protocol.ts, core/request.ts, core/models.ts, state/case.ts.
 *
 * HOW: a new job terminates the running worker and starts a fresh one, so stale results
 * can never arrive after newer inputs. Message ids guard against late messages too.
 */

import type { LocationSolveRequest, LocationSolveResult, Message, TimeSolveRequest, TimeSolveResult } from "../core/models.ts";
import type { WorkerMessage, WorkerRequest } from "../core/protocol.ts";
import { buildPlaceRequest, buildTimeRequest, type FieldError } from "../core/request.ts";
import type { CaseStore } from "./case.ts";

type Handlers = {
  progress: (fraction: number, phase: Message) => void;
  done: (m: Extract<WorkerMessage, { type: "time" | "place" }>) => void;
  error: (e: Message) => void;
};

type Job = { kind: "time"; req: Extract<WorkerRequest, { kind: "time" }>["req"] } | { kind: "place"; req: Extract<WorkerRequest, { kind: "place" }>["req"] };

export class JobRunner {
  private readonly createWorker: () => Worker;
  private worker: Worker | null = null;
  private busy = false;
  private id = 0;

  /** `createWorker` is `() => platform.worker("solver")`. */
  constructor(createWorker: () => Worker) {
    this.createWorker = createWorker;
  }

  run(job: Job, handlers: Handlers): void {
    if (this.worker && this.busy) {
      this.worker.terminate();
      this.worker = null;
    }
    this.worker ??= this.createWorker();
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
      handlers.error({ key: "core.err.worker", vars: { detail: e.message } });
    };
    this.worker.postMessage({ id, ...job } as WorkerRequest);
  }
}

export type Solved =
  | { mode: "time"; req: TimeSolveRequest; res: TimeSolveResult }
  | { mode: "place"; req: LocationSolveRequest; res: LocationSolveResult };

/** What the results area shows. */
export type SolveStatus =
  | { kind: "invalid"; errors: FieldError[] }
  | { kind: "running"; fraction: number; phase: Message | null }
  | { kind: "done"; solved: Solved }
  | { kind: "error"; error: Message };

type StatusListener = (s: SolveStatus) => void;

/**
 * Re-solves the case after each change (debounced) and publishes the status.
 * HOW: build the request (inline validation) → worker job → latest result.
 */
export class SolveSession {
  status: SolveStatus = { kind: "invalid", errors: [] };
  /** Field keys currently invalid (inline marks). */
  invalid = new Set<string>();
  /** The latest finished result, kept while a newer job runs (shown as stale). */
  solved: Solved | null = null;
  private readonly cases: CaseStore;
  private readonly jobs: JobRunner;
  private readonly listeners: StatusListener[] = [];
  private timer = 0;

  constructor(cases: CaseStore, jobs: JobRunner) {
    this.cases = cases;
    this.jobs = jobs;
  }

  subscribe(l: StatusListener): void {
    this.listeners.push(l);
  }

  private publish(s: SolveStatus): void {
    this.status = s;
    for (const l of this.listeners) l(s);
  }

  schedule(): void {
    clearTimeout(this.timer);
    this.timer = window.setTimeout(() => this.solve(), 350);
  }

  solve(): void {
    clearTimeout(this.timer);
    const s = this.cases.state;
    const built = s.mode === "time" ? buildTimeRequest(s) : buildPlaceRequest(s);
    this.invalid = new Set(built.ok ? [] : built.errors.map((e) => e.key));
    if (!built.ok) {
      this.solved = null;
      this.publish({ kind: "invalid", errors: built.errors });
      return;
    }
    this.publish({ kind: "running", fraction: 0, phase: null });
    const req = built.req;
    const job: Job = s.mode === "time" ? { kind: "time", req: req as TimeSolveRequest } : { kind: "place", req: req as LocationSolveRequest };
    this.jobs.run(job, {
      progress: (fraction, phase) => this.publish({ kind: "running", fraction, phase }),
      done: (m) => {
        this.solved = m.type === "time"
          ? { mode: "time", req: req as TimeSolveRequest, res: m.result }
          : { mode: "place", req: req as LocationSolveRequest, res: m.result };
        this.publish({ kind: "done", solved: this.solved });
      },
      error: (error) => {
        this.solved = null;
        this.publish({ kind: "error", error });
      },
    });
  }
}
