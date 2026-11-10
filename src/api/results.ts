/**
 * results.ts — what the operations return, and its exported form (JSON-safe, attributable).
 *
 * Defines: TimeSolved, PlaceSolved (full results, for the page); TimeResults,
 *          PlaceResults, TimeValue, PlaceValue (exported form); timeResults(),
 *          placeResults(), exportTime(), exportPlace().
 * Used by: api/operations.ts, cli/commands.ts (command line output),
 *          features/share-export/report.ts (page report).
 * Depends on: core/models.ts.
 *
 * WHY one exported shape for the page report and the command line: a result computed
 * either way can be compared field by field.
 * WHY drop `probability`: with declared bounds it is only a duration (or area) share, and
 * a forensic report must not present it as a probability. The heat map is dropped too:
 * it is a display aid (a typed array), not a result.
 */

import type {
  Cluster, GeoCell, GeoRegion, LocationSolveRequest, LocationSolveResult, Message, Observation, TimeSolveRequest, TimeSolveResult,
} from "../core/models.ts";

/** The request solved and the solver's full result (heat map included). */
export interface TimeSolved { request: TimeSolveRequest; result: TimeSolveResult }
export interface PlaceSolved { request: LocationSolveRequest; result: LocationSolveResult }

export interface TimeResults {
  clusters: Omit<Cluster, "probability">[];
  warnings: Message[];
  observations: Observation[];
}

export interface PlaceResults {
  regions: Omit<GeoRegion, "probability">[];
  resolutionDeg: number;
  cellCount: number;
  cells: GeoCell[];
  warnings: Message[];
  observations: Observation[];
}

/** Exported form: the request and the results, as the page's JSON report has them. */
export interface TimeValue { request: TimeSolveRequest; results: TimeResults }
export interface PlaceValue { request: LocationSolveRequest; results: PlaceResults }

export function timeResults(res: TimeSolveResult): TimeResults {
  return {
    clusters: res.clusters.map(({ probability: _p, ...c }) => c),
    warnings: res.warnings,
    observations: res.observations,
  };
}

export function placeResults(res: LocationSolveResult): PlaceResults {
  return {
    regions: res.regions.map(({ probability: _p, ...r }) => r),
    resolutionDeg: res.resolutionDeg,
    cellCount: res.cells.length,
    cells: res.cells,
    warnings: res.warnings,
    observations: res.observations,
  };
}

export const exportTime = (s: TimeSolved): TimeValue => ({ request: s.request, results: timeResults(s.result) });
export const exportPlace = (s: PlaceSolved): PlaceValue => ({ request: s.request, results: placeResults(s.result) });
