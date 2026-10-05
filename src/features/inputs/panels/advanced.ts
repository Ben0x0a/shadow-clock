/**
 * advanced.ts — the "Advanced" panel: atmosphere, refraction and ΔT.
 *
 * Defines: renderAdvanced().
 * Used by: features/inputs/inputs.ts (settings panel).
 * Depends on: ui/dom.ts, core/form.ts.
 */

import { field, h, info, switchButton } from "../../../ui/dom.ts";
import type { CaseStore } from "../../../state/case.ts";
import { t } from "../../../ui/context.ts";

export function renderAdvanced(root: HTMLElement, store: CaseStore, invalid: Set<string>): void {
  const s = store.state;
  root.replaceChildren(
    h(
      "div",
      { class: "row" },
      field({ label: t("field.pressure"), value: s.adv.pressure, name: "adv.pressure", invalid: invalid.has("adv.pressure"), suffix: "hPa", onInput: (v) => store.update((st) => (st.adv.pressure = v)) }),
      field({ label: t("field.temperature"), value: s.adv.temp, name: "adv.temp", invalid: invalid.has("adv.temp"), suffix: "°C", onInput: (v) => store.update((st) => (st.adv.temp = v)) }),
    ),
    h(
      "div",
      { class: "label-row" },
      switchButton(t("adv.refraction"), s.adv.refraction, (on) => store.update((st) => (st.adv.refraction = on))),
      info(t("adv.refractionTitle"), t("adv.refractionInfo")),
    ),
    field({
      label: t("adv.deltaT"),
      value: s.adv.deltaT,
      name: "adv.deltaT",
      invalid: invalid.has("adv.deltaT"),
      suffix: "s",
      placeholder: t("adv.deltaTPlaceholder"),
      info: t("adv.deltaTInfo"),
      onInput: (v) => store.update((st) => (st.adv.deltaT = v)),
    }),
  );
}
