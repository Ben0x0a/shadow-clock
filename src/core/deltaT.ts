/**
 * deltaT.ts — ΔT = TT − UT (seconds), the difference between the uniform time used by
 * the ephemeris and civil (Earth-rotation) time.
 *
 * Defines: deltaTSeconds(year).
 * Used by: core/spa.ts (through the callers in core/solveTime.ts and core/claimCheck.ts).
 * Depends on: nothing.
 *
 * HOW: the Espenak & Meeus polynomial expressions (NASA Five Millennium Canon of Solar
 * Eclipses, 2006) for 1900–2150, with the long-term parabola outside that range.
 * WHY: ΔT only matters to within a few seconds here. One second of ΔT moves the Sun by
 * about 0.004°, far below any shadow measurement error, so a published smooth model
 * beats bundling an observed ΔT table. The model overestimates recent values by about
 * 5 s (observed 2025 ≈ 69 s), which is negligible here and can be overridden in the UI.
 */

export function deltaTSeconds(year: number): number {
  const y = year;
  if (y < 1900 || y >= 2150) {
    const u = (y - 1820) / 100;
    return -20 + 32 * u * u;
  }
  if (y < 1920) {
    const t = y - 1900;
    return -2.79 + 1.494119 * t - 0.0598939 * t ** 2 + 0.0061966 * t ** 3 - 0.000197 * t ** 4;
  }
  if (y < 1941) {
    const t = y - 1920;
    return 21.2 + 0.84493 * t - 0.0761 * t ** 2 + 0.0020936 * t ** 3;
  }
  if (y < 1961) {
    const t = y - 1950;
    return 29.07 + 0.407 * t - t ** 2 / 233 + t ** 3 / 2547;
  }
  if (y < 1986) {
    const t = y - 1975;
    return 45.45 + 1.067 * t - t ** 2 / 260 - t ** 3 / 718;
  }
  if (y < 2005) {
    const t = y - 2000;
    return (
      63.86 + 0.3345 * t - 0.060374 * t ** 2 + 0.0017275 * t ** 3 + 0.000651814 * t ** 4 +
      0.00002373599 * t ** 5
    );
  }
  if (y < 2050) {
    const t = y - 2000;
    return 62.92 + 0.32217 * t + 0.005589 * t ** 2;
  }
  const u = (y - 1820) / 100;
  return -20 + 32 * u * u - 0.5628 * (2150 - y);
}

/** Decimal year of an epoch-millisecond instant (good enough for ΔT). */
export function decimalYear(ms: number): number {
  return 1970 + ms / (365.2425 * 86_400_000);
}
