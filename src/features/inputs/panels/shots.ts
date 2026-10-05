/**
 * shots.ts — shadow cards (up to MAX_SHOTS = 4), in a guided or an expert variant.
 *
 * Defines: renderShots(), shadowSummary(), addShotButtons().
 * Used by: features/inputs/inputs.ts (expert view), features/inputs/guided.ts (guided steps).
 * Depends on: ui/dom.ts, core/form.ts, core/request.ts, core/measurement.ts, core/parse.ts.
 *
 * HOW: a card is rebuilt on structural changes (add/remove, method, error type, precision,
 * relation). Typing only updates the state and the card's live preview, so focus and caret
 * are never lost.
 * Every measurement is "value ± declared tolerance" (a hard bound).
 * Guided variant: height, shadow and optional direction; everything else sits under
 * "More options". Expert variant: every control visible.
 */

import { buildObservation } from "../../../core/measurement.ts";
import type { Component, TipEdge } from "../../../core/models.ts";
import { parseDateTime, parseDuration } from "../../../core/parse.ts";
import { formatDuration } from "../../../ui/format.ts";
import { field, h, icon, info, segmented, svg, switchButton } from "../../../ui/dom.ts";
import { buildShadowOnly } from "../../../core/request.ts";
import { t, tm } from "../../../ui/context.ts";
import { type AppState, MAX_SHOTS, newShot, type ShotState } from "../../../core/form.ts";
import type { CaseStore } from "../../../state/case.ts";

const openCards = new Set<string>();
const closedCards = new Set<string>();

function comp(c: Component, digits = 2): string {
  const half = c.kind === "gauss" ? c.sigma : c.half;
  return `${c.centre.toFixed(digits)}° ± ${half.toFixed(digits)}°`;
}

function preview(sh: ShotState, refraction: boolean): { text: string; ok: boolean } {
  const shadow = buildShadowOnly(sh);
  if (!shadow) return { text: t("shot.waiting"), ok: false };
  const r = buildObservation(shadow, refraction);
  if (!r.ok) return { text: tm(r.error), ok: false };
  const o = r.obs;
  // The ± shown includes penumbra, tilt and refraction, not only the declared tolerance.
  const parts = [t("shot.previewElevation", { value: comp(o.elevation) })];
  if (o.azimuth) parts.push(t("shot.previewAzimuth", { value: comp(o.azimuth, 1) }));
  return { text: parts.join(" · "), ok: true };
}

function diagram(): SVGElement {
  // Object, shadow and the elevation angle: a quick reminder of what to measure.
  return svg(
    "svg",
    { class: "diagram", viewBox: "0 0 120 60", role: "img", "aria-label": t("shot.diagram") },
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
  const v = Number(sh.az.replace(",", "."));
  const ok = Number.isFinite(v) && sh.az.trim() !== "";
  const g = svg("svg", { class: "compass", viewBox: "-30 -30 60 60", role: "img", "aria-label": ok ? t("shot.compassValue", { shadow: v, sun: (v + 180) % 360 }) : t("shot.compass") });
  g.append(svg("circle", { r: 26, class: "c-ring" }));
  for (const [letter, a] of [["compass.n", 0], ["compass.e", 90], ["compass.s", 180], ["compass.w", 270]] as const) {
    const r = (a * Math.PI) / 180;
    g.append(svg("text", { x: 20 * Math.sin(r), y: -20 * Math.cos(r) + 3, class: "c-label" }, t(letter)));
  }
  if (ok) {
    const r = (v * Math.PI) / 180;
    g.append(svg("line", { x1: 0, y1: 0, x2: 15 * Math.sin(r), y2: -15 * Math.cos(r), class: "c-shadow" }));
    g.append(svg("circle", { cx: -15 * Math.sin(r), cy: 15 * Math.cos(r), r: 4, class: "c-sun" }));
  }
  g.append(svg("circle", { r: 2, class: "c-base" }));
  return g;
}

/** String-table keys of the explanations behind the "i" buttons. */
const INFO: Record<string, string> = {
  h: "shot.info.h",
  l: "shot.info.l",
  r: "shot.info.r",
  a: "shot.info.a",
  tol: "shot.info.tol",
  az: "shot.info.az",
};

export type ShotVariant = "guided" | "expert";

export interface RenderShotsOpts {
  variant: ShotVariant;
  /** Indices of the shots to render (default: all). */
  from?: number;
  to?: number;
  /** Show the intro paragraph and the add buttons. */
  intro?: boolean;
  add?: boolean;
}

/** One-line summary of a shadow for collapsed guided steps. */
export function shadowSummary(sh: ShotState, i: number, mode: AppState["mode"]): string {
  const f = sh.f;
  const pm = (v = "", tol = "") => `${v || "?"}${tol ? ` ±${tol}` : ""}`;
  const m =
    sh.method === "lengths" ? `${pm(f.h, f.ht)} / ${pm(f.l, f.lt)}` : sh.method === "ratio" ? t("shot.sumRatio", { v: pm(f.r, f.rt) }) : `${pm(f.a, f.at)}°`;
  const dir = sh.azOn && sh.az.trim() ? ` · ${t("shot.sumDir", { v: pm(sh.az, sh.azt) })}` : "";
  return `${sh.label || t("shot.default", { n: i + 1 })}: ${m}${dir} (${relationText(sh, i, mode)})`;
}

/** The two ways to add a shadow, phrased as a question in guided mode. */
export function addShotButtons(store: CaseStore): HTMLElement {
  const s = store.state;
  const full = s.shots.length >= MAX_SHOTS;
  const add = (relation: "same" | "other") =>
    store.update((st) => {
      const n = newShot(t("shot.default", { n: st.shots.length + 1 }));
      n.relation = relation;
      n.label = t(st.mode === "place" || relation === "other" ? "shot.photo" : "shot.object", { n: st.shots.length + 1 });
      openCards.add(n.id);
      st.shots.push(n);
    }, true);
  if (full) return h("p", { class: "hint" }, t("shot.max", { n: MAX_SHOTS }));
  return h(
    "div",
    { class: "add-row" },
    s.mode === "time"
      ? [
          h("button", { type: "button", class: "btn add-shot", onclick: () => add("same") }, icon("plus"), h("span", null, h("strong", null, t("shot.addObject")), h("small", null, t("shot.addObjectSub")))),
          h("button", { type: "button", class: "btn add-shot", onclick: () => add("other") }, icon("plus"), h("span", null, h("strong", null, t("shot.addPhoto")), h("small", null, t("shot.addPhotoSub")))),
        ]
      : h("button", { type: "button", class: "btn add-shot", onclick: () => add("other") }, icon("plus"), h("span", null, h("strong", null, t("shot.addPhoto")), h("small", null, t("shot.addPhotoPlaceSub")))),
  );
}

export function renderShots(root: HTMLElement, store: CaseStore, invalid: Set<string>, opts: RenderShotsOpts): void {
  const s = store.state;
  const upd = (fn: (s: AppState) => void, structural = false) => store.update(fn, structural);
  const from = opts.from ?? 0;
  const to = opts.to ?? s.shots.length;
  const cards = s.shots.slice(from, to).map((sh, k) => shotCard(sh, from + k, s, () => store.state, upd, invalid, opts.variant));
  const intro =
    s.mode === "time"
      ? t("shot.introTime")
      : t("shot.introPlace");
  root.replaceChildren(
    ...(opts.intro ? [h("p", { class: "section-intro" }, intro)] : []),
    ...cards,
    ...(opts.add ? [addShotButtons(store)] : []),
  );
}

function shotCard(
  sh: ShotState,
  i: number,
  s: AppState,
  live: () => AppState,
  upd: (fn: (s: AppState) => void, structural?: boolean) => void,
  invalid: Set<string>,
  variant: ShotVariant,
): HTMLElement {
  const guided = variant === "guided";
  const me = (st: AppState) => st.shots.find((x) => x.id === sh.id) as ShotState;
  const set = (fn: (x: ShotState) => void, structural = false) => upd((st) => fn(me(st)), structural);
  const isOpen = openCards.has(sh.id) || (!closedCards.has(sh.id) && (i === 0 || guided));
  // WHY aria-live off: <output> is a live region by default and would be read out on every
  // keystroke; the results announce once per update instead (see main.ts).
  const out = h("output", { class: "preview", "aria-live": "off" });
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

  // A measured value and the tolerance the operator declares for it (hard bound).
  const pair = (base: string, what: string, unitHint?: string) =>
    h(
      "div",
      { class: "pair" },
      text(base, what, { placeholder: t(base === "a" ? "shot.phDegrees" : "shot.phValue"), suffix: unitHint, info: INFO[base] ? t(INFO[base]) : undefined }),
      text(`${base}t`, t("shot.tol"), { placeholder: t("shot.phMax"), suffix: unitHint, info: base === "h" && INFO.tol ? t(INFO.tol) : undefined }),
    );

  const elevFields =
    sh.method === "lengths"
      ? [
          h("div", { class: "stack" }, pair("h", t("field.height")), pair("l", t("field.shadow"))),
        ]
      : sh.method === "ratio"
        ? [pair("r", t("field.ratio"))]
        : [pair("a", t("field.elevation"), "°")];

  // Time relation block.
  let timeBlock: HTMLElement | null;
  if (s.mode === "time") {
    if (i === 0) {
      timeBlock = null;
    } else {
      const parsed = parseDuration(sh.offset);
      timeBlock = h(
        "div",
        { class: "stack" },
        segmented(
          `rel-${sh.id}`,
          t("shot.relation"),
          [
            { value: "same", label: t("shot.samePhoto"), title: t("shot.samePhotoTitle") },
            { value: "other", label: t("shot.otherPhoto"), title: t("shot.otherPhotoTitle") },
          ],
          sh.relation,
          (v) => set((x) => (x.relation = v), true),
        ),
        sh.relation === "other"
          ? h(
              "div",
              { class: "row" },
              field({
                label: t("shot.gap"),
                value: sh.offset,
                name: `${sh.id}.offset`,
                invalid: inv("offset"),
                placeholder: "+01:23:04",
                inputmode: "text",
                hint: parsed !== null ? formatDuration(parsed, true) : undefined,
                info: t("shot.gapInfo"),
                onInput: (v) => { set((x) => (x.offset = v)); refresh(); },
              }),
              field({
                label: t("shot.tolerance"),
                value: sh.offsetTol,
                name: `${sh.id}.offsetTol`,
                invalid: inv("offsetTol"),
                placeholder: "2 s",
                inputmode: "text",
                onInput: (v) => set((x) => (x.offsetTol = v)),
              }),
            )
          : null,
      );
    }
  } else {
    const p = parseDateTime(sh.time);
    timeBlock = h(
      "div",
      { class: "row" },
      field({
        label: t("shot.takenAt"),
        value: sh.time,
        name: `${sh.id}.time`,
        invalid: inv("time"),
        placeholder: "2024-07-14 15:32:10",
        inputmode: "text",
        wide: true,
        hint: p && p.offsetMin !== null ? t("shot.offsetFromText") : undefined,
        info: t("shot.takenAtInfo"),
        onInput: (v) => { set((x) => (x.time = v)); refresh(); },
      }),
      field({ label: t("cons.zoneOffset"), value: sh.timeOffset, name: `${sh.id}.timeOffset`, invalid: inv("timeOffset"), placeholder: "+00:00", inputmode: "text", onInput: (v) => set((x) => (x.timeOffset = v)) }),
      field({ label: t("shot.tolerance"), value: sh.timeTol, name: `${sh.id}.timeTol`, invalid: inv("timeTol"), placeholder: "1 min", inputmode: "text", onInput: (v) => set((x) => (x.timeTol = v)) }),
    );
  }

  // Direction: value ± tolerance + compass. In guided mode, typing turns the direction on.
  const azInput = (key: "az" | "azt", label: string) =>
    field({
      label,
      value: sh[key],
      name: `${sh.id}.${key}`,
      invalid: inv(key),
      suffix: "°",
      placeholder: t(key === "az" ? "shot.phOptional" : "shot.phMax"),
      info: key === "az" && INFO.az ? t(INFO.az) : undefined,
      onInput: (v) => {
        set((x) => {
          x[key] = v;
          if (guided) x.azOn = true;
        });
        refresh();
        redrawCompass();
      },
    });
  const azValues = h("div", { class: "pair grow" }, azInput("az", t("field.direction")), azInput("azt", t("shot.tol")));
  const compassHolder = h("div", { class: "compass-wrap" }, compass(sh));
  const redrawCompass = () => compassHolder.replaceChildren(compass(me(live())));
  const azMain = h(
    "div",
    { class: "az-grid" },
    azValues,
    compassHolder,
  );
  const azRefBlock = h(
    "div",
    { class: "stack" },
    segmented(`azref-${sh.id}`, t("shot.northRef"), [
      { value: "true", label: t("shot.trueNorth"), title: t("shot.trueNorthTitle") },
      { value: "magnetic", label: t("shot.magnetic"), title: t("shot.magneticTitle") },
    ], sh.azRef, (v) => set((x) => (x.azRef = v), true), "small"),
    sh.azRef === "magnetic"
      ? h(
          "div",
          { class: "row" },
          field({ label: t("shot.declination"), value: sh.decl, name: `${sh.id}.decl`, invalid: inv("decl"), suffix: "°", onInput: (v) => { set((x) => (x.decl = v)); refresh(); } }),
          info(t("shot.declTitle"), t("shot.declInfo")),
        )
      : null,
  );

  const nameField = field({
    label: t("shot.name"),
    value: sh.label,
    inputmode: "text",
    wide: true,
    placeholder: t("shot.default", { n: i + 1 }),
    onInput: (v) => {
      set((x) => (x.label = v));
      (details.querySelector(".shot-title") as HTMLElement).textContent = v || t("shot.default", { n: i + 1 });
    },
  });
  const methodSegs = segmented(`method-${sh.id}`, t("shot.inputAs"), [
    { value: "lengths", label: t("shot.lengths") },
    { value: "ratio", label: t("shot.ratio") },
    { value: "angle", label: t("shot.angle") },
  ], sh.method, (v) => set((x) => (x.method = v), true));
  const tipSelectId = `tip-${sh.id}`;
  const tipTilt = h(
    "div",
    { class: "row" },
    h(
      "div",
      { class: "field" },
      h("div", { class: "label-row" }, h("label", { for: tipSelectId }, t("shot.tip")), info(t("shot.tipTitle"), t("shot.tipInfo"))),
      h(
        "select",
        { id: tipSelectId, onchange: (e: Event) => { set((x) => (x.tip = (e.target as HTMLSelectElement).value as TipEdge)); refresh(); } },
        ([
          ["unknown", "shot.tipUnknown"],
          ["midpoint", "shot.tipMidpoint"],
          ["umbra", "shot.tipUmbra"],
          ["outer", "shot.tipOuter"],
        ] as const).map(([v, l]) => h("option", { value: v, selected: sh.tip === v }, t(l))),
      ),
    ),
    field({ label: t("field.lean"), info: t("shot.leanInfo"), value: sh.tilt, name: `${sh.id}.tilt`, invalid: inv("tilt"), suffix: "°", onInput: (v) => { set((x) => (x.tilt = v)); refresh(); } }),
  );
  const actions = h(
    "div",
    { class: "card-actions" },
    guided
      ? null
      : h(
          "button",
          {
            type: "button",
            class: "btn ghost",
            disabled: s.shots.length >= MAX_SHOTS,
            onclick: () =>
              upd((st) => {
                const src = me(st);
                const copy: ShotState = { ...structuredClone(src), id: newShot("").id, label: t("shot.copyOf", { label: src.label }) };
                openCards.add(copy.id);
                st.shots.splice(st.shots.indexOf(src) + 1, 0, copy);
              }, true),
          },
          icon("copy", 16),
          t("shot.duplicate"),
        ),
    s.shots.length > 1
      ? h("button", { type: "button", class: "btn ghost danger", onclick: () => upd((st) => (st.shots = st.shots.filter((x) => x.id !== sh.id)), true) }, icon("trash", 16), t("shot.remove"))
      : null,
  );

  const body = guided
    ? [
        timeBlock,
        h("div", { class: "elev-head" }, h("div", { class: "stack grow" }, ...elevFields), diagram()),
        azMain,
        h(
          "details",
          { class: "more" },
          h("summary", null, t("shot.more")),
          h(
            "div",
            { class: "stack" },
            nameField,
            h("div", { class: "label-row" }, h("span", { class: "field-label" }, t("shot.inputAs")), info(t("shot.inputTitle"), t("shot.inputInfo"))),
            methodSegs,
            tipTilt,
            h("span", { class: "field-label" }, t("shot.northRef")),
            azRefBlock,
          ),
        ),
        actions,
      ]
    : [
        h("div", { class: "row" }, nameField),
        timeBlock,
        h("fieldset", { class: "group" }, h("legend", null, t("field.elevation")), h("div", { class: "elev-head" }, methodSegs, diagram()), ...elevFields, tipTilt),
        h(
          "fieldset",
          { class: "group" },
          h("legend", null, t("shot.direction")),
          switchButton(t("shot.knowDirection"), sh.azOn, (on) => set((x) => (x.azOn = on), true)),
          sh.azOn ? h("div", { class: "stack" }, azMain, azRefBlock) : null,
        ),
        actions,
      ];

  // The first shadow in the guided view is the step itself: no nested card chrome.
  if (guided && i === 0) {
    refresh();
    return h("div", { class: "shot-flat shot-1" }, ...body.filter((x): x is HTMLElement => !!x), out);
  }

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
    h("summary", null, h("span", { class: "dot", "aria-hidden": "true" }), h("span", { class: "shot-title" }, sh.label || t("shot.default", { n: i + 1 })), badge, out),
    h("div", { class: "card-body" }, ...body.filter((x): x is HTMLElement => !!x)),
  );
  refresh();
  return details;
}

function relationText(sh: ShotState, i: number, mode: AppState["mode"]): string {
  if (mode === "place") return sh.time.trim() ? sh.time.trim() : t("shot.timeNeeded");
  if (i === 0) return t("shot.reference");
  if (sh.relation === "same") return t("shot.samePhotoBadge");
  const d = parseDuration(sh.offset);
  return d === null ? t("shot.otherPhotoBadge") : formatDuration(d, true);
}
