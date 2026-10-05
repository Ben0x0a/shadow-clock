/**
 * map.ts — Leaflet maps: the site picker (time mode) and the result map (place mode).
 *
 * Defines: tilesAllowed(), askForTiles(), onTilesChange(), mountSiteMap(), mountResultMap().
 * Used by: features/inputs/panels/site.ts, features/results/place/view.ts.
 * Depends on: Leaflet 1.9.4 (npm, pinned by the lockfile, with its stylesheet), the
 *             platform's consent gate (ui/context.ts), core/models.ts, ui/dom.ts.
 *
 * WHY the consent gate: every tile request tells the tile server which area is being
 * looked at, which can disclose the subject of an investigation. Leaflet loads its own
 * images, so it cannot go through platform.net; tiles load only after
 * platform.consent.request() allowed https://tile.openstreetmap.org (declared in
 * src/site.json netOrigins, which also generates the CSP and states the referrer).
 * Everything else works without a map.
 */

import * as L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { GeoCell, GeoRegion } from "../core/models.ts";
import { platform, t } from "./context.ts";
import { h, icon, info } from "./dom.ts";

const TILE_ORIGIN = "https://tile.openstreetmap.org";
const listeners = new Set<() => void>();

/** True when the user already allowed the tile server (always, or for this session). */
export function tilesAllowed(): boolean {
  const state = platform().consent.state(TILE_ORIGIN);
  return state === "always" || state === "session-allow";
}

/** Opens the consent dialog; when allowed, every map on the page loads its tiles. */
export async function askForTiles(): Promise<void> {
  // WHY: this runs only on an explicit click. An earlier "Deny" for this session would
  // otherwise make the button silently do nothing; a deliberate click deserves the
  // question again. ("Always allow" is never reached here: the map is already shown.)
  const consent = platform().consent;
  if (consent.state(TILE_ORIGIN) === "session-deny") consent.forget(TILE_ORIGIN);
  if (await consent.request(TILE_ORIGIN)) listeners.forEach((l) => l());
}

export function onTilesChange(l: () => void): void {
  listeners.add(l);
}

function baseMap(el: HTMLElement): L.Map {
  const map = L.map(el, { worldCopyJump: true, zoomControl: true, attributionControl: true }).setView([20, 0], 2);
  L.tileLayer(`${TILE_ORIGIN}/{z}/{x}/{y}.png`, {
    maxZoom: 19,
    attribution: t("map.attribution"),
    // WHY: the page sends no Referer (platform default), but OpenStreetMap's tile usage
    // policy asks for one. "strict-origin" sends only this site's origin, never the page
    // URL; it is declared in site.json, so the consent dialog states it.
    referrerPolicy: "strict-origin",
  }).addTo(map);
  return map;
}

/** Compact consent row: no tile is requested until the user asks for the map. */
function consent(what: string): HTMLElement {
  return h(
    "div",
    { class: "map-consent" },
    h("button", { type: "button", class: "btn", onclick: () => void askForTiles() }, icon("pin", 16), what),
    info(t("map.privacyTitle"), t("map.privacyInfo")),
  );
}

export interface SiteMap {
  set(lat: number, lon: number, radiusM: number): void;
}

/** Map for picking the site. `onPick` receives a clicked position. */
export function mountSiteMap(host: HTMLElement, onPick: (lat: number, lon: number) => void): SiteMap {
  let map: L.Map | null = null;
  let marker: L.CircleMarker | null = null;
  let circle: L.Circle | null = null;
  let last: [number, number, number] | null = null;

  const draw = () => {
    if (!map || !last) return;
    const [lat, lon, r] = last;
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
    const first = !marker;
    marker ??= L.circleMarker([lat, lon], { radius: 6, className: "site-marker" }).addTo(map);
    circle ??= L.circle([lat, lon], { radius: 1, className: "site-radius" }).addTo(map);
    marker.setLatLng([lat, lon]);
    circle.setLatLng([lat, lon]).setRadius(Math.max(r, 1));
    if (first) map.setView([lat, lon], r > 5000 ? 8 : 14);
  };

  const init = () => {
    if (map || !tilesAllowed()) {
      if (!tilesAllowed()) host.replaceChildren(consent(t("map.pick")));
      return;
    }
    const el = h("div", { class: "map" });
    host.replaceChildren(el);
    map = baseMap(el);
    map.on("click", (e: L.LeafletMouseEvent) => onPick(e.latlng.lat, L.Util.wrapNum(e.latlng.lng, [-180, 180], true)));
    draw();
  };
  onTilesChange(init);
  init();

  return {
    set(lat, lon, radiusM) {
      last = [lat, lon, radiusM];
      draw();
    },
  };
}

export interface ResultMap {
  show(cells: GeoCell[], regions: GeoRegion[], focus: number | null): void;
  onSelect(fn: (regionId: number) => void): void;
}

/** A canvas grid layer that paints accepted cells, bucketed by whole degree for speed. */
function cellLayer(cells: GeoCell[], colour: (m: number) => string): L.GridLayer {
  const buckets = new Map<string, GeoCell[]>();
  for (const c of cells) {
    const k = `${Math.floor(c.lat)}|${Math.floor(c.lon)}`;
    const b = buckets.get(k);
    if (b) b.push(c);
    else buckets.set(k, [c]);
  }
  const Layer = L.GridLayer.extend({
    createTile(this: L.GridLayer, coords: L.Coords) {
      const tile = document.createElement("canvas");
      const size = this.getTileSize();
      tile.width = size.x;
      tile.height = size.y;
      const ctx = tile.getContext("2d") as CanvasRenderingContext2D;
      const map = (this as unknown as { _map: L.Map })._map;
      const nw = coords.scaleBy(size);
      const bounds = map.unproject(nw, coords.z);
      const se = map.unproject(nw.add(size), coords.z);
      for (let la = Math.floor(se.lat) - 1; la <= Math.floor(bounds.lat) + 1; la++) {
        for (let lo = Math.floor(bounds.lng) - 1; lo <= Math.floor(se.lng) + 1; lo++) {
          const wrapped = ((lo + 180) % 360 + 360) % 360 - 180;
          const b = buckets.get(`${la}|${wrapped}`);
          if (!b) continue;
          const shift = lo - wrapped;
          for (const c of b) {
            const p1 = map.project([c.lat + c.size / 2, c.lon + shift - c.size / 2], coords.z).subtract(nw);
            const p2 = map.project([c.lat - c.size / 2, c.lon + shift + c.size / 2], coords.z).subtract(nw);
            ctx.fillStyle = colour(c.misfit);
            ctx.fillRect(p1.x, p1.y, Math.max(1, p2.x - p1.x), Math.max(1, p2.y - p1.y));
          }
        }
      }
      return tile;
    },
  });
  return new (Layer as unknown as new (o: L.GridLayerOptions) => L.GridLayer)({ opacity: 0.75 });
}

export function mountResultMap(host: HTMLElement, colour: (m: number) => string): ResultMap {
  let map: L.Map | null = null;
  let layer: L.GridLayer | null = null;
  let pins: L.LayerGroup | null = null;
  let pending: [GeoCell[], GeoRegion[], number | null] | null = null;
  let select: (id: number) => void = () => {};

  const draw = () => {
    if (!map || !pending) return;
    const [cells, regions, focus] = pending;
    layer?.remove();
    pins?.remove();
    layer = cellLayer(cells, colour).addTo(map);
    pins = L.layerGroup(
      regions.slice(0, 20).map((r) =>
        L.circleMarker([r.bestLat, r.bestLon], { radius: 6, className: "region-pin" })
          .bindTooltip(`#${r.id + 1}`, { permanent: regions.length <= 6, direction: "top" })
          .on("click", () => select(r.id)),
      ),
    ).addTo(map);
    const target = focus !== null ? regions.find((r) => r.id === focus) : null;
    const b = target ? target.bounds : regions.length ? regions.reduce<[number, number, number, number]>((a, r) => [Math.min(a[0], r.bounds[0]), Math.min(a[1], r.bounds[1]), Math.max(a[2], r.bounds[2]), Math.max(a[3], r.bounds[3])], [90, 180, -90, -180]) : null;
    if (b) map.fitBounds([[b[0], b[1]], [b[2], b[3]]], { padding: [24, 24], maxZoom: 13 });
  };

  const init = () => {
    if (map) return;
    if (!tilesAllowed()) {
      host.replaceChildren(consent(t("map.show")));
      return;
    }
    const el = h("div", { class: "map tall" });
    host.replaceChildren(el);
    map = baseMap(el);
    draw();
  };
  onTilesChange(init);
  init();

  return {
    show(cells, regions, focus) {
      pending = [cells, regions, focus];
      draw();
    },
    onSelect(fn) {
      select = fn;
    },
  };
}
