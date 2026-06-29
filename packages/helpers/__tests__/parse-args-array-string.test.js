import { describe, expect, it } from "vitest";
import { parseArgsArrayString } from "../src/parse/parse-args-array-string.js";

describe("parseArgsArrayString", () => {
  it("parses quoted tokens with commas inside quotes", () => {
    expect(parseArgsArrayString("a, b, \"c,d\"")).toEqual(["a", "b", "c,d"]);
  });

  it("handles escaped quotes inside quoted tokens", () => {
    expect(parseArgsArrayString('a, "b\\"c"')).toEqual(["a", "b\"c"]);
  });

  it("returns empty array for empty input", () => {
    expect(parseArgsArrayString("")).toEqual([]);
    expect(parseArgsArrayString(null)).toEqual([]);
    expect(parseArgsArrayString(undefined)).toEqual([]);
  });

  it("parses unquoted tokens like parseArgsString", () => {
    expect(parseArgsArrayString("x,y,z")).toEqual(["x", "y", "z"]);
  });
});
