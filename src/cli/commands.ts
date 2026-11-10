/**
 * commands.ts — the command line's commands, in workflow order (the spec startCli runs).
 *
 * Defines: SPEC.
 * Used by: cli/main.ts (startCli), tests/cli.test.ts (runCli with in-memory I/O).
 * Depends on: static-web-platform/cli (CliSpec type), api/ (operations), cli/text.ts.
 *
 * HOW: each command is a thin adapter: read the case from the input file, call one api/
 * operation, return its result. Input is a case saved from the page or an exported
 * `*.shadowclock.report.json` (its inputs are re-solved).
 * Not on the command line: the maps and charts (display only; the JSON carries their
 * data) and the guided steps (an input aid).
 * WHY apart from main.ts: main.ts starts the Deno I/O when loaded; the spec alone can be
 * tested under Node.
 */

import type { CliSpec } from "static-web-platform/cli";
import { type ApiResult, checkClaim, type ClaimValue, example, EXAMPLE_NAMES, findPlace, findTime, type PlaceValue, readCase, type TimeValue } from "../api/index.ts";
import type { AppState } from "../core/form.ts";
import { claimText, placeText, timeText } from "./text.ts";

/** Reads the case, then runs the operation on it. */
function onCase<T>(op: (s: AppState) => ApiResult<T>) {
  return (bytes: Uint8Array | null) => {
    const c = readCase(bytes ?? new Uint8Array());
    return c.ok ? op(c.value) : c;
  };
}

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
      run: onCase(findTime),
      text: (v) => timeText(v as TimeValue),
    },
    {
      name: "find-place",
      summary: "Shadows at known times → the compatible places",
      input: "file",
      run: onCase(findPlace),
      text: (v) => placeText(v as PlaceValue),
    },
    {
      name: "check-claim",
      summary: "Is the case's claimed time (EXIF, witness) consistent with the shadows?",
      input: "file",
      run: onCase(checkClaim),
      text: (v) => claimText(v as ClaimValue),
    },
  ],
};
