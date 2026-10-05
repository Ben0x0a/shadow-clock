/**
 * format.ts — display formatting of instants, spans, angles and coordinates.
 *
 * Defines: fmtDateTime(), fmtDate(), fmtTime(), fmtSpan(), fmtDeg(), fmtLatLon(), fmtSolar(),
 *          monthName(), zoneLabel(), formatDuration().
 * Used by: features/results/*, features/inputs/panels/*, features/share-export/report.ts.
 * Depends on: core/zone.ts, core/models.ts.
 */

import type { Zone } from "../core/models.ts";
import { formatOffset, zoneOffsetMin } from "../core/zone.ts";
import { t } from "./context.ts";

/** Short month name (0 = January), from the string table. */
export function monthName(i: number): string {
  return t(`month.${i}`);
}

/** Display name of a zone. */
export function zoneLabel(zone: Zone): string {
  switch (zone.kind) {
    case "utc":
      return t("zone.utc");
    case "offset":
      return `UTC${formatOffset(zone.minutes)}`;
    case "solar":
      return t("zone.solar");
    case "iana":
      return zone.name;
  }
}
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
  return `${d.getUTCDate()} ${monthName(d.getUTCMonth())}${year ? ` ${d.getUTCFullYear()}` : ""}`;
}

/** "12:03" (or with seconds). */
export function fmtTime(ms: number, zone: Zone, lon: number, seconds = false): string {
  const { d } = wall(ms, zone, lon);
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}${seconds ? `:${pad(d.getUTCSeconds())}` : ""}`;
}

/** Duration in compact form: "4 min 20 s", "2 h 05 min", "12 d". */
export function fmtSpan(ms: number): string {
  const s = Math.round(Math.abs(ms) / 1000);
  const u = (n: number | string, unit: string) => `${n} ${t(`unit.${unit}`)}`;
  if (s < 60) return u(s, "s");
  if (s < 3600) return `${u(Math.floor(s / 60), "min")}${s % 60 ? ` ${u(pad(s % 60), "s")}` : ""}`;
  if (s < 86400 * 2) return `${u(Math.floor(s / 3600), "h")} ${u(pad(Math.floor((s % 3600) / 60)), "min")}`;
  return u(Math.round(s / 86400), "d");
}

/** Seconds as "+1 h 23 min 4 s" (sign only when `signed` or negative). */
export function formatDuration(sec: number, signed = false): string {
  const sign = sec < 0 ? "−" : signed ? "+" : "";
  let s = Math.round(Math.abs(sec));
  const d = Math.floor(s / 86400);
  s -= d * 86400;
  const h = Math.floor(s / 3600);
  s -= h * 3600;
  const m = Math.floor(s / 60);
  s -= m * 60;
  const parts: string[] = [];
  if (d) parts.push(`${d} ${t("unit.d")}`);
  if (h) parts.push(`${h} ${t("unit.h")}`);
  if (m) parts.push(`${m} ${t("unit.min")}`);
  if (s || parts.length === 0) parts.push(`${s} ${t("unit.s")}`);
  return sign + parts.join(" ");
}

export function fmtDeg(v: number, digits = 2): string {
  return `${v.toFixed(digits)}°`;
}

export function fmtLatLon(lat: number, lon: number, digits = 5): string {
  return `${lat.toFixed(digits)}, ${lon.toFixed(digits)}`;
}

/** Apparent solar time from hours: "11:42 solar". */
export function fmtSolar(hours: number): string {
  const m = Math.round(hours * 60) % 1440;
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
}

