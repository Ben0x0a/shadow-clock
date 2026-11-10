/**
 * index.ts — ShadowClock's programmatic API (also the library exported by the CLI bundle).
 *
 * Defines: nothing; re-exports the operations, the case reader, the result shapes and
 *          the message formatter.
 * Used by: cli/main.ts (re-exported as the library).
 * Depends on: api/case.ts, api/operations.ts, api/results.ts, api/messages.ts.
 */

export { type ApiResult, readCase } from "./case.ts";
export { checkClaim, type ClaimValue, example, EXAMPLE_NAMES, findPlace, findTime, type PlaceValue, type TimeValue } from "./operations.ts";
export { type PlaceResults, placeResults, type TimeResults, timeResults } from "./results.ts";
export { formatMessage } from "./messages.ts";
