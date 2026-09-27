/**
 * placeResults.ts — place-mode results: summary, map of candidate areas (or an offline
 * plot without tiles), region list and error budget.
 *
 * Defines: PlaceResultsView.
 * Used by: main.ts.
 * Depends on: core/models.ts, ui/map.ts, ui/dom.ts, ui/format.ts, ui/results/colours.ts,
 *             ui/results/budget.ts, ui/results/timeResults.ts (copy helper).
 */

import type { GeoCell, GeoRegion, LocationSolveRequest, LocationSolveResult } from "../../core/models";
import { h, icon, replace } from "../dom";
import { fmtLatLon, fmtPct } from "../format";
import { mountResultMap, onTilesChange, type ResultMap, setTilesEnabled, tilesEnabled } from "../map";
import { renderBudget } from "./budget";
import { cssVar, heatPalette, misfitLevels } from "./colours";
import { copy } from "./timeResults";

function fmtArea(km2: number): string {
  if (km2 < 1) return `${Math.round(km2 * 100) / 100} km²`;
  if (km2 < 1000) return `${Math.round(km2)} km²`;
  return `${Math.round(km2 / 1000).toLocaleString("en-GB")} 000 km²`;
}

/**
 * Equirectangular plot of the accepted cells with an adaptive graticule, zoomed onto the
 * candidate areas (used when map tiles are off).
 */
function offlinePlot(cells: GeoCell[], regions: GeoRegion[], colour: (m: number) => string): HTMLCanvasElement {
  const W = 720;
  const H = 400;
  // View: union of region bounds, padded, with at least 4° of latitude, at 2:1 aspect.
  let [s, w, n, e] = regions.length
    ? regions.reduce<[number, number, number, number]>((a, r) => [Math.min(a[0], r.bounds[0]), Math.min(a[1], r.bounds[1]), Math.max(a[2], r.bounds[2]), Math.max(a[3], r.bounds[3])], [90, 180, -90, -180])
    : [-90, -180, 90, 180];
  const padLat = Math.max(2, (n - s) * 0.3);
  const cy = (s + n) / 2;
  const cx = (w + e) / 2;
  let spanLat = Math.min(180, n - s + 2 * padLat);
  let spanLon = Math.min(360, Math.max(e - w + 2 * padLat, spanLat * (W / H)));
  spanLat = Math.min(180, Math.max(spanLat, spanLon * (H / W)));
  s = Math.max(-90, cy - spanLat / 2);
  n = Math.min(90, s + spanLat);
  w = Math.max(-180, cx - spanLon / 2);
  e = Math.min(180, w + spanLon);
  spanLat = n - s;
  spanLon = e - w;
  const X = (lon: number) => ((lon - w) / spanLon) * W;
  const Y = (lat: number) => ((n - lat) / spanLat) * H;

  const c = h("canvas", { class: "offline-plot", width: W, height: H, role: "img", "aria-label": "Candidate areas on a latitude/longitude grid" });
  const ctx = c.getContext("2d") as CanvasRenderingContext2D;
  ctx.fillStyle = cssVar("--chart-surface");
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = cssVar("--grid");
  ctx.fillStyle = cssVar("--text-muted");
  ctx.font = "11px system-ui, sans-serif";
  // Smallest round step that keeps the graticule at 12 lines or fewer.
  const step = [0.1, 0.2, 0.5, 1, 2, 5, 10, 30].find((g) => spanLon / g <= 12) ?? 30;
  for (let lon = Math.ceil(w / step) * step; lon <= e; lon += step) {
    ctx.beginPath();
    ctx.moveTo(X(lon) + 0.5, 0);
    ctx.lineTo(X(lon) + 0.5, H);
    ctx.stroke();
    ctx.fillText(`${+lon.toFixed(1)}°`, X(lon) + 3, H - 4);
  }
  for (let lat = Math.ceil(s / step) * step; lat <= n; lat += step) {
    ctx.beginPath();
    ctx.moveTo(0, Y(lat) + 0.5);
    ctx.lineTo(W, Y(lat) + 0.5);
    ctx.stroke();
    ctx.fillText(`${+lat.toFixed(1)}°`, 3, Y(lat) - 3);
  }
  for (const cell of cells) {
    ctx.fillStyle = colour(cell.misfit);
    const x0 = X(cell.lon - cell.size / 2);
    const y0 = Y(cell.lat + cell.size / 2);
    ctx.fillRect(x0, y0, Math.max(1, X(cell.lon + cell.size / 2) - x0), Math.max(1, Y(cell.lat - cell.size / 2) - y0));
  }
  ctx.font = "600 11px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const r of regions.slice(0, 20)) {
    const x = X(r.bestLon);
    const y = Y(r.bestLat);
    ctx.beginPath();
    ctx.arc(x, y, 9, 0, Math.PI * 2);
    ctx.fillStyle = cssVar("--chart-surface");
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = cssVar("--text-primary");
    ctx.stroke();
    ctx.fillStyle = cssVar("--text-primary");
    ctx.fillText(String(r.id + 1), x, y + 0.5);
  }
  return c;
}

export class PlaceResultsView {
  readonly el: HTMLElement;
  private summary = h("section", { class: "card result summary" });
  private mapHost = h("div", { class: "map-host" });
  private list = h("section", { class: "card result" });
  private budget = h("div");
  private map: ResultMap | null = null;
  private last: LocationSolveResult | null = null;

  constructor() {
    this.el = h(
      "div",
      { class: "results-stack" },
      this.summary,
      h("section", { class: "card result" }, h("div", { class: "card-head" }, h("h3", null, "Where it could be")), this.mapHost),
      this.list,
      h("details", { class: "card result" }, h("summary", null, h("h3", null, "Error budget")), this.budget),
    );
    onTilesChange(() => this.last && this.drawMap(this.last, null));
  }

  private palette() {
    const dof = this.last?.regions[0]?.bestFit.dof ?? 2;
    const p = heatPalette(misfitLevels(dof));
    return (m: number) => p.css(m);
  }

  private drawMap(res: LocationSolveResult, focus: number | null): void {
    if (!tilesEnabled()) {
      this.map = null;
      replace(this.mapHost, 
        offlinePlot(res.cells, res.regions, this.palette()),
        h("p", { class: "hint" }, "Offline plot (no map tiles loaded). ", h("button", { type: "button", class: "link", onclick: () => setTilesEnabled(true) }, "Load the OpenStreetMap basemap"), " — this reveals the viewed area to the tile server."),
      );
      return;
    }
    this.map ??= mountResultMap(this.mapHost, this.palette());
    this.map.onSelect((id) => this.focus(id));
    this.map.show(res.cells, res.regions, focus);
  }

  private focus(id: number): void {
    if (!this.last) return;
    this.map?.show(this.last.cells, this.last.regions, id);
    this.list.querySelectorAll<HTMLElement>("[data-region]").forEach((el) => el.classList.toggle("selected", Number(el.dataset.region) === id));
  }

  render(res: LocationSolveResult, req: LocationSolveRequest): void {
    this.last = res;
    const top = res.regions.slice(0, 3);
    replace(this.summary, 
      res.regions.length
        ? h("p", { class: "headline" }, res.regions.length === 1 ? "One candidate area" : `${res.regions.length} candidate areas`, res.regions.length > 1 ? `, the most likely holds ${fmtPct(res.regions[0].probability)}` : "", ".")
        : h("p", { class: "headline bad" }, "No compatible place found."),
      top.length
        ? h("ol", { class: "answers" }, top.map((r) =>
            h("li", null, h("button", { type: "button", class: "answer", onclick: () => this.focus(r.id) },
              h("span", { class: "num-badge" }, String(r.id + 1)),
              h("span", { class: "answer-main" }, `${fmtLatLon(r.bestLat, r.bestLon, 3)} · ${fmtArea(r.areaKm2)}`),
              h("span", { class: "answer-prob" }, fmtPct(r.probability)),
            )),
          ))
        : null,
      h("p", { class: "meta" }, `${req.shots.length} shadow${req.shots.length > 1 ? "s" : ""} · grid ${res.resolutionDeg.toFixed(3)}° · computed in ${(res.elapsedMs / 1000).toFixed(2)} s`),
      res.warnings.length ? h("details", { class: "notes", open: !res.regions.length }, h("summary", null, `Notes (${res.warnings.length})`), h("ul", null, res.warnings.map((w) => h("li", null, icon("warn", 16), h("span", null, w))))) : null,
    );
    this.drawMap(res, null);
    replace(this.list, 
      h("div", { class: "card-head" }, h("h3", null, "Candidate areas")),
      res.regions.length > 50 ? h("p", { class: "hint" }, `Showing the 50 most likely of ${res.regions.length}.`) : null,
      h(
        "div",
        { class: "table-scroll" },
        h(
          "table",
          { class: "windows" },
          h("thead", null, h("tr", null, ["#", "Best point", "Extent (S, W – N, E)", "Area", "Probability", ""].map((t) => h("th", { scope: "col" }, t)))),
          h("tbody", null, res.regions.slice(0, 50).map((r) =>
            h(
              "tr",
              { class: "clickable", dataset: { region: String(r.id) }, tabindex: 0, onclick: () => this.focus(r.id), onkeydown: (e: KeyboardEvent) => e.key === "Enter" && this.focus(r.id) },
              h("td", null, h("span", { class: "num-badge" }, String(r.id + 1))),
              h("td", { class: "num" }, fmtLatLon(r.bestLat, r.bestLon, 4)),
              h("td", { class: "num muted" }, `${r.bounds[0].toFixed(2)}, ${r.bounds[1].toFixed(2)} – ${r.bounds[2].toFixed(2)}, ${r.bounds[3].toFixed(2)}`),
              h("td", { class: "num" }, fmtArea(r.areaKm2)),
              h("td", { class: "num" }, fmtPct(r.probability)),
              h(
                "td",
                { class: "row-actions" },
                h("button", { type: "button", class: "btn ghost small", title: "Copy coordinates", onclick: (e: Event) => { e.stopPropagation(); copy(e.currentTarget as HTMLElement, fmtLatLon(r.bestLat, r.bestLon, 5)); } }, icon("copy", 14), "Copy"),
                h("a", { class: "btn ghost small", href: `https://www.openstreetmap.org/?mlat=${r.bestLat.toFixed(5)}&mlon=${r.bestLon.toFixed(5)}#map=12/${r.bestLat.toFixed(5)}/${r.bestLon.toFixed(5)}`, target: "_blank", rel: "noopener noreferrer", onclick: (e: Event) => e.stopPropagation() }, icon("pin", 14), "Open in OSM"),
              ),
            ),
          )),
        ),
      ),
    );
    renderBudget(this.budget, res.observations, req.shots.map((s) => s.label));
  }
}
