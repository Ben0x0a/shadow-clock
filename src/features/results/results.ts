/**
 * results.ts — feature "results": the right-hand side of the page. Shows the progress
 * of the running computation, what is still missing, or the answer (time or place).
 *
 * Defines: mountResults().
 * Used by: main.ts.
 * Depends on: features/results/time/view.ts, features/results/place/view.ts,
 *             state/case.ts, state/view.ts, state/solve.ts, ui/dom.ts, ui/context.ts,
 *             ui/colours.ts (theme changes).
 *
 * HOW: the solve session publishes a status after each change; this feature renders it.
 * While a newer job runs, the previous answer stays on screen, dimmed ("stale").
 */

import type { FieldError } from "../../core/request.ts";
import { type CaseStore, untouched } from "../../state/case.ts";
import type { SolveSession, SolveStatus } from "../../state/solve.ts";
import type { ViewState } from "../../state/view.ts";
import { onThemeChange } from "../../ui/colours.ts";
import { t, tm } from "../../ui/context.ts";
import { h } from "../../ui/dom.ts";
import { PlaceResultsView } from "./place/view.ts";
import { TimeResultsView } from "./time/view.ts";
import "./results.css";

export interface ResultsDeps {
  cases: CaseStore;
  view: ViewState;
  session: SolveSession;
  /** The claimed-time check (features/claim), shown under the time answer. */
  claimCard: HTMLElement;
  exampleButtons: () => HTMLElement;
  focusField: (key: string) => void;
}

export function mountResults(host: HTMLElement, deps: ResultsDeps): void {
  const { cases, view, session } = deps;
  const announcer = h("div", { id: "announce", class: "sr-only", "aria-live": "polite", "aria-atomic": "true" });
  const progress = h("progress", { max: 1, value: 0, hidden: true });
  const statusText = h("span");
  const body = h("div", { id: "results-body" });
  host.replaceChildren(
    h("h2", { id: "results-h", class: "sr-only" }, t("app.results")),
    announcer,
    h("div", { class: "job-status" }, progress, statusText),
    body,
  );

  const timeView = new TimeResultsView(deps.claimCard);
  const placeView = new PlaceResultsView();
  const syncEvidence = (): void => {
    timeView.evidence.open = view.expert;
    placeView.evidence.open = view.expert;
  };
  syncEvidence();
  view.subscribe(() => {
    syncEvidence();
    if (session.status.kind === "invalid") show(session.status);
  });

  let announceTimer = 0;
  const announce = (text: string): void => {
    clearTimeout(announceTimer);
    // WHY delayed: typing triggers several solves; only the last result is announced.
    announceTimer = window.setTimeout(() => (announcer.textContent = text), 800);
  };
  const setJobStatus = (text: string, fraction: number | null = null): void => {
    statusText.textContent = text;
    progress.hidden = fraction === null;
    if (fraction !== null) progress.value = fraction;
  };

  const emptyState = (errors: FieldError[]): HTMLElement | null => {
    const s = cases.state;
    // Guided start screen: nothing to show on the results side yet.
    if (!view.expert && !view.started) return null;
    return h(
      "section",
      { class: "card result empty" },
      untouched(s)
        ? [
            h("h3", null, t(s.mode === "time" ? "landing.when" : "landing.where")),
            h(
              "ol",
              { class: "steps" },
              (s.mode === "time" ? ["empty.time1", "empty.time2", "empty.time3"] : ["empty.place1", "empty.place2"]).map((k) => h("li", null, t(k))),
            ),
            h("p", { class: "hint" }, t("empty.examples")),
            deps.exampleButtons(),
          ]
        : [
            h("h3", null, t("empty.needed")),
            h(
              "ul",
              { class: "todo" },
              [...new Map(errors.map((e) => [tm(e.msg), e])).entries()]
                .slice(0, 8)
                .map(([text, e]) => h("li", null, h("button", { type: "button", class: "link", onclick: () => deps.focusField(e.key) }, text))),
            ),
          ],
    );
  };

  const rerender = (): void => {
    const solved = session.solved;
    if (!solved) return;
    if (solved.mode === "time") timeView.render(solved.res, solved.req);
    else placeView.render(solved.res, solved.req);
  };
  onThemeChange(rerender);

  function show(st: SolveStatus): void {
    switch (st.kind) {
      case "invalid": {
        setJobStatus("");
        body.classList.remove("stale");
        const empty = emptyState(st.errors);
        body.replaceChildren(...(empty ? [empty] : []));
        return;
      }
      case "running": {
        const current = cases.state.mode === "time" ? timeView.el : placeView.el;
        if (body.firstChild !== current) body.classList.add("stale");
        setJobStatus(st.phase ? tm(st.phase) : t("progress.computing"), st.fraction);
        return;
      }
      case "error":
        body.classList.remove("stale");
        setJobStatus("");
        body.replaceChildren(h("section", { class: "card result empty" }, h("h3", null, t("empty.cannot")), h("p", null, tm(st.error))));
        return;
      case "done": {
        body.classList.remove("stale");
        setJobStatus("");
        const s = st.solved;
        if (s.mode === "time") {
          if (body.firstChild !== timeView.el) body.replaceChildren(timeView.el);
          timeView.render(s.res, s.req);
          const n = s.res.clusters.filter((c) => c.year === s.req.constraints.yearFrom).length;
          announce(n ? t(n > 1 ? "announce.periods" : "announce.period", { n }) : t("announce.noTime"));
        } else {
          if (body.firstChild !== placeView.el) body.replaceChildren(placeView.el);
          placeView.render(s.res, s.req);
          const n = s.res.regions.length;
          announce(n ? t(n > 1 ? "announce.areas" : "announce.area", { n }) : t("announce.noPlace"));
        }
      }
    }
  }
  session.subscribe(show);
}
