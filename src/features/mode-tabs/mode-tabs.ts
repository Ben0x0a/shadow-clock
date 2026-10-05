/**
 * mode-tabs.ts — feature "mode-tabs": the Find the time / Find the place switch,
 * following the WAI-ARIA tabs pattern (automatic activation).
 *
 * Defines: mountModeTabs().
 * Used by: main.ts.
 * Depends on: core/form.ts (Mode), state/case.ts, state/view.ts, ui/dom.ts, ui/context.ts.
 *
 * Keyboard: Tab reaches the selected tab only; Left/Right (wrapping), Home and End move
 * between tabs and select them. The active mode is never put in the URL.
 *
 * Shown in the expert view only: the guided view asks for the mode on its start screen
 * (and "Start a new case" returns there), so the tabs would only add noise.
 */

import type { Mode } from "../../core/form.ts";
import type { CaseStore } from "../../state/case.ts";
import type { ViewState } from "../../state/view.ts";
import { t } from "../../ui/context.ts";
import { h } from "../../ui/dom.ts";
import "./mode-tabs.css";

const MODES: { value: Mode; label: string; title: string }[] = [
  { value: "time", label: "app.findTime", title: "app.findTimeTitle" },
  { value: "place", label: "app.findPlace", title: "app.findPlaceTitle" },
];

/** `panel` is the element the tabs control (gets role="tabpanel"). */
export function mountModeTabs(slot: HTMLElement, panel: HTMLElement, cases: CaseStore, view: ViewState): void {
  const tabs = MODES.map((m) =>
    h("button", { type: "button", role: "tab", id: `tab-${m.value}`, class: "mode-tab", "aria-controls": panel.id, title: t(m.title) }, t(m.label)),
  );
  const list = h("div", { role: "tablist", class: "mode-tabs", "aria-label": t("app.mode") }, tabs);
  const sync = (): void => {
    slot.hidden = !view.expert;
    // The panel is a tab panel only while its tabs are shown.
    if (!view.expert) {
      panel.removeAttribute("role");
      panel.removeAttribute("aria-labelledby");
      return;
    }
    panel.setAttribute("role", "tabpanel");
    MODES.forEach((m, i) => {
      const tab = tabs[i];
      if (!tab) return;
      const on = cases.state.mode === m.value;
      tab.setAttribute("aria-selected", String(on));
      tab.tabIndex = on ? 0 : -1;
      if (on) panel.setAttribute("aria-labelledby", tab.id);
    });
  };
  const select = (i: number, focus: boolean): void => {
    const m = MODES[(i + MODES.length) % MODES.length];
    if (!m) return;
    if (cases.state.mode !== m.value) cases.update((s) => (s.mode = m.value), true);
    if (focus) document.getElementById(`tab-${m.value}`)?.focus();
  };

  tabs.forEach((tab, i) => tab.addEventListener("click", () => select(i, false)));
  list.addEventListener("keydown", (e) => {
    const i = MODES.findIndex((m) => m.value === cases.state.mode);
    const next = e.key === "ArrowRight" ? i + 1 : e.key === "ArrowLeft" ? i - 1 : e.key === "Home" ? 0 : e.key === "End" ? MODES.length - 1 : null;
    if (next === null) return;
    e.preventDefault();
    select(next, true);
  });
  cases.subscribe((_s, structural) => structural && sync());
  view.subscribe(sync);
  sync();
  slot.replaceChildren(list);
}
