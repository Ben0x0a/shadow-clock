/**
 * guided.ts — the guided interface: a start screen, then one question per step. Finished
 * steps collapse to a one-line summary with an edit button.
 *
 * Defines: renderGuided(), renderLanding(), resetGuided(), openStepFor().
 * Used by: main.ts (when the expert view is off).
 * Depends on: ui/dom.ts, ui/state.ts, ui/request.ts, ui/panels/site.ts,
 *             ui/panels/shots.ts, ui/panels/constraints.ts, core/parse.ts.
 *
 * HOW: each step declares a title, a body renderer, a completeness test and a summary.
 * The open step is the one the user chose, or else the first incomplete required step.
 * Steps never lock: any step can be reopened, and results update live whatever step is
 * open. The expert view renders the same panels all at once.
 */

import { parseLocation } from "../core/parse";
import { h, icon, info } from "./dom";
import { constraintsSummary, renderConstraints } from "./panels/constraints";
import { addShotButtons, renderShots, shadowSummary } from "./panels/shots";
import { renderSearchArea, renderSite, siteSummary } from "./panels/site";
import { buildShadowOnly } from "./request";
import type { AppState, Mode, Store } from "./state";

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

function steps(store: Store, invalid: Set<string>): Step[] {
  const s = store.state;
  const shotReady = (i: number) => !!s.shots[i] && buildShadowOnly(s.shots[i]) !== null;
  const extraSummary = (st: AppState) =>
    st.shots.length > 1 ? st.shots.slice(1).map((x, k) => shadowSummary(x, k + 1, st.mode)).join(" · ") : "Nothing else";
  if (s.mode === "time") {
    return [
      {
        title: "Where was the photo taken?",
        complete: (st) => parseLocation(st.site.loc) !== null,
        summary: siteSummary,
        body: (root) => renderSite(root, store, invalid, true),
      },
      {
        title: "Measure a vertical object and its shadow",
        complete: () => shotReady(0),
        summary: (st) => shadowSummary(st.shots[0], 0, st.mode),
        body: (root) => renderShots(root, store, invalid, { variant: "guided", from: 0, to: 1 }),
      },
      {
        title: "Anything else in the picture?",
        optional: true,
        complete: () => true,
        summary: extraSummary,
        body: (root) => {
          root.append(h("div", { class: "label-row" }, h("span", { class: "section-intro" }, "Each extra shadow narrows the answer."), info("Extra shadows", "Another object in the same photo shares its instant. Another photo of the same place needs the time gap after the first photo — the difference between the two EXIF timestamps is usually exact, even when the camera clock is wrong.")));
          const list = h("div", { class: "shots" });
          renderShots(list, store, invalid, { variant: "guided", from: 1 });
          root.append(list, addShotButtons(store));
        },
      },
      {
        title: "What do you already know?",
        optional: true,
        complete: () => true,
        summary: constraintsSummary,
        body: (root) => renderConstraints(root, store, invalid, true),
      },
    ];
  }
  return [
    {
      title: "Measure a shadow and say when it was taken",
      complete: (st) => shotReady(0) && !!st.shots[0].time.trim(),
      summary: (st) => shadowSummary(st.shots[0], 0, st.mode),
      body: (root) => renderShots(root, store, invalid, { variant: "guided", from: 0, to: 1 }),
    },
    {
      title: "Other photos of the same place",
      optional: true,
      complete: () => true,
      summary: extraSummary,
      body: (root) => {
        root.append(h("div", { class: "label-row" }, h("span", { class: "section-intro" }, "Photos at other times cross at the answer."), info("Why more photos", "One shadow places you on a ring of possible places. Each photo taken at another time adds a ring; the rings cross where the photos were taken.")));
        const list = h("div", { class: "shots" });
        renderShots(list, store, invalid, { variant: "guided", from: 1 });
        root.append(list, addShotButtons(store));
      },
    },
    {
      title: "Where could it be?",
      optional: true,
      complete: () => true,
      summary: (st) => (st.search.kind === "world" ? "Whole Earth" : `Box ${st.search.bbox}`),
      body: (root) => renderSearchArea(root, store, invalid),
    },
  ];
}

export function renderGuided(root: HTMLElement, store: Store, invalid: Set<string>, rerender: () => void): void {
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
    if (i !== null) requestAnimationFrame(() => root.querySelector<HTMLElement>(".gstep.is-current .gstep-body input, .gstep.is-current .gstep-body button")?.focus());
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
          h("span", { class: "gstep-title" }, st.title, st.optional ? h("span", { class: "opt" }, "optional") : null),
          !current && (done || st.optional) ? h("span", { class: "gstep-summary" }, st.summary(s)) : null,
        ),
        !current ? h("span", { class: "gstep-edit" }, done ? "Edit" : "Open") : null,
      );
      if (!current) return h("section", { class: `gstep is-${state}` }, head);
      const body = h("div", { class: "gstep-body" });
      st.body(body);
      const last = i === list.length - 1;
      return h(
        "section",
        { class: "gstep is-current" },
        head,
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
          }, last ? "Show the answer" : "Continue"),
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
      h("h2", null, "What do you want to find out?"),
      h(
        "div",
        { class: "landing-choices" },
        h(
          "button",
          { type: "button", class: "choice", onclick: () => choose("time") },
          h("span", { class: "choice-icon", "aria-hidden": "true" }, icon("clock", 28)),
          h("strong", null, "When was this photo taken?"),
          h("span", null, "You know the place. The shadows give the date and time."),
        ),
        h(
          "button",
          { type: "button", class: "choice", onclick: () => choose("place") },
          h("span", { class: "choice-icon", "aria-hidden": "true" }, icon("pin", 28)),
          h("strong", null, "Where was this photo taken?"),
          h("span", null, "You know when. The shadows give the place."),
        ),
      ),
      h("p", { class: "hint" }, "New here? Load an example whose true answer is known:"),
      examples,
    ),
  );
}
