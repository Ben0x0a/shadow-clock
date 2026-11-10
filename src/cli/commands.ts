/**
 * commands.ts — the command line's commands, in workflow order (the spec startCli runs).
 *
 * Defines: SPEC.
 * Used by: cli/main.ts (startCli), tests/cli.test.ts (runCli with in-memory I/O).
 * Depends on: static-web-platform/cli (CliSpec type), api/ (operations), cli/text.ts.
 *
 * HOW: each command is a thin adapter: read the case from the input file, call one api/
 * operation, return its result in the exported form (api/results.ts, as the page's report). Input is a case saved from the page or an exported
 * `*.shadowclock.report.json` (its inputs are re-solved).
 * Not on the command line: the maps and charts (display only; the JSON carries their
 * data) and the guided steps (an input aid).
 * WHY apart from main.ts: main.ts starts the Deno I/O when loaded; the spec alone can be
 * tested under Node.
 */

import type { CliSpec } from "static-web-platform/cli";
import {
  type ApiResult, checkClaim, type ClaimValue, example, EXAMPLE_NAMES, exportPlace, exportTime, findPlace, findTime, type PlaceValue,
  readCase, type TimeValue,
} from "../api/index.ts";
import type { AppState } from "../core/form.ts";
import { claimText, placeText, timeText } from "./text.ts";

/** Reads the case, runs the operation on it, and converts the result to its exported form. */
function onCase<T, U>(op: (s: AppState) => ApiResult<T>, out: (v: T) => U) {
  return (bytes: Uint8Array | null): ApiResult<U> => {
    const c = readCase(bytes ?? new Uint8Array());
    if (!c.ok) return c;
    const r = op(c.value);
    return r.ok ? { ok: true, value: out(r.value) } : r;
  };
}

const same = <T>(v: T) => v;

export const SPEC: CliSpec = {
  name: "shadowclock",
  summary: "Time and place from shadows (declared tolerances are hard bounds)",
  commands: [
    {
      name: "example",
      summary: "Write a built-in example case (a starting point to edit)",
      input: "none",
      options: [{ name: "name", description: `example: ${EXAMPLE_NAMES.join(", ")}`, type: "string", default: "paris" }],
      run: (_input, options) => example(String(options.name)),
    },
    {
      name: "find-time",
      summary: "Known place and shadows → the compatible dates and times",
      input: "file",
      run: onCase((s) => findTime(s), exportTime),
      text: (v) => timeText(v as TimeValue),
    },
    {
      name: "find-place",
      summary: "Shadows at known times → the compatible places",
      input: "file",
      run: onCase((s) => findPlace(s), exportPlace),
      text: (v) => placeText(v as PlaceValue),
    },
    {
      name: "check-claim",
      summary: "Is the case's claimed time (EXIF, witness) consistent with the shadows?",
      input: "file",
      run: onCase(checkClaim, same),
      text: (v) => claimText(v as ClaimValue),
    },
  ],
};
