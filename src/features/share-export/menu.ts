/**
 * menu.ts — feature "share-export": the Share and export menu (link to the tool, share
 * the calculation, JSON report, print, new case).
 *
 * Defines: mountShareMenu().
 * Used by: main.ts.
 * Depends on: features/share-export/report.ts, core/form.ts, state/case.ts,
 *             state/solve.ts, ui/dom.ts, ui/context.ts (platform.share), ui/toast.ts.
 *
 * Privacy: the calculation is shared only through platform.share.offer(), which warns,
 * lists exactly what the link contains, and copies it — never into the address bar.
 */

import type { AppState } from "../../core/form.ts";
import type { CaseStore } from "../../state/case.ts";
import type { SolveSession } from "../../state/solve.ts";
import { platform, t } from "../../ui/context.ts";
import { h, icon } from "../../ui/dom.ts";
import { toast } from "../../ui/toast.ts";
import { exportReport, printReport } from "./report.ts";
import "./share-export.css";

export interface ShareDeps {
  cases: CaseStore;
  session: SolveSession;
  /** Starts a new, empty case (main.ts: also returns to the start screen). */
  newCase: () => void;
}

/** What a calculation link reveals, one line per item, for the share warning. */
function shareItems(s: AppState): { label: string; value: string }[] {
  const v = (x: string) => x.trim() || t("share.item.none");
  const items = [{ label: t("share.item.mode"), value: t(s.mode === "time" ? "app.findTime" : "app.findPlace") }];
  if (s.mode === "time") items.push({ label: t("share.item.place"), value: `${v(s.site.loc)} ± ${s.site.radius} ${s.site.radiusUnit}` });
  for (const sh of s.shots) {
    const values = Object.values(sh.f).filter((x) => x.trim()).join(", ");
    const when = s.mode === "place" ? sh.time : sh.offset;
    items.push({ label: t("share.item.shadow", { label: sh.label }), value: [values, sh.az, when].filter((x) => x.trim()).join(" · ") || t("share.item.none") });
  }
  if (s.mode === "time") {
    const c = s.cons;
    items.push({ label: t("share.item.constraints"), value: [`${c.yearFrom}–${c.yearTo}`, c.todFrom && `${c.todFrom}–${c.todTo}`, c.zoneValue].filter(Boolean).join(" · ") });
    if (s.claim.time.trim()) items.push({ label: t("share.item.claim"), value: `${s.claim.time} ${s.claim.offset}`.trim() });
  } else if (s.search.kind === "bbox") {
    items.push({ label: t("share.item.area"), value: v(s.search.bbox) });
  }
  return items;
}

export function mountShareMenu(slot: HTMLElement, deps: ShareDeps): void {
  const { cases, session } = deps;
  const menu = h("details", { class: "menu", id: "share-menu" });
  const close = () => (menu.open = false);
  const summary = h("summary", { class: "btn ghost icon-only", id: "share-summary", "aria-label": t("share.menu"), title: t("share.menu") }, icon("share"));
  const item = (id: string, title: string, sub: string | null, onclick: () => void, warn = false) =>
    h("button", { type: "button", role: "menuitem", id, onclick }, h("strong", null, title), sub ? h("small", { class: warn ? "warn-text" : "" }, sub) : null);

  const copyToolLink = async (): Promise<void> => {
    close();
    const site = platform().site;
    // The tool itself, with no case data (the single file points to the hosted site).
    const url = site.mode === "single" && site.siteUrl ? site.siteUrl : `${location.origin}${location.pathname}`;
    try {
      await navigator.clipboard.writeText(url);
      toast(t("share.toolDone"));
    } catch {
      window.prompt(t("share.copyPrompt"), url);
    }
  };

  menu.append(
    summary,
    h(
      "div",
      { class: "menu-list right", role: "menu", id: "share-list" },
      item("share-tool", t("share.tool"), t("share.toolSub"), () => void copyToolLink()),
      item("share-calc", t("share.calc"), t("share.calcSub"), () => {
        close();
        void platform().share.offer(cases.state, shareItems(cases.state)).then((copied) => copied && toast(t("share.calcDone")));
      }, true),
      h("hr"),
      item("export-json", t("export.json"), t("export.jsonSub"), () => {
        close();
        void exportReport(cases.state, session.solved);
      }),
      item("export-print", t("export.print"), null, () => {
        close();
        void printReport(cases.state);
      }),
      h("hr"),
      item("new-case", t("export.newCase"), null, () => {
        close();
        if (confirm(t("export.newCaseConfirm"))) deps.newCase();
      }),
    ),
  );
  slot.replaceChildren(menu);
}
