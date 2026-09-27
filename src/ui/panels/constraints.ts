/**
 * constraints.ts — the "When could it be?" panel (time mode): years, time zone, months,
 * time of day and absolute bounds.
 *
 * Defines: renderConstraints(), constraintsSummary().
 * Used by: main.ts (expert view), ui/guided.ts.
 * Depends on: ui/dom.ts, ui/state.ts, ui/format.ts.
 */

import { field, h, replace } from "../dom";
import { MONTH_NAMES } from "../format";
import type { AppState, Store } from "../state";

let zoneList: string[] | null = null;
function ianaZones(): string[] {
  if (zoneList) return zoneList;
  const intl = Intl as unknown as { supportedValuesOf?: (k: string) => string[] };
  zoneList = intl.supportedValuesOf ? intl.supportedValuesOf("timeZone") : [];
  return zoneList;
}

/** One-line summary for the collapsed guided step. */
export function constraintsSummary(s: AppState): string {
  const c = s.cons;
  const years = c.yearFrom === c.yearTo || !c.yearTo ? c.yearFrom : `${c.yearFrom}–${c.yearTo}`;
  const zone = c.zoneKind === "utc" ? "UTC" : c.zoneKind === "solar" ? "solar time" : c.zoneValue || c.zoneKind;
  const extra: string[] = [];
  if (!c.months.every(Boolean)) extra.push(c.months.map((m, i) => (m ? MONTH_NAMES[i] : "")).filter(Boolean).join(" "));
  if (c.todFrom && c.todTo) extra.push(`${c.todFrom}–${c.todTo}`);
  if (c.notBefore || c.notAfter) extra.push("date bounds");
  return [years, zone, ...extra].join(" · ");
}

export function renderConstraints(root: HTMLElement, store: Store, invalid: Set<string>, guided = false): void {
  const s = store.state;
  const upd = (fn: (s: AppState) => void, structural = false) => store.update(fn, structural);
  const nowY = new Date().getUTCFullYear();

  const yearPresets: [string, number, number][] = [
    ["This year", nowY, nowY],
    ["Last 5 years", nowY - 4, nowY],
    ["Last 20 years", nowY - 19, nowY],
  ];

  const zoneSelectId = "zone-kind";
  const zoneBlock = h(
    "div",
    { class: "row" },
    h(
      "div",
      { class: "field" },
      h("label", { for: zoneSelectId }, "Show and filter times in"),
      h(
        "select",
        { id: zoneSelectId, onchange: (e: Event) => upd((st) => (st.cons.zoneKind = (e.target as HTMLSelectElement).value as AppState["cons"]["zoneKind"]), true) },
        ([
          ["utc", "UTC"],
          ["iana", "Time zone"],
          ["offset", "UTC offset"],
          ["solar", "Solar time"],
        ] as const).map(([v, l]) => h("option", { value: v, selected: s.cons.zoneKind === v }, l)),
      ),
    ),
    s.cons.zoneKind === "iana"
      ? field({ label: "Time zone", value: s.cons.zoneValue, name: "cons.zone", invalid: invalid.has("cons.zone"), inputmode: "text", placeholder: "Europe/Paris", list: "iana-zones", onInput: (v) => upd((st) => (st.cons.zoneValue = v)) })
      : s.cons.zoneKind === "offset"
        ? field({ label: "Offset", value: s.cons.zoneValue, name: "cons.zone", invalid: invalid.has("cons.zone"), inputmode: "text", placeholder: "+02:00", onInput: (v) => upd((st) => (st.cons.zoneValue = v)) })
        : null,
  );

  const months = h(
    "fieldset",
    { class: "group months" },
    h("legend", null, "Months"),
    h(
      "div",
      { class: "chips" },
      MONTH_NAMES.map((m, i) =>
        h(
          "label",
          { class: "chip" },
          h("input", { type: "checkbox", checked: s.cons.months[i], onchange: (e: Event) => upd((st) => (st.cons.months[i] = (e.target as HTMLInputElement).checked)) }),
          h("span", null, m),
        ),
      ),
    ),
    h(
      "div",
      { class: "chip-actions" },
      h("button", { type: "button", class: "link", onclick: () => upd((st) => (st.cons.months = Array(12).fill(true)), true) }, "All"),
      h("button", { type: "button", class: "link", onclick: () => upd((st) => (st.cons.months = [false, false, false, false, true, true, true, true, true, false, false, false]), true) }, "May–Sep"),
      h("button", { type: "button", class: "link", onclick: () => upd((st) => (st.cons.months = [true, true, true, true, false, false, false, false, false, true, true, true]), true) }, "Oct–Apr"),
    ),
  );

  const timeInput = (key: "todFrom" | "todTo", label: string) => {
    const id = `tod-${key}`;
    return h(
      "div",
      { class: "field" },
      h("label", { for: id }, label),
      h("input", {
        id,
        type: "time",
        value: s.cons[key],
        "data-field": `cons.${key}`,
        "aria-invalid": invalid.has(`cons.${key}`) ? "true" : undefined,
        oninput: (e: Event) => upd((st) => (st.cons[key] = (e.target as HTMLInputElement).value)),
      }),
    );
  };

  const extras = () => [
    months,
    h(
      "fieldset",
      { class: "group" },
      h("legend", null, "Time of day (optional)"),
      h("div", { class: "row" }, timeInput("todFrom", "From"), timeInput("todTo", "To")),
      h("small", { class: "hint" }, "In the zone chosen above. A window like 22:00 → 04:00 wraps past midnight."),
    ),
    h(
      "fieldset",
      { class: "group" },
      h("legend", null, "Absolute bounds (optional)"),
      h(
        "div",
        { class: "row" },
        field({ label: "Not before", value: s.cons.notBefore, name: "cons.notBefore", invalid: invalid.has("cons.notBefore"), inputmode: "text", placeholder: "2024-03-01", onInput: (v) => upd((st) => (st.cons.notBefore = v)) }),
        field({ label: "Not after", value: s.cons.notAfter, name: "cons.notAfter", invalid: invalid.has("cons.notAfter"), inputmode: "text", placeholder: "2024-10-31 18:00", onInput: (v) => upd((st) => (st.cons.notAfter = v)) }),
      ),
      h("small", { class: "hint" }, "E.g. the upload date, or when a building visible in the photo was finished."),
    ),
  ];

  replace(root,
    h("p", { class: "section-intro" }, "Anything you already know narrows the answer. Shadows cannot tell years apart, so give the years to consider."),
    h(
      "div",
      { class: "row" },
      field({ label: "From year", value: s.cons.yearFrom, name: "cons.yearFrom", invalid: invalid.has("cons.yearFrom"), inputmode: "numeric", onInput: (v) => upd((st) => (st.cons.yearFrom = v)) }),
      field({ label: "To year", value: s.cons.yearTo, name: "cons.yearTo", invalid: invalid.has("cons.yearTo"), inputmode: "numeric", onInput: (v) => upd((st) => (st.cons.yearTo = v)) }),
    ),
    h(
      "div",
      { class: "chip-actions" },
      yearPresets.map(([l, a, b]) =>
        h("button", { type: "button", class: "link", onclick: () => upd((st) => { st.cons.yearFrom = String(a); st.cons.yearTo = String(b); }, true) }, l),
      ),
    ),
    zoneBlock,
    guided
      ? h(
          "details",
          { class: "more", open: !s.cons.months.every(Boolean) || !!s.cons.todFrom || !!s.cons.notBefore || !!s.cons.notAfter },
          h("summary", null, "More: season, time of day, dates"),
          h("div", { class: "stack" }, ...extras()),
        )
      : extras(),
    h("datalist", { id: "iana-zones" }, ianaZones().map((z) => h("option", { value: z }))),
  );
}
