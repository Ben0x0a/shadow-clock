/**
 * sunpath.ts — the Sun's path across the sky on the selected day, with every shadow's
 * measured Sun position (±2σ ellipse or min–max box) and the Sun at the selected time.
 *
 * Defines: renderSunPath().
 * Used by: ui/results/timeResults.ts.
 * Depends on: core/ephemeris.ts, core/spa.ts, core/models.ts, ui/dom.ts, ui/format.ts,
 *             ui/results/colours.ts.
 *
 * WHY: it lets the analyst see *why* a time fits — how close the path passes to each
 * measurement, and which shadow constrains which direction.
 */

import { Ephemeris } from "../../core/ephemeris";
import type { Atmosphere, Observation, Site, Zone } from "../../core/models";
import { angleDiff, topocentricSun } from "../../core/spa";
import { zoneOffsetMin } from "../../core/zone";
import { h, svg } from "../dom";
import { fmtDate, fmtTime } from "../format";
import { cssVar, shotColour } from "./colours";

export interface SunPathInput {
  site: Site;
  atm: Atmosphere;
  deltaT: number | null;
  observations: Observation[];
  labels: string[];
  offsetsMs: number[];
  selectedMs: number;
  zone: Zone;
}

const W = 640;
const H = 300;
const P = { l: 40, r: 16, t: 14, b: 30 };
const COMPASS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];

export function renderSunPath(host: HTMLElement, x: SunPathInput): void {
  const eph = new Ephemeris(x.deltaT);
  const { lat, lon, heightM } = x.site;
  const sun = (ms: number) => topocentricSun(eph.at(ms), lat, lon, heightM, x.atm, x.atm.refraction);

  // The wall-clock day of the selected instant in the display zone.
  const off = zoneOffsetMin(x.zone, x.selectedMs, lon) * 60_000;
  const dayStart = Math.floor((x.selectedMs + off) / 86_400_000) * 86_400_000 - off;
  const pts: { ms: number; el: number; az: number }[] = [];
  for (let ms = dayStart; ms <= dayStart + 86_400_000; ms += 120_000) {
    const s = sun(ms);
    pts.push({ ms, el: s.elevation, az: s.azimuth });
  }
  const up = pts.filter((p) => p.el > -1);
  if (up.length < 2) {
    host.replaceChildren(h("p", { class: "hint" }, "The Sun stays below the horizon on this day."));
    return;
  }
  // Unwrap azimuths around the noon azimuth so paths through north (southern hemisphere)
  // stay continuous.
  const noon = up.reduce((a, p) => (p.el > a.el ? p : a));
  const unwrap = (a: number) => noon.az + angleDiff(a, noon.az);
  const shotSuns = x.offsetsMs.map((o) => sun(x.selectedMs + o));

  let azMin = Math.min(...up.map((p) => unwrap(p.az)));
  let azMax = Math.max(...up.map((p) => unwrap(p.az)));
  let elMax = Math.max(...up.map((p) => p.el));
  x.observations.forEach((o) => {
    const spread = o.elevation.kind === "gauss" ? 2 * o.elevation.sigma : o.elevation.half;
    elMax = Math.max(elMax, o.elevation.centre + spread);
    if (o.azimuth) {
      const c = unwrap(o.azimuth.centre);
      const a = o.azimuth.kind === "gauss" ? 2 * o.azimuth.sigma : o.azimuth.half;
      azMin = Math.min(azMin, c - a);
      azMax = Math.max(azMax, c + a);
    }
  });
  azMin = Math.floor((azMin - 10) / 30) * 30;
  azMax = Math.ceil((azMax + 10) / 30) * 30;
  elMax = Math.min(90, Math.ceil((elMax + 5) / 10) * 10);

  const X = (az: number) => P.l + ((az - azMin) / (azMax - azMin)) * (W - P.l - P.r);
  const Y = (el: number) => P.t + (1 - Math.max(0, el) / elMax) * (H - P.t - P.b);
  const kx = (W - P.l - P.r) / (azMax - azMin);
  const ky = (H - P.t - P.b) / elMax;

  const root = svg("svg", { viewBox: `0 0 ${W} ${H}`, class: "sunpath", role: "img", "aria-label": `Sun path on ${fmtDate(x.selectedMs, x.zone, lon)} with the measured Sun positions` });
  const gGrid = svg("g", { class: "grid" });
  for (let e = 0; e <= elMax; e += 10) {
    gGrid.append(svg("line", { x1: P.l, x2: W - P.r, y1: Y(e), y2: Y(e) }));
    gGrid.append(svg("text", { x: P.l - 6, y: Y(e) + 4, class: "tick", "text-anchor": "end" }, `${e}°`));
  }
  for (let a = azMin; a <= azMax; a += 30) {
    const n = ((a % 360) + 360) % 360;
    gGrid.append(svg("line", { x1: X(a), x2: X(a), y1: P.t, y2: H - P.b }));
    const name = n % 45 === 0 ? COMPASS[n / 45] : "";
    gGrid.append(svg("text", { x: X(a), y: H - P.b + 16, class: "tick", "text-anchor": "middle" }, name ? `${name} ${n}°` : `${n}°`));
  }
  root.append(gGrid);
  root.append(svg("line", { x1: P.l, x2: W - P.r, y1: Y(0), y2: Y(0), class: "horizon" }));

  // Measurements, drawn under the path.
  x.observations.forEach((o, i) => {
    const col = shotColour(i);
    const eS = o.elevation.kind === "gauss" ? 2 * o.elevation.sigma : o.elevation.half;
    const g = svg("g", { class: "obs" });
    if (!o.azimuth) {
      g.append(svg("rect", { x: P.l, width: W - P.l - P.r, y: Y(o.elevation.centre + eS), height: Math.max(2, eS * 2 * ky), fill: col, "fill-opacity": 0.14, stroke: col, "stroke-width": 1.5, "stroke-dasharray": "4 3" }));
      g.append(svg("text", { x: W - P.r - 4, y: Y(o.elevation.centre + eS) - 4 - i * 14, class: "obs-label", "text-anchor": "end" }, `${x.labels[i]} (elevation only)`));
    } else {
      const cx = X(unwrap(o.azimuth.centre));
      const cy = Y(o.elevation.centre);
      const aS = o.azimuth.kind === "gauss" ? 2 * o.azimuth.sigma : o.azimuth.half;
      const shape =
        o.elevation.kind === "gauss" && o.azimuth.kind === "gauss"
          ? svg("ellipse", { cx, cy, rx: Math.max(2, aS * kx), ry: Math.max(2, eS * ky) })
          : svg("rect", { x: cx - aS * kx, y: cy - eS * ky, width: Math.max(2, 2 * aS * kx), height: Math.max(2, 2 * eS * ky), rx: 2 });
      shape.setAttribute("fill", col);
      shape.setAttribute("fill-opacity", "0.18");
      shape.setAttribute("stroke", col);
      shape.setAttribute("stroke-width", "1.5");
      // Stack labels by shot index: shadows of one photo sit at the same spot.
      g.append(shape, svg("text", { x: cx + aS * kx + 8, y: cy - eS * ky - 4 - i * 14, class: "obs-label" }, x.labels[i]));
    }
    root.append(g);
  });

  // Sun path with hour marks.
  const d = up.map((p, k) => `${k ? "L" : "M"}${X(unwrap(p.az)).toFixed(1)},${Y(p.el).toFixed(1)}`).join("");
  root.append(svg("path", { d, class: "path" }));
  let prevHour = NaN;
  for (const p of up) {
    // Mark the first sample of each new local hour (works for fractional offsets too).
    const hour = Math.floor((p.ms + zoneOffsetMin(x.zone, p.ms, lon) * 60_000) / 3_600_000);
    const isNew = hour !== prevHour && !Number.isNaN(prevHour);
    prevHour = hour;
    if (!isNew || p.el < 0) continue;
    const cx = X(unwrap(p.az));
    const cy = Y(p.el);
    root.append(svg("circle", { cx, cy, r: 2.5, class: "hour" }));
    root.append(svg("text", { x: cx, y: cy - 7, class: "hour-label", "text-anchor": "middle" }, fmtTime(p.ms, x.zone, lon)));
  }

  // The Sun at the selected time for each shot.
  shotSuns.forEach((s, i) => {
    root.append(svg("circle", { cx: X(unwrap(s.azimuth)), cy: Y(s.elevation), r: 6, fill: shotColour(i), stroke: cssVar("--chart-surface"), "stroke-width": 2, class: "sun-now" }));
  });

  // Hover readout along the path.
  const readout = svg("text", { x: W - P.r, y: P.t + 10, class: "readout", "text-anchor": "end" });
  const hit = svg("rect", { x: P.l, y: P.t, width: W - P.l - P.r, height: H - P.t - P.b, fill: "transparent" });
  const cursor = svg("circle", { r: 4, class: "cursor", visibility: "hidden" });
  hit.addEventListener("pointermove", (e) => {
    const r = (root as SVGSVGElement).getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    let best = up[0];
    for (const p of up) if (Math.abs(X(unwrap(p.az)) - px) < Math.abs(X(unwrap(best.az)) - px)) best = p;
    cursor.setAttribute("cx", String(X(unwrap(best.az))));
    cursor.setAttribute("cy", String(Y(best.el)));
    cursor.setAttribute("visibility", "visible");
    readout.textContent = `${fmtTime(best.ms, x.zone, lon)} · elevation ${best.el.toFixed(1)}° · azimuth ${best.az.toFixed(1)}°`;
  });
  hit.addEventListener("pointerleave", () => {
    cursor.setAttribute("visibility", "hidden");
    readout.textContent = "";
  });
  root.append(hit, cursor, readout);

  const legend = h(
    "ul",
    { class: "legend" },
    h("li", null, h("span", { class: "swatch line" }), `Sun path, ${fmtDate(x.selectedMs, x.zone, lon)}`),
    x.labels.map((l, i) =>
      h("li", null, h("span", { class: "swatch", style: { background: shotColour(i) } }), l),
    ),
  );
  host.replaceChildren(root, legend);
}
