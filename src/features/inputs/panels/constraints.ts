/**
 * constraints.ts — the "When could it be?" panel (time mode): years, time zone, months,
 * time of day and absolute bounds.
 *
 * Defines: renderConstraints(), constraintsSummary().
 * Used by: features/inputs/inputs.ts (expert view), features/inputs/guided.ts.
 * Depends on: ui/dom.ts, core/form.ts, ui/format.ts.
 */

import { field, h, info, replace } from "../../../ui/dom.ts";
import { monthName } from "../../../ui/format.ts";
import type { AppState } from "../../../core/form.ts";
import type { CaseStore } from "../../../state/case.ts";
import { t } from "../../../ui/context.ts";

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
  const zone = c.zoneKind === "utc" ? t("zone.utc") : c.zoneKind === "solar" ? t("zone.solar") : c.zoneValue || c.zoneKind;
  const extra: string[] = [];
  if (!c.months.every(Boolean)) extra.push(c.months.map((m, i) => (m ? monthName(i) : "")).filter(Boolean).join(" "));
  if (c.todFrom && c.todTo) extra.push(`${c.todFrom}–${c.todTo}`);
  if (c.notBefore || c.notAfter) extra.push(t("cons.dateBoundsShort"));
  return [years, zone, ...extra].join(" · ");
}

export function renderConstraints(root: HTMLElement, store: CaseStore, invalid: Set<string>, guided = false): void {
  const s = store.state;
  const upd = (fn: (s: AppState) => void, structural = false) => store.update(fn, structural);
  const nowY = new Date().getUTCFullYear();

  const yearPresets: [string, number, number][] = [
    [t("cons.thisYear"), nowY, nowY],
    [t("cons.last5"), nowY - 4, nowY],
    [t("cons.last20"), nowY - 19, nowY],
  ];

  const zoneSelectId = "zone-kind";
  const zoneBlock = h(
    "div",
    { class: "row" },
    h(
      "div",
      { class: "field" },
      h("label", { for: zoneSelectId }, t("cons.showIn")),
      h(
        "select",
        { id: zoneSelectId, onchange: (e: Event) => upd((st) => (st.cons.zoneKind = (e.target as HTMLSelectElement).value as AppState["cons"]["zoneKind"]), true) },
        ([
          ["utc", "zone.utc"],
          ["iana", "cons.zoneIana"],
          ["offset", "cons.zoneOffset"],
          ["solar", "zone.solar"],
        ] as const).map(([v, l]) => h("option", { value: v, selected: s.cons.zoneKind === v }, t(l))),
      ),
    ),
    s.cons.zoneKind === "iana"
      ? field({ label: t("cons.zoneIana"), value: s.cons.zoneValue, name: "cons.zone", invalid: invalid.has("cons.zone"), inputmode: "text", placeholder: "Europe/Paris", list: "iana-zones", onInput: (v) => upd((st) => (st.cons.zoneValue = v)) })
      : s.cons.zoneKind === "offset"
        ? field({ label: t("cons.zoneOffset"), value: s.cons.zoneValue, name: "cons.zone", invalid: invalid.has("cons.zone"), inputmode: "text", placeholder: "+02:00", onInput: (v) => upd((st) => (st.cons.zoneValue = v)) })
        : null,
  );

  const months = h(
    "fieldset",
    { class: "group months" },
    h("legend", null, t("cons.months")),
    h(
      "div",
      { class: "chips" },
      Array.from({ length: 12 }, (_, i) => monthName(i)).map((m, i) =>
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
      h("button", { type: "button", class: "link", onclick: () => upd((st) => (st.cons.months = Array(12).fill(true)), true) }, t("cons.allMonths")),
      h("button", { type: "button", class: "link", onclick: () => upd((st) => (st.cons.months = [false, false, false, false, true, true, true, true, true, false, false, false]), true) }, t("cons.maySep")),
      h("button", { type: "button", class: "link", onclick: () => upd((st) => (st.cons.months = [true, true, true, true, false, false, false, false, false, true, true, true]), true) }, t("cons.octApr")),
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
      h("legend", null, t("cons.tod"), " ", info(t("cons.tod"), t("cons.todInfo"))),
      h("div", { class: "row" }, timeInput("todFrom", t("cons.from")), timeInput("todTo", t("cons.to"))),
    ),
    h(
      "fieldset",
      { class: "group" },
      h("legend", null, t("cons.dateBounds"), " ", info(t("cons.dateBounds"), t("cons.dateBoundsInfo"))),
      h(
        "div",
        { class: "row" },
        field({ label: t("cons.notBefore"), value: s.cons.notBefore, name: "cons.notBefore", invalid: invalid.has("cons.notBefore"), inputmode: "text", placeholder: "2024-03-01", onInput: (v) => upd((st) => (st.cons.notBefore = v)) }),
        field({ label: t("cons.notAfter"), value: s.cons.notAfter, name: "cons.notAfter", invalid: invalid.has("cons.notAfter"), inputmode: "text", placeholder: "2024-10-31 18:00", onInput: (v) => upd((st) => (st.cons.notAfter = v)) }),
      ),
    ),
  ];

  replace(root,
    h("div", { class: "label-row" }, h("span", { class: "section-intro" }, t("cons.whichYears")), info(t("cons.years"), t("cons.yearsInfo"))),
    h(
      "div",
      { class: "row" },
      field({ label: t("field.yearFrom"), value: s.cons.yearFrom, name: "cons.yearFrom", invalid: invalid.has("cons.yearFrom"), inputmode: "numeric", onInput: (v) => upd((st) => (st.cons.yearFrom = v)) }),
      field({ label: t("field.yearTo"), value: s.cons.yearTo, name: "cons.yearTo", invalid: invalid.has("cons.yearTo"), inputmode: "numeric", onInput: (v) => upd((st) => (st.cons.yearTo = v)) }),
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
          h("summary", null, t("cons.more")),
          h("div", { class: "stack" }, ...extras()),
        )
      : extras(),
    h("datalist", { id: "iana-zones" }, ianaZones().map((z) => h("option", { value: z }))),
  );
}
