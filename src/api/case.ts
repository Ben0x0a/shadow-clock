/**
 * case.ts — reads a case from bytes: a saved case, or the inputs of an exported report.
 *
 * Defines: ApiResult, readCase(), shotLabel().
 * Used by: api/operations.ts, cli/main.ts.
 * Depends on: core/form.ts (parseCase), api/messages.ts.
 *
 * HOW: the bytes must be UTF-8 JSON. A JSON report exported by the page
 * (`*.shadowclock.report.json`) carries the exact form inputs under `inputs`, so it is
 * accepted as is: a result can be re-run from its own report. Anything else goes through
 * parseCase(), which keeps only known fields of the right type (untrusted input).
 */

import { type AppState, parseCase } from "../core/form.ts";
import type { Message } from "../core/models.ts";
import { translate } from "./messages.ts";

/**
 * What every operation returns. The failure shape is the command line's (stable `code`,
 * readable `message`); `messages` keeps the individual messages for the page.
 */
export type ApiResult<T> =
  | { ok: true; value: T }
  | { ok: false; code: string; message: string; messages?: Message[] };

/** Default name of shadow n, as the page names it. */
export const shotLabel = (n: number): string => translate("shot.default", { n });

export function readCase(bytes: Uint8Array): ApiResult<AppState> {
  let raw: unknown;
  try {
    raw = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    return { ok: false, code: "not-json", message: "The input is not UTF-8 JSON." };
  }
  // WHY check `application` too: a case has no `inputs` key, so only a report matches.
  const isReport = typeof raw === "object" && raw !== null && "application" in raw && "inputs" in raw;
  const state = parseCase(isReport ? (raw as { inputs: unknown }).inputs : raw, shotLabel);
  return state
    ? { ok: true, value: state }
    : { ok: false, code: "not-a-case", message: "The input is not a ShadowClock case (version 1) or report." };
}
