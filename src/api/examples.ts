/**
 * examples.ts — the built-in example cases, by command-line name.
 *
 * Defines: EXAMPLE_NAMES, example().
 * Used by: cli/commands.ts (the `example` command), tests.
 * Depends on: core/examples.ts, api/messages.ts (translate), api/case.ts (ApiResult).
 *
 * WHY apart from operations.ts: the worker imports the operations; keeping the examples
 * (and their texts) out of that module keeps them out of the worker's bundle.
 */

import { EXAMPLES } from "../core/examples.ts";
import type { AppState } from "../core/form.ts";
import type { ApiResult } from "./case.ts";
import { translate } from "./messages.ts";

/** Example names on the command line: the string key without its "ex." prefix. */
export const EXAMPLE_NAMES = EXAMPLES.map((e) => e.label.replace(/^ex\./, ""));

/** A built-in example case (physically consistent; its description states the true answer). */
export function example(name: string): ApiResult<AppState> {
  const ex = EXAMPLES[EXAMPLE_NAMES.indexOf(name)];
  if (!ex) return { ok: false, code: "unknown-example", message: `Unknown example "${name}". Known: ${EXAMPLE_NAMES.join(", ")}.` };
  return { ok: true, value: ex.build(translate) };
}
