/**
 * cli.test.ts — the command line's commands, run through the platform's frame with
 * in-memory I/O (the same logic startCli runs under Deno).
 */
import { describe, it } from "node:test";
import { EXIT, runCli, type CliIo } from "static-web-platform/cli";
import { expect } from "./expect.ts";
import { SPEC } from "../src/cli/commands.ts";

const BUILD = { version: "test", date: "2026-11-10" };

function memory(files: Record<string, string> = {}) {
  const io = {
    stdout: "",
    stderr: "",
    readFile: async (path: string) => path in files
      ? { ok: true as const, bytes: new TextEncoder().encode(files[path]) }
      : { ok: false as const, reason: "not found" },
    readStdin: async () => new Uint8Array(),
    out: async (text: string) => { io.stdout += text; },
    err: async (text: string) => { io.stderr += text; },
    writeFile: async () => ({ ok: false as const, reason: "read-only", exists: false }),
  };
  return io satisfies CliIo;
}

describe("command line", () => {
  it("lists the commands in workflow order", async () => {
    const io = memory();
    expect(await runCli(SPEC, ["--help"], BUILD, io)).toBe(EXIT.ok);
    const order = ["example", "find-time", "find-place", "check-claim"].map((c) => io.stdout.indexOf(`  ${c}`));
    expect(order.every((i, k) => i > 0 && (k === 0 || i > (order[k - 1] ?? 0)))).toBe(true);
  });

  it("example → find-time, as a user would chain them", async () => {
    const a = memory();
    expect(await runCli(SPEC, ["example", "--name", "paris"], BUILD, a)).toBe(EXIT.ok);
    const b = memory({ "case.json": a.stdout });
    expect(await runCli(SPEC, ["find-time", "--format", "text", "case.json"], BUILD, b)).toBe(EXIT.ok);
    expect(b.stdout).toContain("best fit 2025-04-15 09:20:00 UTC (local 2025-04-15 11:20:00 +02:00)");
  });

  it("reports an invalid input with exit code 1 and its code", async () => {
    const io = memory({ "x.json": "{\"v\": 2}" });
    expect(await runCli(SPEC, ["find-place", "x.json"], BUILD, io)).toBe(EXIT.invalidInput);
    expect(io.stderr).toContain("not-a-case");
  });
});
