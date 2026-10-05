/**
 * budget.ts — the error budget: which source of uncertainty dominates each shadow.
 *
 * Defines: renderBudget().
 * Used by: features/results/time/view.ts, features/results/place/view.ts.
 * Depends on: core/models.ts, ui/dom.ts, ui/colours.ts.
 *
 * HOW: Gaussian terms add in quadrature, so each term's share of the variance (σᵢ²/Σσ²)
 * is shown. Range terms add linearly, so their share of the half-width is shown.
 */

import type { BudgetItem, Component, Observation } from "../core/models.ts";
import { h } from "./dom.ts";
import { t } from "./context.ts";

/** Budget term key → string key of the advice shown when that term dominates. */
const ADVICE: Record<string, string> = {
  "budget.tipEdge": "budget.advice.tipEdge",
  "budget.lengths": "budget.advice.lengths",
  "budget.tilt": "budget.advice.tilt",
  "budget.refraction": "budget.advice.refraction",
  "budget.azimuth": "budget.advice.azimuth",
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
  const total = comp.kind === "gauss"
    ? t("budget.totalSigma", { v: comp.sigma.toFixed(2) })
    : t("budget.totalBounds", { v: comp.half.toFixed(2) });
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
          h("th", { scope: "row" }, t(x.label)),
          h("td", { class: "bar-cell" }, h("span", { class: "bar", style: { width: `${Math.max(2, x.share * 100)}%` } })),
          h("td", { class: "num" }, `${x.amount.toFixed(2)}°`),
          h("td", { class: "num muted" }, `${Math.round(x.share * 100)} %`),
        ),
      )),
    ),
    r[0] && ADVICE[r[0].label] && r[0].share > 0.4 ? h("p", { class: "hint" }, t("budget.lever", { advice: t(ADVICE[r[0].label] ?? "") })) : null,
  );
}

export function renderBudget(host: HTMLElement, obs: Observation[], labels: string[]): void {
  host.replaceChildren(
    ...obs.map((o, i) =>
      h(
        "div",
        { class: `budget-shot shot-${i + 1}` },
        h("h4", null, h("span", { class: "dot", "aria-hidden": "true" }), labels[i]),
        block(t("field.elevation"), o.elevationBudget, o.elevation),
        o.azimuth ? block(t("field.direction"), o.azimuthBudget, o.azimuth) : null,
      ),
    ),
  );
}
