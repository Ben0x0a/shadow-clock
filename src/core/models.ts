/**
 * models.ts — data types shared by the core, the worker and the UI.
 *
 * Defines: measurement inputs (one Shot per shadow), the derived Observation, site and
 *          atmosphere, constraints, display zones, and request/result types for the
 *          time solver, the location solver and the claimed-time check.
 * Used by: every module under core/, worker.ts, ui/*.
 * Depends on: nothing (types only).
 */

/** A measured quantity: either a Gaussian (value ± 1σ) or a hard range [min, max]. */
export type Uncertain =
  | { kind: "gauss"; value: number; sigma: number }
  | { kind: "range"; min: number; max: number };

export type ErrorKind = Uncertain["kind"];

/** Where on the fuzzy shadow tip the length was measured (penumbra handling). */
export type TipEdge = "unknown" | "midpoint" | "umbra" | "outer";

/** The three accepted ways to give the Sun's elevation. */
export type ElevationInput =
  | { method: "lengths"; height: Uncertain; shadow: Uncertain }
  | { method: "ratio"; ratio: Uncertain }
  | { method: "angle"; angle: Uncertain };

export interface AzimuthInput {
  shadow: Uncertain;
  reference: "true" | "magnetic";
  /** Magnetic declination, degrees, east positive (true = magnetic + declination). */
  declinationDeg: number;
}

/** Measurement of one shadow cast by one vertical object. */
export interface ShadowInput {
  elevation: ElevationInput;
  tipEdge: TipEdge;
  /** Maximum tilt of the object from vertical, degrees (0 = perfectly vertical). */
  maxTiltDeg: number;
  /** Shadow azimuth (direction from the object base to the shadow tip), or null if unknown. */
  azimuth: AzimuthInput | null;
}

/**
 * One shadow and when it was cast.
 * In time mode the absolute time is unknown; `offsetS` places the shot relative to the
 * first shot (0 = same photo / same moment). In location mode `timeMs` is the absolute UTC
 * time of the shot. `timeSigmaS` is the 1σ (Gaussian) or maximum (range) uncertainty
 * on that offset or time, in seconds.
 */
export interface Shot {
  id: string;
  label: string;
  shadow: ShadowInput;
  offsetS: number;
  timeMs: number;
  timeSigmaS: number;
}

/** One observed component after conversion to Sun coordinates. */
export type Component =
  | { kind: "gauss"; centre: number; sigma: number }
  | { kind: "range"; centre: number; half: number };

/** One line of the error budget (all values in degrees). */
export interface BudgetItem {
  label: string;
  /** 1σ for Gaussian components, half-width for range components. */
  amount: number;
}

/** The measurement of one shadow expressed as the apparent Sun position it implies. */
export interface Observation {
  /** Apparent Sun elevation (refraction-aware, see `refraction`), degrees. */
  elevation: Component;
  /** Sun azimuth, degrees clockwise from true north, or null when not measured. */
  azimuth: Component | null;
  elevationBudget: BudgetItem[];
  azimuthBudget: BudgetItem[];
  warnings: string[];
}

export interface Site {
  lat: number;
  lon: number;
  /** Height above sea level, metres (parallax only; negligible in practice). */
  heightM: number;
  /** The true position lies within this radius of (lat, lon), metres. */
  radiusM: number;
}

export interface Atmosphere {
  pressureHpa: number;
  temperatureC: number;
  /** Apply atmospheric refraction (true for real photos). */
  refraction: boolean;
}

/** How times are shown and how time-of-day / month constraints are interpreted. */
export type Zone =
  | { kind: "utc" }
  | { kind: "offset"; minutes: number }
  | { kind: "iana"; name: string }
  | { kind: "solar" };

export interface Constraints {
  yearFrom: number;
  yearTo: number;
  /** Months allowed (index 0 = January). All true = no restriction. */
  months: boolean[];
  /** Allowed time of day in the constraint zone, minutes since midnight; null = any. */
  todFromMin: number | null;
  todToMin: number | null;
  /** Absolute bounds in UTC epoch milliseconds; null = none. */
  notBeforeMs: number | null;
  notAfterMs: number | null;
  zone: Zone;
}

export interface TimeSolveRequest {
  shots: Shot[];
  site: Site;
  atmosphere: Atmosphere;
  constraints: Constraints;
  /** ΔT (TT − UT) override in seconds; null = model value. */
  deltaTOverride: number | null;
}

/** The fit of one candidate against all shots. */
export interface Fit {
  /** χ² over Gaussian components of all shots (0 when none). */
  chi2: number;
  /** Number of Gaussian components (degrees of freedom). */
  dof: number;
  /** Largest |residual| / half-width over range components (≤ 1 means inside). */
  rangeU: number;
  /** Normalised misfit: ≤ 1 means inside the 95 % region (and all ranges). */
  misfit: number;
  /** Per-shot Sun position and residuals, same order as the request's shots. */
  shots: ShotFit[];
}

export interface ShotFit {
  sunElevation: number;
  sunAzimuth: number;
  residualElevation: number;
  residualAzimuth: number | null;
  /** Local apparent solar time, hours [0, 24). */
  solarTimeH: number;
}

export interface LevelSpan {
  level: number;
  startMs: number;
  endMs: number;
}

/** A contiguous run of accepted times on one day (times are those of shot 1). */
export interface DailyWindow {
  startMs: number;
  endMs: number;
  bestMs: number;
  bestFit: Fit;
  /** Nested sub-spans at each confidence level (Gaussian only; empty otherwise). */
  levels: LevelSpan[];
  /** True if the window was cut by a constraint or the search range. */
  truncated: boolean;
  /** ln ∫ likelihood dt (Gaussian part; plain accepted duration for range-only inputs). */
  logWeight: number;
}

/** Windows on neighbouring days at a similar time of day — one physical solution. */
export interface Cluster {
  id: number;
  year: number;
  windows: DailyWindow[];
  firstMs: number;
  lastMs: number;
  bestMs: number;
  bestFit: Fit;
  /** Share of the total weight across all clusters in the same year (0..1). */
  probability: number;
  truncated: boolean;
}

export interface Heatmap {
  year: number;
  /** UTC ms of day 0, 00:00 in the constraint zone. */
  originMs: number;
  days: number;
  slots: number;
  slotMin: number;
  /** Misfit per cell, row-major [day * slots + slot]; NaN where excluded by constraints. */
  values: Float32Array;
}

export interface TimeSolveResult {
  clusters: Cluster[];
  heatmap: Heatmap | null;
  observations: Observation[];
  warnings: string[];
  evaluations: number;
  elapsedMs: number;
}

export interface LocationSolveRequest {
  shots: Shot[];
  atmosphere: Atmosphere;
  /** Optional search restriction [south, west, north, east] in degrees; null = whole Earth. */
  bounds: [number, number, number, number] | null;
  heightM: number;
  deltaTOverride: number | null;
}

/** One accepted cell of the location grid. */
export interface GeoCell {
  lat: number;
  lon: number;
  /** Cell size in degrees (square in lat/lon). */
  size: number;
  misfit: number;
}

/** Connected group of accepted cells — one candidate area. */
export interface GeoRegion {
  id: number;
  bestLat: number;
  bestLon: number;
  bestFit: Fit;
  bounds: [number, number, number, number];
  areaKm2: number;
  probability: number;
  cellCount: number;
}

export interface LocationSolveResult {
  cells: GeoCell[];
  regions: GeoRegion[];
  resolutionDeg: number;
  observations: Observation[];
  warnings: string[];
  evaluations: number;
  elapsedMs: number;
}

export interface ClaimRequest {
  shots: Shot[];
  site: Site;
  atmosphere: Atmosphere;
  deltaTOverride: number | null;
  /** Wall-clock time of shot 1 as epoch ms, read as if it were UTC (no offset applied). */
  wallClockMs: number;
  /** Known offset in minutes (UTC = wall clock − offset), or null to scan plausible offsets. */
  offsetMin: number | null;
}

export interface ClaimOffsetResult {
  offsetMin: number;
  utcMs: number;
  fit: Fit;
  /**
   * Smallest confidence region that contains this time (e.g. 0.6827), or null when it lies
   * outside even the 99.73 % region. For range-only inputs: 1 when inside, null otherwise.
   */
  acceptedLevel: number | null;
}

export interface ClaimResult {
  results: ClaimOffsetResult[];
}
