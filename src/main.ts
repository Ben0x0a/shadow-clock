/**
 * main.ts — the app layer: starts the platform, creates the shared state, mounts the
 * features and wires them together. No logic of its own.
 *
 * Defines: nothing exported; runs once on load (bundler entry, site.json "entry").
 * Used by: swp build.
 * Depends on: static-web-platform, strings.ts, core/form.ts, core/examples.ts,
 *             state/*, ui/context.ts, ui/toast.ts, features/*, app.css.
 *
 * Flow: every change of the case → structural? the features rebuild their panels →
 * debounced solve in the worker (state/solve.ts) → the results feature renders it.
 *
 * Privacy: the address bar never carries case data. An opened share link is read once
 * by the platform (already removed from the URL) and validated by core/form.ts; the
 * working case survives reloads only in this tab's sessionStorage.
 */

import { byId, startPlatform } from "static-web-platform";
import type { Example } from "./core/examples.ts";
import { defaultState, parseCase } from "./core/form.ts";
import { CaseStore, loadCase, saveCaseSoon, untouched } from "./state/case.ts";
import { JobRunner, SolveSession } from "./state/solve.ts";
import { ViewState } from "./state/view.ts";
import { STRINGS } from "./strings.ts";
import { setPlatform, t } from "./ui/context.ts";
import { toast } from "./ui/toast.ts";
import { mountClaim } from "./features/claim/claim.ts";
import { exampleButtons, mountExamplesMenu } from "./features/examples/examples.ts";
import { mountHelp } from "./features/help/help.ts";
import { resetGuided } from "./features/inputs/guided.ts";
import { mountExpertToggle, mountInputs } from "./features/inputs/inputs.ts";
import { mountModeTabs } from "./features/mode-tabs/mode-tabs.ts";
import { mountResults } from "./features/results/results.ts";
import { mountShareMenu } from "./features/share-export/menu.ts";
import { mountToolbar } from "./features/toolbar/toolbar.ts";
import "./app.css";

const platform = startPlatform({ strings: STRINGS });
setPlatform(platform);

// ---- Shared state ----------------------------------------------------------------------
const shotLabel = (n: number) => t("shot.default", { n });
const shared = platform.share.incoming !== null ? parseCase(platform.share.incoming, shotLabel) : null;
const cases = new CaseStore(shared ?? loadCase(platform, shotLabel) ?? defaultState(shotLabel(1)));
const view = new ViewState(platform, !untouched(cases.state));
const session = new SolveSession(cases, new JobRunner(() => platform.worker("solver")));
cases.subscribe((s) => {
  session.schedule();
  saveCaseSoon(platform, s);
});

// ---- Static texts ----------------------------------------------------------------------
byId("app-title").textContent = platform.site.title;
byId("tagline").textContent = t("app.tagline");
byId("skip-link").textContent = t("app.skip");
byId("inputs").setAttribute("aria-label", t("app.inputs"));
byId("footer-text").textContent = t("app.footer");
const support = platform.supportLink();
if (support) byId("app-footer").append(support);

// ---- Features --------------------------------------------------------------------------
const loadExample = (e: Example): void => {
  resetGuided();
  view.setStarted(true);
  cases.replace(e.build(t));
  toast(t("toast.example", { answer: t(e.description) }));
};
const examples = () => exampleButtons(loadExample);

const inputs = mountInputs(byId("inputs"), { cases, view, invalid: () => session.invalid, exampleButtons: examples });
session.subscribe((st) => inputs.markInvalid(st.kind === "invalid" ? st.errors : []));
mountResults(byId("results"), {
  cases, view, session,
  claimCard: mountClaim(cases, session),
  exampleButtons: examples,
  focusField: inputs.focusField,
});
mountModeTabs(byId("mode-slot"), byId("workspace"), cases);
mountExpertToggle(byId("expert-slot"), view);
mountExamplesMenu(byId("examples-slot"), loadExample);
mountShareMenu(byId("share-slot"), {
  cases, session,
  newCase: () => {
    resetGuided();
    view.setStarted(false);
    cases.replace(defaultState(shotLabel(1)));
  },
});
mountHelp(byId("help-slot"));
mountToolbar(byId("topbar"), byId<HTMLButtonElement>("menu-btn"), byId("toolbar"));

inputs.render();
session.solve();
