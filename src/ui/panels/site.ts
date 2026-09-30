/**
 * site.ts — the "Place" panel (time mode) and the "Search area" panel (place mode).
 *
 * Defines: renderSite(), renderSearchArea().
 * Used by: main.ts.
 * Depends on: ui/dom.ts, ui/state.ts, ui/map.ts, ui/request.ts, ui/format.ts, ui/presets.ts,
 *             core/parse.ts.
 */

import { parseLocation } from "../../core/parse";
import { field, h, info, replace, segmented } from "../dom";
import { fmtLatLon } from "../format";
import { mountSiteMap, type SiteMap } from "../map";
import { parseNumber } from "../request";
import { RADIUS_PRESETS } from "../presets";
import type { Store } from "../state";

let siteMap: SiteMap | null = null;
let mapHost: HTMLElement | null = null;

function radiusM(s: Store["state"]): number {
  const r = parseNumber(s.site.radius);
  return (Number.isFinite(r) ? r : 0) * (s.site.radiusUnit === "km" ? 1000 : 1);
}

/** One-line summary for the collapsed guided step. */
export function siteSummary(s: Store["state"]): string {
  const ll = parseLocation(s.site.loc);
  if (!ll) return "Not set";
  const p = RADIUS_PRESETS.find((x) => x.radius === s.site.radius && x.unit === s.site.radiusUnit);
  return `${fmtLatLon(ll.lat, ll.lon, 4)} · within ${s.site.radius} ${s.site.radiusUnit}${p ? ` (${p.label.toLowerCase()})` : ""}`;
}

let customRadius = false;

export function renderSite(root: HTMLElement, store: Store, invalid: Set<string>, guided = false): void {
  const s = store.state;
  const status = h("small", { class: "hint", "aria-live": "polite" });
  const showStatus = () => {
    const ll = parseLocation(store.state.site.loc);
    status.textContent = ll ? `✓ ${fmtLatLon(ll.lat, ll.lon)}` : store.state.site.loc.trim() ? "Not recognised yet" : "";
    status.classList.toggle("ok", !!ll);
    if (ll) siteMap?.set(ll.lat, ll.lon, radiusM(store.state));
  };

  const locInput = field({
    label: "Coordinates",
    value: s.site.loc,
    name: "site.loc",
    invalid: invalid.has("site.loc"),
    inputmode: "text",
    wide: true,
    placeholder: "48.8584, 2.2945 or a map link",
    info: "Paste coordinates in any usual form: decimal (48.8584, 2.2945), degrees-minutes-seconds (48°51′30″N 2°17′40″E), or a Google Maps / OpenStreetMap link. You can also click the map once it is loaded.",
    onInput: (v) => {
      store.update((st) => (st.site.loc = v));
      showStatus();
    },
  });
  locInput.append(status);

  const unitId = "radius-unit";
  // WHY keep the map host across rebuilds: re-creating Leaflet on every structural change
  // would flash the map and lose the user's zoom.
  mapHost ??= h("div", { class: "map-host" });
  siteMap ??= mountSiteMap(mapHost, (lat, lon) => {
    const text = `${lat.toFixed(6)}, ${lon.toFixed(6)}`;
    store.update((st) => (st.site.loc = text), true);
  });

  // Radius presets as plain-language chips; the exact field stays one click away.
  const current = RADIUS_PRESETS.find((p) => p.radius === s.site.radius && p.unit === s.site.radiusUnit);
  const showExact = !guided || customRadius || !current;
  const chips = h(
    "div",
    { class: "stack tight" },
    h("div", { class: "label-row" }, h("span", { class: "field-label" }, "Known to within"), info("Place precision", "The photo was taken somewhere within this distance of the coordinates. It is a hard bound: ShadowClock checks every position inside it.", "Exact spot = 10 m · Street = 100 m · Town = 5 km · Region = 50 km.")),
    h(
      "div",
      { class: "chips", role: "group", "aria-label": "Place precision" },
      RADIUS_PRESETS.map((p) =>
        h("button", {
          type: "button",
          class: `chip-btn${current === p && !customRadius ? " on" : ""}`,
          "aria-pressed": current === p && !customRadius ? "true" : "false",
          title: `${p.radius} ${p.unit}`,
          onclick: () => {
            customRadius = false;
            store.update((st) => { st.site.radius = p.radius; st.site.radiusUnit = p.unit; }, true);
          },
        }, p.label),
      ),
      guided
        ? h("button", { type: "button", class: `chip-btn${showExact ? " on" : ""}`, "aria-pressed": showExact ? "true" : "false", onclick: () => { customRadius = true; store.update(() => {}, true); } }, "Other…")
        : null,
    ),
  );

  replace(root, 
    locInput,
    chips,
    showExact && h(
      "div",
      { class: "row" },
      h(
        "div",
        { class: "field" },
        h("label", { for: "radius-in" }, "Radius"),
        h(
          "div",
          { class: "input-wrap joined" },
          h("input", {
            id: "radius-in",
            value: s.site.radius,
            inputmode: "decimal",
            "aria-invalid": invalid.has("site.radius") ? "true" : undefined,
            "data-field": "site.radius",
            oninput: (e: Event) => {
              store.update((st) => (st.site.radius = (e.target as HTMLInputElement).value));
              showStatus();
            },
          }),
          h(
            "select",
            {
              id: unitId,
              "aria-label": "Radius unit",
              onchange: (e: Event) => {
                store.update((st) => (st.site.radiusUnit = (e.target as HTMLSelectElement).value as "m" | "km"));
                showStatus();
              },
            },
            h("option", { value: "m", selected: s.site.radiusUnit === "m" }, "m"),
            h("option", { value: "km", selected: s.site.radiusUnit === "km" }, "km"),
          ),
        ),
      ),
    ),
    mapHost,
  );
  showStatus();
}

export function renderSearchArea(root: HTMLElement, store: Store, invalid: Set<string>): void {
  const s = store.state;
  replace(root, 
    h("div", { class: "label-row" }, h("span", { class: "field-label" }, "Search"), info("Search area", "If you already know the country or region, restrict the search to a box: it is faster and removes far-away look-alikes.")),
    segmented("area", "Search area", [
      { value: "world", label: "Whole Earth" },
      { value: "bbox", label: "Bounding box" },
    ], s.search.kind, (v) => store.update((st) => (st.search.kind = v), true)),
    s.search.kind === "bbox"
      ? field({
          label: "South, west, north, east (degrees)",
          value: s.search.bbox,
          name: "search.bbox",
          invalid: invalid.has("search.bbox"),
          inputmode: "text",
          wide: true,
          placeholder: "41, -5.5, 51.5, 10",
          onInput: (v) => store.update((st) => (st.search.bbox = v)),
        })
      : null,
  );
}
