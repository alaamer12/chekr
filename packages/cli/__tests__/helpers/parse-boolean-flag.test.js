import { describe, expect, it } from "vitest";
import { parseBooleanFlag } from "../../src/lib/helpers/parse/parse-boolean-flag.js";

describe("parseBooleanFlag", () => {
  it("coerces common true values", () => {
    expect(parseBooleanFlag("true")).toBe(true);
    expect(parseBooleanFlag("1")).toBe(true);
    expect(parseBooleanFlag("yes")).toBe(true);
    expect(parseBooleanFlag(true)).toBe(true);
  });

  it("coerces common false values", () => {
    expect(parseBooleanFlag("false")).toBe(false);
    expect(parseBooleanFlag("0")).toBe(false);
    expect(parseBooleanFlag("no")).toBe(false);
    expect(parseBooleanFlag("")).toBe(false);
    expect(parseBooleanFlag(undefined)).toBe(false);
    expect(parseBooleanFlag(null)).toBe(false);
    expect(parseBooleanFlag(false)).toBe(false);
  });

  it("returns false for unknown strings", () => {
    expect(parseBooleanFlag("maybe")).toBe(false);
  });
});
