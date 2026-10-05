/**
 * toolbar.ts — feature "toolbar": on phones the header actions fold behind one Menu
 * button; header menus (<details class="menu">) close on outside click and Escape.
 *
 * Defines: mountToolbar().
 * Used by: main.ts.
 * Depends on: ui/dom.ts, ui/context.ts.
 */

import { t } from "../../ui/context.ts";
import { icon } from "../../ui/dom.ts";
import "./toolbar.css";

function closeMenus(except?: Node): void {
  document.querySelectorAll<HTMLDetailsElement>("details.menu[open]").forEach((d) => {
    if (!except || !d.contains(except)) d.open = false;
  });
}

/** `header` gets the "menu-open" class; `button` toggles the folded `toolbar`. */
export function mountToolbar(header: HTMLElement, button: HTMLButtonElement, toolbar: HTMLElement): void {
  button.append(icon("menu"));
  button.setAttribute("aria-label", t("app.menu"));
  button.setAttribute("aria-controls", toolbar.id);
  button.setAttribute("aria-expanded", "false");
  button.addEventListener("click", () => {
    const open = !header.classList.contains("menu-open");
    header.classList.toggle("menu-open", open);
    button.setAttribute("aria-expanded", String(open));
  });
  // Native <details> menus do not close by themselves: close them on a click elsewhere,
  // and when keyboard focus leaves them (an open menu must not cover the focused element).
  document.addEventListener("click", (e) => closeMenus(e.target as Node));
  document.addEventListener("focusin", (e) => closeMenus(e.target as Node));
  // WHY a keydown listener here: Escape is not a single-character shortcut (WCAG 2.1.4
  // concerns printable keys), and it only closes what is open.
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeMenus();
  });
}
