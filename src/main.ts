/**
 * main.ts — application entry point: wires state, panels, solver jobs and results.
 *
 * Defines: the app bootstrap (no exports).
 * Used by: index.html.
 * Depends on: ui/state.ts, ui/request.ts, ui/jobs.ts, ui/panels/*, ui/results/*,
 *             ui/examples.ts, ui/report.ts, ui/dom.ts.
 *
 * Flow: every state change → (structural? rebuild panels) → debounced: rebuild the
 * request → inline validation → worker job → results view.
 *
 * Privacy: the address bar never carries case data. A shared calculation link (#payload)
 * is loaded and then stripped from the URL; the working case survives reloads through
 * sessionStorage (this tab only, cleared when the tab closes). Only the explicit
 * "Copy link to this calculation" action puts the data into a URL.
 */

import "./styles.css";
import type { LocationSolveRequest, TimeSolveRequest } from "./core/models";
import { h, icon, segmented } from "./ui/dom";
import { EXAMPLES } from "./ui/examples";
import { JobRunner } from "./ui/jobs";
import { renderAdvanced } from "./ui/panels/advanced";
import { renderClaim, updateClaim } from "./ui/panels/claim";
import { renderConstraints } from "./ui/panels/constraints";
import { openStepFor, renderGuided, renderLanding, resetGuided } from "./ui/guided";
import { renderShots } from "./ui/panels/shots";
import { renderSearchArea, renderSite } from "./ui/panels/site";
import { exportReport, printReport, type Solved } from "./ui/report";
import { buildPlaceRequest, buildTimeRequest, type FieldError } from "./ui/request";
import { PlaceResultsView } from "./ui/results/placeResults";
import { TimeResultsView } from "./ui/results/timeResults";
import { type AppState, decodeState, defaultState, encodeState, type Mode, Store } from "./ui/state";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

// ---- State ------------------------------------------------------------------------------
const SESSION_KEY = "shadowclock.case";

/** Link to the tool itself, without any case data. */
const cleanUrl = () => `${location.origin}${location.pathname}`;

/** Reads a shared payload from the hash, then removes it from the address bar and history. */
function takeHashState(): AppState | null {
  if (location.hash.length <= 1) return null;
  const s = decodeState(location.hash.slice(1));
  // WHY: leaving the payload in the address bar invites accidental leaks (copying the
  // URL, bookmarks, screenshots); replaceState also removes it from this history entry.
  history.replaceState(null, "", cleanUrl() + location.search);
  return s;
}

function readSession(): AppState | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? decodeState(raw) : null;
  } catch {
    return null;
  }
}

const store = new Store(takeHashState() ?? readSession() ?? defaultState());
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

// ---- View: guided (default) or expert ---------------------------------------------------
const VIEW_KEY = "shadowclock.view";
let expert = false;
try {
  expert = localStorage.getItem(VIEW_KEY) === "expert";
} catch {
  /* default: guided */
}
const expertToggle = $<HTMLInputElement>("expert-toggle");
expertToggle.checked = expert;
expertToggle.addEventListener("change", () => {
  expert = expertToggle.checked;
  try {
    localStorage.setItem(VIEW_KEY, expert ? "expert" : "guided");
  } catch {
    /* preference not persisted */
  }
  timeView.evidence.open = expert;
  placeView.evidence.open = expert;
  renderInputs();
});

/** True while nothing has been entered: the guided view then shows the start screen. */
function untouched(s: AppState): boolean {
  return !s.site.loc.trim() && s.shots.every((x) => !Object.values(x.f).some((v) => v.trim()) && !x.time.trim() && !x.az.trim());
}
let started = !untouched(store.state);

function exampleButtons(): HTMLElement {
  return h("div", { class: "example-buttons" }, EXAMPLES.map((e, i) => h("button", { type: "button", class: "btn ghost", title: e.description, onclick: () => loadExample(i) }, e.label)));
}

function renderInputs(): void {
  const s = store.state;
  if (!expert) {
    if (!started) {
      renderLanding(inputs, (m) => {
        started = true;
        resetGuided();
        store.update((st) => (st.mode = m), true);
      }, exampleButtons());
      return;
    }
    const steps = h("div", { class: "stepper" });
    renderGuided(steps, store, invalid, renderInputs);
    const adv = h("div");
    renderAdvanced(adv, store, invalid);
    inputs.replaceChildren(steps, h("details", { class: "panel advanced" }, h("summary", null, h("h2", null, "Settings")), adv));
    return;
  }
  const blocks: HTMLElement[] = [];
  const shots = h("div", { class: "shots" });
  renderShots(shots, store, invalid, { variant: "expert", intro: true, add: true });
  if (s.mode === "time") {
    const site = h("div");
    renderSite(site, store, invalid);
    const cons = h("div");
    renderConstraints(cons, store, invalid);
    blocks.push(
      panel(1, "Where was it taken?", site, "p-site"),
      panel(2, "Shadows", shots, "p-shots"),
      panel(3, "What do you already know?", cons, "p-cons"),
    );
  } else {
    const area = h("div");
    renderSearchArea(area, store, invalid);
    blocks.push(panel(1, "Shadows and their times", shots, "p-shots"), panel(2, "Search area", area, "p-area"));
  }
  const adv = h("div");
  renderAdvanced(adv, store, invalid);
  blocks.push(h("details", { class: "panel advanced" }, h("summary", null, h("h2", null, "Settings")), adv));
  inputs.replaceChildren(...blocks);
}

// Claimed-time check: lives in the results, right under the answer (time mode).
const claimBody = h("div");
const claimSlot = h(
  "details",
  { class: "card result claim-card" },
  h("summary", null, h("span", null, h("strong", null, "Does a claimed time match?"), h("small", null, "EXIF, post date, witness…"))),
  claimBody,
);
function renderClaimSlot(): void {
  renderClaim(claimBody, store, invalid, scheduleClaim);
  if (store.state.claim.time.trim()) claimSlot.open = true;
}

// ---- Results ----------------------------------------------------------------------------
const body = $("results-body");
const timeView = new TimeResultsView(claimSlot);
const placeView = new PlaceResultsView();
timeView.evidence.open = expert;
placeView.evidence.open = expert;
const progress = $<HTMLProgressElement>("progress");
const statusText = $("status-text");

function setStatus(text: string, fraction: number | null = null): void {
  statusText.textContent = text;
  progress.hidden = fraction === null;
  if (fraction !== null) progress.value = fraction;
}

function emptyState(errors: FieldError[]): HTMLElement | null {
  const s = store.state;
  // Guided start screen: nothing to show on the results side yet.
  if (!expert && !started) return null;
  return h(
    "section",
    { class: "card result empty" },
    untouched(s)
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
          // WHY: the guided start screen already offers the examples; avoid showing them twice.
          ...(!expert && !started ? [] : [h("p", { class: "hint" }, "Or start from an example:"), exampleButtons()]),
        ]
      : [
          h("h3", null, "Still needed"),
          h("ul", { class: "todo" }, [...new Map(errors.map((e) => [e.msg, e])).values()].slice(0, 8).map((e) => h("li", null, h("button", { type: "button", class: "link", onclick: () => focusField(e.key) }, e.msg)))),
        ],
  );
}

function focusField(key: string): void {
  if (!expert) {
    // The field may sit in a collapsed step: open that step first.
    openStepFor(store.state, key);
    renderInputs();
  }
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
    const empty = emptyState(built.errors);
    body.replaceChildren(...(empty ? [empty] : []));
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
let saveTimer = 0;
function scheduleSave(): void {
  clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    try {
      sessionStorage.setItem(SESSION_KEY, encodeState(store.state));
    } catch {
      /* storage unavailable: the case simply does not survive a reload */
    }
  }, 400);
}

// ---- Wiring -----------------------------------------------------------------------------
store.subscribe((_s, structural) => {
  if (structural) {
    renderModeSwitch();
    renderInputs();
    renderClaimSlot();
  }
  scheduleSolve();
  scheduleSave();
  scheduleClaim();
});

function loadExample(i: number): void {
  const e = EXAMPLES[i];
  started = true;
  resetGuided();
  store.replace(e.build());
  ($("examples-menu") as HTMLDetailsElement).open = false;
  toast(`Example loaded — true answer: ${e.description}`);
}

$("examples-list").replaceChildren(
  ...EXAMPLES.map((e, i) =>
    h("button", { type: "button", role: "menuitem", onclick: () => loadExample(i) }, h("strong", null, e.label), h("small", null, e.description)),
  ),
);

($("share-menu").querySelector("summary") as HTMLElement).append(icon("share"));
async function copyLink(url: string, done: string): Promise<void> {
  ($("share-menu") as HTMLDetailsElement).open = false;
  try {
    await navigator.clipboard.writeText(url);
    toast(done);
  } catch {
    // WHY: never fall back to writing the payload into the address bar.
    window.prompt("Copy this link:", url);
  }
}
$("share-tool").addEventListener("click", () => void copyLink(cleanUrl(), "Link to the tool copied — it contains no case data."));
$("share-calc").addEventListener("click", () =>
  void copyLink(`${cleanUrl()}#${encodeState(store.state)}`, "Calculation link copied. It contains all your inputs — share it with care."),
);

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
  if (confirm("Start a new case? The current inputs will be cleared.")) {
    started = false;
    resetGuided();
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

// A calculation link pasted into this tab's address bar: load it, then clean the URL.
window.addEventListener("hashchange", () => {
  const s = takeHashState();
  if (s && JSON.stringify(s) !== JSON.stringify(store.state)) store.replace(s);
});

renderModeSwitch();
renderInputs();
renderClaimSlot();
solve();
