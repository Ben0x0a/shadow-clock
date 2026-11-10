/**
 * messages.ts — the English text of every message the computation produces (errors,
 * warnings, field names, budget terms, shadow names, examples), and its formatter.
 *
 * Defines: MESSAGES (key → text), translate(), formatMessage().
 * Used by: strings.ts (spread into the page's string table), api/ operations, cli/.
 * Depends on: core/models.ts (Message), core/message.ts (renderMessage, shared with the page).
 *
 * WHY here and not in strings.ts: the page and the command line must word results the
 * same way (one table, one renderer), and the command line may not import the page's string table (layer rules:
 * cli/ sees only api/ and core/). The core still has no string table: it emits keys.
 */

import { renderMessage } from "../core/message.ts";
import type { Message } from "../core/models.ts";

export const MESSAGES: Record<string, string> = {
  "msg.forShadow": "{shot}: {text}",
  "shot.default": "Shadow {n}",
  "shot.object": "Object {n}",
  "shot.photo": "Photo {n}",
  // ---- Core: errors
  "core.err.field": "{field}: {reason}",
  "core.field.heightShadow": "Height/shadow",
  "core.field.ratio": "Ratio",
  "core.field.elevation": "Elevation",
  "core.field.azimuth": "Direction",
  "core.err.missing": "a value is missing",
  "core.err.negativeSigma": "the uncertainty must be ≥ 0",
  "core.err.minAboveMax": "the minimum is larger than the maximum",
  "core.err.notPositive": "values must be > 0",
  "core.err.mixedKinds": "Height and shadow must use the same error type",
  "core.err.tilt": "The lean must be between 0° and 45°",
  "core.err.belowHorizon": "The implied Sun elevation is not above the horizon",
  "core.err.declination": "The declination is missing",
  "core.err.noShadow": "Add at least one shadow",
  "core.err.location": "The location is invalid",
  "core.err.radius": "The location radius must be ≥ 0",
  "core.err.yearsInteger": "Years must be whole numbers",
  "core.err.yearsOrder": "The first year is after the last year",
  "core.err.yearsRange": "Years must be within {min}–{max}",
  "core.err.yearsSpan": "At most {max} years per search",
  "core.err.months": "Select at least one month",
  "core.err.offset": "invalid time gap",
  "core.err.timeMissing": "the date and time are missing",
  "core.err.timeTolerance": "invalid time tolerance",
  "core.err.emptyArea": "The search area is empty",
  "core.err.claimMissing": "Enter the claimed date and time",
  "core.err.worker": "The computation stopped unexpectedly: {detail}",
  "core.err.internal": "Internal error: {detail}",

  // ---- Core: warnings
  "core.warn.lowSun": "Low Sun (< 5°): refraction is large and variable; results are less reliable.",
  "core.warn.wideElevation": "Elevation uncertainty exceeds 5°: expect very wide windows.",
  "core.warn.highSun": "Sun above 80°: the shadow is short, so its direction is poorly defined.",
  "core.warn.noYear": "The Sun's path repeats every year, so shadows alone cannot give the year: every year in the range is solved separately.",
  "core.warn.noAzimuth": "No direction given: each day has a morning and an afternoon solution. Adding the shadow direction removes this ambiguity.",
  "core.warn.noTime": "No time is compatible with the measurements and constraints. Check the inputs, the location or the tolerances.",
  "core.warn.truncated": "Some solutions are cut by a constraint or by the search range; they may extend beyond what is shown.",
  "core.warn.solstice": "A solution lies near a solstice, where the Sun's declination changes slowly: the date is poorly constrained there and the two yearly solutions can merge.",
  "core.warn.inconsistent": "Even the best-fitting time lies outside the 95 % region: the measurements may be inconsistent (wrong north reference, tilted object, sloped ground?).",
  "core.warn.coarse": "Result shown at {size}° resolution: the candidate area is too large to refine further. Narrow the search area or add shadows.",
  "core.warn.noPlace": "No place on Earth matches all shadows at the given times. Check the times (UTC!), the north reference and the tolerances.",
  "core.warn.ring": "A single shadow without direction only gives a ring of possible places. Add the shadow direction or a second shadow at another time.",

  // ---- Error budget terms
  "budget.lengths": "Height & shadow length",
  "budget.ratio": "Height/shadow ratio",
  "budget.angle": "Elevation reading",
  "budget.tipEdge": "Shadow tip edge (penumbra)",
  "budget.tipMidpoint": "Shadow tip midpoint judgement",
  "budget.tilt": "Object lean",
  "budget.refraction": "Refraction model",
  "budget.azimuth": "Direction reading",

  // ---- Field names and form validation
  "field.height": "Object height",
  "field.shadow": "Shadow length",
  "field.ratio": "Height ÷ shadow",
  "field.elevation": "Sun elevation",
  "field.direction": "Direction",
  "field.declination": "Declination",
  "field.lean": "Max lean",
  "field.pressure": "Air pressure",
  "field.temperature": "Temperature",
  "field.deltaT": "ΔT",
  "field.radius": "Radius",
  "field.siteHeight": "Height above sea level",
  "field.yearFrom": "From year",
  "field.yearTo": "To year",
  "val.number": "{what}: enter a number",
  "val.min": "{what} must be ≥ {min}",
  "val.tolerance": "{what}: declare the tolerance (0 if exact)",
  "val.toleranceTooBig": "{what}: the tolerance must be smaller than the value",
  "val.locationBad": "Location not recognised",
  "val.locationNeeded": "Enter the location (or pick it on a map)",
  "val.offsetBad": "Offset not recognised (e.g. +02:00)",
  "val.zoneBad": "Unknown time zone (e.g. Europe/Paris)",
  "val.hhmm": "Use HH:MM",
  "val.dateBad": "Date not recognised (e.g. 2024-06-01 or 2024-06-01 14:00)",
  "val.gap": "Time after the first photo, e.g. +01:23:04 or 85 min",
  "val.gapTolerance": "Declare the tolerance of the time gap, e.g. 2 s",
  "val.todBoth": "Give both ends of the time-of-day window",
  "val.dateTimeBad": "Date/time not recognised",
  "val.whenTaken": "Enter when this photo was taken",
  "val.timeTolerance": "Declare the time tolerance, e.g. 30 s or 2 min",
  "val.bbox": "Use: south, west, north, east (e.g. 40, -5, 52, 10)",
  "val.claimNeeded": "Enter the claimed time",

  // ---- Examples
  "ex.paris": "Two objects in one photo",
  "ex.parisDesc": "Paris, 15 Apr 2025 09:20 UTC. A post and a lamp standard in the same picture; the EXIF clock says 11:20 with no offset.",
  "ex.bollard": "Bollard",
  "ex.lamp": "Lamp standard",
  "ex.sydney": "Two photos, known time gap",
  "ex.sydneyDesc": "Sydney, 10 Dec 2024 01:30 UTC, and a second photo 2 h 15 min later (from the EXIF difference). Near the solstice.",
  "ex.post1": "Photo 1 – fence post",
  "ex.post2": "Photo 2 – same post",
  "ex.tromso": "No compass, high latitude",
  "ex.tromsoDesc": "Tromsø, 20 Aug 2024 10:00 UTC. Only the ratio of a building's height to its shadow is known, with a tolerance.",
  "ex.building": "Building",
  "ex.athens": "Find the place: three photos",
  "ex.athensDesc": "Athens, 2 Jun 2023 at 06:30, 09:45 and 14:10 UTC. Elevation only — the three rings cross at one place.",

  // ---- Progress phases (sent by the solvers while they run)
  "progress.scanning": "Scanning {year}",
  "progress.refining": "Refining {year}",
  "progress.heatmap": "Drawing the year map",
  "progress.map": "Refining the map",
  "progress.regions": "Grouping areas",

  // ---- Claimed-time verdict levels
  "claim.consistent": "Consistent with the shadows",
  "claim.inconsistent": "Not consistent with the shadows",
  "claim.outside": "outside the 99.7 % region",
  "claim.insideBounds": "inside all bounds",
  "claim.insideLevel": "inside the {pct} % region",
};

/** Fills {name} placeholders; an unknown key throws, as the page's t() does. */
export function translate(key: string, vars: Record<string, string | number> = {}): string {
  const text = MESSAGES[key];
  if (text === undefined) throw new Error(`Missing message: ${key}`);
  return text.replace(/\{(\w+)\}/g, (all, name: string) => (name in vars ? String(vars[name]) : all));
}

/** Renders a core message with this table (the page renders the same way with its t()). */
export function formatMessage(m: Message): string {
  return renderMessage(m, translate);
}
