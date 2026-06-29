import { describe, expect, it } from "vitest";
import { checkrConfigSchema } from "../schema.zod.js";

describe("checkrConfigSchema (zod)", () => {
  it("accepts a valid config shape", () => {
    const result = checkrConfigSchema.safeParse({
      checksDir: "./.checkr/checks",
      gitignore: ".gitignore",
      scanMode: "full",
      reporter: "json",
      concurrency: 4,
      steps: [{ id: "check_raw_colors", step: 1, enabled: true }],
    });

    expect(result.success).toBe(true);
  });

  it("rejects invalid reporter", () => {
    const result = checkrConfigSchema.safeParse({ reporter: "verbose" });
    expect(result.success).toBe(false);
  });

  it("rejects non-object config", () => {
    expect(checkrConfigSchema.safeParse(null).success).toBe(false);
  });

  it("rejects invalid scanMode", () => {
    expect(checkrConfigSchema.safeParse({ scanMode: "partial" }).success).toBe(
      false,
    );
  });

  it("rejects invalid check id pattern", () => {
    const result = checkrConfigSchema.safeParse({
      steps: [{ id: "raw_colors" }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects camelCase check id", () => {
    const result = checkrConfigSchema.safeParse({
      steps: [{ id: "check_RawColors" }],
    });
    expect(result.success).toBe(false);
  });
});
