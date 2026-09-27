/**
 * shots.ts — the "Shadows" panel: one collapsible card per shadow (max 3).
 *
 * Defines: renderShots() (up to MAX_SHOTS = 4 shadows).
 * Used by: main.ts.
 * Depends on: ui/dom.ts, ui/state.ts, ui/request.ts, core/measurement.ts, core/parse.ts,
 *             ui/format.ts.
 *
 * HOW: the panel is rebuilt on structural changes (add/remove, switching method, error
 * type, relation or azimuth). Typing only updates the state and the card's live preview,
 * so focus and caret are never lost.
 */

import { buildObservation } from "../../core/measurement";
import type { Component, TipEdge } from "../../core/models";
import { formatDuration, parseDateTime, parseDuration } from "../../core/parse";
import { field, h, icon, segmented, svg } from "../dom";
import { buildShadowOnly } from "../request";
import { type AppState, MAX_SHOTS, newShot, type ShotState, type Store } from "../state";

const openCards = new Set<string>();
const closedCards = new Set<string>();

function comp(c: Component, digits = 2): string {
  return c.kind === "gauss"
    ? `${c.centre.toFixed(digits)}° ± ${c.sigma.toFixed(digits)}°`
    : `${(c.centre - c.half).toFixed(digits)}°–${(c.centre + c.half).toFixed(digits)}°`;
}

function preview(sh: ShotState, refraction: boolean): { text: string; ok: boolean } {
  const shadow = buildShadowOnly(sh);
  if (!shadow) return { text: "Waiting for measurements…", ok: false };
  const r = buildObservation(shadow, refraction);
  if (!r.ok) return { text: r.error, ok: false };
  const o = r.obs;
  const parts = [`Sun elevation ${comp(o.elevation)}`];
  if (o.azimuth) parts.push(`azimuth ${comp(o.azimuth, 1)}`);
  return { text: parts.join(" · "), ok: true };
}

function diagram(): SVGElement {
  // Object, shadow and the elevation angle: a quick reminder of what to measure.
  return svg(
    "svg",
    { class: "diagram", viewBox: "0 0 120 60", role: "img", "aria-label": "Height H of a vertical object, its shadow length L on flat ground, and the Sun elevation angle at the shadow tip" },
    svg("line", { x1: 8, y1: 52, x2: 112, y2: 52, class: "d-ground" }),
    svg("line", { x1: 90, y1: 52, x2: 90, y2: 12, class: "d-object" }),
    svg("line", { x1: 90, y1: 52, x2: 22, y2: 52, class: "d-shadow" }),
    svg("line", { x1: 22, y1: 52, x2: 90, y2: 12, class: "d-ray" }),
    svg("path", { d: "M 38 52 A 16 16 0 0 0 36.2 44.5", class: "d-angle" }),
    svg("text", { x: 95, y: 34, class: "d-text" }, "H"),
    svg("text", { x: 54, y: 60, class: "d-text" }, "L"),
    svg("text", { x: 40, y: 48, class: "d-text small" }, "h"),
  );
}

function compass(sh: ShotState): SVGElement {
  const v = Number(sh.azErr === "gauss" ? sh.az : (Number(sh.azmin) + Number(sh.azmax)) / 2);
  const ok = Number.isFinite(v) && (sh.azErr === "gauss" ? sh.az.trim() !== "" : sh.azmin.trim() !== "" && sh.azmax.trim() !== "");
  const g = svg("svg", { class: "compass", viewBox: "-30 -30 60 60", role: "img", "aria-label": ok ? `Shadow points to ${v}°, the Sun is at ${(v + 180) % 360}°` : "Compass" });
  g.append(svg("circle", { r: 26, class: "c-ring" }));
  for (const [t, a] of [["N", 0], ["E", 90], ["S", 180], ["W", 270]] as const) {
    const r = (a * Math.PI) / 180;
    g.append(svg("text", { x: 20 * Math.sin(r), y: -20 * Math.cos(r) + 3, class: "c-label" }, t));
  }
  if (ok) {
    const r = (v * Math.PI) / 180;
    g.append(svg("line", { x1: 0, y1: 0, x2: 15 * Math.sin(r), y2: -15 * Math.cos(r), class: "c-shadow" }));
    g.append(svg("circle", { cx: -15 * Math.sin(r), cy: 15 * Math.cos(r), r: 4, class: "c-sun" }));
  }
  g.append(svg("circle", { r: 2, class: "c-base" }));
  return g;
}

export function renderShots(root: HTMLElement, store: Store, invalid: Set<string>): void {
  const s = store.state;
  const upd = (fn: (s: AppState) => void, structural = false) => store.update(fn, structural);

  const cards = s.shots.map((sh, i) => shotCard(sh, i, s, () => store.state, upd, invalid));
  const canAdd = s.shots.length < MAX_SHOTS;
  const intro =
    s.mode === "time"
      ? "Add another object in the same photo, or another photo of the same place taken a known time later — each one tightens the result."
      : "Give each photo its own time. Shadows taken at different times are crossed to pin down the place.";

  root.replaceChildren(
    h("p", { class: "section-intro" }, intro),
    ...cards,
    h(
      "button",
      {
        type: "button",
        class: "btn add-shot",
        disabled: !canAdd,
        onclick: () =>
          upd((st) => {
            const n = newShot(st.shots.length);
            if (st.mode === "time") n.relation = "same";
            openCards.add(n.id);
            st.shots.push(n);
          }, true),
      },
      icon("plus"),
      canAdd ? (s.mode === "time" ? "Add a shadow (another object or photo)" : "Add a shadow from another photo") : `Maximum ${MAX_SHOTS} shadows`,
    ),
  );
}

function shotCard(
  sh: ShotState,
  i: number,
  s: AppState,
  live: () => AppState,
  upd: (fn: (s: AppState) => void, structural?: boolean) => void,
  invalid: Set<string>,
): HTMLElement {
  const me = (st: AppState) => st.shots.find((x) => x.id === sh.id) as ShotState;
  const set = (fn: (x: ShotState) => void, structural = false) => upd((st) => fn(me(st)), structural);
  const isOpen = openCards.has(sh.id) || (!closedCards.has(sh.id) && s.shots.length === 1) || (i === 0 && !closedCards.has(sh.id));
  const out = h("output", { class: "preview", "aria-live": "polite" });
  const badge = h("span", { class: "badge" });
  const refresh = () => {
    const cur = me(live());
    const p = preview(cur, live().adv.refraction);
    out.textContent = p.text;
    out.classList.toggle("bad", !p.ok);
    badge.textContent = relationText(cur, i, s.mode);
  };
  const inv = (k: string) => invalid.has(`${sh.id}.${k}`);

  const text = (key: string, label: string, opts: Partial<Parameters<typeof field>[0]> = {}) =>
    field({
      label,
      value: sh.f[key] ?? "",
      name: `${sh.id}.${key}`,
      invalid: inv(key),
      onInput: (v) => {
        set((x) => (x.f[key] = v));
        refresh();
      },
      ...opts,
    });

  const pair = (base: string, what: string, unitHint?: string) =>
    sh.err === "gauss"
      ? h("div", { class: "row" }, text(base, what, { placeholder: "value", suffix: unitHint }), text(`${base}s`, "± 1σ", { placeholder: "0", suffix: unitHint }))
      : h("div", { class: "row" }, text(`${base}min`, `${what} min`, { suffix: unitHint }), text(`${base}max`, `${what} max`, { suffix: unitHint }));

  const elevFields =
    sh.method === "lengths"
      ? [pair("h", "Object height"), pair("l", "Shadow length"), h("small", { class: "hint" }, "Any unit, as long as both use the same one — only the ratio matters. Measure on flat, level ground.")]
      : sh.method === "ratio"
        ? [pair("r", "Height ÷ shadow"), h("small", { class: "hint" }, "Useful when the scene gives proportions but no absolute size.")]
        : [pair("a", "Sun elevation", "°"), h("small", { class: "hint" }, "Angle of the Sun above the horizon, e.g. from a solved scene.")];

  // Time relation block.
  let timeBlock: HTMLElement;
  if (s.mode === "time") {
    if (i === 0) {
      timeBlock = h("p", { class: "note" }, icon("clock", 16), "Reference photo: its date and time are what ShadowClock solves for.");
    } else {
      const parsed = parseDuration(sh.offset);
      timeBlock = h(
        "div",
        { class: "stack" },
        segmented(
          `rel-${sh.id}`,
          "Relation to shadow 1",
          [
            { value: "same", label: "Same photo", title: "Another vertical object in the same picture: same instant" },
            { value: "other", label: "Another photo", title: "A different photo of the same place, taken a known time later or earlier" },
          ],
          sh.relation,
          (v) => set((x) => (x.relation = v), true),
        ),
        sh.relation === "other"
          ? h(
              "div",
              { class: "row" },
              field({
                label: "Taken after shadow 1",
                value: sh.offset,
                name: `${sh.id}.offset`,
                invalid: inv("offset"),
                placeholder: "+01:23:04",
                inputmode: "text",
                hint: parsed !== null ? formatDuration(parsed, true) : "e.g. +01:23:04, −5 min, 2 h 10 min",
                onInput: (v) => { set((x) => (x.offset = v)); refresh(); },
              }),
              field({
                label: "± uncertainty",
                value: sh.offsetSigma,
                name: `${sh.id}.offsetSigma`,
                invalid: inv("offsetSigma"),
                placeholder: "2 s",
                inputmode: "text",
                hint: "EXIF differences are usually exact to 1–2 s",
                onInput: (v) => set((x) => (x.offsetSigma = v)),
              }),
            )
          : h("p", { class: "note" }, "Same instant as shadow 1: both shadows see exactly the same Sun."),
      );
    }
  } else {
    const p = parseDateTime(sh.time);
    timeBlock = h(
      "div",
      { class: "row" },
      field({
        label: "Taken at",
        value: sh.time,
        name: `${sh.id}.time`,
        invalid: inv("time"),
        placeholder: "2024-07-14 15:32:10",
        inputmode: "text",
        wide: true,
        hint: p ? (p.offsetMin !== null ? "Offset read from the text" : "Paste EXIF (2024:07:14 15:32:10) or ISO 8601") : "Paste EXIF (2024:07:14 15:32:10) or ISO 8601",
        onInput: (v) => { set((x) => (x.time = v)); refresh(); },
      }),
      field({
        label: "UTC offset",
        value: sh.timeOffset,
        name: `${sh.id}.timeOffset`,
        invalid: inv("timeOffset"),
        placeholder: "+00:00",
        inputmode: "text",
        onInput: (v) => set((x) => (x.timeOffset = v)),
      }),
      field({
        label: "± uncertainty",
        value: sh.timeSigma,
        name: `${sh.id}.timeSigma`,
        invalid: inv("timeSigma"),
        placeholder: "1 min",
        inputmode: "text",
        onInput: (v) => set((x) => (x.timeSigma = v)),
      }),
    );
  }

  const azBlock = sh.azOn
    ? h(
        "div",
        { class: "stack" },
        h(
          "div",
          { class: "az-grid" },
          h(
            "div",
            { class: "stack" },
            segmented(`azerr-${sh.id}`, "Azimuth error type", [
              { value: "gauss", label: "± σ" },
              { value: "range", label: "min–max" },
            ], sh.azErr, (v) => set((x) => (x.azErr = v), true), "small"),
            sh.azErr === "gauss"
              ? h(
                  "div",
                  { class: "row" },
                  field({ label: "Shadow azimuth", value: sh.az, name: `${sh.id}.az`, invalid: inv("az"), suffix: "°", placeholder: "0–360", onInput: (v) => { set((x) => (x.az = v)); refresh(); redrawCompass(); } }),
                  field({ label: "± 1σ", value: sh.azs, name: `${sh.id}.azs`, invalid: inv("azs"), suffix: "°", onInput: (v) => { set((x) => (x.azs = v)); refresh(); } }),
                )
              : h(
                  "div",
                  { class: "row" },
                  field({ label: "Azimuth min", value: sh.azmin, name: `${sh.id}.azmin`, invalid: inv("azmin"), suffix: "°", onInput: (v) => { set((x) => (x.azmin = v)); refresh(); redrawCompass(); } }),
                  field({ label: "Azimuth max", value: sh.azmax, name: `${sh.id}.azmax`, invalid: inv("azmax"), suffix: "°", onInput: (v) => { set((x) => (x.azmax = v)); refresh(); redrawCompass(); } }),
                ),
          ),
          h("div", { class: "compass-wrap" }, compass(sh)),
        ),
        h("small", { class: "hint" }, "Direction from the object's base to the shadow tip, clockwise from north (0° = N, 90° = E)."),
        segmented(`azref-${sh.id}`, "North reference", [
          { value: "true", label: "True north", title: "Map / geographic north" },
          { value: "magnetic", label: "Magnetic (compass)", title: "Compass reading: needs the local magnetic declination" },
        ], sh.azRef, (v) => set((x) => (x.azRef = v), true), "small"),
        sh.azRef === "magnetic"
          ? h(
              "div",
              { class: "row" },
              field({
                label: "Declination (east +)",
                value: sh.decl,
                name: `${sh.id}.decl`,
                invalid: inv("decl"),
                suffix: "°",
                onInput: (v) => { set((x) => (x.decl = v)); refresh(); },
              }),
              h("small", { class: "hint grow" }, "Look it up for the place and date, e.g. with the ", h("a", { href: "https://www.ngdc.noaa.gov/geomag/calculators/magcalc.shtml", target: "_blank", rel: "noopener noreferrer" }, "NOAA calculator"), "."),
            )
          : null,
      )
    : h("p", { class: "note" }, "Without direction, every day has a morning and an afternoon solution.");

  const compassHolder = azBlock.querySelector(".compass-wrap");
  const redrawCompass = () => compassHolder?.replaceChildren(compass(me(live())));

  const tipSelectId = `tip-${sh.id}`;
  const details = h(
    "details",
    {
      class: `card shot shot-${i + 1}`,
      open: isOpen,
      ontoggle: (e: Event) => {
        const open = (e.currentTarget as HTMLDetailsElement).open;
        if (open) { openCards.add(sh.id); closedCards.delete(sh.id); } else { openCards.delete(sh.id); closedCards.add(sh.id); }
      },
    },
    h(
      "summary",
      null,
      h("span", { class: "dot", "aria-hidden": "true" }),
      h("span", { class: "shot-title" }, sh.label || `Shadow ${i + 1}`),
      badge,
      out,
    ),
    h(
      "div",
      { class: "card-body" },
      h(
        "div",
        { class: "row" },
        field({
          label: "Name",
          value: sh.label,
          inputmode: "text",
          wide: true,
          placeholder: `Shadow ${i + 1}`,
          onInput: (v) => {
            set((x) => (x.label = v));
            (details.querySelector(".shot-title") as HTMLElement).textContent = v || `Shadow ${i + 1}`;
          },
        }),
      ),
      timeBlock,
      h(
        "fieldset",
        { class: "group" },
        h("legend", null, "Sun elevation"),
        h(
          "div",
          { class: "elev-head" },
          h(
            "div",
            { class: "stack" },
            segmented(`method-${sh.id}`, "Elevation from", [
              { value: "lengths", label: "Height + shadow" },
              { value: "ratio", label: "Ratio" },
              { value: "angle", label: "Angle" },
            ], sh.method, (v) => set((x) => (x.method = v), true)),
            segmented(`err-${sh.id}`, "Error type", [
              { value: "gauss", label: "± σ", title: "Gaussian: value ± one standard deviation" },
              { value: "range", label: "min–max", title: "Hard bounds: the true value is certainly inside" },
            ], sh.err, (v) => set((x) => (x.err = v), true), "small"),
          ),
          diagram(),
        ),
        ...elevFields,
        h(
          "div",
          { class: "row" },
          h(
            "div",
            { class: "field" },
            h("label", { for: tipSelectId }, "Shadow tip measured at"),
            h(
              "select",
              { id: tipSelectId, onchange: (e: Event) => { set((x) => (x.tip = (e.target as HTMLSelectElement).value as TipEdge)); refresh(); } },
              ([
                ["unknown", "Not sure (± 0.27°)"],
                ["midpoint", "Middle of soft edge"],
                ["umbra", "Sharp inner edge"],
                ["outer", "Faint outer edge"],
              ] as const).map(([v, l]) => h("option", { value: v, selected: sh.tip === v }, l)),
            ),
          ),
          field({
            label: "Object may lean up to",
            value: sh.tilt,
            name: `${sh.id}.tilt`,
            invalid: inv("tilt"),
            suffix: "°",
            onInput: (v) => { set((x) => (x.tilt = v)); refresh(); },
          }),
        ),
      ),
      h(
        "fieldset",
        { class: "group" },
        h("legend", null, "Shadow direction"),
        h(
          "label",
          { class: "switch" },
          h("input", { type: "checkbox", role: "switch", checked: sh.azOn, onchange: (e: Event) => set((x) => (x.azOn = (e.target as HTMLInputElement).checked), true) }),
          h("span", null, "I know which way the shadow points"),
        ),
        azBlock,
      ),
      h(
        "div",
        { class: "card-actions" },
        h(
          "button",
          {
            type: "button",
            class: "btn ghost",
            disabled: s.shots.length >= MAX_SHOTS,
            onclick: () =>
              upd((st) => {
                const src = me(st);
                const copy: ShotState = { ...structuredClone(src), id: newShot(0).id, label: `${src.label} (copy)` };
                openCards.add(copy.id);
                st.shots.splice(st.shots.indexOf(src) + 1, 0, copy);
              }, true),
          },
          icon("copy", 16),
          "Duplicate",
        ),
        s.shots.length > 1
          ? h(
              "button",
              { type: "button", class: "btn ghost danger", onclick: () => upd((st) => (st.shots = st.shots.filter((x) => x.id !== sh.id)), true) },
              icon("trash", 16),
              "Remove",
            )
          : null,
      ),
    ),
  );
  refresh();
  return details;
}

function relationText(sh: ShotState, i: number, mode: AppState["mode"]): string {
  if (mode === "place") return sh.time.trim() ? sh.time.trim() : "time needed";
  if (i === 0) return "reference";
  if (sh.relation === "same") return "same photo";
  const d = parseDuration(sh.offset);
  return d === null ? "other photo" : `${formatDuration(d, true)}`;
}
