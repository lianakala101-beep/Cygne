import { describe, it, expect } from "vitest";
import { parseCycleLength } from "./cycle.js";

describe("parseCycleLength", () => {
  it("reads back a stored number", () => {
    expect(parseCycleLength(45)).toBe(45);
    expect(parseCycleLength(31)).toBe(31);
  });

  it("reads back a numeric string", () => {
    expect(parseCycleLength("33")).toBe(33);
  });

  it("clamps to the 21–45 slider range", () => {
    expect(parseCycleLength(14)).toBe(21);
    expect(parseCycleLength(60)).toBe(45);
  });

  it("returns null when nothing usable is stored", () => {
    expect(parseCycleLength(undefined)).toBeNull();
    expect(parseCycleLength(null)).toBeNull();
    expect(parseCycleLength("")).toBeNull();
    expect(parseCycleLength("abc")).toBeNull();
    expect(parseCycleLength(0)).toBeNull();
  });
});
