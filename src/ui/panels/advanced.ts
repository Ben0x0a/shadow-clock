/**
 * advanced.ts — the "Advanced" panel: atmosphere, refraction and ΔT.
 *
 * Defines: renderAdvanced().
 * Used by: main.ts.
 * Depends on: ui/dom.ts, ui/state.ts.
 */

import { field, h } from "../dom";
import type { Store } from "../state";

export function renderAdvanced(root: HTMLElement, store: Store, invalid: Set<string>): void {
  const s = store.state;
  root.replaceChildren(
    h("p", { class: "section-intro" }, "The defaults suit almost every photo. Refraction matters only when the Sun is low."),
    h(
      "div",
      { class: "row" },
      field({ label: "Air pressure", value: s.adv.pressure, name: "adv.pressure", invalid: invalid.has("adv.pressure"), suffix: "hPa", onInput: (v) => store.update((st) => (st.adv.pressure = v)) }),
      field({ label: "Temperature", value: s.adv.temp, name: "adv.temp", invalid: invalid.has("adv.temp"), suffix: "°C", onInput: (v) => store.update((st) => (st.adv.temp = v)) }),
    ),
    h(
      "label",
      { class: "switch" },
      h("input", { type: "checkbox", role: "switch", checked: s.adv.refraction, onchange: (e: Event) => store.update((st) => (st.adv.refraction = (e.target as HTMLInputElement).checked)) }),
      h("span", null, "Atmospheric refraction (keep on for real photos)"),
    ),
    field({
      label: "ΔT override (TT − UT)",
      value: s.adv.deltaT,
      name: "adv.deltaT",
      invalid: invalid.has("adv.deltaT"),
      suffix: "s",
      placeholder: "model",
      hint: "Leave empty to use the Espenak–Meeus model. One second changes the Sun by only ~0.004°.",
      onInput: (v) => store.update((st) => (st.adv.deltaT = v)),
    }),
  );
}
