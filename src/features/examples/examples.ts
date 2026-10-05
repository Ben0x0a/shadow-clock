/**
 * examples.ts — feature "examples": the Examples menu and example buttons, which load
 * a built-in case whose true answer is known.
 *
 * Defines: mountExamplesMenu(), exampleButtons().
 * Used by: main.ts (menu in the toolbar; buttons handed to the inputs and results).
 * Depends on: core/examples.ts, ui/dom.ts, ui/context.ts.
 */

import { EXAMPLES, type Example } from "../../core/examples.ts";
import { t } from "../../ui/context.ts";
import { h, icon } from "../../ui/dom.ts";
import "./examples.css";

export type LoadExample = (e: Example) => void;

/** A row of buttons, one per example (start screen and empty results). */
export function exampleButtons(load: LoadExample): HTMLElement {
  return h("div", { class: "example-buttons" }, EXAMPLES.map((e) => h("button", { type: "button", class: "btn ghost", title: t(e.description), onclick: () => load(e) }, t(e.label))));
}

export function mountExamplesMenu(slot: HTMLElement, load: LoadExample): void {
  const menu = h("details", { class: "menu", id: "examples-menu" });
  menu.append(
    h("summary", { class: "btn ghost" }, icon("book", 18), h("span", { class: "examples-label" }, t("app.examples"))),
    h(
      "div",
      { class: "menu-list right", role: "menu", id: "examples-list" },
      EXAMPLES.map((e) =>
        h("button", { type: "button", role: "menuitem", onclick: () => { menu.open = false; load(e); } }, h("strong", null, t(e.label)), h("small", null, t(e.description))),
      ),
    ),
  );
  slot.replaceChildren(menu);
}
