/**
 * report.ts — exportable, attributable reports (JSON and print).
 *
 * Defines: exportReport(), printReport(), APP_NAME, APP_VERSION.
 * Used by: main.ts.
 * Depends on: ui/state.ts, core/models.ts, core/config.ts, package.json (version).
 *
 * HOW: the JSON report carries the application name and version, the method and its
 * parameters, the exact form inputs, the parsed request, the results, and a SHA-256
 * digest of the canonical inputs, so a result can be reproduced and attributed.
 * The filename also names the application (`*.shadowclock.report.json`), as required for
 * forensic traceability artefacts.
 */

import pkg from "../../package.json";
import * as cfg from "../core/config";
import type { LocationSolveRequest, LocationSolveResult, TimeSolveRequest, TimeSolveResult } from "../core/models";
import type { AppState } from "./state";

export const APP_NAME = "ShadowClock";
export const APP_VERSION: string = pkg.version;

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function stamp(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}-${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`;
}

export type Solved =
  | { mode: "time"; req: TimeSolveRequest; res: TimeSolveResult }
  | { mode: "place"; req: LocationSolveRequest; res: LocationSolveResult };

export async function exportReport(state: AppState, solved: Solved | null): Promise<void> {
  const inputs = JSON.stringify(state);
  const results =
    solved?.mode === "time"
      ? {
          // WHY drop `probability`: with declared bounds it is only a duration share, and a
          // forensic report must not present it as a probability.
          clusters: solved.res.clusters.map(({ probability: _p, ...c }) => c),
          warnings: solved.res.warnings,
          observations: solved.res.observations,
        }
      : solved?.mode === "place"
        ? { regions: solved.res.regions.map(({ probability: _p, ...r }) => r), resolutionDeg: solved.res.resolutionDeg, cellCount: solved.res.cells.length, cells: solved.res.cells, warnings: solved.res.warnings, observations: solved.res.observations }
        : null;
  const report = {
    application: { name: APP_NAME, version: APP_VERSION, url: location.origin + location.pathname },
    generatedAtUtc: new Date().toISOString(),
    mode: state.mode,
    method: {
      solarPosition: "NREL SPA (Reda & Andreas 2004), stated accuracy ±0.0003°; hourly-interpolated geocentric terms (error < 1e-5°)",
      deltaT: "Espenak & Meeus (2006) polynomials unless overridden",
      refraction: "SPA refraction for apparent elevation; Bennett (1982) for the measurement correction, bounded at ± " + 2 * cfg.REFRACTION_REL_SIGMA * 100 + " %",
      sunSemiDiameterDeg: cfg.SUN_SEMI_DIAMETER_DEG,
      uncertaintyModel: "Operator-declared tolerances treated as hard bounds; physical terms and place/time tolerances propagated as bounds; a time or place is reported when it lies inside every bound",
      coarseStepS: cfg.COARSE_STEP_S,
      fineStepS: cfg.FINE_STEP_S,
    },
    inputsSha256: await sha256(inputs),
    inputs: state,
    request: solved?.req ?? null,
    results,
  };
  const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${stamp()}.shadowclock.report.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

export async function printReport(state: AppState): Promise<void> {
  const header = document.getElementById("print-header");
  if (header) {
    header.textContent = `${APP_NAME} ${APP_VERSION} · report generated ${new Date().toISOString()} · inputs SHA-256 ${await sha256(JSON.stringify(state))}`;
  }
  // WHY open every collapsible first: closed <details> would print as a bare heading.
  const closed = [...document.querySelectorAll<HTMLDetailsElement>("details:not([open])")];
  closed.forEach((d) => (d.open = true));
  window.print();
  closed.forEach((d) => (d.open = false));
}
