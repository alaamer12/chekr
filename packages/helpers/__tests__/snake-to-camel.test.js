import { describe, expect, it } from "vitest";
import { snakeToCamel } from "../src/naming/snake-to-camel.js";

describe("snakeToCamel", () => {
  it("converts snake_case to camelCase", () => {
    expect(snakeToCamel("raw_colors")).toBe("rawColors");
    expect(snakeToCamel("check_raw_colors")).toBe("checkRawColors");
  });
});
