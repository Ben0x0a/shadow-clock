/**
 * budget.ts — the error budget: which source of uncertainty dominates each shadow.
 *
 * Defines: renderBudget().
 * Used by: ui/results/timeResults.ts, ui/results/placeResults.ts.
 * Depends on: core/models.ts, ui/dom.ts, ui/results/colours.ts.
 *
 * HOW: Gaussian terms add in quadrature, so each term's share of the variance (σᵢ²/Σσ²)
 * is shown. Range terms add linearly, so their share of the half-width is shown.
 */

import type { BudgetItem, Component, Observation } from "../../core/models";
import { h } from "../dom";

const ADVICE: Record<string, string> = {
  "Shadow tip edge (penumbra)": "State which edge of the shadow tip you measured to remove this term.",
  "Height & shadow length": "Measure the height and shadow length more precisely.",
  "Object tilt": "Pick an object that is certainly vertical (a plumb line, a door frame, a lamp post).",
  "Refraction model": "The Sun is low; this term cannot be reduced much.",
  "Azimuth reading": "Measure the shadow direction more precisely (true north reference, longer shadow).",
};

function rows(items: BudgetItem[], comp: Component) {
  const used = items.filter((i) => i.amount > 0);
  const gauss = comp.kind === "gauss";
  const total = used.reduce((a, i) => a + (gauss ? i.amount ** 2 : i.amount), 0) || 1;
  return used
    .map((i) => ({ label: i.label, amount: i.amount, share: (gauss ? i.amount ** 2 : i.amount) / total }))
    .sort((a, b) => b.share - a.share);
}

function block(title: string, items: BudgetItem[], comp: Component) {
  const r = rows(items, comp);
  const total = comp.kind === "gauss" ? `± ${comp.sigma.toFixed(2)}° (1σ)` : `± ${comp.half.toFixed(2)}° (bounds)`;
  return h(
    "div",
    { class: "budget-block" },
    h("div", { class: "budget-head" }, h("strong", null, title), h("span", { class: "num" }, total)),
    h(
      "table",
      { class: "budget" },
      h("tbody", null, r.map((x) =>
        h(
          "tr",
          null,
          h("th", { scope: "row" }, x.label),
          h("td", { class: "bar-cell" }, h("span", { class: "bar", style: { width: `${Math.max(2, x.share * 100)}%` } })),
          h("td", { class: "num" }, `${x.amount.toFixed(2)}°`),
          h("td", { class: "num muted" }, `${Math.round(x.share * 100)} %`),
        ),
      )),
    ),
    r.length && ADVICE[r[0].label] && r[0].share > 0.4 ? h("p", { class: "hint" }, `Biggest lever: ${ADVICE[r[0].label]}`) : null,
  );
}

export function renderBudget(host: HTMLElement, obs: Observation[], labels: string[]): void {
  host.replaceChildren(
    ...obs.map((o, i) =>
      h(
        "div",
        { class: `budget-shot shot-${i + 1}` },
        h("h4", null, h("span", { class: "dot", "aria-hidden": "true" }), labels[i]),
        block("Elevation", o.elevationBudget, o.elevation),
        o.azimuth ? block("Azimuth", o.azimuthBudget, o.azimuth) : null,
      ),
    ),
  );
}
