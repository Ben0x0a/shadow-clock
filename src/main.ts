/**
 * main.ts — application entry point: wires state, panels, solver jobs and results.
 *
 * Defines: the app bootstrap (no exports).
 * Used by: index.html.
 * Depends on: ui/state.ts, ui/request.ts, ui/jobs.ts, ui/panels/*, ui/results/*,
 *             ui/examples.ts, ui/report.ts, ui/dom.ts.
 *
 * Flow: every state change → (structural? rebuild panels) → debounced: rebuild the
 * request → inline validation → worker job → results view. The URL hash is refreshed
 * with history.replaceState, so reloads keep the case without adding history entries.
 */

import "./styles.css";
import type { LocationSolveRequest, TimeSolveRequest } from "./core/models";
import { h, icon, segmented } from "./ui/dom";
import { EXAMPLES } from "./ui/examples";
import { JobRunner } from "./ui/jobs";
import { renderAdvanced } from "./ui/panels/advanced";
import { renderClaim, updateClaim } from "./ui/panels/claim";
import { renderConstraints } from "./ui/panels/constraints";
import { renderShots } from "./ui/panels/shots";
import { renderSearchArea, renderSite } from "./ui/panels/site";
import { exportReport, printReport, type Solved } from "./ui/report";
import { buildPlaceRequest, buildTimeRequest, type FieldError } from "./ui/request";
import { PlaceResultsView } from "./ui/results/placeResults";
import { TimeResultsView } from "./ui/results/timeResults";
import { type AppState, decodeState, defaultState, encodeState, type Mode, Store } from "./ui/state";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

// ---- State ------------------------------------------------------------------------------
const fromHash = location.hash.length > 1 ? decodeState(location.hash.slice(1)) : null;
const store = new Store(fromHash ?? defaultState());
let invalid = new Set<string>();
let solved: Solved | null = null;

// ---- Theme ------------------------------------------------------------------------------
type Theme = "auto" | "light" | "dark";
const THEME_KEY = "shadowclock.theme";
function readTheme(): Theme {
  try {
    return (localStorage.getItem(THEME_KEY) as Theme) ?? "auto";
  } catch {
    return "auto";
  }
}
function applyTheme(t: Theme): void {
  if (t === "auto") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = t;
  const btn = $("theme-btn");
  btn.replaceChildren(icon(t === "dark" ? "moon" : t === "light" ? "sun" : "auto"));
  btn.title = `Theme: ${t} (click to change)`;
}
let theme = readTheme();
applyTheme(theme);
$("theme-btn").addEventListener("click", () => {
  theme = theme === "auto" ? "light" : theme === "light" ? "dark" : "auto";
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    /* preference not persisted */
  }
  applyTheme(theme);
  rerenderResults();
});

// ---- Toast ------------------------------------------------------------------------------
let toastTimer = 0;
function toast(msg: string): void {
  const t = $("toast");
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (t.hidden = true), 2200);
}

// ---- Panels -----------------------------------------------------------------------------
const inputs = $("inputs");

function panel(n: number | null, title: string, body: HTMLElement, id: string, extraClass = ""): HTMLElement {
  return h(
    "section",
    { class: `panel ${extraClass}`, "aria-labelledby": `${id}-h` },
    h("h2", { id: `${id}-h` }, n !== null ? h("span", { class: "step", "aria-hidden": "true" }, String(n)) : null, title),
    body,
  );
}

function renderModeSwitch(): void {
  $("mode-switch").replaceChildren(
    segmented<Mode>("mode", "Mode", [
      { value: "time", label: "Find the time", title: "Known place → when was it taken?" },
      { value: "place", label: "Find the place", title: "Known times → where was it taken?" },
    ], store.state.mode, (m) => store.update((s) => (s.mode = m), true), "large"),
  );
}

function renderInputs(): void {
  const s = store.state;
  const blocks: HTMLElement[] = [];
  const shots = h("div", { class: "shots" });
  renderShots(shots, store, invalid);
  if (s.mode === "time") {
    const site = h("div");
    renderSite(site, store, invalid);
    const cons = h("div");
    renderConstraints(cons, store, invalid);
    const claim = h("div");
    renderClaim(claim, store, invalid, scheduleClaim);
    blocks.push(
      panel(1, "Where was it taken?", site, "p-site"),
      panel(2, "Shadows", shots, "p-shots"),
      panel(3, "What do you already know?", cons, "p-cons"),
      panel(4, "Check a claimed time", claim, "p-claim", "optional"),
    );
  } else {
    const area = h("div");
    renderSearchArea(area, store, invalid);
    blocks.push(panel(1, "Shadows and their times", shots, "p-shots"), panel(2, "Search area", area, "p-area"));
  }
  const adv = h("div");
  renderAdvanced(adv, store, invalid);
  blocks.push(h("details", { class: "panel advanced" }, h("summary", null, h("h2", null, "Advanced settings")), adv));
  inputs.replaceChildren(...blocks);
}

// ---- Results ----------------------------------------------------------------------------
const body = $("results-body");
const timeView = new TimeResultsView();
const placeView = new PlaceResultsView();
const progress = $<HTMLProgressElement>("progress");
const statusText = $("status-text");

function setStatus(text: string, fraction: number | null = null): void {
  statusText.textContent = text;
  progress.hidden = fraction === null;
  if (fraction !== null) progress.value = fraction;
}

function emptyState(errors: FieldError[]): HTMLElement {
  const s = store.state;
  const untouched = s.mode === "time" ? !s.site.loc.trim() && s.shots.every((x) => !Object.values(x.f).some((v) => v.trim())) : s.shots.every((x) => !x.time.trim());
  return h(
    "section",
    { class: "card result empty" },
    untouched
      ? [
          h("h3", null, s.mode === "time" ? "When was this photo taken?" : "Where was this photo taken?"),
          h(
            "ol",
            { class: "steps" },
            s.mode === "time"
              ? [
                  h("li", null, "Enter the place (paste coordinates or a map link)."),
                  h("li", null, "Measure a vertical object and its shadow — add more objects or photos to sharpen the result."),
                  h("li", null, "Say what you already know: years, months, time of day."),
                ]
              : [
                  h("li", null, "Measure a shadow in each photo and give the time each was taken."),
                  h("li", null, "Two or more photos at different times cross to a small area."),
                ],
          ),
          h("p", { class: "hint" }, "Or start from an example:"),
          h("div", { class: "example-buttons" }, EXAMPLES.map((e, i) => h("button", { type: "button", class: "btn ghost", title: e.description, onclick: () => loadExample(i) }, e.label))),
        ]
      : [
          h("h3", null, "Almost there"),
          h("p", { class: "hint" }, "To compute, complete:"),
          h("ul", { class: "todo" }, [...new Map(errors.map((e) => [e.msg, e])).values()].slice(0, 8).map((e) => h("li", null, h("button", { type: "button", class: "link", onclick: () => focusField(e.key) }, e.msg)))),
        ],
  );
}

function focusField(key: string): void {
  const el = inputs.querySelector<HTMLElement>(`[data-field="${CSS.escape(key)}"]`);
  if (!el) return;
  el.closest("details")?.setAttribute("open", "");
  el.focus();
  el.scrollIntoView({ block: "center", behavior: "smooth" });
}

function markInvalid(errors: FieldError[]): void {
  invalid = new Set(errors.map((e) => e.key));
  inputs.querySelectorAll<HTMLInputElement>("[data-field]").forEach((el) => {
    // WHY only non-empty fields: an empty form is not an error, just unfinished.
    const bad = invalid.has(el.dataset.field as string) && el.value.trim() !== "";
    if (bad) el.setAttribute("aria-invalid", "true");
    else el.removeAttribute("aria-invalid");
  });
}

function rerenderResults(): void {
  if (!solved) return;
  if (solved.mode === "time") timeView.render(solved.res, solved.req);
  else placeView.render(solved.res, solved.req);
}

const jobs = new JobRunner();
let solveTimer = 0;
function scheduleSolve(): void {
  clearTimeout(solveTimer);
  solveTimer = window.setTimeout(solve, 350);
}

function solve(): void {
  const s = store.state;
  const built = s.mode === "time" ? buildTimeRequest(s) : buildPlaceRequest(s);
  markInvalid(built.ok ? [] : built.errors);
  if (!built.ok) {
    solved = null;
    setStatus("");
    body.replaceChildren(emptyState(built.errors));
    return;
  }
  const view = s.mode === "time" ? timeView.el : placeView.el;
  if (body.firstChild !== view) body.classList.add("stale");
  setStatus("Computing…", 0);
  const req = built.req;
  jobs.run(s.mode === "time" ? { kind: "time", req: req as TimeSolveRequest } : { kind: "place", req: req as LocationSolveRequest }, {
    progress: (f, phase) => setStatus(phase, f),
    done: (m) => {
      body.classList.remove("stale");
      setStatus("");
      if (m.type === "time") {
        solved = { mode: "time", req: req as TimeSolveRequest, res: m.result };
        if (body.firstChild !== timeView.el) body.replaceChildren(timeView.el);
        timeView.render(m.result, req as TimeSolveRequest);
        scheduleClaim();
      } else {
        solved = { mode: "place", req: req as LocationSolveRequest, res: m.result };
        if (body.firstChild !== placeView.el) body.replaceChildren(placeView.el);
        placeView.render(m.result, req as LocationSolveRequest);
      }
    },
    error: (e) => {
      body.classList.remove("stale");
      setStatus("");
      solved = null;
      body.replaceChildren(h("section", { class: "card result empty" }, h("h3", null, "Cannot compute yet"), h("p", null, e)));
    },
  });
}

let claimTimer = 0;
function scheduleClaim(): void {
  clearTimeout(claimTimer);
  claimTimer = window.setTimeout(() => {
    if (store.state.mode !== "time") return;
    const b = buildTimeRequest(store.state);
    const zone = b.ok ? b.req.constraints.zone : { kind: "utc" as const };
    const lon = b.ok ? b.req.site.lon : 0;
    updateClaim(store, zone, lon, solved?.mode === "time" ? solved.res : null);
  }, 250);
}

// ---- Persistence ------------------------------------------------------------------------
let hashTimer = 0;
function scheduleHash(): void {
  clearTimeout(hashTimer);
  hashTimer = window.setTimeout(() => history.replaceState(null, "", `#${encodeState(store.state)}`), 500);
}

// ---- Wiring -----------------------------------------------------------------------------
store.subscribe((_s, structural) => {
  if (structural) {
    renderModeSwitch();
    renderInputs();
  }
  scheduleSolve();
  scheduleHash();
  scheduleClaim();
});

function loadExample(i: number): void {
  const e = EXAMPLES[i];
  store.replace(e.build());
  ($("examples-menu") as HTMLDetailsElement).open = false;
  toast(`Example loaded — true answer: ${e.description}`);
}

$("examples-list").replaceChildren(
  ...EXAMPLES.map((e, i) =>
    h("button", { type: "button", role: "menuitem", onclick: () => loadExample(i) }, h("strong", null, e.label), h("small", null, e.description)),
  ),
);

$("share-btn").append(icon("share"));
$("share-btn").addEventListener("click", async () => {
  history.replaceState(null, "", `#${encodeState(store.state)}`);
  try {
    await navigator.clipboard.writeText(location.href);
    toast("Link copied. It contains the case data in the URL fragment — share it with care.");
  } catch {
    toast("Copy the address bar to share this case.");
  }
});

const exportSummary = $("export-menu").querySelector("summary") as HTMLElement;
exportSummary.append(icon("download"));
$("export-json").addEventListener("click", () => {
  ($("export-menu") as HTMLDetailsElement).open = false;
  void exportReport(store.state, solved);
});
$("export-print").addEventListener("click", () => {
  ($("export-menu") as HTMLDetailsElement).open = false;
  void printReport(store.state);
});
$("new-case").addEventListener("click", () => {
  ($("export-menu") as HTMLDetailsElement).open = false;
  if (confirm("Start a new case? The current inputs will be cleared (the link you copied still restores them).")) {
    store.replace(defaultState());
  }
});

$("help-btn").append(icon("help"));
$("help-btn").addEventListener("click", () => ($("help") as HTMLDialogElement).showModal());

// Close menus when clicking elsewhere (native <details> does not).
document.addEventListener("click", (e) => {
  document.querySelectorAll<HTMLDetailsElement>("details.menu[open]").forEach((d) => {
    if (!d.contains(e.target as Node)) d.open = false;
  });
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") document.querySelectorAll<HTMLDetailsElement>("details.menu[open]").forEach((d) => (d.open = false));
});

window.addEventListener("hashchange", () => {
  const s = location.hash.length > 1 ? decodeState(location.hash.slice(1)) : null;
  if (s && JSON.stringify(s) !== JSON.stringify(store.state)) store.replace(s as AppState);
});

renderModeSwitch();
renderInputs();
solve();
