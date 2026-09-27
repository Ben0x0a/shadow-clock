/**
 * config.ts — tuneable constants for the ShadowClock core.
 *
 * Defines: physical constants, default atmosphere, solver step sizes, confidence levels
 *          and the supported year range.
 * Used by: core/spa.ts, core/measurement.ts, core/score.ts, core/solveTime.ts,
 *          core/claimCheck.ts, ui/* (defaults and limits shown in the forms).
 * Depends on: nothing.
 */

/** Mean apparent angular semi-diameter of the Sun, degrees (SPA uses the same value). */
export const SUN_SEMI_DIAMETER_DEG = 0.26667;

/** Mean Earth radius in metres, used to turn a location radius into an angle. */
export const EARTH_RADIUS_M = 6_371_000;

/** Default atmosphere (NREL SPA defaults), editable in the advanced settings. */
export const DEFAULT_PRESSURE_HPA = 1010;
export const DEFAULT_TEMPERATURE_C = 10;

/**
 * Relative 1σ uncertainty applied to the refraction correction.
 * WHY: Bennett-type refraction formulas assume a standard atmosphere; the real
 * refraction near the horizon varies by roughly ±10 % (more with temperature
 * inversions), so the correction itself carries uncertainty that must be propagated.
 * Consumed by: core/measurement.ts.
 */
export const REFRACTION_REL_SIGMA = 0.1;

/** Elevation below which a "low sun" warning is raised, degrees. */
export const LOW_SUN_WARNING_DEG = 5;

/**
 * Upper bound of the Sun's angular speed on the sky, degrees per minute.
 * WHY: 360° per sidereal day ≈ 0.2507 °/min is the fastest the Sun can move across the
 * sky (cos δ ≤ 1); refraction changes add at most a small amount near the horizon,
 * covered by the margin factor below. The coarse solver uses this bound to guarantee
 * it cannot skip over a short solution window.
 * Consumed by: core/solveTime.ts.
 */
export const SUN_MAX_RATE_DEG_PER_MIN = 0.2507;
export const RATE_SAFETY_FACTOR = 1.5;

/** Coarse and fine solver steps, seconds. Consumed by: core/solveTime.ts. */
export const COARSE_STEP_S = 600;
export const FINE_STEP_S = 10;

/** Heatmap resolution: one row per day, this many minutes per column. Consumed by: core/solveTime.ts. */
export const HEATMAP_SLOT_MIN = 5;

/**
 * Two windows (one per day) belong to the same solution cluster when they are at most
 * this many days apart and their time-of-day differs by at most CLUSTER_MAX_TOD_GAP_MIN.
 * Consumed by: core/solveTime.ts.
 */
export const CLUSTER_MAX_DAY_GAP = 2;
export const CLUSTER_MAX_TOD_GAP_MIN = 90;

/** Supported years (ΔT model and UI limits). Consumed by: core/deltaT.ts, ui/inputs.ts. */
export const MIN_YEAR = 1900;
export const MAX_YEAR = 2100;

/** Maximum number of years one solve may cover (keeps the worker responsive). */
export const MAX_YEAR_SPAN = 30;

/** Confidence levels reported for Gaussian inputs (the classic 1σ / 2σ / 3σ coverage). */
export const CONFIDENCE_LEVELS = [0.6827, 0.9545, 0.9973] as const;

/** Level used to decide acceptance of a time and the heatmap boundary. */
export const ACCEPT_LEVEL = 0.9973;
export const HEATMAP_LEVEL = 0.9545;

/** Step (minutes) used when the claimed-time checker scans unknown UTC offsets. */
export const OFFSET_SCAN_STEP_MIN = 15;
