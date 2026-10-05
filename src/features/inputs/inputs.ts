/**
 * inputs.ts — feature "inputs": the left-hand side of the page, in the guided view
 * (start screen, then one step at a time) or the expert view (every panel at once).
 *
 * Defines: mountInputs() → { render, focusField, markInvalid }.
 * Used by: main.ts.
 * Depends on: features/inputs/guided.ts and panels/*, state/case.ts, state/view.ts,
 *             ui/dom.ts, ui/context.ts.
 *
 * HOW: a structural change of the case (mode, shots added or removed, example loaded)
 * or of the view rebuilds the panels; plain typing only re-marks invalid fields, so the
 * focused input is never replaced while the user types.
 */

import type { FieldError } from "../../core/request.ts";
import type { CaseStore } from "../../state/case.ts";
import type { ViewState } from "../../state/view.ts";
import { t } from "../../ui/context.ts";
import { h, switchButton } from "../../ui/dom.ts";
import { openStepFor, renderGuided, renderLanding, resetGuided } from "./guided.ts";
import { renderAdvanced } from "./panels/advanced.ts";
import { renderConstraints } from "./panels/constraints.ts";
import { renderShots } from "./panels/shots.ts";
import { renderSearchArea, renderSite } from "./panels/site.ts";
import "./inputs.css";

export interface InputsDeps {
  cases: CaseStore;
  view: ViewState;
  /** Field keys currently invalid (from the solve session). */
  invalid: () => Set<string>;
  /** Example buttons (features/examples), shown on the start screen. */
  exampleButtons: () => HTMLElement;
}

export interface Inputs {
  render(): void;
  focusField(key: string): void;
  markInvalid(errors: FieldError[]): void;
}

function panel(n: number | null, title: string, body: HTMLElement, id: string): HTMLElement {
  return h(
    "section",
    { class: "panel", "aria-labelledby": `${id}-h` },
    h("h2", { id: `${id}-h` }, n !== null ? h("span", { class: "step", "aria-hidden": "true" }, String(n)) : null, title),
    body,
  );
}

export function mountInputs(host: HTMLElement, deps: InputsDeps): Inputs {
  const { cases, view } = deps;

  const settingsPanel = (): HTMLElement => {
    const adv = h("div");
    renderAdvanced(adv, cases, deps.invalid());
    return h("details", { class: "panel advanced" }, h("summary", null, h("h2", null, t("app.settings"))), adv);
  };

  const render = (): void => {
    const s = cases.state;
    const invalid = deps.invalid();
    if (!view.expert) {
      if (!view.started) {
        renderLanding(host, (m) => {
          resetGuided();
          view.setStarted(true);
          cases.update((st) => (st.mode = m), true);
          // WHY: the button that had focus is gone; move focus to the first question so
          // keyboard and screen-reader users continue where the content now is.
          host.querySelector<HTMLElement>(".gstep.is-current .gstep-body input")?.focus();
        }, deps.exampleButtons());
        return;
      }
      const steps = h("div", { class: "stepper" });
      renderGuided(steps, cases, invalid, render);
      host.replaceChildren(steps, settingsPanel());
      return;
    }
    const blocks: HTMLElement[] = [];
    const shots = h("div", { class: "shots" });
    renderShots(shots, cases, invalid, { variant: "expert", intro: true, add: true });
    if (s.mode === "time") {
      const site = h("div");
      renderSite(site, cases, invalid);
      const cons = h("div");
      renderConstraints(cons, cases, invalid);
      blocks.push(
        panel(1, t("panel.where"), site, "p-site"),
        panel(2, t("panel.shadows"), shots, "p-shots"),
        panel(3, t("panel.known"), cons, "p-cons"),
      );
    } else {
      const area = h("div");
      renderSearchArea(area, cases, invalid);
      blocks.push(panel(1, t("panel.shadowsTimes"), shots, "p-shots"), panel(2, t("panel.area"), area, "p-area"));
    }
    blocks.push(settingsPanel());
    host.replaceChildren(...blocks);
  };

  const focusField = (key: string): void => {
    if (!view.expert) {
      // The field may sit in a collapsed step: open that step first.
      openStepFor(cases.state, key);
      render();
    }
    const field = host.querySelector<HTMLElement>(`[data-field="${CSS.escape(key)}"]`);
    if (!field) return;
    field.closest("details")?.setAttribute("open", "");
    field.focus();
    field.scrollIntoView({ block: "center", behavior: "smooth" });
  };

  const markInvalid = (errors: FieldError[]): void => {
    const invalid = new Set(errors.map((e) => e.key));
    host.querySelectorAll<HTMLInputElement>("[data-field]").forEach((input) => {
      // WHY only non-empty fields: an empty form is not an error, just unfinished.
      const bad = invalid.has(input.dataset.field as string) && input.value.trim() !== "";
      if (bad) input.setAttribute("aria-invalid", "true");
      else input.removeAttribute("aria-invalid");
    });
  };

  cases.subscribe((_s, structural) => structural && render());
  view.subscribe(render);
  return { render, focusField, markInvalid };
}

/** "Expert" switch in the toolbar: every option at once instead of the guided steps. */
export function mountExpertToggle(slot: HTMLElement, view: ViewState): void {
  slot.replaceChildren(switchButton(t("app.expert"), view.expert, (on) => view.setExpert(on), { id: "expert-toggle", title: t("app.expertTitle"), compact: true }));
}
