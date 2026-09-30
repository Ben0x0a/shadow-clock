/**
 * dom.ts — minimal DOM construction helpers (no framework).
 *
 * Defines: h() element builder, segmented() radio group, field() labelled input, svg(),
 *          info() "i" button with a popover explanation.
 * Used by: every module under ui/.
 * Depends on: nothing.
 *
 * WHY: the page is small enough that a framework would add more weight than it saves;
 * these helpers keep markup readable while using native elements (radio groups, labels,
 * <details>, <dialog>) so keyboard and screen-reader behaviour come for free.
 */

type Child = Node | string | number | null | undefined | false;
type Props = Record<string, unknown>;

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Props | null = null,
  ...children: (Child | Child[])[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v === undefined || v === null || v === false) continue;
      if (k === "class") el.className = String(v);
      else if (k === "style" && typeof v === "object") Object.assign(el.style, v);
      else if (k.startsWith("on") && typeof v === "function") {
        el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
      } else if (k === "dataset" && typeof v === "object") Object.assign(el.dataset, v);
      else if (k in el && typeof v !== "string") (el as unknown as Record<string, unknown>)[k] = v;
      else el.setAttribute(k, v === true ? "" : String(v));
    }
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : String(c));
  }
  return el;
}

const SVG_NS = "http://www.w3.org/2000/svg";

export function svg(tag: string, attrs: Record<string, string | number> = {}, ...children: (SVGElement | string)[]): SVGElement {
  const el = document.createElementNS(SVG_NS, tag) as SVGElement;
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  for (const c of children) el.append(c);
  return el;
}

let uid = 0;
export const nextId = (p = "f") => `${p}-${++uid}`;

/**
 * A segmented control built from a native radio group (arrow keys, focus and
 * screen-reader semantics come from the browser).
 */
export function segmented<T extends string>(
  name: string,
  label: string,
  options: { value: T; label: string; title?: string }[],
  value: T,
  onChange: (v: T) => void,
  extraClass = "",
): HTMLElement {
  const group = nextId(name);
  return h(
    "div",
    { class: `seg ${extraClass}`, role: "radiogroup", "aria-label": label },
    options.map((o) => {
      const id = nextId(name);
      return h(
        "span",
        { class: "seg-item" },
        h("input", {
          type: "radio",
          id,
          name: group,
          value: o.value,
          checked: o.value === value,
          onchange: () => onChange(o.value),
        }),
        h("label", { for: id, title: o.title }, o.label),
      );
    }),
  );
}

export interface FieldOpts {
  label: string;
  value: string;
  onInput: (v: string) => void;
  placeholder?: string;
  hint?: string;
  suffix?: string;
  inputmode?: string;
  invalid?: boolean;
  wide?: boolean;
  list?: string;
  name?: string;
  autocomplete?: string;
  type?: string;
  /** Longer explanation behind an "i" button next to the label. */
  info?: string;
}

/** A labelled text input with optional unit suffix and hint. */
export function field(o: FieldOpts): HTMLElement {
  const id = nextId("in");
  const hintId = o.hint ? `${id}-hint` : undefined;
  const input = h("input", {
    id,
    type: o.type ?? "text",
    value: o.value,
    placeholder: o.placeholder,
    inputmode: o.inputmode ?? "decimal",
    autocomplete: o.autocomplete ?? "off",
    spellcheck: "false",
    list: o.list,
    "aria-describedby": hintId,
    "aria-invalid": o.invalid ? "true" : undefined,
    oninput: (e: Event) => o.onInput((e.target as HTMLInputElement).value),
  });
  if (o.name) input.dataset.field = o.name;
  return h(
    "div",
    { class: `field${o.wide ? " wide" : ""}` },
    o.info ? h("div", { class: "label-row" }, h("label", { for: id }, o.label), info(o.label, o.info)) : h("label", { for: id }, o.label),
    h("div", { class: "input-wrap" }, input, o.suffix ? h("span", { class: "suffix", "aria-hidden": "true" }, o.suffix) : null),
    o.hint ? h("small", { id: hintId, class: "hint" }, o.hint) : null,
  );
}

/**
 * A small "i" button that opens a short explanation. Uses the native Popover API, so
 * light-dismiss, Escape, focus return and top-layer stacking come from the browser.
 * WHY: keeps the forms short; details are one tap away instead of always on screen.
 */
export function info(title: string, ...content: (string | Node)[]): HTMLElement {
  const id = nextId("pop");
  return h(
    "span",
    { class: "info" },
    h("button", { type: "button", class: "info-btn", popovertarget: id, "aria-label": `More about ${title}`, title: "More information" }, "i"),
    h(
      "div",
      { id, popover: "auto", class: "info-pop", role: "note" },
      h("strong", null, title),
      ...content.map((c) => (typeof c === "string" ? h("p", null, c) : c)),
      h("button", { type: "button", class: "btn small", popovertarget: id, popovertargetaction: "hide" }, "Got it"),
    ),
  );
}

export function icon(name: keyof typeof ICONS, size = 18): SVGElement {
  const el = svg("svg", { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": 2, "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true" });
  el.innerHTML = ICONS[name];
  return el;
}

const ICONS = {
  plus: '<path d="M12 5v14M5 12h14"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>',
  share: '<path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7M16 6l-4-4-4 4M12 2v14"/>',
  download: '<path d="M4 17v2a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-2M7 11l5 5 5-5M12 4v12"/>',
  print: '<path d="M6 9V3h12v6M6 18H4v-7h16v7h-2M8 14h8v7H8z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
  auto: '<circle cx="12" cy="12" r="9"/><path d="M12 3v18" /><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor"/>',
  help: '<circle cx="12" cy="12" r="10"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01"/>',
  copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"/>',
  pin: '<path d="M12 22s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12z"/><circle cx="12" cy="10" r="2.5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  warn: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  locate: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/><circle cx="12" cy="12" r="8"/>',
  book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z"/><path d="M4 19.5V21h16"/>',
};

/** replaceChildren() that skips null/false children (for conditional content). */
export function replace(el: Element, ...children: (Child | Child[])[]): void {
  const out: (Node | string)[] = [];
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    out.push(c instanceof Node ? c : String(c));
  }
  el.replaceChildren(...out);
}
