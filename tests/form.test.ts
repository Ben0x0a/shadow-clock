/**
 * form.test.ts — validation of cases read from outside (share links, tab storage) and
 * the built-in examples.
 */
import { describe, it } from "node:test";
import { expect } from "./expect.ts";
import { EXAMPLES } from "../src/core/examples.ts";
import { defaultState, MAX_SHOTS, parseCase } from "../src/core/form.ts";
import { buildPlaceRequest, buildTimeRequest } from "../src/core/request.ts";

const label = (n: number) => `Shadow ${n}`;
const t = (key: string, vars?: Record<string, string | number>) => `${key}${vars ? JSON.stringify(vars) : ""}`;

describe("parseCase", () => {
  it("round-trips a case", () => {
    const s = defaultState(label(1));
    s.site.loc = "48.85, 2.29";
    s.cons.months[3] = false;
    expect(parseCase(JSON.parse(JSON.stringify(s)), label)).toEqual(s);
  });

  it("rejects anything that is not a v1 case", () => {
    for (const raw of [null, 3, "x", [], {}, { v: 2 }]) expect(parseCase(raw, label)).toBeNull();
  });

  it("keeps only known fields of the right type and allowed values", () => {
    const s = parseCase({ v: 1, mode: "evil", site: { loc: 5, radiusUnit: "mi", extra: "x" }, shots: [{ method: "magic", az: "12", f: { h: 3 } }] }, label);
    expect(s).not.toBeNull();
    if (!s) return;
    expect(s.mode).toBe("time");
    expect(s.site.loc).toBe("");
    expect(s.site.radiusUnit).toBe("m");
    expect("extra" in s.site).toBe(false);
    expect(s.shots[0]?.method).toBe("lengths");
    expect(s.shots[0]?.az).toBe("12");
    expect(s.shots[0]?.f.h).toBe("");
  });

  it("caps the number of shadows", () => {
    const s = parseCase({ v: 1, shots: Array.from({ length: 9 }, () => ({})) }, label);
    expect(s?.shots.length).toBe(MAX_SHOTS);
  });
});

describe("examples", () => {
  it("each example builds a complete, solvable request", () => {
    for (const e of EXAMPLES) {
      const s = e.build(t);
      const built = s.mode === "time" ? buildTimeRequest(s) : buildPlaceRequest(s);
      expect(built.ok).toBe(true);
    }
  });
});
