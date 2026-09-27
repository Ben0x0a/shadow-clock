/**
 * claim.ts — the "Check a claimed time" panel: tests an EXIF / witness timestamp against
 * the shadows, with a known offset or by scanning every UTC offset.
 *
 * Defines: renderClaim(), updateClaim().
 * Used by: main.ts.
 * Depends on: core/claimCheck.ts, core/zone.ts, ui/request.ts, ui/dom.ts, ui/format.ts,
 *             ui/state.ts, core/models.ts.
 */

import { checkClaim } from "../../core/claimCheck";
import type { ClaimOffsetResult, TimeSolveResult, Zone } from "../../core/models";
import { formatOffset } from "../../core/zone";
import { field, h, icon } from "../dom";
import { fmtDateTime, fmtSpan } from "../format";
import { buildClaimRequest } from "../request";
import type { Store } from "../state";

let output: HTMLElement | null = null;

export function renderClaim(root: HTMLElement, store: Store, invalid: Set<string>, onChange: () => void): void {
  const s = store.state;
  output = h("div", { class: "claim-out", "aria-live": "polite" });
  root.replaceChildren(
    h("p", { class: "section-intro" }, "Paste the timestamp that the photo claims (EXIF DateTimeOriginal, a post date, a witness statement). ShadowClock tells you whether the shadows agree."),
    h(
      "div",
      { class: "row" },
      field({
        label: "Claimed date & time",
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
        label: "UTC offset",
        value: s.claim.offset,
        name: "claim.offset",
        invalid: invalid.has("claim.offset"),
        inputmode: "text",
        placeholder: "unknown",
        hint: "Leave empty to test every offset",
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
  if (r.acceptedLevel === null) return "outside the 99.7 % region";
  if (r.acceptedLevel === 1) return "inside all bounds";
  return `inside the ${(r.acceptedLevel * 100).toFixed(r.acceptedLevel > 0.99 ? 1 : 0)} % region`;
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

export function updateClaim(store: Store, zone: Zone, lon: number, timeResult: TimeSolveResult | null): void {
  if (!output) return;
  const s = store.state;
  if (!s.claim.time.trim()) {
    output.replaceChildren();
    return;
  }
  const b = buildClaimRequest(s);
  if (!b.ok) {
    output.replaceChildren(h("p", { class: "hint" }, b.errors[0].msg));
    return;
  }
  const r = checkClaim(b.req);
  if (!r.ok) {
    output.replaceChildren(h("p", { class: "hint" }, r.error));
    return;
  }
  const results = r.result.results;
  if (results.length === 1) {
    const x = results[0];
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
          h("strong", null, ok ? "Consistent with the shadows" : "Not consistent with the shadows"),
          h("p", null, `${fmtDateTime(x.utcMs, { kind: "utc" }, 0)} is ${levelText(x)}.`),
          !ok && n ? h("p", null, `Nearest compatible time: ${fmtDateTime(n.best, zone, lon)} — ${fmtSpan(n.dist)} away.`) : null,
          ...x.fit.shots.map((sf, i) =>
            h("p", { class: "hint" }, `${b.req.shots[i].label}: Sun would be at ${sf.sunElevation.toFixed(2)}° elevation, ${sf.sunAzimuth.toFixed(1)}° azimuth (residual ${sf.residualElevation >= 0 ? "+" : ""}${sf.residualElevation.toFixed(2)}°${sf.residualAzimuth !== null ? `, ${sf.residualAzimuth >= 0 ? "+" : ""}${sf.residualAzimuth.toFixed(1)}°` : ""}).`),
          ),
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
    { class: "offset-strip", role: "img", "aria-label": `Compatible offsets: ${ok.map((x) => formatOffset(x.offsetMin)).join(", ") || "none"}` },
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
        h("strong", null, ok.length ? `Compatible if the clock was on UTC${formatOffset(best!.offsetMin)}` : "No UTC offset makes this time compatible"),
        h(
          "p",
          null,
          ok.length
            ? `Compatible offsets: ${ranges(ok.map((x) => x.offsetMin))}. The time zone at the place during that season should be one of these — otherwise the camera clock or the claim is wrong.`
            : "Either the date or the measurements are wrong. The solutions list shows the compatible dates.",
        ),
      ),
    ),
    strip,
    ticks,
  );
}

function ranges(mins: number[]): string {
  const out: string[] = [];
  let a = mins[0];
  let prev = mins[0];
  for (let i = 1; i <= mins.length; i++) {
    const m = mins[i];
    if (m !== undefined && m - prev <= 15) {
      prev = m;
      continue;
    }
    out.push(a === prev ? `UTC${formatOffset(a)}` : `UTC${formatOffset(a)} to ${formatOffset(prev)}`);
    a = m;
    prev = m;
  }
  return out.join(", ");
}
