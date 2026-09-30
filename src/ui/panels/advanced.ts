/**
 * advanced.ts — the "Advanced" panel: atmosphere, refraction and ΔT.
 *
 * Defines: renderAdvanced().
 * Used by: main.ts.
 * Depends on: ui/dom.ts, ui/state.ts.
 */

import { field, h, info } from "../dom";
import type { Store } from "../state";

export function renderAdvanced(root: HTMLElement, store: Store, invalid: Set<string>): void {
  const s = store.state;
  root.replaceChildren(
    h(
      "div",
      { class: "row" },
      field({ label: "Air pressure", value: s.adv.pressure, name: "adv.pressure", invalid: invalid.has("adv.pressure"), suffix: "hPa", onInput: (v) => store.update((st) => (st.adv.pressure = v)) }),
      field({ label: "Temperature", value: s.adv.temp, name: "adv.temp", invalid: invalid.has("adv.temp"), suffix: "°C", onInput: (v) => store.update((st) => (st.adv.temp = v)) }),
    ),
    h(
      "div",
      { class: "label-row" },
      h(
        "label",
        { class: "switch" },
        h("input", { type: "checkbox", role: "switch", checked: s.adv.refraction, onchange: (e: Event) => store.update((st) => (st.adv.refraction = (e.target as HTMLInputElement).checked)) }),
        h("span", null, "Atmospheric refraction"),
      ),
      info("Refraction", "The air bends sunlight, raising the Sun slightly — up to half a degree near the horizon. Keep it on for real photos. Pressure and temperature fine-tune it; the defaults suit almost every photo."),
    ),
    field({
      label: "ΔT override (TT − UT)",
      value: s.adv.deltaT,
      name: "adv.deltaT",
      invalid: invalid.has("adv.deltaT"),
      suffix: "s",
      placeholder: "model",
      info: "Difference between atomic and Earth-rotation time. Leave empty to use the Espenak–Meeus model; one second changes the Sun by only ~0.004°.",
      onInput: (v) => store.update((st) => (st.adv.deltaT = v)),
    }),
  );
}
