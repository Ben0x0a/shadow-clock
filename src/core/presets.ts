/**
 * presets.ts — one-click shortcuts that fill a declared value in the guided interface.
 *
 * Defines: RADIUS_PRESETS (how precisely the place is known).
 * Used by: features/inputs/panels/site.ts.
 * Depends on: nothing.
 *
 * WHY shortcuts, not hidden defaults: a preset only writes a visible radius into the form,
 * so the uncertainty used is always the one the operator can see and has declared.
 */

export interface RadiusPreset {
  /** String-table key (strings.ts). */
  label: string;
  radius: string;
  unit: "m" | "km";
}

export const RADIUS_PRESETS: RadiusPreset[] = [
  { label: "site.preset.spot", radius: "10", unit: "m" },
  { label: "site.preset.street", radius: "100", unit: "m" },
  { label: "site.preset.town", radius: "5", unit: "km" },
  { label: "site.preset.region", radius: "50", unit: "km" },
];
