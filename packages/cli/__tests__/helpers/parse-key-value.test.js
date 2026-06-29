import { describe, expect, it } from "vitest";
import { parseKeyValue } from "../../src/lib/helpers/parse/parse-key-value.js";

describe("parseKeyValue", () => {
  it("parses key=value pairs", () => {
    expect(parseKeyValue("key=value")).toEqual({ key: "key", value: "value" });
    expect(parseKeyValue("a=b=c")).toEqual({ key: "a", value: "b=c" });
  });

  it("trims key whitespace", () => {
    expect(parseKeyValue(" key =value")).toEqual({ key: "key", value: "value" });
  });

  it("throws when format is invalid", () => {
    expect(() => parseKeyValue("invalid")).toThrow("key=value");
    expect(() => parseKeyValue("=value")).toThrow("non-empty");
    expect(() => parseKeyValue(123)).toThrow(TypeError);
  });
});
