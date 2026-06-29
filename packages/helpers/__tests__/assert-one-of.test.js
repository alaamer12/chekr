import { describe, expect, it } from "vitest";
import { assertOneOf } from "../src/assert/assert-one-of.js";

describe("assertOneOf", () => {
  it("passes when value is allowed", () => {
    expect(() => assertOneOf("json", ["default", "json"], "reporter")).not.toThrow();
  });

  it("throws when value is not allowed", () => {
    expect(() => assertOneOf("verbose", ["default", "json"], "reporter")).toThrow(
      "reporter must be one of: default, json",
    );
  });
});
