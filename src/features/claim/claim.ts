/**
 * claim.ts — the "Check a claimed time" panel: tests an EXIF / witness timestamp against
 * the shadows, with a known offset or by scanning every UTC offset.
 *
 * Defines: mountClaim() → the collapsible card (placed under the time answer by main.ts).
 * Used by: main.ts.
 * Depends on: core/claimCheck.ts, core/zone.ts, core/request.ts, core/models.ts,
 *             state/case.ts, state/solve.ts, ui/dom.ts, ui/format.ts, ui/context.ts.
 */

import { checkClaim } from "../../core/claimCheck.ts";
import type { ClaimOffsetResult, TimeSolveResult, Zone } from "../../core/models.ts";
import { formatOffset } from "../../core/zone.ts";
import { field, h, icon, info } from "../../ui/dom.ts";
import { fmtDateTime, fmtSpan } from "../../ui/format.ts";
import { buildClaimRequest, buildTimeRequest } from "../../core/request.ts";
import { t, tm } from "../../ui/context.ts";
import { at } from "../../core/util.ts";
import type { CaseStore } from "../../state/case.ts";
import type { SolveSession } from "../../state/solve.ts";
import "./claim.css";

let output: HTMLElement | null = null;

function renderClaim(root: HTMLElement, store: CaseStore, invalid: Set<string>, onChange: () => void): void {
  const s = store.state;
  output = h("div", { class: "claim-out", "aria-live": "polite" });
  root.replaceChildren(
    h(
      "div",
      { class: "row" },
      field({
        label: t("claim.time"),
        info: t("claim.timeInfo"),
        value: s.claim.time,
        name: "claim.time",
        invalid: invalid.has("claim.time"),
        inputmode: "text",
        wide: true,
        placeholder: "2024:07:14 15:32:10",
        onInput: (v) => {
          store.update((st) => (st.claim.time = v));
          onChange();
        },
      }),
      field({
        label: t("cons.zoneOffset"),
        value: s.claim.offset,
        name: "claim.offset",
        invalid: invalid.has("claim.offset"),
        inputmode: "text",
        placeholder: t("claim.offsetPlaceholder"),
        info: t("claim.offsetInfo"),
        onInput: (v) => {
          store.update((st) => (st.claim.offset = v));
          onChange();
        },
      }),
    ),
    output,
  );
}

function levelText(r: ClaimOffsetResult): string {
  if (r.acceptedLevel === null) return t("claim.outside");
  if (r.acceptedLevel === 1) return t("claim.insideBounds");
  return t("claim.insideLevel", { pct: (r.acceptedLevel * 100).toFixed(r.acceptedLevel > 0.99 ? 1 : 0) });
}

function nearest(ms: number, res: TimeSolveResult | null): { dist: number; best: number } | null {
  if (!res) return null;
  let out: { dist: number; best: number } | null = null;
  for (const c of res.clusters) {
    for (const w of c.windows) {
      const d = ms < w.startMs ? w.startMs - ms : ms > w.endMs ? ms - w.endMs : 0;
      if (!out || d < out.dist) out = { dist: d, best: w.bestMs };
    }
  }
  return out;
}

function updateClaim(store: CaseStore, zone: Zone, lon: number, timeResult: TimeSolveResult | null): void {
  if (!output) return;
  const s = store.state;
  if (!s.claim.time.trim()) {
    output.replaceChildren();
    return;
  }
  const b = buildClaimRequest(s);
  if (!b.ok) {
    output.replaceChildren(h("p", { class: "hint" }, tm(at(b.errors, 0).msg)));
    return;
  }
  const r = checkClaim(b.req);
  if (!r.ok) {
    output.replaceChildren(h("p", { class: "hint" }, tm(r.error)));
    return;
  }
  const results = r.result.results;
  const [single] = results;
  if (single && results.length === 1) {
    const x = single;
    const ok = x.acceptedLevel !== null;
    const n = nearest(x.utcMs, timeResult);
    output.replaceChildren(
      h(
        "div",
        { class: `verdict ${ok ? "good" : "bad"}` },
        icon(ok ? "check" : "warn", 20),
        h(
          "div",
          null,
          h("strong", null, t(ok ? "claim.consistent" : "claim.inconsistent")),
          h("p", null, t("claim.levelSentence", { time: fmtDateTime(x.utcMs, { kind: "utc" }, 0), level: levelText(x) })),
          !ok && n ? h("p", null, t("claim.nearest", { time: fmtDateTime(n.best, zone, lon), dist: fmtSpan(n.dist) })) : null,
          ...x.fit.shots.map((sf, i) => {
            const signed = (v: number, d: number) => `${v >= 0 ? "+" : ""}${v.toFixed(d)}°`;
            const residual = sf.residualAzimuth !== null
              ? `${signed(sf.residualElevation, 2)}, ${signed(sf.residualAzimuth, 1)}`
              : signed(sf.residualElevation, 2);
            return h("p", { class: "hint" }, t("claim.shotDetail", {
              shot: at(b.req.shots, i).label,
              el: sf.sunElevation.toFixed(2),
              az: sf.sunAzimuth.toFixed(1),
              residual,
            }));
          }),
        ),
      ),
    );
    return;
  }

  // Offset scan: a strip of cells, one per offset, coloured by the smallest region.
  const ok = results.filter((x) => x.acceptedLevel !== null);
  const best = ok.length ? ok.reduce((a, x) => (x.fit.misfit < a.fit.misfit ? x : a)) : null;
  const strip = h(
    "div",
    { class: "offset-strip", role: "img", "aria-label": t("claim.stripLabel", { list: ok.map((x) => formatOffset(x.offsetMin)).join(", ") || t("claim.none") }) },
    results.map((x) =>
      h("span", {
        class: `cell lv-${x.acceptedLevel === null ? "out" : x.acceptedLevel >= 0.99 ? "3" : x.acceptedLevel >= 0.95 ? "2" : "1"}`,
        title: `UTC${formatOffset(x.offsetMin)}: ${levelText(x)}`,
      }),
    ),
  );
  const ticks = h(
    "div",
    { class: "offset-ticks", "aria-hidden": "true" },
    [-12, -6, 0, 6, 12].map((v) => h("span", { style: { left: `${((v + 12) / 26) * 100}%` } }, v > 0 ? `+${v}` : v < 0 ? `−${-v}` : "0")),
  );
  output.replaceChildren(
    h(
      "div",
      { class: `verdict ${ok.length ? "good" : "bad"}` },
      icon(ok.length ? "check" : "warn", 20),
      h(
        "div",
        null,
        h("strong", null, best ? t("claim.compatibleIf", { offset: formatOffset(best.offsetMin) }) : t("claim.noOffset")),
        h(
          "div",
          { class: "label-row" },
          h("p", null, ok.length ? t("claim.compatibleList", { list: ranges(ok.map((x) => x.offsetMin)) }) : t("claim.wrong")),
          info(t("claim.readingTitle"), t(ok.length ? "claim.readingOk" : "claim.readingNone")),
        ),
      ),
    ),
    strip,
    ticks,
  );
}

function ranges(mins: number[]): string {
  // HOW: walk the sorted offsets and close a run whenever the next one is more than one
  // scan step (15 min) away.
  const out: string[] = [];
  let a = at(mins, 0);
  let prev = a;
  for (const m of [...mins.slice(1), Infinity]) {
    if (m - prev <= 15) {
      prev = m;
      continue;
    }
    out.push(a === prev ? `UTC${formatOffset(a)}` : t("claim.range", { from: formatOffset(a), to: formatOffset(prev) }));
    a = m;
    prev = m;
  }
  return out.join(", ");
}

/** The claim card; it re-checks after each edit and each new time result. */
export function mountClaim(cases: CaseStore, session: SolveSession): HTMLElement {
  const body = h("div");
  const card = h(
    "details",
    { class: "card result claim-card" },
    h("summary", null, h("span", null, h("strong", null, t("claim.title")), h("small", null, t("claim.subtitle")))),
    body,
  );
  let timer = 0;
  const schedule = (): void => {
    clearTimeout(timer);
    timer = window.setTimeout(() => {
      if (cases.state.mode !== "time") return;
      const b = buildTimeRequest(cases.state);
      const zone = b.ok ? b.req.constraints.zone : { kind: "utc" as const };
      const lon = b.ok ? b.req.site.lon : 0;
      updateClaim(cases, zone, lon, session.solved?.mode === "time" ? session.solved.res : null);
    }, 250);
  };
  const render = (): void => {
    renderClaim(body, cases, session.invalid, schedule);
    if (cases.state.claim.time.trim()) card.open = true;
  };
  cases.subscribe((_s, structural) => {
    if (structural) render();
    schedule();
  });
  session.subscribe((st) => st.kind === "done" && schedule());
  render();
  return card;
}
