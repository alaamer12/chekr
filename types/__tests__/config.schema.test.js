import { describe, expect, it } from "vitest";
import { chekrConfigSchema } from "../schema.zod.js";

describe("chekrConfigSchema (zod)", () => {
  it("accepts a valid config shape", () => {
    const result = chekrConfigSchema.safeParse({
      checksDir: "./.chekr/checks",
      gitignore: ".gitignore",
      scanMode: "full",
      reporter: "json",
      concurrency: 4,
      steps: [{ id: "check_raw_colors", step: 1, enabled: true }],
    });

    expect(result.success).toBe(true);
  });

  it("rejects invalid reporter", () => {
    const result = chekrConfigSchema.safeParse({ reporter: "verbose" });
    expect(result.success).toBe(false);
  });

  it("rejects non-object config", () => {
    expect(chekrConfigSchema.safeParse(null).success).toBe(false);
  });

  it("rejects invalid scanMode", () => {
    expect(chekrConfigSchema.safeParse({ scanMode: "partial" }).success).toBe(
      false,
    );
  });

  it("rejects invalid check id pattern", () => {
    const result = chekrConfigSchema.safeParse({
      steps: [{ id: "raw_colors" }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects camelCase check id", () => {
    const result = chekrConfigSchema.safeParse({
      steps: [{ id: "check_RawColors" }],
    });
    expect(result.success).toBe(false);
  });
});
