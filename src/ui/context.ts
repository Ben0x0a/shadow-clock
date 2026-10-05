/**
 * context.ts — the running platform, made available to the shared display helpers.
 *
 * Defines: setPlatform(), platform(), t(), tm().
 * Used by: main.ts (setPlatform, once, right after startPlatform()); every ui/ and
 *          features/ module that shows text.
 * Depends on: static-web-platform (Platform type), core/models.ts (Message).
 *
 * WHY a module-level holder: dozens of render helpers need t(); threading the platform
 * through every call would add noise without adding safety. main.ts sets it before
 * any feature mounts, and platform() fails loudly if that order is ever broken.
 */

import type { Platform } from "static-web-platform";
import type { Message } from "../core/models.ts";

let current: Platform | null = null;

export function setPlatform(p: Platform): void {
  current = p;
}

export function platform(): Platform {
  // Invariant: main.ts calls setPlatform() before mounting anything.
  if (!current) throw new Error("ui/context: platform not set (call setPlatform() in main.ts first)");
  return current;
}

/** UI string (strings.ts); a missing key throws (platform i18n). */
export function t(key: string, vars?: Record<string, string | number>): string {
  return platform().t(key, vars);
}

/** Renders a core message (key + values, values possibly messages themselves). */
export function tm(m: Message): string {
  const vars: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(m.vars ?? {})) vars[k] = typeof v === "object" ? tm(v) : v;
  const text = t(m.key, vars);
  return m.shot ? t("msg.forShadow", { shot: m.shot, text }) : text;
}
