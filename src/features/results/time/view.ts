/**
 * timeResults.ts — time-mode results: summary, heatmap, solutions list, sky chart and
 * error budget, with a shared selection.
 *
 * Defines: TimeResultsView (answer card, claim slot, then the evidence: heatmap, list,
 *          sky chart and error budget).
 * Used by: features/results/results.ts.
 * Depends on: core/models.ts, ui/dom.ts, ui/format.ts, features/results/time/heatmap.ts,
 *             features/results/time/sunpath.ts, ui/budget.ts, ui/colours.ts.
 */

import type { Cluster, DailyWindow, TimeSolveRequest, TimeSolveResult, Zone } from "../../../core/models.ts";
import { h, icon, info, replace } from "../../../ui/dom.ts";
import { t, tm } from "../../../ui/context.ts";
import { zoneLabel, fmtDate, fmtDateTime, fmtSolar, fmtSpan, fmtTime } from "../../../ui/format.ts";
import { renderBudget } from "../../../ui/budget.ts";
import { misfitLevels } from "../../../ui/colours.ts";
import { HeatmapView } from "./heatmap.ts";
import { renderSunPath } from "./sunpath.ts";
import { at } from "../../../core/util.ts";

const ROW_LIMIT = 30;

function todRange(c: Cluster, zone: Zone, lon: number): string {
  const mins = c.windows.flatMap((w) => [w.startMs, w.endMs]);
  const tod = (ms: number) => {
    const hhmm = fmtTime(ms, zone, lon);
    return Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3));
  };
  const vals = mins.map(tod);
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const f = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  return lo === hi ? f(lo) : `${f(lo)}–${f(hi)}`;
}

/** Side of solar noon, shown when shadows carry no azimuth (morning/afternoon ambiguity). */
function daySide(c: Cluster): string {
  const solar = at(c.bestFit.shots, 0).solarTimeH;
  return t(solar < 11.5 ? "res.morning" : solar > 12.5 ? "res.afternoon" : "res.noon");
}

function dateRange(c: Cluster, zone: Zone, lon: number, year = true): string {
  const a = fmtDate(c.firstMs, zone, lon, false);
  const b = fmtDate(c.lastMs, zone, lon, false);
  const y = year ? ` ${new Date(c.bestMs).getUTCFullYear()}` : "";
  return a === b ? `${a}${y}` : `${a} – ${b}${y}`;
}

function span(w: DailyWindow, level: number, zone: Zone, lon: number): string {
  const s = w.levels.find((l) => l.level === level);
  if (!s) return "—";
  return `${fmtTime(s.startMs, zone, lon, true)}–${fmtTime(s.endMs, zone, lon, true)}`;
}

export class TimeResultsView {
  readonly el: HTMLElement;
  private summary = h("section", { class: "card result summary", "aria-labelledby": "sum-h" });
  private heat = new HeatmapView();
  private heatCard: HTMLElement;
  private list = h("section", { class: "card result", "aria-labelledby": "list-h" });
  private sky = h("div", { class: "sky" });
  private skyCard: HTMLElement;
  private budget = h("div");
  private res: TimeSolveResult | null = null;
  private req: TimeSolveRequest | null = null;
  private selected: number | null = null;
  private selectedCluster: number | null = null;

  /** Groups the detailed views; closed by default in the guided view. */
  readonly evidence: HTMLDetailsElement;

  /** `claimSlot` hosts the claimed-time check, placed right under the answer. */
  constructor(claimSlot: HTMLElement) {
    this.heatCard = h(
      "section",
      { class: "card result", "aria-labelledby": "heat-h" },
      h(
        "div",
        { class: "card-head" },
        h("div", { class: "label-row" }, h("h3", { id: "heat-h" }, t("res.yearMap")), info(t("res.yearMapTitle"), t("res.yearMapInfo"), t("res.yearMapUse"))),
        this.heat.resetButton,
      ),
      h("p", { class: "hint heat-caption" }),
      this.heat.el,
      h(
        "ul",
        { class: "legend" },
        h("li", null, h("span", { class: "swatch heat-1" }), t("res.legendPossible")),
        h("li", null, h("span", { class: "swatch heat-tail" }), t("res.legendClose")),
        h("li", null, h("span", { class: "swatch heat-ex" }), t("res.legendExcluded")),
      ),
    );
    this.skyCard = h(
      "section",
      { class: "card result", "aria-labelledby": "sky-h" },
      h("div", { class: "card-head" }, h("div", { class: "label-row" }, h("h3", { id: "sky-h" }, t("res.sky")), info(t("res.sky"), t("res.skyInfo")))),
      this.sky,
    );
    this.heat.onSelect = (ms) => this.selectTime(ms, true);
    this.evidence = h(
      "details",
      { class: "evidence" },
      h("summary", { class: "evidence-toggle" }, h("span", null, h("strong", null, t("res.evidence")), h("small", null, t("res.evidenceTimeSub")))),
      h(
        "div",
        { class: "results-stack" },
        this.heatCard,
        this.list,
        this.skyCard,
        h("details", { class: "card result" }, h("summary", null, h("h3", null, t("res.budget"))), this.budget),
      ),
    );
    this.el = h("div", { class: "results-stack" }, this.summary, claimSlot, this.evidence);
  }

  render(res: TimeSolveResult, req: TimeSolveRequest): void {
    this.res = res;
    this.req = req;
    const zone = req.constraints.zone;
    const lon = req.site.lon;
    const levels = misfitLevels(res.clusters[0]?.bestFit.dof ?? (res.observations.reduce((a, o) => a + (o.elevation.kind === "gauss" ? 1 : 0) + (o.azimuth?.kind === "gauss" ? 1 : 0), 0)));

    // Keep the selection if it still falls in a solution; otherwise pick the first one.
    const firstYear = res.clusters.filter((c) => c.year === req.constraints.yearFrom);
    const best = (firstYear.length ? firstYear : res.clusters)[0];
    const keep = this.selected !== null && res.clusters.some((c) => c.windows.some((w) => this.selected! >= w.startMs - 3600e3 && this.selected! <= w.endMs + 3600e3));
    if (!keep) {
      this.selected = best?.bestMs ?? null;
      this.selectedCluster = best?.id ?? null;
    }

    this.renderSummary(res, req);
    if (res.heatmap) {
      (this.heatCard.querySelector(".heat-caption") as HTMLElement).textContent =
        `${res.heatmap.year} · ${zoneLabel(zone)}`;
      this.heat.render(res.heatmap, res.clusters, levels, zone, lon);
      this.heat.select(this.selected);
    }
    this.renderList(res, req);
    this.renderSky();
    renderBudget(this.budget, res.observations, req.shots.map((s) => s.label));
  }

  private selectTime(ms: number, fromHeatmap = false): void {
    this.selected = ms;
    if (fromHeatmap && this.res) {
      // Highlight the solution nearest to the clicked instant.
      let bestD = Infinity;
      for (const c of this.res.clusters) {
        for (const w of c.windows) {
          const d = ms < w.startMs ? w.startMs - ms : ms > w.endMs ? ms - w.endMs : 0;
          if (d < bestD) {
            bestD = d;
            this.selectedCluster = d < 86_400_000 ? c.id : null;
          }
        }
      }
    }
    this.heat.select(ms);
    this.markSelectedCluster();
    this.renderSky();
  }

  private markSelectedCluster(): void {
    this.list.querySelectorAll<HTMLElement>("[data-cluster]").forEach((el) => {
      el.classList.toggle("selected", Number(el.dataset.cluster) === this.selectedCluster);
    });
  }

  private renderSummary(res: TimeSolveResult, req: TimeSolveRequest): void {
    const zone = req.constraints.zone;
    const lon = req.site.lon;
    const y0 = req.constraints.yearFrom;
    // Chronological: with declared bounds every listed period is equally possible.
    const yearCl = res.clusters.filter((c) => c.year === y0);
    const years = req.constraints.yearTo - req.constraints.yearFrom + 1;
    const noAz = res.observations.every((o) => !o.azimuth);
    let headline: HTMLElement;
    if (!res.clusters.length) {
      headline = h("p", { class: "headline bad" }, t("res.noTime"));
    } else {
      const n = yearCl.length || res.clusters.length;
      headline = h(
        "div",
        null,
        h("div", { class: "label-row" }, h("p", { class: "eyebrow" }, t("res.answer")), info(t("res.readTitle"), t("res.readInfo"), t("res.readInfo2"))),
        h("p", { class: "headline" }, t(n === 1 ? (years > 1 ? "res.onePeriodYearly" : "res.onePeriod") : (years > 1 ? "res.periodsYearly" : "res.periods"), { n })),
        h(
          "ol",
          { class: "answers" },
          (yearCl.length ? yearCl : res.clusters).slice(0, 4).map((c) =>
            h(
              "li",
              null,
              h("button", { type: "button", class: "answer", title: t("res.showInEvidence"), onclick: () => { this.evidence.open = true; this.selectedCluster = c.id; this.selectTime(c.bestMs); this.heat.zoomTo(c); this.heatCard.scrollIntoView({ behavior: "smooth", block: "start" }); } },
                h("span", { class: "num-badge" }, String(c.id + 1)),
                h("span", { class: "answer-main" }, `${dateRange(c, zone, lon, years === 1)}, ${todRange(c, zone, lon)}`),
                noAz ? h("span", { class: "tag neutral" }, daySide(c)) : null,
                c.truncated ? h("span", { class: "tag", title: t("res.cutTitle") }, t("res.cut")) : null,
              ),
            ),
          ),
        ),
      );
    }
    const warn = res.warnings.map((w) => h("li", null, icon("warn", 16), h("span", null, tm(w))));
    replace(this.summary, 
      h("h3", { id: "sum-h", class: "sr-only" }, t("res.summary")),
      headline,
      h("p", { class: "meta" }, t(req.shots.length > 1 ? "res.metaShadows" : "res.metaShadow", { zone: zoneLabel(zone), n: req.shots.length })),
      warn.length ? h("details", { class: "notes", open: !res.clusters.length }, h("summary", null, t("res.notes", { n: warn.length })), h("ul", null, warn)) : null,
    );
  }

  private renderList(res: TimeSolveResult, req: TimeSolveRequest): void {
    const zone = req.constraints.zone;
    const lon = req.site.lon;
    const byYear = new Map<number, Cluster[]>();
    for (const c of res.clusters) byYear.set(c.year, [...(byYear.get(c.year) ?? []), c]);
    const hasLevels = res.clusters.some((c) => c.windows.some((w) => w.levels.length));
    const noAz = res.observations.every((o) => !o.azimuth);

    const clusterEl = (c: Cluster, openFirst: boolean) => {
      const rows = c.windows;
      const tbody = h("tbody");
      const fill = (limit: number) =>
        replace(tbody, 
          ...rows.slice(0, limit).map((w) =>
            h(
              "tr",
              { class: "clickable", tabindex: 0, onclick: () => this.selectTime(w.bestMs), onkeydown: (e: KeyboardEvent) => e.key === "Enter" && this.selectTime(w.bestMs) },
              h("td", null, fmtDate(w.bestMs, zone, lon)),
              h("td", { class: "num" }, fmtTime(w.bestMs, zone, lon, true)),
              hasLevels ? h("td", { class: "num" }, span(w, 0.6827, zone, lon)) : null,
              hasLevels ? h("td", { class: "num" }, span(w, 0.9545, zone, lon)) : null,
              h("td", { class: "num" }, `${fmtTime(w.startMs, zone, lon, true)}–${fmtTime(w.endMs, zone, lon, true)}${w.truncated ? " ✂" : ""}`),
              h("td", { class: "num muted" }, fmtSolar(at(w.bestFit.shots, 0).solarTimeH)),
            ),
          ),
        );
      fill(ROW_LIMIT);
      const more = rows.length > ROW_LIMIT
        ? h("button", { type: "button", class: "link", onclick: (e: Event) => { fill(rows.length); (e.target as HTMLElement).remove(); } }, t("res.showAllDays", { n: rows.length }))
        : null;
      return h(
        "details",
        { class: "cluster", open: openFirst, dataset: { cluster: String(c.id) } },
        h(
          "summary",
          null,
          h("span", { class: "num-badge" }, String(c.id + 1)),
          h("span", { class: "cl-dates" }, dateRange(c, zone, lon)),
          h("span", { class: "cl-tod" }, todRange(c, zone, lon)),
          noAz ? h("span", { class: "tag neutral" }, daySide(c)) : null,
          c.truncated ? h("span", { class: "tag", title: t("res.cutTitle") }, t("res.cut")) : null,
        ),
        h(
          "div",
          { class: "cluster-body" },
          h("p", { class: "hint" }, t(c.windows.length > 1 ? "res.bestFitDays" : "res.bestFitDay", {
            time: fmtDateTime(c.bestMs, zone, lon),
            n: c.windows.length,
            span: fmtSpan(Math.max(...c.windows.map((w) => w.endMs - w.startMs))),
          })),
          h(
            "div",
            { class: "table-scroll" },
            h(
              "table",
              { class: "windows" },
              h(
                "thead",
                null,
                h(
                  "tr",
                  null,
                  h("th", { scope: "col" }, t("res.colDate")),
                  h("th", { scope: "col" }, t("res.colBest")),
                  hasLevels ? h("th", { scope: "col" }, "68 %") : null,
                  hasLevels ? h("th", { scope: "col" }, "95 %") : null,
                  h("th", { scope: "col" }, hasLevels ? "99.7 %" : t("res.colPossible")),
                  h("th", { scope: "col", title: t("res.colSolarTitle") }, t("res.colSolar")),
                ),
              ),
              tbody,
            ),
          ),
          more,
          h(
            "div",
            { class: "card-actions" },
            h("button", { type: "button", class: "btn ghost small", onclick: () => { this.selectedCluster = c.id; this.selectTime(c.bestMs); this.heat.zoomTo(c); } }, t("res.showOnCharts")),
            h("button", { type: "button", class: "btn ghost small", onclick: (e: Event) => copy(e.currentTarget as HTMLElement, clusterText(c, zone, lon, hasLevels)) }, icon("copy", 14), t("res.copy")),
          ),
        ),
      );
    };

    const years = [...byYear.keys()].sort((a, b) => a - b);
    replace(this.list, 
      h("div", { class: "card-head" }, h("h3", { id: "list-h" }, t("res.solutions"))),
      res.clusters.length ? null : h("p", { class: "hint" }, t("res.nothing")),
      ...years.map((y, yi) => {
        const cl = byYear.get(y) as Cluster[];
        const inner = cl.map((c) => clusterEl(c, yi === 0 && c.id === this.selectedCluster));
        return years.length > 1
          ? h("details", { class: "year", open: yi === 0 }, h("summary", null, h("strong", null, String(y)), ` · ${t(cl.length > 1 ? "res.nSolutions" : "res.nSolution", { n: cl.length })}`), ...inner)
          : h("div", null, ...inner);
      }),
    );
    this.markSelectedCluster();
  }

  private renderSky(): void {
    if (!this.res || !this.req || this.selected === null) {
      replace(this.sky, h("p", { class: "hint" }, t("res.skyEmpty")));
      return;
    }
    const req = this.req;
    renderSunPath(this.sky, {
      site: req.site,
      atm: req.atmosphere,
      deltaT: req.deltaTOverride,
      observations: this.res.observations,
      labels: req.shots.map((s) => s.label),
      offsetsMs: req.shots.map((s, i) => (i === 0 ? 0 : s.offsetS * 1000)),
      selectedMs: this.selected,
      zone: req.constraints.zone,
    });
    const local = fmtDateTime(this.selected, req.constraints.zone, req.site.lon);
    const utc = fmtDateTime(this.selected, { kind: "utc" }, 0);
    const cap = h("p", { class: "meta" }, t("res.selected", { time: `${local}${req.constraints.zone.kind === "utc" ? "" : ` · ${utc}`}` }));
    this.sky.prepend(cap);
  }
}

function clusterText(c: Cluster, zone: Zone, lon: number, levels: boolean): string {
  const lines = [t("res.copyHead", { n: c.id + 1, dates: dateRange(c, zone, lon), tod: todRange(c, zone, lon), zone: zoneLabel(zone) })];
  for (const w of c.windows) {
    lines.push(
      [fmtDate(w.bestMs, zone, lon), t("res.copyBest", { time: fmtTime(w.bestMs, zone, lon, true) }), levels ? `95% ${span(w, 0.9545, zone, lon)}` : "", `${levels ? "99.7%" : t("res.colPossible")} ${fmtTime(w.startMs, zone, lon, true)}–${fmtTime(w.endMs, zone, lon, true)}`]
        .filter(Boolean)
        .join("\t"),
    );
  }
  return lines.join("\n");
}

export async function copy(btn: HTMLElement, text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    const old = btn.lastChild?.textContent;
    if (btn.lastChild) btn.lastChild.textContent = t("res.copied");
    setTimeout(() => btn.lastChild && (btn.lastChild.textContent = old ?? t("res.copy")), 1200);
  } catch {
    /* clipboard blocked: nothing else to do */
  }
}
