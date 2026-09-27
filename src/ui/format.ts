/**
 * format.ts — display formatting of instants, spans, angles and coordinates.
 *
 * Defines: fmtDateTime(), fmtDate(), fmtTime(), fmtSpan(), fmtDeg(), fmtLatLon(), fmtPct(),
 *          fmtSolar().
 * Used by: ui/results/*.ts, ui/panels/*.ts, ui/report.ts.
 * Depends on: core/zone.ts, core/models.ts.
 */

import type { Zone } from "../core/models";
import { formatOffset, zoneOffsetMin } from "../core/zone";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const pad = (n: number, w = 2) => String(n).padStart(w, "0");

function wall(ms: number, zone: Zone, lon: number): { d: Date; off: number } {
  const off = zoneOffsetMin(zone, ms, lon);
  return { d: new Date(ms + off * 60_000), off };
}

/** "2025-04-15 12:03:20" in the zone, with the numeric offset when not UTC. */
export function fmtDateTime(ms: number, zone: Zone, lon: number, seconds = true): string {
  const { d, off } = wall(ms, zone, lon);
  const t = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}${seconds ? `:${pad(d.getUTCSeconds())}` : ""}`;
  return zone.kind === "utc" ? `${t} UTC` : `${t} (UTC${formatOffset(off)})`;
}

/** "15 Apr 2025". */
export function fmtDate(ms: number, zone: Zone, lon: number, year = true): string {
  const { d } = wall(ms, zone, lon);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}${year ? ` ${d.getUTCFullYear()}` : ""}`;
}

/** "12:03" (or with seconds). */
export function fmtTime(ms: number, zone: Zone, lon: number, seconds = false): string {
  const { d } = wall(ms, zone, lon);
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}${seconds ? `:${pad(d.getUTCSeconds())}` : ""}`;
}

/** Duration in compact form: "4 min 20 s", "2 h 05 min", "12 d". */
export function fmtSpan(ms: number): string {
  const s = Math.round(Math.abs(ms) / 1000);
  if (s < 60) return `${s} s`;
  if (s < 3600) return `${Math.floor(s / 60)} min${s % 60 ? ` ${pad(s % 60)} s` : ""}`;
  if (s < 86400 * 2) return `${Math.floor(s / 3600)} h ${pad(Math.floor((s % 3600) / 60))} min`;
  return `${Math.round(s / 86400)} d`;
}

export function fmtDeg(v: number, digits = 2): string {
  return `${v.toFixed(digits)}°`;
}

export function fmtLatLon(lat: number, lon: number, digits = 5): string {
  return `${lat.toFixed(digits)}, ${lon.toFixed(digits)}`;
}

export function fmtPct(p: number): string {
  if (p >= 0.995) return "≈ 100 %";
  if (p < 0.005) return "< 1 %";
  return `${Math.round(p * 100)} %`;
}

/** Apparent solar time from hours: "11:42 solar". */
export function fmtSolar(hours: number): string {
  const m = Math.round(hours * 60) % 1440;
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
}

export const MONTH_NAMES = MONTHS;
