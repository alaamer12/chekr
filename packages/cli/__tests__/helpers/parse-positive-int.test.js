import { describe, expect, it } from "vitest";
import { parsePositiveInt } from "../../src/lib/helpers/parse/parse-positive-int.js";

describe("parsePositiveInt", () => {
  it("parses positive integers", () => {
    expect(parsePositiveInt("4", 1)).toBe(4);
    expect(parsePositiveInt(8, 1)).toBe(8);
  });

  it("returns fallback for invalid values", () => {
    expect(parsePositiveInt("0", 2)).toBe(2);
    expect(parsePositiveInt("-1", 2)).toBe(2);
    expect(parsePositiveInt("abc", 2)).toBe(2);
    expect(parsePositiveInt("", 2)).toBe(2);
    expect(parsePositiveInt(undefined, 2)).toBe(2);
    expect(parsePositiveInt(null, 2)).toBe(2);
  });
});
