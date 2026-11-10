/**
 * message.ts — renders core messages with a given translate function, and the message for
 * a claimed time's level.
 *
 * Defines: Translate, renderMessage(), claimLevel().
 * Used by: api/messages.ts (formatMessage: the command line's table), ui/context.ts (tm:
 *          the page's table), features/claim, cli/text.ts.
 * Depends on: core/models.ts (Message).
 *
 * WHY in core with the translate function passed in: the page and the command line must
 * render messages identically, yet ui/ may not import api/; the core still has no string
 * table of its own (the texts live in api/messages.ts).
 */

import type { Message } from "./models.ts";

export type Translate = (key: string, vars?: Record<string, string | number>) => string;

/** Renders a message (key + values, values possibly messages themselves). */
export function renderMessage(m: Message, tr: Translate): string {
  const vars: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(m.vars ?? {})) vars[k] = typeof v === "object" ? renderMessage(v, tr) : v;
  const text = tr(m.key, vars);
  return m.shot ? tr("msg.forShadow", { shot: m.shot, text }) : text;
}

/** Where a claimed time lies: outside, inside every bound, or the smallest region containing it. */
export function claimLevel(acceptedLevel: number | null): Message {
  if (acceptedLevel === null) return { key: "claim.outside" };
  if (acceptedLevel === 1) return { key: "claim.insideBounds" };
  return { key: "claim.insideLevel", vars: { pct: (acceptedLevel * 100).toFixed(acceptedLevel > 0.99 ? 1 : 0) } };
}
