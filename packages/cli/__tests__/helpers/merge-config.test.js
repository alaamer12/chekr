import { describe, expect, it } from "vitest";
import { mergeConfig } from "../../src/lib/helpers/config/merge-config.js";

describe("mergeConfig", () => {
  it("overrides primitive fields", () => {
    expect(mergeConfig({ bail: true }, { bail: false })).toEqual({
      bail: false,
    });
  });

  it("replaces include/exclude arrays instead of concatenating", () => {
    expect(
      mergeConfig({ include: ["a"], exclude: ["x"] }, { include: ["b"], exclude: ["y"] }),
    ).toEqual({ include: ["b"], exclude: ["y"] });
  });

  it("deep merges nested objects", () => {
    expect(
      mergeConfig({ options: { a: 1, nested: { x: 1 } } }, { options: { b: 2, nested: { y: 2 } } }),
    ).toEqual({ options: { a: 1, b: 2, nested: { x: 1, y: 2 } } });
  });

  it("skips undefined override values", () => {
    expect(mergeConfig({ a: 1 }, { a: undefined, b: 2 })).toEqual({
      a: 1,
      b: 2,
    });
  });
});
