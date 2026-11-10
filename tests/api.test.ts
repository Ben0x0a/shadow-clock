/**
 * api.test.ts — the operations shared by the page and the command line: case reading,
 * the built-in examples recovering their stated answers, and the message table.
 */
import { readFileSync, readdirSync } from "node:fs";
import { describe, it } from "node:test";
import { expect } from "./expect.ts";
import { checkClaim, example, EXAMPLE_NAMES, findPlace, findTime, formatMessage, readCase } from "../src/api/index.ts";
import { MESSAGES } from "../src/api/messages.ts";

const bytes = (x: unknown) => new TextEncoder().encode(typeof x === "string" ? x : JSON.stringify(x));

function caseOf(name: string) {
  const r = example(name);
  if (!r.ok) throw new Error(r.message);
  return r.value;
}

describe("readCase", () => {
  it("reads a saved case and the inputs of an exported report", () => {
    const s = caseOf("paris");
    const direct = readCase(bytes(s));
    const report = readCase(bytes({ application: { name: "ShadowClock" }, inputs: s, results: null }));
    expect(direct.ok && direct.value).toEqual(s);
    expect(report.ok && report.value).toEqual(s);
  });

  it("rejects input that is not JSON, or not a case", () => {
    const notJson = readCase(bytes("{"));
    const notCase = readCase(bytes({ v: 2 }));
    const badUtf8 = readCase(new Uint8Array([0xff, 0xfe]));
    expect(!notJson.ok && notJson.code).toBe("not-json");
    expect(!notCase.ok && notCase.code).toBe("not-a-case");
    expect(!badUtf8.ok && badUtf8.code).toBe("not-json");
  });
});

describe("operations recover each example's stated answer", () => {
  it("findTime: Paris, 15 Apr 2025 09:20 UTC", () => {
    const r = findTime(caseOf("paris"));
    if (!r.ok) throw new Error(r.message);
    const best = r.value.results.clusters.map((c) => Math.abs(c.bestMs - Date.UTC(2025, 3, 15, 9, 20)));
    expect(Math.min(...best)).toBeLessThan(5 * 60_000);
    expect("probability" in (r.value.results.clusters[0] ?? {})).toBe(false);
  });

  it("checkClaim: Paris EXIF 11:20 fits at UTC+02:00", () => {
    const r = checkClaim(caseOf("paris"));
    if (!r.ok) throw new Error(r.message);
    expect(r.value.results.filter((x) => x.acceptedLevel !== null).map((x) => x.offsetMin)).toContain(120);
  });

  it("findPlace: Athens, 37.98 N 23.73 E inside the best region", () => {
    const r = findPlace(caseOf("athens"));
    if (!r.ok) throw new Error(r.message);
    const [s, w, n, e] = r.value.results.regions[0]?.bounds ?? [0, 0, 0, 0];
    expect(s <= 37.98 && 37.98 <= n && w <= 23.73 && 23.73 <= e).toBe(true);
  });

  it("an invalid case lists every field error, worded", () => {
    const s = caseOf("paris");
    s.site.loc = "nowhere";
    const r = findTime(s);
    expect(!r.ok && r.code).toBe("invalid-case");
    expect(!r.ok && r.message.length > 0 && !r.message.includes("val.")).toBe(true);
  });

  it("an unknown example names the known ones", () => {
    const r = example("mars");
    expect(!r.ok && r.message.includes(EXAMPLE_NAMES.join(", "))).toBe(true);
  });
});

describe("messages", () => {
  it("every message key used by core/ has a text", () => {
    const dir = new URL("../src/core/", import.meta.url);
    const keys = new Set<string>();
    for (const f of readdirSync(dir)) {
      for (const m of readFileSync(new URL(f, dir), "utf8").matchAll(/"((?:core|field|val|budget|shot|ex)\.[A-Za-z.]+)"/g)) keys.add(m[1] as string);
    }
    expect([...keys].filter((k) => !(k in MESSAGES))).toEqual([]);
  });

  it("no key is defined both here and in the page's strings.ts", () => {
    const page = readFileSync(new URL("../src/strings.ts", import.meta.url), "utf8");
    const dup = [...page.matchAll(/^\s+"([\w.]+)":/gm)].map((m) => m[1] as string).filter((k) => k in MESSAGES);
    expect(dup).toEqual([]);
  });

  it("formats nested messages and the shadow prefix", () => {
    const text = formatMessage({ key: "core.err.field", vars: { field: { key: "core.field.ratio" }, reason: { key: "core.err.missing" } }, shot: "Post" });
    expect(text).toBe("Post: Ratio: a value is missing");
  });
});
