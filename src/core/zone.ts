/**
 * zone.ts — time-zone arithmetic for constraints and display.
 *
 * Defines: zoneOffsetMin(), wallParts(), wallToUtc(), zoneLabel().
 * Used by: core/solveTime.ts (constraints, heatmap rows), ui/format.ts (display).
 * Depends on: core/models.ts.
 *
 * HOW: a Zone is UTC, a fixed offset, an IANA zone (resolved through Intl, which ships
 * the tz database with the browser) or local mean solar time (longitude × 4 min).
 * Offsets of IANA zones are cached per UTC hour because Intl formatting is comparatively
 * slow and the solver asks for tens of thousands of instants.
 * WHY: forensic timestamps are often recorded in local wall-clock time, so constraints
 * such as "taken in the afternoon" must be interpreted in the analyst's chosen zone.
 */

import type { Zone } from "./models";

const formatters = new Map<string, Intl.DateTimeFormat>();
const offsetCache = new Map<string, number>();

function ianaOffsetMin(name: string, ms: number): number {
  const hour = Math.floor(ms / 3_600_000);
  const key = `${name}|${hour}`;
  const hit = offsetCache.get(key);
  if (hit !== undefined) return hit;
  let f = formatters.get(name);
  if (!f) {
    f = new Intl.DateTimeFormat("en-GB", {
      timeZone: name,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    formatters.set(name, f);
  }
  const p: Record<string, number> = {};
  for (const part of f.formatToParts(ms)) {
    if (part.type !== "literal") p[part.type] = Number(part.value);
  }
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  const off = Math.round((asUtc - Math.floor(ms / 1000) * 1000) / 60_000);
  // WHY: bound the cache so a multi-decade solve cannot grow memory without limit.
  if (offsetCache.size > 400_000) offsetCache.clear();
  offsetCache.set(key, off);
  return off;
}

/** Validates an IANA zone name using the browser's Intl support. */
export function isValidIana(name: string): boolean {
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: name });
    return true;
  } catch {
    return false;
  }
}

/** Offset of the zone from UTC at the instant `ms`, minutes (local = UTC + offset). */
export function zoneOffsetMin(zone: Zone, ms: number, lon: number): number {
  switch (zone.kind) {
    case "utc":
      return 0;
    case "offset":
      return zone.minutes;
    case "solar":
      return lon * 4;
    case "iana":
      return ianaOffsetMin(zone.name, ms);
  }
}

export interface WallParts {
  year: number;
  month: number; // 0-based
  day: number;
  minuteOfDay: number;
  /** Epoch ms of the wall-clock time read as UTC. */
  wallMs: number;
}

export function wallParts(zone: Zone, ms: number, lon: number): WallParts {
  const wallMs = ms + zoneOffsetMin(zone, ms, lon) * 60_000;
  const d = new Date(wallMs);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth(),
    day: d.getUTCDate(),
    minuteOfDay: d.getUTCHours() * 60 + d.getUTCMinutes() + d.getUTCSeconds() / 60,
    wallMs,
  };
}

/**
 * Converts a wall-clock instant (epoch ms read as UTC) to true UTC. The offset is taken
 * at the first guess and refined once, which is exact except inside DST transitions.
 */
export function wallToUtc(zone: Zone, wallMs: number, lon: number): number {
  let utc = wallMs - zoneOffsetMin(zone, wallMs, lon) * 60_000;
  utc = wallMs - zoneOffsetMin(zone, utc, lon) * 60_000;
  return utc;
}

export function formatOffset(min: number): string {
  const sign = min < 0 ? "−" : "+";
  const a = Math.abs(Math.round(min));
  return `${sign}${String(Math.floor(a / 60)).padStart(2, "0")}:${String(a % 60).padStart(2, "0")}`;
}

export function zoneLabel(zone: Zone): string {
  switch (zone.kind) {
    case "utc":
      return "UTC";
    case "offset":
      return `UTC${formatOffset(zone.minutes)}`;
    case "solar":
      return "Local mean solar time";
    case "iana":
      return zone.name;
  }
}
