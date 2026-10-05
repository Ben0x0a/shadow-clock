/**
 * site.ts — the "Place" panel (time mode) and the "Search area" panel (place mode).
 *
 * Defines: renderSite(), renderSearchArea().
 * Used by: features/inputs/inputs.ts (expert view), features/inputs/guided.ts.
 * Depends on: ui/dom.ts, core/form.ts, ui/map.ts, core/request.ts, ui/format.ts, core/presets.ts,
 *             core/parse.ts.
 */

import { parseLocation } from "../../../core/parse.ts";
import { field, h, info, replace, segmented } from "../../../ui/dom.ts";
import { fmtLatLon } from "../../../ui/format.ts";
import { mountSiteMap, type SiteMap } from "../../../ui/map.ts";
import { parseNumber } from "../../../core/request.ts";
import { RADIUS_PRESETS } from "../../../core/presets.ts";
import type { CaseStore } from "../../../state/case.ts";
import { t } from "../../../ui/context.ts";

let siteMap: SiteMap | null = null;
let mapHost: HTMLElement | null = null;

function radiusM(s: CaseStore["state"]): number {
  const r = parseNumber(s.site.radius);
  return (Number.isFinite(r) ? r : 0) * (s.site.radiusUnit === "km" ? 1000 : 1);
}

/** One-line summary for the collapsed guided step. */
export function siteSummary(s: CaseStore["state"]): string {
  const ll = parseLocation(s.site.loc);
  if (!ll) return t("site.notSet");
  const p = RADIUS_PRESETS.find((x) => x.radius === s.site.radius && x.unit === s.site.radiusUnit);
  const within = t("site.within", { r: s.site.radius, unit: s.site.radiusUnit });
  return `${fmtLatLon(ll.lat, ll.lon, 4)} · ${within}${p ? ` (${t(p.label).toLowerCase()})` : ""}`;
}

let customRadius = false;

export function renderSite(root: HTMLElement, store: CaseStore, invalid: Set<string>, guided = false): void {
  const s = store.state;
  const status = h("small", { class: "hint", "aria-live": "polite" });
  const showStatus = () => {
    const ll = parseLocation(store.state.site.loc);
    status.textContent = ll ? `✓ ${fmtLatLon(ll.lat, ll.lon)}` : store.state.site.loc.trim() ? t("site.notRecognised") : "";
    status.classList.toggle("ok", !!ll);
    if (ll) siteMap?.set(ll.lat, ll.lon, radiusM(store.state));
  };

  const locInput = field({
    label: t("site.coords"),
    value: s.site.loc,
    name: "site.loc",
    invalid: invalid.has("site.loc"),
    inputmode: "text",
    wide: true,
    placeholder: t("site.coordsPlaceholder"),
    info: t("site.coordsInfo"),
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
    h("div", { class: "label-row" }, h("span", { class: "field-label" }, t("site.knownWithin")), info(t("site.precisionTitle"), t("site.precisionInfo"), t("site.precisionPresets"))),
    h(
      "div",
      { class: "chips", role: "group", "aria-label": t("site.precisionTitle") },
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
        }, t(p.label)),
      ),
      guided
        ? h("button", { type: "button", class: `chip-btn${showExact ? " on" : ""}`, "aria-pressed": showExact ? "true" : "false", onclick: () => { customRadius = true; store.update(() => {}, true); } }, t("site.other"))
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
        // WHY a labelled select too: every form field needs a real label (house rule).
        h("label", { for: "radius-in", id: "radius-label" }, t("field.radius")),
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
              "aria-labelledby": "radius-label radius-unit-label",
              onchange: (e: Event) => {
                store.update((st) => (st.site.radiusUnit = (e.target as HTMLSelectElement).value as "m" | "km"));
                showStatus();
              },
            },
            h("option", { value: "m", selected: s.site.radiusUnit === "m" }, "m"),
            h("option", { value: "km", selected: s.site.radiusUnit === "km" }, "km"),
          ),
          h("span", { id: "radius-unit-label", class: "visually-hidden" }, t("site.unit")),
        ),
      ),
    ),
    mapHost,
  );
  showStatus();
}

export function renderSearchArea(root: HTMLElement, store: CaseStore, invalid: Set<string>): void {
  const s = store.state;
  replace(root, 
    h("div", { class: "label-row" }, h("span", { class: "field-label" }, t("area.search")), info(t("panel.area"), t("area.info"))),
    segmented("area", t("panel.area"), [
      { value: "world", label: t("area.world") },
      { value: "bbox", label: t("area.box") },
    ], s.search.kind, (v) => store.update((st) => (st.search.kind = v), true)),
    s.search.kind === "bbox"
      ? field({
          label: t("area.boxLabel"),
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
