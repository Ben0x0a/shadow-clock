/**
 * colours.ts — theme-aware colours for result charts.
 *
 * Defines: misfitLevels(), heatPalette(), shotColour(), cssVar(), onThemeChange().
 * Used by: features/results (heatmap, sun path, place map).
 * Depends on: core/score.ts (levelThreshold), core/config.ts.
 *
 * HOW: the misfit is normalised so that 1 is the 95 % boundary; the 68 % and 99.7 %
 * boundaries depend on the degrees of freedom and are computed from the χ² quantiles.
 * Colours are a single-hue sequential ramp (confidence), read from CSS custom properties
 * so light and dark themes each use their own validated steps.
 */

import { CONFIDENCE_LEVELS, HEATMAP_LEVEL } from "../core/config.ts";
import { levelThreshold } from "../core/score.ts";

/**
 * Calls `cb` when the effective theme changes: the user's choice in the platform's
 * Accessibility dialog (data-theme on <html>) or the system setting.
 * WHY: canvas and SVG charts read colours once; they must redraw with the new tokens.
 */
export function onThemeChange(cb: () => void): void {
  new MutationObserver(cb).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", cb);
}

export function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

export interface Levels {
  l68: number;
  l95: number;
  l997: number;
}

/** Misfit values at the 68 / 95 / 99.7 % boundaries (dof 0 = range-only: all at 1). */
export function misfitLevels(dof: number): Levels {
  if (dof === 0) return { l68: 1, l95: 1, l997: 1 };
  const t95 = levelThreshold(HEATMAP_LEVEL, dof);
  return {
    l68: Math.sqrt(levelThreshold(CONFIDENCE_LEVELS[0], dof) / t95),
    l95: 1,
    l997: Math.sqrt(levelThreshold(CONFIDENCE_LEVELS[2], dof) / t95),
  };
}

function hexToRgb(hex: string): [number, number, number] {
  const m = hex.replace("#", "");
  const v = parseInt(m.length === 3 ? m.split("").map((c) => c + c).join("") : m, 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

export interface HeatPalette {
  rgb(m: number): [number, number, number, number];
  css(m: number): string;
}

/** Heat palette: three confidence steps, then a faint fading tail up to misfit 6. */
export function heatPalette(levels: Levels): HeatPalette {
  const s1 = hexToRgb(cssVar("--heat-1"));
  const s2 = hexToRgb(cssVar("--heat-2"));
  const s3 = hexToRgb(cssVar("--heat-3"));
  const tail = hexToRgb(cssVar("--heat-tail"));
  const rgb = (m: number): [number, number, number, number] => {
    if (!Number.isFinite(m)) return [0, 0, 0, 0];
    if (m <= levels.l68) return [...s1, 255];
    if (m <= levels.l95) return [...s2, 255];
    if (m <= levels.l997) return [...s3, 255];
    // Fade from "just outside" to fully transparent, so only the neighbourhood of a
    // solution is tinted and the rest of the chart stays clean.
    const a = Math.max(0, 1 - (m - levels.l997) / 6);
    return [...tail, Math.round(150 * a * a * a)];
  };
  return {
    rgb,
    css: (m) => {
      const [r, g, b, a] = rgb(m);
      return `rgba(${r},${g},${b},${(a / 255).toFixed(3)})`;
    },
  };
}

/** Identity colour of shot i (fixed order; the fourth relies on labels as well). */
export function shotColour(i: number): string {
  return cssVar(`--shot-${i + 1}`);
}
