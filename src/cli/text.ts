/**
 * text.ts — the command line's `--format text` rendering (JSON is the default output).
 *
 * Defines: timeText(), placeText(), claimText().
 * Used by: cli/commands.ts.
 * Depends on: api/ (value types, formatMessage), core/message.ts (claimLevel, as the page),
 *             core/zone.ts, core/models.ts.
 *
 * HOW: times are printed in UTC to the second, and also in the case's display zone
 * (offset, IANA zone or local mean solar time) when that is not UTC. Warnings follow the
 * results, one per line. Nothing is computed here: the values come from api/.
 */

import { type ClaimValue, formatMessage, type PlaceValue, type TimeValue } from "../api/index.ts";
import type { ClaimOffsetResult, Message, Zone } from "../core/models.ts";
import { claimLevel } from "../core/message.ts";
import { formatOffset, zoneOffsetMin } from "../core/zone.ts";

const utc = (ms: number) => `${new Date(ms).toISOString().slice(0, 19).replace("T", " ")} UTC`;

function local(ms: number, zone: Zone, lon: number): string {
  if (zone.kind === "utc") return "";
  const off = zoneOffsetMin(zone, ms, lon);
  const wall = new Date(ms + off * 60_000).toISOString().slice(0, 19).replace("T", " ");
  return ` (local ${wall} ${zone.kind === "solar" ? "solar time" : formatOffset(off)})`;
}

const warnings = (list: Message[]) => list.map((w) => `! ${formatMessage(w)}\n`).join("");

export function timeText(v: TimeValue): string {
  const { zone } = v.request.constraints;
  const lon = v.request.site.lon;
  const lines = v.results.clusters.map((c, i) => {
    const days = c.windows.length > 1 ? `, ${c.windows.length} daily windows` : "";
    const cut = c.truncated ? ", cut by a constraint or the search range" : "";
    return `${i + 1}. ${utc(c.firstMs)} → ${utc(c.lastMs)}${days}${cut}\n` +
      `   best fit ${utc(c.bestMs)}${local(c.bestMs, zone, lon)}\n`;
  });
  const head = `${v.results.clusters.length} solution(s) compatible with every declared bound (times of shadow 1):\n`;
  return head + lines.join("") + warnings(v.results.warnings);
}

export function placeText(v: PlaceValue): string {
  const r = v.results;
  const lines = r.regions.map((g, i) => {
    const [s, w, n, e] = g.bounds;
    return `${i + 1}. best fit ${g.bestLat.toFixed(5)}, ${g.bestLon.toFixed(5)}; ` +
      `about ${Math.round(g.areaKm2)} km²; bounds S ${s.toFixed(3)}, W ${w.toFixed(3)}, N ${n.toFixed(3)}, E ${e.toFixed(3)}\n`;
  });
  const head = `${r.regions.length} area(s) compatible with every declared bound (grid ${r.resolutionDeg}°, ${r.cellCount} cells):\n`;
  return head + lines.join("") + warnings(r.warnings);
}

/** The page's wording: the level, then the verdict. */
function level(r: ClaimOffsetResult): string {
  const verdict = formatMessage({ key: r.acceptedLevel !== null ? "claim.consistent" : "claim.inconsistent" });
  return `${formatMessage(claimLevel(r.acceptedLevel))}: ${verdict}`;
}

export function claimText(v: ClaimValue): string {
  const line = (r: ClaimOffsetResult) => `UTC offset ${formatOffset(r.offsetMin)} → ${utc(r.utcMs)}: ${level(r)}\n`;
  // A known offset gives one verdict; a scan lists only the offsets that fit.
  if (v.request.offsetMin !== null) return v.results.map(line).join("");
  const fits = v.results.filter((r) => r.acceptedLevel !== null);
  if (!fits.length) return `No UTC offset among the ${v.results.length} scanned makes the claimed time consistent with the shadows.\n`;
  return `${fits.length} of ${v.results.length} scanned UTC offsets fit:\n` + fits.map(line).join("");
}
