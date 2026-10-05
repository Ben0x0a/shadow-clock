/**
 * toast.ts — a short confirmation message ("Example loaded", "Link copied").
 *
 * Defines: toast().
 * Used by: features/examples, features/share-export.
 * Depends on: ui/dom.ts.
 *
 * WHY not platform.setStatus(): the platform's status line carries lasting information
 * (e.g. "Offline copy — version X"); a toast disappears on its own. role="status" makes
 * screen readers announce it without moving focus.
 */

import { h } from "./dom.ts";
import "./toast.css";

let box: HTMLElement | null = null;
let timer = 0;

export function toast(msg: string): void {
  if (!box) {
    box = h("div", { class: "toast", role: "status", "aria-live": "polite", hidden: true });
    document.body.append(box);
    // WHY: a toast must never cover the focused element (WCAG 2.4.11); it has been
    // announced already, so moving focus simply dismisses it.
    const el = box;
    document.addEventListener("focusin", () => (el.hidden = true));
  }
  const el = box;
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(timer);
  timer = window.setTimeout(() => (el.hidden = true), 2600);
}
