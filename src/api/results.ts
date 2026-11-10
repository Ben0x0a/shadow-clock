/**
 * results.ts — the exported form of solver results (JSON-safe, attributable).
 *
 * Defines: TimeResults, PlaceResults, timeResults(), placeResults().
 * Used by: api/operations.ts (command line), features/share-export/report.ts (page report).
 * Depends on: core/models.ts.
 *
 * WHY one shape for the page report and the command line: a result computed either way
 * can be compared field by field.
 * WHY drop `probability`: with declared bounds it is only a duration (or area) share, and
 * a forensic report must not present it as a probability. The heat map is dropped too:
 * it is a display aid (a typed array), not a result.
 */

import type { Cluster, GeoCell, GeoRegion, LocationSolveResult, Message, Observation, TimeSolveResult } from "../core/models.ts";

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
