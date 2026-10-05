/**
 * help.ts — feature "help": the "How it works" button and dialog.
 *
 * Defines: mountHelp().
 * Used by: main.ts.
 * Depends on: ui/dom.ts, ui/context.ts.
 *
 * WHY a native <dialog>: focus trap, Escape and focus return come from the browser.
 */

import { t } from "../../ui/context.ts";
import { h, icon } from "../../ui/dom.ts";
import "./help.css";

export function mountHelp(slot: HTMLElement): void {
  const li = (k: string) => h("li", null, t(k));
  const labelled = (label: string, text: string) => h("li", null, h("strong", null, t(label)), " ", t(text));
  const dialog = h(
    "dialog",
    { id: "help", "aria-labelledby": "help-title" },
    h("h2", { id: "help-title" }, t("help.title")),
    h("p", null, t("help.intro")),
    h("h3", null, t("app.findTime")),
    h("ol", null, li("help.time1"), li("help.time2"), li("help.time3")),
    h("h3", null, t("app.findPlace")),
    h("p", null, t("help.place")),
    h("h3", null, t("help.readTitle")),
    h("ul", null, labelled("help.twiceLabel", "help.twice"), labelled("help.noYearLabel", "help.noYear"), labelled("help.boundsLabel", "help.bounds")),
    h("h3", null, t("help.assumeTitle")),
    h("ul", null, li("help.assume1"), li("help.assume2"), li("help.assume3")),
    h("div", { class: "dialog-buttons" }, h("button", { type: "button", class: "primary", onclick: () => dialog.close() }, t("close"))),
  );
  document.body.append(dialog);
  const button = h("button", { type: "button", class: "btn ghost icon-only", id: "help-btn", "aria-label": t("app.help"), title: t("app.help"), onclick: () => dialog.showModal() }, icon("help"));
  slot.replaceChildren(button);
}
