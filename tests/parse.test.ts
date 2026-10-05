/**
 * parse.test.ts — parsers for coordinates, map links, timestamps, offsets and durations.
 * Depends on: src/core/parse.ts.
 */
import { describe, it } from "node:test";
import { expect } from "./expect.ts";
import { parseDateTime, parseDuration, parseLocation, parseOffset } from "../src/core/parse.ts";

const close = (r: { lat: number; lon: number } | null, lat: number, lon: number) => {
  expect(r).not.toBeNull();
  expect(r!.lat).toBeCloseTo(lat, 4);
  expect(r!.lon).toBeCloseTo(lon, 4);
};

describe("parseLocation", () => {
  it("decimal pairs", () => {
    close(parseLocation("48.8584, 2.2945"), 48.8584, 2.2945);
    close(parseLocation("-33.8568 151.2153"), -33.8568, 151.2153);
    close(parseLocation("48,8584; 2,2945"), 48.8584, 2.2945);
  });
  it("DMS and hemispheres", () => {
    close(parseLocation(`48°51'30.2"N 2°17'40.2"E`), 48.858389, 2.294500);
    close(parseLocation("N 48 51 30.2 E 2 17 40.2"), 48.858389, 2.2945);
    close(parseLocation("33.8568S, 151.2153E"), -33.8568, 151.2153);
    close(parseLocation("2.2945E 48.8584N"), 48.8584, 2.2945);
    close(parseLocation("40° 26′ 46″ N 79° 58′ 56″ W"), 40.446111, -79.982222);
  });
  it("map URLs", () => {
    close(parseLocation("https://www.google.com/maps/place/X/@48.8583701,2.2944813,17z/data=!3d48.8583701!4d2.2944813"), 48.8583701, 2.2944813);
    close(parseLocation("https://maps.google.com/?q=48.85,2.29"), 48.85, 2.29);
    close(parseLocation("https://www.openstreetmap.org/?mlat=48.8584&mlon=2.2945#map=17/48.8584/2.2945"), 48.8584, 2.2945);
    close(parseLocation("https://www.openstreetmap.org/#map=15/-33.8568/151.2153"), -33.8568, 151.2153);
  });
  it("rejects garbage and out-of-range", () => {
    expect(parseLocation("hello")).toBeNull();
    expect(parseLocation("95, 10")).toBeNull();
  });
});

describe("parseDateTime", () => {
  it("EXIF and ISO", () => {
    expect(parseDateTime("2023:07:14 15:32:10")).toEqual({ wallMs: Date.UTC(2023, 6, 14, 15, 32, 10), offsetMin: null });
    expect(parseDateTime("2023-07-14T15:32:10+02:00")).toEqual({ wallMs: Date.UTC(2023, 6, 14, 15, 32, 10), offsetMin: 120 });
    expect(parseDateTime("2023-07-14 15:32Z")?.offsetMin).toBe(0);
    expect(parseDateTime("2023-02-30 10:00")).toBeNull();
  });
});

describe("parseOffset / parseDuration", () => {
  it("offsets", () => {
    expect(parseOffset("+02:00")).toBe(120);
    expect(parseOffset("UTC-5")).toBe(-300);
    expect(parseOffset("+0530")).toBe(330);
    expect(parseOffset("Z")).toBe(0);
    expect(parseOffset("+15:00")).toBeNull();
  });
  it("durations", () => {
    expect(parseDuration("+01:23:04")).toBe(4984);
    expect(parseDuration("-0:05")).toBe(-300);
    expect(parseDuration("1h 23m 4s")).toBe(4984);
    expect(parseDuration("90 min")).toBe(5400);
    expect(parseDuration("45")).toBe(45);
    expect(parseDuration("2 days")).toBe(172800);
    expect(parseDuration("abc")).toBeNull();
  });
});
