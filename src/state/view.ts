/**
 * view.ts — how the inputs are presented: guided or expert, and whether the guided
 * start screen has been left.
 *
 * Defines: ViewState (expert, started; subscribe/set).
 * Used by: main.ts, features/inputs (both), features/results (evidence open in expert).
 * Depends on: the platform (store: the expert choice is remembered on this device).
 */

import type { Platform } from "static-web-platform";

const VIEW_KEY = "view";

type Listener = () => void;

export class ViewState {
  expert: boolean;
  started: boolean;
  private readonly platform: Platform;
  private readonly listeners: Listener[] = [];

  constructor(platform: Platform, started: boolean) {
    this.platform = platform;
    this.expert = platform.store.get(VIEW_KEY) === "expert";
    this.started = started;
  }

  subscribe(l: Listener): void {
    this.listeners.push(l);
  }

  setExpert(on: boolean): void {
    this.expert = on;
    this.platform.store.set(VIEW_KEY, on ? "expert" : "guided");
    for (const l of this.listeners) l();
  }

  /** Leaves (true) or returns to (false) the guided start screen. */
  setStarted(on: boolean): void {
    this.started = on;
    for (const l of this.listeners) l();
  }
}
