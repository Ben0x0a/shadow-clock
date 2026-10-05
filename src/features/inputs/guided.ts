/**
 * guided.ts — the guided interface: a start screen, then one question per step. Finished
 * steps collapse to a one-line summary with an edit button.
 *
 * Defines: renderGuided(), renderLanding(), resetGuided(), openStepFor().
 * Used by: features/inputs/inputs.ts (when the expert view is off).
 * Depends on: ui/dom.ts, core/form.ts, core/request.ts, features/inputs/panels/site.ts,
 *             features/inputs/panels/shots.ts, features/inputs/panels/constraints.ts, core/parse.ts.
 *
 * HOW: each step declares a title, a body renderer, a completeness test and a summary.
 * The open step is the one the user chose, or else the first incomplete required step.
 * Steps never lock: any step can be reopened, and results update live whatever step is
 * open. The expert view renders the same panels all at once.
 */

import { parseLocation } from "../../core/parse.ts";
import { h, icon, info } from "../../ui/dom.ts";
import { constraintsSummary, renderConstraints } from "./panels/constraints.ts";
import { addShotButtons, renderShots, shadowSummary } from "./panels/shots.ts";
import { renderSearchArea, renderSite, siteSummary } from "./panels/site.ts";
import { buildShadowOnly } from "../../core/request.ts";
import type { AppState, Mode } from "../../core/form.ts";
import { at } from "../../core/util.ts";
import type { CaseStore } from "../../state/case.ts";
import { t } from "../../ui/context.ts";

interface Step {
  title: string;
  optional?: boolean;
  complete(s: AppState): boolean;
  summary(s: AppState): string;
  body(root: HTMLElement): void;
}

/** null = every step collapsed; undefined = pick automatically. */
let active: number | null | undefined;
let lastMode: Mode | null = null;
/** Optional steps count as done only once the user has seen them. */
const visited = new Set<number>();

export function resetGuided(): void {
  active = undefined;
  visited.clear();
}

/** Opens the step that holds a given field key (used by the "complete:" error links). */
export function openStepFor(s: AppState, key: string): void {
  const shotIdx = s.shots.findIndex((x) => key.startsWith(`${x.id}.`));
  if (s.mode === "time") {
    if (key.startsWith("site.")) active = 0;
    else if (shotIdx === 0) active = 1;
    else if (shotIdx > 0) active = 2;
    else if (key.startsWith("cons.")) active = 3;
  } else {
    if (shotIdx === 0) active = 0;
    else if (shotIdx > 0) active = 1;
    else if (key.startsWith("search.")) active = 2;
  }
}

function steps(store: CaseStore, invalid: Set<string>): Step[] {
  const s = store.state;
  const shotReady = (i: number) => !!s.shots[i] && buildShadowOnly(s.shots[i]) !== null;
  const extraSummary = (st: AppState) =>
    st.shots.length > 1 ? st.shots.slice(1).map((x, k) => shadowSummary(x, k + 1, st.mode)).join(" · ") : t("guided.nothingElse");
  if (s.mode === "time") {
    return [
      {
        title: t("guided.where"),
        complete: (st) => parseLocation(st.site.loc) !== null,
        summary: siteSummary,
        body: (root) => renderSite(root, store, invalid, true),
      },
      {
        title: t("guided.measure"),
        complete: () => shotReady(0),
        summary: (st) => shadowSummary(at(st.shots, 0), 0, st.mode),
        body: (root) => renderShots(root, store, invalid, { variant: "guided", from: 0, to: 1 }),
      },
      {
        title: t("guided.more"),
        optional: true,
        complete: () => true,
        summary: extraSummary,
        body: (root) => {
          root.append(h("div", { class: "label-row" }, h("span", { class: "section-intro" }, t("guided.moreIntro")), info(t("guided.moreInfoTitle"), t("guided.moreInfo"))));
          const list = h("div", { class: "shots" });
          renderShots(list, store, invalid, { variant: "guided", from: 1 });
          root.append(list, addShotButtons(store));
        },
      },
      {
        title: t("guided.known"),
        optional: true,
        complete: () => true,
        summary: constraintsSummary,
        body: (root) => renderConstraints(root, store, invalid, true),
      },
    ];
  }
  return [
    {
      title: t("guided.measureTimed"),
      complete: (st) => shotReady(0) && !!at(st.shots, 0).time.trim(),
      summary: (st) => shadowSummary(at(st.shots, 0), 0, st.mode),
      body: (root) => renderShots(root, store, invalid, { variant: "guided", from: 0, to: 1 }),
    },
    {
      title: t("guided.otherPhotos"),
      optional: true,
      complete: () => true,
      summary: extraSummary,
      body: (root) => {
        root.append(h("div", { class: "label-row" }, h("span", { class: "section-intro" }, t("guided.otherIntro")), info(t("guided.otherInfoTitle"), t("guided.otherInfo"))));
        const list = h("div", { class: "shots" });
        renderShots(list, store, invalid, { variant: "guided", from: 1 });
        root.append(list, addShotButtons(store));
      },
    },
    {
      title: t("guided.area"),
      optional: true,
      complete: () => true,
      summary: (st) => (st.search.kind === "world" ? t("area.world") : t("guided.areaBox", { box: st.search.bbox })),
      body: (root) => renderSearchArea(root, store, invalid),
    },
  ];
}

export function renderGuided(root: HTMLElement, store: CaseStore, invalid: Set<string>, rerender: () => void): void {
  const s = store.state;
  if (lastMode !== s.mode) {
    active = undefined;
    visited.clear();
    lastMode = s.mode;
  }
  const list = steps(store, invalid);
  if (active === undefined) {
    const firstMissing = list.findIndex((st) => !st.optional && !st.complete(s));
    active = firstMissing === -1 ? null : firstMissing;
  }
  if (typeof active === "number") visited.add(active);
  const open = (i: number | null) => {
    if (typeof active === "number") visited.add(active);
    active = i;
    rerender();
    // Focus the first field of the new step (not its "i" buttons); fall back to any button.
    if (i !== null) {
      requestAnimationFrame(() => {
        // WHY document, not root: rerender() replaces the stepper element, so `root` is stale.
        const body = document.querySelector(".gstep.is-current .gstep-body");
        (body?.querySelector<HTMLElement>("input, select") ?? body?.querySelector<HTMLElement>("button"))?.focus();
      });
    }
  };

  root.replaceChildren(
    ...list.map((st, i) => {
      const current = i === active;
      const done = st.complete(s) && (!st.optional || visited.has(i));
      const state = current ? "current" : done ? "done" : "todo";
      const head = h(
        "button",
        {
          type: "button",
          class: "gstep-head",
          "aria-expanded": current ? "true" : "false",
          onclick: () => open(current ? null : i),
        },
        h("span", { class: `gstep-mark is-${state}`, "aria-hidden": "true" }, state === "done" ? icon("check", 14) : String(i + 1)),
        h(
          "span",
          { class: "gstep-text" },
          h("span", { class: "gstep-title" }, st.title, st.optional ? h("span", { class: "opt" }, t("guided.optional")) : null),
          !current && (done || st.optional) ? h("span", { class: "gstep-summary" }, st.summary(s)) : null,
        ),
        !current ? h("span", { class: "gstep-edit" }, t(done ? "guided.edit" : "guided.open")) : null,
      );
      // WAI-ARIA accordion pattern: the toggle button sits inside a heading, so screen-reader
      // users can jump between steps with heading navigation.
      const heading = h("h2", { class: "gstep-h" }, head);
      if (!current) return h("section", { class: `gstep is-${state}` }, heading);
      const body = h("div", { class: "gstep-body" });
      st.body(body);
      const last = i === list.length - 1;
      return h(
        "section",
        { class: "gstep is-current" },
        heading,
        body,
        h(
          "div",
          { class: "gstep-actions" },
          h("button", {
            type: "button",
            class: "btn primary",
            onclick: () => {
              open(last ? null : i + 1);
              // On narrow screens the answer sits below the steps: bring it into view.
              if (last && window.matchMedia("(max-width: 980px)").matches) {
                document.getElementById("results")?.scrollIntoView({ behavior: "smooth", block: "start" });
              }
            },
          }, t(last ? "guided.showAnswer" : "guided.continue")),
        ),
      );
    }),
  );
}

/** Start screen: what does the user want to find? */
export function renderLanding(root: HTMLElement, choose: (m: Mode) => void, examples: HTMLElement): void {
  root.replaceChildren(
    h(
      "section",
      { class: "landing" },
      h("h2", null, t("landing.title")),
      h(
        "div",
        { class: "landing-choices" },
        h(
          "button",
          { type: "button", class: "choice", onclick: () => choose("time") },
          h("span", { class: "choice-icon", "aria-hidden": "true" }, icon("clock", 28)),
          h("strong", null, t("landing.when")),
          h("span", null, t("landing.whenSub")),
        ),
        h(
          "button",
          { type: "button", class: "choice", onclick: () => choose("place") },
          h("span", { class: "choice-icon", "aria-hidden": "true" }, icon("pin", 28)),
          h("strong", null, t("landing.where")),
          h("span", null, t("landing.whereSub")),
        ),
      ),
      h("p", { class: "hint" }, t("landing.examples")),
      examples,
    ),
  );
}
