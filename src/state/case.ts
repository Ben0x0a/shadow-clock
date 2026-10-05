/**
 * case.ts — the working case (form text) shared by every feature, and its tab copy.
 *
 * Defines: CaseStore (state + subscribe/update/replace), loadCase(), saveCaseSoon(),
 *          untouched().
 * Used by: main.ts (creates the store), features/* (read and edit the case),
 *          state/solve.ts.
 * Depends on: core/form.ts (AppState, parseCase); the platform (sessionStore).
 *
 * Privacy: the case lives in sessionStorage only (this tab, until it closes or the user
 * chooses "Clear all local data" in the Privacy dialog). It reaches a URL only through
 * the explicit Share action (features/share-export).
 */

import type { Platform } from "static-web-platform";
import { type AppState, parseCase } from "../core/form.ts";

type Listener = (s: AppState, structural: boolean) => void;

/** Holds the case; `structural` tells views whether they must rebuild their DOM. */
export class CaseStore {
  state: AppState;
  private readonly listeners: Listener[] = [];

  constructor(state: AppState) {
    this.state = state;
  }

  subscribe(l: Listener): void {
    this.listeners.push(l);
  }

  /** Mutate in place; structural = the set/shape of controls changed. */
  update(fn: (s: AppState) => void, structural = false): void {
    fn(this.state);
    for (const l of this.listeners) l(this.state, structural);
  }

  replace(s: AppState): void {
    this.state = s;
    for (const l of this.listeners) l(this.state, true);
  }
}

const CASE_KEY = "case";

/** The case saved in this tab, validated; null when none or unreadable. */
export function loadCase(platform: Platform, shotLabel: (n: number) => string): AppState | null {
  const raw = platform.sessionStore.get(CASE_KEY);
  if (!raw) return null;
  try {
    return parseCase(JSON.parse(raw), shotLabel);
  } catch {
    return null;   // a corrupt copy is ignored, never fatal
  }
}

let saveTimer = 0;
/** Saves the case to this tab's sessionStorage, debounced (typing saves once). */
export function saveCaseSoon(platform: Platform, s: AppState): void {
  clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => platform.sessionStore.set(CASE_KEY, JSON.stringify(s)), 400);
}

/** True while nothing has been entered: the guided view then shows the start screen. */
export function untouched(s: AppState): boolean {
  return !s.site.loc.trim() && s.shots.every((x) => !Object.values(x.f).some((v) => v.trim()) && !x.time.trim() && !x.az.trim());
}
