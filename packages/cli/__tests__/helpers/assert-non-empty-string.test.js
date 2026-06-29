import { describe, expect, it } from "vitest";
import { assertNonEmptyString } from "../../src/lib/helpers/assert/assert-non-empty-string.js";

describe("assertNonEmptyString", () => {
  it("passes for non-empty strings", () => {
    expect(() => assertNonEmptyString("ok", "field")).not.toThrow();
  });

  it("throws for invalid values", () => {
    expect(() => assertNonEmptyString("", "field")).toThrow("field must be a non-empty string");
    expect(() => assertNonEmptyString("  ", "field")).toThrow();
    expect(() => assertNonEmptyString(1, "field")).toThrow();
  });
});
