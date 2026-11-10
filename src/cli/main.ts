/**
 * main.ts — ShadowClock's command line (site.json "cli"), published as shadowclock-cli.js.
 *
 * Defines: nothing of its own; starts the commands and re-exports api/, so the bundle is
 *          also the library.
 * Used by: `deno run --no-config --no-prompt --allow-read shadowclock-cli.js <command> FILE`.
 * Depends on: static-web-platform/cli (startCli: grammar, help, I/O, exit codes),
 *             cli/commands.ts, api/.
 *
 * WHY no network: the build type-checks this layer without fetch or sockets, and Deno
 * runs it without --allow-net.
 */

import { startCli } from "static-web-platform/cli";
import { SPEC } from "./commands.ts";

export * from "../api/index.ts";

startCli(SPEC);
