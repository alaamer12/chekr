import { describe, expect, it } from "vitest";
import { parseArgsString } from "../src/parse/parse-args-string.js";

describe("parseArgsString", () => {
  it("parses comma-separated values", () => {
    expect(parseArgsString("a,b,c")).toEqual(["a", "b", "c"]);
  });

  it("trims whitespace around tokens", () => {
    expect(parseArgsString("a, b , c")).toEqual(["a", "b", "c"]);
  });

  it("returns empty array for empty input", () => {
    expect(parseArgsString("")).toEqual([]);
    expect(parseArgsString(null)).toEqual([]);
    expect(parseArgsString(undefined)).toEqual([]);
  });

  it("skips empty tokens from repeated commas", () => {
    expect(parseArgsString("a,,b")).toEqual(["a", "b"]);
  });
});
