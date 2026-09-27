/**
 * parse.ts — lenient parsers for what analysts paste: coordinates, map links, EXIF/ISO
 * timestamps, UTC offsets and durations.
 *
 * Defines: parseLocation(), parseDateTime(), parseOffset(), parseDuration(), formatDuration().
 * Used by: ui/fields.ts, ui/shots.ts, ui/site.ts, ui/claim.ts, tests/parse.test.ts.
 * Depends on: nothing.
 *
 * HOW: each parser normalises the text (Unicode primes, decimal commas where unambiguous)
 * and then tries the known formats from most to least specific. Parsers return null
 * instead of throwing: an unparsable field is an expected state while the user types.
 */

export interface LatLon {
  lat: number;
  lon: number;
}

const NUM = String.raw`-?\d+(?:\.\d+)?`;

function valid(lat: number, lon: number): LatLon | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { lat, lon };
}

function fromUrl(t: string): LatLon | null {
  const pairs: RegExp[] = [
    new RegExp(String.raw`!3d(${NUM})!4d(${NUM})`), // Google place pin
    new RegExp(String.raw`[?&](?:q|query|ll|sll|daddr|center)=(${NUM})(?:,|%2C)\s*(${NUM})`),
    new RegExp(String.raw`@(${NUM}),(${NUM})`), // Google viewport
  ];
  for (const re of pairs) {
    const m = t.match(re);
    if (m) return valid(Number(m[1]), Number(m[2]));
  }
  const osm = t.match(new RegExp(String.raw`mlat=(${NUM}).*?mlon=(${NUM})`));
  if (osm) return valid(Number(osm[1]), Number(osm[2]));
  const map = t.match(new RegExp(String.raw`#map=\d+(?:\.\d+)?/(${NUM})/(${NUM})`));
  if (map) return valid(Number(map[1]), Number(map[2]));
  return null;
}

function part(s: string): { value: number; hemi: string | null } | null {
  const hemi = (s.match(/[NSEW]/i)?.[0] ?? null)?.toUpperCase() ?? null;
  const nums = s.match(/-?\d+(?:\.\d+)?/g);
  if (!nums || nums.length > 3) return null;
  const [d, m = "0", sec = "0"] = nums;
  const deg = Number(d);
  if (Number(m) >= 60 || Number(sec) >= 60) return null;
  let v = Math.abs(deg) + Number(m) / 60 + Number(sec) / 3600;
  if (deg < 0 || d.startsWith("-") || hemi === "S" || hemi === "W") v = -v;
  return { value: v, hemi };
}

/** Parses "48.85, 2.29", DMS ("48°51'30"N 2°17'40"E"), hemisphere forms and map URLs. */
export function parseLocation(input: string): LatLon | null {
  const raw = input.trim();
  if (!raw) return null;
  if (/https?:|www\.|maps|@|#map=|mlat=/i.test(raw)) {
    const u = fromUrl(decodeURIComponent(raw));
    if (u) return u;
  }
  let t = raw
    .replace(/[′’´`]/g, "'")
    .replace(/[″”“]|''/g, '"')
    .replace(/[º˚]/g, "°");
  // WHY: decimal commas are only unambiguous when a semicolon separates the two values.
  if (t.includes(";")) t = t.replace(/(\d),(\d)/g, "$1.$2");

  const letters = [...t.matchAll(/[NSEW]/gi)];
  if (letters.length === 2) {
    const i1 = letters[0].index as number;
    const i2 = letters[1].index as number;
    const suffix = /\d/.test(t.slice(0, i1));
    const a = suffix ? t.slice(0, i1 + 1) : t.slice(0, i2);
    const b = suffix ? t.slice(i1 + 1) : t.slice(i2);
    const pa = part(a);
    const pb = part(b.replace(/^[\s,;]+/, ""));
    if (!pa || !pb) return null;
    // Accept either order: the N/S part is the latitude.
    if (pa.hemi === "E" || pa.hemi === "W") return valid(pb.value, pa.value);
    return valid(pa.value, pb.value);
  }
  if (letters.length !== 0) return null;

  const halves = t.includes(",") || t.includes(";") ? t.split(/[,;]/) : null;
  if (halves && halves.length === 2) {
    const pa = part(halves[0]);
    const pb = part(halves[1]);
    return pa && pb ? valid(pa.value, pb.value) : null;
  }
  const nums = t.match(/-?\d+(?:\.\d+)?/g) ?? [];
  if (nums.length === 2 || nums.length === 4 || nums.length === 6) {
    const h = nums.length / 2;
    const pa = part(nums.slice(0, h).join(" "));
    const pb = part(nums.slice(h).join(" "));
    return pa && pb ? valid(pa.value, pb.value) : null;
  }
  return null;
}

export interface ParsedDateTime {
  /** Wall-clock time as epoch ms read as UTC. */
  wallMs: number;
  /** Offset in minutes when the text carries one (Z, +02:00), else null. */
  offsetMin: number | null;
}

/**
 * Parses ISO 8601 ("2023-07-14T15:32:10+02:00"), EXIF ("2023:07:14 15:32:10") and
 * similar "YYYY-MM-DD HH:MM[:SS]" forms.
 */
export function parseDateTime(input: string): ParsedDateTime | null {
  const m = input
    .trim()
    .match(
      /^(\d{4})[-:/.](\d{1,2})[-:/.](\d{1,2})(?:[ T]+(\d{1,2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?)?\s*(Z|UTC|GMT|[+-]\d{2}(?::?\d{2})?)?$/i,
    );
  if (!m) return null;
  const [, y, mo, d, h = "0", mi = "0", s = "0", frac = "", off] = m;
  const month = Number(mo);
  const day = Number(d);
  if (month < 1 || month > 12 || day < 1 || day > 31 || Number(h) > 23 || Number(mi) > 59 || Number(s) > 59) {
    return null;
  }
  const ms = frac ? Math.round(Number(`0.${frac}`) * 1000) : 0;
  const wallMs = Date.UTC(Number(y), month - 1, day, Number(h), Number(mi), Number(s), ms);
  if (new Date(wallMs).getUTCDate() !== day) return null;
  return { wallMs, offsetMin: off ? parseOffset(off) : null };
}

/** Parses "Z", "UTC", "+02:00", "-0530", "UTC+2", "+5.5" → minutes. */
export function parseOffset(input: string): number | null {
  const t = input.trim().toUpperCase().replace(/^(UTC|GMT)/, "").trim();
  if (t === "" || t === "Z") return 0;
  let m = t.match(/^([+-−])(\d{1,2})(?::?(\d{2}))?$/);
  if (m) {
    const v = Number(m[2]) * 60 + Number(m[3] ?? 0);
    return v > 14 * 60 ? null : m[1] === "+" ? v : -v;
  }
  m = t.match(/^([+-−]?)(\d{1,2}(?:\.\d+)?)$/);
  if (m) {
    const v = Math.round(Number(m[2]) * 60);
    return v > 14 * 60 ? null : m[1] === "-" || m[1] === "−" ? -v : v;
  }
  return null;
}

/**
 * Parses a signed duration → seconds: "+01:23:04", "-0:05", "1h 23m 4s", "90 min",
 * "45 s", "2.5h", or a bare number (seconds).
 */
export function parseDuration(input: string): number | null {
  const t = input.trim().toLowerCase().replace("−", "-");
  if (!t) return null;
  let m = t.match(/^([+-]?)(\d+):(\d{1,2})(?::(\d{1,2}(?:\.\d+)?))?$/);
  if (m) {
    const v = Number(m[2]) * 3600 + Number(m[3]) * 60 + Number(m[4] ?? 0);
    return m[1] === "-" ? -v : v;
  }
  m = t.match(/^[+-]?\d+(?:\.\d+)?$/);
  if (m) return Number(t);
  const sign = t.startsWith("-") ? -1 : 1;
  const body = t.replace(/^[+-]/, "");
  const re = /(\d+(?:\.\d+)?)\s*(d|days?|h|hours?|hrs?|m|mins?|minutes?|s|secs?|seconds?)\b/g;
  let total = 0;
  let consumed = "";
  for (const x of body.matchAll(re)) {
    const v = Number(x[1]);
    const u = x[2][0];
    total += u === "d" ? v * 86400 : u === "h" ? v * 3600 : u === "m" ? v * 60 : v;
    consumed += x[0];
  }
  if (!consumed || body.replace(/\s+/g, "").length !== consumed.replace(/\s+/g, "").length) return null;
  return sign * total;
}

/** Formats seconds as "+1 h 23 min 4 s" (sign only when non-zero offsets matter). */
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
  if (d) parts.push(`${d} d`);
  if (h) parts.push(`${h} h`);
  if (m) parts.push(`${m} min`);
  if (s || parts.length === 0) parts.push(`${s} s`);
  return sign + parts.join(" ");
}
